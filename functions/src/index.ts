import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

/**
 * Creates a new staff user (auth account + Firestore profile) on behalf of an
 * admin. Done in a Cloud Function with the Admin SDK so that:
 *   1. The calling admin is NOT signed out (the client SDK's
 *      createUserWithEmailAndPassword would switch the active session).
 *   2. Firestore rules can keep `users` writes admin-only — only this function,
 *      running with elevated privileges, can create the profile document.
 */
export const createStaffUser = functions.https.onCall(async (data, context) => {
    const callerUid = context.auth?.uid;
    if (!callerUid) {
        throw new functions.https.HttpsError(
            "unauthenticated", "Трябва да сте влезли в системата."
        );
    }

    const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
    if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
        throw new functions.https.HttpsError(
            "permission-denied",
            "Само администратори могат да добавят персонал."
        );
    }

    const email = String(data?.email || "").trim();
    const password = String(data?.password || "");
    const role = data?.role === "admin" ? "admin" : "moderator";

    if (!email || password.length < 6) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Невалиден имейл или парола (минимум 6 знака)."
        );
    }

    const userRecord = await admin.auth().createUser({ email, password });
    await admin.firestore().doc(`users/${userRecord.uid}`).set({
        username: email,
        role,
        createdAt: new Date().toISOString(),
    });

    return { uid: userRecord.uid };
});

// ===========================================================================
// Failed-login monitoring: the login page reports failed attempts here. We
// enrich with the caller's IP + geolocation, log every attempt, and push an
// alert to admin devices only when attempts repeat from the same IP (so a
// single mistyped password doesn't notify anyone). Callable WITHOUT auth,
// because the user is not signed in when a login fails.
// ===========================================================================
interface GeoInfo {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    isp?: string;
    lat?: number;
    lon?: number;
    timezone?: string;
}

interface IpWhoResponse {
    success?: boolean;
    city?: string;
    region?: string;
    country?: string;
    country_code?: string;
    latitude?: number;
    longitude?: number;
    connection?: { isp?: string; org?: string };
    timezone?: { id?: string };
}

const ALERT_THRESHOLD = 3;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export const reportFailedLogin = functions.https.onCall(async (data, context) => {
    const req = context.rawRequest;
    const xff = (req.headers["x-forwarded-for"] as string) || "";
    const ip = (xff.split(",")[0] || req.ip || "unknown").trim();
    const email = String(data?.email || "").slice(0, 200);
    const errorCode = String(data?.errorCode || "unknown").slice(0, 100);
    const ua = String(data?.ua || req.headers["user-agent"] || "").slice(0, 500);

    // Best-effort geolocation from the IP (free, no key). Never blocks the flow.
    const geo: GeoInfo = {};
    try {
        const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
        if (r.ok) {
            const g = (await r.json()) as IpWhoResponse;
            if (g && g.success !== false) {
                geo.city = g.city;
                geo.region = g.region;
                geo.country = g.country;
                geo.countryCode = g.country_code;
                geo.isp = g.connection?.isp || g.connection?.org;
                geo.lat = g.latitude;
                geo.lon = g.longitude;
                geo.timezone = g.timezone?.id;
            }
        }
    } catch (err) {
        console.warn("Geo lookup failed:", err);
    }

    const now = Date.now();
    const db = admin.firestore();
    const ipKey = (ip.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 200)) || "unknown";
    const counterRef = db.collection("login_attempt_counters").doc(ipKey);

    let shouldAlert = false;
    let windowCount = 0;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const d = snap.exists ? snap.data() || {} : {};
        let count = (d.count as number) || 0;
        let windowStart = (d.windowStart as number) || 0;
        let lastAlertAt = (d.lastAlertAt as number) || 0;

        if (now - windowStart > WINDOW_MS) {
            count = 0;
            windowStart = now;
        }
        count += 1;
        windowCount = count;

        if (count >= ALERT_THRESHOLD && now - lastAlertAt > WINDOW_MS) {
            shouldAlert = true;
            lastAlertAt = now;
        }

        tx.set(counterRef, {
            count,
            windowStart,
            lastAlertAt,
            ip,
            lastEmail: email,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
    });

    // Log the attempt (cap per window to avoid flooding the collection during a burst).
    if (windowCount <= 50) {
        await db.collection("login_attempts").add({
            timestamp: new Date().toISOString(),
            email,
            errorCode,
            ip,
            ua,
            attemptInWindow: windowCount,
            ...geo,
        });
    }

    if (shouldAlert) {
        const tokensSnap = await db.collection("admin_push_tokens").get();
        const tokens: string[] = [];
        tokensSnap.forEach((t) => {
            const tok = t.data().token;
            if (tok) tokens.push(tok);
        });

        if (tokens.length > 0) {
            const loc = [geo.city, geo.country].filter(Boolean).join(", ") || "неизвестно местоположение";
            const response = await admin.messaging().sendEachForMulticast({
                notification: {
                    title: "⚠️ Опит за неоторизиран вход",
                    body: `${windowCount} неуспешни опита от ${loc} (IP ${ip}). Имейл: ${email || "—"}`,
                },
                tokens,
            });

            // Remove tokens that are no longer valid.
            response.responses.forEach((res, i) => {
                if (!res.success) {
                    const code = res.error?.code;
                    if (code === "messaging/registration-token-not-registered" ||
                        code === "messaging/invalid-registration-token") {
                        tokensSnap.docs[i].ref.delete().catch(() => { /* ignore cleanup errors */ });
                    }
                }
            });
        }
    }

    return { ok: true, windowCount, alerted: shouldAlert };
});

