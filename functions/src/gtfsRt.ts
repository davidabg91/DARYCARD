import * as admin from "firebase-admin";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");
import { DISRUPTION_KINDS, type DisruptionKind } from "./disruptionKinds";

/**
 * DARY's buses in real time, as GTFS-Realtime — the second half of what
 * Наредба Н-7 asks: each vehicle's position at least every 30 seconds, and the
 * arrival predictions that follow from it. Ported from TransitFlow.
 *
 *   gtfs/darycard-rt.pb     the feed (protobuf), for the national access point
 *   gtfs/darycard-rt.json   the same, readable, with how each bus was matched
 *
 * The terminals report where they are (`positions/{device}`, with a short
 * track). Nobody tells the system which run a bus is driving; it is worked out
 * here, by laying the bus's last few minutes over every run that could be on
 * the road now and keeping the one it fits.
 *
 * A run is "where the timetable says the bus should be at a given minute":
 * between two stops it is on the straight line from one to the next, in
 * proportion to the time. A bus fits a run when its track stays close to that
 * line — allowing it to be up to half an hour late, or a few minutes early.
 *
 * When two runs fit equally well — two buses that leave Плевен at the same
 * minute, still standing at the station — the bus is published without a run
 * rather than with a guess. A few hundred metres later they part ways and the
 * answer is clear. Once a bus is matched it keeps its run for as long as it
 * still fits, so a late bus is not mistaken for the next one on the line.
 */

const TIMEZONE = "Europe/Sofia";
/** A position older than this is not a bus on the road. */
const FRESH_MS = 3 * 60 * 1000;
/** How far off a run a bus may be and still be on it — the line between stops is straight, the road is not. */
const FIT_METRES = 900;
/** How much better the best run must fit than the next before it is believed. */
const MARGIN_METRES = 400;
/** Lateness considered, in minutes. */
const EARLY = 3;
const LATE = 30;
/** A run is on the road from a little before its first stop until a little after its last. */
const BEFORE_START = 20;
const AFTER_END = 10;

type Data = Record<string, unknown>;

interface Call { stopId: string; lat: number; lng: number; minutes: number; seq: number }
interface Run {
    tripId: string;
    routeId: string;
    routeName: string;
    directionId: number;
    serviceDay: string; // YYYYMMDD the run belongs to
    /** Minutes from the start of *today* in Sofia — a run from yesterday after midnight is negative-shifted. */
    calls: Call[];
}

interface Match { tripId: string; serviceDay: string; delay: number; score: number }

// ─────────────────────────────────────────────────────────────────────────────
// Time in Sofia
// ─────────────────────────────────────────────────────────────────────────────

export const sofiaParts = (ms: number) => {
    const f = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(f.find(p => p.type === t)?.value);
    return { y: get("year"), m: get("month"), d: get("day"), minutes: get("hour") * 60 + get("minute") + get("second") / 60 };
};

