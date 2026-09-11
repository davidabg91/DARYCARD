import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
    LOW_BATTERY,
    OFFLINE_AFTER_MS,
    type DeviceDoc,
} from '../utils/deviceHeartbeat';
import {
    Smartphone, Wifi, WifiOff, BatteryFull, BatteryLow, BatteryCharging,
    Check, Pencil, Trash2, X, AlertTriangle, CreditCard, RefreshCw
} from 'lucide-react';

interface Props {
    /** Админ може да трие изчезнали устройства; модератор само гледа и преименува. */
    isAdmin: boolean;
}

// `now` се подава отвън: рисуването трябва да е чисто, а и така целият екран
// показва едно и също време, вместо всеки ред да чете часовника поотделно.
const fmtAgo = (iso: string | undefined, now: number): string => {
    if (!iso) return 'никога';
    const ms = now - new Date(iso).getTime();
    if (ms < 0) return 'сега';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'преди по-малко от минута';
    if (mins < 60) return `преди ${mins} мин.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `преди ${hours} ч.`;
    const days = Math.floor(hours / 24);
    return `преди ${days} дни`;
};

const fmtWhen = (iso?: string): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

interface Problem { text: string; hard: boolean }

const findProblems = (d: DeviceDoc, online: boolean, latestVersion: string, now: number): Problem[] => {
    const problems: Problem[] = [];
    if (!online) problems.push({ text: `Не е на линия (${fmtAgo(d.lastSeen, now)})`, hard: true });
    if (typeof d.batteryLevel === 'number' && d.batteryLevel <= LOW_BATTERY && !d.batteryCharging) {
        problems.push({ text: `Батерия ${d.batteryLevel}%`, hard: d.batteryLevel <= 10 });
    }
    if (latestVersion && d.appVersion && d.appVersion !== latestVersion) {
        problems.push({ text: `Стара версия (${d.appVersion})`, hard: false });
    }
    if (online && d.scanDate !== new Date(now).toISOString().slice(0, 10)) {
        problems.push({ text: 'Няма сканирания днес', hard: false });
    }
    return problems;
};

const DevicesPanel: React.FC<Props> = ({ isAdmin }) => {
    const [devices, setDevices] = useState<(DeviceDoc & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [latestVersion, setLatestVersion] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftName, setDraftName] = useState('');
    // Прекроява екрана веднъж в минута, за да не остарява „преди 3 мин.".
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, 'devices'),
            snap => {
                setDevices(snap.docs.map(d => ({ ...(d.data() as DeviceDoc), id: d.id })));
                setLoading(false);
            },
            err => { console.error('Списъкът с устройства не се зареди:', err); setLoading(false); }
        );
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => { unsub(); clearInterval(timer); };
    }, []);

    // Публикуваната версия — по нея се вижда кой терминал е с остаряло приложение.
    useEffect(() => {
        fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.version) setLatestVersion(String(d.version)); })
            .catch(() => { /* без сравнение на версии */ });
    }, []);

    const rows = useMemo(() => {
        return devices
            .map(d => {
                const online = !!d.lastSeen && (now - new Date(d.lastSeen).getTime()) < OFFLINE_AFTER_MS;
                return { ...d, online, problems: findProblems(d, online, latestVersion, now) };
            })
            .sort((a, b) => {
                if (a.online !== b.online) return a.online ? -1 : 1;
                return (b.lastSeen || '').localeCompare(a.lastSeen || '');
            });
    }, [devices, latestVersion, now]);

    const onlineCount = rows.filter(r => r.online).length;
    const troubled = rows.filter(r => r.problems.some(p => p.hard)).length;

    const saveName = async (id: string) => {
        const name = draftName.trim();
        try {
            await updateDoc(doc(db, 'devices', id), { name });
            setEditingId(null);
        } catch (err) {
            console.error('Името не се записа:', err);
        }
    };

    const removeDevice = async (id: string, label: string) => {
        if (!window.confirm(`Да махна ли „${label}" от списъка?\n\nАко устройството още работи, само след няколко минути ще се впише отново.`)) return;
        try {
            await deleteDoc(doc(db, 'devices', id));
        } catch (err) {
            console.error('Устройството не се изтри:', err);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Зареждам устройствата…</div>;
    }

    if (!rows.length) {
        return (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Smartphone size={40} style={{ opacity: 0.4, marginBottom: '1rem' }} />
                <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: '#fff' }}>Още няма вписано устройство</div>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                    Всеки терминал се вписва сам при пускане на приложението — до две минути
                    след като APK-то с тази промяна влезе на него. Браузър и PWA не се вписват.
                </div>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                <div style={{ flex: 1, minWidth: '150px', padding: '1rem', background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>На линия</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#00c853' }}>{onlineCount} / {rows.length}</div>
                </div>
                <div style={{ flex: 1, minWidth: '150px', padding: '1rem', background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.25)', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>С проблем</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: troubled ? '#ff5252' : 'var(--text-secondary)' }}>{troubled}</div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {rows.map(d => {
                    const label = d.name || d.autoName || d.id;
                    const battery = typeof d.batteryLevel === 'number' ? d.batteryLevel : null;
                    const batteryColor = battery === null ? 'var(--text-secondary)'
                        : d.batteryCharging ? '#00c853'
                            : battery <= 10 ? '#ff5252'
                                : battery <= LOW_BATTERY ? '#ff9800' : '#00c853';
                    const BatteryIcon = d.batteryCharging ? BatteryCharging : (battery !== null && battery <= LOW_BATTERY ? BatteryLow : BatteryFull);

                    return (
                        <div key={d.id} style={{
                            padding: '0.9rem 1rem',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--surface-border)',
                            borderLeft: `3px solid ${d.online ? '#00c853' : '#616161'}`,
                            borderRadius: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                {d.online
                                    ? <Wifi size={18} color="#00c853" />
                                    : <WifiOff size={18} color="#9e9e9e" />}

                                {editingId === d.id ? (
                                    <>
                                        <input
                                            value={draftName}
                                            onChange={e => setDraftName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') saveName(d.id); if (e.key === 'Escape') setEditingId(null); }}
                                            placeholder="Име на шофьора"
                                            autoFocus
                                            style={{ flex: 1, minWidth: '140px', padding: '0.45rem 0.7rem', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', fontWeight: 700 }}
                                        />
                                        <button onClick={() => saveName(d.id)} aria-label="Запиши" style={{ background: '#00c853', border: 'none', color: '#fff', borderRadius: '8px', padding: '0.45rem 0.6rem', cursor: 'pointer' }}>
                                            <Check size={16} />
                                        </button>
                                        <button onClick={() => setEditingId(null)} aria-label="Откажи" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '8px', padding: '0.45rem 0.6rem', cursor: 'pointer' }}>
                                            <X size={16} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ fontWeight: 800, fontSize: '1rem' }}>{label}</span>
                                        {!d.name && (
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>
                                                без име
                                            </span>
                                        )}
                                        <button
                                            onClick={() => { setEditingId(d.id); setDraftName(d.name || ''); }}
                                            aria-label="Преименувай"
                                            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem' }}
                                        >
                                            <Pencil size={15} />
                                        </button>
                                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem', color: batteryColor, fontWeight: 800, fontSize: '0.95rem' }}>
                                            <BatteryIcon size={18} />
                                            {battery === null ? '—' : `${battery}%`}
                                        </span>
                                    </>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '0.4rem 1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                <span>{d.online ? 'На линия' : `Последно ${fmtAgo(d.lastSeen, now)}`}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <CreditCard size={13} /> {d.scansToday || 0} днес · последна {fmtWhen(d.lastScanAt)}
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <RefreshCw size={13} /> {d.appVersion || '—'}
                                </span>
                                {isAdmin && (
                                    <button
                                        onClick={() => removeDevice(d.id, label)}
                                        style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ff5252', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700, padding: 0 }}
                                    >
                                        <Trash2 size={13} /> Махни
                                    </button>
                                )}
                            </div>

                            {d.problems.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                                    {d.problems.map((p, i) => (
                                        <span key={i} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                            fontSize: '0.72rem', fontWeight: 700,
                                            color: p.hard ? '#ff5252' : '#ff9800',
                                            background: p.hard ? 'rgba(255,82,82,0.12)' : 'rgba(255,152,0,0.12)',
                                            padding: '3px 9px', borderRadius: '6px'
                                        }}>
                                            <AlertTriangle size={12} /> {p.text}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DevicesPanel;
