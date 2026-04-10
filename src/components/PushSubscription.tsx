import React, { useState, useEffect } from 'react';
import { db, messaging } from '../firebase';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { Bell, BellOff, Loader2, CheckCircle2, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface PushSubscriptionProps {
    courseId: string;
}

const PushSubscription: React.FC<PushSubscriptionProps> = ({ courseId }) => {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isIOS] = useState(/iPad|iPhone|iPod/.test(navigator.userAgent));
    const [isSupported] = useState(typeof Notification !== 'undefined');
    const [activeInstructions, setActiveInstructions] = useState<'ios' | 'android' | null>(null);

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
            // 0. Check support
            if (!isSupported) {
                if (isIOS) {
                    setError('За да получавате известия на iOS, моля добавете приложението към началния екран (Add to Home Screen) и го отворете от там.');
                } else {
                    setError('Вашият браузър не поддържа известия.');
                }
                setLoading(false);
                return;
            }

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
                const deletePromises = snapshot.docs.map(document => 
                    deleteDoc(doc(db, 'push_subscriptions', document.id))
                );
                await Promise.all(deletePromises);
                
                localStorage.removeItem(`fcm_token_${courseId}`);
                setIsSubscribed(false);
            }
        } catch (err: unknown) {
            console.error('Unsubscribe error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Неизвестна грешка';
            setError('Грешка при отказ: ' + errorMessage);
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

            <div style={{ 
                display: 'flex', 
                gap: '0.5rem', 
                marginTop: '0.5rem',
                justifyContent: 'center'
            }}>
                <button
                    onClick={() => setActiveInstructions(activeInstructions === 'ios' ? null : 'ios')}
                    style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: '8px',
                        background: activeInstructions === 'ios' ? 'rgba(255,255,255,0.1)' : 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                    }}
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ flexShrink: 0 }}>
                        <path d="M12.152 6.896c-.012-1.907 1.547-2.827 1.613-2.867-.883-1.294-2.256-1.47-2.744-1.49-1.165-.119-2.274.687-2.866.687-.591 0-1.503-.674-2.481-.654-1.285.019-2.47.747-3.13 1.897-1.332 2.308-.341 5.717 0 7.641.454 2.1 3.12 6.095 5.56 6.095 1.151 0 1.504-.7 2.898-.7 1.395 0 1.84.7 2.898.7 2.441 0 4.805-3.69 5.56-6.095-2.001-1.047-2.001-3.007-2.001-3.014v-.014zM10.303 3.364c.548-.636.917-1.521.817-2.404-.759.03-1.684.504-2.228 1.141-.489.571-.917 1.455-.817 2.338.835.066 1.684-.439 2.228-1.075z"/>
                    </svg> iOS ИНСТРУКЦИИ {activeInstructions === 'ios' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                <button
                    onClick={() => setActiveInstructions(activeInstructions === 'android' ? null : 'android')}
                    style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: '8px',
                        background: activeInstructions === 'android' ? 'rgba(255,255,255,0.1)' : 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                    }}
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="#3DDC84" style={{ flexShrink: 0 }}>
                        <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993s-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993s-.4482.9997-.9993.9997m11.4045-6.023l2.5155-4.356c.1299-.225.0528-.512-.1722-.6418a.4704.4704 0 0 0-.6418.1722l-2.5404 4.3992a10.052 10.052 0 0 0-11.0853 0L6.0592 4.4928a.4704.4704 0 0 0-.6418-.1722c-.225.1299-.3021.4168-.1722.6418l2.5155 4.356C3.9613 11.3323 1.3414 15.1118 1.3414 19.3414h21.3172c0-4.2295-2.6191-8.0091-6.4141-10.023z"/>
                    </svg> ANDROID ИНСТРУКЦИИ {activeInstructions === 'android' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
            </div>

            {activeInstructions && (
                <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '12px',
                    padding: '1rem',
                    border: '1px dashed rgba(255,255,255,0.1)',
                    animation: 'fadeIn 0.3s ease'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', color: '#ff5252' }}>
                        <Info size={16} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                            {activeInstructions === 'ios' ? 'Инструкции за iPhone/iPad' : 'Инструкции за Android'}
                        </span>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {activeInstructions === 'ios' ? (
                            <>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                                    <strong style={{ color: '#fff' }}>1.</strong> Отворете сайта през браузъра <strong style={{color: '#ff5252'}}>Safari</strong>.
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                                    <strong style={{ color: '#fff' }}>2.</strong> Натиснете бутона „Споделяне“ (квадратче със стрелка нагоре).
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                                    <strong style={{ color: '#fff' }}>3.</strong> Изберете <strong style={{color: '#fff'}}>„Добави към началния екран“</strong> (Add to Home Screen).
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                                    <strong style={{ color: '#fff' }}>4.</strong> Отворете приложението от иконата на телефона си и натиснете „Абонирай се“.
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                                    <strong style={{ color: '#fff' }}>1.</strong> Натиснете червения бутон <strong style={{color: '#fff'}}>„Абонирай се сега“</strong>.
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                                    <strong style={{ color: '#fff' }}>2.</strong> Когато браузърът поиска разрешение, изберете <strong style={{color: '#00c853'}}>„Разреши“ (Allow)</strong>.
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, padding: '0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                    <strong style={{ color: '#ff5252' }}>Важно:</strong> Ако не получавате известия, проверете настройките:
                                    <br/>• Настройки → Приложения → Chrome → Известия (Включено)
                                    <br/>• Настройки на Chrome → Настройки за сайта → Известия (Разрешено)
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PushSubscription;
