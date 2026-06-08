const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "darycard-6e8e7"
});
const db = admin.firestore();

db.collection('users').get().then(snap => {
  console.log(`Found ${snap.size} users:`);
  snap.forEach(doc => {
    console.log(`- UID: ${doc.id}`);
    console.log(`  Data:`, doc.data());
  });
  process.exit(0);
});
