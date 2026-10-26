import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * A map to put one stop on.
 *
 * Click where the stop is, or drag the pin. The company's other stops are shown
 * as small dots, because a stop is easiest to place beside the ones already
 * placed — and a dot in the wrong village is noticed here rather than by a
 * passenger.
 *
 * OpenStreetMap, because it costs nothing and needs no key. Its tiles are free
 * for light use, which a company placing its stops once is.
 *
 * The pin is drawn rather than Leaflet's default image: the default loads its
 * marker from a path a bundler moves, and turns up as a broken image.
 */

export interface Point { lat: number; lng: number }

interface Props {
    value: Point | null;
    onChange: (p: Point) => void;
    /** Other stops, for orientation. */
    others?: Array<Point & { name: string }>;
    /** Where to look when there is no pin yet; Bulgaria otherwise. */
    fallbackCenter?: Point;
    height?: number;
}

const BULGARIA: Point = { lat: 42.73, lng: 25.48 };

const pinIcon = L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        background:#00ADB5;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
});

const StopMap: React.FC<Props> = ({ value, onChange, others = [], fallbackCenter, height = 340 }) => {
    const host = useRef<HTMLDivElement>(null);
    const map = useRef<L.Map | null>(null);
    const pin = useRef<L.Marker | null>(null);
    const dots = useRef<L.LayerGroup | null>(null);
    // The latest handler, so the map's own listeners need not be re-bound.
    const changed = useRef(onChange);
    useEffect(() => { changed.current = onChange; }, [onChange]);

    useEffect(() => {
        if (!host.current || map.current) return;
        const start = value || fallbackCenter || BULGARIA;
        const m = L.map(host.current, { zoomControl: true }).setView(
            [start.lat, start.lng],
            value ? 16 : fallbackCenter ? 12 : 7
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap',
        }).addTo(m);
        dots.current = L.layerGroup().addTo(m);
        m.on('click', (e: L.LeafletMouseEvent) => {
            changed.current({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) });
        });
        map.current = m;
        // The map is often opened inside a dialog that is still sizing itself.
        setTimeout(() => m.invalidateSize(), 120);
        return () => { m.remove(); map.current = null; pin.current = null; };
        // Created once; the effects below keep it in step.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const m = map.current;
        if (!m) return;
        if (!value) {
            pin.current?.remove();
            pin.current = null;
            return;
        }
        if (!pin.current) {
            pin.current = L.marker([value.lat, value.lng], { icon: pinIcon, draggable: true }).addTo(m);
            pin.current.on('dragend', () => {
                const p = pin.current!.getLatLng();
                changed.current({ lat: round(p.lat), lng: round(p.lng) });
            });
            m.setView([value.lat, value.lng], Math.max(m.getZoom(), 16));
        } else {
            pin.current.setLatLng([value.lat, value.lng]);
            if (!m.getBounds().contains([value.lat, value.lng])) m.panTo([value.lat, value.lng]);
        }
    }, [value]);

    useEffect(() => {
        const group = dots.current;
        if (!group) return;
        group.clearLayers();
        others.forEach(o => {
            L.circleMarker([o.lat, o.lng], {
                radius: 5, color: '#fff', weight: 1, fillColor: '#ffab00', fillOpacity: 0.9,
            }).bindTooltip(o.name).addTo(group);
        });
    }, [others]);

    return (
        <div
            ref={host}
            style={{
                height, width: '100%', borderRadius: '14px', overflow: 'hidden',
                border: '1px solid var(--surface-border)', background: '#1b2128',
            }}
        />
    );
};

/** Six decimals is about ten centimetres — more is noise from the mouse. */
const round = (x: number) => Math.round(x * 1e6) / 1e6;

export default StopMap;
