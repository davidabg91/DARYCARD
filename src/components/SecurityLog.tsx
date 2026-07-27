import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { MapPin, Globe, Clock, AlertTriangle } from 'lucide-react';
import { db } from '../firebase';

interface LoginAttempt {
    id: string;
    timestamp: string;
    email?: string;
    errorCode?: string;
    ip?: string;
    ua?: string;
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    isp?: string;
    timezone?: string;
    attemptInWindow?: number;
}

/**
 * Shows the most recent failed-login attempts captured by the reportFailedLogin
 * Cloud Function (IP, geolocation, attempted email, error type).
 */
const PAGE_SIZE = 3;

const SecurityLog: React.FC = () => {
    const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
    // How many attempts to fetch. Starts small and grows via "Покажи още", so the
    // panel stays compact but the full history is reachable.
    const [visible, setVisible] = useState(PAGE_SIZE);
    const [hasMore, setHasMore] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        // Fetch one extra to know whether another page exists.
        const q = query(collection(db, 'login_attempts'), orderBy('timestamp', 'desc'), limit(visible + 1));
        const unsub = onSnapshot(q, (snap) => {
            const list: LoginAttempt[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as LoginAttempt));
            setHasMore(list.length > visible);
            setAttempts(list.slice(0, visible));
        }, (err) => console.error('SecurityLog error:', err));
        return () => unsub();
    }, [visible]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <AlertTriangle size={20} color="#ff5252" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                    Неуспешни опити за вход
                    <span style={{ fontWeight: 600, fontSize: '0.8rem', opacity: 0.5, marginLeft: '0.4rem' }}>
                        (показани {attempts.length}{hasMore ? '+' : ''})
                    </span>
                </h4>
            </div>

            {attempts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.3, fontWeight: 700 }}>Няма регистрирани опити.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {attempts.map((a) => {
                        const loc = [a.city, a.region, a.country].filter(Boolean).join(', ') || 'неизвестно';
                        return (
                            <div key={a.id} style={{
                                background: 'rgba(255,82,82,0.04)', border: '1px solid rgba(255,82,82,0.15)',
                                borderRadius: '12px', padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 800, color: '#fff', fontSize: '0.9rem' }}>{a.email || '—'}</span>
                                    <span style={{ fontSize: '0.72rem', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={12} /> {new Date(a.timestamp).toLocaleString('bg-BG')}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} color="#ff8a80" /> {loc}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Globe size={12} color="#ff8a80" /> {a.ip || '—'}</span>
                                    {a.isp && <span style={{ opacity: 0.6 }}>{a.isp}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {a.errorCode && (
                                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,82,82,0.15)', color: '#ff8a80', fontWeight: 700 }}>{a.errorCode}</span>
                                    )}
                                    {a.attemptInWindow && a.attemptInWindow > 1 && (
                                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,171,0,0.15)', color: '#ffab00', fontWeight: 700 }}>опит #{a.attemptInWindow}</span>
                                    )}
                                    {a.ua && (
                                        <button
                                            onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                                            style={{ marginLeft: 'auto', fontSize: '0.65rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            {expandedId === a.id ? 'Скрий детайли' : 'Детайли'}
                                        </button>
                                    )}
                                </div>
                                {expandedId === a.id && a.ua && (
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '0.6rem 0.7rem', wordBreak: 'break-word', lineHeight: 1.5 }}>
                                        <b style={{ color: 'rgba(255,255,255,0.75)' }}>Устройство / браузър:</b><br />{a.ua}
                                        {a.timezone && <><br /><b style={{ color: 'rgba(255,255,255,0.75)' }}>Часова зона:</b> {a.timezone}</>}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {hasMore && (
                        <button
                            onClick={() => setVisible(v => v + 10)}
                            style={{
                                marginTop: '0.2rem', padding: '0.7rem', borderRadius: '10px',
                                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)',
                                color: 'var(--text-secondary)', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer'
                            }}
                        >
                            Покажи още
                        </button>
                    )}
                    {!hasMore && visible > PAGE_SIZE && (
                        <button
                            onClick={() => { setVisible(PAGE_SIZE); setExpandedId(null); }}
                            style={{
                                marginTop: '0.2rem', padding: '0.7rem', borderRadius: '10px',
                                background: 'transparent', border: '1px solid var(--surface-border)',
                                color: 'var(--text-secondary)', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer'
                            }}
                        >
                            Покажи по-малко
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default SecurityLog;
