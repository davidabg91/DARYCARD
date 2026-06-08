const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "darycard-6e8e7"
});
const db = admin.firestore();

const ids = ["OLB30OVAO", "LIKH9411J", "6PALI44O7"];
Promise.all(ids.map(id => db.collection('clients').doc(id).get()))
  .then(snaps => {
    snaps.forEach(snap => {
      if (snap.exists) {
        console.log(`Client ${snap.id}:`);
        console.log(`  Name: ${snap.data().name}`);
        console.log(`  ScanCount: ${snap.data().scanCount}`);
        console.log(`  LastScanAt: ${snap.data().lastScanAt}`);
      } else {
        console.log(`Client ${snap.id} not found!`);
      }
    });
    process.exit(0);
  });
