import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { initializeFirestore } from 'firebase/firestore';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyB0F2U11RI7NcBs0ghhu5J642HcGNP5T18",
  authDomain: "darycard-6e8e7.firebaseapp.com",
  projectId: "darycard-6e8e7",
  storageBucket: "darycard-6e8e7.firebasestorage.app",
  messagingSenderId: "949719547537",
  appId: "1:949719547537:web:5ae189666873df89dc8930",
  measurementId: "G-RZ7JWCDJ0W"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {});
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Safe Messaging Initialization - exporting a Promise to avoid top-level await issues
// and ensure we check for browser support before calling getMessaging
let messagingInstance: Messaging | null = null;
export const getSafeMessaging = async (): Promise<Messaging | null> => {
    if (messagingInstance) return messagingInstance;
    if (typeof window !== 'undefined' && await isSupported()) {
        messagingInstance = getMessaging(app);
        return messagingInstance;
    }
    return null;
};

export default app;
