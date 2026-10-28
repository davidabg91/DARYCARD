import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { getHoliday } from './holidays';

/**
 * Stops, the days a bus runs, and the times it runs at.
 *
 * A line used to be a name, a list of stop names and a price table — enough to
 * sell a subscription on it. Наредба Н-7 asks every operator to publish its
 * timetable to the Национална точка за достъп, as GTFS or NeTEx, and a GTFS
 * timetable needs three things a line never had: each stop as a point on the
 * map, the days each run operates, and the time it reaches every stop.
 *
 * In DARY a line is only a name (the key of ROUTE_METADATA and SCHEDULES), so
 * the timetable carries the line's name and single-ticket fare with it — that
 * is what the GTFS feed reads, and nothing here touches cards or payments.
 *
 *   stops/{id}        a stop: its name and where it is
 *   services/{id}     a pattern of days: „Делник“, „Събота“, „Неделя“, „Празник“
 *   timetables/{id}   one per line, keyed by routeSlug(line name)
 *
 * Everything here is published information — it hangs at the stop — so it is
 * readable without signing in, like the fares.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Stops
// ─────────────────────────────────────────────────────────────────────────────

export interface Stop {
    id: string;
    name: string;
    /** Null until somebody has put it on the map. */
    lat: number | null;
    lng: number | null;
    /** The number painted on the stop sign, where there is one. */
    code?: string;
    /** 'boardings' when the place came from where passengers got on (stopLocator). */
    locatedBy?: string;
}

export const hasPoint = (s: Stop | undefined) =>
    !!s && typeof s.lat === 'number' && typeof s.lng === 'number';

