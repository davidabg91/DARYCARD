import React, { useState, useEffect } from 'react';
import { db, messaging } from '../firebase';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { Bell, BellOff, Loader2, CheckCircle2 } from 'lucide-react';

interface PushSubscriptionProps {
    courseId: string;
}

const PushSubscription: React.FC<PushSubscriptionProps> = ({ courseId }) => {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        const checkSubscription = async () => {
            const storedToken = localStorage.getItem(`fcm_token_${courseId}`);
            if (storedToken) {
                setIsSubscribed(true);
            }
        };
        checkSubscription();
    }, [courseId]);

    const handleSubscribe = async () => {
        if (!messaging) return;
        setLoading(true);
        setError(null);

        try {
            // 1. Request Permission
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setError('Моля, разрешете известията от настройките на браузъра за да се абонирате.');
                setLoading(false);
                return;
            }

            // 2. Get FCM Token
            // VAPID Key from Firebase Console (optional for some browsers but recommended)
            const token = await getToken(messaging, {
                vapidKey: 'BE7-3cZ9dKhdQXrxP7o-QbCvl2XubkfIEkg7w8xsyJFN6OzfQ4YWg4UjuimkaALUBBjXz4Inqzc0bPhdupYOlYo'
            });

            if (token) {
                // 3. Save to Firestore
                const q = query(
                    collection(db, 'push_subscriptions'),
                    where('token', '==', token),
                    where('courseId', '==', courseId)
                );
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    await addDoc(collection(db, 'push_subscriptions'), {
                        token,
                        courseId,
                        createdAt: new Date().toISOString(),
                        platform: navigator.userAgent
                    });
                }

                localStorage.setItem(`fcm_token_${courseId}`, token);
                setIsSubscribed(true);
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 3000);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error('Subscription error:', err);
            setError('Възникна грешка при абонамента. ' + message);
        } finally {
            setLoading(false);
        }
    };

    const handleUnsubscribe = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem(`fcm_token_${courseId}`);
            if (token) {
                const q = query(
                    collection(db, 'push_subscriptions'),
                    where('token', '==', token),
                    where('courseId', '==', courseId)
                );
                const snapshot = await getDocs(q);
                snapshot.forEach(async (document) => {
                    await deleteDoc(doc(db, 'push_subscriptions', document.id));
                });
                localStorage.removeItem(`fcm_token_${courseId}`);
                setIsSubscribed(false);
            }
        } catch (err) {
            console.error('Unsubscribe error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '20px',
            padding: '1.5rem',
            border: '1px solid rgba(255,255,255,0.08)',
            marginTop: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            animation: 'fadeIn 0.5s ease'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: isSubscribed ? 'rgba(0, 200, 83, 0.1)' : 'rgba(255, 82, 82, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isSubscribed ? '#00c853' : '#ff5252'
                }}>
                    <Bell size={20} />
                </div>
                <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                        {isSubscribed ? 'Абониран сте за известия' : 'Абонирайте се за известия'}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                        Ще получавате съобщения за промени в разписанието за курс <strong style={{color: '#ff5252'}}>{courseId}</strong>.
                    </p>
                </div>
            </div>

            {error && (
                <div style={{
                    fontSize: '0.8rem',
                    color: '#ff5252',
                    padding: '0.75rem',
                    background: 'rgba(255, 82, 82, 0.1)',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 82, 82, 0.2)'
                }}>
                    {error}
                </div>
            )}

            <button
                onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
                disabled={loading}
                style={{
                    padding: '0.9rem',
                    borderRadius: '12px',
                    background: isSubscribed ? 'rgba(255,255,255,0.05)' : '#ff5252',
                    color: '#fff',
                    border: isSubscribed ? '1px solid rgba(255,255,255,0.1)' : 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    transition: 'all 0.3s ease',
                    boxShadow: !isSubscribed ? '0 8px 20px rgba(255, 82, 82, 0.2)' : 'none'
                }}
            >
                {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                ) : isSubscribed ? (
                    <>
                        <BellOff size={18} /> ОТМЕНИ АБОНАМЕНТ
                    </>
                ) : showSuccess ? (
                    <>
                        <CheckCircle2 size={18} /> УСПЕШНО АБОНИРАН!
                    </>
                ) : (
                    <>
                        <Bell size={18} /> АБОНИРАЙ СЕ СЕГА
                    </>
                )}
            </button>
        </div>
    );
};

export default PushSubscription;
