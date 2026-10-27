import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Карта за терминалите: пътят на един терминал за деня с местата, където е
 * чел карти, или всички терминали там, където са сега.
 *
 * Пътят се чертае на парчета. Където между две точки има дупка (няма GPS или
 * приложението е било спряно), линията е пунктир — иначе права черта през полето
 * изглежда като маршрут, а не е. OpenStreetMap, както картата на спирките.
 */

export interface PathPoint { lat: number; lng: number; t: number }
export interface MapMark { lat: number; lng: number; label: string; color?: string }

interface Props {
    /** Пътят за деня, подреден по време. */
    path?: PathPoint[];
    /** Над толкова между две точки се чертае пунктир. */
    gapMs?: number;
    /** Сканирани карти — малки жълти точки. */
    scans?: MapMark[];
    /** Терминали сега — големи точки с надпис. */
    live?: MapMark[];
    height?: number;
}

const BULGARIA: [number, number] = [43.35, 24.6];
const hhmm = (t: number) => new Date(t).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });

const DeviceMap: React.FC<Props> = ({ path = [], gapMs = 6.5 * 60 * 1000, scans = [], live = [], height = 380 }) => {
    const host = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const layer = useRef<L.LayerGroup | null>(null);
    // Картата се нагласява сама само първия път; после остава, където е
    // местена — иначе всяко опресняване на живите точки я връща обратно.
    const fitted = useRef(false);

    useEffect(() => {
        if (!host.current || map.current) return;
        const m = L.map(host.current, { zoomControl: true }).setView(BULGARIA, 9);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap',
        }).addTo(m);
        layer.current = L.layerGroup().addTo(m);
        map.current = m;
        setTimeout(() => m.invalidateSize(), 120);
        return () => { m.remove(); map.current = null; layer.current = null; fitted.current = false; };
    }, []);

    useEffect(() => {
        const m = map.current, group = layer.current;
        if (!m || !group) return;
        group.clearLayers();
        const bounds: L.LatLngExpression[] = [];

        // Пътят — плътно, докато точките идват редовно, пунктир през дупките.
        let run: L.LatLngExpression[] = [];
        const flush = () => {
            if (run.length > 1) L.polyline(run, { color: '#00ADB5', weight: 4, opacity: 0.9 }).addTo(group);
            run = [];
        };
        path.forEach((p, i) => {
            const prev = path[i - 1];
            if (prev && p.t - prev.t > gapMs) {
                flush();
                L.polyline([[prev.lat, prev.lng], [p.lat, p.lng]], { color: '#ff9800', weight: 3, opacity: 0.8, dashArray: '6 8' })
                    .bindTooltip(`Без GPS точки ${hhmm(prev.t)} – ${hhmm(p.t)}`).addTo(group);
            }
            run.push([p.lat, p.lng]);
            bounds.push([p.lat, p.lng]);
        });
        flush();
        if (path.length) {
            const first = path[0], last = path[path.length - 1];
            L.circleMarker([first.lat, first.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#00c853', fillOpacity: 1 })
                .bindTooltip(`Начало ${hhmm(first.t)}`).addTo(group);
            L.circleMarker([last.lat, last.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#ff5252', fillOpacity: 1 })
                .bindTooltip(`Последна точка ${hhmm(last.t)}`).addTo(group);
        }

        scans.forEach(s => {
            L.circleMarker([s.lat, s.lng], { radius: 5, color: '#000', weight: 1, fillColor: s.color || '#ffd600', fillOpacity: 0.95 })
                .bindTooltip(s.label).addTo(group);
            bounds.push([s.lat, s.lng]);
        });

        live.forEach(d => {
            L.circleMarker([d.lat, d.lng], { radius: 9, color: '#fff', weight: 2, fillColor: d.color || '#00ADB5', fillOpacity: 1 })
                .bindTooltip(d.label, { permanent: true, direction: 'top', offset: [0, -8] }).addTo(group);
            bounds.push([d.lat, d.lng]);
        });

        if (!fitted.current && bounds.length) {
            m.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 15 });
            fitted.current = true;
        }
    }, [path, scans, live, gapMs]);

    return (
        <div
            ref={host}
            style={{
                height, width: '100%', borderRadius: '12px', overflow: 'hidden',
                border: '1px solid var(--surface-border)', background: '#1b2128',
            }}
        />
    );
};

export default DeviceMap;
