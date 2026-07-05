/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../data/routeMetadata';
import {
    ShieldCheck, MapPin, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight, CalendarDays, ClipboardCheck, Percent,
    FileText, Users, Bus, Navigation, AlertTriangle, Send, Loader2, UserCog,
} from 'lucide-react';

interface InspectionScan {
    id: string;
    inspectorId: string;
    inspectorName: string;
    clientId: string;
    clientName: string;
    clientCard?: string;
    route?: string;
    at: string;
    boardingScanAt?: string | null;
    lat?: number | null;
    lng?: number | null;
    accuracy?: number | null;
    address?: string | null;
    locationError?: boolean;
}

interface InspectorReport {
    id: string;
    inspectorId: string;
    inspectorName: string;
    at: string;
    description: string;
    checkedName: string;
    clientCount: number | null;
    driverName: string;
    busInfo: string;
    destination: string;
    hasProblem: boolean;
    problemDescription?: string;
}

// Load Leaflet (map) from CDN on demand — no npm dependency, app is online anyway.
let leafletPromise: Promise<void> | null = null;
const loadLeaflet = (): Promise<void> => {
    if ((window as any).L) return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise<void>((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);
        const s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Leaflet load failed'));
        document.body.appendChild(s);
    });
    return leafletPromise;
};

const fmt = (iso: string) => new Date(iso).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// A passenger counts as "scanned at boarding" if their card was scanned within
// 1 hour before the inspection.
const wasScannedAtBoarding = (s: InspectionScan) => {
    if (!s.boardingScanAt) return false;
    const diff = new Date(s.at).getTime() - new Date(s.boardingScanAt).getTime();
    return diff >= 0 && diff < 3600 * 1000;
};

