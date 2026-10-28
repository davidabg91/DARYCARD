import * as admin from "firebase-admin";
import { buildRealtime, runsOn, sofiaParts, ymd } from "./gtfsRt";
import { DISRUPTION_KINDS, type DisruptionKind } from "./disruptionKinds";

/**
 * Отменени курсове и смущения (Наредба Н-7, таблица 3: „анулирани курсове“,
 * „прекъсвания и смущения“ — без неоправдано забавяне).
 *
 * Подава ги шофьорът от червения бутон на терминала. Шофьорът не е логнат,
 * затова доверието е в самия терминал: приема се само от устройство, на което
 * админът е дал име в УСТРОЙСТВА (`devices/{id}.name` пише само служител). Пише
 * само тази функция (admin SDK) — правилата не дават на никого create.
 *
 * Курсът се взима от разпознаването по GPS (gtfsRt). Ако системата не знае кой
 * курс кара апаратът — първи курс за деня, още няма въведени точки и т.н. —
 * функцията връща днешните курсове около този час и шофьорът избира.
 *
 * Без връзка терминалът пази сигнала и го праща сам, щом хване интернет
 * (`ageMs` — колко отдавна е натиснат, мерено с часовника на терминала, затова
 * сгрешен часовник не пречи). Тогава сигналът се води от момента на
 * натискането, а не на пристигането, и шофьорът вече не може да бъде питан:
 * ако курсът не се знае, се взима линията, която шофьорът е посочил офлайн, или
 * линията, която терминалът обслужва днес според картите; иначе сигналът е за
 * целия превозвач.
 *
 *   disruptions/{id}  { deviceId, deviceName, kind, routeId, routeName,
 *                       tripId|null, serviceDay|null, departure, matchedBy,
 *                       at, activeUntil, resolvedAt|null, resolvedBy }
 */

type Data = Record<string, unknown>;


/** Курсове, от които шофьорът избира: днешните, тръгнали до 2 ч. назад или тръгващи до 45 мин. */
const WINDOW_BEFORE = 120;
const WINDOW_AFTER = 45;

interface TripOption { key: string; routeId: string; routeName: string; departure: string; from: string; to: string }

const nowIso = () => new Date().toISOString();

/** Днешните курсове около този час, от разписанията — не иска точки на картата. */
const nearbyTrips = async (db: admin.firestore.Firestore, now: number): Promise<TripOption[]> => {
    const [stopsSnap, servicesSnap, ttSnap] = await Promise.all([
        db.collection("stops").get(), db.collection("services").get(), db.collection("timetables").get(),
    ]);
    const stops = new Map(stopsSnap.docs.map(d => [d.id, String(d.get("name") || d.id)]));
    const services = new Map(servicesSnap.docs.map(d => [d.id, d.data() as Data]));
    const t = sofiaParts(now);
    const out: TripOption[] = [];
    ttSnap.docs.forEach(doc => {
        const servedBy = doc.get("servedBy");
        if (Array.isArray(servedBy) && servedBy.length) return;
        const routeName = String(doc.get("name") || doc.id);
        const dirs = Array.isArray(doc.get("directions")) ? doc.get("directions") as Data[] : [];
        dirs.forEach(dir => {
            const dirId = dir.id === "B" ? 1 : 0;
            const stopIds = Array.isArray(dir.stopIds) ? (dir.stopIds as unknown[]).map(String) : [];
            (Array.isArray(dir.trips) ? dir.trips as Data[] : []).forEach((trip, n) => {
                const service = services.get(String(trip.serviceId || ""));
                if (!service || !runsOn(service, t.y, t.m, t.d)) return;
                const times = Array.isArray(trip.times) ? (trip.times as unknown[]).map(x => String(x || "")) : [];
                const first = times.findIndex(x => /^\d{1,2}:\d{2}$/.test(x.trim()));
                if (first < 0) return;
                const [h, m] = times[first].split(":").map(Number);
                const dep = h * 60 + m;
                if (dep < t.minutes - WINDOW_BEFORE || dep > t.minutes + WINDOW_AFTER) return;
                out.push({
                    key: `${ymd(t.y, t.m, t.d)}|${doc.id}_${dirId}_${String(trip.id || n)}`,
                    routeId: doc.id,
                    routeName,
                    departure: times[first].trim(),
                    from: stops.get(stopIds[first]) || "",
                    to: stops.get(stopIds[stopIds.length - 1]) || "",
                });
            });
        });
    });
    return out.sort((a, b) => a.routeName.localeCompare(b.routeName, "bg") || a.departure.localeCompare(b.departure));
};

