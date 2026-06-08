import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, getDocs, orderBy, query } from "firebase/firestore";

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

const clientId = "OLB30OVAO"; // client ID
const clientRef = doc(db, 'clients', clientId);
const scansRef = collection(clientRef, 'scans');
const q = query(scansRef, orderBy('at', 'desc'));

console.log(`Fetching scans for client ${clientId}...`);
getDocs(q)
  .then(snap => {
    console.log(`Found ${snap.size} scan documents:`);
    snap.forEach(doc => {
      console.log(`- Scan ID: ${doc.id}`);
      console.log(`  At: ${doc.data().at}`);
      console.log(`  Route: ${doc.data().route}`);
    });
    process.exit(0);
  })
  .catch(err => {
    console.error("Error reading scans:", err);
    process.exit(1);
  });
