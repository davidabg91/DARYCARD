import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Where the bus is, every thirty seconds.
 *
 * Наредба Н-7 asks every operator to publish each vehicle's position at least
 * every 30 seconds, and the arrival predictions that follow from it. The
 * terminal on the bus is already there, already awake and already online, so
 * it is the one that reports.
 *
 * It writes one small document of its own, `positions/{device}`: the latest
 * fix, and a short track of the last few minutes. The track is what lets the
 * server tell which run from the timetable this bus is driving — one point says
 * where a bus is, a few minutes of them say which way it is going, and two runs
 * that leave Плевен at the same minute part ways within a few hundred metres.
 *
 * Nobody on the bus does anything. The terminal never asks the driver which run
 * it is; the server works it out, and says "unknown" rather than guess while
 * two runs still look the same.
 *
 * Only on the terminal app itself. A browser at the desk is not a bus, and a
 * terminal's position is the company's business, not the passengers' — the
 * public gets the national feed built from it, not this document.
 *
 * DARY's terminals do not sign in, so the write is anonymous, like the device
 * heartbeat: the rules let it through only for a registered device and only with
 * these fields (firestore.rules → positions). Started and stopped by
 * startDeviceHeartbeat. Ported from TransitFlow, where it is a React hook.
 *
 * The whole day's path goes to `positions/{device}/days/{ГГГГ-ММ-ДД}` as well,
 * so the office can see in УСТРОЙСТВА where a bus has been and where it lost
 * its signal. The short track above is for the server; it forgets after ten
 * minutes. The day's path is written in batches, every two minutes, and a
 * batch that does not get through (no signal on the road) waits for the next
 * one — each point carries its own time, so arrayUnion lets a retried batch in
 * without doubling it.
 */

/** The ordinance's minimum. */
export const POSITION_MS = 30 * 1000;
/** How much history rides along: ten minutes at one point per report. */
const TRACK_POINTS = 20;
/** A fix older than this is not where the bus is now. */
const STALE_FIX_MS = 2 * 60 * 1000;
/** The day's path goes up every this many reports — two minutes. */
const DAY_FLUSH_EVERY = 4;
/**
 * A bus standing at the last stop for half an hour need not fill the day with
 * the same point: a new one is kept once it has moved this far, or this long
 * has passed.
 */
const DAY_MIN_MOVE_M = 25;
const DAY_MIN_GAP_MS = 5 * 60 * 1000;
/** What waits for a signal at most — about four hours of driving. */
const DAY_PENDING_MAX = 500;

type TrackPoint = [number, number, number]; // lat, lng, epoch ms

interface Fix {
    lat: number;
    lng: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    at: number;
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;

/** The calendar day in Bulgaria, which is the day the office means. */
export const sofiaDay = (ms: number): string =>
    new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Sofia' });

/** Metres between two points; plenty accurate over a few hundred metres. */
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const k = Math.PI / 180;
    const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
    const y = (b.lat - a.lat) * k;
    return Math.sqrt(x * x + y * y) * 6371000;
};

