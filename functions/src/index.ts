import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

/**
 * Triggers when a new push notification document is created in Firestore.
 * Fetches relevant tokens and sends messages via FCM.
 */
export const sendPushNotification = functions.firestore
    .document("push_notifications/{notificationId}")
    .onCreate(async (snapshot) => {
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

            subscribers.forEach((doc) => {
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
