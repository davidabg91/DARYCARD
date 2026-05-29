/**
 * Restores client `photo` fields from a backup file produced by migrate-photos.mjs.
 * Use this only if you need to roll the migration back.
 *
 * USAGE (from the scripts/ folder):
 *   node restore-photos.mjs photo-backup-<timestamp>.jsonl
 *
 * Credentials are read from GOOGLE_APPLICATION_CREDENTIALS or ./serviceAccountKey.json.
 */
import admin from 'firebase-admin';
import fs from 'fs';
import readline from 'readline';

const BUCKET = 'darycard-6e8e7.firebasestorage.app';
const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';
const backupFile = process.argv[2];

if (!backupFile || !fs.existsSync(backupFile)) {
    console.error('❌ Provide a valid backup file: node restore-photos.mjs <file.jsonl>');
    process.exit(1);
}
if (!fs.existsSync(KEY_PATH)) {
    console.error(`❌ Service account key not found at: ${KEY_PATH}`);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))),
    storageBucket: BUCKET,
});
const db = admin.firestore();

async function main() {
    const rl = readline.createInterface({ input: fs.createReadStream(backupFile), crlfDelay: Infinity });
    let restored = 0, failed = 0;
    for await (const line of rl) {
        if (!line.trim()) continue;
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        try {
            await db.collection('clients').doc(rec.id).update({ photo: rec.photo });
            restored++;
            if (restored % 25 === 0) console.log(`   ...restored ${restored}`);
        } catch (err) {
            failed++;
            console.error(`❌ ${rec.id}: ${err.message}`);
        }
    }
    console.log(`\nRestored: ${restored}, Failed: ${failed}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
