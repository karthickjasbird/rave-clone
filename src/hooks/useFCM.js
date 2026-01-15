import { useEffect } from 'react';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { database } from '../firebase';
import { ref, update } from 'firebase/database';

export const useFCM = (user) => {
    useEffect(() => {
        if (!user) return;

        const setupFCM = async () => {
            try {
                // 1. Request Permission
                console.log('🔔 Requesting Notification Permissions...');
                const result = await FirebaseMessaging.requestPermissions();

                if (result.receive === 'granted') {
                    console.log('✅ Notification permission granted');

                    // 2. Register (Get Token)
                    const { token } = await FirebaseMessaging.getToken();
                    console.log('📦 FCM Token:', token);

                    // 3. Save to DB
                    if (token) {
                        const updates = {};
                        updates[`users/${user.uid}/fcmToken`] = token;
                        updates[`users/${user.uid}/lastSeen`] = Date.now();
                        await update(ref(database), updates);
                    }
                } else {
                    console.log('🔕 Notification permission denied');
                }

                // 4. Listeners
                await FirebaseMessaging.removeAllListeners();

                FirebaseMessaging.addListener('notificationReceived', (event) => {
                    console.log('🔔 Foreground Notification:', event);
                    // We could trigger a local toast here if we wanted
                });

                FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
                    console.log('👉 Notification Tapped:', event);
                    const data = event.notification.data;

                    if (data?.type === 'call' && data.callerId) {
                        console.log("🚀 Answering Call from:", data.callerId);
                        // Navigate to Chat with Auto-Answer
                        // Note: We can't use useNavigate hook inside a non-component function here easily 
                        // unless useFCM returns an object or provided via context.
                        // But useFCM IS a hook, so we can use window.location or a callback if passed.
                        // Best practice: Use window.location hash for now as seen in original code, 
                        // OR assume App.jsx handles deep links if we redirect.
                        window.location.hash = `/chat/${data.callerId}`;
                        // To pass state (autoAnswer), using hash is tricky. 
                        // We might need to store "pendingAnswer" in localStorage or similar?
                        // Or use a global state store.
                        // For now, let's just open the chat. The user will see the overlay inside anyway if the node exists.
                        // Wait, if node exists, Global Overlay appears.
                        // If Global Overlay appears, user clicks Accept.
                        // So we just need to bring App to Foreground. which this does.
                    }
                    else if (data?.type === 'message' && data.senderId) {
                        console.log("📩 Opening Chat with:", data.senderId);
                        window.location.hash = `/chat/${data.senderId}`;
                    }
                    else if (data?.roomId) {
                        // Legacy/Generic Room
                        window.location.hash = `/room/${data.roomId}`;
                    }
                });

            } catch (error) {
                console.error('❌ FCM Setup Error:', error);
            }
        };

        setupFCM();

    }, [user]);
};
