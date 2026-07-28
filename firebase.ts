import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence } from 'firebase/auth';
import { 
  initializeFirestore, 
  memoryLocalCache
} from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Configure Firestore with memory cache to avoid IndexedDB corruption issues.
export const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache()
  },
  (firebaseConfig as any).firestoreDatabaseId
);

export const auth = getAuth(app);
export const messaging = getMessaging(app);

// Explicitly set browser-based local persistence for Firebase Auth
// We try browserLocalPersistence, then indexedDBLocalPersistence. If all fail, we default to inMemoryPersistence
// to avoid auth errors in restricted environments.
setPersistence(auth, browserLocalPersistence)
  .catch((err) => {
    console.warn("browserLocalPersistence failed, reason:", err.message, "trying indexedDBLocalPersistence");
    return setPersistence(auth, indexedDBLocalPersistence);
  })
  .catch((err) => {
    console.warn("indexedDBLocalPersistence failed, reason:", err.message, "falling back to inMemoryPersistence");
    return setPersistence(auth, inMemoryPersistence);
  })
  .catch((err) => {
    console.error("All persistence methods failed, reason:", err.message);
  });

let googleProvider: GoogleAuthProvider | null = null;
export const getGoogleProvider = () => {
  if (!googleProvider) {
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope('https://www.googleapis.com/auth/calendar');
    googleProvider.addScope('https://www.googleapis.com/auth/tasks');
  }
  return googleProvider;
};

