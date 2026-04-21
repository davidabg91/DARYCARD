import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Ban, Clock, Settings, RefreshCw, Camera, CreditCard, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, updateDoc, increment, arrayUnion, addDoc, collection } from 'firebase/firestore';
import LoadingScreen from '../components/LoadingScreen';

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
    address?: string;
    school?: string;
}

const ROUTES = [
    "Бъркач", "Тръстеник", "Биволаре", "Горна Митрополия", "Долни Дъбник",
    "Рибен", "Садовец", "Славовица", "Байкал", "Гиген",
    "Долна Митрополия", "Ясен", "Крушовица", "Дисевица", "Търнене", "Градина",
    "Петърница", "Опанец", "Победа", "Подем", "Божурица",
    "Ясен-Дисевица",
    "Д. Дъбник - Садовец", "Д.Митрополия - Тръстеник", "Д.Митрополия - Славовица"
];
const SCHOOLS = [
    "ДФСГ",
    "МГ ГЕО МИЛЕВ",
    "МЕД. УНИВЕРСИТЕТ",
    "ОУ „Д-Р ПЕТЪР БЕРОН“",
    "ОУ „ЦВ СПАСОВ“",
    "ПГ ЕХТ",
    "ПГ ЛВ",
    "ПГ МЕТ",
    "ПГ ОТ „ХР БОЯДЖИЕВ“",
    "ПГ ПССТ",
    "ПГ ПЧЕ",
    "ПГ САГ",
    "ПГ Т „ЦВ ЛАЗАРОВ“",
    "ПГ ТУРИЗЪМ",
    "ПГ ХВТ",
    "СУ „АН. ДИМИТРОВА“",
    "СУ „Г. БЕНКОВСКИ“",
    "СУ „ИВ. ВАЗОВ“",
    "СУ „СТ. ЗАИМОВ“"
].sort((a, b) => a.localeCompare(b, 'bg'));

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
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    const [regName, setRegName] = useState('');
    const [regCardType, setRegCardType] = useState('Нормална карта');
    const [regSelectedSchool, setRegSelectedSchool] = useState('');
    const [regCustomSchool, setRegCustomSchool] = useState('');
    const [regRoute, setRegRoute] = useState('');
    const [regAmount, setRegAmount] = useState('50');
    const [regPhoto, setRegPhoto] = useState<string | null>(null);
    const [regAddress, setRegAddress] = useState('');

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

    const [paymentMonth, setPaymentMonth] = useState<string>('');
    const [isPaying, setIsPaying] = useState(false);
    const [paymentComplete, setPaymentComplete] = useState(false);


    const [error, setError] = useState<string | null>(null);
    const hasPlayedSound = useRef(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioInitializedRef = useRef(false);
    const soundPendingRef = useRef<'success' | 'error' | null>(null);

    const playSuccessSound = React.useCallback(() => {
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
    }, []);

    const playErrorSound = React.useCallback(() => {
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
    }, []);

    const initAudio = React.useCallback(() => {
        if (audioInitializedRef.current) return;
        try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audioContextRef.current = new AudioContextClass();
            if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume();
            }
            audioInitializedRef.current = true;
            if (soundPendingRef.current === 'success') playSuccessSound();
            else if (soundPendingRef.current === 'error') playErrorSound();
            soundPendingRef.current = null;
        } catch (e) { console.error("Audio init error", e); }
    }, [playSuccessSound, playErrorSound]);

    // Fast Switch Logic: Sync state when ID changes during render (per React best practices)
    const [prevId, setPrevId] = useState(id);
    if (id !== prevId) {
        setPrevId(id);
        setClient(null);
        // Important: We don't set loading to true here to avoid the full-page LoadingScreen flicker.
        // We let the inline logic handle the data arrival.
        setError(null);
        setIsRegistering(false);
    }

    useEffect(() => {
        hasPlayedSound.current = false;
        initAudio();
    }, [id, initAudio]);

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
            address: regCardType === 'Пенсионерска карта' ? regAddress : '',
            school: regCardType === 'Ученическа карта' ? (regSelectedSchool === 'custom' ? regCustomSchool : regSelectedSchool) : '',
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

    useEffect(() => {
        if (!id) return;
        const unsubscribe = onSnapshot(doc(db, 'clients', id), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as Record<string, unknown>;
                const clientData: Client = { ...data, id: docSnap.id } as Client;
                setClient(clientData);
                if (!hasPlayedSound.current) {
                    initAudio();
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
            }
            setLoading(false);
        }, (err) => {
            console.error("Firestore error:", err);
            setError(err.message);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [id, initAudio, playSuccessSound, playErrorSound]); // Removed cloudSyncStatus to prevent re-subscription flicker

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

    useEffect(() => {
        const resetIdleTimer = () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

            if (loading || isRegistering || showPhotoModal) return;

            idleTimerRef.current = setTimeout(() => {
                // Idle slideshow removed to match old UI
            }, 30000); 
        };

        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        const handler = () => {
            initAudio(); 
            resetIdleTimer();
        };
        events.forEach(event => document.addEventListener(event, handler, { passive: true }));
        
        if (!loading && !isRegistering && !showPhotoModal) {
            idleTimerRef.current = setTimeout(() => {
                 // Idle indicator
            }, 30000);
        }

        return () => {
            events.forEach(event => document.removeEventListener(event, handler));
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [loading, isRegistering, showPhotoModal, initAudio]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') {
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [initAudio]);




    if (loading && !client) {
        return <LoadingScreen />;
    }

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: '#fff', padding: '1rem' }}>
                <div style={{ textAlign: 'center', maxWidth: '400px', width: '100%' }}>
                    <Ban size={64} color="var(--error-color)" style={{ marginBottom: '1.5rem' }} />
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--error-color)', marginBottom: '0.5rem' }}>Картата не е намерена</h1>
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
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>ВИД КАРТА</label><select value={regCardType} onChange={e => setRegCardType(e.target.value)} style={{ width: '100%', padding: '1rem', background: '#222', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }}>
                                    <option value="Нормална карта">Нормална карта</option>
                                    <option value="Ученическа карта">Ученическа карта</option>
                                    <option value="Пенсионерска карта">Пенсионерска карта</option>
                                    <option value="Инвалидна карта">Инвалидна карта</option>
                                </select></div>
                                {regCardType === 'Ученическа карта' && (
                                    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--primary-color)', marginBottom: '0.4rem', display: 'block', fontWeight: 800 }}>УЧИЛИЩЕ</label>
                                            <select 
                                                value={regSelectedSchool} 
                                                onChange={e => setRegSelectedSchool(e.target.value)} 
                                                style={{ width: '100%', padding: '1rem', background: '#222', border: '1px solid var(--primary-color)', borderRadius: '12px', color: '#fff', outline: 'none' }}
                                                required={regCardType === 'Ученическа карта'}
                                            >
                                                <option value="">Избери училище...</option>
                                                {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                                                <option value="custom">Друго (въведи ръчно)...</option>
                                            </select>
                                        </div>
                                        {regSelectedSchool === 'custom' && (
                                            <div style={{ animation: 'slideDown 0.3s ease' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>ИМЕ НА УЧИЛИЩЕ</label>
                                                <input 
                                                    value={regCustomSchool} 
                                                    onChange={e => setRegCustomSchool(e.target.value)} 
                                                    style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }} 
                                                    placeholder="Въведи училище..." 
                                                    required={regSelectedSchool === 'custom'}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                                {regCardType === 'Пенсионерска карта' && (
                                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                        <label style={{ fontSize: '0.8rem', color: '#ffab00', marginBottom: '0.4rem', display: 'block', fontWeight: 800 }}>АДРЕС (Задължително за пенсионери)</label>
                                        <input 
                                            value={regAddress} 
                                            onChange={e => setRegAddress(e.target.value)} 
                                            style={{ width: '100%', padding: '1rem', background: 'rgba(255,171,0,0.05)', border: '1px solid rgba(255,171,0,0.3)', borderRadius: '12px', color: '#ffab00', outline: 'none' }} 
                                            placeholder="напр. гр. Плевен, ул. Свобода 1..." 
                                            required={regCardType === 'Пенсионерска карта'}
                                        />
                                    </div>
                                )}
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
            {/* Environment Glow - Changes based on status */}
            <div style={{ 
                position: 'fixed', 
                top: '20%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)',
                width: '120%', 
                height: '60%', 
                background: `${themeColor}11`, 
                pointerEvents: 'none',
                pointerEvents: 'none',
                zIndex: 0,
                transition: 'background 0.5s ease'
            }} />
            
            <div style={{ position: 'absolute', top: '10px', right: '15px', fontSize: '10px', opacity: 0.3, zIndex: 100 }}>v2.4-ULTRA</div>
            {/* Background Decor */}
            <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '40%', height: '40%', background: `${themeColor}05`, borderRadius: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '40%', height: '40%', background: `${themeColor}05`, borderRadius: '50%', pointerEvents: 'none' }} />

            {/* The Modern ID CARD */}
            <div className="id-card-container" style={{
                width: '100%',
                maxWidth: '440px',
                background: '#18181b',
                borderRadius: '32px',
                border: `1px solid ${themeColor}44`,
                boxShadow: `0 20px 60px rgba(0,0,0,0.5)`,
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 10
            }}>
                {/* Holographic Animation Overlay */}

                {/* Card Top Branding */}
                <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 900, color: themeColor, letterSpacing: '3px' }}>DARY CARD</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>{client?.cardType?.toUpperCase() || 'УДОСТОВЕРЕНИЕ'}</span>
                    </div>
                        <div style={{
                        background: `${themeColor}22`,
                        padding: '6px 12px',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 900,
                        color: themeColor,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        {isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {statusText}
                    </div>
                </div>

                {/* Card Core Content */}
                <div style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', textAlign: 'center' }}>
                    {/* Centered Photo with Glow */}
                    <div style={{ position: 'relative' }} onClick={() => setShowPhotoModal(true)}>
                        <div style={{
                            position: 'absolute',
                            inset: '-10px',
                            background: themeColor,
                            borderRadius: '50%',
                            opacity: 0.1,
                        }} />
                        <img 
                            src={client.photo} 
                            style={{ 
                                width: '160px', 
                                height: '160px', 
                                objectFit: 'cover', 
                                borderRadius: '50.5%', 
                                border: `3px solid ${themeColor}`,
                                boxShadow: `0 20px 40px rgba(0,0,0,0.5)`,
                                position: 'relative'
                            }} 
                            alt="Profile" 
                        />
                    </div>

                    <div>
                        <h2 style={{ fontSize: '2.2rem', fontWeight: 900, margin: '0 0 0.4rem 0', letterSpacing: '-1px' }}>{client.name.toUpperCase()}</h2>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: themeColor, opacity: 0.8 }}>{client.route}</div>
                    </div>

                    <div style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '20px',
                        padding: '1.2rem',
                        border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>ВАЛИДНОСТ ДО КРАЯ НА</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900 }}>{getFormattedMonth(hasPaidCurrentMonth ? currentMonthStr : client.expiryDate)}</div>
                    </div>
                </div>

                {/* Footer Security Element */}
                <div style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>#{client.id.substring(0,8).toUpperCase()}</span>
                    <Settings size={16} style={{ opacity: 0.1 }} />
                </div>
            </div>

            {/* Account Actions / Payment Area */}
            <div style={{ width: '100%', maxWidth: '440px', marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Online Payment Panel */}
                {!currentUser && !client?.isCanceled && (
                    <div style={{
                        background: '#18181b',
                        borderRadius: '28px',
                        padding: '1.5rem',
                        border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                            <div style={{ background: 'rgba(0,230,118,0.1)', padding: '8px', borderRadius: '10px' }}>
                                <CreditCard size={20} color="#00e676" />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>ОНЛАЙН ПЛАЩАНЕ С КАРТА</h3>
                        </div>

                        {!paymentComplete ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>МЕСЕЦ</div>
                                        <input 
                                            type="month" 
                                            value={paymentMonth || currentMonthStr} 
                                            onChange={(e) => setPaymentMonth(e.target.value)} 
                                            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.1rem', fontWeight: 800, width: '100%', outline: 'none', colorScheme: 'dark' }} 
                                        />
                                    </div>
                                    <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>СУМА</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#00e676' }}>50.80 €</div>
                                    </div>
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
                                    style={{ 
                                        width: '100%', 
                                        background: '#fff', 
                                        color: '#000', 
                                        padding: '1.2rem', 
                                        borderRadius: '18px', 
                                        border: 'none', 
                                        fontWeight: 900, 
                                        fontSize: '1rem', 
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '10px',
                                        boxShadow: '0 10px 30px rgba(255,255,255,0.1)'
                                    }}
                                >
                                    {isPaying ? <RefreshCw size={20} className="spin" /> : <Lock size={20} />}
                                    {isPaying ? 'ОБРАБОТКА...' : 'ПОДНОВИ АБОНАМЕНТ С КАРТА'}
                                </button>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '1rem 0', animation: 'fadeIn 0.4s ease' }}>
                                <CheckCircle size={40} color="#00e676" style={{ marginBottom: '1rem' }} />
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: '#00e676' }}>УСПЕШНО ПЛАЩАНЕ!</h4>
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>Абонаментът беше подновен успешно.</p>
                                <button onClick={() => { setPaymentComplete(false); setPaymentMonth(''); }} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', padding: '0.8rem 1.5rem', borderRadius: '12px', marginTop: '1rem', fontWeight: 700, cursor: 'pointer' }}>ЗАТВОРИ</button>
                            </div>
                        )}
                    </div>
                )}

                {/* Renewal History Panel */}
                <div style={{
                    background: 'rgba(255,255,255,0.01)',
                    borderRadius: '24px',
                    padding: '1.5rem',
                    border: '1px solid rgba(255,255,255,0.03)'
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={14} /> ПОСЛЕДНИ ПЛАЩАНИЯ
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {[...(client?.renewalHistory || [])].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3).map((rh, index) => (
                            <div key={index} style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                padding: '1rem',
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: '14px',
                                border: '1px solid rgba(255,255,255,0.02)'
                            }}>
                                <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{getFormattedMonth(rh.month)}</span>
                                <span style={{ fontWeight: 900, color: '#00e676' }}>{rh.amount} €</span>
                            </div>
                        ))}
                        {(client?.renewalHistory || []).length === 0 && (
                            <div style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center' }}>НЯМА ИСТОРИЯ</div>
                        )}
                    </div>
                </div>

                {/* Admin Actions */}
                {currentUser && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <Link to={`/admin?edit=${client?.id}`} style={{ gridColumn: 'span 2', background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '1.2rem', borderRadius: '20px', textDecoration: 'none', fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Settings size={18} /> УПРАВЛЕНИЕ В АДМИН ПАНЕЛ
                        </Link>
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2rem', textAlign: 'center', opacity: 0.2, fontSize: '0.7rem', fontWeight: 700 }}>
                {scanTime} • {client.id.toUpperCase()}
            </div>
                

            {/* Photo Fullscreen Modal */}
            {showPhotoModal && client && (
                <div onClick={() => setShowPhotoModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.98)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out' }}>
                    <img src={client.photo} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '24px', boxShadow: '0 0 100px rgba(0,0,0,1)', border: `3px solid ${themeColor}` }} alt="Zoomed" />
                </div>
            )}

            <style>{`
                @keyframes cardEnter {
                    from { opacity: 0; transform: translateY(40px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes hologram {
                    0% { background-position: 0% 0%; }
                    100% { background-position: 200% 200%; }
                }
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(0.98); }
                    100% { opacity: 1; transform: scale(1); }
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
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
