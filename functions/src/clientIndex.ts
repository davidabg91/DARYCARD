import * as admin from "firebase-admin";
import { isDeepStrictEqual } from "util";

/**
 * Лекият списък на клиентите — `clients_index/{id}`.
 *
 * `/admin` слушаше цялата колекция `clients`: 1 395 документа, 18 MB, за да
 * покаже 20 реда. По-лошото беше, че всяко сканиране в автобус пипа клиентския
 * документ (scanCount/lastScanAt) и Firestore го праща целия наново към всеки
 * отворен панел — 912 документа и 7.7 MB на ден, с пълно преизчисляване на
 * екрана при всяко.
 *
 * Тук стои копие на всеки клиент БЕЗ това, което списъкът не показва:
 *   – броячите на сканиранията (сменят се при всяко пътуване);
 *   – историята на действията и старият масив със сканирания;
 *   – снимката вътре в документа и малката снимка.
 * Пълният документ се чете чак при отваряне на профила.
 *
 * Правило за новите полета: всичко, което не е изброено в DROPPED, се копира.
 * Така поле, добавено утре в `clients`, стига до списъка без промяна тук.
 */
export const CLIENT_INDEX = "clients_index";

/** Не влизат в списъка. Броячите са и причината копието да не се пише при сканиране. */
const DROPPED = new Set([
    "history", "scanHistory",
    "scanCount", "lastScanAt", "lastScanCounter", "dailyScanCount", "lastScanDate",
    "photo", "photoThumb", "photoUploadError",
    // Пише го alertUnpaidScan при всяко пътуване без абонамент; списъкът не го ползва.
    "lastUnpaidAlertAt",
]);

type Data = Record<string, unknown>;

export const projectClient = (data: Data): Data => {
    const out: Data = {};
    for (const [key, value] of Object.entries(data)) {
        if (!DROPPED.has(key)) out[key] = value;
    }

    // Снимката: адресът в Storage е къс низ и остава. Снимка, останала вътре в
    // документа (качването ѝ е пропаднало), не се копира — вместо нея върви
    // малката, за да има редът лице.
    const photo = typeof data.photo === "string" ? data.photo : "";
    if (photo && !photo.startsWith("data:")) {
        out.photo = photo;
    } else {
        out.photo = "";
        if (typeof data.photoThumb === "string" && data.photoThumb) out.photoThumb = data.photoThumb;
    }

    // Проверката на служебните карти показва кой и кога е издал картата — това
    // е първият запис в историята, а самата история не се копира.
    if (data.cardType === "Служебна карта" && Array.isArray(data.history)) {
        const log = data.history as Array<{ action?: string; performedBy?: string; date?: string }>;
        const creation = log.find(h => /Активиране|Създаване/i.test(String(h?.action || ""))) || log[0];
        if (creation?.performedBy) out.issuedBy = String(creation.performedBy);
        if (creation?.date) out.issuedAt = String(creation.date);
    }
    return out;
};

/** Променило ли се е нещо, което списъкът показва? Сканиране само — не. */
export const indexChanged = (before: Data | undefined, after: Data | undefined): boolean => {
    if (!before || !after) return before !== after;
    return !isDeepStrictEqual(projectClient(before), projectClient(after));
};

/**
 * Пренася един клиент в списъка. Чете документа наново в транзакция, вместо да
 * вярва на събитието: събитията идват поне веднъж и не непременно по ред, а
 * така последният запис винаги е текущото състояние.
 */
export const mirrorClient = async (db: admin.firestore.Firestore, clientId: string): Promise<void> => {
    await db.runTransaction(async tx => {
        const snap = await tx.get(db.collection("clients").doc(clientId));
        const ref = db.collection(CLIENT_INDEX).doc(clientId);
        if (!snap.exists) tx.delete(ref);
        else tx.set(ref, { ...projectClient(snap.data() as Data), idxAt: new Date().toISOString() });
    });
};

/**
 * Прави списъка наново от `clients` и маха записите за изтрити клиенти.
 * Пуска се веднъж при въвеждането и когато има съмнение, че списъкът е изостанал
 * (спрени функции, както при затворената платежна сметка през септември 2026).
 */
export const rebuildClientIndex = async (
    db: admin.firestore.Firestore,
    opts: { dryRun?: boolean } = {},
): Promise<{ clients: number; written: number; removed: number; bytes: number }> => {
    const PAGE = 200;
    const seen = new Set<string>();
    let written = 0;
    let bytes = 0;
    let last: admin.firestore.QueryDocumentSnapshot | undefined;

    for (;;) {
        let q = db.collection("clients").orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
        if (last) q = q.startAfter(last);
        const page = await q.get();
        if (page.empty) break;

        const batch = db.batch();
        const idxAt = new Date().toISOString();
        for (const d of page.docs) {
            seen.add(d.id);
            const projected = projectClient(d.data());
            bytes += Buffer.byteLength(JSON.stringify(projected));
            batch.set(db.collection(CLIENT_INDEX).doc(d.id), { ...projected, idxAt });
            written++;
        }
        if (!opts.dryRun) await batch.commit();
        last = page.docs[page.docs.length - 1];
        if (page.size < PAGE) break;
    }

    // Клиент, изтрит докато функциите не са работили, остава в списъка — махаме го.
    const existing = await db.collection(CLIENT_INDEX).select().get();
    const orphans = existing.docs.filter(d => !seen.has(d.id));
    if (!opts.dryRun) {
        for (let i = 0; i < orphans.length; i += 400) {
            const batch = db.batch();
            orphans.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    }
    return { clients: seen.size, written, removed: orphans.length, bytes };
};
