// Прави лекия списък на клиентите (clients_index) наново от clients.
//
//   node functions/rebuild-client-index.cjs --dry-run   само мери, нищо не пише
//   node functions/rebuild-client-index.cjs             пише
//
// Ползва същия код като функцията (functions/lib/clientIndex.js), затова преди
// това: `npm --prefix functions run build`. Влиза с кешнатия вход на
// firebase-tools — на тази машина няма service account.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Firestore } = require('@google-cloud/firestore');
const { rebuildClientIndex, projectClient } = require('./lib/clientIndex.js');

const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
// Admin SDK отказва Firestore с вход на потребител, затова клиентът се прави направо.
const db = new Firestore({
    projectId: 'darycard-6e8e7',
    credentials: {
        type: 'authorized_user',
        client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
        client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
        refresh_token: cfg.tokens.refresh_token,
    },
});

const dryRun = process.argv.includes('--dry-run');
const mb = b => (b / 1048576).toFixed(2) + ' MB';

(async () => {
    if (dryRun) {
        // Колко тежи списъкът спрямо пълната колекция, и кои полета остават.
        const snap = await db.collection('clients').get();
        let full = 0, light = 0;
        const fields = {};
        snap.docs.forEach(d => {
            full += Buffer.byteLength(JSON.stringify(d.data()));
            const p = projectClient(d.data());
            light += Buffer.byteLength(JSON.stringify(p));
            for (const [k, v] of Object.entries(p)) fields[k] = (fields[k] || 0) + Buffer.byteLength(JSON.stringify(v));
        });
        console.log('клиенти:', snap.size, '| пълни:', mb(full), '| лек списък:', mb(light));
        console.log('полета в списъка по тежест:');
        Object.entries(fields).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ', k.padEnd(22), mb(v)));
    }
    const res = await rebuildClientIndex(db, { dryRun });
    console.log(dryRun ? 'ПРОБА (нищо не е записано):' : 'ЗАПИСАНО:', res);
    process.exit(0);
})().catch(err => { console.error('ГРЕШКА', err); process.exit(1); });