/** Пуска докладването. Връща функция за спиране. */
export const startPositionReport = (deviceId: string): (() => void) => {
    let stopped = false;
    let watchId: string | null = null;
    let last: Fix | null = null;
    let gps: { status: 'ok' | 'denied' | 'unavailable' | 'waiting'; detail: string } = { status: 'waiting', detail: '' };
    const track: TrackPoint[] = [];
    // The day's path, waiting to go up: "lat,lng,секунди" — a string, because
    // Firestore keeps no arrays of arrays and arrayUnion needs whole values.
    let pending: Array<{ day: string; point: string }> = [];
    let lastKept: Fix | null = null;
    let reports = 0;
    let flushing = false;

    const start = async () => {
        let Capacitor: typeof import('@capacitor/core').Capacitor;
        let Geolocation: typeof import('@capacitor/geolocation').Geolocation;
        try {
            ({ Capacitor } = await import('@capacitor/core'));
            if (!Capacitor.isNativePlatform()) return;
            ({ Geolocation } = await import('@capacitor/geolocation'));
        } catch (err) {
            console.warn('Location unavailable:', err);
            return;
        }

        try {
            const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
            if (perm.location !== 'granted') {
                gps = { status: 'denied', detail: 'Достъпът до местоположение е отказан на терминала.' };
            }
        } catch (err) {
            gps = { status: 'unavailable', detail: String((err as Error)?.message || err).slice(0, 200) };
        }
        if (stopped) return;

        try {
            watchId = await Geolocation.watchPosition(
                { enableHighAccuracy: true, timeout: 60_000, maximumAge: 15_000 },
                (pos, err) => {
                    if (err || !pos) {
                        gps = { status: 'unavailable', detail: String(err?.message || 'Няма GPS сигнал.').slice(0, 200) };
                        return;
                    }
                    last = {
                        lat: round(pos.coords.latitude),
                        lng: round(pos.coords.longitude),
                        accuracy: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null,
                        speed: typeof pos.coords.speed === 'number' ? Math.round(pos.coords.speed * 10) / 10 : null,
                        heading: typeof pos.coords.heading === 'number' ? Math.round(pos.coords.heading) : null,
                        at: pos.timestamp || Date.now(),
                    };
                    gps = { status: 'ok', detail: '' };
                }
            );
        } catch (err) {
            gps = { status: 'unavailable', detail: String((err as Error)?.message || err).slice(0, 200) };
        }
    };

    const keepForDay = (fix: Fix) => {
        if (lastKept && fix.at === lastKept.at) return;
        if (lastKept && fix.at - lastKept.at < DAY_MIN_GAP_MS && metres(lastKept, fix) < DAY_MIN_MOVE_M) return;
        lastKept = fix;
        pending.push({ day: sofiaDay(fix.at), point: `${fix.lat},${fix.lng},${Math.round(fix.at / 1000)}` });
        if (pending.length > DAY_PENDING_MAX) pending = pending.slice(-DAY_PENDING_MAX);
    };

    const flushDay = async () => {
        if (flushing || !pending.length) return;
        flushing = true;
        const batch = pending.slice();
        const days = [...new Set(batch.map(p => p.day))];
        try {
            for (const day of days) {
                await setDoc(doc(db, 'positions', deviceId, 'days', day), {
                    points: arrayUnion(...batch.filter(p => p.day === day).map(p => p.point)),
                    updatedAt: new Date().toISOString(),
                }, { merge: true });
            }
            pending = pending.slice(batch.length);
        } catch (err) {
            // No signal, or the day is full: the points wait for the next try.
            console.warn('Day path not sent:', err);
        } finally {
            flushing = false;
        }
    };

    const report = async () => {
        if (stopped) return;
        const fresh = last && Date.now() - last.at < STALE_FIX_MS ? last : null;
        if (fresh) {
            const prev = track[track.length - 1];
            if (!prev || prev[2] !== fresh.at) track.push([fresh.lat, fresh.lng, fresh.at]);
            while (track.length > TRACK_POINTS) track.shift();
            keepForDay(fresh);
        }
        if (++reports % DAY_FLUSH_EVERY === 0) void flushDay();
        try {
            // The track goes up as numbers in a flat list: Firestore holds no
            // arrays of arrays, and three numbers a point is all it needs.
            await setDoc(doc(db, 'positions', deviceId), {
                reportedAt: new Date().toISOString(),
                gps: gps.status,
                gpsDetail: gps.detail,
                ...(fresh ? {
                    lat: fresh.lat, lng: fresh.lng,
                    accuracy: fresh.accuracy, speed: fresh.speed, heading: fresh.heading,
                    fixAt: new Date(fresh.at).toISOString(),
                } : {}),
                track: track.flat(),
            }, { merge: true });
        } catch (err) {
            // Out of signal: the position is simply not sent, and the server
            // reads its age as the bus having gone quiet.
            console.warn('Position not sent:', err);
        }
    };

    start();
    const timer = setInterval(report, POSITION_MS);
    // The first report once there has been time for a first fix.
    const first = setTimeout(report, 8_000);

    // Whatever has not gone up yet goes when the app is put away.
    const onHidden = () => { if (document.visibilityState === 'hidden') void flushDay(); };
    document.addEventListener('visibilitychange', onHidden);

    return () => {
        stopped = true;
        document.removeEventListener('visibilitychange', onHidden);
        clearInterval(timer);
        clearTimeout(first);
        if (watchId) {
            import('@capacitor/geolocation')
                .then(({ Geolocation }) => Geolocation.clearWatch({ id: watchId! }))
                .catch(() => { /* gone with the app */ });
        }
    };
};
