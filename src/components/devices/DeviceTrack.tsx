import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { sofiaDay } from '../../utils/vehiclePosition';
import DeviceMap, { type MapMark, type PathPoint } from './DeviceMap';
import { matchToRoads, type RoadLine } from '../../utils/roadMatch';

/**
 * Откъде е минал един терминал за деня и къде е чел карти.
 *
 * Пътят е `positions/{id}/days/{ден}` — терминалът го качва на всеки две
 * минути. За днес към него се добавят и последните десет минути от живата
 * позиция, които още не са качени. Картите са `devices/{id}/seen/{ден}` и се
 * слагат на пътя по време: там, където е бил автобусът в минутата на четенето.
 * Карта, около която няма GPS точка, не се слага никъде — не се гадае.
 */

interface Props {
    deviceId: string;
    /** Живата следа от `positions/{id}.track`: lat, lng, ms, lat, lng, ms… (вече с верния час) */
    liveTrack?: number[];
    /** С колко да се поправи часът на терминала (сървър − терминал), виж DevicesPanel. */
    skewMs?: number;
}

/** Новите терминали пращат точката на самото сканиране; `unpaid` го пише сървърът. */
interface SeenScan { at: string; name?: string; cardNumber?: string; route?: string; lat?: number; lng?: number; unpaid?: boolean }

/** Над толкова без точка има дупка: терминалът пише поне на пет минути. */
const GAP_MS = 6.5 * 60 * 1000;
/** Карта се слага на пътя само ако има точка дотолкова близо във времето. */
const SCAN_NEAR_MS = 3 * 60 * 1000;

const hhmm = (t: number) => new Date(t).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });

const km = (a: PathPoint, b: PathPoint) => {
    const k = Math.PI / 180;
    const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k);
    const y = (b.lat - a.lat) * k;
    return Math.sqrt(x * x + y * y) * 6371;
};

const parsePoints = (raw: unknown): PathPoint[] =>
    (Array.isArray(raw) ? raw : []).map(s => {
        const [lat, lng, sec] = String(s).split(',').map(Number);
        return { lat, lng, t: sec * 1000 };
    }).filter(p => isFinite(p.lat) && isFinite(p.lng) && isFinite(p.t));

/** Къде е бил автобусът в даден миг — между двете съседни точки. */
const placeAt = (path: PathPoint[], t: number): { lat: number; lng: number } | null => {
    let i = path.findIndex(p => p.t >= t);
    if (i === -1) i = path.length;
    const before = path[i - 1], after = path[i];
    if (before && after && after.t - before.t <= GAP_MS && after.t > before.t) {
        const f = (t - before.t) / (after.t - before.t);
        return { lat: before.lat + (after.lat - before.lat) * f, lng: before.lng + (after.lng - before.lng) * f };
    }
    const near = [before, after].filter(Boolean)
        .sort((a, b) => Math.abs(a!.t - t) - Math.abs(b!.t - t))[0];
    return near && Math.abs(near.t - t) <= SCAN_NEAR_MS ? { lat: near.lat, lng: near.lng } : null;
};

