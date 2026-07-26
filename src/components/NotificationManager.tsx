import { useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { messaging } from '../lib/firebase';

export const NotificationManager = ({ uid }: { uid: string }) => {
  useEffect(() => {
    if (!uid) return;

    const requestPermission = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          console.log('Notification permission granted.');
          try {
            const token = await getToken(messaging);
            if (token) {
              await updateDoc(doc(db, `users/${uid}`), {
                fcmTokens: arrayUnion(token)
              });
              console.log('FCM token stored.');
            }
          } catch (tokenErr) {
            console.error('Error getting FCM token:', tokenErr);
          }
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    };

    requestPermission();

    const notificationsRef = collection(db, `users/${uid}/notifications`);
    const q = query(notificationsRef, where('isRead', '==', false));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (Notification.permission === 'granted') {
            new Notification(data.title || 'New Notification', {
              body: data.body,
              icon: '/icons/Your_Finances_Logo.png'
            });
            // Mark as read
            updateDoc(doc(db, `users/${uid}/notifications`, change.doc.id), { isRead: true });
          }
        }
      });
    });

    return () => unsubscribe();
  }, [uid]);

  return null;
};
