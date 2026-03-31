import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Ban, Clock, Settings, RefreshCw, Camera, CreditCard, ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
const AdSlideshow = React.lazy(() => import('../components/AdSlideshow'));
const BusSchedule = React.lazy(() => import('../components/BusSchedule'));
import { db } from '../firebase';
import logo from '../assets/logo_main.png';
import { doc, onSnapshot, setDoc, updateDoc, increment, arrayUnion, getDoc, addDoc, collection } from 'firebase/firestore';

interface Client {
    id: string;
    name: string;
    route: string;
    expiryDate: string;
    photo: string;
    createdAt: string;
    amountPaid?: number;
    isCanceled?: boolean;
    cancelReason?: string;
    renewalHistory?: { date: string, amount: number, month: string }[];
    history?: { date: string; action: string; details?: string; amount?: number; performedBy?: string; }[];
    cardType?: string;
}

const ROUTES = [
    "Бъркач", "Тръстеник", "Биволаре", "Горна Митрополия", "Долни Дъбник",
    "Рибен", "Садовец", "Славовица", "Байкал", "Гиген",
    "Долна Митрополия", "Ясен", "Крушовица", "Дисевица", "Търнене", "Градина",
    "Петърница", "Опанец", "Победа", "Подем", "Божурица",
    "Д. Дъбник - Садовец", "Д.Митрополия - Тръстеник", "Д.Митрополия - Славовица"
];

const sanitizeId = (id: string | null | undefined): string => {
    if (!id) return '';
    const trimmed = id.trim();
    if (!trimmed.includes('/')) return trimmed; 
    
    const parts = trimmed.split('/');
    const cleanParts = parts.filter(p => p.length > 0);
    const lastPart = cleanParts[cleanParts.length - 1];
    return lastPart || '';
};

const compressImage = (dataUrl: string, maxWidth: number, maxHeight: number, quality: number): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
    });
};

