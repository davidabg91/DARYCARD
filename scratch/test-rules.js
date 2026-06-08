import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, setDoc, updateDoc, increment } from "firebase/firestore";

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

const clientId = "OLB30OVAO"; // from cards.txt
const clientRef = doc(db, 'clients', clientId);
const scanRef = doc(collection(clientRef, 'scans'));

const isoNow = new Date().toISOString();

console.log("Testing anonymous write to scans subcollection...");
setDoc(scanRef, { at: isoNow, route: "Test Route" })
  .then(() => console.log("✅ Scan record created successfully!"))
  .catch(err => console.error("❌ Scan record failed:", err));

console.log("Testing anonymous update to client document...");
updateDoc(clientRef, { scanCount: increment(1), lastScanAt: isoNow })
  .then(() => console.log("✅ Client counter updated successfully!"))
  .catch(err => console.error("❌ Client counter update failed:", err));