export const ymd = (y: number, m: number, d: number) => `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;

// ─────────────────────────────────────────────────────────────────────────────
// Official holidays — the same rules as functions/src/gtfs.ts and the app.
// ─────────────────────────────────────────────────────────────────────────────

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const key = (d: Date) => ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
const weekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const holidayCache = new Map<number, Set<string>>();
const holidays = (year: number) => {
    const c = holidayCache.get(year);
    if (c) return c;
    const a = year % 4, b = year % 7, cc = year % 19;
    const dd = (19 * cc + 15) % 30, e = (2 * a + 4 * b - dd + 34) % 7;
    const easter = utc(year, Math.floor((dd + e + 114) / 31), ((dd + e + 114) % 31) + 1 + 13);
    const taken = new Set<string>();
    [-2, -1, 0, 1].forEach(n => taken.add(key(plus(easter, n))));
    const fixed = [[1, 1], [3, 3], [5, 1], [5, 6], [5, 24], [9, 6], [9, 22]].map(([m, d]) => utc(year, m, d));
    const xmas = [24, 25, 26].map(d => utc(year, 12, d));
    [...fixed, ...xmas].forEach(d => taken.add(key(d)));
    const next = (from: Date) => { let d = from; while (weekend(d) || taken.has(key(d))) d = plus(d, 1); return d; };
    fixed.forEach(d => { if (weekend(d)) taken.add(key(next(plus(d, 1)))); });
    let from = utc(year, 12, 27);
    xmas.filter(weekend).forEach(() => { const d = next(from); taken.add(key(d)); from = plus(d, 1); });
    holidayCache.set(year, taken);
    return taken;
};

export const runsOn = (service: Data, y: number, m: number, d: number) => {
    const date = utc(y, m, d);
    const rule = String(service.holidays || "normal");
    if (rule !== "normal" && holidays(y).has(key(date))) return rule === "run";
    const days = Array.isArray(service.days) ? service.days as unknown[] : [];
    return days[(date.getUTCDay() + 6) % 7] === true;
};

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

const metres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};

/** Where the timetable puts the bus at this minute, or null when the run is not on the road. */
const expectedAt = (run: Run, minute: number): [number, number] | null => {
    const c = run.calls;
    if (minute < c[0].minutes - BEFORE_START || minute > c[c.length - 1].minutes + AFTER_END) return null;
    if (minute <= c[0].minutes) return [c[0].lat, c[0].lng];
    for (let i = 1; i < c.length; i++) {
        if (minute <= c[i].minutes) {
            const span = c[i].minutes - c[i - 1].minutes;
            const f = span > 0 ? (minute - c[i - 1].minutes) / span : 1;
            return [c[i - 1].lat + (c[i].lat - c[i - 1].lat) * f, c[i - 1].lng + (c[i].lng - c[i - 1].lng) * f];
        }
    }
    return [c[c.length - 1].lat, c[c.length - 1].lng];
};

/** How well a track fits a run at its best lateness: mean distance in metres, and that lateness. */
const fit = (run: Run, track: Array<{ lat: number; lng: number; minute: number }>, onlyDelay?: number) => {
    let best = { score: Infinity, delay: 0 };
    const delays = onlyDelay !== undefined
        ? [onlyDelay - 2, onlyDelay - 1, onlyDelay, onlyDelay + 1, onlyDelay + 2, onlyDelay + 3]
        : Array.from({ length: EARLY + LATE + 1 }, (_, i) => i - EARLY);
    for (const delay of delays) {
        let sum = 0;
        for (const p of track) {
            const at = expectedAt(run, p.minute - delay);
            sum += at ? metres(p.lat, p.lng, at[0], at[1]) : 5000;
        }
        const score = sum / track.length;
        if (score < best.score) best = { score, delay };
    }
    return best;
};

// ─────────────────────────────────────────────────────────────────────────────

const loadRuns = async (db: admin.firestore.Firestore, now: number): Promise<Run[]> => {
    const [stopsSnap, servicesSnap, ttSnap] = await Promise.all([
        db.collection("stops").get(),
        db.collection("services").get(),
        db.collection("timetables").get(),
    ]);
    const stops = new Map(stopsSnap.docs.map(d => [d.id, d.data() as Data]));
    const services = new Map(servicesSnap.docs.map(d => [d.id, d.data() as Data]));

    const today = sofiaParts(now);
    const y = sofiaParts(now - 86400000);
    // Today's runs, and yesterday's that run on past midnight.
    const days = [
        { y: today.y, m: today.m, d: today.d, shift: 0 },
        { y: y.y, m: y.m, d: y.d, shift: -1440 },
    ];

    const runs: Run[] = [];
    ttSnap.docs.forEach(t => {
        // A line driven by another has no runs of its own — the same rule as the static file.
        const servedBy = t.get("servedBy");
        if (Array.isArray(servedBy) && servedBy.length) return;
        const dirs = Array.isArray(t.get("directions")) ? t.get("directions") as Data[] : [];
        dirs.forEach(dir => {
            const directionId = dir.id === "B" ? 1 : 0;
            const stopIds = Array.isArray(dir.stopIds) ? (dir.stopIds as unknown[]).map(String) : [];
            const trips = Array.isArray(dir.trips) ? dir.trips as Data[] : [];
            trips.forEach((trip, n) => {
                const service = services.get(String(trip.serviceId || ""));
                if (!service) return;
                const times = Array.isArray(trip.times) ? trip.times as unknown[] : [];
                const calls: Call[] = [];
                stopIds.forEach((stopId, i) => {
                    const s = stops.get(stopId);
                    const m = /^(\d{1,2}):(\d{2})$/.exec(String(times[i] || "").trim());
                    if (!m || !s || typeof s.lat !== "number" || typeof s.lng !== "number") return;
                    calls.push({ stopId, lat: s.lat, lng: s.lng, minutes: Number(m[1]) * 60 + Number(m[2]), seq: calls.length + 1 });
                });
                if (calls.length < 2) return;
                for (const day of days) {
                    if (!runsOn(service, day.y, day.m, day.d)) continue;
                    runs.push({
                        // Must be the trip_id the static file gives the same run.
                        tripId: `${t.id}_${directionId}_${String(trip.id || n)}`,
                        routeId: t.id,
                        routeName: String(t.get("name") || t.id),
                        directionId,
                        serviceDay: ymd(day.y, day.m, day.d),
                        calls: calls.map(c => ({ ...c, minutes: c.minutes + day.shift })),
                    });
                }
            });
        });
    });
    return runs;
};

export interface RtVehicle {
    deviceId: string;
    label: string;
    lat: number;
    lng: number;
    bearing: number | null;
    speed: number | null;
    fixAt: string;
    match: (Match & { routeName: string; ambiguousWith?: string[] }) | null;
    note: string;
}

export interface RtDisruption {
    id: string;
    kind: DisruptionKind;
    routeId: string;
    routeName: string;
    tripId: string | null;
    serviceDay: string | null;
    departure: string;
    deviceName: string;
    at: string;
    activeUntil: string;
}

export async function buildRealtime() {
    const db = admin.firestore();
    const now = Date.now();
    const [runs, positions, devices, states, disruptionSnap] = await Promise.all([
        loadRuns(db, now),
        db.collection("positions").get(),
        db.collection("devices").get(),
        db.collection("rt_state").get(),
        db.collection("disruptions").where("activeUntil", ">", new Date(now).toISOString()).get(),
    ]);
    // What drivers reported from the red button — cancelled runs and disruptions.
    const disruptions: RtDisruption[] = disruptionSnap.docs
        .filter(d => !d.get("resolvedAt") && DISRUPTION_KINDS[d.get("kind") as DisruptionKind])
        .map(d => ({
            id: d.id, kind: d.get("kind") as DisruptionKind, routeId: String(d.get("routeId") || ""),
            routeName: String(d.get("routeName") || ""), tripId: d.get("tripId") || null, serviceDay: d.get("serviceDay") || null,
            departure: String(d.get("departure") || ""), deviceName: String(d.get("deviceName") || ""),
            at: String(d.get("at") || ""), activeUntil: String(d.get("activeUntil") || ""),
        }));
    // The name the admin gave the terminal in УСТРОЙСТВА (usually the driver).
    const labels = new Map(devices.docs.map(d => [d.id, String(d.get("name") || d.get("autoName") || "")]));
    const previous = new Map(states.docs.map(d => [d.id, d.data() as Match]));
    const nowMinute = sofiaParts(now).minutes;
    const byTrip = new Map(runs.map(r => [`${r.serviceDay}|${r.tripId}`, r]));

    const vehicles: RtVehicle[] = [];
    const writes: Array<Promise<unknown>> = [];

    for (const p of positions.docs) {
        const d = p.data();
        // The terminal stamps its fixes with its own clock, and a terminal set by
        // hand can be an hour out. The server knows when the report arrived
        // (the document's update time) and the terminal said when it sent it:
        // the difference is how wrong the terminal's clock is. Under a minute it
        // is the network, not the clock, and is left alone.
        const sentAt = Date.parse(String(d.reportedAt || ""));
        const rawSkew = isFinite(sentAt) ? p.updateTime.toMillis() - sentAt : 0;
        const skew = Math.abs(rawSkew) > 60 * 1000 ? rawSkew : 0;
        const fixAt = Date.parse(String(d.fixAt || "")) + skew;
        if (typeof d.lat !== "number" || typeof d.lng !== "number" || !isFinite(fixAt) || now - fixAt > FRESH_MS) continue;

        // The track, in minutes of today — the newest ten minutes of it.
        const flat = Array.isArray(d.track) ? (d.track as number[]) : [];
        const track: Array<{ lat: number; lng: number; minute: number }> = [];
        for (let i = 0; i + 2 < flat.length; i += 3) {
            const at = flat[i + 2] + skew;
            if (now - at > 10 * 60 * 1000) continue;
            track.push({ lat: flat[i], lng: flat[i + 1], minute: nowMinute - (now - at) / 60000 });
        }
        if (!track.length) track.push({ lat: d.lat, lng: d.lng, minute: nowMinute - (now - fixAt) / 60000 });

        const v: RtVehicle = {
            deviceId: p.id, label: labels.get(p.id) || p.id,
            lat: d.lat, lng: d.lng,
            bearing: typeof d.heading === "number" ? d.heading : null,
            speed: typeof d.speed === "number" ? d.speed : null,
            fixAt: new Date(fixAt).toISOString(),
            match: null, note: "",
        };

        // Keep the run it had, while it still fits.
        const prev = previous.get(p.id);
        const prevRun = prev ? byTrip.get(`${prev.serviceDay}|${prev.tripId}`) : undefined;
        if (prevRun) {
            const f = fit(prevRun, track, prev!.delay);
            if (f.score <= FIT_METRES) {
                v.match = { tripId: prevRun.tripId, serviceDay: prevRun.serviceDay, delay: f.delay, score: Math.round(f.score), routeName: prevRun.routeName };
            }
        }

        if (!v.match) {
            const scored = runs
                .map(r => ({ r, f: fit(r, track) }))
                .filter(x => x.f.score <= FIT_METRES)
                .sort((a, b) => a.f.score - b.f.score);
            const [best, second] = scored;
            if (!best) {
                v.note = "Не съвпада с нито един курс от разписанието в момента.";
            } else if (second && second.f.score - best.f.score < MARGIN_METRES) {
                v.note = "Възможни са няколко курса — изчаква автобусът да тръгне в определена посока.";
                v.match = null;
                (v as RtVehicle & { candidates?: string[] }).candidates =
                    scored.filter(x => x.f.score - best.f.score < MARGIN_METRES).map(x => `${x.r.routeName} ${minutesText(x.r.calls[0].minutes)}`);
            } else {
                v.match = { tripId: best.r.tripId, serviceDay: best.r.serviceDay, delay: best.f.delay, score: Math.round(best.f.score), routeName: best.r.routeName };
            }
        }

        const stateRef = db.collection("rt_state").doc(p.id);
        if (v.match && (!prev || prev.tripId !== v.match.tripId || prev.delay !== v.match.delay)) {
            writes.push(stateRef.set({ tripId: v.match.tripId, serviceDay: v.match.serviceDay, delay: v.match.delay, score: v.match.score, at: new Date(now).toISOString() }));
        }
        if (!v.match && prev && !prevRun) writes.push(stateRef.delete());
        vehicles.push(v);
    }
    await Promise.all(writes);

    return { vehicles, runs: byTrip, generatedAt: now, disruptions };
}

const minutesText = (m: number) => {
    const x = ((Math.round(m) % 1440) + 1440) % 1440;
    return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

/** The feed itself: a VehiclePosition for every bus on the road, a TripUpdate for every matched one. */
export const encodeRealtime = (built: Awaited<ReturnType<typeof buildRealtime>>) => {
    const tr = GtfsRealtimeBindings.transit_realtime;
    const ts = Math.floor(built.generatedAt / 1000);
    const nowMinute = sofiaParts(built.generatedAt).minutes;
    const entity: unknown[] = [];
    // A run the driver called off: CANCELED, and no delay predictions for it.
    const cancelled = new Set(built.disruptions
        .filter(d => DISRUPTION_KINDS[d.kind].cancels && d.tripId && d.serviceDay)
        .map(d => `${d.serviceDay}|${d.tripId}`));

    for (const v of built.vehicles) {
        const trip = v.match ? { tripId: v.match.tripId, startDate: v.match.serviceDay, scheduleRelationship: 0 } : undefined;
        entity.push({
            id: `vp-${v.deviceId}`,
            vehicle: {
                trip,
                vehicle: { id: v.deviceId, label: v.label },
                position: {
                    latitude: v.lat, longitude: v.lng,
                    ...(v.bearing !== null ? { bearing: v.bearing } : {}),
                    ...(v.speed !== null ? { speed: v.speed } : {}),
                },
                timestamp: Math.floor(Date.parse(v.fixAt) / 1000),
            },
        });

        if (!v.match || cancelled.has(`${v.match.serviceDay}|${v.match.tripId}`)) continue;
        const run = built.runs.get(`${v.match.serviceDay}|${v.match.tripId}`);
        if (!run) continue;
        // The delay as it stands carries on to the stops still ahead.
        const ahead = run.calls.filter(c => c.minutes + v.match!.delay >= nowMinute - 1);
        if (!ahead.length) continue;
        entity.push({
            id: `tu-${v.deviceId}`,
            tripUpdate: {
                trip,
                vehicle: { id: v.deviceId, label: v.label },
                stopTimeUpdate: ahead.map(c => ({
                    stopSequence: c.seq,
                    stopId: c.stopId,
                    arrival: { delay: v.match!.delay * 60 },
                    departure: { delay: v.match!.delay * 60 },
                })),
                timestamp: ts,
                delay: v.match.delay * 60,
            },
        });
    }

    const text = (t: string) => ({ translation: [{ text: t, language: "bg" }] });
    for (const d of built.disruptions) {
        const spec = DISRUPTION_KINDS[d.kind];
        const trip = d.tripId && d.serviceDay ? { tripId: d.tripId, startDate: d.serviceDay } : undefined;
        if (spec.cancels && trip) {
            entity.push({ id: `cx-${d.id}`, tripUpdate: { trip: { ...trip, scheduleRelationship: 3 }, timestamp: ts } });
        }
        entity.push({
            id: `al-${d.id}`,
            alert: {
                activePeriod: [{ start: Math.floor(Date.parse(d.at) / 1000), end: Math.floor(Date.parse(d.activeUntil) / 1000) }],
                // Без линия (сигнал, пратен със закъснение от непознат курс) — за целия превозвач.
                informedEntity: [trip ? { routeId: d.routeId, trip } : d.routeId ? { routeId: d.routeId } : { agencyId: "darycard" }],
                cause: spec.cause,
                effect: spec.effect,
                headerText: text(`${d.routeName}${d.departure ? `, курс ${d.departure}` : ""}: ${spec.label}`),
                descriptionText: text(`Подадено от автобуса в ${new Date(d.at).toLocaleTimeString("bg-BG", { timeZone: "Europe/Sofia", hour: "2-digit", minute: "2-digit" })}.`),
            },
        });
    }

    const message = tr.FeedMessage.fromObject({
        header: { gtfsRealtimeVersion: "2.0", incrementality: 0, timestamp: ts },
        entity,
    });
    return tr.FeedMessage.encode(message).finish() as Uint8Array;
};
