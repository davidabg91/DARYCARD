import React from 'react';
import { Bus, Smartphone, MapPin, WifiOff, Monitor } from 'lucide-react';
import { originDeviceLabel, TERMINAL_EVENT_INFO, type ScanOrigin } from '../utils/scanOrigin';

/**
 * На кой апарат и къде е сканирана картата — в историята на картата, в отчета
 * „без абонамент“ и навсякъде, където се показва отделно сканиране. Данните са
 * в utils/scanOrigin.
 */

const chip = (color: string, bg: string, border: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 700,
    color, background: bg, border: `1px solid ${border}`, padding: '2px 7px', borderRadius: '6px',
    textDecoration: 'none', whiteSpace: 'nowrap',
});

const same = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/**
 * Кой е прочел картата: отворена в браузър (не е пътуване) или терминал с
 * името му от УСТРОЙСТВА. `unpaid` оцветява терминала в червено.
 */
export const OriginDevice: React.FC<{ origin: ScanOrigin; unpaid?: boolean; neutral?: boolean }> = ({ origin, unpaid, neutral }) => {
    if (origin.source === 'web') {
        return (
            <span style={chip('var(--text-secondary)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.15)')}
                title="Не е пътуване: картата е отворена на телефон или компютър без вход в системата (напр. пътникът я е допрял до своя телефон). Не се брои в статистиката и в отчета „без абонамент“.">
                {origin.browser && /Windows|Mac|Linux/.test(origin.browser) ? <Monitor size={12} /> : <Smartphone size={12} />}
                Отворена в браузър{origin.browser ? ` · ${origin.browser}` : ''}
            </span>
        );
    }
    const name = originDeviceLabel(origin);
    const how = origin.deviceMatch === 'time'
        ? 'Апаратът е познат по часа на сканирането (терминал със старо APK).'
        : origin.deviceMatch === 'id' ? 'Терминалът сам е записал кой е.' : '';
    const title = [
        unpaid ? 'Валидирана в автобуса без платен абонамент за месеца.' : 'Сканирано от терминал в автобуса.',
        how,
        origin.app ? `Версия: ${origin.app}.` : '',
    ].filter(Boolean).join(' ');
    return (
        <span style={neutral
            ? chip('var(--text-secondary)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.15)')
            : unpaid
            ? chip('#ff5252', 'rgba(255, 82, 82, 0.14)', 'rgba(255, 82, 82, 0.4)')
            : chip('#00e676', 'rgba(0, 230, 118, 0.12)', 'rgba(0, 230, 118, 0.3)')} title={title}>
            <Bus size={12} />
            {name ? `Терминал: ${name}${origin.deviceMatch === 'time' ? ' ≈' : ''}` : 'Валидатор / Шофьор'}
        </span>
    );
};

/** Какъв екран е видял шофьорът при допиране, което не е пътуване. */
export const TerminalEventChip: React.FC<{ kind: string; secs?: number; attempts?: number }> = ({ kind, secs, attempts }) => {
    const info = TERMINAL_EVENT_INFO[kind] || { text: kind, detail: '', bad: false };
    const extra = kind === 'passback' && secs !== undefined ? ` (преди ${secs} s)`
        : kind === 'miss' && attempts ? ` (${attempts} опита)` : '';
    return (
        <span style={info.bad
            ? chip('#ff5252', 'rgba(255, 82, 82, 0.14)', 'rgba(255, 82, 82, 0.4)')
            : chip('#ffb300', 'rgba(255, 179, 0, 0.12)', 'rgba(255, 179, 0, 0.35)')}
            title={`Екран на терминала, не е пътуване. ${info.detail}`}>
            {info.text}{extra}
        </span>
    );
};

/**
 * Подробностите: къде (спирка или село, с връзка към картата), линията на
 * автобуса, ако е друга от линията на картата, проверка без връзка и какво е
 * видял шофьорът.
 */
export const OriginDetails: React.FC<{ origin: ScanOrigin; cardRoute?: string }> = ({ origin, cardRoute }) => {
    if (origin.source === 'web') return null;
    const hasFix = origin.lat !== undefined && origin.lng !== undefined;
    const where = origin.stop
        ? `спирка ${origin.stop}${origin.stopDistM !== undefined ? ` (${origin.stopDistM} м)` : ''}`
        : origin.place || (hasFix ? 'на картата' : '');
    const gpsNote = [
        origin.acc !== undefined ? `точност ±${origin.acc} м` : '',
        origin.gpsAgeS !== undefined ? `GPS отпреди ${origin.gpsAgeS} s` : '',
    ].filter(Boolean).join(', ');
    const shown = origin.shown === 'valid' ? { text: 'Шофьорът видя: ЗЕЛЕНО', ok: true }
        : origin.shown === 'unpaid' ? { text: 'Шофьорът видя: НЕПЛАТЕНА', ok: false }
        : origin.shown === 'canceled' ? { text: 'Шофьорът видя: АНУЛИРАНА', ok: false }
        : null;
    return (
        <>
            {where && (hasFix ? (
                <a href={`https://www.google.com/maps?q=${origin.lat},${origin.lng}`} target="_blank" rel="noopener noreferrer"
                    style={chip('#4fc3f7', 'rgba(79, 195, 247, 0.1)', 'rgba(79, 195, 247, 0.3)')}
                    title={`Къде е бил автобусът при сканирането${gpsNote ? ` (${gpsNote})` : ''}. Отваря картата.`}>
                    <MapPin size={12} /> {where}
                </a>
            ) : (
                <span style={chip('#4fc3f7', 'rgba(79, 195, 247, 0.1)', 'rgba(79, 195, 247, 0.3)')}>
                    <MapPin size={12} /> {where}
                </span>
            ))}
            {origin.busRoute && cardRoute && !same(origin.busRoute, cardRoute) && (
                <span style={chip('#ffb74d', 'rgba(255, 152, 0, 0.12)', 'rgba(255, 152, 0, 0.35)')}
                    title={`Картата е за ${cardRoute}, а автобусът този ден кара най-вече пътници за ${origin.busRoute}.`}>
                    <Bus size={12} /> автобус: {origin.busRoute}
                </span>
            )}
            {origin.check === 'local' && (
                <span style={chip('#29b6f6', 'rgba(41, 182, 246, 0.1)', 'rgba(41, 182, 246, 0.3)')}
                    title="Терминалът нямаше връзка и провери картата от списъка в себе си. Записът е пратен, щом се появи интернет.">
                    <WifiOff size={12} /> без връзка
                </span>
            )}
            {shown && (
                <span style={shown.ok
                    ? chip('#00e676', 'rgba(0, 230, 118, 0.08)', 'rgba(0, 230, 118, 0.25)')
                    : chip('#ff8a80', 'rgba(255, 82, 82, 0.08)', 'rgba(255, 82, 82, 0.3)')}
                    title="Какво показа екранът на терминала в момента на сканирането.">
                    {shown.text}
                </span>
            )}
        </>
    );
};