const DeviceTrack: React.FC<Props> = ({ deviceId, liveTrack, skewMs = 0 }) => {
    const today = sofiaDay(Date.now());
    const [day, setDay] = useState(today);
    const [stored, setStored] = useState<PathPoint[]>([]);
    const [scansRaw, setScansRaw] = useState<SeenScan[]>([]);
    const [loading, setLoading] = useState(true);
    // По пътищата, освен ако някой не иска да види точките такива, каквито са.
    const [onRoads, setOnRoads] = useState(true);
    const [roads, setRoads] = useState<RoadLine[] | undefined>(undefined);
    const [matching, setMatching] = useState(false);

    useEffect(() => {
        let gone = false;
        setLoading(true);
        Promise.all([
            getDoc(doc(db, 'positions', deviceId, 'days', day)),
            // Дневният списък с карти е по ден в UTC; в часовете на автобусите
            // съвпада с българския.
            getDoc(doc(db, 'devices', deviceId, 'seen', day)),
        ]).then(([p, s]) => {
            if (gone) return;
            // И пътят, и картите са с часовника на терминала.
            setStored(parsePoints(p.exists() ? p.data().points : []).map(x => ({ ...x, t: x.t + skewMs })));
            setScansRaw((s.exists() ? ((s.data().scans as SeenScan[]) || []) : [])
                .map(x => ({ ...x, at: skewMs && x.at ? new Date(Date.parse(x.at) + skewMs).toISOString() : x.at })));
        }).catch(err => {
            console.error('Пътят на терминала не се зареди:', err);
            if (!gone) { setStored([]); setScansRaw([]); }
        }).finally(() => { if (!gone) setLoading(false); });
        return () => { gone = true; };
    }, [deviceId, day, skewMs]);

    const path = useMemo(() => {
        const all = [...stored];
        if (day === today && liveTrack) {
            for (let i = 0; i + 2 < liveTrack.length; i += 3) {
                all.push({ lat: liveTrack[i], lng: liveTrack[i + 1], t: liveTrack[i + 2] });
            }
        }
        const byTime = new Map<number, PathPoint>();
        all.filter(p => sofiaDay(p.t) === day).forEach(p => byTime.set(Math.round(p.t / 1000), p));
        return [...byTime.values()].sort((a, b) => a.t - b.t);
    }, [stored, liveTrack, day, today]);

    useEffect(() => {
        if (!onRoads || path.length < 2) { setRoads(undefined); return; }
        let gone = false;
        let lines: RoadLine[] = [];
        setMatching(true);
        void matchToRoads(path, GAP_MS, (i, line) => {
            lines = [...lines];
            lines[i] = line;
            if (!gone) setRoads(lines);
        }, () => gone).finally(() => { if (!gone) setMatching(false); });
        return () => { gone = true; };
    }, [path, onRoads]);

    const { gaps, distance } = useMemo(() => {
        const gaps: Array<[number, number]> = [];
        let distance = 0;
        path.forEach((p, i) => {
            const prev = path[i - 1];
            if (!prev) return;
            if (p.t - prev.t > GAP_MS) gaps.push([prev.t, p.t]);
            else distance += km(prev, p);
        });
        return { gaps, distance };
    }, [path]);

    const { marks, unplaced, scanCount } = useMemo(() => {
        const list = scansRaw.filter(s => s.at && sofiaDay(new Date(s.at).getTime()) === day);
        const marks: MapMark[] = [];
        let unplaced = 0;
        list.forEach(s => {
            const t = new Date(s.at).getTime();
            const at = typeof s.lat === 'number' && typeof s.lng === 'number' ? { lat: s.lat, lng: s.lng } : placeAt(path, t);
            if (!at) { unplaced++; return; }
            const card = String(s.cardNumber || '').replace(/^0+/, '');
            marks.push({
                ...at,
                label: `${hhmm(t)} · ${s.name || '—'}${card ? ` № ${card}` : ''}${s.route ? ` · ${s.route}` : ''}${s.unpaid ? ' · БЕЗ АБОНАМЕНТ' : ''}`,
                ...(s.unpaid ? { color: '#ff1744' } : {}),
            });
        });
        return { marks, unplaced, scanCount: list.length };
    }, [scansRaw, path, day]);

    const muted = { fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 } as const;

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                <input
                    type="date"
                    value={day}
                    max={today}
                    onChange={e => e.target.value && setDay(e.target.value)}
                    style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)', color: '#fff', colorScheme: 'dark' }}
                />
                {!loading && path.length > 0 && (
                    <span style={muted}>
                        {path.length} GPS точки · {hhmm(path[0].t)} – {hhmm(path[path.length - 1].t)} · {distance.toFixed(0)} км
                        {scanCount > 0 && ` · ${scanCount} карти${unplaced ? `, ${unplaced} без GPS точка наблизо` : ''}`}
                    </span>
                )}
            </div>

            {loading ? (
                <div style={muted}>Зареждам…</div>
            ) : path.length === 0 ? (
                <div style={muted}>
                    Няма GPS точки за този ден.
                    {scanCount > 0 && ` Терминалът е чел ${scanCount} карти, значи е работил — или GPS-ът е без сигнал, или достъпът до местоположение е отказан, или терминалът е със старо APK без GPS.`}
                </div>
            ) : (
                <>
                    <DeviceMap key={`${deviceId}-${day}`} path={path} roads={onRoads ? roads : undefined} gapMs={GAP_MS} scans={marks} />
                    <label style={{ ...muted, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.45rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={onRoads} onChange={e => setOnRoads(e.target.checked)} />
                        По пътищата
                        {onRoads && matching && ' · подреждам по пътищата…'}
                    </label>
                    <div style={{ ...muted, marginTop: '0.5rem' }}>
                        <span style={{ color: '#00ADB5', fontWeight: 800 }}>━</span> път ·{' '}
                        <span style={{ color: '#ff9800', fontWeight: 800 }}>┅</span> без GPS точки ·{' '}
                        <span style={{ color: '#ffd600', fontWeight: 800 }}>●</span> прочетена карта ·{' '}
                        <span style={{ color: '#00c853', fontWeight: 800 }}>●</span> начало ·{' '}
                        <span style={{ color: '#ff5252', fontWeight: 800 }}>●</span> последна точка
                    </div>
                    {gaps.length > 0 && (
                        <div style={{ ...muted, marginTop: '0.4rem' }}>
                            <b style={{ color: '#ff9800' }}>Без GPS точки:</b>{' '}
                            {gaps.map(([a, b]) => `${hhmm(a)}–${hhmm(b)} (${Math.round((b - a) / 60000)} мин)`).join(' · ')}
                            <div>Дупка значи, че терминалът е бил изключен, приложението е било затворено или GPS-ът не е хващал сигнал.</div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default DeviceTrack;
