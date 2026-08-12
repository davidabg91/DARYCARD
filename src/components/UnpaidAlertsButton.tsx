import React, { useState } from 'react';
import { getToken } from 'firebase/messaging';
import { collection, query, where, getDocs, addDoc, updateDoc } from 'firebase/firestore';
import { AlertTriangle, BellRing, BellOff, Loader2, CheckCircle2 } from 'lucide-react';
import { db, getSafeMessaging } from '../firebase';
import { useAuth } from '../context/AuthContext';

const VAPID_KEY = 'BE7-3cZ9dKhdQXrxP7o-QbCvl2XubkfIEkg7w8xsyJFN6OzfQ4YWg4UjuimkaALUBBjXz4Inqzc0bPhdupYOlYo';

/**
 * Lets an admin subscribe THIS device to receive a push alert the moment a card
 * is scanned without a valid subscription (see the alertUnpaidScan Cloud
 * Function). The device's FCM token is stored/updated in `admin_push_tokens`
 * with `unpaidAlerts: true`.
 */
const UnpaidAlertsButton: React.FC = () => {
    const { currentUser } = useAuth();
    const [state, setState] = useState<'idle' | 'loading' | 'enabled' | 'error'>(
        () => (typeof localStorage !== 'undefined' && localStorage.getItem('unpaid_alerts_token') ? 'enabled' : 'idle')
    );
    const [error, setError] = useState<string | null>(null);

    const handleEnable = async () => {
        setError(null);
        setState('loading');
        try {
            const messaging = await getSafeMessaging();
            if (!messaging) {
                setError('Това устройство/браузър не поддържа известия.');
                setState('error');
                return;
            }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setError('Известията не са разрешени от браузъра.');
                setState('error');
                return;
            }
            const token = await getToken(messaging, { vapidKey: VAPID_KEY });
            if (!token) {
                setError('Неуспешно получаване на токен.');
                setState('error');
                return;
            }

            // Reuse the device's token doc if it already exists (e.g. from security
            // alerts); otherwise create it. Either way flag unpaidAlerts.
            const existing = await getDocs(query(collection(db, 'admin_push_tokens'), where('token', '==', token)));
            if (existing.empty) {
                await addDoc(collection(db, 'admin_push_tokens'), {
                    token,
                    uid: currentUser?.id || '',
                    username: currentUser?.username || '',
                    userAgent: navigator.userAgent,
                    unpaidAlerts: true,
                    createdAt: new Date().toISOString(),
                });
            } else {
                await updateDoc(existing.docs[0].ref, { unpaidAlerts: true });
            }
            localStorage.setItem('unpaid_alerts_token', token);
            setState('enabled');
        } catch (err: unknown) {
            console.error('Failed to enable unpaid alerts:', err);
            setError(err instanceof Error ? err.message : 'Грешка при активиране.');
            setState('error');
        }
    };

    const handleDisable = async () => {
        setError(null);
        setState('loading');
        try {
            const token = localStorage.getItem('unpaid_alerts_token');
            if (token) {
                const existing = await getDocs(query(collection(db, 'admin_push_tokens'), where('token', '==', token)));
                if (!existing.empty) {
                    await updateDoc(existing.docs[0].ref, { unpaidAlerts: false });
                }
            }
            localStorage.removeItem('unpaid_alerts_token');
            setState('idle');
        } catch (err: unknown) {
            console.error('Failed to disable unpaid alerts:', err);
            setError(err instanceof Error ? err.message : 'Грешка при изключване.');
            setState('error');
        }
    };

    return (
        <div style={{
            background: 'rgba(255,152,0,0.05)', border: '1px solid rgba(255,152,0,0.25)',
            borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <AlertTriangle size={20} color="#ff9800" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Известия за пътуване без абонамент</h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                Получавай push известие на това устройство веднага щом някой сканира карта без платен абонамент (с име, номер на картата, маршрут и час) — за да идеш на проверка в автобуса.
            </p>

            {error && (
                <div style={{ fontSize: '0.78rem', color: '#ff5252', background: 'rgba(255,82,82,0.1)', padding: '0.6rem 0.8rem', borderRadius: '10px' }}>
                    {error}
                </div>
            )}

            {state === 'enabled' ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#00c853', fontWeight: 700, fontSize: '0.9rem' }}>
                        <CheckCircle2 size={18} /> Активирано на това устройство
                    </div>
                    <button
                        onClick={handleDisable}
                        style={{
                            padding: '0.55rem 0.9rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#fff',
                            border: '1px solid var(--surface-border)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        <BellOff size={16} /> Изключи
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleEnable}
                    disabled={state === 'loading'}
                    style={{
                        padding: '0.85rem 1rem', borderRadius: '12px', background: '#ff9800', color: '#000',
                        border: 'none', fontWeight: 800, fontSize: '0.9rem', cursor: state === 'loading' ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem'
                    }}
                >
                    {state === 'loading'
                        ? <><Loader2 size={18} className="spin" /> Активиране...</>
                        : <><BellRing size={18} /> Активирай на това устройство</>}
                </button>
            )}
        </div>
    );
};

export default UnpaidAlertsButton;
