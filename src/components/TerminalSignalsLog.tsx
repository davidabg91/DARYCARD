import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore';
import { Clock, CreditCard, MapPin, Radio, Smartphone } from 'lucide-react';
import { db } from '../firebase';
import { TerminalEventChip } from './ScanOrigin';

/**
 * Сигналите от терминалите: непозната карта, непрочетена, дублирана, няма
 * връзка, вече сканирана (`terminal_events`, виж utils/terminalEvents). Всеки
 * ред казва всичко, което се знае: кой терминал, кога, какво е прочетено (код,
 * чип, дали адресът е цял), чия е картата, ако чипът е познат, и къде е бил
 * автобусът. Непознатата карта с познат чип значи, че кодът е прочетен грешно,
 * а не че картата е чужда.
 */

interface TerminalSignal {
    id: string;
    at: string;
    kind: string;
    deviceId?: string;
    deviceName?: string;
    readId?: string;
    uid?: string;
    urlRead?: boolean;
    clientId?: string;
    clientName?: string;
    cardNumber?: string;
    secs?: number;
    attempts?: number;
    lat?: number;
    lng?: number;
    acc?: number;
    place?: string;
    app?: string;
    serverAt?: Timestamp;
}

type Filter = 'problems' | 'cloned' | 'all';
const FILTERS: Array<{ id: Filter; label: string; kinds: string[] | null }> = [
    { id: 'problems', label: 'Непознати и непрочетени', kinds: ['unknown', 'not_read', 'miss'] },
    { id: 'cloned', label: 'Дублирани', kinds: ['cloned'] },
    { id: 'all', label: 'Всички', kinds: null },
];

const fmt = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const cardNo = (n?: string) => String(n || '').replace(/^0+/, '') || n || '';
const code: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' };

const TerminalSignalsLog: React.FC = () => {
    const [signals, setSignals] = useState<TerminalSignal[] | null>(null);
    const [filter, setFilter] = useState<Filter>('problems');

    useEffect(() => {
        const q = query(collection(db, 'terminal_events'), orderBy('at', 'desc'), limit(300));
        return onSnapshot(q,
            snap => setSignals(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TerminalSignal, 'id'>) }))),
            err => { console.error('Сигналите от терминалите не се заредиха:', err); setSignals([]); });
    }, []);

    const shown = useMemo(() => {
        const kinds = FILTERS.find(f => f.id === filter)?.kinds;
        return (signals || []).filter(s => !kinds || kinds.includes(s.kind));
    }, [signals, filter]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <Radio size={20} color="#ffb300" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Сигнали от терминалите</h4>
                <span style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
                    {FILTERS.map(f => (
                        <button key={f.id} onClick={() => setFilter(f.id)} style={{
                            padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                            border: '1px solid var(--surface-border)',
                            background: filter === f.id ? 'rgba(255,179,0,0.18)' : 'rgba(255,255,255,0.04)',
                            color: filter === f.id ? '#ffb300' : 'var(--text-secondary)',
                        }}>{f.label}</button>
                    ))}
                </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Всяко допиране на терминала, което не е пътуване: какво е видял шофьорът, на кой апарат, какво е прочетено и къде.
                Записват се от терминалите с новото APK.
            </div>

            {signals === null ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.5, fontWeight: 700 }}>Зареждане…</div>
            ) : shown.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.3, fontWeight: 700 }}>Няма сигнали.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {shown.map(s => {
                        const lateS = s.serverAt ? Math.round((s.serverAt.toDate().getTime() - Date.parse(s.at)) / 1000) : null;
                        const misread = s.kind === 'unknown' && !!s.clientId;
                        return (
                            <div key={s.id} style={{
                                padding: '0.8rem 0.9rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.45rem',
                                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)',
                                borderLeft: `3px solid ${s.kind === 'unknown' || s.kind === 'cloned' ? '#ff5252' : '#ffb300'}`,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <TerminalEventChip kind={s.kind} secs={s.secs} attempts={s.attempts} />
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700 }}>
                                        <Clock size={13} /> {fmt(s.at)}
                                    </span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 800 }}>
                                        <Smartphone size={13} /> {s.deviceName || (s.deviceId ? `апарат ${s.deviceId.slice(0, 6)}` : '—')}
                                    </span>
                                    {lateS !== null && lateS > 60 && (
                                        <span style={{ fontSize: '0.72rem', color: '#29b6f6', fontWeight: 700 }}>стигна {Math.round(lateS / 60)} мин. по-късно (без връзка)</span>
                                    )}
                                </div>

                                <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                                    {s.clientName ? (
                                        <span>
                                            <CreditCard size={13} style={{ verticalAlign: '-2px' }} /> Картата е на <b>{s.clientName}</b>
                                            {s.cardNumber ? ` · № ${cardNo(s.cardNumber)}` : ''}
                                            {misread && <span style={{ color: '#ffb300', fontWeight: 700 }}> — чипът е познат, кодът е прочетен грешно</span>}
                                        </span>
                                    ) : s.kind === 'miss' ? (
                                        <span style={{ color: 'var(--text-secondary)' }}>Чипът не се прочете — не се знае коя е картата (може и банкова карта или телефон).</span>
                                    ) : (s.kind === 'unknown' || s.kind === 'not_read') ? (
                                        <span style={{ color: '#ff8a80', fontWeight: 700 }}>Няма такава карта в системата</span>
                                    ) : null}
                                </div>

                                <div style={{ display: 'flex', gap: '0.4rem 1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    {s.readId && <span>Прочетен код: <code style={code}>{s.readId}</code></span>}
                                    {s.uid && <span>Чип (UID): <code style={code}>{s.uid}</code></span>}
                                    {s.urlRead !== undefined && <span>Адресът на картата: {s.urlRead ? 'прочетен докрай' : 'не се прочете'}</span>}
                                    {typeof s.lat === 'number' && typeof s.lng === 'number' && (
                                        <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer"
                                            style={{ color: '#4fc3f7', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <MapPin size={12} /> {s.place || 'на картата'}{s.acc !== undefined ? ` (±${s.acc} м)` : ''}
                                        </a>
                                    )}
                                    {s.app && <span>версия {s.app}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TerminalSignalsLog;
