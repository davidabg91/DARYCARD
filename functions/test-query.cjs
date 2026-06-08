const admin = require('firebase-admin');
admin.initializeApp({
  projectId: "darycard-6e8e7"
});
const db = admin.firestore();
const windowStart = '2026-03-31';
db.collectionGroup('scans')
  .where('at', '>=', windowStart)
  .get()
  .then(snap => {
    console.log("Count with windowStart >= '2026-03-31':", snap.size);
    const scans = [];
    snap.forEach(doc => {
      scans.push({ at: doc.data().at, route: doc.data().route });
    });
    scans.sort((a,b) => b.at.localeCompare(a.at));
    console.log("Latest 15 scans in DB matching query:");
    scans.slice(0, 15).forEach((s, idx) => {
      console.log(`[${idx+1}] ${s.at} | ${s.route}`);
    });
    process.exit(0);
  });
