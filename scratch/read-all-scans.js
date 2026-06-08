import { initializeApp } from "firebase/app";
import { getFirestore, collectionGroup, getDocs, query, orderBy, limit } from "firebase/firestore";

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
const db = getFirestore(app);

// Note: To run this client-side query as a staff user without authentication in node, 
// we would get permission denied. However, we can use the admin SDK or we can run 
// a node script using firebase-admin with Application Default Credentials (ADC).
// Let's create an admin-version in query-scans.cjs that uses firebase-admin.
