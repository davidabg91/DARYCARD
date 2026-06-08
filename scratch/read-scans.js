import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, getDocs } from "firebase/firestore";

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

console.log("Reading scans subcollection of client:", clientId);
getDocs(collection(clientRef, 'scans'))
  .then(snap => {
    console.log(`Successfully read scans! Count: ${snap.size}`);
    snap.forEach(d => {
      console.log(d.id, "=>", d.data());
    });
  })
  .catch(err => {
    console.error("Error reading scans:", err);
  });
