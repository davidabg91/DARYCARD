/**
 * A terminal's day path, laid onto the roads.
 *
 * The GPS points are thirty seconds apart, and a straight line between two of
 * them cuts across fields and through blocks of flats. OSRM's map matching
 * (OpenStreetMap's road network, the same map the path is drawn on) finds the
 * road the bus drove between them. Where the terminal had no signal for a
 * while, the gap is filled with the quickest drive — for a bus, the main road —
 * from where it went quiet to where it came back.
 *
 * Matching, not routing through the points: tried on the real road Плевен →
 * Пордим with GPS noise, routing snapped stray points onto side streets and
 * drew 5–10 km of detours that never happened; matching kept within 15 m of
 * the road and the right length. The public server matches only ten points a
 * request, so points closer than 600 m to the last one kept are left out
 * first — matching was as good at 800 m apart — which also drops the jitter
 * of a bus standing at a stop.
 *
 * The public server asks for a request a second at most, so the path goes in
 * pieces, one after another, and each piece is remembered: a day already
 * drawn is not asked for again, and while today's path grows only its newest
 * piece is.
 *
 * Whatever OSRM cannot place stays the straight line it was.
 */

import type { PathPoint } from '../components/devices/DeviceMap';

export interface RoadLine {
    coords: Array<[number, number]>;
    /** drive — the bus was reporting; gap — no points, the route between is a guess. */
    kind: 'drive' | 'gap';
    /** False when OSRM could not place it and the line is straight. */
    matched: boolean;
    from: number;
    to: number;
}

const OSRM = 'https://router.project-osrm.org';
/** The public server's most for one match. */
const CHUNK = 10;
/** Closer than this to the last point kept, a point adds nothing to the match. */
const THIN_M = 600;
/** How far a GPS point may be from the road it was on. */
const RADIUS_M = 40;

const cache = new Map<string, Promise<Array<[number, number]> | null>>();
let queue: Promise<unknown> = Promise.resolve();

/** One request at a time, a second apart — the public server's rule. */
const politely = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    const pause = () => new Promise(r => setTimeout(r, 1000));
    queue = run.then(pause, pause);
    return run;
};

const metres = (a: PathPoint, b: PathPoint) => {
    const k = Math.PI / 180;
    const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
    const y = (b.lat - a.lat) * k;
    return Math.sqrt(x * x + y * y) * 6371000;
};

const thin = (run: PathPoint[]): PathPoint[] => {
    const kept: PathPoint[] = [];
    run.forEach((p, i) => {
        const last = kept[kept.length - 1];
        if (!last || metres(last, p) >= THIN_M || i === run.length - 1) kept.push(p);
    });
    return kept;
};

const straight = (pts: PathPoint[]): Array<[number, number]> => pts.map(p => [p.lat, p.lng]);
const toLatLng = (c: Array<[number, number]>) => c.map(([lng, lat]) => [lat, lng] as [number, number]);

/** The road these GPS points were driven along. */
const matchRoad = (pts: PathPoint[]) => {
    const key = `m:${pts[0].t}:${pts[pts.length - 1].t}:${pts.length}`;
    if (!cache.has(key)) {
        cache.set(key, politely(async () => {
            const coords = pts.map(p => `${p.lng},${p.lat}`).join(';');
            const radiuses = pts.map(() => RADIUS_M).join(';');
            const r = await fetch(`${OSRM}/match/v1/driving/${coords}?overview=full&geometries=geojson&gaps=ignore&radiuses=${radiuses}`);
            if (!r.ok) return null;
            const j = await r.json() as { code: string; matchings?: Array<{ geometry: { coordinates: Array<[number, number]> } }> };
            if (j.code !== 'Ok' || !j.matchings?.length) return null;
            return j.matchings.flatMap(m => toLatLng(m.geometry.coordinates));
        }).catch(() => null));
    }
    return cache.get(key)!;
};

/** The quickest drive between two points, for where there are none. */
const routeBetween = (a: PathPoint, b: PathPoint) => {
    const key = `r:${a.t}:${b.t}`;
    if (!cache.has(key)) {
        cache.set(key, politely(async () => {
            const r = await fetch(`${OSRM}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
            if (!r.ok) return null;
            const j = await r.json() as { code: string; routes?: Array<{ geometry: { coordinates: Array<[number, number]> } }> };
            if (j.code !== 'Ok' || !j.routes?.length) return null;
            return toLatLng(j.routes[0].geometry.coordinates);
        }).catch(() => null));
    }
    return cache.get(key)!;
};

/**
 * The path as road lines, in order. `onLine` gets each one as it is ready, so
 * the map fills in piece by piece instead of waiting for the whole day.
 * `cancelled` stops asking once the map is closed or the day changed.
 */
export const matchToRoads = async (
    path: PathPoint[],
    gapMs: number,
    onLine: (index: number, line: RoadLine) => void,
    cancelled: () => boolean,
): Promise<void> => {
    // Runs of steady reporting, split where the terminal went quiet.
    const raw: PathPoint[][] = [];
    path.forEach((p, i) => {
        if (i === 0 || p.t - path[i - 1].t > gapMs) raw.push([p]);
        else raw[raw.length - 1].push(p);
    });
    const runs = raw.map(thin);

    // The plan first, drawn straight — then each piece replaced as OSRM answers.
    const jobs: Array<{ line: RoadLine; ask: () => Promise<Array<[number, number]> | null> }> = [];
    runs.forEach((run, r) => {
        if (r > 0) {
            const a = runs[r - 1][runs[r - 1].length - 1], b = run[0];
            jobs.push({
                line: { coords: straight([a, b]), kind: 'gap', matched: false, from: a.t, to: b.t },
                ask: () => routeBetween(a, b),
            });
        }
        for (let i = 0; i < run.length - 1; i += CHUNK - 1) {
            const piece = run.slice(i, i + CHUNK);
            if (piece.length < 2) break;
            jobs.push({
                line: { coords: straight(piece), kind: 'drive', matched: false, from: piece[0].t, to: piece[piece.length - 1].t },
                ask: () => matchRoad(piece),
            });
        }
    });
    jobs.forEach((j, i) => onLine(i, j.line));

    // Newest first: today's path is usually looked at for where the bus is now.
    for (let i = jobs.length - 1; i >= 0; i--) {
        if (cancelled()) return;
        const coords = await jobs[i].ask();
        if (cancelled()) return;
        if (coords && coords.length > 1) onLine(i, { ...jobs[i].line, coords, matched: true });
    }
};
