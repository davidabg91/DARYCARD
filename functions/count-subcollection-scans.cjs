const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "darycard-6e8e7"
});
const db = admin.firestore();

const ids = ["OLB30OVAO", "LIKH9411J", "6PALI44O7"];
Promise.all(ids.map(async id => {
  const snap = await db.collection('clients').doc(id).collection('scans').get();
  return { id, size: snap.size };
})).then(results => {
  results.forEach(r => {
    console.log(`Client ${r.id} scans subcollection size: ${r.size}`);
  });
  process.exit(0);
});