/** For matching a typed name to a stop: case, spacing and „гр.“ do not count. */
export const normalizeStopName = (name: string) =>
    name.toLowerCase()
        .replace(/^(гр\.|с\.|град|село)\s*/u, '')
        .replace(/[„“"'.]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

// ─────────────────────────────────────────────────────────────────────────────
// Days of operation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a run does on an official holiday.
 *   skip   — it does not run (a weekday bus on 3 March)
 *   run    — it runs, whatever day of the week it is (the Sunday bus)
 *   normal — the holiday makes no difference
 */
export type HolidayRule = 'skip' | 'run' | 'normal';

export interface Service {
    id: string;
    name: string;
    /** Monday first, as the week is read in Bulgaria. */
    days: boolean[];
    holidays: HolidayRule;
    order?: number;
}

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

export const HOLIDAY_RULES: Array<{ id: HolidayRule; label: string }> = [
    { id: 'skip', label: 'Не се движи на празник' },
    { id: 'run', label: 'Движи се и на празник' },
    { id: 'normal', label: 'Празниците нямат значение' },
];

/**
 * DARY's four, matching the four columns of the schedules on the website. A
 * holiday has its own pattern because some lines (the Каменец line) publish a
 * holiday timetable different from Sunday's; the import puts Sunday's runs
 * under „Празник“ too wherever a line has none of its own, as the site does.
 * Fixed ids, so the import can be run again without making copies.
 */
export const STANDARD_SERVICES: Service[] = [
    { id: 'weekday', name: 'Делник', days: [true, true, true, true, true, false, false], holidays: 'skip', order: 0 },
    { id: 'saturday', name: 'Събота', days: [false, false, false, false, false, true, false], holidays: 'skip', order: 1 },
    { id: 'sunday', name: 'Неделя', days: [false, false, false, false, false, false, true], holidays: 'skip', order: 2 },
    { id: 'holiday', name: 'Празник', days: [false, false, false, false, false, false, false], holidays: 'run', order: 3 },
];

export const describeDays = (s: Pick<Service, 'days' | 'holidays'>) => {
    const on = WEEKDAYS.filter((_, i) => s.days[i]);
    if (!on.length && s.holidays === 'run') return 'само на официален празник';
    const days = on.length === 7 ? 'всеки ден'
        : on.length === 5 && s.days.slice(0, 5).every(Boolean) ? 'Пн – Пт'
        : on.length ? on.join(', ') : 'нито един ден';
    const holiday = s.holidays === 'skip' ? ', без празници'
        : s.holidays === 'run' ? ', и на празник' : '';
    return days + holiday;
};

/** Does a run on this pattern of days operate on the given date? */
export const runsOn = (s: Pick<Service, 'days' | 'holidays'>, date: Date) => {
    if (s.holidays !== 'normal' && getHoliday(date)) return s.holidays === 'run';
    // getDay() counts from Sunday; the pattern counts from Monday.
    return s.days[(date.getDay() + 6) % 7] === true;
};

// ─────────────────────────────────────────────────────────────────────────────
// Timetables
// ─────────────────────────────────────────────────────────────────────────────

export interface Trip {
    id: string;
    serviceId: string;
    /**
     * One entry per stop of the direction, in the same order. Empty where the
     * run passes without stopping. "HH:MM"; after midnight the hours run on
     * past 24, as GTFS writes them, so a run that leaves at 23:50 arrives at
     * 24:20 and not before it set off.
     */
    times: string[];
}

export interface Direction {
    /** A is the line as it is named; B is the way back. */
    id: 'A' | 'B';
    stopIds: string[];
    trips: Trip[];
}

export interface Timetable {
    /** routeSlug(name) — the timetable is stored under the same id. */
    routeId: string;
    /** The line's name, as in ROUTE_METADATA and on the cards. */
    name: string;
    /** Single-ticket price in euro, for the feed's fares. Null when the line has none. */
    fare: number | null;
    /**
     * Lines that are a stop on another line's runs (Градина on the Бъркач bus)
     * carry no runs of their own: the runs are entered on the line that drives
     * them, and the feed publishes them once. The names of those lines.
     */
    servedBy: string[];
    /** What the import could not carry over and somebody has to check. */
    notes: string[];
    directions: Direction[];
    updatedAt?: string;
    updatedBy?: string;
}

export const emptyTimetable = (routeId: string, name: string, stopIds: string[] = []): Timetable => ({
    routeId,
    name,
    fare: null,
    servedBy: [],
    notes: [],
    directions: [
        { id: 'A', stopIds, trips: [] },
        { id: 'B', stopIds: [...stopIds].reverse(), trips: [] },
    ],
});

export const newTripId = () => Math.random().toString(36).slice(2, 10);

/** "06:30" → 390. Null for an empty or unreadable time. */
export const toMinutes = (value: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (min > 59 || h > 47) return null;
    return h * 60 + min;
};

export const fromMinutes = (total: number) => {
    const t = Math.max(0, Math.round(total));
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Reads a time the way people type it: „630“, „6.30“, „6:30“, „06,30“ and
 * „6ч30“ all mean 06:30. Returns the input unchanged when it means nothing, so
 * the cell keeps what was typed and is marked rather than silently emptied.
 */
export const normalizeTime = (raw: string): string => {
    const v = raw.trim();
    if (!v) return '';
    const m = /^(\d{1,2})\s*[:.,чh]\s*(\d{1,2})$/i.exec(v)
        || /^(\d{1,2})(\d{2})$/.exec(v)
        || /^(\d{1,2})()$/.exec(v);
    if (!m) return v;
    const h = Number(m[1]);
    const min = Number(m[2] || 0);
    if (h > 47 || min > 59) return v;
    return fromMinutes(h * 60 + min);
};

/** Moves every time of a run by the given minutes — for „the same run, half an hour later“. */
export const shiftTimes = (times: string[], minutes: number) =>
    times.map(t => {
        const m = toMinutes(t);
        return m === null ? t : fromMinutes(m + minutes);
    });

export interface TripProblem {
    tripId: string;
    /** The stop's position in the direction, when the problem is one cell. */
    index?: number;
    message: string;
}

/**
 * What would stop a run from being published, run by run.
 *
 * GTFS needs a time at the first and the last stop of every run, and the times
 * may not go backwards — a run that reaches the third stop before the second
 * has a mistyped time in it, and the national access point refuses the file.
 */
export const checkDirection = (dir: Direction, services: Service[]): TripProblem[] => {
    const problems: TripProblem[] = [];
    const known = new Set(services.map(s => s.id));
    dir.trips.forEach((trip, n) => {
        const label = `Курс ${n + 1}`;
        if (!trip.serviceId || !known.has(trip.serviceId)) {
            problems.push({ tripId: trip.id, message: `${label}: не е избрано в кои дни се движи.` });
        }
        const filled = trip.times
            .map((t, i) => ({ i, t, m: toMinutes(t) }))
            .filter(x => x.t.trim() !== '');
        filled.filter(x => x.m === null).forEach(x => problems.push({
            tripId: trip.id, index: x.i, message: `${label}: „${x.t}“ не е час.`,
        }));
        if (dir.stopIds.length >= 2) {
            if (!trip.times[0]?.trim()) {
                problems.push({ tripId: trip.id, index: 0, message: `${label}: липсва час на първата спирка.` });
            }
            const last = dir.stopIds.length - 1;
            if (!trip.times[last]?.trim()) {
                problems.push({ tripId: trip.id, index: last, message: `${label}: липсва час на последната спирка.` });
            }
        }
        let prev: { i: number; m: number } | null = null;
        for (const x of filled) {
            if (x.m === null) continue;
            if (prev && x.m < prev.m) {
                problems.push({
                    tripId: trip.id, index: x.i,
                    message: `${label}: часът ${x.t} е по-ранен от предишната спирка.`,
                });
            }
            prev = { i: x.i, m: x.m };
        }
    });
    return problems;
};

// ─────────────────────────────────────────────────────────────────────────────
// Reading them
// ─────────────────────────────────────────────────────────────────────────────

export const useStops = () => {
    const [stops, setStops] = useState<Stop[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(
            query(collection(db, 'stops'), orderBy('name')),
            snap => {
                setStops(snap.docs.map(d => readStop(d.id, d.data())));
                setLoading(false);
            },
            err => { console.error('Stops unavailable:', err); setLoading(false); }
        );
        return () => unsub();
    }, []);

    return { stops, loading };
};

export const useServices = () => {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, 'services'),
            snap => {
                setServices(sortServices(snap.docs.map(d => readService(d.id, d.data()))));
                setLoading(false);
            },
            err => { console.error('Services unavailable:', err); setLoading(false); }
        );
        return () => unsub();
    }, []);

    return { services, loading };
};

