import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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

console.log("Reading client document:", clientId);
getDoc(doc(db, 'clients', clientId))
  .then(snap => {
    if (snap.exists()) {
      const data = snap.data();
      const keys = Object.keys(data);
      console.log("Client Keys:", keys);
      console.log("Client Name:", data.name);
      console.log("Client Route:", data.route);
      console.log("Client ScanCount:", data.scanCount);
      console.log("Client LastScanAt:", data.lastScanAt);
    } else {
      console.log("Client does not exist!");
    }
  })
  .catch(err => {
    console.error("Error reading client:", err);
  });
