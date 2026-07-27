const admin = require('firebase-admin');
admin.initializeApp({ projectId: "darycard-6e8e7" });
const db = admin.firestore();

db.collection('clients').get().then(snap => {
  const counts = {};
  snap.forEach(d => {
    const routes = new Set();
    if (d.data().route) routes.add(d.data().route);
    (d.data().renewalHistory || []).forEach(r => r.route && routes.add(r.route));
    routes.forEach(r => {
      if (r.includes('Тръстеник') || r.includes('Славовица') || r.includes('Горна Митрополия') || r.includes('Г.М') || r.includes('Д.Митрополия')) {
        counts[r] = (counts[r] || 0) + 1;
      }
    });
  });
  console.log(JSON.stringify(counts, null, 2));
  process.exit(0);
});
