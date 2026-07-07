import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { CheckCircle, XCircle, Ban, Clock, Settings, Camera, CreditCard, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, updateDoc, increment, arrayUnion, addDoc, collection } from 'firebase/firestore';
import LoadingScreen from '../components/LoadingScreen';
import { ROUTE_METADATA, ROUTES } from '../data/routeMetadata';
import { uploadClientPhoto } from '../utils/photoStorage';
import ClientPhoto from '../components/ClientPhoto';
import LostCardTransfer from '../components/LostCardTransfer';
import PaymentMethodSelector from '../components/PaymentMethodSelector';
import { MIXED_METHOD } from '../data/paymentMethods';
import { CARDS_MAPPING } from '../data/cardsMapping';
import { MUNICIPALITIES, MUNICIPALITY_CUSTOM, DEFAULT_MUNICIPALITY } from '../data/municipalities';
import { SCHOOLS, SCHOOL_MUNICIPALITY } from '../data/schools';

interface Client {
    id: string;
    name: string;
    route: string;
    routes?: string[];
    expiryDate: string;
    photo: string;
    createdAt: string;
    amountPaid?: number;
    isCanceled?: boolean;
    cancelReason?: string;
    renewalHistory?: { date: string, amount: number, month: string, route?: string, paymentMethod?: string, bankAmount?: number, cashAmount?: number }[];
    history?: { date: string; action: string; details?: string; amount?: number; performedBy?: string; }[];
    cardType?: string;
    address?: string;
    serviceReason?: string;
    school?: string;
    municipality?: string;
    nfcUid?: string;
    photoThumb?: string;
    lastScanAt?: string;
    cardNumber?: string;
}

// Service ("Служебна") cards are unpaid and valid for a whole year. Validity is
// decided per month (a renewalHistory entry whose `month` equals the current
// YYYY-MM), so a whole-year subscription is stored as the 12 monthly entries.
const buildYearMonths = (year: number): string[] =>
    Array.from({ length: 12 }, (_, i) => `${year}-${(i + 1).toString().padStart(2, '0')}`);

const getServiceYearOptions = (): number[] => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1, y + 2];
};

// A client's directions (source of truth `routes`; falls back to the route string).
const getClientRoutes = (client: { route?: string; routes?: string[] }): string[] => {
    if (client.routes && client.routes.length) return client.routes;
    if (client.route && client.route.includes(',')) return client.route.split(',').map(r => r.trim()).filter(Boolean);
    return client.route ? [client.route] : [];
};

