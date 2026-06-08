const admin = require('firebase-admin');

// Initialize Firebase Admin with the project ID
admin.initializeApp({
  projectId: "darycard-6e8e7"
});

const db = admin.firestore();

console.log("Querying scans collection group (latest 50)...");
db.collectionGroup('scans')
  .orderBy('at', 'desc')
  .limit(50)
  .get()
  .then(snap => {
    console.log(`Successfully retrieved ${snap.size} scans.`);
    snap.forEach(doc => {
      console.log(`${doc.ref.path} =>`, doc.data());
    });
    process.exit(0);
  })
  .catch(err => {
    console.error("Failed to query scans:", err);
    process.exit(1);
  });
