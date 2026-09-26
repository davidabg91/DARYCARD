import { initializeApp } from "firebase/app";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
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
// Изрична персистентност вместо подразбирането на getAuth: сесията се пази в
// IndexedDB (localStorage като резерва). Така, ако IndexedDB е недостъпна, пада
// към нещо трайно, вместо тихо към памет-само — при което всяко отваряне на
// приложението щеше да иска вход отново.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
});

import { persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
// Enabling persistence for INSTANT sub-second loading on myPOS terminals
// Using multipleTabManager to avoid lock contention during reloads/updates
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
// Analytics се вдига след първоначалното рисуване: при зареждане на модула то
// тегли още SDK и прави заявка, точно докато приложението се опитва да покаже
// профила на картата. Никой не ползва износа освен самото инициализиране.
if (typeof window !== 'undefined') {
  const startAnalytics = () => { try { getAnalytics(app); } catch { /* блокиран или неподдържан */ } };
  if ('requestIdleCallback' in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
      .requestIdleCallback(startAnalytics, { timeout: 5000 });
  } else {
    setTimeout(startAnalytics, 3000);
  }
}
export const storage = getStorage(app);

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