// Turn GPS coordinates into a short human-readable address via OpenStreetMap
// (Nominatim). Best-effort with a timeout — returns null on any failure so the
// inspection still saves with the raw coordinates.
const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=bg&zoom=18`,
            { signal: ctrl.signal, headers: { Accept: 'application/json' } }
        );
        clearTimeout(t);
        if (!r.ok) return null;
        const d = await r.json();
        const a = d.address || {};
        // City/village first (most important), then the street if known.
        const place = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county;
        const road = a.road ? (a.house_number ? `${a.road} ${a.house_number}` : a.road) : '';
        const parts = [place, road].filter(Boolean);
        return parts.length ? parts.join(', ') : (d.display_name || null);
    } catch {
        return null;
    }
};

const formatTimeAgo = (totalSecs: number) => {
    if (totalSecs < 60) {
        return `Сканирана преди ${totalSecs} сек.`;
    }
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return secs > 0 
        ? `Сканирана преди ${mins} мин. ${secs} сек.` 
        : `Сканирана преди ${mins} мин.`;
};

const sanitizeId = (id: string | null | undefined): string => {
    if (!id) return '';
    const trimmed = id.trim();
    
    // Map Bulgarian Cyrillic characters (from Phonetic & BDS layouts) to English Latin hex characters (A-F)
    const phoneticMap: Record<string, string> = {
        'а': 'a', 'б': 'b', 'ц': 'c', 'д': 'd', 'е': 'e', 'ф': 'f',
        'А': 'A', 'Б': 'B', 'Ц': 'C', 'Д': 'D', 'Е': 'E', 'Ф': 'F'
    };
    
    const bdsMap: Record<string, string> = {
        'ь': 'a', 'ф': 'b', 'ц': 'c', 'в': 'd', 'е': 'e', 'а': 'f',
        'Ь': 'A', 'Ф': 'B', 'Ц': 'C', 'В': 'D', 'Е': 'E', 'А': 'F'
    };
    
    // Detect layout based on presence of layout-specific Cyrillic letters
    let isBds = false;
    for (const char of trimmed) {
        if (['в', 'В', 'ь', 'Ь'].includes(char)) {
            isBds = true;
            break;
        }
    }
    
    const mapToUse = isBds ? bdsMap : phoneticMap;
    
    // Translate Cyrillic characters to Latin
    let translated = '';
    for (const char of trimmed) {
        translated += mapToUse[char] || char;
    }
    
    // Remove query parameters
    translated = translated.split('?')[0];
    
    // Split by both / and # to get all path segments
    const parts = translated.split(/[/#]/);
    
    // Filter out empty parts and known URL segments that aren't IDs
    const cleanParts = parts.filter(p => {
        const cleaned = p.trim().toLowerCase();
        return cleaned.length > 0 && 
            !['http:', 'https:', 'davidabg91.github.io', 'darycard', 'client'].includes(cleaned);
    });
    
    const lastPart = cleanParts.length > 0 ? cleanParts[cleanParts.length - 1] : translated;
    
    // Remove all whitespace and convert to uppercase
    return lastPart.replace(/\s+/g, '').toUpperCase();
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
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const urlUid = queryParams.get('uid') || '';
    const { currentUser, loading: authLoading } = useAuth();
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanTime] = useState(new Date().toLocaleTimeString('bg-BG'));
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [showLostCard, setShowLostCard] = useState(false);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    const [regName, setRegName] = useState('');
    const [regCardType, setRegCardType] = useState('Нормална карта');
    const [regSelectedSchool, setRegSelectedSchool] = useState('');
    const [regCustomSchool, setRegCustomSchool] = useState('');
    const [regMunicipality, setRegMunicipality] = useState('');
    const [regCustomMunicipality, setRegCustomMunicipality] = useState('');
    const [regRoute, setRegRoute] = useState('');
    const [regAmount, setRegAmount] = useState('50');
    const [regPaymentMethod, setRegPaymentMethod] = useState('В брой');
    const [regBankAmount, setRegBankAmount] = useState('');
    const [regCashAmount, setRegCashAmount] = useState('');
    const [regPhoto, setRegPhoto] = useState<string | null>(null);
    const [regAddress, setRegAddress] = useState('');
    // Service ("Служебна") cards: reason for issuing + the year the whole-year
    // (unpaid) subscription covers, for both activation and renewal.
    const [regServiceReason, setRegServiceReason] = useState('');
    const [regServiceYear, setRegServiceYear] = useState(new Date().getFullYear());
    const [renewServiceYear, setRenewServiceYear] = useState(new Date().getFullYear());

    const getSuggestedMonth = () => {
        const now = new Date();
        let targetMonth = now.getMonth() + 1;
        let targetYear = now.getFullYear();
        if (now.getDate() > 15) {
            targetMonth += 1;
            if (targetMonth > 12) { targetMonth = 1; targetYear += 1; }
        }
        return `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;
    };

    const [regMonth, setRegMonth] = useState<string>(getSuggestedMonth());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // States for cropping tool
    const [tempPhoto, setTempPhoto] = useState<string | null>(null);
    const [isCropping, setIsCropping] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isCropping) return;
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isCropping || !isDragging) return;
        setPan({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!isCropping || e.touches.length !== 1) return;
        setIsDragging(true);
        dragStartRef.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isCropping || !isDragging || e.touches.length !== 1) return;
        setPan({
            x: e.touches[0].clientX - dragStartRef.current.x,
            y: e.touches[0].clientY - dragStartRef.current.y
        });
    };

    const handleCropConfirm = () => {
        if (!tempPhoto) return;
        const img = new Image();
        img.src = tempPhoto;
        img.onload = () => {
            const canvas320 = document.createElement('canvas');
            canvas320.width = 320;
            canvas320.height = 320;
            const ctx320 = canvas320.getContext('2d');
            if (ctx320) {
                ctx320.fillStyle = '#000';
                ctx320.fillRect(0, 0, 320, 320);
                
                ctx320.save();
                ctx320.translate(160, 160);
                ctx320.translate(pan.x, pan.y);
                ctx320.scale(zoom, zoom);
                
                const imgRatio = img.width / img.height;
                let dw, dh;
                if (imgRatio > 1) {
                    dh = 320;
                    dw = 320 * imgRatio;
                } else {
                    dw = 320;
                    dh = 320 / imgRatio;
                }
                const dx = -dw / 2;
                const dy = -dh / 2;
                ctx320.drawImage(img, dx, dy, dw, dh);
                ctx320.restore();
            }

            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = 500;
            cropCanvas.height = 500;
            const cropCtx = cropCanvas.getContext('2d');
            if (cropCtx) {
                cropCtx.drawImage(canvas320, 60, 60, 200, 200, 0, 0, 500, 500);
                const croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.85);
                setRegPhoto(croppedDataUrl);
                setTempPhoto(null);
                setIsCropping(false);
            }
        };
    };

    const handleCropCancel = () => {
        setTempPhoto(null);
        setIsCropping(false);
    };

    const startWebcam = async () => {
        setIsCapturing(true);
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } },
                audio: false
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(err => console.error("Error playing video:", err));
            }
        } catch (err) {
            console.error("Error accessing webcam:", err);
            setError("Неуспешно свързване с камерата. Моля, проверете разрешенията.");
            setIsCapturing(false);
        }
    };

    const capturePhoto = () => {
        if (videoRef.current) {
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 640;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                compressImage(dataUrl, 600, 600, 0.85).then(compressed => {
                    setTempPhoto(compressed);
                    setIsCropping(true);
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    stopWebcam();
                }).catch(err => {
                    console.error("Compression error:", err);
                    setTempPhoto(dataUrl);
                    setIsCropping(true);
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    stopWebcam();
                });
            }
        }
    };

    const stopWebcam = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCapturing(false);
    };

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const [paymentMonth, setPaymentMonth] = useState<string>(getSuggestedMonth());
    const [paymentComplete, setPaymentComplete] = useState(false);


    const [error, setError] = useState<string | null>(null);
    const hasPlayedSound = useRef(false);

    // Quick Renewal States
    const [showQuickRenew, setShowQuickRenew] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [renewalMonth, setRenewalMonth] = useState(getSuggestedMonth());
    const [renewalAmount, setRenewalAmount] = useState(30);
    const [renewalRoute, setRenewalRoute] = useState('');
    const [renewalPaymentMethod, setRenewalPaymentMethod] = useState('В брой');
    const [renewalBankAmount, setRenewalBankAmount] = useState('');
    const [renewalCashAmount, setRenewalCashAmount] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

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

    // Auto-price logic for registration
    useEffect(() => {
        if (regCardType === 'Служебна карта') { setRegAmount('0'); return; }
        if (regRoute && ROUTE_METADATA[regRoute]) {
            const meta = ROUTE_METADATA[regRoute];
            let priceStr = meta.priceCard;
            
            if (regCardType === 'Ученическа карта') {
                if (meta.priceCardStudent) {
                    priceStr = meta.priceCardStudent;
                } else if (priceStr && priceStr !== '-' && priceStr !== '---') {
                    const normal = parseFloat(priceStr.replace(' €', ''));
                    if (!isNaN(normal)) {
                        setRegAmount((normal / 2).toFixed(2));
                        return;
                    }
                }
            } else if (regCardType === 'Пенсионерска карта') {
                if (priceStr && priceStr !== '-' && priceStr !== '---') {
                    const normal = parseFloat(priceStr.replace(' €', ''));
                    if (!isNaN(normal)) {
                        setRegAmount((normal / 2).toFixed(2));
                        return;
                    }
                }
            }

            if (priceStr && priceStr !== '-' && priceStr !== '---') {
                const numericPrice = priceStr.replace(' €', '').trim();
                setRegAmount(numericPrice);
            }
        }
    }, [regRoute, regCardType]);

    // Auto-price the quick-renew amount from the route + card type (pensioner &
    // student = half), so a renewal uses the route's current card price instead
    // of the last paid amount. Service cards are handled separately (whole year).
    useEffect(() => {
        if (!client || client.cardType === 'Служебна карта') return;
        if (renewalRoute && ROUTE_METADATA[renewalRoute]) {
            const meta = ROUTE_METADATA[renewalRoute];
            let priceStr = meta.priceCard;
            if (client.cardType === 'Ученическа карта') {
                if (meta.priceCardStudent) {
                    priceStr = meta.priceCardStudent;
                } else if (priceStr && priceStr !== '-' && priceStr !== '---') {
                    const normal = parseFloat(priceStr.replace(' €', ''));
                    if (!isNaN(normal)) { setRenewalAmount(Number((normal / 2).toFixed(2))); return; }
                }
            } else if (client.cardType === 'Пенсионерска карта') {
                if (priceStr && priceStr !== '-' && priceStr !== '---') {
                    const normal = parseFloat(priceStr.replace(' €', ''));
                    if (!isNaN(normal)) { setRenewalAmount(Number((normal / 2).toFixed(2))); return; }
                }
            }
            if (priceStr && priceStr !== '-' && priceStr !== '---') {
                const n = parseFloat(priceStr.replace(' €', '').trim());
                if (!isNaN(n)) setRenewalAmount(n);
            }
        }
    }, [renewalRoute, client]);

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
                const compressed = await compressImage(base64, 600, 600, 0.85);
                setTempPhoto(compressed);
                setIsCropping(true);
                setZoom(1);
                setPan({ x: 0, y: 0 });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRegister = async () => {
        if (!id || !regName || !regRoute || !regPhoto || !regAmount) {
            alert('Моля, попълнете всички полета и направете снимка.');
            return;
        }
        // Guard against a truncated/partial NFC read: real card ids are 8–9 chars.
        // A shorter id (e.g. "JST", "SH5") means the reader opened an incomplete
        // link, so refuse activation instead of creating a broken profile.
        if (id.length < 8) {
            alert(`Картата изглежда прочетена НЕПЪЛНО (къс код: "${id}").\n\nМоля, сканирайте картата отново — по-бавно и плътно до четеца — преди да я активирате.`);
            return;
        }
        // The id must correspond to a real printed card (i.e. exist in the card
        // list with a number). Otherwise the profile would have no card number.
        if (!CARDS_MAPPING[id]) {
            alert(`Кодът "${id}" не е в списъка с картите на системата, затова няма номер на карта.\n\nПроверете картата и сканирайте отново. Ако е нова карта, първо трябва да се добави в списъка.`);
            return;
        }
        // Teachers require an община; disabled cards require an address (like pensioners).
        const resolvedMunicipality = regMunicipality === MUNICIPALITY_CUSTOM ? regCustomMunicipality.trim() : regMunicipality;
        if ((regCardType === 'Учителска карта' || regCardType === 'Ученическа карта' || regCardType === 'Пенсионерска карта') && !resolvedMunicipality) {
            alert('Моля, изберете Община.');
            return;
        }
        if ((regCardType === 'Инвалидна карта' || regCardType === 'Пенсионерска карта') && !regAddress.trim()) {
            alert('Моля, въведете адрес.');
            return;
        }
        if (regCardType === 'Служебна карта' && !regServiceReason.trim()) {
            alert('Моля, въведете причина за издаване на служебната карта.');
            return;
        }
        const now = new Date();
        const isServiceCard = regCardType === 'Служебна карта';
        const expiryMonth = isServiceCard ? `${regServiceYear}-12` : regMonth;

        // Upload the photo to Storage; keep only the URL in the document. Fall back to
        // the inline base64 image if the upload fails so activation never breaks.
        let photoValue = regPhoto;
        try {
            photoValue = await uploadClientPhoto(regPhoto, id);
        } catch (uploadErr) {
            console.error('Photo upload failed, falling back to inline image:', uploadErr);
        }

        // Tiny inline thumbnail (~few KB) kept in the document for instant/offline display.
        let photoThumb = '';
        try {
            photoThumb = await compressImage(regPhoto, 96, 96, 0.5);
        } catch (thumbErr) {
            console.error('Thumbnail generation failed:', thumbErr);
        }

        // Payment: "Смесено" (mixed) splits the total between bank and cash.
        const isMixedReg = regPaymentMethod === MIXED_METHOD;
        const regBank = Number(regBankAmount) || 0;
        const regCash = Number(regCashAmount) || 0;
        const regEffectiveAmount = isMixedReg ? (regBank + regCash) : Number(regAmount);
        const regPaymentLabel = isMixedReg ? `Смесено (Банка: ${regBank.toFixed(2)} / Кеш: ${regCash.toFixed(2)})` : regPaymentMethod;
        const regPaymentFields = isMixedReg ? { paymentMethod: regPaymentMethod, bankAmount: regBank, cashAmount: regCash } : { paymentMethod: regPaymentMethod };

        if (isMixedReg && regEffectiveAmount <= 0) {
            alert('При смесено плащане въведете сумите по банка и/или в брой.');
            return;
        }

        // Service cards: whole selected year (12 monthly entries, amount 0).
        const initialRenewalHistory = isServiceCard
            ? buildYearMonths(regServiceYear).map(m => ({ date: now.toISOString(), amount: 0, month: m, route: regRoute, paymentMethod: 'Служебна' }))
            : [{ date: now.toISOString(), amount: regEffectiveAmount, month: expiryMonth, route: regRoute, ...regPaymentFields }];
        const initialDetails = isServiceCard
            ? `Служебна карта за цялата ${regServiceYear} г. (без плащане) | Причина: ${regServiceReason.trim()}`
            : `Първоначално плащане: ${regEffectiveAmount.toFixed(2)} € за месец ${expiryMonth} | Начин на плащане: ${regPaymentLabel}`;

        const newClient: Client = {
            id,
            nfcUid: urlUid.toUpperCase(),
            name: regName,
            route: regRoute,
            routes: [regRoute],
            cardType: regCardType,
            address: (regCardType === 'Пенсионерска карта' || regCardType === 'Инвалидна карта') ? regAddress : '',
            serviceReason: isServiceCard ? regServiceReason.trim() : '',
            school: regCardType === 'Ученическа карта' ? (regSelectedSchool === 'custom' ? regCustomSchool : regSelectedSchool) : '',
            municipality: (regCardType === 'Ученическа карта' || regCardType === 'Пенсионерска карта' || regCardType === 'Учителска карта')
                ? (regMunicipality === MUNICIPALITY_CUSTOM ? regCustomMunicipality.trim() : regMunicipality)
                : '',
            cardNumber: CARDS_MAPPING[id] || '',
            expiryDate: expiryMonth,
            photo: photoValue,
            photoThumb,
            createdAt: now.toISOString(),
            amountPaid: isServiceCard ? 0 : regEffectiveAmount,
            renewalHistory: initialRenewalHistory,
            history: [{
                date: now.toISOString(),
                action: 'Активиране (Сканиране)',
                details: initialDetails,
                amount: isServiceCard ? 0 : regEffectiveAmount,
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
                    details: isServiceCard
                        ? `Нова служебна карта (NFC): ${id}. Валидна за цялата ${regServiceYear} г. Регион: ${regRoute} | Причина: ${regServiceReason.trim()}`
                        : `Нова карта (NFC): ${id}. Сума: ${regEffectiveAmount.toFixed(2)} €. Регион: ${regRoute} | Начин на плащане: ${regPaymentLabel}`,
                    amount: isServiceCard ? 0 : regEffectiveAmount
                });
                const cardNum = CARDS_MAPPING[id] || '';
                const nameWithCard = cardNum ? `${regName} (Карта № ${cardNum})` : regName;
                console.log(`[DARY_BRIDGE_LOG]: Нов профил на ${nameWithCard} (${regRoute}) - Сума: ${regAmount} €`);
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
                
                if (currentUser && urlUid && clientData.nfcUid !== urlUid.toUpperCase()) {
                    updateDoc(doc(db, 'clients', id), { nfcUid: urlUid.toUpperCase() }).catch(console.error);
                    clientData.nfcUid = urlUid.toUpperCase();
                }

                setClient(clientData);
                if (!hasPlayedSound.current) {
                    initAudio();
                    const now = new Date();
                    const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
                    const hasPaidCurrentMonth = (clientData.renewalHistory || []).some(rh => rh.month === currentMonthStr);
                    const isActive = !clientData.isCanceled && hasPaidCurrentMonth;
                    const lastMs = clientData.lastScanAt ? new Date(clientData.lastScanAt).getTime() : 0;
                    const secsSince = lastMs ? Math.round((Date.now() - lastMs) / 1000) : Infinity;
                    const isPassback = secsSince >= 0 && secsSince < 180; // 3 min passback

                    if (isPassback) {
                        playErrorSound();
                    } else if (isActive) {
                        playSuccessSound();
                    } else {
                        playErrorSound();
                    }
                    
                    const cardNum = clientData.cardNumber || CARDS_MAPPING[clientData.id] || '';
                    const cardPart = cardNum ? ` (Карта № ${cardNum})` : '';
                    const statusStr = clientData.isCanceled ? 'Анулиран' : (hasPaidCurrentMonth ? 'Платен' : 'Неплатен');
                    console.log(`[DARY_BRIDGE_LOG]: Сканиран профил: ${clientData.name}${cardPart} - Статус: ${statusStr}`);
                    
                    hasPlayedSound.current = true;

                    // Sync renewal form
                    setRenewalMonth(getSuggestedMonth());
                    setRenewalAmount(clientData.renewalHistory?.[clientData.renewalHistory.length - 1]?.amount || 30);
                    setRenewalRoute(clientData.route || '');
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
    }, [id, initAudio, playSuccessSound, playErrorSound, urlUid, currentUser]); // Removed cloudSyncStatus to prevent re-subscription flicker

    const scannedRef = useRef<string | null>(null);
    // Always points at the latest client snapshot (used when saving an inspection
    // so we record the freshest boarding-scan time, not a stale offline-cache one).
    const latestClientRef = useRef(client);
    latestClientRef.current = client;
    const hasClient = !!client;
    // Visible scan feedback shown on the profile: green "recorded" / yellow "passback".
    const [scanFeedback, setScanFeedback] = useState<{ type: 'recorded' | 'passback' | 'recent' | 'inspection'; secs?: number } | null>(null);

    useEffect(() => {
        // Record the scan for everyone who opens a registered card — drivers do NOT
        // log in, so we must not gate this on currentUser. The Firestore rules allow
        // an anonymous write to ONLY scanCount/lastScanAt + the scans subcollection.
        // Wait for auth to resolve (authLoading) so we know the role before deciding
        // whether this is an inspector check (separate stats) or a normal scan.
        if (!id || loading || authLoading || !hasClient || scannedRef.current === id) return;
        scannedRef.current = id;

        // Any LOGGED-IN staff scan is kept OUT of the general traffic stats
        // (scanCount / scans subcollection). Only anonymous driver scans — the
        // real passenger boardings — count toward traffic analysis.
        //  - Inspectors & admins: record a separate inspection WITH geolocation.
        //  - Moderators: view only, nothing recorded.
        if (currentUser) {
            if (currentUser.role === 'inspector' || currentUser.role === 'admin') {
                const isoNow = new Date().toISOString();
                const cardNum = client?.cardNumber || CARDS_MAPPING[id] || '';
                const base = {
                    inspectorId: currentUser.id,
                    inspectorName: currentUser.username,
                    inspectorRole: currentUser.role,
                    clientId: id,
                    clientName: client?.name ?? '',
                    clientCard: cardNum,
                    route: client?.route ?? '',
                    at: isoNow,
                };
                // Read the boarding scan at SAVE time from the latest snapshot (the
                // geolocation lookup takes a moment, during which Firestore usually
                // replaces the stale offline-cache value with the fresh server one).
                const save = (extra: Record<string, unknown>) =>
                    addDoc(collection(db, 'inspector_scans'), { ...base, boardingScanAt: latestClientRef.current?.lastScanAt ?? null, ...extra })
                        .catch(err => console.error('Inspection log failed:', err));
                if (typeof navigator !== 'undefined' && navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        pos => {
                            const lat = pos.coords.latitude, lng = pos.coords.longitude;
                            // Resolve a readable address, then save (falls back to coords only).
                            reverseGeocode(lat, lng).then(address =>
                                save({ lat, lng, accuracy: pos.coords.accuracy, address: address || null })
                            );
                        },
                        () => save({ lat: null, lng: null, locationError: true }),
                        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
                    );
                } else {
                    save({ lat: null, lng: null, locationError: true });
                }
                setScanFeedback({ type: 'inspection' });
            }
            return;
        }

        // Anti-passback: if this card was scanned less than 180s (3 min) ago, flag
        // it (yellow warning) and do NOT record another scan. Beyond that,
        // if it was scanned < 300s (5 min) ago, show the warning but DO record the scan.
        const lastMs = client?.lastScanAt ? new Date(client.lastScanAt).getTime() : 0;
        const secsSince = lastMs ? Math.round((Date.now() - lastMs) / 1000) : Infinity;
        if (secsSince >= 0 && secsSince < 180) {
            setScanFeedback({ type: 'passback', secs: secsSince });
            return;
        }
        if (secsSince >= 180 && secsSince < 300) {
            setScanFeedback({ type: 'recent', secs: secsSince });
        } else {
            setScanFeedback({ type: 'recorded' });
        }
        const clientRef = doc(db, 'clients', id);
        const isoNow = new Date().toISOString();
        // TWO INDEPENDENT writes (NOT an atomic batch): the scan document is what the
        // traffic analysis reads, so it must not be taken down if the counter update
        // is rejected. Drivers are not logged in; the rules allow the anonymous
        // scan-create + the scanCount/lastScanAt bump.
        setDoc(doc(collection(clientRef, 'scans')), { at: isoNow, route: client?.route ?? '' })
            .catch(err => console.error('Scan record failed:', err));
        updateDoc(clientRef, { scanCount: increment(1), lastScanAt: isoNow })
            .catch(err => console.error('Scan counter update failed:', err));
    }, [id, loading, authLoading, hasClient, currentUser, client?.route, client?.lastScanAt, client?.name, client?.cardNumber]);

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
                        id.length < 8 ? (
                            // Truncated / partial NFC read (real card ids are 8–9 chars).
                            // Don't offer activation under a broken id — tell the operator to rescan.
                            <>
                                <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,171,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', border: '1px solid rgba(255,171,0,0.3)' }}>
                                    <AlertTriangle size={48} color="#ffab00" />
                                </div>
                                <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '1rem', color: '#ffab00' }}>КАРТАТА Е ПРОЧЕТЕНА НЕПЪЛНО</h2>
                                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem', lineHeight: '1.6' }}>
                                    Прочетен е само къс код <b style={{ color: '#fff', fontFamily: 'monospace' }}>„{id}"</b>, а реалният номер на картата е по-дълъг. Затова картата <b>не може</b> да се активира — иначе профилът ще е сгрешен.
                                </p>
                                <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '2.5rem', lineHeight: '1.6' }}>
                                    Моля, сканирайте картата <b>отново</b> — по-бавно и плътно до четеца — и проверете дали в адреса излиза пълен код.
                                </p>
                                <Link to="/" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>Към Начало</Link>
                            </>
                        ) : currentUser && !CARDS_MAPPING[id] ? (
                            // Id is a full length but is NOT in the printed-card list, so it has
                            // no real card number. Block activation to avoid a numberless profile.
                            <>
                                <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,171,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', border: '1px solid rgba(255,171,0,0.3)' }}>
                                    <AlertTriangle size={48} color="#ffab00" />
                                </div>
                                <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '1rem', color: '#ffab00' }}>НЕПОЗНАТА КАРТА</h2>
                                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem', lineHeight: '1.6' }}>
                                    Кодът <b style={{ color: '#fff', fontFamily: 'monospace' }}>„{id}"</b> не е в списъка с картите на системата, затова няма номер на карта. Активиране е спряно, за да не се създаде сгрешен профил.
                                </p>
                                <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '2.5rem', lineHeight: '1.6' }}>
                                    Проверете картата и сканирайте <b>отново</b>. Ако е нова карта, тя първо трябва да бъде добавена в списъка с картите.
                                </p>
                                <Link to="/" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>Към Начало</Link>
                            </>
                        ) : (
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
                                {currentUser && (
                                    <button onClick={() => setShowLostCard(true)} style={{ padding: '0.95rem', background: 'rgba(255,82,82,0.08)', color: '#ff8a8a', borderRadius: '50px', border: '1px solid rgba(255,82,82,0.3)', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer' }}>Загубена карта</button>
                                )}
                                <Link to="/" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600 }}>Към Начало</Link>
                            </div>
                        </>
                        )
                    ) : (
                        <div style={{ animation: 'fadeIn 0.4s ease', textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: '2rem', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>Регистрация на Карта</h3>
                            {CARDS_MAPPING[id] && (
                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary-color)', textAlign: 'center', marginBottom: '1.5rem' }}>
                                    Номер на Карта: {CARDS_MAPPING[id]}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                    <div 
                                        style={{ 
                                            width: (isCapturing || isCropping) ? '320px' : '150px', 
                                            height: (isCapturing || isCropping) ? '320px' : '150px', 
                                            borderRadius: '24px', 
                                            background: 'rgba(255,255,255,0.05)', 
                                            margin: '0 auto', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            border: '2px dashed rgba(255,255,255,0.2)', 
                                            overflow: 'hidden', 
                                            position: 'relative',
                                            transition: 'width 0.3s ease, height 0.3s ease',
                                            cursor: isCropping ? 'grab' : 'default'
                                        }}
                                        onMouseDown={handleMouseDown}
                                        onMouseMove={handleMouseMove}
                                        onMouseUp={handleMouseUp}
                                        onMouseLeave={handleMouseUp}
                                        onTouchStart={handleTouchStart}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleMouseUp}
                                    >
                                        {regPhoto ? (
                                            <>
                                                <img src={regPhoto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                <button 
                                                    type="button" 
                                                    onClick={() => setRegPhoto(null)} 
                                                    style={{ position: 'absolute', top: '0.3rem', right: '0.3rem', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.8rem', zIndex: 10 }}
                                                >
                                                    ✕
                                                </button>
                                            </>
                                        ) : isCropping && tempPhoto ? (
                                            <>
                                                <img 
                                                    src={tempPhoto} 
                                                    style={{ 
                                                        position: 'absolute',
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover',
                                                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                                        transformOrigin: 'center center',
                                                        userSelect: 'none',
                                                        pointerEvents: 'none'
                                                    }} 
                                                />
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    height: '100%',
                                                    pointerEvents: 'none',
                                                    border: '60px solid rgba(0, 0, 0, 0.6)',
                                                    boxSizing: 'border-box',
                                                    zIndex: 2
                                                }} />
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '60px',
                                                    left: '60px',
                                                    width: '200px',
                                                    height: '200px',
                                                    border: '2px dashed var(--primary-color)',
                                                    borderRadius: '20px',
                                                    boxSizing: 'border-box',
                                                    pointerEvents: 'none',
                                                    zIndex: 3
                                                }} />
                                            </>
                                        ) : isCapturing ? (
                                            <>
                                                <video 
                                                    ref={videoRef} 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                    playsInline 
                                                    muted 
                                                />
                                                <div style={{ position: 'absolute', bottom: '0.4rem', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '0.5rem', zIndex: 10 }}>
                                                    <button 
                                                        type="button" 
                                                        onClick={capturePhoto} 
                                                        style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                                                    >
                                                        Снимай
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        onClick={stopWebcam} 
                                                        style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                                                    >
                                                        Отказ
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <div 
                                                onClick={startWebcam} 
                                                style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                            >
                                                <Camera size={28} color="var(--primary-color)" />
                                                <div style={{ fontSize: '0.7rem', color: 'var(--primary-color)', marginTop: '0.4rem', fontWeight: 800 }}>ПУСНИ КАМЕРАТА</div>
                                            </div>
                                        )}
                                    </div>
                                    {isCropping && tempPhoto && (
                                        <div style={{ width: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', marginTop: '0.4rem', animation: 'fadeIn 0.3s ease' }}>
                                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                                                    <span>МАЩАБ (ZOOM)</span>
                                                    <span>{zoom.toFixed(1)}x</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="1" 
                                                    max="3" 
                                                    step="0.02" 
                                                    value={zoom} 
                                                    onChange={e => setZoom(parseFloat(e.target.value))} 
                                                    style={{ width: '100%', accentColor: 'var(--primary-color)', cursor: 'pointer', height: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', outline: 'none' }}
                                                />
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontStyle: 'italic' }}>
                                                Влачете снимката, за да центрирате главата
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                                                <button 
                                                    type="button" 
                                                    onClick={handleCropConfirm} 
                                                    style={{ flex: 1, background: '#22c55e', color: '#fff', border: 'none', padding: '0.6rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.2)' }}
                                                >
                                                    ✓ Изрежи главата
                                                </button>
                                                <button 
                                                    type="button" 
                                                    onClick={handleCropCancel} 
                                                    style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
                                                >
                                                    Отказ
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {!regPhoto && !isCapturing && !isCropping && (
                                        <button 
                                            type="button" 
                                            onClick={() => fileInputRef.current?.click()} 
                                            style={{ background: 'transparent', color: 'rgba(255,255,255,0.4)', border: 'none', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}
                                        >
                                            или качете файл от компютъра
                                        </button>
                                    )}
                                    <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handlePhotoUpload} style={{ display: 'none' }} />
                                </div>
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>ИМЕ НА КЛИЕНТА</label><input value={regName} onChange={e => setRegName(e.target.value)} style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }} placeholder="Име Фамилия..." /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>ВИД КАРТА</label><select value={regCardType} onChange={e => {
                                    const val = e.target.value;
                                    setRegCardType(val);
                                    if (val === 'Пенсионерска карта') { setRegMunicipality(DEFAULT_MUNICIPALITY); setRegCustomMunicipality(''); }
                                    else if (val === 'Ученическа карта') { setRegMunicipality(regSelectedSchool && regSelectedSchool !== 'custom' ? (SCHOOL_MUNICIPALITY[regSelectedSchool] || DEFAULT_MUNICIPALITY) : ''); setRegCustomMunicipality(''); }
                                    else if (val === 'Учителска карта') { setRegMunicipality(DEFAULT_MUNICIPALITY); setRegCustomMunicipality(''); }
                                    else { setRegMunicipality(''); setRegCustomMunicipality(''); }
                                }} style={{ width: '100%', padding: '1rem', background: '#222', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }}>
                                    <option value="Нормална карта">Нормална карта</option>
                                    <option value="Ученическа карта">Ученическа карта</option>
                                    <option value="Пенсионерска карта">Пенсионерска карта</option>
                                    <option value="Учителска карта">Учителска карта</option>
                                    <option value="Инвалидна карта">Инвалидна карта</option>
                                    <option value="Служебна карта">Служебна карта</option>
                                </select></div>
                                {regCardType === 'Ученическа карта' && (
                                    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--primary-color)', marginBottom: '0.4rem', display: 'block', fontWeight: 800 }}>УЧИЛИЩЕ</label>
                                            <select
                                                value={regSelectedSchool}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setRegSelectedSchool(val);
                                                    if (val === 'custom' || val === '') setRegMunicipality('');
                                                    else setRegMunicipality(SCHOOL_MUNICIPALITY[val] || DEFAULT_MUNICIPALITY);
                                                    setRegCustomMunicipality('');
                                                }}
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
                                {(regCardType === 'Пенсионерска карта' || regCardType === 'Инвалидна карта') && (
                                    <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                        <label style={{ fontSize: '0.8rem', color: '#ffab00', marginBottom: '0.4rem', display: 'block', fontWeight: 800 }}>АДРЕС (Задължително)</label>
                                        <input
                                            value={regAddress}
                                            onChange={e => setRegAddress(e.target.value)}
                                            style={{ width: '100%', padding: '1rem', background: 'rgba(255,171,0,0.05)', border: '1px solid rgba(255,171,0,0.3)', borderRadius: '12px', color: '#ffab00', outline: 'none' }}
                                            placeholder="напр. гр. Плевен, ул. Свобода 1..."
                                            required={regCardType === 'Пенсионерска карта' || regCardType === 'Инвалидна карта'}
                                        />
                                    </div>
                                )}
                                {(regCardType === 'Ученическа карта' || regCardType === 'Пенсионерска карта' || regCardType === 'Учителска карта') && (
                                    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: '#7dd3fc', marginBottom: '0.4rem', display: 'block', fontWeight: 800 }}>ОБЩИНА</label>
                                            <select
                                                value={regMunicipality}
                                                onChange={e => { setRegMunicipality(e.target.value); if (e.target.value !== MUNICIPALITY_CUSTOM) setRegCustomMunicipality(''); }}
                                                style={{ width: '100%', padding: '1rem', background: '#222', border: '1px solid rgba(125,211,252,0.5)', borderRadius: '12px', color: '#fff', outline: 'none' }}
                                                required={regCardType === 'Ученическа карта' || regCardType === 'Пенсионерска карта' || regCardType === 'Учителска карта'}
                                            >
                                                <option value="">Избери община...</option>
                                                {MUNICIPALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                                                <option value={MUNICIPALITY_CUSTOM}>Друго (въведи ръчно)...</option>
                                            </select>
                                        </div>
                                        {regMunicipality === MUNICIPALITY_CUSTOM && (
                                            <div style={{ animation: 'slideDown 0.3s ease' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>ИМЕ НА ОБЩИНА</label>
                                                <input
                                                    value={regCustomMunicipality}
                                                    onChange={e => setRegCustomMunicipality(e.target.value)}
                                                    style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }}
                                                    placeholder="Въведи община..."
                                                    required={regMunicipality === MUNICIPALITY_CUSTOM}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                                {regCardType === 'Служебна карта' && (
                                    <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: '#4dd0e1', marginBottom: '0.4rem', display: 'block', fontWeight: 800 }}>ПРИЧИНА ЗА СЛУЖЕБНА КАРТА (Задължително)</label>
                                            <textarea
                                                rows={2}
                                                value={regServiceReason}
                                                onChange={e => setRegServiceReason(e.target.value)}
                                                style={{ width: '100%', padding: '1rem', background: 'rgba(77,208,225,0.05)', border: '1px solid rgba(77,208,225,0.3)', borderRadius: '12px', color: '#4dd0e1', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                                placeholder="напр. роднина на шофьор / договор с Община Плевен"
                                                required={regCardType === 'Служебна карта'}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.8rem', color: '#4dd0e1', marginBottom: '0.4rem', display: 'block', fontWeight: 800 }}>АБОНАМЕНТ ЗА ЦЯЛАТА ГОДИНА</label>
                                            <select
                                                value={regServiceYear}
                                                onChange={e => setRegServiceYear(Number(e.target.value))}
                                                style={{ width: '100%', padding: '1rem', background: '#222', border: '1px solid rgba(77,208,225,0.3)', borderRadius: '12px', color: '#fff', outline: 'none' }}
                                            >
                                                {getServiceYearOptions().map(y => <option key={y} value={y}>{y} г. (Януари – Декември)</option>)}
                                            </select>
                                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.4rem' }}>
                                                Служебната карта е безплатна и валидна за всичките 12 месеца на избраната година.
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>МАРШРУТ (КУРС)</label><select value={regRoute} onChange={e => setRegRoute(e.target.value)} style={{ width: '100%', padding: '1rem', background: '#222', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }}><option value="">Избери маршрут...</option>{ROUTES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                                {regCardType !== 'Служебна карта' && (
                                <>
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>СУМА (€)</label><input type="number" value={regAmount} onChange={e => setRegAmount(e.target.value)} style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none' }} /></div>
                                <div><label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>МЕСЕЦ</label><input type="month" value={regMonth} onChange={e => setRegMonth(e.target.value)} style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', outline: 'none', colorScheme: 'dark' }} /></div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.4rem', display: 'block' }}>НАЧИН НА ПЛАЩАНЕ</label>
                                    <PaymentMethodSelector
                                        value={regPaymentMethod}
                                        onChange={(m) => { setRegPaymentMethod(m); if (m === MIXED_METHOD && !regBankAmount && !regCashAmount) { setRegBankAmount(regAmount || ''); setRegCashAmount('0'); } }}
                                        bankAmount={regBankAmount}
                                        cashAmount={regCashAmount}
                                        onBankAmountChange={setRegBankAmount}
                                        onCashAmountChange={setRegCashAmount}
                                        activeColor="#00e676"
                                        surface="rgba(255,255,255,0.03)"
                                    />
                                </div>
                                </>
                                )}
                                <button onClick={handleRegister} style={{ marginTop: '1rem', padding: '1.2rem', background: '#00e676', color: '#ffffff', borderRadius: '12px', border: 'none', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer' }}>ЗАПАЗИ И АКТИВИРАЙ</button>
                                <button onClick={() => setIsRegistering(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', cursor: 'pointer' }}>Отказ</button>
                            </div>
                        </div>
                    )}
                </div>
                {showLostCard && (
                    <LostCardTransfer
                        newCardId={id}
                        newCardUid={urlUid}
                        onClose={() => setShowLostCard(false)}
                        onDone={() => setShowLostCard(false)}
                    />
                )}
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
    const renewalHistory = client?.renewalHistory || [];
    const hasPaidCurrentMonth = renewalHistory.some(rh => rh.month === currentMonthStr);
    const lastPaidMonth = renewalHistory.length > 0 
        ? [...renewalHistory].sort((a, b) => b.month.localeCompare(a.month))[0].month 
        : currentMonthStr;
    const isActive = !isCanceled && hasPaidCurrentMonth;
    const themeColor = isActive ? '#00e676' : '#ff1744';

    // The boarding scan to show inspectors/admins = the client's LIVE last-scan
    // time. Their own check does not touch lastScanAt, so no freezing is needed;
    // using the live value means it self-corrects from the offline cache to the
    // fresh server value without needing a manual refresh.
    const lastBoardingScan = client?.lastScanAt || null;
    const formatScanMoment = (iso: string) => {
        const d = new Date(iso);
        const dateStr = d.toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
        let rel: string;
        if (secs < 60) rel = `преди ${secs} сек`;
        else if (secs < 3600) rel = `преди ${Math.round(secs / 60)} мин`;
        else if (secs < 86400) rel = `преди ${Math.round(secs / 3600)} ч`;
        else rel = `преди ${Math.round(secs / 86400)} дни`;
        return { dateStr, rel, secs };
    };

    let statusText = isCanceled ? 'АНУЛИРАН' : 'КАРТАТА НЕ Е ПЛАТЕНА';
    if (!isCanceled && !hasPaidCurrentMonth) { 
        statusText = `БЕЗ ТАКСА ЗА ${getFormattedMonth(currentMonthStr).split(' ')[0]}`; 
    } else if (isActive) { 
        statusText = 'ВАЛИДЕН АБОНАМЕНТ'; 
    }

    const getCardTypeColor = (type?: string) => {
        if (!type) return 'rgba(255,255,255,0.4)';
        const t = type.toLowerCase();
        if (t.includes('ученическа')) return '#ffd54f';
        if (t.includes('пенсионерска')) return '#b39ddb';
        if (t.includes('инвалидна')) return '#ffab91';
        if (t.includes('учителска')) return '#80cbc4';
        if (t.includes('служебна')) return '#90a4ae';
        return '#81d4fa'; // Нормална
    };
    const cardTypeColor = getCardTypeColor(client?.cardType);

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
            position: 'relative',
            transition: 'background 0.3s ease, color 0.3s ease'
        }}>

            {/* Environment Glow - Full Screen Modern Ambient */}
            <div style={{ 
                position: 'fixed', 
                inset: 0, 
                background: `radial-gradient(circle at 50% 40%, ${themeColor}15 0%, ${themeColor}05 50%, transparent 100%)`, 
                pointerEvents: 'none',
                zIndex: 0,
                transition: 'background 0.8s ease'
            }} />
            

            {/* Background Ambient Layers */}
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '100vh', background: `radial-gradient(circle at 20% 20%, ${themeColor}08 0%, transparent 50%)`, pointerEvents: 'none' }} />
            <div style={{ position: 'fixed', bottom: 0, right: 0, left: 0, height: '100vh', background: `radial-gradient(circle at 80% 80%, ${themeColor}08 0%, transparent 50%)`, pointerEvents: 'none' }} />

            {/* Card + action panels. Stacked on mobile; on desktop the card moves to
                the left and the panels sit to its right (see .profile-layout CSS). */}
            <div className="profile-layout">

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
                zIndex: 10,
                transition: 'background 0.3s ease'
            }}>
                {/* Holographic Animation Overlay */}

                {scanFeedback && (scanFeedback.type === 'passback' || scanFeedback.type === 'recent') ? (
                    <div style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, #ffd600 0%, #ff9100 100%)',
                        padding: '1.5rem 1rem',
                        textAlign: 'center',
                        color: '#1a1500',
                        borderBottom: '4px solid #ff5252',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        animation: 'pulse 1.3s ease-in-out infinite'
                    }}>
                        <AlertTriangle size={36} strokeWidth={3} style={{ flexShrink: 0, color: '#cc0000' }} />
                        <div style={{ textAlign: 'left', lineHeight: 1.25 }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 950, letterSpacing: '0.5px', color: '#cc0000' }}>
                                ВЕЧЕ СКАНИРАНА!
                            </div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                                {formatTimeAgo(scanFeedback.secs ?? 0)}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Card Top Branding */}
                        <div style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: themeColor, letterSpacing: '2px' }}>DARY CARD</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: cardTypeColor, opacity: 0.9, background: `${cardTypeColor}15`, padding: '4px 10px', borderRadius: '8px', border: `1px solid ${cardTypeColor}33` }}>{client?.cardType?.toUpperCase() || 'УДОСТОВЕРЕНИЕ'}</span>
                        </div>

                        {/* Sub-Header Status Panel (Full Width) */}
                        <div style={{
                            width: '100%',
                            background: `${themeColor}22`,
                            padding: '8px 0',
                            textAlign: 'center',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            fontSize: '0.9rem',
                            fontWeight: 900,
                            color: themeColor,
                            letterSpacing: '1px'
                        }}>
                            {isActive ? <CheckCircle size={18} /> : <XCircle size={18} />}
                            {statusText.toUpperCase()}
                        </div>
                    </>
                )}

                {/* Card Core Content */}
                <div style={{ padding: '1.2rem 1.2rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center' }}>
                    {/* Centered Photo with Glow */}
                    <div style={{ position: 'relative' }} onClick={() => setShowPhotoModal(true)}>
                        <div style={{
                            position: 'absolute',
                            inset: '-10px',
                            background: themeColor,
                            borderRadius: '28px',
                            opacity: 0.15,
                            filter: 'blur(15px)'
                        }} />
                        <ClientPhoto
                            src={client.photo}
                            thumb={client.photoThumb}
                            alt="Profile"
                            style={{
                                width: '240px',
                                height: '240px',
                                borderRadius: '28px',
                                border: `4px solid ${themeColor}`,
                                boxShadow: `0 20px 50px rgba(0,0,0,0.7)`,
                                position: 'relative'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '0.5rem' }}>
                        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.1rem 0', letterSpacing: '-0.2px', color: 'rgba(255,255,255,0.6)' }}>{client.name.toUpperCase()}</h2>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: themeColor, textShadow: `0 0 30px ${themeColor}66` }}>{client.route.toUpperCase()}</div>
                        {(() => {
                            const dirs = getClientRoutes(client);
                            if (dirs.length < 2) return null;
                            return (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center', marginTop: '0.5rem' }}>
                                    {dirs.map(dir => {
                                        const paid = (client.renewalHistory || []).some(rh => rh.month === currentMonthStr && (rh.route ? rh.route === dir : dir === dirs[0]));
                                        return (
                                            <span key={dir} style={{ fontSize: '0.72rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '50px', background: paid ? 'rgba(0,230,118,0.15)' : 'rgba(255,82,82,0.15)', color: paid ? '#00e676' : '#ff5252', border: `1px solid ${paid ? 'rgba(0,230,118,0.3)' : 'rgba(255,82,82,0.3)'}` }}>
                                                {paid ? '✓' : '✗'} {dir}
                                            </span>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Full Width Status Panel */}
                <div style={{
                    width: '100%',
                    background: isActive ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.2)',
                    padding: '1.5rem 1rem',
                    borderTop: `1px solid ${isActive ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 23, 68, 0.5)'}`,
                    borderBottom: `1px solid ${isActive ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 23, 68, 0.5)'}`,
                    textAlign: 'center',
                    boxShadow: `inset 0 0 40px ${isActive ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)'}`
                }}>
                    <div style={{ color: isActive ? 'rgba(255,255,255,0.6)' : '#ff5252', fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '4px', marginBottom: '8px' }}>
                        {isActive ? 'ВАЛИДЕН АБОНАМЕНТ ДО' : 'НЯМА ВАЛИДЕН АБОНАМЕНТ ЗА'}
                    </div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 900, color: isActive ? '#fff' : '#ff5252', letterSpacing: '2px', lineHeight: 1 }}>
                        {getFormattedMonth(isActive ? lastPaidMonth : currentMonthStr)}
                    </div>
                </div>

                {/* Last-scan info (previous scan, excluding this one) — visible only to
                    inspectors and admins (not to drivers/moderators or the public). */}
                {(currentUser?.role === 'inspector' || currentUser?.role === 'admin') && (() => {
                    const prev = lastBoardingScan;
                    if (!prev) {
                        return (
                            <div style={{ padding: '0.9rem 1.25rem', background: 'rgba(255,171,0,0.08)', borderBottom: '1px solid rgba(255,171,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#ffab00', fontSize: '0.9rem', fontWeight: 700 }}>
                                <Clock size={16} /> Няма предишно сканиране на тази карта
                            </div>
                        );
                    }
                    const f = formatScanMoment(prev);
                    // Green if scanned within the last hour (same rule as the boarding verdict).
                    const recent = f.secs < 3600;
                    return (
                        <div style={{ padding: '0.9rem 1.25rem', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', fontSize: '0.9rem' }}>
                            <Clock size={16} color={recent ? '#00e676' : 'rgba(255,255,255,0.5)'} />
                            <span style={{ color: 'rgba(255,255,255,0.55)' }}>Последно сканиране:</span>
                            <b style={{ color: recent ? '#00e676' : '#fff' }}>{f.dateStr}</b>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>({f.rel})</span>
                        </div>
                    );
                })()}

                {/* Inspector/admin: boarding-scan verdict (same rule as the Проверки tab:
                    scanned within 3h before this check = scanned at boarding). */}
                {(currentUser?.role === 'inspector' || currentUser?.role === 'admin') && scanFeedback?.type === 'inspection' && (() => {
                    const prev = lastBoardingScan;
                    const ok = !!prev && (Date.now() - new Date(prev).getTime()) < 3600 * 1000;
                    return (
                        <div style={{ padding: '1.1rem 1.25rem', background: ok ? 'rgba(0,230,118,0.15)' : 'rgba(255,82,82,0.15)', borderBottom: `1px solid ${ok ? 'rgba(0,230,118,0.35)' : 'rgba(255,82,82,0.4)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: ok ? '#00e676' : '#ff5252', fontSize: '1.3rem', fontWeight: 900, letterSpacing: '1px' }}>
                                {ok ? <CheckCircle size={24} /> : <XCircle size={24} />}
                                {ok ? 'СКАНИРАН ПРИ КАЧВАНЕ' : 'НЕ Е СКАНИРАН'}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>Проверката е записана (с локация)</div>
                        </div>
                    );
                })()}

                {/* Footer Security Element */}
                <div style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                        #{client.id.substring(0,8).toUpperCase()}
                        {(client.cardNumber || CARDS_MAPPING[client.id]) && ` | КАРТА: ${client.cardNumber || CARDS_MAPPING[client.id]}`}
                    </span>
                    <Settings size={16} style={{ opacity: 0.1 }} />
                </div>
            </div>

            {/* Account Actions / Payment Area */}
            <div className="profile-actions" style={{ width: '100%', maxWidth: '440px', marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
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
                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                                    gap: '1rem' 
                                }}>
                                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>МЕСЕЦ</div>
                                        <input 
                                            type="month" 
                                            value={paymentMonth} 
                                            onChange={(e) => setPaymentMonth(e.target.value)} 
                                            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1rem', fontWeight: 800, width: '100%', outline: 'none', colorScheme: 'dark' }} 
                                        />
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>СУМА</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#00e676' }}>50.80 €</div>
                                    </div>
                                </div>

                                <button 
                                    disabled={true}
                                    style={{ 
                                        width: '100%', 
                                        background: 'rgba(255,255,255,0.03)', 
                                        color: 'rgba(255,255,255,0.2)', 
                                        padding: '1.2rem', 
                                        borderRadius: '18px', 
                                        border: '1px solid rgba(255,255,255,0.05)', 
                                        fontWeight: 900, 
                                        fontSize: '1rem', 
                                        cursor: 'not-allowed',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '10px'
                                    }}
                                >
                                    <Clock size={20} />
                                    СКОРО
                                </button>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '1rem 0', animation: 'fadeIn 0.4s ease' }}>
                                <CheckCircle size={40} color="#00e676" style={{ marginBottom: '1rem' }} />
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: '#00e676' }}>УСПЕШНО ПЛАЩАНЕ!</h4>
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>Абонаментът беше подновен успешно.</p>
                                <button onClick={() => { setPaymentComplete(false); setPaymentMonth(getSuggestedMonth()); }} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', padding: '0.8rem 1.5rem', borderRadius: '12px', marginTop: '1rem', fontWeight: 700, cursor: 'pointer' }}>ЗАТВОРИ</button>
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

                {/* Admin Quick Actions */}
                {currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        
                        {/* Quick Renewal Panel */}
                        <div style={{ background: '#18181b', borderRadius: '28px', border: '1px solid #00e67633', overflow: 'hidden' }}>
                            {!showQuickRenew ? (
                                <button 
                                    onClick={() => setShowQuickRenew(true)}
                                    style={{ 
                                        width: '100%', 
                                        background: 'linear-gradient(135deg, #00e676 0%, #009688 100%)', 
                                        color: '#ffffff', 
                                        padding: '1.2rem', 
                                        borderRadius: '16px', 
                                        border: 'none', 
                                        fontWeight: 800, 
                                        fontSize: '1.05rem', 
                                        letterSpacing: '1px',
                                        textTransform: 'uppercase',
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        cursor: 'pointer',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: '0 8px 24px rgba(0, 230, 118, 0.25)'
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = '0 12px 30px rgba(0, 230, 118, 0.4)';
                                        e.currentTarget.style.filter = 'brightness(1.05)';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 230, 118, 0.25)';
                                        e.currentTarget.style.filter = 'brightness(1)';
                                    }}
                                >
                                    БЪРЗО ПОДНОВЯВАНЕ
                                </button>
                            ) : (
                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <div style={{ fontWeight: 900, fontSize: '0.9rem', color: '#00e676' }}>БЪРЗО ПЛАЩАНЕ</div>
                                        <button onClick={() => setShowQuickRenew(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontWeight: 900, cursor: 'pointer' }}>ОТКАЗ</button>
                                    </div>
                                    
                                    {client?.cardType === 'Служебна карта' ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <label style={{ fontSize: '0.6rem', color: '#4dd0e1', fontWeight: 900 }}>АБОНАМЕНТ ЗА ЦЯЛАТА ГОДИНА</label>
                                            <select
                                                value={renewServiceYear}
                                                onChange={(e) => setRenewServiceYear(Number(e.target.value))}
                                                style={{ background: '#111', border: '1px solid rgba(77,208,225,0.4)', color: '#fff', padding: '10px', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, outline: 'none', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }}
                                            >
                                                {getServiceYearOptions().map(y => <option key={y} value={y}>{y} г. (Януари – Декември)</option>)}
                                            </select>
                                            <div style={{ fontSize: '0.68rem', opacity: 0.5, marginTop: '2px' }}>Служебната карта е безплатна – валидна за всичките 12 месеца.</div>
                                        </div>
                                    ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <label style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900 }}>МЕСЕЦ</label>
                                            <input
                                                type="month"
                                                value={renewalMonth}
                                                onChange={(e) => setRenewalMonth(e.target.value)}
                                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                            <label style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900 }}>СУМА (€)</label>
                                            <input
                                                type="number"
                                                value={renewalAmount}
                                                onChange={(e) => setRenewalAmount(Number(e.target.value))}
                                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, width: '100%', boxSizing: 'border-box' }}
                                            />
                                        </div>
                                    </div>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <label style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900 }}>МАРШРУТ</label>
                                        <select
                                            value={renewalRoute}
                                            onChange={(e) => setRenewalRoute(e.target.value)}
                                            style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, outline: 'none', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }}
                                        >
                                            <option value="">Избери маршрут...</option>
                                            {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>

                                    {client?.cardType !== 'Служебна карта' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <label style={{ fontSize: '0.6rem', opacity: 0.5, fontWeight: 900 }}>НАЧИН НА ПЛАЩАНЕ</label>
                                        <PaymentMethodSelector
                                            value={renewalPaymentMethod}
                                            onChange={(m) => { setRenewalPaymentMethod(m); if (m === MIXED_METHOD && !renewalBankAmount && !renewalCashAmount) { setRenewalBankAmount(String(renewalAmount || '')); setRenewalCashAmount('0'); } }}
                                            bankAmount={renewalBankAmount}
                                            cashAmount={renewalCashAmount}
                                            onBankAmountChange={setRenewalBankAmount}
                                            onCashAmountChange={setRenewalCashAmount}
                                            activeColor="#00e676"
                                            surface="rgba(255,255,255,0.03)"
                                        />
                                    </div>
                                    )}

                                    <button
                                        disabled={isUpdating}
                                        onClick={async () => {
                                            setIsUpdating(true);
                                            try {
                                                // Service cards renew for a whole year (unpaid): append all 12
                                                // monthly entries of the chosen year, expiry = that December.
                                                if (client?.cardType === 'Служебна карта') {
                                                    if (!renewalRoute) { playErrorSound(); setIsUpdating(false); return; }
                                                    const svcIso = new Date().toISOString();
                                                    const svcCur = getClientRoutes(client);
                                                    const svcNew = svcCur.includes(renewalRoute) ? svcCur : [...svcCur, renewalRoute];
                                                    const svcEntries = buildYearMonths(renewServiceYear).map(m => ({ date: svcIso, amount: 0, month: m, route: renewalRoute, paymentMethod: 'Служебна' }));
                                                    const clientRefSvc = doc(db, 'clients', client?.id || '');
                                                    await updateDoc(clientRefSvc, {
                                                        expiryDate: `${renewServiceYear}-12`,
                                                        route: svcNew.join(', '),
                                                        routes: svcNew,
                                                        isCanceled: false,
                                                        renewalHistory: arrayUnion(...svcEntries),
                                                        history: arrayUnion({
                                                            date: svcIso,
                                                            action: 'БЪРЗО ПОДНОВЯВАНЕ (PROFILE)',
                                                            amount: 0,
                                                            month: `${renewServiceYear}-12`,
                                                            route: renewalRoute,
                                                            details: `Служебна карта за цялата ${renewServiceYear} г. (без плащане)`,
                                                            performedBy: currentUser?.username
                                                        })
                                                    });
                                                    try {
                                                        await addDoc(collection(db, 'activity_logs'), {
                                                            timestamp: svcIso,
                                                            performedBy: currentUser?.username || 'Admin',
                                                            action: 'Подновяване',
                                                            targetName: client?.name || 'Клиент',
                                                            details: `Служебна карта за цялата ${renewServiceYear} г. Маршрут: ${renewalRoute}`,
                                                            amount: 0
                                                        });
                                                    } catch (logErr) { console.error("Log error", logErr); }
                                                    playSuccessSound();
                                                    setShowQuickRenew(false);
                                                    setShowSuccessModal(true);
                                                    setIsUpdating(false);
                                                    return;
                                                }
                                                const isMixedQR = renewalPaymentMethod === MIXED_METHOD;
                                                const qrBank = Number(renewalBankAmount) || 0;
                                                const qrCash = Number(renewalCashAmount) || 0;
                                                const qrAmount = isMixedQR ? (qrBank + qrCash) : renewalAmount;
                                                const qrPaymentFields = isMixedQR
                                                    ? { paymentMethod: renewalPaymentMethod, bankAmount: qrBank, cashAmount: qrCash }
                                                    : { paymentMethod: renewalPaymentMethod };
                                                const qrPaymentLabel = isMixedQR ? `Смесено (Банка: ${qrBank.toFixed(2)} / Кеш: ${qrCash.toFixed(2)})` : renewalPaymentMethod;
                                                if (isMixedQR && qrAmount <= 0) {
                                                    playErrorSound();
                                                    setIsUpdating(false);
                                                    return;
                                                }
                                                const clientRef = doc(db, 'clients', client?.id || '');
                                                const qrCur = getClientRoutes(client || { route: '' });
                                                const qrNew = qrCur.includes(renewalRoute) ? qrCur : [...qrCur, renewalRoute];
                                                const qrExpiry = renewalMonth > (client?.expiryDate || '') ? renewalMonth : (client?.expiryDate || renewalMonth);
                                                await updateDoc(clientRef, {
                                                    expiryDate: qrExpiry,
                                                    route: qrNew.join(', '),
                                                    routes: qrNew,
                                                    renewalHistory: arrayUnion({
                                                        date: new Date().toISOString(),
                                                        amount: qrAmount,
                                                        month: renewalMonth,
                                                        route: renewalRoute,
                                                        ...qrPaymentFields
                                                    }),
                                                    history: arrayUnion({
                                                        date: new Date().toISOString(),
                                                        action: 'БЪРЗО ПОДНОВЯВАНЕ (PROFILE)',
                                                        amount: qrAmount,
                                                        month: renewalMonth,
                                                        route: renewalRoute,
                                                        ...qrPaymentFields,
                                                        performedBy: currentUser?.username
                                                    })
                                                });

                                                try {
                                                    await addDoc(collection(db, 'activity_logs'), {
                                                        timestamp: new Date().toISOString(),
                                                        performedBy: currentUser?.username || 'Admin',
                                                        action: 'Подновяване',
                                                        targetName: client?.name || 'Клиент',
                                                        details: `Бързо подновяване за месец ${renewalMonth}. Сума: ${qrAmount.toFixed(2)} €. Маршрут: ${renewalRoute} | Начин на плащане: ${qrPaymentLabel}`,
                                                        amount: qrAmount
                                                    });
                                                    const cardNum = client ? (client.cardNumber || CARDS_MAPPING[client.id] || '') : '';
                                                    const nameWithCard = cardNum ? `${client?.name} (Карта № ${cardNum})` : (client?.name || 'Клиент');
                                                    console.log(`[DARY_BRIDGE_LOG]: Подновяване на ${nameWithCard} за месец ${renewalMonth} - Сума: ${qrAmount.toFixed(2)} €`);
                                                } catch (logErr) { console.error("Log error", logErr); }

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
                                        style={{ 
                                            width: '100%', 
                                            background: 'linear-gradient(135deg, #00e676 0%, #009688 100%)', 
                                            color: '#ffffff', 
                                            padding: '1.1rem', 
                                            borderRadius: '14px', 
                                            border: 'none', 
                                            fontWeight: 800, 
                                            fontSize: '1rem', 
                                            letterSpacing: '1px',
                                            textTransform: 'uppercase',
                                            marginTop: '0.5rem', 
                                            cursor: 'pointer',
                                            transition: 'all 0.3s ease',
                                            boxShadow: '0 6px 20px rgba(0, 230, 118, 0.2)'
                                        }}
                                        onMouseOver={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 230, 118, 0.3)';
                                            e.currentTarget.style.filter = 'brightness(1.05)';
                                        }}
                                        onMouseOut={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 230, 118, 0.2)';
                                            e.currentTarget.style.filter = 'brightness(1)';
                                        }}
                                    >
                                        {isUpdating ? 'ОБРАБОТКА...' : 'ПОДНОВИ СЕГА'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <Link to={`/admin?edit=${client?.id}`} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '1.2rem', borderRadius: '20px', textDecoration: 'none', fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <Settings size={18} /> УПРАВЛЕНИЕ В АДМИН ПАНЕЛ
                        </Link>
                    </div>
                )}

                {/* Success Modal */}
                {showSuccessModal && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(30px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                        <div style={{ background: '#18181b', borderRadius: '32px', padding: '3rem 2rem', width: '100%', maxWidth: '400px', textAlign: 'center', border: '1px solid #00e67644', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
                            <div style={{ background: 'rgba(0,230,118,0.1)', width: '100px', height: '100px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                                <CheckCircle size={60} color="#00e676" />
                            </div>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '1rem' }}>ГОТОВО!</h2>
                            <p style={{ opacity: 0.6, marginBottom: '2rem', lineHeight: '1.6' }}>Абонаментът на <b>{client?.name}</b> бе подновен успешно за <b>{client?.cardType === 'Служебна карта' ? `цялата ${renewServiceYear} г.` : renewalMonth}</b>.</p>
                            <button 
                                onClick={() => setShowSuccessModal(false)}
                                style={{ width: '100%', background: '#fff', color: '#000', padding: '1.2rem', borderRadius: '18px', border: 'none', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer' }}
                            >
                                РАЗБРАХ
                            </button>
                        </div>
                    </div>
                )}
            </div>
            </div>{/* /.profile-layout */}

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
                /* Profile layout: stacked by default (mobile / APK untouched). */
                .profile-layout {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 100%;
                    position: relative;
                    z-index: 10;
                }
                /* Desktop only: card on the left, action panels on the right, top-aligned
                   so "Последни плащания", "Бързо подновяване" and "Управление" sit next
                   to the card without scrolling. */
                @media (min-width: 1024px) {
                    .profile-layout {
                        flex-direction: row;
                        align-items: flex-start;
                        justify-content: center;
                        gap: 2rem;
                        max-width: 960px;
                        margin: 0 auto;
                    }
                    .profile-layout .profile-actions {
                        margin-top: 0 !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default ClientProfile;
