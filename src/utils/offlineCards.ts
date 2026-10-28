/**
 * Checking cards without a connection.
 *
 * Наредба Н-7, приложение № 3: the means of checking work without a connection
 * to the central function, from a local status list, and synchronise later.
 * The terminal keeps the list of every card (functions/src/cardList.ts) — which
 * months are paid, cancelled or not, the chip's UID, the name and number — and
 * the cards' photos, and refreshes them every 15 minutes while it is online.
 * TransitView turns to it when the server does not answer within a moment and
 * shows the card from here; the scan is written to Firestore as usual, which
 * keeps it and sends it once the connection is back.
 *
 * It also remembers when each card was last read on this terminal: offline,
 * that is all there is to stop a card being handed back through the window.
 *
 * Kept in IndexedDB — the photos alone are a few megabytes, more than
 * localStorage holds. Only in the terminal app.
 */

const LIST_URL = 'https://us-central1-darycard-6e8e7.cloudfunctions.net/cardList';
const SYNC_EVERY_MS = 15 * 60 * 1000;
const PHOTO_BATCH = 50;

export interface OfflineCard {
    i: string; u: string; n: string; c: string; t: string; r: string; rs: string[];
    m: Array<[string, string]>; k: boolean; p: string;
}

interface StoredList { v: string; builtAt: string; cards: OfflineCard[] }

let byId = new Map<string, OfflineCard>();
let byUid = new Map<string, OfflineCard>();
let listMeta: { v: string; builtAt: string; syncedAt: number } | null = null;

// ── IndexedDB, the bare minimum ─────────────────────────────────────────────
const DB_NAME = 'dary-offline';
let dbPromise: Promise<IDBDatabase> | null = null;
const openDb = () => dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
        req.result.createObjectStore('meta');
        req.result.createObjectStore('photos');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});
const idbGet = async <T>(store: string, key: string): Promise<T | undefined> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result as T | undefined);
        r.onerror = () => reject(r.error);
    });
};
const idbPut = async (store: string, entries: Array<[string, unknown]>) => {
    const db = await openDb();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        entries.forEach(([k, v]) => tx.objectStore(store).put(v, k));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

const adoptList = (list: StoredList, syncedAt: number) => {
    byId = new Map(list.cards.map(c => [c.i.toUpperCase(), c]));
    byUid = new Map(list.cards.filter(c => c.u).map(c => [c.u.toUpperCase(), c]));
    listMeta = { v: list.v, builtAt: list.builtAt, syncedAt };
};

// ── Lookup ──────────────────────────────────────────────────────────────────
/** The card by the code from its link, or by the chip's UID when the link was not read. */
export const findOfflineCard = (id: string, uid?: string): OfflineCard | undefined =>
    byId.get((id || '').toUpperCase()) || (uid ? byUid.get(uid.toUpperCase()) : undefined)
    || byUid.get((id || '').toUpperCase());

/** How old the list is — shown on the card when it was checked from it. */
export const offlineListAge = (): number | null => listMeta ? Date.now() - Date.parse(listMeta.builtAt) : null;

/** The card's photo, if it has been fetched. */
export const offlinePhoto = async (card: OfflineCard): Promise<string | undefined> => {
    if (!card.p) return undefined;
    try {
        return await idbGet<string>('photos', card.i);
    } catch {
        return undefined;
    }
};

// ── Cards read on this terminal ─────────────────────────────────────────────
const SEEN_KEY = 'dary_offline_seen';
type Seen = Record<string, { last: number; day: string; count: number }>;
const readSeen = (): Seen => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') as Seen; } catch { return {}; } };

/** Notes a card read here. Kept for a day — the anti-passback looks back five minutes. */
export const rememberScan = (clientId: string) => {
    const seen = readSeen();
    const now = Date.now();
    const day = new Date().toISOString().slice(0, 10);
    const prev = seen[clientId];
    seen[clientId] = { last: now, day, count: prev && prev.day === day ? prev.count + 1 : 1 };
    for (const [k, v] of Object.entries(seen)) if (now - v.last > 24 * 3600 * 1000) delete seen[k];
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* full */ }
};

export const localScanInfo = (clientId: string): { last: number | null; today: number } => {
    const s = readSeen()[clientId];
    const day = new Date().toISOString().slice(0, 10);
    return { last: s ? s.last : null, today: s && s.day === day ? s.count : 0 };
};

// ── Sync ────────────────────────────────────────────────────────────────────
let syncing = false;

/** Fetches the photos that are new or changed since the last time (by hash). */
const syncPhotos = async (deviceId: string) => {
    const have = (await idbGet<Record<string, string>>('meta', 'photoHashes')) || {};
    const missing = [...byId.values()].filter(c => c.p && have[c.i] !== c.p);
    for (let i = 0; i < missing.length; i += PHOTO_BATCH) {
        const batch = missing.slice(i, i + PHOTO_BATCH);
        const r = await fetch(`${LIST_URL}/photos?device=${encodeURIComponent(deviceId)}&ids=${batch.map(c => encodeURIComponent(c.i)).join(',')}`);
        if (!r.ok) return;
        const photos = await r.json() as Record<string, string>;
        const got = batch.filter(c => photos[c.i]);
        got.forEach(c => { have[c.i] = c.p; });
        await idbPut('photos', got.map(c => [c.i, photos[c.i]]));
        await idbPut('meta', [['photoHashes', have]]);
    }
};

export const syncCardList = async (deviceId: string): Promise<void> => {
    if (syncing || !deviceId) return;
    syncing = true;
    try {
        const r = await fetch(`${LIST_URL}?device=${encodeURIComponent(deviceId)}`, {
            headers: listMeta ? { 'If-None-Match': `"${listMeta.v}"` } : {},
        });
        if (r.status === 304 && listMeta) {
            listMeta.syncedAt = Date.now();
        } else if (r.ok) {
            const list = await r.json() as StoredList;
            adoptList(list, Date.now());
            await idbPut('meta', [['list', list]]);
        } else {
            return;   // 403: the terminal has no name yet — nothing to keep
        }
        await syncPhotos(deviceId);
    } catch (err) {
        console.warn('Card list not synced:', err);
    } finally {
        syncing = false;
    }
};

/** Loads what is kept and keeps it fresh. Returns a stop function. */
export const startCardListSync = (deviceId: string): (() => void) => {
    let stopped = false;
    void idbGet<StoredList>('meta', 'list')
        .then(list => { if (list && !stopped && !listMeta) adoptList(list, 0); })
        .catch(() => { /* first start */ })
        .finally(() => { if (!stopped) void syncCardList(deviceId); });
    const timer = setInterval(() => void syncCardList(deviceId), SYNC_EVERY_MS);
    const online = () => void syncCardList(deviceId);
    window.addEventListener('online', online);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('online', online); };
};
