import * as admin from "firebase-admin";
import { isDeepStrictEqual } from "util";

/**
 * Сканиранията на една карта за един ден — `scan_days/{клиент}_{дата}`.
 *
 * КОНТРОЛ НА ЗЛОУПОТРЕБИ в ТАБЛО търси карти с повече от 3 пътувания за ден.
 * За целта панелът теглеше ВСИЧКИ сканирания за 14 дни — 17 000 документа,
 * 21 MB — за да покаже пет реда. Тук всяка карта има по един малък документ на
 * ден със самите сканирания, а панелът пита само за дните над прага.
 *
 *   scan_days/{clientId}_{YYYY-MM-DD}
 *     clientId, date
 *     scans   { [ид на сканирането]: { at, trip, device? } }
 *     n       колко от тях са пътувания (същото условие като в ТАБЛО)
 *     total   колко са общо
 *     flagDate  = date, но само когато n > 3 — по това поле пита панелът
 *
 *   scan_day_totals/{YYYY-MM-DD}
 *     date, total   сборът на `total` за деня — с него панелът проверява, че
 *                   обобщението не е изостанало от истинските сканирания
 *
 * Защо записите са по ид на сканирането, а не брояч: събитията от Firestore
 * идват поне веднъж и не непременно по ред. Брояч би преброил повторено
 * събитие два пъти; запис под същото ид просто се презаписва със същото.
 * Дневният сбор се мести с разликата в `total` в същата транзакция, затова
 * винаги е точно сборът на документите за деня.
 */
export const SCAN_DAYS = "scan_days";
export const SCAN_DAY_TOTALS = "scan_day_totals";
/** Над толкова пътувания за ден картата излиза в КОНТРОЛ НА ЗЛОУПОТРЕБИ. */
export const ABUSE_OVER = 3;

export interface ScanEntry {
    at: string;
    /** Пътуване ли е: прочитане от терминал, а не отваряне в браузър или от служител. */
    trip: boolean;
    /** Името на терминала от УСТРОЙСТВА, ако се знае (attributeScanToDevice). */
    device?: string;
}

type Data = Record<string, unknown>;

/** Денят на сканирането — както го реже ТАБЛО: датата от ISO низа. */
export const dayOf = (at: unknown): string | null => {
    if (typeof at !== "string") return null;
    const day = at.split("T")[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
};

/**
 * Същото условие като `toScanRecords` в SystemAdminPanel: пътуване е прочитане
 * от терминала. Отпадат отварянията в браузър (`source: 'web'`) и прочитанията
 * от логнат служител (`scannedBy`/`role`).
 */
export const entryOf = (scan: Data): ScanEntry | null => {
    if (!dayOf(scan.at)) return null;
    const entry: ScanEntry = {
        at: scan.at as string,
        trip: scan.source !== "web" && !scan.scannedBy && !scan.role,
    };
    if (scan.deviceName) entry.device = String(scan.deviceName);
    return entry;
};

export const scanDayId = (clientId: string, date: string) => `${clientId}_${date}`;

/**
 * Променя сканиранията на една карта за един ден и държи `n`, `total`,
 * `flagDate` и дневния сбор в крак — всичко в една транзакция.
 * `mutate` получава записите и ги променя на място.
 */
export const updateScanDay = async (
    db: admin.firestore.Firestore,
    clientId: string,
    date: string,
    mutate: (scans: Record<string, ScanEntry>, tx: admin.firestore.Transaction) => Promise<void> | void,
): Promise<void> => {
    const ref = db.collection(SCAN_DAYS).doc(scanDayId(clientId, date));
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const before = (snap.exists ? snap.get("scans") : null) as Record<string, ScanEntry> | null;
        const scans: Record<string, ScanEntry> = { ...(before || {}) };
        await mutate(scans, tx);
        if (isDeepStrictEqual(scans, before || {})) return;

        const entries = Object.values(scans);
        const total = entries.length;
        const n = entries.filter(e => e.trip).length;
        const oldTotal = before ? Object.keys(before).length : 0;

        if (total === 0) {
            tx.delete(ref);
        } else {
            const doc: Data = { clientId, date, scans, n, total };
            if (n > ABUSE_OVER) doc.flagDate = date;
            tx.set(ref, doc);
        }
        if (total !== oldTotal) {
            tx.set(db.collection(SCAN_DAY_TOTALS).doc(date), {
                date,
                total: admin.firestore.FieldValue.increment(total - oldTotal),
            }, { merge: true });
        }
    });
};