export const readStop = (id: string, data: Record<string, unknown>): Stop => ({
    id,
    name: String(data.name || ''),
    lat: typeof data.lat === 'number' ? data.lat : null,
    lng: typeof data.lng === 'number' ? data.lng : null,
    code: data.code ? String(data.code) : undefined,
});

export const readService = (id: string, data: Record<string, unknown>): Service => {
    const days = Array.isArray(data.days) ? data.days.map(Boolean) : [];
    return {
        id,
        name: String(data.name || ''),
        days: Array.from({ length: 7 }, (_, i) => days[i] === true),
        holidays: (['skip', 'run', 'normal'].includes(data.holidays as string) ? data.holidays : 'normal') as HolidayRule,
        order: typeof data.order === 'number' ? data.order : 99,
    };
};

export const sortServices = (list: Service[]) =>
    [...list].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));

export const readTimetable = (routeId: string, data: Record<string, unknown>): Timetable => {
    const dirs = Array.isArray(data.directions) ? data.directions as Array<Record<string, unknown>> : [];
    const read = (id: 'A' | 'B'): Direction => {
        const d = dirs.find(x => x.id === id) || {};
        const stopIds = Array.isArray(d.stopIds) ? (d.stopIds as unknown[]).map(String) : [];
        const trips = Array.isArray(d.trips) ? (d.trips as Array<Record<string, unknown>>).map(t => {
            const times = Array.isArray(t.times) ? (t.times as unknown[]).map(x => String(x ?? '')) : [];
            return {
                id: String(t.id || newTripId()),
                serviceId: String(t.serviceId || ''),
                // Kept the same length as the stops, whatever was stored.
                times: stopIds.map((_, i) => times[i] || ''),
            };
        }) : [];
        return { id, stopIds, trips };
    };
    return {
        routeId,
        name: String(data.name || routeId),
        fare: typeof data.fare === 'number' ? data.fare : null,
        servedBy: Array.isArray(data.servedBy) ? (data.servedBy as unknown[]).map(String) : [],
        notes: Array.isArray(data.notes) ? (data.notes as unknown[]).map(String) : [],
        directions: [read('A'), read('B')],
        updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
        updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
    };
};

/** Every line's timetable at once — for the overview, which shows how far each one is. */
export const useTimetables = () => {
    const [timetables, setTimetables] = useState<Record<string, Timetable>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, 'timetables'),
            snap => {
                const out: Record<string, Timetable> = {};
                snap.docs.forEach(d => { out[d.id] = readTimetable(d.id, d.data()); });
                setTimetables(out);
                setLoading(false);
            },
            err => { console.error('Timetables unavailable:', err); setLoading(false); }
        );
        return () => unsub();
    }, []);

    return { timetables, loading };
};

/** The document a timetable is written to. */
export const timetableRef = (routeId: string) => doc(db, 'timetables', routeId);

// ─────────────────────────────────────────────────────────────────────────────
// Where the feeds are published
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `gtfs` Cloud Function. darycommerce.com is on GitHub Pages, which cannot
 * hand a path to a function, so the national access point is given the
 * function's own address. Fixed names — DARY is one company.
 */
export const GTFS_BASE = 'https://us-central1-darycard-6e8e7.cloudfunctions.net/gtfs';
export const GTFS_FEED_URL = `${GTFS_BASE}/darycard.zip`;
export const GTFS_REPORT_URL = `${GTFS_BASE}/darycard.json`;
export const GTFS_RT_URL = `${GTFS_BASE}/darycard-rt.pb`;
export const GTFS_RT_JSON_URL = `${GTFS_BASE}/darycard-rt.json`;
