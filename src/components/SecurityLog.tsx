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
const SecurityLog: React.FC = () => {
    const [attempts, setAttempts] = useState<LoginAttempt[]>([]);

    useEffect(() => {
        const q = query(collection(db, 'login_attempts'), orderBy('timestamp', 'desc'), limit(50));
        const unsub = onSnapshot(q, (snap) => {
            const list: LoginAttempt[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as LoginAttempt));
            setAttempts(list);
        }, (err) => console.error('SecurityLog error:', err));
        return () => unsub();
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <AlertTriangle size={20} color="#ff5252" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Неуспешни опити за вход ({attempts.length})</h4>
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
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {a.errorCode && (
                                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,82,82,0.15)', color: '#ff8a80', fontWeight: 700 }}>{a.errorCode}</span>
                                    )}
                                    {a.attemptInWindow && a.attemptInWindow > 1 && (
                                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,171,0,0.15)', color: '#ffab00', fontWeight: 700 }}>опит #{a.attemptInWindow}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default SecurityLog;