const notifyAdmins = async (db: admin.firestore.Firestore, title: string, body: string, tag: string) => {
    const tokensSnap = await db.collection("admin_push_tokens").get();
    const tokens: string[] = [];
    tokensSnap.forEach(t => { const tok = t.data().token; if (tok) tokens.push(tok); });
    if (!tokens.length) return;
    const response = await admin.messaging().sendEachForMulticast({
        notification: { title, body },
        webpush: {
            notification: { title, body, icon: "https://darycommerce.com/pwa-icon.png", badge: "https://darycommerce.com/favicon.png", tag },
            fcmOptions: { link: "https://darycommerce.com/#/admin" },
        },
        android: { notification: { icon: "stock_white_24dp", color: "#ff1744" } },
        tokens,
    });
    response.responses.forEach((res, i) => {
        const code = res.error?.code;
        if (!res.success && (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token")) {
            tokensSnap.docs[i].ref.delete().catch(() => { /* ignore */ });
        }
    });
};

/** Активните смущения на един терминал. */
const activeFor = async (db: admin.firestore.Firestore, deviceId: string) => {
    const snap = await db.collection("disruptions").where("deviceId", "==", deviceId).get();
    const now = nowIso();
    return snap.docs.filter(d => !d.get("resolvedAt") && String(d.get("activeUntil") || "") > now);
};

export interface DisruptionRequest {
    deviceId?: string;
    action?: "status" | "report" | "resolve";
    kind?: string;
    /** `${serviceDay}|${tripId}` от списъка, който шофьорът е видял. */
    tripKey?: string;
    /** Само линия — когато за линията няма курс около този час. */
    routeId?: string;
    /** Пратено със закъснение от опашката на терминала: преди колко ms е натиснат бутонът. */
    ageMs?: number;
}

/** Сигнал по-стар от това не се приема — смущението отдавна е минало. */
const MAX_QUEUED_MS = 6 * 3600 * 1000;
/** Толкова закъснял сигнал вече не се сверява с GPS — автобусът е другаде. */
const GPS_STILL_VALID_MS = 3 * 60 * 1000;

const normName = (x: string) => x.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "");