const ClientProfile: React.FC = () => {
    const { id: rawId } = useParams<{ id: string }>();
    const id = sanitizeId(rawId);
    const { currentUser } = useAuth();
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanTime] = useState(new Date().toLocaleTimeString('bg-BG'));
    const [showRenewConfirm, setShowRenewConfirm] = useState(false);
    const [renewError, setRenewError] = useState<string | null>(null);
    const [renewAmount, setRenewAmount] = useState<number>(50);
    const [renewMonth, setRenewMonth] = useState<string>(''); 
    const [renewRoute, setRenewRoute] = useState<string>(''); 
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    const [regName, setRegName] = useState('');
    const [regCardType, setRegCardType] = useState('Нормална карта');
    const [regRoute, setRegRoute] = useState('');
    const [regAmount, setRegAmount] = useState('50');
    const [regPhoto, setRegPhoto] = useState<string | null>(null);
    const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [regMonth, setRegMonth] = useState<string>(() => {
        const now = new Date();
        let targetMonth = now.getMonth() + 1;
        let targetYear = now.getFullYear();
        if (now.getDate() >= 20) {
            targetMonth += 1;
            if (targetMonth > 12) { targetMonth = 1; targetYear += 1; }
        }
        return `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Online Payment Mock State
    const [showOnlinePayment, setShowOnlinePayment] = useState(false);
    const [paymentMonth, setPaymentMonth] = useState<string>('');
    const [isPaying, setIsPaying] = useState(false);
    const [paymentComplete, setPaymentComplete] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const [error, setError] = useState<string | null>(null);
    const hasPlayedSound = useRef(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioInitializedRef = useRef(false);
    const soundPendingRef = useRef<'success' | 'error' | null>(null);

    const initAudio = () => {
        if (audioInitializedRef.current) return;
        try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audioContextRef.current = new AudioContextClass();
            // Resume context on user interaction if needed
            if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume();
            }
            audioInitializedRef.current = true;
            
            // Play any pending sound
            if (soundPendingRef.current === 'success') playSuccessSound();
            else if (soundPendingRef.current === 'error') playErrorSound();
            soundPendingRef.current = null;
        } catch (e) { console.error("Audio init error", e); }
    };

    const playSuccessSound = () => {
        const context = audioContextRef.current;
        if (!context) {
            soundPendingRef.current = 'success';
            return;
        }
        try {
            const playTone = (freq: number, start: number, duration: number, vol: number = 0.08) => {
                const osc = context.createOscillator();
                const gain = context.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, context.currentTime + start);
                gain.gain.setValueAtTime(0, context.currentTime + start);
                gain.gain.linearRampToValueAtTime(vol, context.currentTime + start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + start + duration);
                osc.connect(gain);
                gain.connect(context.destination);
                osc.start(context.currentTime + start);
                osc.stop(context.currentTime + start + duration);
            };
            playTone(587.33, 0, 0.5);      
            playTone(739.99, 0.08, 0.5);   
            playTone(880.00, 0.16, 0.6);   
            playTone(1174.66, 0.24, 0.7);  
        } catch (e) { console.error("Audio success error", e); }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                const compressed = await compressImage(base64, 500, 500, 0.8);
                setRegPhoto(compressed);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRegister = async () => {
        if (!id || !regName || !regRoute || !regPhoto || !regAmount) {
            alert('Моля, попълнете всички полета и направете снимка.');
            return;
        }
        const now = new Date();
        const expiryMonth = regMonth;
        const newClient: Client = {
            id,
            name: regName,
            route: regRoute,
            cardType: regCardType,
            expiryDate: expiryMonth,
            photo: regPhoto,
            createdAt: now.toISOString(),
            amountPaid: Number(regAmount),
            renewalHistory: [{ date: now.toISOString(), amount: Number(regAmount), month: expiryMonth }],
            history: [{
                date: now.toISOString(),
                action: 'Активиране (Сканиране)',
                details: `Първоначално плащане: ${regAmount} € за месец ${expiryMonth}`,
                amount: Number(regAmount),
                performedBy: currentUser?.username || 'Система (Линк)'
            }]
        };
        try {
            setLoading(true);
            await setDoc(doc(db, 'clients', id), newClient);
            
            try {
                await addDoc(collection(db, 'activity_logs'), {
                    timestamp: now.toISOString(),
                    performedBy: currentUser?.username || 'Система (Линк)',
                    action: 'Създаване',
                    targetName: regName,
                    details: `Нова карта (NFC): ${id}. Сума: ${regAmount} €. Регион: ${regRoute}`,
                    amount: Number(regAmount)
                });
            } catch (logErr) {
                console.error("Error logging activity:", logErr);
            }

            setIsRegistering(false);
            hasPlayedSound.current = false;
        } catch (err) {
            console.error(err);
            alert('Грешка при записване.');
            setLoading(false);
        }
    };

    const playErrorSound = () => {
        const context = audioContextRef.current;
        if (!context) {
            soundPendingRef.current = 'error';
            return;
        }
        try {
            const createBuzz = (startTime: number, duration: number) => {
                const osc1 = context.createOscillator();
                const osc2 = context.createOscillator();
                const gain = context.createGain();
                osc1.type = 'sawtooth';
                osc2.type = 'sawtooth';
                osc1.frequency.setValueAtTime(140, context.currentTime + startTime);
                osc2.frequency.setValueAtTime(142, context.currentTime + startTime);
                gain.gain.setValueAtTime(0, context.currentTime + startTime);
                gain.gain.linearRampToValueAtTime(0.1, context.currentTime + startTime + 0.05);
                gain.gain.linearRampToValueAtTime(0.08, context.currentTime + startTime + duration - 0.05);
                gain.gain.linearRampToValueAtTime(0, context.currentTime + startTime + duration);
                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(context.destination);
                osc1.start(context.currentTime + startTime);
                osc2.start(context.currentTime + startTime);
                osc1.stop(context.currentTime + startTime + duration);
                osc2.stop(context.currentTime + startTime + duration);
            };
            createBuzz(0, 0.5);
            createBuzz(0.6, 0.7); 
        } catch (e) { console.error("Audio error error", e); }
    };

    useEffect(() => {
        if (!id) return;
        const unsubscribe = onSnapshot(doc(db, 'clients', id), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as Record<string, unknown>;
                const clientData: Client = { ...data, id: docSnap.id } as Client;
                setClient(clientData);
                if (!hasPlayedSound.current) {
                    initAudio(); // Try to init immediately on data arrival
                    const now = new Date();
                    const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
                    const hasPaidCurrentMonth = (clientData.renewalHistory || []).some(rh => rh.month === currentMonthStr);
                    const isActive = !clientData.isCanceled && hasPaidCurrentMonth;
                    if (isActive) playSuccessSound();
                    else playErrorSound();
                    hasPlayedSound.current = true;
                }
            } else {
                setClient(null);
                if (!hasPlayedSound.current) {
                    initAudio(); 
                    playErrorSound();
                    hasPlayedSound.current = true;
                }
                const checkAdminWaiting = async () => {
                    try {
                        const actionRef = doc(db, 'admin_actions', 'current');
                        const actionSnap = await getDoc(actionRef);
                        if (actionSnap.exists()) {
                            const data = actionSnap.data();
                            if (data.action === 'waiting_for_reg') {
                                setCloudSyncStatus('sending');
                                await updateDoc(actionRef, {
                                    action: 'id_received',
                                    cardId: id
                                });
                                setCloudSyncStatus('sent');
                            }
                        }
                    } catch (e) { console.error("Cloud sync error:", e); }
                };
                if (cloudSyncStatus === 'idle') checkAdminWaiting();
            }
            setLoading(false);
        }, (err) => {
            console.error("Firestore error:", err);
            setError(err.message);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [id, cloudSyncStatus]);

    const scannedRef = useRef<string | null>(null);
    const hasClient = !!client;

    useEffect(() => {
        if (!id || !currentUser || loading || !hasClient || scannedRef.current === id) return;
        const performTrackScan = async () => {
            const scanKey = `scanned_${id}`;
            const lastSessionScan = sessionStorage.getItem(scanKey);
            const now = new Date().getTime();
            if (lastSessionScan && (now - parseInt(lastSessionScan)) < 3600000) {
                scannedRef.current = id;
                return;
            }
            try {
                scannedRef.current = id;
                const clientRef = doc(db, 'clients', id);
                const isoNow = new Date().toISOString();
                await updateDoc(clientRef, {
                    scanCount: increment(1),
                    lastScanAt: isoNow,
                    scanHistory: arrayUnion(isoNow)
                });
                sessionStorage.setItem(scanKey, now.toString());
            } catch (e) {
                console.error("Error tracking scan:", e);
                scannedRef.current = null; 
            }
        };
        performTrackScan();
    }, [id, currentUser, loading, hasClient]);

    // Idle Detection Logic (30 seconds)
    useEffect(() => {
        const resetIdleTimer = () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            setIsIdle(false);

            if (loading || isRegistering || showPhotoModal || showRenewConfirm) return;

            idleTimerRef.current = setTimeout(() => {
                if (document.visibilityState === 'visible') {
                    setIsIdle(true);
                }
            }, 30000); 
        };

        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        const handler = () => {
            initAudio(); 
            resetIdleTimer();
        };
        events.forEach(event => document.addEventListener(event, handler, { passive: true }));
        
        // Start initial timer if allowed
        if (!loading && !isRegistering && !showPhotoModal && !showRenewConfirm) {
            idleTimerRef.current = setTimeout(() => {
                if (document.visibilityState === 'visible') {
                    setIsIdle(true);
                }
            }, 30000);
        }

        return () => {
            events.forEach(event => document.removeEventListener(event, handler));
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [loading, isRegistering, showPhotoModal, showRenewConfirm, id]);

    // Handle visibility change
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') {
                setIsIdle(false);
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Skeleton UI for the Card - Matches the real card's dimensions for zero layout shift
    const SkeletonCard = () => (
        <div className="id-card-container" style={{
            width: '100%', maxWidth: '480px', border: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(30, 30, 35, 0.95)', position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', borderRadius: '24px', zIndex: 10
        }}>
            <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ width: '80px', height: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
                <div style={{ width: '100px', height: '22px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }} />
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ width: '140px', height: '185px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.2rem', justifyContent: 'center' }}>
                    <div style={{ width: '80%', height: '32px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }} />
                    <div style={{ width: '100%', height: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <div style={{ height: '45px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }} />
                        <div style={{ height: '45px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }} />
                    </div>
                </div>
            </div>
            {/* Shimmer effect inside the component */}
            <style>{`
                .id-card-container::before {
                    content: "";
                    position: absolute;
                    top: 0; right: 0; bottom: 0; left: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent);
                    transform: translateX(-100%);
                    animation: shimmer 2s infinite;
                }
                @keyframes shimmer { 100% { transform: translateX(100%); } }
            `}</style>
        </div>
    );

    const isInitializingAuth = !currentUser && useAuth().loading;

    if (loading && !client) {
        return (
            <div style={{ minHeight: '100vh', background: '#09090b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
                <SkeletonCard />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: '#fff', padding: '1rem' }}>
                <div style={{ textAlign: 'center', maxWidth: '400px', width: '100%' }}>
                    <Ban size={64} color="var(--error-color)" style={{ marginBottom: '1.5rem' }} />
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--error-color)', marginBottom: '0.5rem' }}>Картата не е намерена</h1>
                    {cloudSyncStatus === 'sent' && (
                        <div style={{ background: 'rgba(0, 200, 83, 0.15)', color: '#00c853', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.75rem', border: '1px solid rgba(0,200,83,0.3)', animation: 'fadeIn 0.4s ease' }}>
                            <CheckCircle size={20} />
                            ID-то е изпратено към Админ Панела!
                        </div>
                    )}
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>{error}</p>
                    <Link to="/" style={{ padding: '0.8rem 2rem', background: 'var(--primary-color)', color: '#fff', borderRadius: '50px', textDecoration: 'none', fontWeight: 600 }}>Към Начало</Link>
                </div>
            </div>
        );
    }

    if (!client) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', padding: '1rem', fontFamily: 'Inter, sans-serif' }}>
                <div style={{ textAlign: 'center', maxWidth: '440px', width: '100%' }}>
                    {!isRegistering ? (
                        <>
                            <div style={{  width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Settings size={48} color={currentUser ? "var(--primary-color)" : "rgba(255,255,255,0.2)"} />
                            </div>
                            <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '1rem' }}>{currentUser ? 'НОВА КАРТА' : 'НЕВАЛИДЕН АБОНАМЕНТ'}</h2>
                            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '2.5rem', lineHeight: '1.6' }}>
                                {currentUser ? 'Тази карта все още не е регистрирана в системата. Можете да я активирате сега.' : 'Тази NFC карта все още не е свързана с клиентски профил. Моля, свържете се с администратор.'}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {currentUser && (
                                    <button onClick={() => setIsRegistering(true)} style={{ padding: '1.2rem', background: 'var(--primary-color)', color: '#fff', borderRadius: '50px', border: 'none', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0, 173, 181, 0.3)' }}>АКТИВИРАЙ КАРТАТА СЕГА</button>
                                )}
                                <Link to="/" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>Към Начало</Link>
                            </div>
                        </>
                    ) : (
                        <div style={{ animation: 'fadeIn 0.4s ease', textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: '2rem', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>Регистрация на Карта</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <div onClick={() => fileInputRef.current?.click()} style={{ width: '120px', height: '120px', borderRadius: '24px', background: 'rgba(255,255,255,0.05)', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed rgba(255,255,255,0.2)', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                                    {regPhoto ? <img src={regPhoto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center' }}><Camera size={24} color="var(--primary-color)" /><div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.4rem' }}>СНИМКА</div></div>}
                                    <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handlePhotoUpload} style={{ display: 'none' }} />
                                </div>
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>ИМЕ НА КЛИЕНТА</label><input value={regName} onChange={e => setRegName(e.target.value)} style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }} placeholder="Име Фамилия..." /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>ВИД КАРТА</label><select value={regCardType} onChange={e => setRegCardType(e.target.value)} style={{ width: '100%', padding: '1rem', background: '#222', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }}><option value="Нормална карта">Нормална карта</option><option value="Детска карта">Детска карта</option><option value="Пенсионерска карта">Пенсионерска карта</option></select></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>МАРШРУТ (КУРС)</label><select value={regRoute} onChange={e => setRegRoute(e.target.value)} style={{ width: '100%', padding: '1rem', background: '#222', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }}><option value="">Избери маршрут...</option>{ROUTES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>СУМА (€)</label><input type="number" value={regAmount} onChange={e => setRegAmount(e.target.value)} style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>МЕСЕЦ</label><input type="month" value={regMonth} onChange={e => setRegMonth(e.target.value)} style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none', colorScheme: 'dark' }} /></div>
                                <button onClick={handleRegister} style={{ marginTop: '1rem', padding: '1.2rem', background: '#00e676', color: '#ffffff', borderRadius: '12px', border: 'none', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer' }}>ЗАПАЗИ И АКТИВИРАЙ</button>
                                <button onClick={() => setIsRegistering(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', cursor: 'pointer' }}>Отказ</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const getQuickRenewSummary = () => {
        const now = new Date();
        const day = now.getDate();
        let month = now.getMonth();
        let year = now.getFullYear();
        if (day > 10) { month += 1; if (month > 11) { month = 0; year += 1; } }
        const targetMonth = `${year}-${(month + 1).toString().padStart(2, '0')}`;
        const bgMonths = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];
        const monthName = bgMonths[month];
        let defaultAmount = 50;
        if (client?.renewalHistory && client.renewalHistory.length > 0) { defaultAmount = client.renewalHistory[client.renewalHistory.length - 1].amount; } 
        else if (client?.amountPaid) { defaultAmount = client.amountPaid; }
        return { targetMonth, monthName, year, defaultAmount };
    };

    const initiationRenew = () => {
        if (!client) return;
        const { targetMonth, defaultAmount } = getQuickRenewSummary();
        setRenewAmount(defaultAmount);
        setRenewMonth(targetMonth);
        setRenewRoute(client.route);
        setShowRenewConfirm(true);
    };

    const handleConfirmRenew = async () => {
        if (!client) return;
        setRenewError(null);
        try {
            const amount = Number(renewAmount);
            const targetMonth = renewMonth;
            if (isNaN(amount) || amount <= 0) { setRenewError('Моля, въведете валидна сума.'); return; }
            if (!targetMonth) { setRenewError('Моля, изберете месец.'); return; }
            if (!renewRoute) { setRenewError('Моля, изберете курс.'); return; }

            const history = client.history || [];
            const renewalHistory = client.renewalHistory || [];
            const routeChanged = renewRoute !== client.route;

            const updatedClient = {
                ...client,
                route: renewRoute,
                expiryDate: targetMonth,
                amountPaid: (client.amountPaid || 0) + amount,
                isCanceled: false,
                cancelReason: "",
                renewalHistory: [...renewalHistory, { date: new Date().toISOString(), amount, month: targetMonth }],
                history: [...history, {
                    date: new Date().toISOString(),
                    action: 'Бързо Подновяване (Профил)',
                    details: `Месец: ${targetMonth}${routeChanged ? ` | Променен курс: ${client.route} -> ${renewRoute}` : ''}`,
                    amount,
                    performedBy: currentUser?.username || 'Модератор'
                }]
            };
            await setDoc(doc(db, 'clients', client.id), updatedClient);
            
            try {
                await addDoc(collection(db, 'activity_logs'), {
                    timestamp: new Date().toISOString(),
                    performedBy: currentUser?.username || 'Модератор',
                    action: 'Подновяване',
                    targetName: client.name,
                    details: `Бързо подновяване (Профил). Месец: ${targetMonth}${routeChanged ? ` | Променен курс: ${client.route} -> ${renewRoute}` : ''}`,
                    amount: amount
                });
            } catch (logErr) {
                console.error("Error logging activity:", logErr);
            }

            setShowRenewConfirm(false);
        } catch (err) { console.error(err); setRenewError('Грешка при записване. Моля, опитайте пак.'); }
    };

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const getFormattedMonth = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month] = dateStr.split('-');
        const bgMonths = ["ЯНУАРИ", "ФЕВРУАРИ", "МАРТ", "АПРИЛ", "МАЙ", "ЮНИ", "ЮЛИ", "АВГУСТ", "СЕПТЕМВРИ", "ОКТОМВРИ", "НОЕМВРИ", "ДЕКЕМВРИ"];
        return `${bgMonths[parseInt(month) - 1]} ${year}`;
    };

    const isCanceled = client?.isCanceled;
    const hasPaidCurrentMonth = (client?.renewalHistory || []).some(rh => rh.month === currentMonthStr);
    const isActive = !isCanceled && hasPaidCurrentMonth;
    const themeColor = isActive ? '#00e676' : '#ff1744';
    const StatusIcon = isActive ? CheckCircle : XCircle;
    
    let statusText = isCanceled ? 'АНУЛИРАН' : 'НЕВАЛИДЕН АБОНАМЕНТ';
    if (!isCanceled && !hasPaidCurrentMonth) { 
        statusText = `БЕЗ ТАКСА ЗА ${getFormattedMonth(currentMonthStr).split(' ')[0]}`; 
    } else if (isActive) { 
        statusText = 'ВАЛИДЕН АБОНАМЕНТ'; 
    }

    return (
        <div style={{ 
            minHeight: '100vh', 
            background: '#09090b', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff', 
            fontFamily: '"Outfit", "Inter", sans-serif',
            overflowX: 'hidden',
            padding: '2rem 1rem',
            position: 'relative'
        }}>
            {/* Background Decor */}
            <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '40%', height: '40%', background: `${themeColor}10`, filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '40%', height: '40%', background: `${themeColor}05`, filter: 'blur(120px)', borderRadius: '50%', pointerEvents: 'none' }} />

            {/* Тhe ID CARD */}
            <div className="id-card-container" style={{
                width: '100%',
                maxWidth: '480px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                animation: 'cardEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                zIndex: 10,
                willChange: 'transform, opacity',
                // Disable backdrop-filter on small screens for performance
                ...(window.innerWidth > 600 ? { backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)' } : { background: 'rgba(30, 30, 35, 0.95)' })
            }}>
                {/* Holographic Overlay */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(135deg, transparent 0%, ${themeColor}11 50%, transparent 100%)`,
                    backgroundSize: '200% 200%',
                    animation: 'hologram 8s linear infinite',
                    pointerEvents: 'none',
                    zIndex: 5
                }} />

                {/* Card Header */}
                <div className="card-header" style={{
                    padding: '1.2rem 1.5rem 0.8rem',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.03)',
                    position: 'relative'
                }}>
                    {!isOnline && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            background: '#f79e1b',
                            color: '#000',
                            fontSize: '0.6rem',
                            fontWeight: 900,
                            textAlign: 'center',
                            padding: '2px 0',
                            zIndex: 20
                        }}>
                            РАБОТА В ОФЛАЙН РЕЖИМ (КЕШИРАНИ ДАННИ)
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: themeColor, letterSpacing: '2px', textTransform: 'uppercase' }}>DARY CARD</span>
                        <span className="card-subtitle" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>{client?.cardType ? client.cardType.toUpperCase() : 'УДОСТОВЕРЕНИЕ ЗА ПЪТУВАНЕ'}</span>
                    </div>
                    <div style={{
                        background: `${themeColor}22`,
                        padding: '4px 10px',
                        borderRadius: '10px',
                        border: `1px solid ${themeColor}44`,
                        fontSize: '0.65rem',
                        fontWeight: 900,
                        color: themeColor,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: isOnline ? themeColor : '#f79e1b', boxShadow: `0 0 8px ${isOnline ? themeColor : '#f79e1b'}` }} />
                        {isOnline ? 'СИНХРОНИЗИРАНО' : 'ОФЛАЙН'}
                    </div>
                </div>

                {/* Card Body */}
                <div className="id-card-body" style={{ 
                    flex: 1, 
                    display: 'flex', 
                    padding: '1.5rem', 
                    gap: '1.5rem', 
                    position: 'relative',
                    flexWrap: 'wrap'
                }}>
                    {/* Photo Area */}
                    <div className="id-photo-area" style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center'
                    }}>
                        <div className="photo-frame" style={{
                            width: '140px',
                            height: '165px',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.12)',
                            position: 'relative',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                            background: '#111'
                        }} onClick={() => setShowPhotoModal(true)}>
                            {client && client.photo && <img src={client.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Client" />}
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }} />
                            <div style={{ position: 'absolute', inset: 0, border: `2px solid ${themeColor}22`, borderRadius: '16px', pointerEvents: 'none' }} />
                        </div>
                    </div>

                    {/* Data Area */}
                    <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.2rem' }}>
                        <div>
                            <div style={{ fontSize: '0.6rem', color: themeColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>ПРИТЕЖАТЕЛ</div>
                            <h2 className="holder-name" style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, letterSpacing: '-0.5px', color: '#fff', lineHeight: 1.1 }}>{client?.name.toUpperCase()}</h2>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>ДЕСТИНАЦИЯ</div>
                                <div className="route-text" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>{client?.route}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '2px' }}>ИЗДАДЕНА НА</div>
                                <div className="date-text" style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{client && new Date(client.createdAt).toLocaleDateString('bg-BG')}</div>
                            </div>
                        </div>

                        {/* Validity Badge */}
                        <div style={{ 
                            background: `${themeColor}20`,
                            border: `1px solid ${themeColor}40`,
                            borderRadius: '16px',
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            boxShadow: `0 10px 30px ${themeColor}10`
                        }}>
                            <div className="validity-content" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {hasPaidCurrentMonth && (
                                    <>
                                        <div style={{ fontSize: '0.6rem', color: themeColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>ВАЛИДНА ДО КРАЯ НА</div>
                                        <div className="valid-month" style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>{getFormattedMonth(currentMonthStr)}</div>
                                    </>
                                )}
                                <div className="status-badge" style={{ fontSize: '0.75rem', fontWeight: 800, color: themeColor, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <StatusIcon size={14} />
                                    {statusText}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Signature / Security */}
                <div style={{
                    padding: '0.8rem 1.5rem',
                    background: 'rgba(0,0,0,0.3)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid rgba(255,255,255,0.06)'
                }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                         <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>ИДЕНТИФИКАТОР:</span>
                         <span style={{ fontSize: '0.75rem', fontWeight: 900, color: themeColor, fontFamily: 'monospace', letterSpacing: '1px' }}>{client?.id.substring(0, 12).toUpperCase()}</span>
                    </div>
                    <div style={{ opacity: 0.15 }}>
                         <img src={logo} style={{ height: '36px', width: 'auto', objectFit: 'contain', filter: 'grayscale(1) brightness(1.5) contrast(0.5)' }} alt="Logo" />
                    </div>
                </div>
            </div>

            {/* Action Area (Outside Card) - Delayed until Auth is ready */}
            <div className="action-area" style={{ 
                marginTop: '2.5rem', 
                width: '100%', 
                maxWidth: '480px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem',
                opacity: isInitializingAuth ? 0 : 1,
                transition: 'opacity 0.4s ease'
            }}>
                {currentUser && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <button onClick={initiationRenew} style={{ 
                            background: '#00e676', 
                            color: '#000', 
                            padding: '1.2rem', 
                            borderRadius: '20px', 
                            border: 'none', 
                            fontWeight: 900, 
                            fontSize: '1.1rem', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            boxShadow: '0 10px 30px rgba(0, 230, 118, 0.3)',
                            transition: 'all 0.3s'
                        }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                            <RefreshCw size={20} /> ПОДНОВИ
                        </button>
                        <Link to={`/admin?edit=${client?.id}`} style={{ 
                            background: 'rgba(255,255,255,0.05)', 
                            color: '#fff', 
                            padding: '1.2rem', 
                            borderRadius: '20px', 
                            textDecoration: 'none', 
                            fontWeight: 800, 
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            transition: 'all 0.3s'
                        }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                            <Settings size={18} /> УПРАВЛЕНИЕ
                        </Link>
                    </div>
                )}
                
                {!currentUser && !client?.isCanceled && (
                    <button onClick={() => setShowOnlinePayment(true)} style={{ 
                        background: 'linear-gradient(135deg, #635bff 0%, #4a154b 100%)', 
                        color: '#fff', 
                        padding: '1.5rem', 
                        borderRadius: '24px', 
                        border: 'none', 
                        fontWeight: 900, 
                        fontSize: '1.2rem', 
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '12px',
                        boxShadow: '0 15px 35px rgba(99, 91, 255, 0.4)',
                        transition: 'all 0.3s',
                        position: 'relative',
                        overflow: 'hidden',
                        width: '100%'
                    }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 25px 45px rgba(99, 91, 255, 0.6)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 15px 35px rgba(99, 91, 255, 0.4)'; }}>
                        <div style={{ position: 'absolute', top: '-50%', right: '-20%', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '10px', borderRadius: '12px', color: '#fff' }}>
                                    <CreditCard size={24} />
                                </div>
                                <span style={{ letterSpacing: '1px' }}>ПЛАТИ С КАРТА</span>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <div style={{ fontStyle: 'italic', fontWeight: 900, color: '#fff', fontSize: '1.1rem', letterSpacing: '-0.5px' }}>VISA</div>
                                <div style={{ display: 'flex', position: 'relative', width: '28px', height: '18px', alignItems: 'center' }}>
                                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#eb001b', position: 'absolute', left: 0 }} />
                                    <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#f79e1b', position: 'absolute', left: '10px', mixBlendMode: 'screen' }} />
                                </div>
                            </div>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, position: 'relative', zIndex: 1 }}>
                            Онлайн подновяване на абонамента
                        </div>
                    </button>
                )}

                {/* Secondary Info Area */}
                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '24px',
                    padding: '1.5rem',
                    border: '1px solid rgba(255,255,255,0.06)'
                }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={14} /> ИСТОРИЯ НА ПЛАЩАНИЯТА
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {[...(client?.renewalHistory || [])].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3).map((rh, index) => (
                            <div key={index} style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                padding: '0.75rem 1rem',
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.03)'
                            }}>
                                <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{getFormattedMonth(rh.month)}</span>
                                <span style={{ fontWeight: 800, color: themeColor }}>{rh.amount} €</span>
                            </div>
                        ))}
                        {(client?.renewalHistory || []).length === 0 && (
                            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem', fontStyle: 'italic', textAlign: 'center' }}>НЯМА ИСТОРИЯ</div>
                        )}
                    </div>
                </div>

                <div style={{ textAlign: 'center', opacity: 0.3, padding: '1rem', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px' }}>
                    ПОСЛЕДНО СКАНЕ: {scanTime} • СИСТЕМЕН РЕФ: {client?.id.toUpperCase()}
                </div>
                
                <React.Suspense fallback={null}>
                    <BusSchedule route={client?.route || ''} />
                </React.Suspense>
            </div>

            {/* Overlays */}
            {isIdle && !loading && !isRegistering && !showPhotoModal && !showRenewConfirm && !showOnlinePayment && (
                <React.Suspense fallback={null}>
                    <AdSlideshow onClose={() => setIsIdle(false)} />
                </React.Suspense>
            )}

            {showRenewConfirm && client && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(20px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ background: '#111', padding: '2rem', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '400px', boxShadow: '0 40px 100px rgba(0,0,0,1)' }}>
                        <h2 style={{ fontSize: '1.5rem', margin: '0 0 1.5rem 0', textAlign: 'center' }}>ПОДНОВЯВАНЕ</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                             <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '8px' }}>МАРШРУТ</div>
                                <select value={renewRoute} onChange={(e) => setRenewRoute(e.target.value)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', fontWeight: 700, padding: '0.5rem', borderRadius: '8px', width: '100%' }}>
                                    {ROUTES.map(r => <option key={r} value={r} style={{ background: '#222' }}>{r}</option>)}
                                </select>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '8px' }}>МЕСЕЦ</div>
                                <input type="month" value={renewMonth} onChange={(e) => setRenewMonth(e.target.value)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', fontWeight: 700, width: '100%', colorScheme: 'dark' }} />
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '8px' }}>СУМА (EUR)</div>
                                <input type="number" value={renewAmount} onChange={(e) => setRenewAmount(Number(e.target.value))} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', fontWeight: 900, width: '100%', textAlign: 'center', outline: 'none' }} />
                            </div>
                        </div>
                        {renewError && <div style={{ color: '#ff1744', textAlign: 'center', marginBottom: '1rem', fontSize: '0.8rem' }}>{renewError}</div>}
                        <button onClick={handleConfirmRenew} style={{ width: '100%', background: '#00e676', color: '#000', padding: '1.2rem', borderRadius: '16px', border: 'none', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer' }}>ПОТВЪРДИ</button>
                        <button onClick={() => setShowRenewConfirm(false)} style={{ width: '100%', background: 'transparent', color: 'rgba(255,255,255,0.4)', padding: '1rem', border: 'none', fontSize: '0.9rem', cursor: 'pointer', marginTop: '0.5rem' }}>ОТКАЗ</button>
                    </div>
                </div>
            )}

            {showOnlinePayment && client && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(24px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="payment-modal" style={{ background: '#fff', color: '#000', padding: '0', borderRadius: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 40px 100px rgba(0,0,0,0.5)', overflow: 'hidden', animation: 'cardEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                        
                        {/* Header */}
                        <div className="payment-header" style={{ background: '#09090b', padding: '2.5rem 2rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <button onClick={() => setShowOnlinePayment(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                                <XCircle size={24} />
                            </button>
                            <div style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '3px', marginBottom: '1rem', textAlign: 'center' }}>
                                <span style={{ color: '#ff1744' }}>DARY</span> <span style={{ color: '#fff' }}>CARD</span> <span style={{ color: '#ff1744' }}>SYSTEM</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#00e676', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldCheck size={18} /> СИГУРНО ПЛАЩАНЕ
                            </div>
                        </div>

                        {/* Body */}
                        <div className="payment-body" style={{ padding: '2rem' }}>
                            {!paymentComplete ? (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#111' }}>Обща сума:</div>
                                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0072ff' }}>50.80 €</div>
                                    </div>

                                    <div className="payment-fields" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginBottom: '2rem' }}>
                                        {/* Month */}
                                        <div>
                                            <div style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>Дължим Месец</div>
                                            <div style={{ background: '#f5f5f7', borderRadius: '12px', padding: '2px', border: '1px solid #e5e5ea', transition: 'border 0.3s' }}>
                                                <input type="month" value={paymentMonth} onChange={(e) => setPaymentMonth(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#111', fontSize: '1.1rem', fontWeight: 700, width: '100%', padding: '12px 16px', outline: 'none' }} />
                                            </div>
                                        </div>

                                        {/* Cardholder */}
                                        <div>
                                            <div style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>Имена на картодържател</div>
                                            <div style={{ background: '#f5f5f7', borderRadius: '12px', padding: '2px', border: '1px solid #e5e5ea', transition: 'border 0.3s' }}>
                                                <input type="text" placeholder="ИМЕ ФАМИЛИЯ" style={{ background: 'transparent', border: 'none', color: '#111', fontSize: '1.1rem', fontWeight: 700, width: '100%', padding: '12px 16px', outline: 'none', textTransform: 'uppercase' }} />
                                            </div>
                                        </div>

                                        {/* Card Number */}
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <div style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Номер на Карта</div>
                                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                    <div style={{ fontStyle: 'italic', fontWeight: 900, color: '#1434CB', fontSize: '1rem', letterSpacing: '-0.5px' }}>VISA</div>
                                                    <div style={{ display: 'flex', position: 'relative', width: '28px', height: '18px', alignItems: 'center' }}>
                                                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#eb001b', position: 'absolute', left: 0 }} />
                                                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#f79e1b', position: 'absolute', left: '10px', mixBlendMode: 'multiply' }} />
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ background: '#f5f5f7', borderRadius: '12px', padding: '2px', border: '1px solid #e5e5ea', display: 'flex', alignItems: 'center', transition: 'border 0.3s' }}>
                                                <div style={{ padding: '0 0 0 16px', color: '#999' }}><CreditCard size={20} /></div>
                                                <input type="text" placeholder="0000 0000 0000 0000" style={{ background: 'transparent', border: 'none', color: '#111', fontSize: '1.2rem', fontWeight: 700, width: '100%', padding: '12px 16px', letterSpacing: '2px', outline: 'none' }} />
                                            </div>
                                        </div>

                                        {/* Expiry & CVC */}
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>Вал. до</div>
                                                <div style={{ background: '#f5f5f7', borderRadius: '12px', padding: '2px', border: '1px solid #e5e5ea' }}>
                                                    <input type="text" placeholder="MM/YY" style={{ background: 'transparent', border: 'none', color: '#111', fontSize: '1.2rem', fontWeight: 700, width: '100%', padding: '12px 16px', outline: 'none', letterSpacing: '1px', textAlign: 'center' }} />
                                                </div>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>CVC</div>
                                                <div style={{ background: '#f5f5f7', borderRadius: '12px', padding: '2px', border: '1px solid #e5e5ea' }}>
                                                    <input type="password" placeholder="***" maxLength={3} style={{ background: 'transparent', border: 'none', color: '#111', fontSize: '1.2rem', fontWeight: 700, width: '100%', padding: '12px 16px', outline: 'none', letterSpacing: '4px', textAlign: 'center' }} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div style={{ fontSize: '0.75rem', color: '#666', textAlign: 'center', marginBottom: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        <Lock size={14} /> Сигурна транзакция. *Включена такса 0.80 €.
                                    </div>
                                    
                                    <button 
                                        onClick={() => {
                                            setIsPaying(true);
                                            setTimeout(() => {
                                                setIsPaying(false);
                                                setPaymentComplete(true);
                                            }, 2000);
                                        }} 
                                        disabled={isPaying}
                                        style={{ width: '100%', background: '#000', color: '#fff', padding: '1.2rem', borderRadius: '16px', border: 'none', fontWeight: 900, fontSize: '1.1rem', cursor: isPaying ? 'not-allowed' : 'pointer', opacity: isPaying ? 0.8 : 1, transition: 'all 0.3s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}
                                    >
                                        {isPaying ? <RefreshCw size={20} className="spin" /> : <Lock size={20} />}
                                        {isPaying ? 'ОБРАБОТКА...' : 'ПЛАТИ 50.80 €'}
                                    </button>
                                </>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '1rem 0 2rem' }}>
                                    <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'rgba(0, 230, 118, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                                        <CheckCircle size={50} color="#00e676" />
                                    </div>
                                    <h3 style={{ margin: 0, color: '#111', fontSize: '1.8rem', fontWeight: 900 }}>ОДОБРЕНО</h3>
                                    <p style={{ color: '#666', textAlign: 'center', fontSize: '1rem', lineHeight: '1.5', fontWeight: 500 }}>
                                        Успешно плащане.<br/> В момента системата е в тестов период и картата ви не е таксувана.
                                    </p>
                                    <button onClick={() => { setShowOnlinePayment(false); setPaymentComplete(false); setPaymentMonth(''); }} style={{ marginTop: '2rem', width: '100%', background: '#f5f5f7', color: '#111', padding: '1.2rem', borderRadius: '16px', border: '1px solid #e0e0e0', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', transition: 'all 0.2s' }}>ЗАТВОРИ</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showPhotoModal && client && (
                <div onClick={() => setShowPhotoModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(30px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out' }}>
                    <img src={client.photo} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '24px', boxShadow: '0 0 100px rgba(0,0,0,1)', border: `2px solid ${themeColor}` }} alt="Zoomed" />
                </div>
            )}

            <style>{`
                @media (max-width: 480px) {
                    .payment-modal {
                        max-height: 90vh;
                        overflow-y: auto;
                        border-radius: 20px !important;
                    }
                    .payment-header {
                        padding: 1.5rem 1rem 1rem !important;
                    }
                    .payment-header > div:nth-of-type(1) {
                        font-size: 1.2rem !important;
                    }
                    .payment-body {
                        padding: 1.2rem !important;
                    }
                    .payment-fields {
                        gap: 0.8rem !important;
                        margin-bottom: 1.2rem !important;
                    }
                    .payment-body input {
                        font-size: 1rem !important;
                        padding: 10px 12px !important;
                    }
                }
                @media (min-width: 1024px) {
                    .id-card-container, .action-area {
                        max-width: 700px !important;
                        padding: 1rem !important;
                    }
                    .photo-frame {
                        width: 190px !important;
                        height: 230px !important;
                    }
                    .holder-name {
                        font-size: 2.5rem !important;
                    }
                    .route-text {
                        font-size: 1.6rem !important;
                    }
                    .valid-month {
                        font-size: 2.2rem !important;
                    }
                }
                @keyframes cardEnter {
                    from { opacity: 0; transform: translateY(30px) scale(0.95); rotate: 1deg; }
                    to { opacity: 1; transform: translateY(0) scale(1); rotate: 0deg; }
                }
                @keyframes hologram {
                    0% { background-position: 0% 0%; }
                    100% { background-position: 200% 200%; }
                }
                .id-card-container::after {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 40%);
                    pointer-events: none;
                    opacity: 0.3;
                    mix-blend-mode: soft-light;
                    transform: rotate(45deg);
                }
                @media (max-width: 600px) {
                    .card-header {
                        padding: 0.8rem 1rem 0.6rem !important;
                    }
                    .card-subtitle {
                        font-size: 0.65rem !important;
                    }
                    .id-card-body {
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        gap: 1.5rem !important;
                    }
                }
                @media (max-width: 480px) {
                    .id-card-body {
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        gap: 1.5rem !important;
                        padding: 1.5rem 1rem !important;
                    }
                    .photo-frame {
                        width: 180px !important;
                        height: 210px !important;
                    }
                    .holder-name {
                        font-size: 1.8rem !important;
                    }
                    .route-text {
                        font-size: 1.3rem !important;
                    }
                    .date-text {
                        font-size: 1.1rem !important;
                    }
                    .validity-content {
                        align-items: center;
                    }
                    .valid-month {
                        font-size: 1.8rem !important;
                    }
                    .status-badge {
                        font-size: 1rem !important;
                        margin-top: 4px !important;
                    }
                    .id-card-container {
                        backdrop-filter: none !important;
                        -webkit-backdrop-filter: none !important;
                        background: rgba(30,30,35,0.8) !important;
                    }
                }
            `}</style>
        </div>


    );
};

export default ClientProfile;
