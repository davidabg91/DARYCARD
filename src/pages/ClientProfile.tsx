import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Ban, Clock, Settings, RefreshCw, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AdSlideshow from '../components/AdSlideshow';
import BusSchedule from '../components/BusSchedule';
import { db } from '../firebase';
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
    const [renewRoute, setRenewRoute] = useState<string>(''); 
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
                background: 'rgba(255, 255, 255, 0.02)',
                backdropFilter: 'blur(30px)',
                WebkitBackdropFilter: 'blur(30px)',
                borderRadius: '32px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 40px 100px rgba(0,0,0,0.6), inset 0 0 40px rgba(255,255,255,0.02)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                animation: 'cardEnter 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                zIndex: 10,
                willChange: 'transform, opacity, backdrop-filter'
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
                    background: 'rgba(255,255,255,0.03)'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: themeColor, letterSpacing: '2px', textTransform: 'uppercase' }}>DARY CARD</span>
                        <span className="card-subtitle" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>УДОСТОВЕРЕНИЕ ЗА ПЪТУВАНЕ</span>
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
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: themeColor, boxShadow: `0 0 8px ${themeColor}` }} />
                        ЗАЩИТЕНО
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
                    <div style={{ opacity: 0.3 }}>
                         <div style={{ height: '24px', width: '24px', borderRadius: '50%', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 900 }}>D</div>
                    </div>
                </div>
            </div>

            {/* Action Area (Outside Card) */}
            <div className="action-area" style={{ marginTop: '2.5rem', width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

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
                
                <BusSchedule route={client?.route || ''} />
            </div>

            {/* Overlays */}
            {isIdle && !loading && !isRegistering && !showPhotoModal && !showRenewConfirm && (
                <AdSlideshow onClose={() => setIsIdle(false)} />
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

            {showPhotoModal && client && (
                <div onClick={() => setShowPhotoModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(30px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out' }}>
                    <img src={client.photo} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '24px', boxShadow: '0 0 100px rgba(0,0,0,1)', border: `2px solid ${themeColor}` }} alt="Zoomed" />
                </div>
            )}

            <style>{`
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
