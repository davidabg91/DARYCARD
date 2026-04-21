import React, { useEffect, useState, useRef } from 'react';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle, XCircle, RefreshCw, Settings, UserPlus, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Client {
    id: string;
    name: string;
    route: string;
    photo: string;
    isCanceled?: boolean;
    renewalHistory?: { month: string; amount: number; date: string }[];
}

interface TransitViewProps {
    id: string;
    onClose: () => void;
    onUnregistered: (id: string) => void;
}

const ROUTES = [
    "Бъркач", "Тръстеник", "Биволаре", "Горна Митрополия", "Долни Дъбник",
    "Рибен", "Садовец", "Славовица", "Байкал", "Гиген",
    "Долна Митрополия", "Ясен", "Крушовица", "Дисевица", "Търнене", "Градина",
    "Петърница", "Опанец", "Победа", "Подем", "Божурица",
    "Ясен-Дисевица",
    "Д. Дъбник - Садовец", "Д.Митрополия - Тръстеник", "Д.Митрополия - Славовица"
];

const TransitView: React.FC<TransitViewProps> = ({ id, onClose }) => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [showManagement, setShowManagement] = useState(false);
    const [unregistered, setUnregistered] = useState(false);
    const [showPhotoModal, setShowPhotoModal] = useState(false);

    // Quick Renewal States
    const [showQuickRenew, setShowQuickRenew] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [renewalMonth, setRenewalMonth] = useState('');
    const [renewalAmount, setRenewalAmount] = useState(30);
    const [renewalRoute, setRenewalRoute] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // Ads Slideshow States
    const [showAds, setShowAds] = useState(false);
    const [currentAdIndex, setCurrentAdIndex] = useState(0);
    const [lastActivity, setLastActivity] = useState(Date.now());
    const [isActuallyOnline, setIsActuallyOnline] = useState(window.navigator.onLine);

    const adImages = [
        '/assets/ads/ad_alps.webp',
        '/assets/ads/ad_kitai.webp',
        '/assets/ads/ad_paris.webp',
        '/assets/ads/ad_riviera.webp'
    ];

    // Prop state synchronization to avoid cascading renders in useEffect
    const [prevId, setPrevId] = useState(id);
    if (id !== prevId) {
        setPrevId(id);
        setLoading(true);
        setUnregistered(false);
        setClient(null);
        setShowAds(false); // INTERRUPT ADS ON NEW SCAN
    }

    // Use refs for values needed in the effect timer to avoid dependency loops
    const showManagementRef = useRef(showManagement);
    const unregisteredRef = useRef(unregistered);

    useEffect(() => { showManagementRef.current = showManagement; }, [showManagement]);
    useEffect(() => { unregisteredRef.current = unregistered; }, [unregistered]);
    
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'moderator';

    // Bulgarian Month Formatter
    const formatBGMonth = (monthStr: string) => {
        if (!monthStr || !monthStr.includes('-')) return monthStr;
        const [year, month] = monthStr.split('-');
        const monthsBG: Record<string, string> = {
            '01': 'ЯНУАРИ', '02': 'ФЕВРУАРИ', '03': 'МАРТ', '04': 'АПРИЛ',
            '05': 'МАЙ', '06': 'ЮНИ', '07': 'ЮЛИ', '08': 'АВГУСТ',
            '09': 'СЕПТЕМВРИ', '10': 'ОКТОМВРИ', '11': 'НОЕМВРИ', '12': 'ДЕКЕМВРИ'
        };
        return `${monthsBG[month] || month} ${year}`;
    };

    // Audio State
    const audioContextRef = useRef<AudioContext | null>(null);

    const initAudio = () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
        }
    };

    const playTone = (freq: number, start: number, duration: number, vol: number = 0.08) => {
        const context = audioContextRef.current;
        if (!context) return;
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

    const playSuccessSound = React.useCallback(() => {
        initAudio();
        playTone(587.33, 0, 0.5);      // D5
        playTone(739.99, 0.08, 0.5);   // F#5
        playTone(880.00, 0.16, 0.6);   // A5
        playTone(1174.66, 0.24, 0.7);  // D6
    }, []);

    // 📡 SMART PING: Verified internet check
    const checkActualStatus = useCallback(async () => {
         const controller = new AbortController();
         const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
         try {
            const res = await fetch(`/version.json?t=${Date.now()}`, { 
                method: 'HEAD', 
                cache: 'no-store',
                signal: controller.signal 
            });
            clearTimeout(timeoutId);
            const isOnline = res.ok;
            setIsActuallyOnline(isOnline);
         } catch {
            clearTimeout(timeoutId);
            setIsActuallyOnline(false);
         }
    }, [setIsActuallyOnline]);

    const playErrorSound = React.useCallback(() => {
        initAudio();
        const context = audioContextRef.current;
        if (!context) return;
        const createBuzz = (startTime: number, duration: number) => {
            const osc1 = context.createOscillator();
            const osc2 = context.createOscillator();
            const gain = context.createGain();
            osc1.type = 'sawtooth';
            osc2.type = 'sawtooth';
            osc1.frequency.setValueAtTime(140, context.currentTime + startTime);
            osc2.frequency.setValueAtTime(142, context.currentTime + startTime);
            gain.gain.setValueAtTime(0, context.currentTime + startTime);
            gain.gain.linearRampToValueAtTime(0.1, context.currentTime + startTime + 0.01);
            gain.gain.linearRampToValueAtTime(0, context.currentTime + startTime + duration);
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(context.destination);
            osc1.start(context.currentTime + startTime);
            osc2.start(context.currentTime + startTime);
            osc1.stop(context.currentTime + startTime + duration);
            osc2.stop(context.currentTime + startTime + duration);
        };
        createBuzz(0, 0.2);
        createBuzz(0.25, 0.4);
    }, []);

    useEffect(() => {
        let isMounted = true;
        if (!id) return;

        getDoc(doc(db, 'clients', id)).then((snap) => {
            if (isMounted) {
                // INSTANT CONNECTIVITY SENSE: Check metadata + trigger ping
                if (snap.metadata.fromCache) {
                    setIsActuallyOnline(false);
                }
                checkActualStatus();

                if (snap.exists()) {
                    const data = snap.data() as Client;
                    setClient({ ...data, id: snap.id });
                    
                    // Preset Renewal Form
                    const nextDate = new Date();
                    nextDate.setMonth(nextDate.getMonth() + 1);
                    setRenewalMonth(nextDate.toISOString().slice(0, 7));
                    setRenewalAmount(data.renewalHistory?.[data.renewalHistory.length - 1]?.amount || 30);
                    setRenewalRoute(data.route || '');

                    const nowLocal = new Date();
                    const currentMonthStrLocal = `${nowLocal.getFullYear()}-${(nowLocal.getMonth() + 1).toString().padStart(2, '0')}`;
                    const hasPaid = (data.renewalHistory || []).some((rh) => rh.month === currentMonthStrLocal);
                    const active = !data.isCanceled && hasPaid;
                    
                    if (active) playSuccessSound();
                    else playErrorSound();
                    
                    // Reset activity timer on scan
                    setLastActivity(Date.now());
                } else {
                    playErrorSound();
                    setUnregistered(true);
                }
                setLoading(false);
            }
        }).catch(err => {
            console.error("Transit fetch error:", err);
            if (isMounted) setLoading(false);
        });

        return () => {
            isMounted = false;
        };
    }, [id, playErrorSound, playSuccessSound]); 

    // IDLE DETECTION & SLIDESHOW LOGIC
    useEffect(() => {
        const resetActivity = () => setLastActivity(Date.now());
        window.addEventListener('touchstart', resetActivity);
        window.addEventListener('mousedown', resetActivity);

        const idleCheck = setInterval(() => {
            if (Date.now() - lastActivity > 30000 && !showAds && !showManagementRef.current && !showPhotoModal && !showSuccessModal) {
                setShowAds(true);
            }
        }, 1000);
        checkActualStatus();
        const pingInterval = setInterval(checkActualStatus, 5000); // Check every 5s

        return () => {
            window.removeEventListener('touchstart', resetActivity);
            window.removeEventListener('mousedown', resetActivity);
            clearInterval(idleCheck);
            clearInterval(pingInterval);
        };
    }, [lastActivity, showAds, showPhotoModal, showSuccessModal, checkActualStatus]);

    // SLIDESHOW AUTO-PLAY
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (showAds) {
            interval = setInterval(() => {
                setCurrentAdIndex(prev => (prev + 1) % adImages.length);
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [showAds, adImages.length]);

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    const hasPaidCurrentMonth = (client?.renewalHistory || []).some((rh) => rh.month === currentMonthStr);
    const isValid = client && !client.isCanceled && hasPaidCurrentMonth;
    const themeColor = unregistered ? '#ff9100' : (isValid ? '#00e676' : '#ff1744');

    if (loading && !client) {
        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(30px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#00e676', fontSize: '1.5rem', fontWeight: 900, animation: 'pulse 1.5s infinite' }}>ПРОВЕРКА...</div>
            </div>
        );
    }

    return (
        <div style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 10000, 
            background: '#050505', 
            display: 'block',
            overflowY: 'auto',
            fontFamily: '"Outfit", "Inter", sans-serif',
            color: '#fff',
            WebkitOverflowScrolling: 'touch'
        }} onClick={onClose}>
            
            {/* Environmental Glow */}
            <div style={{ 
                position: 'fixed', 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)',
                width: '150%', 
                height: '100%', 
                background: `radial-gradient(circle, ${themeColor}22 0%, transparent 70%)`, 
                filter: 'blur(100px)', 
                pointerEvents: 'none',
                zIndex: 0
            }} />

            {/* Content Wrapper - SCROLLABLE CONTAINER */}
            <div style={{ 
                width: '98%',
                margin: '0 auto',
                display: 'block',
                minHeight: '100%'
            }}>
                
                {/* HERO SECTION - 100% VISIBLE HEIGHT */}
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '1.5rem',
                    paddingBottom: '2rem' // Minimal padding to ensure look is balanced
                }}>
                    {/* ID Card - FULL SCALE HERO */}
                    <div style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.04)',
                        backdropFilter: 'blur(40px)',
                        WebkitBackdropFilter: 'blur(40px)',
                        borderRadius: '44px',
                        border: `1px solid ${isValid ? '#00e676' : '#ff1744'}44`,
                        boxShadow: '0 40px 120px rgba(0,0,0,0.6)',
                        position: 'relative',
                        overflow: 'hidden',
                        animation: 'cardAppear 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                        zIndex: 10,
                        padding: '3rem 2rem'
                    }} onClick={(e) => e.stopPropagation()}>
                        
                        {unregistered ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', textAlign: 'center' }}>
                               <div style={{ background: 'rgba(255,145,0,0.1)', padding: '20px', borderRadius: '50%' }}>
                                   <XCircle size={80} color="#ff9100" />
                               </div>
                               <h2 style={{ fontSize: '2.5rem', fontWeight: 900 }}>НЕПОЗНАТА КАРТА</h2>
                               <p style={{ opacity: 0.6 }}>Системата не откри регистриран клиент за този линк.</p>
                               {isAdmin && (
                                   <button 
                                     onClick={() => { onClose(); navigate(`/admin?register=true&id=${id}`); }}
                                     style={{ width: '90%', background: '#ff9100', color: '#000', padding: '1.8rem', borderRadius: '24px', border: 'none', fontWeight: 900, fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', boxShadow: '0 10px 30px rgba(255,145,0,0.3)' }}
                                   >
                                       <UserPlus size={24} /> ДОБАВИ КЛИЕНТ
                                   </button>
                               )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5rem' }}>
                                {/* Connectivity Status Label */}
                                <div style={{ fontSize: '0.65rem', fontWeight: 900, opacity: 0.4, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '-2rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isActuallyOnline ? '#00e676' : '#ff5252' }} />
                                    {isActuallyOnline ? 'СВЪРЗАН СЪС СЪРВЪРА' : 'БЕЗ ИНТЕРНЕТ (ЛОКАЛНА ПАМЕТ)'}
                                </div>

                                {/* Status Badge */}
                                <div style={{ background: `${themeColor}22`, padding: '12px 24px', borderRadius: '20px', fontSize: '1.1rem', fontWeight: 900, color: themeColor, display: 'flex', alignItems: 'center', gap: '12px', letterSpacing: '1px' }}>
                                    {isValid ? <CheckCircle size={24} /> : <XCircle size={24} />}
                                    {isValid ? 'ВАЛИДЕН АБОНАМЕНТ' : 'НЕВАЛИДЕН АБОНАМЕНТ'}
                                </div>

                                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setShowPhotoModal(true)}>
                                    <div style={{ position: 'absolute', inset: '-15px', background: themeColor, borderRadius: '50%', opacity: 0.2, filter: 'blur(20px)' }} />
                                    <img src={client?.photo} style={{ width: '220px', height: '220px', objectFit: 'cover', borderRadius: '50.5%', border: `4px solid ${themeColor}`, position: 'relative', boxShadow: '0 30px 60px rgba(0,0,0,0.7)' }} alt="Profile" />
                                </div>

                                <div style={{ textAlign: 'center' }}>
                                    <h2 style={{ fontSize: '1.7rem', fontWeight: 900, margin: '0 0 0.4rem 0', letterSpacing: '-0.5px' }}>{client?.name?.toUpperCase()}</h2>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 700, opacity: 0.6, color: themeColor }}>{client?.route}</div>
                                </div>

                                <div style={{ width: '100%', background: 'rgba(255,255,255,0.03)', borderRadius: '24px', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px' }}>ВАЛИДНОСТ ДО КРАЯ НА</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 900 }}>{formatBGMonth(currentMonthStr)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* MANAGEMENT SECTION - BELOW THE FOLD */}
                {!unregistered && (
                    <div style={{ width: '100%', paddingBottom: '4rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
                        
                        {/* ADMIN / MODERATOR QUICK ACTIONS - NOW ALWAYS VISIBLE FOR ADMINS */}
                        {isAdmin && (
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '28px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                {!showQuickRenew ? (
                                    <button 
                                        onClick={() => setShowQuickRenew(true)}
                                        style={{ width: '100%', background: '#00e676', color: '#000', padding: '1.8rem', borderRadius: '24px', border: 'none', fontWeight: 900, fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}
                                    >
                                        <Zap size={26} /> БЪРЗО ПОДНОВЯВАНЕ
                                    </button>
                                ) : (
                                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <div style={{ fontWeight: 900, fontSize: '1rem', color: '#00e676' }}>МЕНЮ ПЛАЩАНЕ</div>
                                            <button onClick={() => setShowQuickRenew(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ОТКАЗ</button>
                                        </div>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{ fontSize: '0.7rem', opacity: 0.5, fontWeight: 900 }}>МЕСЕЦ</label>
                                                <input 
                                                    type="month" 
                                                    value={renewalMonth} 
                                                    onChange={(e) => setRenewalMonth(e.target.value)}
                                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px', borderRadius: '12px', fontSize: '1rem', fontWeight: 700 }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <label style={{ fontSize: '0.7rem', opacity: 0.5, fontWeight: 900 }}>СУМА (ЛВ)</label>
                                                <input 
                                                    type="number" 
                                                    value={renewalAmount} 
                                                    onChange={(e) => setRenewalAmount(Number(e.target.value))}
                                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px', borderRadius: '12px', fontSize: '1rem', fontWeight: 700 }}
                                                />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <label style={{ fontSize: '0.7rem', opacity: 0.5, fontWeight: 900 }}>МАРШРУТ / КУРС</label>
                                            <select 
                                                value={renewalRoute} 
                                                onChange={(e) => setRenewalRoute(e.target.value)}
                                                style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, outline: 'none', colorScheme: 'dark' }}
                                            >
                                                <option value="">Избери маршрут...</option>
                                                {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>

                                        <button 
                                            disabled={isUpdating}
                                            onClick={async () => {
                                                setIsUpdating(true);
                                                try {
                                                    const clientRef = doc(db, 'clients', client?.id || '');
                                                    await updateDoc(clientRef, {
                                                        expiryDate: renewalMonth,
                                                        route: renewalRoute,
                                                        renewalHistory: arrayUnion({ 
                                                            date: new Date().toISOString(), 
                                                            amount: renewalAmount, 
                                                            month: renewalMonth 
                                                        }),
                                                        history: arrayUnion({ 
                                                            date: new Date().toISOString(), 
                                                            action: 'БЪРЗО ПОДНОВЯВАНЕ', 
                                                            amount: renewalAmount, 
                                                            month: renewalMonth,
                                                            route: renewalRoute,
                                                            performedBy: currentUser?.username 
                                                        })
                                                    });
                                                    playSuccessSound();
                                                    setShowQuickRenew(false);
                                                    setShowSuccessModal(true);
                                                } catch (err) {
                                                    console.error(err);
                                                    playErrorSound();
                                                } finally {
                                                    setIsUpdating(false);
                                                }
                                            }}
                                            style={{ width: '100%', background: '#00e676', color: '#000', padding: '1.5rem', borderRadius: '18px', border: 'none', fontWeight: 900, fontSize: '1.2rem', marginTop: '0.5rem', boxShadow: '0 10px 20px rgba(0,230,118,0.2)' }}
                                        >
                                            {isUpdating ? 'ОБРАБОТКА...' : 'ПОДНОВИ'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {!showManagement ? (
                            <button 
                                onClick={() => setShowManagement(true)}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(30px)', color: '#fff', padding: '2rem', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 900, fontSize: '1.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}
                            >
                                <Settings size={30} /> УПРАВЛЕНИЕ
                            </button>
                        ) : (
                            <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <button 
                                    onClick={() => { onClose(); navigate(`/client/${client?.id}`); }}
                                    style={{ width: '100%', background: '#fff', color: '#000', padding: '1.8rem', borderRadius: '24px', border: 'none', fontWeight: 900, fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}
                                >
                                    <RefreshCw size={26} /> ПЛАТИ СЕГА / ОНЛАЙН
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes cardAppear {
                    from { opacity: 0; transform: scale(0.95) translateY(20px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes pulse {
                    0% { opacity: 0.5; }
                    50% { opacity: 1; }
                    100% { opacity: 0.5; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* FULLSCREEN PHOTO VIEWER MODAL */}
            {showPhotoModal && (
                <div 
                    style={{ 
                        position: 'fixed', 
                        inset: 0, 
                        zIndex: 20000, 
                        background: 'rgba(0,0,0,0.98)', 
                        backdropFilter: 'blur(20px)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        animation: 'fadeIn 0.2s ease-out'
                    }} 
                    onClick={(e) => { e.stopPropagation(); setShowPhotoModal(false); }}
                >
                    <img 
                        src={client?.photo} 
                        style={{ 
                            maxWidth: '95vw', 
                            maxHeight: '85vh', 
                            borderRadius: '24px', 
                            boxShadow: '0 0 100px rgba(0,0,0,0.8)',
                            border: '2px solid rgba(255,255,255,0.1)' 
                        }} 
                        alt="Zoom" 
                    />
                    <div style={{ position: 'absolute', bottom: '10vh', background: 'rgba(255,255,255,0.1)', padding: '12px 24px', borderRadius: '30px', color: '#fff', fontSize: '0.9rem', fontWeight: 900 }}>
                        КЛИКНИ ЗА ЗАТВАРЯНЕ
                    </div>
                </div>
            )}

            {/* SUCCESS CONFIRMATION MODAL */}
            {showSuccessModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 30000, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(40px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#111', width: '100%', maxWidth: '400px', borderRadius: '40px', border: '1px solid #00e676', padding: '2.5rem', textAlign: 'center', animation: 'cardAppear 0.4s ease' }}>
                        <div style={{ background: 'rgba(0,230,118,0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                            <CheckCircle size={50} color="#00e676" />
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '1rem' }}>УСПЕШНО!</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '2rem', textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '24px' }}>
                            <div style={{ fontSize: '0.9rem', opacity: 0.5 }}>ПОДНОВЕНО ЗА:</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 900, marginTop: '-5px' }}>{formatBGMonth(renewalMonth)}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                                <span>СУМА:</span>
                                <span style={{ color: '#00e676', fontWeight: 900 }}>{renewalAmount} ЛВ.</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>ЛИНИЯ:</span>
                                <span style={{ fontWeight: 900 }}>{renewalRoute}</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => window.location.reload()}
                            style={{ width: '100%', background: '#00e676', color: '#000', padding: '1.5rem', borderRadius: '20px', border: 'none', fontWeight: 900, fontSize: '1.2rem', cursor: 'pointer' }}
                        >
                            ГОТОВО
                        </button>
                    </div>
                </div>
            )}

            {/* IDLE ADS SLIDESHOW OVERLAY */}
            {showAds && (
                <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 40000, background: '#000', animation: 'fadeIn 0.5s ease' }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowAds(false);
                        setLastActivity(Date.now());
                    }}
                >
                    {adImages.map((img, idx) => (
                        <div 
                            key={img}
                            style={{ 
                                position: 'absolute', 
                                inset: 0, 
                                opacity: currentAdIndex === idx ? 1 : 0, 
                                transition: 'opacity 1s ease-in-out',
                                background: `url(${img}) center center / contain no-repeat`
                            }}
                        />
                    ))}
                    
                    {/* Interaction Hint */}
                    <div style={{ position: 'absolute', bottom: '5vh', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', padding: '12px 24px', borderRadius: '30px', color: '#fff', fontSize: '0.9rem', fontWeight: 900, border: '1px solid rgba(255,255,255,0.1)', animation: 'pulse 2s infinite' }}>
                        ДОКОСНИ ЕКРАНА ЗА ВРЪЩАНЕ
                    </div>

                    <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '10px', opacity: 0.3, zIndex: 100 }}>v4.8-HYPER-SENSE</div>
                    <div style={{ position: 'absolute', top: '4vh', right: '4vh', display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(0,0,0,0.4)', padding: '10px 20px', borderRadius: '20px', backdropFilter: 'blur(10px)' }}>
                         <img src={client?.photo} style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #00e676' }} alt="Mini Profile" />
                         <span style={{ fontWeight: 900, fontSize: '0.8rem' }}>{client?.name?.split(' ')[0]}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransitView;