/**
 * Пренася едно сканиране в обобщението. Чете сканирането наново в
 * транзакцията, вместо да вярва на събитието, затова закъсняло или повторено
 * събитие записва текущото състояние, а не старо.
 */
export const syncScan = async (
    db: admin.firestore.Firestore,
    clientId: string,
    scanId: string,
    /** Дните, в които сканирането е било според събитието — за махане при изтриване. */
    knownDays: Array<string | null>,
): Promise<void> => {
    const scanRef = db.collection("clients").doc(clientId).collection("scans").doc(scanId);
    const first = await scanRef.get();
    const days = new Set<string>();
    for (const d of [...knownDays, first.exists ? dayOf(first.get("at")) : null]) if (d) days.add(d);

    for (const date of days) {
        await updateScanDay(db, clientId, date, async (scans, tx) => {
            const fresh = await tx.get(scanRef);
            const entry = fresh.exists ? entryOf(fresh.data() as Data) : null;
            if (entry && dayOf(entry.at) === date) scans[scanId] = entry;
            else delete scans[scanId];
        });
    }
};

/**
 * Попълва обобщението от самите сканирания от `since` нататък. Само добавя и
 * поправя записи през същата транзакция като функцията, затова може да върви,
 * докато автобусите сканират — сканиране, дошло междувременно, не се губи.
 */
export const backfillScanDays = async (
    db: admin.firestore.Firestore,
    since: string,
    opts: { dryRun?: boolean; onProgress?: (done: number, all: number) => void } = {},
): Promise<{ scans: number; clientDays: number; flagged: number }> => {
    const snap = await db.collectionGroup("scans").where("at", ">=", since).get();
    const groups = new Map<string, { clientId: string; date: string; items: Array<[string, ScanEntry]> }>();
    let scans = 0;
    for (const d of snap.docs) {
        const clientId = d.ref.parent.parent?.id;
        const entry = entryOf(d.data());
        const date = entry && dayOf(entry.at);
        if (!clientId || !entry || !date) continue;
        scans++;
        const key = scanDayId(clientId, date);
        if (!groups.has(key)) groups.set(key, { clientId, date, items: [] });
        groups.get(key)!.items.push([d.id, entry]);
    }
    // Подредени на смени по дати: успоредните записи пипат различни дневни
    // сборове, вместо да се блъскат в един и същ документ.
    const byDate = new Map<string, Array<{ clientId: string; date: string; items: Array<[string, ScanEntry]> }>>();
    for (const g of groups.values()) {
        if (!byDate.has(g.date)) byDate.set(g.date, []);
        byDate.get(g.date)!.push(g);
    }
    const all: Array<{ clientId: string; date: string; items: Array<[string, ScanEntry]> }> = [];
    for (let i = 0, more = true; more; i++) {
        more = false;
        for (const list of byDate.values()) if (list[i]) { all.push(list[i]); more = true; }
    }
    const flagged = all.filter(g => g.items.filter(([, e]) => e.trip).length > ABUSE_OVER).length;
    if (opts.dryRun) return { scans, clientDays: all.length, flagged };

    let done = 0;
    const POOL = 12;
    for (let i = 0; i < all.length; i += POOL) {
        await Promise.all(all.slice(i, i + POOL).map(g =>
            updateScanDay(db, g.clientId, g.date, existing => {
                for (const [id, entry] of g.items) {
                    // Функцията може междувременно да е записала по-пълен запис
                    // (с името на терминала) — него не го връщаме назад.
                    if (existing[id]?.device && !entry.device) continue;
                    existing[id] = entry;
                }
            })));
        done += Math.min(POOL, all.length - i);
        opts.onProgress?.(done, all.length);
    }
    return { scans, clientDays: all.length, flagged };
};
