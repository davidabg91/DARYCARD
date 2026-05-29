import React, { useState } from 'react';
import { getToken } from 'firebase/messaging';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { ShieldAlert, BellRing, Loader2, CheckCircle2 } from 'lucide-react';
import { db, getSafeMessaging } from '../firebase';
import { useAuth } from '../context/AuthContext';

const VAPID_KEY = 'BE7-3cZ9dKhdQXrxP7o-QbCvl2XubkfIEkg7w8xsyJFN6OzfQ4YWg4UjuimkaALUBBjXz4Inqzc0bPhdupYOlYo';

/**
 * Lets an admin register THIS device to receive security push alerts (failed
 * login attempts). The FCM token is stored in `admin_push_tokens`; the
 * reportFailedLogin Cloud Function pushes alerts to all registered tokens.
 */
const AdminAlertsButton: React.FC = () => {
    const { currentUser } = useAuth();
    const [state, setState] = useState<'idle' | 'loading' | 'enabled' | 'error'>(
        () => (typeof localStorage !== 'undefined' && localStorage.getItem('admin_alerts_token') ? 'enabled' : 'idle')
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

            // Store the token once (deduplicate).
            const existing = await getDocs(query(collection(db, 'admin_push_tokens'), where('token', '==', token)));
            if (existing.empty) {
                await addDoc(collection(db, 'admin_push_tokens'), {
                    token,
                    uid: currentUser?.id || '',
                    username: currentUser?.username || '',
                    userAgent: navigator.userAgent,
                    createdAt: new Date().toISOString(),
                });
            }
            localStorage.setItem('admin_alerts_token', token);
            setState('enabled');
        } catch (err: unknown) {
            console.error('Failed to enable admin alerts:', err);
            setError(err instanceof Error ? err.message : 'Грешка при активиране.');
            setState('error');
        }
    };

    return (
        <div style={{
            background: 'rgba(255,82,82,0.04)', border: '1px solid rgba(255,82,82,0.2)',
            borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ShieldAlert size={20} color="#ff5252" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Известия за сигурност</h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                Получавай push известие на това устройство при повтарящи се неуспешни опити за вход (с град, IP и брой опити).
            </p>

            {error && (
                <div style={{ fontSize: '0.78rem', color: '#ff5252', background: 'rgba(255,82,82,0.1)', padding: '0.6rem 0.8rem', borderRadius: '10px' }}>
                    {error}
                </div>
            )}

            {state === 'enabled' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#00c853', fontWeight: 700, fontSize: '0.9rem' }}>
                    <CheckCircle2 size={18} /> Активирано на това устройство
                </div>
            ) : (
                <button
                    onClick={handleEnable}
                    disabled={state === 'loading'}
                    style={{
                        padding: '0.85rem 1rem', borderRadius: '12px', background: '#ff5252', color: '#fff',
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

export default AdminAlertsButton;