export default function Inspections() {
    const { currentUser } = useAuth();
    const [scans, setScans] = useState<InspectionScan[]>([]);
    const [loading, setLoading] = useState(true);

    const isAdmin = currentUser?.role === 'admin';

    useEffect(() => {
        if (!currentUser) return;
        const col = collection(db, 'inspector_scans');
        // Inspectors may read only their own scans (per Firestore rules); admins read all.
        const q = isAdmin
            ? query(col, orderBy('at', 'desc'), limit(500))
            : query(col, where('inspectorId', '==', currentUser.id), orderBy('at', 'desc'), limit(500));
        const unsub = onSnapshot(q, snap => {
            setScans(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InspectionScan, 'id'>) })));
            setLoading(false);
        }, err => { console.error('Inspections load error:', err); setLoading(false); });
        return () => unsub();
    }, [currentUser, isAdmin]);

    const monthIso = new Date().toISOString().slice(0, 7);
    // Show inspections one day at a time (defaults to today).
    const [filterDay, setFilterDay] = useState(() => new Date().toISOString().slice(0, 10));
    const dayScans = useMemo(() => scans.filter(s => s.at?.startsWith(filterDay)), [scans, filterDay]);

    const countDay = dayScans.length;
    const countMonth = useMemo(() => scans.filter(s => s.at?.startsWith(monthIso)).length, [scans, monthIso]);
    const scannedOk = useMemo(() => dayScans.filter(wasScannedAtBoarding).length, [dayScans]);

    // ---- Inspector reports (free-form write-up per check) ----
    const [reports, setReports] = useState<InspectorReport[]>([]);
    const [reportsLoading, setReportsLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) return;
        const col = collection(db, 'inspector_reports');
        const q = isAdmin
            ? query(col, orderBy('at', 'desc'), limit(200))
            : query(col, where('inspectorId', '==', currentUser.id), orderBy('at', 'desc'), limit(200));
        const unsub = onSnapshot(q, snap => {
            setReports(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InspectorReport, 'id'>) })));
            setReportsLoading(false);
        }, err => { console.error('Inspector reports load error:', err); setReportsLoading(false); });
        return () => unsub();
    }, [currentUser, isAdmin]);

    const dayReports = useMemo(() => reports.filter(r => r.at?.startsWith(filterDay)), [reports, filterDay]);

    const [rDescription, setRDescription] = useState('');
    const [rChecked, setRChecked] = useState('');
    const [rClientCount, setRClientCount] = useState('');
    const [rDriver, setRDriver] = useState('');
    const [rBus, setRBus] = useState('');
    const [rDestination, setRDestination] = useState('');
    const [rHasProblem, setRHasProblem] = useState(false);
    const [rProblem, setRProblem] = useState('');
    const [rSubmitting, setRSubmitting] = useState(false);
    const [rError, setRError] = useState('');

    const submitReport = async (e: FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        if (!rChecked.trim() && !rDriver.trim() && !rDescription.trim()) {
            setRError('Попълни поне едно от полетата „Кой е проверен", „Шофьор" или описанието.');
            return;
        }
        setRSubmitting(true);
        setRError('');
        try {
            await addDoc(collection(db, 'inspector_reports'), {
                inspectorId: currentUser.id,
                inspectorName: currentUser.username,
                at: new Date().toISOString(),
                description: rDescription.trim(),
                checkedName: rChecked.trim(),
                clientCount: rClientCount.trim() === '' ? null : Number(rClientCount),
                driverName: rDriver.trim(),
                busInfo: rBus.trim(),
                destination: rDestination.trim(),
                hasProblem: rHasProblem,
                problemDescription: rHasProblem ? rProblem.trim() : '',
            });
            setRDescription(''); setRChecked(''); setRClientCount(''); setRDriver(''); setRBus(''); setRDestination('');
            setRHasProblem(false); setRProblem('');
        } catch (err) {
            console.error('Submit inspector report failed:', err);
            setRError('Грешка при запис. Опитай отново.');
        } finally {
            setRSubmitting(false);
        }
    };

    const shiftDay = (delta: number) => {
        const d = new Date(filterDay + 'T12:00:00');
        d.setDate(d.getDate() + delta);
        setFilterDay(d.toISOString().slice(0, 10));
    };

    // Per-inspector breakdown for the selected day (admin only).
    const byInspector = useMemo(() => {
        const map = new Map<string, { name: string; count: number }>();
        for (const s of dayScans) {
            const e = map.get(s.inspectorId) || { name: s.inspectorName, count: 0 };
            e.count++;
            map.set(s.inspectorId, e);
        }
        return [...map.values()].sort((a, b) => b.count - a.count);
    }, [dayScans]);

    // Map of inspection locations (admin only), rendered with Leaflet from CDN.
    const mapEl = useRef<HTMLDivElement>(null);
    const mapObj = useRef<any>(null);
    const markerLayer = useRef<any>(null);
    const pointsWithGps = useMemo(() => dayScans.filter(s => s.lat != null && s.lng != null), [dayScans]);

    useEffect(() => {
        if (!isAdmin) return;
        let cancelled = false;
        loadLeaflet().then(() => {
            if (cancelled || !mapEl.current) return;
            const L = (window as any).L;
            if (!mapObj.current) {
                mapObj.current = L.map(mapEl.current).setView([43.4, 24.6], 11); // Pleven region
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapObj.current);
                markerLayer.current = L.layerGroup().addTo(mapObj.current);
            }
            markerLayer.current.clearLayers();
            if (pointsWithGps.length === 0) { setTimeout(() => mapObj.current && mapObj.current.invalidateSize(), 150); return; }
            const bounds: [number, number][] = [];
            // Spread markers that share the exact same spot so none is hidden.
            const seen = new Map<string, number>();
            for (const s of pointsWithGps) {
                const rawLat = s.lat as number, rawLng = s.lng as number;
                const key = `${rawLat.toFixed(5)},${rawLng.toFixed(5)}`;
                const n = seen.get(key) || 0;
                seen.set(key, n + 1);
                let lat = rawLat, lng = rawLng;
                if (n > 0) {
                    const angle = n * 2.399963; // golden angle
                    const ring = Math.floor((n - 1) / 8) + 1;
                    const r = 0.00011 * ring; // ~12 m per ring
                    lat += r * Math.cos(angle);
                    lng += (r * Math.sin(angle)) / Math.cos(lat * Math.PI / 180);
                }
                const ok = wasScannedAtBoarding(s);
                const color = ok ? '#00e676' : '#ff5252';
                const m = L.circleMarker([lat, lng], { radius: 8, color, fillColor: color, fillOpacity: 0.8, weight: 2 });
                m.bindPopup(
                    `<b>${s.clientName || s.clientId}</b><br>${fmt(s.at)}<br>${s.route || ''}<br>Проверил: ${s.inspectorName}<br>${s.address || ''}<br><b style="color:${color}">${ok ? '✅ Сканиран при качване' : '❌ Не е сканиран'}</b>`
                );
                m.addTo(markerLayer.current);
                bounds.push([lat, lng]);
            }
            if (bounds.length > 1) mapObj.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
            else mapObj.current.setView(bounds[0], 15);
            setTimeout(() => mapObj.current && mapObj.current.invalidateSize(), 150);
        }).catch(err => console.error('Map load failed:', err));
        return () => { cancelled = true; };
    }, [isAdmin, pointsWithGps]);

    const isToday = filterDay >= new Date().toISOString().slice(0, 10);
    const scanPct = countDay > 0 ? Math.round((scannedOk / countDay) * 100) : 0;
    const dayLabel = new Date(filterDay + 'T12:00:00').toLocaleDateString('bg-BG', { weekday: 'short', day: '2-digit', month: 'short' });
    const num = { fontVariantNumeric: 'tabular-nums' as const };

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
            <style>{`
                .insp-card { transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
                .insp-card:hover { transform: translateY(-2px); border-color: rgba(0,173,181,0.4); box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
                .insp-row { transition: background .15s ease, border-color .15s ease; }
                .insp-row:hover { background: rgba(255,255,255,0.055); border-color: rgba(0,173,181,0.3); }
                .insp-seg { transition: background .15s ease, color .15s ease; }
                .insp-seg:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #fff; }
                .insp-chip { transition: border-color .15s ease, background .15s ease; }
                .insp-chip:hover { border-color: rgba(0,173,181,0.4); }
                .insp-loc { transition: color .15s ease; }
                .insp-loc:hover { color: #4de1ea !important; }
                .insp-layout { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 2rem; align-items: start; }
                .insp-report-input:focus, .insp-report-textarea:focus { border-color: rgba(0,173,181,0.5) !important; }
                .insp-toggle { transition: background .15s ease, color .15s ease, border-color .15s ease; }
                @media (max-width: 980px) {
                    .insp-layout { grid-template-columns: 1fr; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .insp-card, .insp-row, .insp-seg, .insp-chip, .insp-loc { transition: none !important; }
                    .insp-card:hover { transform: none; }
                }
            `}</style>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.4rem' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '13px', background: 'linear-gradient(135deg, rgba(0,173,181,0.22), rgba(0,173,181,0.06))', border: '1px solid rgba(0,173,181,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ShieldCheck size={24} color="var(--primary-color)" />
                </div>
                <div>
                    <h1 style={{ fontSize: '1.55rem', fontWeight: 900, margin: 0, letterSpacing: '-0.3px' }}>Проверки</h1>
                    <p style={{ color: 'var(--text-secondary)', margin: '0.15rem 0 0', fontSize: '0.85rem' }}>
                        {isAdmin ? 'Всички проверки — кога, колко и откъде са сканирани картите.' : 'Твоите проверки — кога, колко карти си проверил и локация.'}
                    </p>
                </div>
            </div>

            <div className="insp-layout">
            {/* ==================== LEFT COLUMN ==================== */}
            <div>

            {/* Day selector (segmented) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', margin: '1.5rem 0' }}>
                <div style={{ display: 'inline-flex', alignItems: 'stretch', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--surface-border)', borderRadius: '12px', overflow: 'hidden' }}>
                    <button className="insp-seg" onClick={() => shiftDay(-1)} title="Предишен ден" style={{ padding: '0 0.7rem', background: 'transparent', border: 'none', borderRight: '1px solid var(--surface-border)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ChevronLeft size={18} /></button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.85rem', cursor: 'pointer' }}>
                        <CalendarDays size={16} color="var(--primary-color)" />
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', textTransform: 'capitalize', ...num }}>{dayLabel}</span>
                        <input type="date" value={filterDay} max={new Date().toISOString().slice(0, 10)} onChange={e => setFilterDay(e.target.value)} style={{ position: 'absolute', opacity: 0, width: '1px', height: '1px' }} />
                    </label>
                    <button className="insp-seg" onClick={() => shiftDay(1)} title="Следващ ден" disabled={isToday} style={{ padding: '0 0.7rem', background: 'transparent', border: 'none', borderLeft: '1px solid var(--surface-border)', color: '#fff', cursor: isToday ? 'not-allowed' : 'pointer', opacity: isToday ? 0.35 : 1, display: 'flex', alignItems: 'center' }}><ChevronRight size={18} /></button>
                </div>
                {!isToday && (
                    <button className="insp-seg" onClick={() => setFilterDay(new Date().toISOString().slice(0, 10))} style={{ padding: '0.55rem 1rem', borderRadius: '12px', background: 'rgba(0,173,181,0.1)', border: '1px solid rgba(0,173,181,0.35)', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem' }}>Днес</button>
                )}
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem', marginBottom: '2rem' }}>
                {[
                    { icon: ClipboardCheck, label: 'Проверки за деня', value: String(countDay), tint: 'var(--primary-color)', bg: 'rgba(0,173,181,0.09)', border: 'rgba(0,173,181,0.28)', sub: null },
                    { icon: CalendarDays, label: 'Този месец', value: String(countMonth), tint: '#e6e6e6', bg: 'rgba(255,255,255,0.035)', border: 'var(--surface-border)', sub: null },
                    { icon: Percent, label: 'Сканирани при качване', value: `${scanPct}%`, tint: scanPct >= 80 ? '#00e676' : scanPct >= 50 ? '#ffab00' : '#ff5252', bg: 'rgba(255,255,255,0.035)', border: 'var(--surface-border)', sub: `${scannedOk} / ${countDay}` },
                ].map((c, i) => (
                    <div key={i} className="insp-card" style={{ padding: '1.15rem 1.25rem', background: c.bg, border: `1px solid ${c.border}`, borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700 }}>{c.label}</span>
                            <div style={{ width: '30px', height: '30px', borderRadius: '9px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <c.icon size={16} color={c.tint} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span style={{ fontSize: '2.1rem', fontWeight: 900, color: c.tint, lineHeight: 1, ...num }}>{c.value}</span>
                            {c.sub && <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 700, ...num }}>{c.sub}</span>}
                        </div>
                    </div>
                ))}
            </div>

            {isAdmin && byInspector.length > 0 && (
                <div style={{ marginBottom: '1.75rem' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700, marginBottom: '0.65rem' }}>По проверяващ</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                        {byInspector.map(b => (
                            <div key={b.name} className="insp-chip" style={{ padding: '0.4rem 0.5rem 0.4rem 0.4rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--surface-border)', borderRadius: '50px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(0,173,181,0.15)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900, flexShrink: 0 }}>{(b.name || '?').trim().charAt(0).toUpperCase()}</span>
                                <span style={{ fontWeight: 600 }}>{b.name}</span>
                                <span style={{ background: 'rgba(0,173,181,0.15)', color: 'var(--primary-color)', fontWeight: 900, borderRadius: '50px', padding: '0.1rem 0.5rem', fontSize: '0.8rem', ...num }}>{b.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Map (admin only) — always mounted so the Leaflet instance stays valid */}
            {isAdmin && (
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <MapPin size={14} /> Карта на проверките
                        </div>
                        <div style={{ display: 'flex', gap: '0.9rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#00e676' }} /> Сканиран</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#ff5252' }} /> Не е сканиран</span>
                        </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <div ref={mapEl} style={{ width: '100%', height: '360px', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.02)' }} />
                        {pointsWithGps.length === 0 && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: 'var(--text-secondary)', fontWeight: 700, background: 'rgba(0,0,0,0.4)', borderRadius: '16px' }}>
                                Няма проверки с локация за този ден
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* List (for the selected day) */}
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700, marginBottom: '0.65rem' }}>Списък проверки</div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Зареждане…</div>
            ) : dayScans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--surface-border)', borderRadius: '16px' }}>
                    <ClipboardCheck size={30} style={{ opacity: 0.4, marginBottom: '0.6rem' }} />
                    <div style={{ fontWeight: 700 }}>Няма проверки за избрания ден</div>
                    <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Смени датата или избери „Днес".</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {dayScans.map(s => {
                        const ok = wasScannedAtBoarding(s);
                        const accent = ok ? '#00e676' : '#ff5252';
                        return (
                            <div key={s.id} className="insp-row" style={{ position: 'relative', padding: '0.85rem 1.1rem 0.85rem 1.25rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.7rem 1rem', overflow: 'hidden' }}>
                                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: accent }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: '112px', ...num }}>
                                    <Clock size={14} style={{ flexShrink: 0 }} /> {fmt(s.at)}
                                </div>
                                <div style={{ flex: 1, minWidth: '150px' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                                        {s.clientName || s.clientId}
                                        {s.clientCard ? <span style={{ color: 'var(--text-secondary)', fontWeight: 600, ...num }}> · №{s.clientCard}</span> : ''}
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{s.route || '—'}{isAdmin ? ` · ${s.inspectorName}` : ''}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.74rem', fontWeight: 800, padding: '0.28rem 0.65rem', borderRadius: '50px', whiteSpace: 'nowrap', background: ok ? 'rgba(0,230,118,0.13)' : 'rgba(255,82,82,0.13)', color: accent, border: `1px solid ${ok ? 'rgba(0,230,118,0.28)' : 'rgba(255,82,82,0.28)'}` }}>
                                    {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                    {ok ? 'Сканиран' : 'Не е сканиран'}
                                </div>
                                {s.lat != null && s.lng != null ? (
                                    <a className="insp-loc" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" title="Виж на картата" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 700, maxWidth: '210px' }}>
                                        <MapPin size={14} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address || 'Локация'}</span>
                                    </a>
                                ) : (
                                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>без локация</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            </div>
            {/* ==================== RIGHT COLUMN — Reports ==================== */}
            <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700, marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FileText size={14} /> Репорти от проверяващ
                </div>

                <form onSubmit={submitReport} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '16px', marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>Какво се случи при проверката</label>
                        <textarea
                            className="insp-report-textarea"
                            value={rDescription}
                            onChange={e => setRDescription(e.target.value)}
                            placeholder="Опиши какво се случи..."
                            style={{ width: '100%', minHeight: '80px', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: '#fff', fontSize: '0.88rem', resize: 'vertical', outline: 'none' }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}><UserCog size={12} style={{ verticalAlign: '-1px', marginRight: '0.3rem' }} />Кой е проверен</label>
                        <input
                            className="insp-report-input"
                            type="text"
                            value={rChecked}
                            onChange={e => setRChecked(e.target.value)}
                            placeholder="Име на проверения"
                            style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: '#fff', fontSize: '0.88rem', outline: 'none' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <div>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}><Users size={12} style={{ verticalAlign: '-1px', marginRight: '0.3rem' }} />Клиенти</label>
                            <input
                                className="insp-report-input"
                                type="number"
                                min="0"
                                value={rClientCount}
                                onChange={e => setRClientCount(e.target.value)}
                                placeholder="Брой"
                                style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: '#fff', fontSize: '0.88rem', outline: 'none', ...num }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}><Bus size={12} style={{ verticalAlign: '-1px', marginRight: '0.3rem' }} />Автобус</label>
                            <input
                                className="insp-report-input"
                                type="text"
                                value={rBus}
                                onChange={e => setRBus(e.target.value)}
                                placeholder="№ / марка"
                                style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: '#fff', fontSize: '0.88rem', outline: 'none' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <div>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>Шофьор</label>
                            <input
                                className="insp-report-input"
                                type="text"
                                value={rDriver}
                                onChange={e => setRDriver(e.target.value)}
                                placeholder="Име на шофьора"
                                style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: '#fff', fontSize: '0.88rem', outline: 'none' }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}><Navigation size={12} style={{ verticalAlign: '-1px', marginRight: '0.3rem' }} />Дестинация</label>
                            <input
                                className="insp-report-input"
                                type="text"
                                list="insp-routes"
                                value={rDestination}
                                onChange={e => setRDestination(e.target.value)}
                                placeholder="Направление"
                                style={{ width: '100%', padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: '#fff', fontSize: '0.88rem', outline: 'none' }}
                            />
                            <datalist id="insp-routes">
                                {ROUTES.map(r => <option key={r} value={r} />)}
                            </datalist>
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}><AlertTriangle size={12} style={{ verticalAlign: '-1px', marginRight: '0.3rem' }} />Имаше ли проблем?</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="button" className="insp-toggle" onClick={() => setRHasProblem(false)} style={{ flex: 1, padding: '0.5rem', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', background: !rHasProblem ? 'rgba(0,230,118,0.13)' : 'rgba(255,255,255,0.03)', color: !rHasProblem ? '#00e676' : 'var(--text-secondary)', border: `1px solid ${!rHasProblem ? 'rgba(0,230,118,0.35)' : 'var(--surface-border)'}` }}>Не</button>
                            <button type="button" className="insp-toggle" onClick={() => setRHasProblem(true)} style={{ flex: 1, padding: '0.5rem', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', background: rHasProblem ? 'rgba(255,82,82,0.13)' : 'rgba(255,255,255,0.03)', color: rHasProblem ? '#ff5252' : 'var(--text-secondary)', border: `1px solid ${rHasProblem ? 'rgba(255,82,82,0.35)' : 'var(--surface-border)'}` }}>Да</button>
                        </div>
                    </div>

                    {rHasProblem && (
                        <div>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: '0.35rem' }}>Какъв е проблемът</label>
                            <textarea
                                className="insp-report-textarea"
                                value={rProblem}
                                onChange={e => setRProblem(e.target.value)}
                                placeholder="Опиши проблема..."
                                style={{ width: '100%', minHeight: '60px', padding: '0.6rem 0.75rem', background: 'rgba(255,82,82,0.05)', border: '1px solid rgba(255,82,82,0.25)', borderRadius: '10px', color: '#fff', fontSize: '0.88rem', resize: 'vertical', outline: 'none' }}
                            />
                        </div>
                    )}

                    {rError && (
                        <div style={{ fontSize: '0.8rem', color: '#ff5252', fontWeight: 600 }}>{rError}</div>
                    )}

                    <button type="submit" disabled={rSubmitting} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.7rem', borderRadius: '10px', background: 'var(--primary-color)', color: '#00252a', fontWeight: 800, fontSize: '0.88rem', border: 'none', cursor: rSubmitting ? 'not-allowed' : 'pointer', opacity: rSubmitting ? 0.7 : 1 }}>
                        {rSubmitting ? <Loader2 size={16} className="insp-spin" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                        {rSubmitting ? 'Изпращане…' : 'Запази репорт'}
                    </button>
                    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </form>

                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700, marginBottom: '0.65rem' }}>Репорти за деня</div>
                {reportsLoading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Зареждане…</div>
                ) : dayReports.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--surface-border)', borderRadius: '16px', fontSize: '0.85rem' }}>
                        Няма репорти за избрания ден
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {dayReports.map(r => (
                            <div key={r.id} className="insp-row" style={{ position: 'relative', padding: '0.85rem 1rem 0.85rem 1.15rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '14px', overflow: 'hidden' }}>
                                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: r.hasProblem ? '#ff5252' : '#00e676' }} />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', color: 'var(--text-secondary)', ...num }}>
                                        <Clock size={13} style={{ flexShrink: 0 }} /> {fmt(r.at)}
                                    </div>
                                    {r.hasProblem ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '50px', background: 'rgba(255,82,82,0.13)', color: '#ff5252', border: '1px solid rgba(255,82,82,0.28)' }}>
                                            <AlertTriangle size={12} /> Проблем
                                        </span>
                                    ) : (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '50px', background: 'rgba(0,230,118,0.13)', color: '#00e676', border: '1px solid rgba(0,230,118,0.28)' }}>
                                            <CheckCircle2 size={12} /> Без проблем
                                        </span>
                                    )}
                                </div>
                                {r.checkedName && <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.2rem' }}>{r.checkedName}</div>}
                                {r.description && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.4 }}>{r.description}</div>}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.7rem', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                    {r.driverName && <span><UserCog size={12} style={{ verticalAlign: '-2px', marginRight: '0.25rem' }} />{r.driverName}</span>}
                                    {r.busInfo && <span><Bus size={12} style={{ verticalAlign: '-2px', marginRight: '0.25rem' }} />{r.busInfo}</span>}
                                    {r.destination && <span><Navigation size={12} style={{ verticalAlign: '-2px', marginRight: '0.25rem' }} />{r.destination}</span>}
                                    {r.clientCount != null && <span style={num}><Users size={12} style={{ verticalAlign: '-2px', marginRight: '0.25rem' }} />{r.clientCount}</span>}
                                </div>
                                {r.hasProblem && r.problemDescription && (
                                    <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.65rem', background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.2)', borderRadius: '8px', fontSize: '0.8rem', color: '#ffb3b3' }}>
                                        {r.problemDescription}
                                    </div>
                                )}
                                {isAdmin && <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Проверил: {r.inspectorName}</div>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}
