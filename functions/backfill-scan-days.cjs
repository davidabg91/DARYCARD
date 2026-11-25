// Попълва дневното обобщение на сканиранията (scan_days, scan_day_totals) от
// самите сканирания за последните дни.
//
//   node functions/backfill-scan-days.cjs --dry-run     само брои, нищо не пише
//   node functions/backfill-scan-days.cjs               пише (16 дни назад)
//   node functions/backfill-scan-days.cjs --days 30     по-дълъг прозорец
//
// Ползва същия код като функцията (functions/lib/scanDays.js), затова преди
// това: `npm --prefix functions run build`. Само добавя и поправя записи, през
// същата транзакция като функцията — може да върви, докато автобусите сканират.
// Влиза с кешнатия вход на firebase-tools — на тази машина няма service account.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Firestore } = require('@google-cloud/firestore');
const { backfillScanDays } = require('./lib/scanDays.js');

const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'));
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
const daysArg = process.argv.indexOf('--days');
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 16;
const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

(async () => {
    console.log(`сканирания от ${since} нататък${dryRun ? ' (ПРОБА, нищо не се пише)' : ''}…`);
    let last = 0;
    const res = await backfillScanDays(db, since, {
        dryRun,
        onProgress: (done, all) => {
            if (done - last >= 1000 || done === all) { last = done; console.log(`  ${done}/${all}`); }
        },
    });
    console.log(dryRun ? 'ПРОБА:' : 'ЗАПИСАНО:', res);
    process.exit(0);
})().catch(err => { console.error('ГРЕШКА', err); process.exit(1); });
