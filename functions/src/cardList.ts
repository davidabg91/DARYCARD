import * as admin from "firebase-admin";
import { createHash } from "crypto";
import { gzipSync } from "zlib";

/**
 * The list a terminal checks cards against when it has no connection.
 *
 * Наредба Н-7, приложение № 3: the means of checking work without a connection
 * to the central function, from a local status list, and synchronise once the
 * connection is back. A DARY terminal used to load every card from the server
 * at the tap; on a weak signal that took seconds, and with no signal a card it
 * had not seen before could not be checked at all.
 *
 * Every card, with only what a check needs: which months are paid (from last
 * month on — "paid through" needs the run from this month), the card type and
 * line, cancelled or not, the chip's UID, the name and card number for the
 * driver. Photos are separate (`/photos`), fetched once per card and again only
 * when the photo changes — `p` is a short hash of it.
 *
 * Only for a terminal the admin has named in УСТРОЙСТВА — the same trust as the
 * red button. The list is built at most every five minutes per server instance.
 *
 *   GET  …/cardList?device=ID                → { v, builtAt, cards: [...] }   (ETag)
 *   GET  …/cardList/photos?device=ID&ids=a,b → { a: "data:…", b: "data:…" }
 */

export interface CardEntry {
    /** client id (the document id, the code in the card's link) */
    i: string;
    /** chip UID */
    u: string;
    n: string;
    c: string;
    /** card type */
    t: string;
    /** route as on the card */
    r: string;
    rs: string[];
    /** paid months from last month on: [month, route] */
    m: Array<[string, string]>;
    /** cancelled */
    k: boolean;
    /** photo hash, empty when there is none */
    p: string;
}

const REBUILD_MS = 5 * 60 * 1000;
const MAX_PHOTOS = 60;

let cache: { at: number; version: string; body: string; gzipped: Buffer } | null = null;

const monthBefore = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    return x.toISOString().slice(0, 7);
};

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);

/** Is this a terminal the admin has named? */
export const trustedDevice = async (deviceId: string): Promise<boolean> => {
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(deviceId)) return false;
    const d = await admin.firestore().collection("devices").doc(deviceId).get();
    return d.exists && !!String(d.get("name") || "").trim();
};

export const buildCardList = async (): Promise<{ version: string; body: string; gzipped: Buffer }> => {
    if (cache && Date.now() - cache.at < REBUILD_MS) return cache;
    const from = monthBefore(new Date());
    const snap = await admin.firestore().collection("clients")
        .select("name", "nfcUid", "cardNumber", "cardType", "route", "routes", "renewalHistory", "isCanceled", "photoThumb")
        .get();
    const cards: CardEntry[] = snap.docs.map(d => {
        const x = d.data();
        const history = Array.isArray(x.renewalHistory) ? x.renewalHistory as Array<{ month?: string; route?: string }> : [];
        return {
            i: d.id,
            u: String(x.nfcUid || "").toUpperCase(),
            n: String(x.name || "").trim(),
            c: String(x.cardNumber || ""),
            t: String(x.cardType || ""),
            r: String(x.route || ""),
            rs: Array.isArray(x.routes) ? (x.routes as unknown[]).map(String) : [],
            m: history.filter(h => h.month && h.month >= from).map(h => [String(h.month), String(h.route || "")] as [string, string]),
            k: !!x.isCanceled,
            p: x.photoThumb ? hash(String(x.photoThumb)) : "",
        };
    });
    const builtAt = new Date().toISOString();
    const version = hash(JSON.stringify(cards));
    const body = JSON.stringify({ v: version, builtAt, cards });
    // ~300 KB as text, a fifth of it compressed — terminals are on mobile data.
    cache = { at: Date.now(), version, body, gzipped: gzipSync(body) };
    return cache;
};

export const cardPhotos = async (ids: string[]): Promise<Record<string, string>> => {
    const db = admin.firestore();
    const refs = ids.slice(0, MAX_PHOTOS).map(id => db.collection("clients").doc(id));
    if (!refs.length) return {};
    const docs = await db.getAll(...refs, { fieldMask: ["photoThumb"] });
    const out: Record<string, string> = {};
    docs.forEach(d => { const p = d.get("photoThumb"); if (d.exists && p) out[d.id] = String(p); });
    return out;
};
