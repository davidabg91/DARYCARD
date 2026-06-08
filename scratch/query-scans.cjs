const admin = require('firebase-admin');

// Initialize Firebase Admin with the project ID.
// It will automatically use the Google Application Default Credentials (ADC)
// from the environment once you run 'gcloud auth application-default login'.
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
