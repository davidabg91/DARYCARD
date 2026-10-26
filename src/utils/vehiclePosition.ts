import { doc, setDoc } from 'firebase/firestore';
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
 */

/** The ordinance's minimum. */
export const POSITION_MS = 30 * 1000;
/** How much history rides along: ten minutes at one point per report. */
const TRACK_POINTS = 20;
/** A fix older than this is not where the bus is now. */
const STALE_FIX_MS = 2 * 60 * 1000;

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

/** Пуска докладването. Връща функция за спиране. */
export const startPositionReport = (deviceId: string): (() => void) => {
    let stopped = false;
    let watchId: string | null = null;
    let last: Fix | null = null;
    let gps: { status: 'ok' | 'denied' | 'unavailable' | 'waiting'; detail: string } = { status: 'waiting', detail: '' };
    const track: TrackPoint[] = [];

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

    const report = async () => {
        if (stopped) return;
        const fresh = last && Date.now() - last.at < STALE_FIX_MS ? last : null;
        if (fresh) {
            const prev = track[track.length - 1];
            if (!prev || prev[2] !== fresh.at) track.push([fresh.lat, fresh.lng, fresh.at]);
            while (track.length > TRACK_POINTS) track.shift();
        }
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

    return () => {
        stopped = true;
        clearInterval(timer);
        clearTimeout(first);
        if (watchId) {
            import('@capacitor/geolocation')
                .then(({ Geolocation }) => Geolocation.clearWatch({ id: watchId! }))
                .catch(() => { /* gone with the app */ });
        }
    };
};
