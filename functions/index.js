const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Trigger: When a new call is written to `users/{userId}/incoming_call`
 * Action: Send a High Priority Push Notification to that user.
 * Note: Using Gen 1 functions to avoid Eventarc permission delays.
 */
exports.sendCallNotification = functions.database.ref("users/{userId}/incoming_call")
    .onWrite(async (change, context) => {
        const userId = context.params.userId;
        const data = change.after.val();

        // If data was deleted (call ended/rejected), exit.
        if (!change.after.exists()) {
            console.log(`Call data removed for user ${userId}`);
            return null;
        }

        console.log(`Incoming call for user ${userId}`, data);

        try {
            // 1. Get the Recipient's FCM Token
            const tokenSnapshot = await admin.database().ref(`users/${userId}/fcmToken`).once('value');
            const fcmToken = tokenSnapshot.val();

            if (!fcmToken) {
                console.warn(`No FCM token found for user ${userId}`);
                return null;
            }

            // 2. Construct the Payload
            const payload = {
                token: fcmToken,
                data: {
                    type: 'call',
                    callerId: data.callerId || '',
                    callerName: data.callerName || 'Unknown',
                    callerPhoto: data.callerPhoto || '',
                    roomId: data.roomId || '',
                    autoAnswer: 'true'
                },
                notification: {
                    title: 'Incoming Video Call',
                    body: `${data.callerName} is calling you...`
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'call_channel',
                        priority: 'max',
                        visibility: 'public',
                        sound: 'default'
                    }
                },
                apns: {
                    headers: {
                        "apns-priority": "10",
                        "apns-push-type": "voip"
                    },
                    payload: {
                        aps: {
                            alert: {
                                title: 'Incoming Video Call',
                                body: `${data.callerName} is calling...`
                            },
                            sound: 'default'
                        }
                    }
                }
            };

            await admin.messaging().send(payload);
            console.log(`Call notification sent to ${userId}`);
            return null;

        } catch (error) {
            console.error("Error sending call notification:", error);
            return null;
        }
    });

/**
 * Trigger: When a new message is written to `messages/{chatId}/{messageId}`
 * Action: Send a Notification to the recipient.
 */
exports.sendMessageNotification = functions.database.ref("messages/{chatId}/{messageId}")
    .onWrite(async (change, context) => {
        const chatId = context.params.chatId;
        const messageData = change.after.val();

        // If message deleted, exit
        if (!change.after.exists()) {
            return null;
        }

        const senderId = messageData.senderId;
        const text = messageData.text;

        // Parse chatId (uid1_uid2) to find recipient
        const uids = chatId.split('_');
        const recipientId = uids.find(uid => uid !== senderId);

        if (!recipientId) {
            console.warn(`Could not determine recipient for chat ${chatId}`);
            return null;
        }

        try {
            // 1. Get Recipient Token
            const tokenSnapshot = await admin.database().ref(`users/${recipientId}/fcmToken`).once('value');
            const fcmToken = tokenSnapshot.val();

            if (!fcmToken) {
                // console.log(`No token for user ${recipientId}`);
                return null;
            }

            // 2. Get Sender Name (Optional, for better notification)
            const senderSnapshot = await admin.database().ref(`users/${senderId}/displayName`).once('value');
            const senderName = senderSnapshot.val() || "New Message";

            // 3. Payload
            const payload = {
                token: fcmToken,
                data: {
                    type: 'message',
                    senderId: senderId,
                    chatId: chatId,
                    text: text || 'Photo'
                },
                notification: {
                    title: senderName,
                    body: text || 'Sent a photo'
                },
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'message_channel',
                        priority: 'default',
                        visibility: 'public',
                        sound: 'default'
                    }
                }
            };

            await admin.messaging().send(payload);
            console.log(`Message notification sent to ${recipientId}`);
            return null;

        } catch (error) {
            console.error("Error sending message notification:", error);
            return null;
        }
    });
