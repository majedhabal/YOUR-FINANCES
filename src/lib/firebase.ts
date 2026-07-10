import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentSingleTabManager 
} from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Configure Firestore with elegant, offline-first persistent local cache.
// This buffers writes and handles reads completely locally.
// We use persistentSingleTabManager to avoid Web Lock or postMessage errors
// that occur within sandboxed iframes.
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentSingleTabManager({})
    })
  },
  (firebaseConfig as any).firestoreDatabaseId
);

export const auth = getAuth(app);
export const messaging = getMessaging(app);

// Explicitly set browser-based local persistence for Firebase Auth
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Explicit Firebase Auth persistence configuration failed:", err);
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