/**
 * Triggers when a new push notification document is created in Firestore.
 * Fetches relevant tokens and sends messages via FCM.
 */
export const sendPushNotification = functions.firestore
    .document("push_notifications/{notificationId}")
    .onCreate(async (snapshot: admin.firestore.QueryDocumentSnapshot) => {
        const data = snapshot.data();
        if (!data) return;

        const { title, body, courseId } = data;

        try {
            // Find subscribers based on courseId
            let query: admin.firestore.Query;
            if (courseId === "all") {
                query = admin.firestore().collection("push_subscriptions");
            } else {
                query = admin.firestore()
                    .collection("push_subscriptions")
                    .where("courseId", "==", courseId);
            }

            const subscribers = await query.get();
            const tokens: string[] = [];

            subscribers.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
                const token = doc.data().token;
                if (token && !tokens.includes(token)) {
                    tokens.push(token);
                }
            });

            if (tokens.length === 0) {
                console.log("No subscribers found for sending.");
                return;
            }

            // Messages are sent via multicast in batches of 500
            const batchSize = 500;
            for (let i = 0; i < tokens.length; i += batchSize) {
                const batchTokens = tokens.slice(i, i + batchSize);
                const message = {
                    notification: {
                        title: title,
                        body: body,
                        image: 'https://darycommerce.com/pwa-icon.png' // Big image if supported
                    },
                    webpush: {
                        notification: {
                            title: title,
                            body: body,
                            icon: 'https://darycommerce.com/pwa-icon.png',
                            badge: 'https://darycommerce.com/favicon.png',
                            image: 'https://darycommerce.com/pwa-icon.png'
                        },
                        fcmOptions: {
                            link: 'https://darycommerce.com/'
                        }
                    },
                    android: {
                        notification: {
                            icon: 'stock_white_24dp',
                            color: '#ff5252',
                            image: 'https://darycommerce.com/pwa-icon.png'
                        }
                    },
                    tokens: batchTokens,
                };

                const response = await admin.messaging().sendEachForMulticast(message);
                console.log(`Successfully sent ${response.successCount} notifications in batch ${i / batchSize + 1}`);
                
                // Track failure count if any
                if (response.failureCount > 0) {
                    console.log(`Failed notifications in batch: ${response.failureCount}`);
                    // Optionally: scan for expired tokens (error === 'messaging/registration-token-not-registered') 
                    // and remove them fromFirestore.
                }
            }
        } catch (error) {
            console.error("Error broadcasting push notification:", error);
        }
    });
