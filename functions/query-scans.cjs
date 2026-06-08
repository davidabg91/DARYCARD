const admin = require('firebase-admin');

admin.initializeApp({
  projectId: "darycard-6e8e7"
});

const db = admin.firestore();

console.log("Reading latest 50 scans from the database...");
db.collectionGroup('scans')
  .orderBy('at', 'desc')
  .limit(50)
  .get()
  .then(snap => {
    console.log(`\nFound ${snap.size} scans:`);
    snap.forEach(doc => {
      console.log(`- Path: ${doc.ref.path}`);
      console.log(`  At: ${doc.data().at}`);
      console.log(`  Route: ${doc.data().route}`);
    });
    process.exit(0);
  })
  .catch(err => {
    console.error("Error querying scans:", err);
    process.exit(1);
  });
