const admin = require('firebase-admin');
admin.initializeApp({ projectId: "darycard-6e8e7" });
const db = admin.firestore();

const nowMonth = new Date().toISOString().slice(0, 7); // e.g. 2026-07

db.collection('clients').get().then(snap => {
  let total = 0, withRH = 0, entries = 0, withMonth = 0, withMethod = 0, curMonthEntries = 0;
  const methodCounts = {};
  const monthCounts = {};
  const samples = [];
  snap.forEach(d => {
    total++;
    const rh = d.data().renewalHistory || [];
    if (rh.length) withRH++;
    rh.forEach(e => {
      entries++;
      if (e.month) { withMonth++; monthCounts[e.month] = (monthCounts[e.month]||0)+1; }
      if (e.paymentMethod) withMethod++;
      const m = e.paymentMethod || '(none)';
      methodCounts[m] = (methodCounts[m]||0)+1;
      if (e.month === nowMonth) curMonthEntries++;
    });
    if (samples.length < 5 && rh.length) samples.push({ name: d.data().name, last: rh.slice(-2) });
  });
  console.log('nowMonth:', nowMonth);
  console.log({ total, withRH, entries, withMonth, withMethod, curMonthEntries });
  console.log('methodCounts:', JSON.stringify(methodCounts, null, 2));
  const recentMonths = Object.keys(monthCounts).sort().slice(-8);
  console.log('recent month buckets:', recentMonths.map(m => `${m}:${monthCounts[m]}`).join('  '));
  console.log('samples:', JSON.stringify(samples, null, 2));
  process.exit(0);
});
