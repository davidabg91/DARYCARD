/**
 * One-off migration: move existing inline base64 client photos into Firebase
 * Storage and replace the `photo` field with a download URL.
 *
 * SAFE BY DESIGN:
 *   - Paginates (PAGE_SIZE docs at a time) so it never loads the whole collection
 *     into memory.
 *   - Appends every original {id, photo} to a JSONL backup file BEFORE changing the
 *     document, so any touched record can be restored (see restore-photos.mjs).
 *   - Idempotent: skips documents whose photo is already an http(s) URL, so it is
 *     safe to re-run after an interruption.
 *   - Supports --dry-run (no writes) and --backup-only (only dump the backup).
 *
 * USAGE (from the scripts/ folder):
 *   npm install
 *   # Get a service account key: Firebase Console -> Project settings ->
 *   # Service accounts -> Generate new private key -> save as serviceAccountKey.json
 *   node migrate-photos.mjs --dry-run        # report what would happen
 *   node migrate-photos.mjs --backup-only    # only write the backup file
 *   node migrate-photos.mjs                   # backup + migrate for real
 *
 * Credentials are read from GOOGLE_APPLICATION_CREDENTIALS or ./serviceAccountKey.json.
 */
import admin from 'firebase-admin';
import fs from 'fs';
import { randomUUID } from 'crypto';

const BUCKET = 'darycard-6e8e7.firebasestorage.app';
const PAGE_SIZE = 100;
const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

const DRY_RUN = process.argv.includes('--dry-run');
const BACKUP_ONLY = process.argv.includes('--backup-only');

if (!fs.existsSync(KEY_PATH)) {
    console.error(`❌ Service account key not found at: ${KEY_PATH}`);
    console.error('   Firebase Console -> Project settings -> Service accounts -> Generate new private key');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'))),
    storageBucket: BUCKET,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

function parseDataUrl(dataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) return null;
    return { contentType: match[1] || 'image/jpeg', buffer: Buffer.from(match[2], 'base64') };
}

function buildDownloadUrl(objectPath, token) {
    return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

async function main() {
    const backupFile = `photo-backup-${Date.now()}.jsonl`;
    const backupStream = fs.createWriteStream(backupFile, { flags: 'a' });
    console.log(`📦 Backup file: ${backupFile}`);
    console.log(DRY_RUN ? '🔎 DRY RUN — no changes will be written.' : (BACKUP_ONLY ? '💾 BACKUP ONLY mode.' : '🚀 Migrating for real.'));

    let processed = 0, migrated = 0, skipped = 0, failed = 0;
    let lastDoc = null;

    while (true) {
        let q = db.collection('clients').orderBy('__name__').limit(PAGE_SIZE);
        if (lastDoc) q = q.startAfter(lastDoc);
        const snap = await q.get();
        if (snap.empty) break;
        lastDoc = snap.docs[snap.docs.length - 1];

        for (const doc of snap.docs) {
            processed++;
            const photo = doc.data().photo;

            // Always back up the original value before touching anything.
            backupStream.write(JSON.stringify({ id: doc.id, photo: photo || '' }) + '\n');

            if (BACKUP_ONLY) continue;
            if (typeof photo !== 'string' || !photo.startsWith('data:')) { skipped++; continue; }

            const parsed = parseDataUrl(photo);
            if (!parsed) { console.warn(`⚠️  ${doc.id}: unparseable photo, skipped`); skipped++; continue; }

            if (DRY_RUN) { migrated++; continue; }

            try {
                const objectPath = `client_photos/${doc.id}.jpg`;
                const token = randomUUID();
                await bucket.file(objectPath).save(parsed.buffer, {
                    resumable: false,
                    metadata: {
                        contentType: parsed.contentType,
                        metadata: { firebaseStorageDownloadTokens: token },
                    },
                });
                await doc.ref.update({ photo: buildDownloadUrl(objectPath, token) });
                migrated++;
                if (migrated % 25 === 0) console.log(`   ...migrated ${migrated}`);
            } catch (err) {
                failed++;
                console.error(`❌ ${doc.id}: ${err.message}`);
            }
        }
    }

    await new Promise((resolve) => backupStream.end(resolve));
    console.log('\n==== SUMMARY ====');
    console.log(`Processed: ${processed}`);
    console.log(`${DRY_RUN ? 'Would migrate' : 'Migrated'}: ${migrated}`);
    console.log(`Skipped (already URL / not an image): ${skipped}`);
    console.log(`Failed: ${failed}`);
    console.log(`Backup: ${backupFile}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
