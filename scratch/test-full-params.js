import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";

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

const clientId = "OLB30OVAO"; // test client id
const urlUid = "040C5A02B16B80"; // some test uid

async function runSimulation() {
  console.log("1. Simulating initial page fetch...");
  const clientRef = doc(db, 'clients', clientId);
  const snap = await getDoc(clientRef);
  if (!snap.exists()) {
    console.error("Client does not exist!");
    return;
  }
  
  const clientData = snap.data();
  console.log("Client fetched successfully. Current nfcUid in DB:", clientData.nfcUid);
  
  // 2. Simulate UID update if it differs
  if (urlUid && clientData.nfcUid !== urlUid.toUpperCase()) {
    console.log("2. Attempting to update nfcUid anonymously (should be rejected)...");
    try {
      await updateDoc(clientRef, { nfcUid: urlUid.toUpperCase() });
      console.log("✅ nfcUid updated successfully! (Unexpected for anonymous)");
    } catch (err) {
      console.log("❌ nfcUid update failed as expected:", err.message);
    }
  } else {
    console.log("2. nfcUid already matches, skipping UID update");
  }

  // 3. Simulate scan logging
  console.log("3. Attempting to log scan and update counters...");
  const isoNow = new Date().toISOString();
  
  try {
    await setDoc(doc(collection(clientRef, 'scans')), { at: isoNow, route: clientData.route ?? '' });
    console.log("✅ Scan record created successfully!");
  } catch (err) {
    console.error("❌ Scan record failed:", err.message);
  }

  try {
    await updateDoc(clientRef, { scanCount: increment(1), lastScanAt: isoNow });
    console.log("✅ Client counter updated successfully!");
  } catch (err) {
    console.error("❌ Client counter update failed:", err.message);
  }
}

runSimulation();
