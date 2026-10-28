import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Check, ChevronDown, ChevronUp, Crosshair, RefreshCw, X } from 'lucide-react';
import app, { db } from '../../firebase';
import { hasPoint, type Stop } from '../../utils/timetable';
import StopMap from './StopMap';

/**
 * Спирките от качванията.
 *
 * Терминалите пазят мястото на всяко качване — прочетена карта или продаден
 * билет — а функцията `locateStopsNow` ги събира на групи и намира спирките
 * (functions/src/stopLocator.ts). Сигурните спирки без точка ги поставя сама;
 * тук остават само тези, за които трябва човек: малко качвания, разпилени, в
 * селото има няколко места, или вече поставена спирка е далеч от качванията.
 *
 * Пресмятането се пуска само, когато таблото се отвори и от последното са
 * минали 12 часа, и с бутона.
 */

interface Suggestion {
    stopId: string;
    stopName: string;
    lat: number;
    lng: number;
    count: number;
    days: number;
    spread: number;
    cards: number;
    tickets: number;
    settlement: string;
    reasons: string[];
    others: Array<{ lat: number; lng: number; count: number }>;
    status: 'applied' | 'review' | 'conflict' | 'ok' | 'accepted' | 'rejected';
}

interface Summary {
    runAt?: string;
    boardings?: number;
    groups?: number;
    applied?: number;
    review?: number;
    conflicts?: number;
    unmatched?: Array<{ lat: number; lng: number; count: number; settlement: string }>;
}

const RERUN_AFTER_MS = 12 * 60 * 60 * 1000;

const plainBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.45rem 0.9rem', borderRadius: '9px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)',
    color: '#fff', fontSize: '0.82rem', fontWeight: 700,
};
const okBtn: React.CSSProperties = {
    ...plainBtn, background: 'rgba(0,200,83,0.12)', border: '1px solid rgba(0,200,83,0.35)', color: '#00c853',
};
const noBtn: React.CSSProperties = {
    ...plainBtn, background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', color: '#ff5252',
};

const fmtWhen = (iso?: string) => iso
    ? new Date(iso).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'никога';

