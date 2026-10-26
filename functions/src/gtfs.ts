import * as admin from "firebase-admin";
import { strToU8, zipSync } from "fflate";

/**
 * DARY's timetable as a GTFS feed — the file Наредба Н-7 asks every operator
 * to publish to the Национална точка за достъп.
 *
 * Built on request from what was entered under Разписания in /admin: the stops,
 * the patterns of days and a timetable per line, which also carries the line's
 * name and single-ticket fare. Nothing is stored; the file is always what the
 * data says now. Ported from TransitFlow, for one company.
 *
 *   gtfs/darycard.zip    the feed
 *   gtfs/darycard.json   what went into it and what was left out, and why
 *
 * What GTFS would refuse is left out rather than shipped broken — a stop with no
 * point on the map, a run whose times go backwards — and named in the report,
 * so the company can see what it still has to fix.
 */

const TIMEZONE = "Europe/Sofia";

/** The operator, as in the company details on darycommerce.com/#/legal. */
const AGENCY = {
    id: "darycard",
    name: "„ДАРИ КОМЕРС - НА“ ООД",
    url: "https://darycommerce.com",
    phone: "+359876141826",
    email: "",
};

type Data = Record<string, unknown>;

interface Problem { level: "error" | "warning"; message: string }

export interface GtfsReport {
    feed: string;
    generatedAt: string;
    feedStart: string;
    feedEnd: string;
    counts: { routes: number; stops: number; trips: number; stopTimes: number; services: number };
    problems: Problem[];
    /** Lines whose runs are driven and published under another line. */
    served: Array<{ name: string; by: string[] }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Official holidays — mirrors src/utils/holidays.ts in the app. Kept as a copy
// because the functions are built and deployed on their own; change both.
// ─────────────────────────────────────────────────────────────────────────────

const ymd = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const weekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

const orthodoxEaster = (year: number) => {
    const a = year % 4, b = year % 7, c = year % 19;
    const d = (19 * c + 15) % 30;
    const e = (2 * a + 4 * b - d + 34) % 7;
    const month = Math.floor((d + e + 114) / 31);
    const dd = ((d + e + 114) % 31) + 1;
    return day(year, month, dd + 13);
};

const holidaysFor = (year: number): Set<string> => {
    const taken = new Set<string>();
    const easter = orthodoxEaster(year);
    [-2, -1, 0, 1].forEach(n => taken.add(ymd(plus(easter, n))));
    const fixed = [[1, 1], [3, 3], [5, 1], [5, 6], [5, 24], [9, 6], [9, 22]].map(([m, d]) => day(year, m, d));
    const christmas = [24, 25, 26].map(d => day(year, 12, d));
    [...fixed, ...christmas].forEach(d => taken.add(ymd(d)));
    const nextFree = (from: Date) => { let d = from; while (weekend(d) || taken.has(ymd(d))) d = plus(d, 1); return d; };
    fixed.forEach(d => { if (weekend(d)) taken.add(ymd(nextFree(plus(d, 1)))); });
    let from = day(year, 12, 27);
    christmas.filter(weekend).forEach(() => { const d = nextFree(from); taken.add(ymd(d)); from = plus(d, 1); });
    return taken;
};

// ─────────────────────────────────────────────────────────────────────────────

const csvCell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (header: string[], rows: unknown[][]) =>
    [header, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

const toMinutes = (v: unknown): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
    if (!m || Number(m[2]) > 59 || Number(m[1]) > 47) return null;
    return Number(m[1]) * 60 + Number(m[2]);
};
const gtfsTime = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

/** Today's date in Bulgaria, whatever the server's clock zone. */
const todayInSofia = () => {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date()).split("-").map(Number);
    return day(y, m, d);
};

