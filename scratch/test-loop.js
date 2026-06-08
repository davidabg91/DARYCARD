import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, updateDoc } from "firebase/firestore";

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

const clientId = "OLB30OVAO";
const urlUid = "DIFFERENT_UID_TO_TRIGGER_UPDATE"; // trigger the mismatch

console.log("Starting simulation of onSnapshot infinite loop...");
let triggerCount = 0;

const unsubscribe = onSnapshot(doc(db, 'clients', clientId), (docSnap) => {
  if (docSnap.exists()) {
    triggerCount++;
    const clientData = docSnap.data();
    console.log(`[Snapshot #${triggerCount}] nfcUid in DB:`, clientData.nfcUid);
    
    if (urlUid && clientData.nfcUid !== urlUid.toUpperCase()) {
      console.log(`--> nfcUid mismatch! Attempting to update to ${urlUid.toUpperCase()}...`);
      updateDoc(doc(db, 'clients', clientId), { nfcUid: urlUid.toUpperCase() })
        .then(() => {
          console.log("✅ Update succeeded!");
        })
        .catch(err => {
          console.log("❌ Update failed:", err.message);
        });
    } else {
      console.log("--> nfcUid matches URL, no update needed.");
    }
  }
});

// Let it run for 10 seconds, then exit
setTimeout(() => {
  console.log("Stopping simulation.");
  unsubscribe();
  process.exit(0);
}, 10000);