const StopSuggestions: React.FC<{ stops: Stop[]; who: string }> = ({ stops, who }) => {
    const [items, setItems] = useState<Suggestion[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const [open, setOpen] = useState<string | null>(null);
    const [showUnmatched, setShowUnmatched] = useState(false);
    const autoRan = useRef(false);

    useEffect(() => {
        const a = onSnapshot(collection(db, 'stop_suggestions'),
            snap => setItems(snap.docs.map(d => d.data() as Suggestion)),
            err => console.error('Предложенията за спирки не се заредиха:', err));
        const b = onSnapshot(doc(db, 'settings', 'stop_locator'),
            snap => { setSummary(snap.exists() ? snap.data() as Summary : null); setLoaded(true); },
            err => { console.error(err); setLoaded(true); });
        return () => { a(); b(); };
    }, []);

    const run = async () => {
        setRunning(true);
        setError('');
        try {
            await httpsCallable(getFunctions(app), 'locateStopsNow', { timeout: 320_000 })({});
        } catch (e) {
            setError((e as { message?: string }).message || 'Пресмятането не успя.');
        } finally {
            setRunning(false);
        }
    };

    useEffect(() => {
        if (!loaded || autoRan.current) return;
        autoRan.current = true;
        const last = summary?.runAt ? Date.parse(summary.runAt) : 0;
        if (Date.now() - last > RERUN_AFTER_MS) void run();
        // Once per opening of the tab, after the last run is known.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded]);

    const byId = useMemo(() => new Map(stops.map(s => [s.id, s])), [stops]);
    const pending = items.filter(i => i.status === 'review' || i.status === 'conflict')
        .sort((a, b) => b.count - a.count);
    const applied = items.filter(i => i.status === 'applied' || i.status === 'accepted');

    const accept = async (s: Suggestion) => {
        setError('');
        try {
            const batch = writeBatch(db);
            batch.update(doc(db, 'stops', s.stopId), {
                lat: s.lat, lng: s.lng, locatedBy: 'boardings', locatedAt: new Date().toISOString(),
            });
            batch.update(doc(db, 'stop_suggestions', s.stopId), {
                status: 'accepted', decidedAt: new Date().toISOString(), decidedBy: who,
            });
            await batch.commit();
        } catch (e) {
            setError((e as { message?: string }).message || 'Не се записа.');
        }
    };

    const reject = async (s: Suggestion) => {
        setError('');
        try {
            await updateDoc(doc(db, 'stop_suggestions', s.stopId), {
                status: 'rejected', decidedAt: new Date().toISOString(), decidedBy: who,
            });
        } catch (e) {
            setError((e as { message?: string }).message || 'Не се записа.');
        }
    };

    const muted: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55 };

    return (
        <div style={{
            margin: '1rem 0', padding: '1rem 1.1rem', borderRadius: '14px',
            background: 'rgba(0,173,181,0.06)', border: '1px solid rgba(0,173,181,0.25)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                <Crosshair size={18} color="var(--primary-color)" />
                <strong style={{ flex: 1, minWidth: '200px' }}>Спирки от качванията</strong>
                <button onClick={run} disabled={running} style={{ ...plainBtn, opacity: running ? 0.6 : 1 }}>
                    <RefreshCw size={14} /> {running ? 'Пресмятам…' : 'Пресметни сега'}
                </button>
            </div>
            <div style={{ ...muted, marginTop: '0.4rem' }}>
                Където терминалите четат карти и продават билети, там е спирката. Сигурните спирки
                без точка се поставят сами; тук остават тези, които искат поглед.
                {summary?.runAt && <> Последно: {fmtWhen(summary.runAt)} · {summary.boardings || 0} качвания с GPS · {summary.groups || 0} места.</>}
                {summary && !summary.boardings && <> Качванията идват само от терминали с новото APK (1.4.5).</>}
            </div>
            {error && <div style={{ ...muted, color: '#ff5252', marginTop: '0.4rem' }}>{error}</div>}

            {applied.length > 0 && (
                <div style={{ ...muted, marginTop: '0.6rem' }}>
                    <span style={{ color: '#00c853', fontWeight: 800 }}>Поставени от качванията ({applied.length}):</span>{' '}
                    {applied.map(a => a.stopName).join(', ')}
                </div>
            )}

            {pending.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.8rem' }}>
                    {pending.map(s => {
                        const stop = byId.get(s.stopId);
                        const conflict = s.status === 'conflict';
                        return (
                            <div key={s.stopId} style={{
                                padding: '0.65rem 0.85rem', borderRadius: '11px', background: 'rgba(0,0,0,0.22)',
                                border: `1px solid ${conflict ? 'rgba(255,82,82,0.35)' : 'rgba(255,171,0,0.3)'}`,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: '200px' }}>
                                        <div style={{ fontWeight: 800 }}>
                                            {s.stopName}
                                            <span style={{ fontWeight: 600, fontSize: '0.75rem', color: conflict ? '#ff5252' : '#ffab00' }}>
                                                {conflict ? ' · далеч от качванията' : ' · за преглед'}
                                            </span>
                                        </div>
                                        <div style={muted}>
                                            {s.count} качвания ({s.cards} карти, {s.tickets} билета) · {s.days} {s.days === 1 ? 'ден' : 'дни'} · ±{s.spread} м
                                            {s.reasons.length > 0 && <> · {s.reasons.join(' · ')}</>}
                                        </div>
                                    </div>
                                    <button onClick={() => setOpen(open === s.stopId ? null : s.stopId)} style={plainBtn}>
                                        {open === s.stopId ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Карта
                                    </button>
                                    <button onClick={() => accept(s)} style={okBtn}>
                                        <Check size={14} /> {conflict ? 'Премести тук' : 'Приеми'}
                                    </button>
                                    <button onClick={() => reject(s)} style={noBtn}><X size={14} /> Отхвърли</button>
                                </div>
                                {open === s.stopId && (
                                    <div style={{ marginTop: '0.6rem' }}>
                                        <StopMap
                                            value={{ lat: s.lat, lng: s.lng }}
                                            onChange={() => { /* само за гледане — за точно място „Промени“ на спирката */ }}
                                            others={[
                                                ...(stop && hasPoint(stop) ? [{ lat: stop.lat!, lng: stop.lng!, name: `${stop.name} — сегашното място` }] : []),
                                                ...s.others.map(o => ({ lat: o.lat, lng: o.lng, name: `Друго място в селото — ${o.count} качвания` })),
                                            ]}
                                            height={280}
                                        />
                                        <div style={{ ...muted, marginTop: '0.35rem' }}>
                                            Синият знак е мястото на качванията. Жълтите точки са {conflict ? 'сегашното място на спирката и ' : ''}други места в селото, където също се качват.
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {(summary?.unmatched?.length || 0) > 0 && (
                <div style={{ marginTop: '0.7rem' }}>
                    <button onClick={() => setShowUnmatched(v => !v)} style={{ ...plainBtn, background: 'transparent', border: 'none', padding: 0, color: 'var(--text-secondary)' }}>
                        {showUnmatched ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Места с качвания без спирка ({summary!.unmatched!.length})
                    </button>
                    {showUnmatched && (
                        <div style={{ ...muted, marginTop: '0.35rem' }}>
                            Тук се качват хора, но селото не съвпада с нито една спирка — може да липсва
                            спирка или името ѝ да е различно от това на картата.
                            {summary!.unmatched!.map(u => (
                                <div key={`${u.lat},${u.lng}`}>
                                    {u.settlement || 'извън село'} · {u.count} качвания ·{' '}
                                    <a href={`https://www.openstreetmap.org/?mlat=${u.lat}&mlon=${u.lng}#map=17/${u.lat}/${u.lng}`}
                                        target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)' }}>
                                        {u.lat.toFixed(5)}, {u.lng.toFixed(5)}
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default StopSuggestions;
