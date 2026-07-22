const admin = require('firebase-admin');
admin.initializeApp({ projectId: "darycard-6e8e7" });
const db = admin.firestore();

const needle = (process.argv[2] || '').toLowerCase();

db.collection('clients').get().then(snap => {
  snap.forEach(doc => {
    const d = doc.data();
    if ((d.name || '').toLowerCase().includes(needle)) {
      console.log(`${doc.id} | ${d.name} | cardType=${d.cardType} | municipality=${d.municipality} | route=${d.route}`);
    }
  });
  process.exit(0);
});
