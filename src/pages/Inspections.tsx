/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, MapPin, Clock, User } from 'lucide-react';

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

    const todayIso = new Date().toISOString().slice(0, 10);
    const monthIso = new Date().toISOString().slice(0, 7);
    const countToday = useMemo(() => scans.filter(s => s.at?.startsWith(todayIso)).length, [scans, todayIso]);
    const countMonth = useMemo(() => scans.filter(s => s.at?.startsWith(monthIso)).length, [scans, monthIso]);
    const scannedOk = useMemo(() => scans.filter(wasScannedAtBoarding).length, [scans]);

    // Per-inspector breakdown (admin only).
    const byInspector = useMemo(() => {
        const map = new Map<string, { name: string; count: number }>();
        for (const s of scans) {
            const e = map.get(s.inspectorId) || { name: s.inspectorName, count: 0 };
            e.count++;
            map.set(s.inspectorId, e);
        }
        return [...map.values()].sort((a, b) => b.count - a.count);
    }, [scans]);

    // Map of inspection locations (admin only), rendered with Leaflet from CDN.
    const mapEl = useRef<HTMLDivElement>(null);
    const mapObj = useRef<any>(null);
    const markerLayer = useRef<any>(null);
    const pointsWithGps = useMemo(() => scans.filter(s => s.lat != null && s.lng != null), [scans]);

    useEffect(() => {
        if (!isAdmin || pointsWithGps.length === 0) return;
        let cancelled = false;
        loadLeaflet().then(() => {
            if (cancelled || !mapEl.current) return;
            const L = (window as any).L;
            if (!mapObj.current) {
                mapObj.current = L.map(mapEl.current).setView([pointsWithGps[0].lat, pointsWithGps[0].lng], 12);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(mapObj.current);
                markerLayer.current = L.layerGroup().addTo(mapObj.current);
            }
            markerLayer.current.clearLayers();
            const bounds: [number, number][] = [];
            for (const s of pointsWithGps) {
                const ok = wasScannedAtBoarding(s);
                const color = ok ? '#00e676' : '#ff5252';
                const m = L.circleMarker([s.lat, s.lng], { radius: 8, color, fillColor: color, fillOpacity: 0.75, weight: 2 });
                m.bindPopup(
                    `<b>${s.clientName || s.clientId}</b><br>${fmt(s.at)}<br>${s.route || ''}<br>Проверил: ${s.inspectorName}<br>${s.address || ''}<br><b style="color:${color}">${ok ? '✅ Сканиран при качване' : '❌ Не е сканиран'}</b>`
                );
                m.addTo(markerLayer.current);
                bounds.push([s.lat as number, s.lng as number]);
            }
            if (bounds.length > 1) mapObj.current.fitBounds(bounds, { padding: [30, 30] });
            else mapObj.current.setView(bounds[0], 14);
            setTimeout(() => mapObj.current && mapObj.current.invalidateSize(), 150);
        }).catch(err => console.error('Map load failed:', err));
        return () => { cancelled = true; };
    }, [isAdmin, pointsWithGps]);

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.6rem', fontWeight: 900, marginBottom: '0.3rem' }}>
                <ShieldCheck size={26} color="var(--primary-color)" /> Проверки
            </h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                {isAdmin ? 'Всички проверки от проверяващите — кога, колко и откъде са сканирани картите.' : 'Твоите проверки — кога, колко карти си проверил и от коя локация.'}
            </p>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ padding: '1.25rem', background: 'rgba(0,173,181,0.06)', border: '1px solid rgba(0,173,181,0.2)', borderRadius: '14px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Проверки днес</div>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-color)' }}>{countToday}</div>
                </div>
                <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '14px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Този месец</div>
                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{countMonth}</div>
                </div>
                <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '14px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Сканирани при качване</div>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#00e676' }}>{scannedOk}<span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}> / {scans.length}</span></div>
                </div>
            </div>

            {isAdmin && byInspector.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>По проверяващ</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                        {byInspector.map(b => (
                            <div key={b.name} style={{ padding: '0.5rem 0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--surface-border)', borderRadius: '50px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <User size={14} /> {b.name} <b style={{ color: 'var(--primary-color)' }}>{b.count}</b>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Map (admin only) */}
            {isAdmin && pointsWithGps.length > 0 && (
                <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <MapPin size={16} /> Карта на проверките <span style={{ fontSize: '0.75rem' }}>(зелено = сканиран, червено = не)</span>
                    </h3>
                    <div ref={mapEl} style={{ width: '100%', height: '360px', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--surface-border)', background: 'rgba(255,255,255,0.02)' }} />
                </div>
            )}

            {/* List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Зареждане…</div>
            ) : scans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Все още няма записани проверки.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {scans.map(s => {
                        const ok = wasScannedAtBoarding(s);
                        return (
                            <div key={s.id} style={{ padding: '0.9rem 1.1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem 1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: '130px' }}>
                                    <Clock size={14} /> {fmt(s.at)}
                                </div>
                                <div style={{ flex: 1, minWidth: '160px' }}>
                                    <div style={{ fontWeight: 700 }}>{s.clientName || s.clientId}{s.clientCard ? ` · №${s.clientCard}` : ''}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{s.route || '—'}{isAdmin ? ` · Проверил: ${s.inspectorName}` : ''}</div>
                                </div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.25rem 0.6rem', borderRadius: '50px', whiteSpace: 'nowrap', background: ok ? 'rgba(0,230,118,0.12)' : 'rgba(255,82,82,0.12)', color: ok ? '#00e676' : '#ff5252' }}>
                                    {ok ? '✓ Сканиран при качване' : '✗ Не е сканиран'}
                                </div>
                                {s.lat != null && s.lng != null ? (
                                    <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" title="Виж на картата" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 700, maxWidth: '220px' }}>
                                        <MapPin size={14} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address || 'Локация'}</span>
                                    </a>
                                ) : (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>без локация</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
