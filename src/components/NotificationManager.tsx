import { useEffect } from 'react';
import { messaging } from '../lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';

export const NotificationManager = () => {
  useEffect(() => {
    const requestPermission = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const token = await getToken(messaging, {
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY // You need to set this in your .env
          });
          console.log('FCM Token:', token);
          // Send this token to your server
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    };

    requestPermission();

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Message received in foreground: ', payload);
      // Handle foreground notification
      if (payload.notification) {
          new Notification(payload.notification.title!, {
              body: payload.notification.body,
              icon: '/logo.png'
          });
      }
    });

    return () => unsubscribe();
  }, []);

  return null;
};