export async function handleDisruption(data: DisruptionRequest) {
    const db = admin.firestore();
    const deviceId = String(data.deviceId || "").slice(0, 40);
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(deviceId)) return { ok: false, error: "Неизвестен терминал." };
    const device = await db.collection("devices").doc(deviceId).get();
    const deviceName = String(device.get("name") || "").trim();
    if (!device.exists || !deviceName) {
        return { ok: false, error: "Този терминал още не е разрешен. Админът трябва да му даде име в УСТРОЙСТВА." };
    }

    const describe = (d: admin.firestore.QueryDocumentSnapshot) => ({
        id: d.id, kind: d.get("kind"), label: DISRUPTION_KINDS[d.get("kind") as DisruptionKind]?.label || "",
        routeName: d.get("routeName"), departure: d.get("departure") || "", at: d.get("at"),
    });

    if (data.action === "status") {
        return { ok: true, active: (await activeFor(db, deviceId)).map(describe) };
    }

    const age = Math.min(Math.max(Number(data.ageMs) || 0, 0), MAX_QUEUED_MS + 1);
    if (age > MAX_QUEUED_MS) return { ok: false, error: "Сигналът е по-стар от 6 часа и не е изпратен." };
    const queued = age > 0;

    if (data.action === "resolve") {
        const active = await activeFor(db, deviceId);
        const at = new Date(Date.now() - age).toISOString();
        await Promise.all(active.map(d => d.ref.update({ resolvedAt: at, resolvedBy: `Терминал: ${deviceName}` })));
        if (active.length) {
            await notifyAdmins(db, "Смущението приключи", `${deviceName}: ${active.map(d => d.get("routeName")).join(", ")} — движението е нормално.`, `disruption-${deviceId}`)
                .catch(err => console.error("disruption push failed", err));
        }
        return { ok: true, resolved: active.length };
    }

    // ── report ───────────────────────────────────────────────────────────────
    const kind = String(data.kind || "") as DisruptionKind;
    const spec = DISRUPTION_KINDS[kind];
    if (!spec) return { ok: false, error: "Изберете какво се е случило." };
    const now = Date.now() - age;

    let trip: { routeId: string; routeName: string; tripId: string | null; serviceDay: string | null; departure: string; matchedBy: "gps" | "driver" } | null = null;

    if (data.tripKey) {
        const options = await nearbyTrips(db, now);
        const o = options.find(x => x.key === data.tripKey);
        if (!o) return { ok: false, error: "Курсът вече не е в списъка — изберете отново." };
        const [serviceDay, tripId] = o.key.split("|");
        trip = { routeId: o.routeId, routeName: o.routeName, tripId, serviceDay, departure: o.departure, matchedBy: "driver" };
    } else if (data.routeId) {
        const tt = await db.collection("timetables").doc(String(data.routeId)).get();
        if (!tt.exists && !queued) return { ok: false, error: "Непозната линия." };
        if (tt.exists) trip = { routeId: tt.id, routeName: String(tt.get("name") || tt.id), tripId: null, serviceDay: null, departure: "", matchedBy: "driver" };
    }
    if (!trip && queued) {
        // Закъснял сигнал: GPS-ът важи само ако е съвсем пресен, а шофьорът вече
        // не може да бъде попитан.
        if (age <= GPS_STILL_VALID_MS) {
            try {
                const built = await buildRealtime();
                const v = built.vehicles.find(x => x.deviceId === deviceId);
                const run = v?.match ? built.runs.get(`${v.match.serviceDay}|${v.match.tripId}`) : undefined;
                if (run) trip = { routeId: run.routeId, routeName: run.routeName, tripId: run.tripId, serviceDay: run.serviceDay, departure: "", matchedBy: "gps" };
            } catch (err) {
                console.error("disruption: matching failed", err);
            }
        }
        if (!trip) {
            // Линията, която терминалът обслужва днес според прочетените карти.
            const current = String(device.get("currentRoute") || "");
            const tts = await db.collection("timetables").get();
            const hit = current ? tts.docs.find(d => normName(String(d.get("name") || "")) === normName(current)) : undefined;
            trip = hit
                ? { routeId: hit.id, routeName: String(hit.get("name") || hit.id), tripId: null, serviceDay: null, departure: "", matchedBy: "driver" }
                : { routeId: "", routeName: "линията не е известна", tripId: null, serviceDay: null, departure: "", matchedBy: "driver" };
        }
    } else if (!trip) {
        // Кой курс кара апаратът според GPS — същото разпознаване като в потока за НТД.
        try {
            const built = await buildRealtime();
            const v = built.vehicles.find(x => x.deviceId === deviceId);
            const run = v?.match ? built.runs.get(`${v.match.serviceDay}|${v.match.tripId}`) : undefined;
            if (v?.match && run) {
                const first = run.calls[0];
                const m = ((Math.round(first.minutes) % 1440) + 1440) % 1440;
                trip = {
                    routeId: run.routeId, routeName: run.routeName, tripId: run.tripId, serviceDay: run.serviceDay,
                    departure: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
                    matchedBy: "gps",
                };
            }
        } catch (err) {
            console.error("disruption: matching failed", err);
        }
        if (!trip) {
            const options = await nearbyTrips(db, now);
            const lines = (await db.collection("timetables").get()).docs
                .filter(d => !(Array.isArray(d.get("servedBy")) && d.get("servedBy").length))
                .map(d => ({ routeId: d.id, routeName: String(d.get("name") || d.id) }))
                .sort((a, b) => a.routeName.localeCompare(b.routeName, "bg"));
            return { ok: true, needTrip: true, options, lines };
        }
    }

    // Нов сигнал от същия терминал заменя стария.
    const at = new Date(now).toISOString();
    const active = await activeFor(db, deviceId);
    const previous = active.filter(d => String(d.get("at") || "") < at);
    // Закъснял сигнал, след който шофьорът вече е подал по-нов: пази се за
    // историята, но не е активен.
    const overtaken = active.some(d => String(d.get("at") || "") > at);
    await Promise.all(previous.map(d => d.ref.update({ resolvedAt: at, resolvedBy: "Заменено с нов сигнал" })));
    const ref = await db.collection("disruptions").add({
        deviceId, deviceName, kind, ...trip,
        at, activeUntil: new Date(now + spec.hours * 3600000).toISOString(),
        resolvedAt: overtaken ? nowIso() : null, resolvedBy: overtaken ? "По-нов сигнал вече е подаден" : "",
        ...(queued ? { receivedAt: nowIso(), queued: true } : {}),
    });
    const late = queued ? ` (натиснат в ${new Date(now).toLocaleTimeString("bg-BG", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit" })}, пратен със закъснение — нямаше връзка)` : "";
    await notifyAdmins(db, `🚨 ${spec.label}`,
        `${deviceName}: ${trip.routeName}${trip.departure ? `, курс ${trip.departure}` : ""}.${late}`, `disruption-${deviceId}`)
        .catch(err => console.error("disruption push failed", err));
    return { ok: true, id: ref.id, routeName: trip.routeName, departure: trip.departure, matchedBy: trip.matchedBy };
}
