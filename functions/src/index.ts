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
