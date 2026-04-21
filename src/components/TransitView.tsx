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

const TransitView: React.FC<TransitViewProps> = ({ id, onClose }) => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [showManagement, setShowManagement] = useState(false);
    const [unregistered, setUnregistered] = useState(false);
    const [showPhotoModal, setShowPhotoModal] = useState(false);

    // Prop state synchronization to avoid cascading renders in useEffect
    const [prevId, setPrevId] = useState(id);
    if (id !== prevId) {
        setPrevId(id);
        setLoading(true);
        setUnregistered(false);
        setClient(null);
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
                if (snap.exists()) {
                    const data = snap.data() as Client;
                    setClient({ ...data, id: snap.id });
                    
                    const nowLocal = new Date();
                    const currentMonthStrLocal = `${nowLocal.getFullYear()}-${(nowLocal.getMonth() + 1).toString().padStart(2, '0')}`;
                    const hasPaid = (data.renewalHistory || []).some((rh) => rh.month === currentMonthStrLocal);
                    const active = !data.isCanceled && hasPaid;
                    
                    if (active) playSuccessSound();
                    else playErrorSound();
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

        const timer = setTimeout(() => {
            if (isMounted && !showManagementRef.current) onClose();
        }, unregisteredRef.current ? 60000 : 30000); 

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [id, onClose, playErrorSound, playSuccessSound]); 

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
                        
                        {!showManagement ? (
                            <button 
                                onClick={() => setShowManagement(true)}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(30px)', color: '#fff', padding: '2rem', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 900, fontSize: '1.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}
                            >
                                <Settings size={30} /> УПРАВЛЕНИЕ
                            </button>
                        ) : (
                            <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                
                                {/* ADMIN / MODERATOR QUICK ACTIONS */}
                                {isAdmin && (
                                    <button 
                                        onClick={async () => {
                                            const clientRef = doc(db, 'clients', client?.id || '');
                                            const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 7);
                                            await updateDoc(clientRef, {
                                                expiryDate: nextMonth,
                                                renewalHistory: arrayUnion({ date: new Date().toISOString(), amount: 30, month: nextMonth }),
                                                history: arrayUnion({ date: new Date().toISOString(), action: 'БЪРЗО ПОДНОВЯВАНЕ', amount: 30, performedBy: currentUser?.username })
                                            });
                                            playSuccessSound();
                                            window.location.reload();
                                        }}
                                        style={{ width: '100%', background: '#00e676', color: '#000', padding: '1.8rem', borderRadius: '24px', border: 'none', fontWeight: 900, fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}
                                    >
                                        <Zap size={26} /> БЪРЗО ПОДНОВЯВАНЕ
                                    </button>
                                )}

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
        </div>
    );
};

export default TransitView;