export async function buildGtfs(): Promise<{ files: Record<string, string>; report: GtfsReport }> {
    const db = admin.firestore();
    const [stopsSnap, servicesSnap, ttSnap] = await Promise.all([
        db.collection("stops").get(),
        db.collection("services").get(),
        db.collection("timetables").get(),
    ]);

    const problems: Problem[] = [];
    const err = (message: string) => problems.push({ level: "error", message });
    const warn = (message: string) => problems.push({ level: "warning", message });

    // ── Feed period: a year from today ───────────────────────────────────────
    const start = todayInSofia();
    const end = plus(start, 364);
    const holidays = new Set<string>([...holidaysFor(start.getUTCFullYear()), ...holidaysFor(end.getUTCFullYear())]);

    // ── Inputs ───────────────────────────────────────────────────────────────
    const stops = new Map(stopsSnap.docs.map(d => [d.id, d.data() as Data]));
    const services = new Map(servicesSnap.docs.map(d => [d.id, d.data() as Data]));
    const served: GtfsReport["served"] = [];
    // A line driven by another (Градина on the Бъркач bus) is not a route of
    // its own: publishing it would put the same bus in the file twice.
    const routes = ttSnap.docs
        .map(d => ({ id: d.id, data: d.data() as Data }))
        .filter(r => {
            const by = Array.isArray(r.data.servedBy) ? (r.data.servedBy as unknown[]).map(String) : [];
            if (by.length) served.push({ name: String(r.data.name || r.id), by });
            return !by.length;
        })
        .sort((x, y) => String(x.data.name || x.id).localeCompare(String(y.data.name || y.id), "bg"));
    const timetables = new Map(ttSnap.docs.map(d => [d.id, d.data() as Data]));

    const hasPoint = (s: Data | undefined) => !!s && typeof s.lat === "number" && typeof s.lng === "number";
    const stopName = (id: string) => String(stops.get(id)?.name || id);

    const routeRows: unknown[][] = [];
    const tripRows: unknown[][] = [];
    const stopTimeRows: unknown[][] = [];
    const usedStops = new Set<string>();
    const usedServices = new Set<string>();
    const fareRows: unknown[][] = [];
    const fareRuleRows: unknown[][] = [];
    const unplacedWarned = new Set<string>();
    let latestUpdate = "";

    for (const route of routes) {
        const name = String(route.data.name || route.id);
        const tt = timetables.get(route.id);
        const dirs = Array.isArray(tt?.directions) ? tt!.directions as Data[] : [];
        if (tt?.updatedAt && String(tt.updatedAt) > latestUpdate) latestUpdate = String(tt.updatedAt);

        let routeTrips = 0;
        for (const dir of dirs) {
            const dirId = dir.id === "B" ? 1 : 0;
            const stopIds = Array.isArray(dir.stopIds) ? (dir.stopIds as unknown[]).map(String) : [];
            const trips = Array.isArray(dir.trips) ? dir.trips as Data[] : [];
            if (stopIds.length < 2) {
                if (trips.length) err(`${name}: посока ${dirId ? "„Връщане“" : "„Отиване“"} има курсове, но по-малко от две спирки.`);
                continue;
            }
            stopIds.forEach(id => {
                if (!stops.has(id)) err(`${name}: в разписанието има изтрита спирка.`);
                else if (!hasPoint(stops.get(id)) && !unplacedWarned.has(id)) {
                    unplacedWarned.add(id);
                    err(`Спирка „${stopName(id)}“ не е посочена на картата — курсовете минават без нея.`);
                }
            });

            // Counted per line and direction rather than named run by run: a line
            // just carried over from the website has dozens of runs with only a
            // departure time, and one line of report says it better than forty.
            const skipped = { noService: 0, backwards: 0, tooFew: 0 };
            const dirLabel = `${name}, ${dirId ? "връщане" : "отиване"}`;
            trips.forEach((trip, n) => {
                const serviceId = String(trip.serviceId || "");
                if (!services.has(serviceId)) { skipped.noService++; return; }
                const times = Array.isArray(trip.times) ? trip.times as unknown[] : [];
                const calls: Array<{ stopId: string; minutes: number }> = [];
                let backwards = false;
                stopIds.forEach((stopId, i) => {
                    const m = toMinutes(times[i]);
                    if (m === null || !hasPoint(stops.get(stopId))) return;
                    if (calls.length && m < calls[calls.length - 1].minutes) backwards = true;
                    calls.push({ stopId, minutes: m });
                });
                if (backwards) { skipped.backwards++; return; }
                if (calls.length < 2) { skipped.tooFew++; return; }

                const tripId = `${route.id}_${dirId}_${String(trip.id || n)}`;
                tripRows.push([route.id, serviceId, tripId, stopName(calls[calls.length - 1].stopId), dirId]);
                calls.forEach((c, seq) => {
                    usedStops.add(c.stopId);
                    stopTimeRows.push([tripId, gtfsTime(c.minutes), gtfsTime(c.minutes), c.stopId, seq + 1]);
                });
                usedServices.add(serviceId);
                routeTrips++;
            });
            if (skipped.noService) err(`${dirLabel}: ${skipped.noService} курса без избрани дни на движение — пропуснати.`);
            if (skipped.backwards) err(`${dirLabel}: ${skipped.backwards} курса с часове, които вървят назад — пропуснати.`);
            if (skipped.tooFew) err(`${dirLabel}: ${skipped.tooFew} от ${trips.length} курса нямат час поне на две спирки с точка на картата (обикновено липсва часът на крайната спирка) — пропуснати.`);
        }

        if (!routeTrips) { warn(`${name}: няма разписание — линията не е включена.`); continue; }
        routeRows.push([route.id, AGENCY.id, "", name, 3]);
        const fare = route.data.fare;
        if (typeof fare === "number" && fare > 0) {
            const fareId = `F_${route.id}`;
            fareRows.push([fareId, fare.toFixed(2), "EUR", 0, 0, AGENCY.id]);
            fareRuleRows.push([fareId, route.id]);
        }
    }

    // ── Days of operation ────────────────────────────────────────────────────
    const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const calendarRows: unknown[][] = [];
    const calendarDateRows: unknown[][] = [];
    for (const id of usedServices) {
        const s = services.get(id)!;
        const days = Array.isArray(s.days) ? (s.days as unknown[]).map(x => x === true) : [];
        calendarRows.push([id, ...DAYS.map((_, i) => (days[i] ? 1 : 0)), ymd(start), ymd(end)]);
        const rule = String(s.holidays || "normal");
        if (rule === "normal") continue;
        for (let d = start; d <= end; d = plus(d, 1)) {
            if (!holidays.has(ymd(d))) continue;
            const inPattern = days[(d.getUTCDay() + 6) % 7] === true;
            if (rule === "skip" && inPattern) calendarDateRows.push([id, ymd(d), 2]);
            if (rule === "run" && !inPattern) calendarDateRows.push([id, ymd(d), 1]);
        }
    }

    const stopRows = [...usedStops].map(id => {
        const s = stops.get(id)!;
        return [id, String(s.code || ""), String(s.name || ""), (s.lat as number).toFixed(6), (s.lng as number).toFixed(6)];
    });

    if (!tripRows.length) err("Няма нито един курс, готов за публикуване.");

    const files: Record<string, string> = {
        "agency.txt": csv(
            ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang", "agency_phone", "agency_email"],
            [[AGENCY.id, AGENCY.name, AGENCY.url, TIMEZONE, "bg", AGENCY.phone, AGENCY.email]]
        ),
        "stops.txt": csv(["stop_id", "stop_code", "stop_name", "stop_lat", "stop_lon"], stopRows),
        "routes.txt": csv(["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"], routeRows),
        "trips.txt": csv(["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"], tripRows),
        "stop_times.txt": csv(["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"], stopTimeRows),
        "calendar.txt": csv(["service_id", ...DAYS, "start_date", "end_date"], calendarRows),
        "feed_info.txt": csv(
            ["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_start_date", "feed_end_date", "feed_version", "feed_contact_email"],
            [[AGENCY.name, AGENCY.url, "bg", ymd(start), ymd(end), latestUpdate || new Date().toISOString(), AGENCY.email]]
        ),
    };
    if (calendarDateRows.length) files["calendar_dates.txt"] = csv(["service_id", "date", "exception_type"], calendarDateRows);
    if (fareRows.length) {
        files["fare_attributes.txt"] = csv(["fare_id", "price", "currency_type", "payment_method", "transfers", "agency_id"], fareRows);
        files["fare_rules.txt"] = csv(["fare_id", "route_id"], fareRuleRows);
    }

    return {
        files,
        report: {
            feed: AGENCY.id,
            generatedAt: new Date().toISOString(),
            feedStart: ymd(start),
            feedEnd: ymd(end),
            counts: {
                routes: routeRows.length, stops: stopRows.length, trips: tripRows.length,
                stopTimes: stopTimeRows.length, services: calendarRows.length,
            },
            problems,
            served,
        },
    };
}

export const zipGtfs = (files: Record<string, string>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([name, body]) => [name, strToU8(body)])), { level: 6 });
