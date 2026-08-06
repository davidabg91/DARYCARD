const admin = require('firebase-admin');
admin.initializeApp({ projectId: "darycard-6e8e7" });
const db = admin.firestore();

const [id, school] = process.argv.slice(2);

const ref = db.collection('clients').doc(id);
ref.get()
  .then(snap => {
    if (!snap.exists) throw new Error(`Client ${id} not found`);
    console.log(`before: ${snap.data().name} | school="${snap.data().school}"`);
    return ref.update({ school });
  })
  .then(() => ref.get())
  .then(snap => {
    console.log(`after:  ${snap.data().name} | school="${snap.data().school}"`);
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
