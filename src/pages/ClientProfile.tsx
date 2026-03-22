import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, MapPin, Ban, Clock, User, Settings, RefreshCw, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AdSlideshow from '../components/AdSlideshow';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, updateDoc, increment, arrayUnion, getDoc } from 'firebase/firestore';

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
}

const ROUTES = [
    "Бъркач", "Тръстеник", "Биволаре", "Горна Митрополия", "Долни Дъбник",
    "Рибен", "Садовец", "Славовица", "Байкал", "Гиген",
    "Долна Митрополия", "Ясен", "Крушовица", "Дисевица", "Градина",
    "Петърница", "Опанец", "Победа", "Подем", "Божурица"
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
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    const [regName, setRegName] = useState('');
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

    const [error, setError] = useState<string | null>(null);
    const hasPlayedSound = useRef(false);

    const playSuccessSound = () => {
        try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const context = new AudioContextClass();
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
        } catch (e) { console.error("Audio error", e); }
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
            setIsRegistering(false);
            hasPlayedSound.current = false;
        } catch (err) {
            console.error(err);
            alert('Грешка при записване.');
            setLoading(false);
        }
    };

    const playErrorSound = () => {
        try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const context = new AudioContextClass();
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
        } catch (e) { console.error("Audio error", e); }
    };

    useEffect(() => {
        if (!id) return;
        const unsubscribe = onSnapshot(doc(db, 'clients', id), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as Record<string, unknown>;
                const clientData: Client = { ...data, id: docSnap.id } as Client;
                setClient(clientData);
                if (!hasPlayedSound.current) {
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
        const handler = () => resetIdleTimer();
        events.forEach(event => document.addEventListener(event, handler));
        
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

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: '#fff' }}>
                <div style={{ textAlign: 'center' }}>
                    <RefreshCw className="spin" size={48} color="var(--primary-color)" />
                    <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Зареждане на данни...</p>
                </div>
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
                            <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '1rem' }}>{currentUser ? 'НОВА КАРТА' : 'НЕАКТИВНА КАРТА'}</h2>
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
        const { targetMonth, defaultAmount } = getQuickRenewSummary();
        setRenewAmount(defaultAmount);
        setRenewMonth(targetMonth);
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
            const history = client.history || [];
            const renewalHistory = client.renewalHistory || [];
            const updatedClient = {
                ...client,
                expiryDate: targetMonth,
                amountPaid: (client.amountPaid || 0) + amount,
                isCanceled: false,
                cancelReason: "",
                renewalHistory: [...renewalHistory, { date: new Date().toISOString(), amount, month: targetMonth }],
                history: [...history, {
                    date: new Date().toISOString(),
                    action: 'Бързо Подновяване (Профил)',
                    details: `Месец: ${targetMonth}`,
                    amount,
                    performedBy: currentUser?.username || 'Модератор'
                }]
            };
            await setDoc(doc(db, 'clients', client.id), updatedClient);
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
    const isCanceled = client.isCanceled;
    const hasPaidCurrentMonth = (client.renewalHistory || []).some(rh => rh.month === currentMonthStr);
    const isActive = !isCanceled && hasPaidCurrentMonth;
    const themeColor = isActive ? '#00e676' : '#ff1744';
    let statusText = isCanceled ? 'АНУЛИРАН' : 'НЕАКТИВЕН';
    if (!isCanceled && !hasPaidCurrentMonth) { statusText = `БЕЗ ТАКСА ЗА ${getFormattedMonth(currentMonthStr).split(' ')[0]}`; } 
    else if (isActive) { statusText = 'АКТИВЕН'; }
    const StatusIcon = isActive ? CheckCircle : XCircle;

    return (
        <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ background: themeColor, padding: '2rem 1rem', textAlign: 'center', boxShadow: `0 0 40px ${themeColor}44`, position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', animation: isActive ? 'pulse 2s infinite' : 'none' }}>
                    <StatusIcon size={40} color="#000" /><h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#ffffff', letterSpacing: '2px' }}>{statusText}</h1>
                </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem', gap: '2rem' }}>
                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setShowPhotoModal(true)}>
                    <div style={{ position: 'absolute', inset: '-10px', background: themeColor, borderRadius: '32px', opacity: 0.2, filter: 'blur(20px)' }} />
                    <img src={client.photo} style={{ width: '240px', height: '240px', borderRadius: '24px', objectFit: 'cover', border: `4px solid ${themeColor}`, position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', transition: 'transform 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'} alt="Client" />
                    <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.7rem', color: '#fff', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>КЛИКНИ ЗА УВЕЛИЧЕНИЕ</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '32px', padding: '2.5rem 2rem', width: '100%', maxWidth: '440px', textAlign: 'center', boxShadow: '0 40px 100px rgba(0,0,0,0.5)' }}>
                    <h2 style={{ fontSize: '2.4rem', margin: '0 0 1.5rem 0', fontWeight: 900, color: '#fff' }}>{client.name}</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem' }}>
                            <MapPin size={22} color={themeColor} /><span>КУРС: <strong style={{ color: '#fff' }}>{client.route}</strong></span>
                        </div>
                        <div style={{ background: `${themeColor}15`, padding: '1.5rem', borderRadius: '20px', border: `1px solid ${themeColor}33`, marginTop: '0.5rem' }}>
                            <div style={{ color: themeColor, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '1px' }}>Картата е валидна за</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff' }}>{getFormattedMonth(client.expiryDate)}</div>
                        </div>
                        {client.renewalHistory && client.renewalHistory.length > 0 && (
                            <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.8rem', letterSpacing: '1px' }}>Активни Плащания</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {[...client.renewalHistory].filter(rh => { const now = new Date(); const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`; return rh.month >= currentMonthStr; }).sort((a, b) => a.month.localeCompare(b.month)).slice(0, 3).map((rh, index) => (
                                        <div key={index} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.8rem 1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ fontWeight: 700, color: '#fff' }}>{getFormattedMonth(rh.month)}</div>
                                            <div style={{ fontSize: '0.9rem', color: themeColor, fontWeight: 800 }}>{rh.amount} €</div>
                                        </div>
                                    ))}
                                    {[...client.renewalHistory].filter(rh => { const now = new Date(); const currentStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`; return rh.month >= currentStr; }).length === 0 && (
                                        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.875rem', fontStyle: 'italic' }}>Няма активни бъдещи плащания.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    {currentUser && (
                        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button onClick={initiationRenew} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', background: '#00e676', color: '#ffffff', padding: '1.2rem 2rem', border: 'none', borderRadius: '50px', fontWeight: 900, fontSize: '1.4rem', cursor: 'pointer', boxShadow: '0 0 20px rgba(0, 230, 118, 0.4)', transition: 'transform 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}><RefreshCw size={24} /> ПОДНОВИ</button>
                            <Link to={`/admin?edit=${client.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '0.8rem 2rem', borderRadius: '50px', textDecoration: 'none', fontWeight: 600, fontSize: '1rem', border: '1px solid rgba(255,255,255,0.2)' }}><Settings size={18} /> Управление</Link>
                        </div>
                    )}
                </div>
                <div style={{ marginTop: 'auto', padding: '1.5rem', background: 'rgba(255,255,255,0.03)', width: '100%', borderRadius: '24px 24px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}><Clock size={16} /> Сканирано на: {scanTime}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: themeColor, fontSize: '0.8rem', fontWeight: 600 }}><User size={14} /> ID: {client.id}</div>
                </div>
            </div>

            {/* Ad Slideshow Overlay */}
            {isIdle && !loading && !isRegistering && !showPhotoModal && !showRenewConfirm && (
                <AdSlideshow onClose={() => setIsIdle(false)} />
            )}

            {/* Confirmation Overlay */}
            {showRenewConfirm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
                    <div style={{ background: '#1a1a1a', padding: '2.5rem', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '400px', boxShadow: '0 40px 100px rgba(0,0,0,1)' }}>
                        <div style={{ background: '#00e676', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: '0 0 30px rgba(0,230,118,0.3)' }}><RefreshCw size={40} color="#000" /></div>
                        <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.5rem 0' }}>Подновяване</h2>
                        <div style={{ color: 'var(--primary-color)', fontWeight: 700, fontSize: '1.2rem', marginBottom: '1.5rem' }}>{client.name}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Курс</div><div style={{ fontWeight: 700 }}>{client.route}</div></div>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}><div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Месец за подновяване</div><input type="month" value={renewMonth} onChange={(e) => setRenewMonth(e.target.value)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '1.2rem', fontWeight: 700, padding: '0.5rem 1rem', borderRadius: '12px', width: '100%', outline: 'none', colorScheme: 'dark' }} /></div>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '16px' }}><div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Сума (EUR)</div><div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><input type="number" value={renewAmount} onChange={(e) => setRenewAmount(Number(e.target.value))} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '2rem', fontWeight: 900, padding: '0.5rem 1rem', borderRadius: '12px', width: '140px', textAlign: 'center', outline: 'none' }} /><span style={{ marginLeft: '0.5rem', fontSize: '1.5rem', fontWeight: 800 }}>€</span></div></div>
                        </div>
                        {renewError && <div style={{ color: '#ff4444', marginBottom: '1rem', fontSize: '0.9rem' }}>{renewError}</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button onClick={handleConfirmRenew} style={{ background: '#00e676', color: '#ffffff', border: 'none', padding: '1.2rem', borderRadius: '16px', fontWeight: 800, fontSize: '1.2rem', cursor: 'pointer' }}>Потвърди Плащането</button>
                            <button onClick={() => setShowRenewConfirm(false)} style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', border: 'none', padding: '1rem', fontSize: '1rem', cursor: 'pointer' }}>Отказ</button>
                        </div>
                    </div>
                </div>
            )}

            {showPhotoModal && (
                <div onClick={() => setShowPhotoModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(15px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out', animation: 'fadeIn 0.2s ease' }}>
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={client.photo} style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '24px', boxShadow: '0 0 50px rgba(0,0,0,1)', border: `2px solid ${themeColor}` }} alt="Zoomed Client" />
                        <div style={{ position: 'absolute', top: '2rem', right: '2rem', color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '0.6rem 1.2rem', borderRadius: '50px', fontWeight: 600 }}>Затвори</div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default ClientProfile;
