import * as admin from "firebase-admin";
import { metres, settlementAt } from "./stopLocator";

/**
 * Откъде е едно сканиране: кой терминал го е направил и къде е бил автобусът.
 *
 * Терминалите от APK 1.4.5 нататък пишат в самото сканиране номера си
 * (`deviceId`) и последната си GPS точка. За по-старите апаратът се познава по
 * времето: регистърът вдига `lastScanAt` в мига на допирането, винаги преди
 * самото сканиране да се запише — измерено върху три дни живи данни
 * отместването е 377–1864 ms, никога отрицателно. Оттам и прозорецът: само
 * напред, до три секунди.
 *
 * Прозорец в двете посоки беше пробван и бърка: чуждо сканиране, случило се
 * малко преди пулса, влиза в него. Със същите данни напред-само дава 12 от 13
 * активни терминала еднозначно, срещу 9 при симетричен прозорец.
 *
 * Има ли повече от един кандидат — апаратът остава неизвестен. По-добре празно,
 * отколкото грешен шофьор: 15% от сканиранията имат съсед в рамките на 3 s.
 */

type Data = admin.firestore.DocumentData;

/** Колко назад от сканирането се търси пулс на терминал. */
const DEVICE_MATCH_MS = 3000;
/** Спирка по-далеч от това не е „спирката на сканирането“. */
const STOP_NEAR_M = 300;
/** Спирките се четат наново най-много толкова често. */
const STOPS_TTL_MS = 10 * 60 * 1000;

export interface FoundDevice {
    ref: admin.firestore.DocumentReference;
    id: string;
    /** Името от УСТРОЙСТВА в момента на сканирането — обикновено шофьорът. */
    name: string;
    /** "id" — терминалът сам е казал кой е; "time" — познат по часа. */
    match: "id" | "time";
}

/** Полетата, които описват откъде е сканирането — копират се и в отчета. */
export const ORIGIN_KEYS = [
    "deviceId", "deviceName", "deviceMatch", "busRoute", "place", "stop", "stopDistM",
    "lat", "lng", "acc", "gpsAgeS", "check", "shown", "app",
] as const;

export const pickOrigin = (scan: Data): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k of ORIGIN_KEYS) if (scan[k] !== undefined && scan[k] !== null && scan[k] !== "") out[k] = scan[k];
    return out;
};

const deviceName = (d: Data) => String(d.name || d.autoName || "").trim();

/** Терминалът, който е прочел картата, или null — браузър или не се знае. */
export const findDevice = async (db: admin.firestore.Firestore, scan: Data): Promise<FoundDevice | null> => {
    if (scan.source === "web") return null;
    const at = String(scan.at || "");
    const atMs = new Date(at).getTime();
    if (!isFinite(atMs)) return null;

    const own = typeof scan.deviceId === "string" ? scan.deviceId : "";
    if (/^[A-Za-z0-9_-]{6,40}$/.test(own)) {
        const d = await db.collection("devices").doc(own).get();
        // Махнат от списъка терминал — номерът остава в сканирането, името не се знае.
        return d.exists ? { ref: d.ref, id: d.id, name: deviceName(d.data() || {}), match: "id" } : null;
    }

    // `lastScanAt` е ISO низ в същия формат, затова подредбата по текст е
    // подредба по време. Единичен индекс — Firestore го прави сам.
    const from = new Date(atMs - DEVICE_MATCH_MS).toISOString();
    const lookup = () => db.collection("devices")
        .where("lastScanAt", ">=", from)
        .where("lastScanAt", "<=", at)
        .get();

    // Двата записа се състезават. Терминалът вдига `lastScanAt` в мига на
    // допирането, а сканирането се записва чак след като профилът се прочете
    // от базата — но това са две отделни връзки и редът, в който стигат, не е
    // гарантиран. Тази функция тръгва от сканирането, така че пулсът може още
    // да е по пътя. Затова, ако първото питане е празно, изчакваме веднъж.
    let candidates = await lookup();
    if (candidates.empty) {
        await new Promise((r) => setTimeout(r, 2000));
        candidates = await lookup();
    }
    if (candidates.size !== 1) {
        console.log(`Сканиране ${at}: ${candidates.size} кандидата в [${from}, ${at}] — апаратът не се знае`);
        return null;
    }
    const d = candidates.docs[0];
    return { ref: d.ref, id: d.id, name: deviceName(d.data()), match: "time" };
};

let stopsCache: { at: number; stops: Array<{ name: string; lat: number; lng: number }> } | null = null;

const knownStops = async (db: admin.firestore.Firestore) => {
    if (stopsCache && Date.now() - stopsCache.at < STOPS_TTL_MS) return stopsCache.stops;
    const snap = await db.collection("stops").get();
    const stops = snap.docs
        .map((d) => ({ name: String(d.get("name") || ""), lat: Number(d.get("lat")), lng: Number(d.get("lng")) }))
        .filter((s) => s.name && isFinite(s.lat) && isFinite(s.lng) && (s.lat !== 0 || s.lng !== 0));
    stopsCache = { at: Date.now(), stops };
    return stops;
};

/**
 * Селото (от OpenStreetMap, помни се по клетка от ~100 м) и най-близката спирка
 * с координати, ако е до 300 м. Спирките получават координати от качванията
 * (stopLocator), затова в началото спирка често няма — селото го има винаги.
 */
export const placeOf = async (db: admin.firestore.Firestore, lat: number, lng: number) => {
    const out: { place?: string; stop?: string; stopDistM?: number } = {};
    if (!isFinite(lat) || !isFinite(lng)) return out;
    try {
        let best: { name: string; d: number } | null = null;
        for (const s of await knownStops(db)) {
            const d = metres({ lat, lng }, s);
            if (d <= STOP_NEAR_M && (!best || d < best.d)) best = { name: s.name, d };
        }
        if (best) { out.stop = best.name; out.stopDistM = Math.round(best.d); }
    } catch (err) {
        console.warn("stops not read:", err);
    }
    const village = await settlementAt(db, lat, lng, { left: 1 });
    if (village) out.place = village;
    return out;
};
