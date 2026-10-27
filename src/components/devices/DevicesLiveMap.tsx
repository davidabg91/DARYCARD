import React, { useMemo } from 'react';
import DeviceMap, { type MapMark } from './DeviceMap';

/**
 * Всички терминали на една карта — там, където е последната им GPS точка.
 * Зелено: точката е от последните три минути. Сиво: по-стара, с часа ѝ.
 */

export interface LivePosition {
    id: string;
    label: string;
    lat: number;
    lng: number;
    fixAt?: string;
}

const FRESH_MS = 3 * 60 * 1000;

const DevicesLiveMap: React.FC<{ positions: LivePosition[]; now: number }> = ({ positions, now }) => {
    const live = useMemo<MapMark[]>(() => positions.map(p => {
        const at = p.fixAt ? new Date(p.fixAt).getTime() : 0;
        const fresh = now - at < FRESH_MS;
        const when = at ? new Date(at).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        return { lat: p.lat, lng: p.lng, label: fresh ? p.label : `${p.label} · ${when}`, color: fresh ? '#00c853' : '#757575' };
    }), [positions, now]);
    return <DeviceMap live={live} height={420} />;
};

export default DevicesLiveMap;
