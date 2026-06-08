import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, writeBatch, increment } from "firebase/firestore";

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
const clientRef = doc(db, 'clients', clientId);
const isoNow = new Date().toISOString();

async function testBatch() {
  console.log("Testing anonymous writeBatch...");
  const batch = writeBatch(db);
  batch.update(clientRef, {
    scanCount: increment(1),
    lastScanAt: isoNow
  });
  batch.set(doc(collection(clientRef, 'scans')), {
    at: isoNow,
    route: "Test Route"
  });

  try {
    await batch.commit();
    console.log("✅ Batch committed successfully!");
  } catch (err) {
    console.error("❌ Batch failed:", err.message);
  }
}

testBatch();
