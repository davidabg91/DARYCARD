import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
    Users, PlusCircle, ExternalLink, 
    Trash2, XCircle, Clock, DollarSign, Camera, 
    RefreshCw, List, Save, 
    ShieldCheck, Shield, TrendingUp,
    PiggyBank, AlertTriangle, Share2,
    AlertCircle, Bus, Send, Bell, BarChart3,
    Eye, EyeOff
} from 'lucide-react';
import Card from '../components/Card';
import logoMain from '../assets/logo_main.png';
import { db } from '../firebase';
import {
    addDoc,
    doc,
    setDoc,
    collection,
    onSnapshot,
    updateDoc,
    deleteDoc,
    query,
    increment,
    arrayUnion,
    runTransaction
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { ROUTE_METADATA } from '../data/routeMetadata';
import { uploadClientPhoto } from '../utils/photoStorage';
import PaymentMethodSelector from '../components/PaymentMethodSelector';
import { MIXED_METHOD } from '../data/paymentMethods';
import { CARDS_MAPPING } from '../data/cardsMapping';
import { MUNICIPALITIES, MUNICIPALITY_CUSTOM, DEFAULT_MUNICIPALITY } from '../data/municipalities';
import { SCHOOLS, SCHOOL_MUNICIPALITY } from '../data/schools';

interface ClientLog {
    date: string;
    action: string;
    details?: string;
    amount?: number;
    performedBy?: string;
}

interface Client {
    id: string;
    rfid?: string;
    name: string;
    route: string; // display string; for multi-direction clients it's the routes joined by ", "
    routes?: string[]; // the client's directions (source of truth); falls back to [route]
    amountPaid: number;
    expiryDate: string; // "YYYY-MM"
    photo: string;
    createdAt: string;
    isCanceled?: boolean;
    cancelReason?: string;
    renewalHistory?: { date: string, amount: number, month: string, route?: string, paymentMethod?: string, bankAmount?: number, cashAmount?: number }[];
    history?: ClientLog[];
    scanCount?: number;
    lastScanAt?: string;
    cardType?: string;
    address?: string;
    serviceReason?: string;
    nfcUid?: string;
    school?: string;
    municipality?: string;
    photoThumb?: string;
    cardNumber?: string;
}

interface Signal {
    id: string;
    type: 'complaint' | 'suggestion';
    name: string;
    phone: string;
    email: string;
    message: string;
    timestamp: string;
    status: 'new' | 'read' | 'resolved';
}

interface Rental {
    id: string;
    name: string;
    phone: string;
    date: string;
    passengers: string;
    destination: string;
    timestamp: string;
    status: 'new' | 'read' | 'contacted' | 'completed';
}

interface PushNotification {
    id: string;
    courseId: string;
    title: string;
    body: string;
    timestamp: string;
    sentStatus?: 'pending' | 'sent' | 'failed';
    subscriberCount?: number;
}

const ROUTES = [
    "Бъркач", "Тръстеник", "Биволаре", "Горна Митрополия", "Долни Дъбник",
    "Рибен", "Садовец", "Славовица", "Байкал", "Гиген",
    "Долна Митрополия", "Ясен", "Крушовица", "Дисевица", "Търнене", "Градина",
    "Петърница", "Опанец", "Победа", "Подем", "Божурица",
    "Горни Дъбник", "Ясен-Дисевица", "Ясен-Долни Дъбник", "Ореховица", "Брегаре", "Крушовене",
    "Гривица", "Згалево", "Пордим", "Одърне", "Каменец", "Вълчитрън", "Катерица", "Борислав",
    "Долни Дъбник - Садовец", "Долна Митрополия - Тръстеник", "Долна Митрополия - Славовица",
    "Пордим - Каменец", "Пордим - Згалево"
];

// The card types offered on registration, reused for the clients-list filter.
const CARD_TYPES = [
    "Нормална карта", "Ученическа карта", "Пенсионерска карта",
    "Учителска карта", "Инвалидна карта", "Служебна карта"
];

const generateClientId = () => {
    // Collision-resistant: prefer crypto.randomUUID, fall back to crypto.getRandomValues.
    // (The old Math.random().substr(2,9) was both deprecated and prone to duplicates
    // when generating large NFC batches.)
    const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
    if (cryptoObj?.randomUUID) {
        return cryptoObj.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
    }
    if (cryptoObj?.getRandomValues) {
        const bytes = cryptoObj.getRandomValues(new Uint8Array(8));
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 11)).toUpperCase();
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

const getClientCardNumber = (c: Client): string => {
    return c.cardNumber || CARDS_MAPPING[c.id] || '';
};

const getDefaultExpiryMonth = () => {
    const now = new Date();
    let targetMonth = now.getMonth() + 1;
    let targetYear = now.getFullYear();
    if (now.getDate() >= 20) {
        targetMonth += 1;
        if (targetMonth > 12) {
            targetMonth = 1;
            targetYear += 1;
        }
    }
    return `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;
};

// Service ("Служебна") cards are valid for a whole year. Validity is decided per
// month (a renewalHistory entry whose `month` equals the current YYYY-MM), so a
// whole-year subscription is stored as the 12 monthly entries of that year.
const buildYearMonths = (year: number): string[] =>
    Array.from({ length: 12 }, (_, i) => `${year}-${(i + 1).toString().padStart(2, '0')}`);

// A few selectable years for service cards: previous, current, next two.
const getServiceYearOptions = (): number[] => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1, y + 2];
};

// The card price for a route + card type (pensioner & student = half),
// mirroring the auto-price logic. Used by bulk renewal. Service cards = 0.
const computeCardAmount = (route: string, cardType?: string): number => {
    if (cardType === 'Служебна карта') return 0;
    const meta = ROUTE_METADATA[route];
    if (!meta) return 0;
    let priceStr = meta.priceCard;
    let half = cardType === 'Пенсионерска карта';
    if (cardType === 'Ученическа карта') {
        if (meta.priceCardStudent) priceStr = meta.priceCardStudent;
        else half = true;
    }
    if (!priceStr || priceStr === '-' || priceStr === '---') return 0;
    const n = parseFloat(priceStr.replace(' €', ''));
    if (isNaN(n)) return 0;
    return Number((half ? n / 2 : n).toFixed(2));
};

// A client's directions. Source of truth is `routes`; falls back to splitting the
// (possibly comma-joined) `route` display string, then to a single [route].
const getClientRoutes = (client: { route?: string; routes?: string[] }): string[] => {
    if (client.routes && client.routes.length) return client.routes;
    if (client.route && client.route.includes(',')) return client.route.split(',').map(r => r.trim()).filter(Boolean);
    return client.route ? [client.route] : [];
};

// Is a specific direction paid for a given month? Legacy entries without a
// `route` count toward the client's primary (first) direction.
const isDirectionPaid = (client: Client, direction: string, month: string): boolean => {
    const primary = getClientRoutes(client)[0];
    return (client.renewalHistory || []).some(rh =>
        rh.month === month && (rh.route ? rh.route === direction : direction === primary)
    );
};

interface TabButtonProps {
    id: 'clients' | 'register' | 'nfc' | 'finances' | 'signals' | 'rentals' | 'notifications';
    icon: React.ElementType;
    badgeColor?: string;
    label: string;
    activeTab: 'clients' | 'register' | 'nfc' | 'finances' | 'signals' | 'rentals' | 'notifications';
    setActiveTab: (id: 'clients' | 'register' | 'nfc' | 'finances' | 'signals' | 'rentals' | 'notifications') => void;
    activeColor?: string;
    badge?: number;
    isMobile?: boolean;
}

const TabButton = ({ id, icon: Icon, label, activeTab, setActiveTab, activeColor = 'var(--primary-color)', badge, isMobile }: TabButtonProps) => (
    <button
        onClick={() => setActiveTab(id)}
        style={{
            display: 'flex', alignItems: 'center', gap: isMobile ? '0.3rem' : '0.5rem', padding: isMobile ? '0.6rem 0.9rem' : '0.75rem 1.25rem', borderRadius: '50px',
            fontWeight: 700, 
            background: activeTab === id ? activeColor : (id === 'register' ? 'rgba(0, 200, 83, 0.1)' : 'transparent'),
            color: activeTab === id ? '#fff' : (id === 'register' ? '#00c853' : 'var(--text-secondary)'),
            border: `2px solid ${activeTab === id ? activeColor : (id === 'register' ? '#00c853' : 'var(--surface-border)')}`,
            boxShadow: id === 'register' ? '0 0 15px rgba(0, 200, 83, 0.2)' : 'none',
            transition: 'all 0.3s ease',
            fontSize: isMobile ? '0.75rem' : '0.9rem',
            position: 'relative',
            whiteSpace: 'nowrap',
            flexShrink: 0
        }}
    >
        <Icon size={isMobile ? 16 : 18} /> <span className="tab-label">{label}</span>
        {badge && badge > 0 ? (
            <span style={{
                position: 'absolute', top: isMobile ? '-3px' : '-5px', right: isMobile ? '-3px' : '-5px',
                background: '#ff5252', color: '#fff', fontSize: isMobile ? '0.6rem' : '0.7rem',
                minWidth: isMobile ? '16px' : '18px', height: isMobile ? '16px' : '18px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px', border: '2px solid var(--bg-color)', fontWeight: 900,
                boxShadow: '0 2px 5px rgba(0,0,0,0.3)', animation: 'pulse 2s infinite'
            }}>
                {badge}
            </span>
        ) : null}
    </button>
);

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

const AdminPanel: React.FC = () => {
    const { currentUser } = useAuth();
    const location = useLocation();
    const isAdmin = currentUser?.role === 'admin';
    const [activeTab, setActiveTab] = useState<'clients' | 'register' | 'nfc' | 'finances' | 'signals' | 'rentals' | 'notifications'>(
        'clients'
    );
    const [clients, setClients] = useState<Client[]>([]);
    const [fines, setFines] = useState<{ amount: number; date: string }[]>([]);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [rentals, setRentals] = useState<Rental[]>([]);
    const [notifications, setNotifications] = useState<PushNotification[]>([]);
    const [subscribers, setSubscribers] = useState<{ courseId: string; token: string }[]>([]);
    const [sendingNotification, setSendingNotification] = useState(false);
    const [notifTitle, setNotifTitle] = useState('');
    const [notifBody, setNotifBody] = useState('');
    const [selectedNotifRoutes, setSelectedNotifRoutes] = useState<string[]>(['all']);
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleClients, setVisibleClients] = useState(20);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    // Registration Form State
    const [clientName, setClientName] = useState('');
    const [cardType, setCardType] = useState('Нормална карта');
    const [selectedRoute, setSelectedRoute] = useState('');
    const [amountPaid, setAmountPaid] = useState('');
    const [expiryDate, setExpiryDate] = useState(getDefaultExpiryMonth());
    const [paymentMethod, setPaymentMethod] = useState('В брой');
    const [bankAmount, setBankAmount] = useState('');
    const [cashAmount, setCashAmount] = useState('');
    const [photoDataURL, setPhotoDataURL] = useState<string | null>(null);
    const [nfcLinkId, setNfcLinkId] = useState('');
    const [address, setAddress] = useState('');
    // Service cards ("Служебна"): a free-text reason why the card is issued
    // (relative of a driver, contract with a община, etc.) and the year the
    // whole-year (unpaid) subscription covers.
    const [serviceReason, setServiceReason] = useState('');
    const [serviceYear, setServiceYear] = useState(new Date().getFullYear());
    const [selectedSchool, setSelectedSchool] = useState('');
    const [customSchool, setCustomSchool] = useState('');
    // Municipality (община) for student & pensioner cards. `municipality` holds a
    // value from MUNICIPALITIES, '' (none) or MUNICIPALITY_CUSTOM; when custom,
    // the manual text lives in `customMunicipality`.
    const [municipality, setMunicipality] = useState('');
    const [customMunicipality, setCustomMunicipality] = useState('');
    const [isWaitingForScan, setIsWaitingForScan] = useState(false);

    // Modal/Action State
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [newMonth, setNewMonth] = useState('');
    const [newServiceYear, setNewServiceYear] = useState(new Date().getFullYear());
    const [newAmount, setNewAmount] = useState('');
    const [newPaymentMethod, setNewPaymentMethod] = useState('В брой');
    const [newBankAmount, setNewBankAmount] = useState('');
    const [newCashAmount, setNewCashAmount] = useState('');
    const [newRoute, setNewRoute] = useState('');

    const [modalTab, setModalTab] = useState<'info' | 'actions' | 'history'>('info');
    const [modalMessage, setModalMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
    
    // Duplicate Check State
    const [duplicateCheckClient, setDuplicateCheckClient] = useState<Client | null>(null);
    const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
    
    // NFC Tools State
    const [nfcQuantity, setNfcQuantity] = useState<number>(100);
    const [generatedLinks, setGeneratedLinks] = useState<string[]>([]);
    

    const [filterMonth, setFilterMonth] = useState<string>(() => {
        const now = new Date();
        return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    });
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    // Monthly revenue is blurred by default (Revolut-style); the eye icon reveals it.
    const [showMonthlyRevenue, setShowMonthlyRevenue] = useState(false);

    // Bulk renewal: a selection of client ids + the review modal state.
    const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
    const [showBulkRenew, setShowBulkRenew] = useState(false);
    const [bulkMonth, setBulkMonth] = useState<string>(getDefaultExpiryMonth());
    const [bulkPaymentMethod, setBulkPaymentMethod] = useState('В брой');
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [bulkResult, setBulkResult] = useState<{ ok: number; fail: number } | null>(null);

    const toggleClientSelected = (id: string) => {
        setSelectedClientIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const [filterRoute, setFilterRoute] = useState<string>('all');
    const [filterCardType, setFilterCardType] = useState<string>('all');
    // School filter, only used when the card-type filter is "Ученическа карта".
    const [filterSchool, setFilterSchool] = useState<string>('all');
    // How the clients list is ordered. Defaults to the most recently added.
    const [sortBy, setSortBy] = useState<'recent' | 'alpha' | 'cardType' | 'paid' | 'unpaid'>('recent');

    // Reset the visible-client window whenever the filters change, so a new
    // search always starts from the first 20 matches.
    useEffect(() => {
        setVisibleClients(20);
    }, [searchTerm, filterRoute, filterMonth, filterCardType, filterSchool, sortBy]);

    const [reportPeriodType, setReportPeriodType] = useState<'month' | 'day'>('day');
    const [reportDate, setReportDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [reportPaymentMethod, setReportPaymentMethod] = useState<string>('В брой');
    const [reportMonth, setReportMonth] = useState<string>('all');
    const [reportCardType, setReportCardType] = useState<string>('all');
    const [reportRoute, setReportRoute] = useState<string>('all');
    const [reportDistanceFilter, setReportDistanceFilter] = useState<string>('all');
    const [reportMunicipality, setReportMunicipality] = useState<string>('all');
    const [reportByContract, setReportByContract] = useState<boolean>(false);
    const [contractMunicipalities, setContractMunicipalities] = useState<string[]>([]);

    const [photoError, setPhotoError] = useState<string | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startWebcam = async () => {
        setIsCapturing(true);
        setPhotoError(null);
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
            setPhotoError("Неуспешно свързване с камерата. Моля, проверете разрешенията.");
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
                compressImage(dataUrl, 500, 500, 0.8).then(compressed => {
                    setPhotoDataURL(compressed);
                    stopWebcam();
                }).catch(err => {
                    console.error("Compression error:", err);
                    setPhotoDataURL(dataUrl);
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

    // Auto-price logic
    useEffect(() => {
        if (cardType === 'Служебна карта') { setAmountPaid('0'); return; }
        if (selectedRoute && ROUTE_METADATA[selectedRoute]) {
            const meta = ROUTE_METADATA[selectedRoute];
            let priceStr = meta.priceCard;
            
            if (cardType === 'Ученическа карта') {
                if (meta.priceCardStudent) {
                    priceStr = meta.priceCardStudent;
                } else if (priceStr && priceStr !== '-' && priceStr !== '---') {
                    const normal = parseFloat(priceStr.replace(' €', ''));
                    if (!isNaN(normal)) {
                        setAmountPaid((normal / 2).toFixed(2));
                        return;
                    }
                }
            } else if (cardType === 'Пенсионерска карта') {
                if (priceStr && priceStr !== '-' && priceStr !== '---') {
                    const normal = parseFloat(priceStr.replace(' €', ''));
                    if (!isNaN(normal)) {
                        setAmountPaid((normal / 2).toFixed(2));
                        return;
                    }
                }
            }

            if (priceStr && priceStr !== '-' && priceStr !== '---') {
                const numericPrice = priceStr.replace(' €', '').trim();
                setAmountPaid(numericPrice);
            }
        }
    }, [selectedRoute, cardType]);

    // Auto-price logic for renewal modal
    useEffect(() => {
        if (selectedClient?.cardType === 'Служебна карта') { setNewAmount('0'); return; }
        if (newRoute && ROUTE_METADATA[newRoute] && selectedClient) {
            const meta = ROUTE_METADATA[newRoute];
            let priceStr = meta.priceCard;
            const cType = selectedClient.cardType;
            
            if (cType === 'Ученическа карта') {
                if (meta.priceCardStudent) {
                    priceStr = meta.priceCardStudent;
                } else if (priceStr && priceStr !== '-' && priceStr !== '---') {
                    const normal = parseFloat(priceStr.replace(' €', ''));
                    if (!isNaN(normal)) {
                        setNewAmount((normal / 2).toFixed(2));
                        return;
                    }
                }
            } else if (cType === 'Пенсионерска карта') {
                if (priceStr && priceStr !== '-' && priceStr !== '---') {
                    const normal = parseFloat(priceStr.replace(' €', ''));
                    if (!isNaN(normal)) {
                        setNewAmount((normal / 2).toFixed(2));
                        return;
                    }
                }
            }

            if (priceStr && priceStr !== '-' && priceStr !== '---') {
                const numericPrice = priceStr.replace(' €', '').trim();
                setNewAmount(numericPrice);
            }
        }
    }, [newRoute, selectedClient]);



    const toggleWaitingForScan = async () => {
        try {
            const newState = !isWaitingForScan;
            setIsWaitingForScan(newState);
            if (newState) {
                await setDoc(doc(db, 'admin_actions', 'current'), { 
                    action: 'waiting_for_reg', 
                    timestamp: new Date().toISOString(),
                    adminId: currentUser?.username // AppUser uses username for email
                });
            } else {
                await updateDoc(doc(db, 'admin_actions', 'current'), { action: 'idle' });
            }
        } catch (err) {
            console.error("Cloud scan error:", err);
        }
    };

    const [registrationSuccess, setRegistrationSuccess] = useState<Client | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // --- Helper Functions ---
    const getRouteColor = (route: string = '') => {
        if (!route) return 'var(--text-secondary)';
        let hash = 0;
        for (let i = 0; i < route.length; i++) {
            hash = route.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash % 360);
        return `hsl(${h}, 70%, 65%)`;
    };

    const getClientStatusForMonth = (client: Client, month: string) => {
        if (client.isCanceled) return 'Анулиран';
        const hasPaymentForMonth = (client.renewalHistory || []).some(rh => rh.month === month);
        return hasPaymentForMonth ? 'Платен' : 'Неплатен';
    };

    const getMonthPayment = (client: Client, month: string) => {
        const payment = (client.renewalHistory || []).find(rh => rh.month === month);
        return payment ? payment.amount : 0;
    };

    const getDayPayment = (client: Client, dateStr: string) => {
        const rhList = client.renewalHistory || [];
        return rhList
            .filter(rh => rh.date && rh.date.startsWith(dateStr))
            .reduce((sum, rh) => sum + rh.amount, 0);
    };

    // Derived data for reports and filters
    const allMonths = Array.from(new Set([
        new Date().toISOString().slice(0, 7),
        ...clients.flatMap(c => (c.renewalHistory || []).map(r => r.month))
    ])).sort().reverse();
    const logGlobalActivity = async (action: string, targetName: string, details: string, amount?: number) => {
        try {
            await addDoc(collection(db, 'activity_logs'), {
                timestamp: new Date().toISOString(),
                performedBy: currentUser?.username || 'Система',
                action,
                targetName,
                details,
                amount: amount || 0
            });

            // Format and log to bridge
            let bridgeMsg = "";
            if (action === 'Създаване') {
                bridgeMsg = `Нов профил на ${targetName} - ${details}`;
            } else if (action === 'Подновяване') {
                bridgeMsg = `Подновяване на ${targetName} - ${details}`;
            } else if (action === 'Изтриване на плащане') {
                bridgeMsg = `Изтрито плащане за ${targetName} - ${details}`;
            } else if (action === 'Анулиране') {
                bridgeMsg = `Анулиран профил на ${targetName} - ${details}`;
            } else if (action === 'Изтриване на клиент') {
                bridgeMsg = `Изтрит профил на ${targetName} - ${details}`;
            } else {
                bridgeMsg = `${action}: ${targetName} - ${details}`;
            }
            console.log(`[DARY_BRIDGE_LOG]: ${bridgeMsg}`);
        } catch (err) {
            console.error("Error logging global activity:", err);
        }
    };



    useEffect(() => {
        // 1. Listen for Clients in Real-time
        const q = query(collection(db, 'clients'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const clientList: Client[] = [];
            snapshot.forEach((doc) => {
                clientList.push({ id: doc.id, ...doc.data() } as Client);
            });
            setClients(clientList);

            // Check for edit param in URL after clients are loaded
            const params = new URLSearchParams(location.search);
            const editId = params.get('edit');
            if (editId) {
                const clientToEdit = clientList.find((c: Client) => c.id === editId);
                if (clientToEdit) {
                    setSelectedClient(clientToEdit as Client);
                    setNewRoute(clientToEdit.route);
                    setShowActionModal(true);
                    setActiveTab('clients');
                }
            }
        }, (err) => {
            console.error("Firestore error:", err);
        });

        // 2. Listen for Signals in Real-time
        const signalsQ = query(collection(db, 'signals'));
        const unsubscribeSignals = onSnapshot(signalsQ, (snapshot) => {
            const signalList: Signal[] = [];
            snapshot.forEach((doc) => {
                signalList.push({ id: doc.id, ...doc.data() } as Signal);
            });
            // Sort by latest first
            setSignals(signalList.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
        });

        // 3. Listen for Rentals in Real-time
        const rentalsQ = query(collection(db, 'rentals'));
        const unsubscribeRentals = onSnapshot(rentalsQ, (snapshot) => {
            const rentalList: Rental[] = [];
            snapshot.forEach((doc) => {
                rentalList.push({ id: doc.id, ...doc.data() } as Rental);
            });
            setRentals(rentalList.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
        });

        // 4. Listen for Admin Actions (Cloud Scan)
        const actionUnsubscribe = onSnapshot(doc(db, 'admin_actions', 'current'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.action === 'id_received' && data.cardId) {
                    setNfcLinkId(sanitizeId(data.cardId));
                    setIsWaitingForScan(false);
                    updateDoc(doc(db, 'admin_actions', 'current'), { action: 'idle' });
                }
            }
        });

        // 5. Listen for Notifications in Real-time
        const notificationsQ = query(collection(db, 'push_notifications'));
        const unsubscribeNotifications = onSnapshot(notificationsQ, (snapshot) => {
            const notifList: PushNotification[] = [];
            snapshot.forEach((doc) => {
                notifList.push({ id: doc.id, ...doc.data() } as PushNotification);
            });
            setNotifications(notifList.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
        });

        // 6. Listen for Push Subscriptions
        const subQ = query(collection(db, 'push_subscriptions'));
        const unsubscribeSub = onSnapshot(subQ, (snapshot) => {
            const list: { courseId: string; token: string }[] = [];
            snapshot.forEach((doc) => {
                list.push(doc.data() as { courseId: string; token: string });
            });
            setSubscribers(list);
        });

        // 7. Listen for Fines (Глоби) — counted into the daily turnover figure.
        const finesQ = query(collection(db, 'fines'));
        const unsubscribeFines = onSnapshot(finesQ, (snapshot) => {
            setFines(snapshot.docs.map(d => {
                const data = d.data();
                return { amount: Number(data.amount) || 0, date: (data.date as string) || '' };
            }));
        }, (err) => console.error('Fines listener error:', err));

        return () => {
            unsubscribe();
            unsubscribeSignals();
            unsubscribeRentals();
            unsubscribeNotifications();
            unsubscribeSub();
            actionUnsubscribe();
            unsubscribeFines();
        };
    }, [location.search]);

    const handleSendNotification = async () => {
        if (!notifTitle || !notifBody || selectedNotifRoutes.length === 0) return;
        setSendingNotification(true);
        try {
            // We create separate documents for each selected route to leverage the existing Cloud Function
            for (const routeId of selectedNotifRoutes) {
                await addDoc(collection(db, 'push_notifications'), {
                    courseId: routeId,
                    title: notifTitle,
                    body: notifBody,
                    timestamp: new Date().toISOString(),
                    sentStatus: 'pending',
                    performedBy: currentUser?.username || 'Admin'
                });
                
                // Log as global activity
                await logGlobalActivity('PUSH_NOTIFICATION', routeId, `Изпратено съобщение: ${notifBody}`);
            }
            
            setNotifTitle('');
            setNotifBody('');
            setModalMessage({ text: 'Съобщението е изпратено успешно!', type: 'success' });
            setTimeout(() => setModalMessage(null), 3000);
        } catch (err) {
            console.error("Error sending notification:", err);
            setModalMessage({ text: 'Грешка при изпращане на съобщението.', type: 'error' });
        } finally {
            setSendingNotification(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        setPhotoError(null);
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                // Always compress to ensure it's under 1MB and consistent
                const compressed = await compressImage(base64, 500, 500, 0.8);
                setPhotoDataURL(compressed);
            };
            reader.readAsDataURL(file);
        }
    };

    const retakePhoto = () => {
        setPhotoDataURL(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!clientName || !selectedRoute || !expiryDate || !photoDataURL || !amountPaid) {
            setMessage({ text: 'Моля, попълнете всички полета и направете снимка.', type: 'error' });
            return;
        }

        // Teachers require an община; disabled cards require an address (like pensioners).
        const resolvedMunicipality = municipality === MUNICIPALITY_CUSTOM ? customMunicipality.trim() : municipality;
        if ((cardType === 'Учителска карта' || cardType === 'Ученическа карта' || cardType === 'Пенсионерска карта') && !resolvedMunicipality) {
            setMessage({ text: 'Моля, изберете Община.', type: 'error' });
            return;
        }
        if ((cardType === 'Инвалидна карта' || cardType === 'Пенсионерска карта') && !address.trim()) {
            setMessage({ text: 'Моля, въведете адрес.', type: 'error' });
            return;
        }
        if (cardType === 'Служебна карта' && !serviceReason.trim()) {
            setMessage({ text: 'Моля, въведете причина за издаване на служебната карта.', type: 'error' });
            return;
        }

        if (!nfcLinkId) {
            setMessage({ text: 'Моля, свържете карта (Сканирайте или въведете ID), преди да запишете.', type: 'error' });
            return;
        }

        // Duplicate Name Check
        const normalize = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim();
        const existingClient = clients.find(c => normalize(c.name) === normalize(clientName));
        if (existingClient && !showDuplicateWarning) {
            setDuplicateCheckClient(existingClient);
            setShowDuplicateWarning(true);
            return;
        }

        const sanitizedNfcId = nfcLinkId ? sanitizeId(nfcLinkId) : '';

        // Guard against a truncated/partial NFC read: real card ids are 8–9 chars.
        // A shorter id (e.g. "JST", "SH5") means the card was read incompletely,
        // so refuse instead of creating a profile under a broken id.
        if (sanitizedNfcId && sanitizedNfcId.length < 8) {
            setMessage({
                text: `Картата изглежда прочетена НЕПЪЛНО (къс код: "${sanitizedNfcId}"). Моля, сканирайте/въведете картата отново.`,
                type: 'error'
            });
            return;
        }

        // Card ID Occupied Check - Hard stop if ID exists
        const idOccupied = clients.find(c => c.id === sanitizedNfcId);
        if (idOccupied) {
            setMessage({ 
                text: `Тази карта (ID: ${sanitizedNfcId}) вече е присвоена на ${idOccupied.name}. Моля, използвайте друга карта или първо изтрийте стария профил.`, 
                type: 'error' 
            });
            return;
        }

        const generatedId = sanitizedNfcId || generateClientId();

        // Upload the photo to Storage and keep only its URL in the document.
        // Falls back to the inline base64 if the upload fails, so registration never
        // breaks just because of a transient Storage error.
        let photoValue = photoDataURL || '';
        try {
            if (photoDataURL) photoValue = await uploadClientPhoto(photoDataURL, generatedId);
        } catch (err) {
            console.error('Photo upload failed, falling back to inline image:', err);
        }

        // Tiny inline thumbnail kept in the document for instant/offline display.
        let photoThumb = '';
        try {
            if (photoDataURL) photoThumb = await compressImage(photoDataURL, 96, 96, 0.5);
        } catch (err) {
            console.error('Thumbnail generation failed:', err);
        }

        // Payment: a "Смесено" (mixed) payment splits the total between bank and cash.
        const isMixedPay = paymentMethod === MIXED_METHOD;
        const payBank = Number(bankAmount) || 0;
        const payCash = Number(cashAmount) || 0;
        const effectiveAmount = isMixedPay ? (payBank + payCash) : Number(amountPaid);
        const paymentLabel = isMixedPay ? `Смесено (Банка: ${payBank.toFixed(2)} / Кеш: ${payCash.toFixed(2)})` : paymentMethod;
        const renewalPaymentFields = isMixedPay
            ? { paymentMethod, bankAmount: payBank, cashAmount: payCash }
            : { paymentMethod };

        if (isMixedPay && effectiveAmount <= 0) {
            setMessage({ text: 'При смесено плащане въведете сумите по банка и/или в брой.', type: 'error' });
            return;
        }

        // Service cards are unpaid and valid for the whole selected year: store all
        // 12 monthly entries (amount 0) and set the expiry to December of that year.
        const isServiceCard = cardType === 'Служебна карта';
        const nowIso = new Date().toISOString();
        const initialExpiry = isServiceCard ? `${serviceYear}-12` : expiryDate;
        const initialRenewalHistory = isServiceCard
            ? buildYearMonths(serviceYear).map(m => ({ date: nowIso, amount: 0, month: m, route: selectedRoute, paymentMethod: 'Служебна' }))
            : [{ date: nowIso, amount: effectiveAmount, month: expiryDate, route: selectedRoute, ...renewalPaymentFields }];
        const initialDetails = isServiceCard
            ? `Служебна карта за цялата ${serviceYear} г. (без плащане) | Причина: ${serviceReason.trim()}`
            : `Първоначално плащане: ${effectiveAmount.toFixed(2)} € за месец ${expiryDate} | Начин на плащане: ${paymentLabel}`;

        const newClient: Client = {
            id: generatedId,
            name: clientName,
            route: selectedRoute,
            routes: [selectedRoute],
            cardType: cardType,
            amountPaid: isServiceCard ? 0 : effectiveAmount,
            expiryDate: initialExpiry,
            photo: photoValue,
            photoThumb,
            address: (cardType === 'Пенсионерска карта' || cardType === 'Инвалидна карта') ? address : '',
            serviceReason: isServiceCard ? serviceReason.trim() : '',
            school: cardType === 'Ученическа карта' ? (selectedSchool === 'custom' ? customSchool : selectedSchool) : '',
            municipality: (cardType === 'Ученическа карта' || cardType === 'Пенсионерска карта' || cardType === 'Учителска карта')
                ? (municipality === MUNICIPALITY_CUSTOM ? customMunicipality.trim() : municipality)
                : '',
            cardNumber: CARDS_MAPPING[sanitizedNfcId] || '',
            createdAt: nowIso,
            renewalHistory: initialRenewalHistory,
            history: [{
                date: nowIso,
                action: 'Създаване',
                details: initialDetails,
                amount: isServiceCard ? 0 : effectiveAmount,
                performedBy: currentUser?.username || 'Админ'
            }]
        };

        await saveClient(newClient);
        const cardNum = getClientCardNumber(newClient);
        const nameWithCard = cardNum ? `${newClient.name} (Карта № ${cardNum})` : newClient.name;
        const logDetails = isServiceCard
            ? `Нова служебна карта: ${newClient.id}. Валидна за цялата ${serviceYear} г. Регион: ${selectedRoute} | Причина: ${serviceReason.trim()}`
            : `Нова карта: ${newClient.id}. Сума: ${effectiveAmount.toFixed(2)} €. Регион: ${selectedRoute} | Начин на плащане: ${paymentLabel}`;
        await logGlobalActivity('Създаване', nameWithCard, logDetails, isServiceCard ? 0 : effectiveAmount);
    };

    const saveClient = async (client: Client, isNew: boolean = true) => {
        try {
            await setDoc(doc(db, 'clients', client.id), client);
            
            if (isNew) {
                setRegistrationSuccess(client);
                setClientName(''); setCardType('Нормална карта'); setAddress(''); setServiceReason(''); setServiceYear(new Date().getFullYear()); setSelectedSchool(''); setCustomSchool(''); setMunicipality(''); setCustomMunicipality(''); setAmountPaid(''); setExpiryDate(getDefaultExpiryMonth()); setPaymentMethod('В брой'); setBankAmount(''); setCashAmount(''); setPhotoDataURL(null); setNfcLinkId('');
                setShowActionModal(false);
                setSelectedClient(null);
            } else {
                // For updates, we keep the modal open to show the new modalMessage overlay
                // setMessage({ text: 'Профилът бе обновен успешно.', type: 'success' });
                // setTimeout(() => setMessage(null), 3000);
            }
            
            setShowDuplicateWarning(false);
            setDuplicateCheckClient(null);
        } catch (err) {
            console.error(err);
            setMessage({ text: 'Грешка при записване.', type: 'error' });
        }
    };

    const renewClient = async () => {
        if (!selectedClient) return;
        
        const isMixedRenew = newPaymentMethod === MIXED_METHOD;
        const renewBank = Number(newBankAmount) || 0;
        const renewCash = Number(newCashAmount) || 0;
        const effectiveNewAmount = isMixedRenew ? (renewBank + renewCash) : Number(newAmount);
        const isServiceCard = selectedClient.cardType === 'Служебна карта';

        // Service cards renew for a whole year (unpaid): append all 12 monthly
        // entries of the chosen year and set the expiry to that December.
        if (isServiceCard) {
            if (!newRoute) { alert('Моля, изберете направление.'); return; }
            const isoNowSvc = new Date().toISOString();
            const curRoutesSvc = getClientRoutes(selectedClient);
            const newRoutesSvc = curRoutesSvc.includes(newRoute) ? curRoutesSvc : [...curRoutesSvc, newRoute];
            const isNewDirSvc = !curRoutesSvc.includes(newRoute);
            const yearEntries = buildYearMonths(newServiceYear).map(m => ({ date: isoNowSvc, amount: 0, month: m, route: newRoute, paymentMethod: 'Служебна' }));
            try {
                await updateDoc(doc(db, 'clients', selectedClient.id), {
                    route: newRoutesSvc.join(', '),
                    routes: newRoutesSvc,
                    expiryDate: `${newServiceYear}-12`,
                    isCanceled: false,
                    renewalHistory: arrayUnion(...yearEntries),
                    history: arrayUnion({
                        date: isoNowSvc,
                        action: isNewDirSvc ? 'Добавяне на направление' : 'Подновяване',
                        details: `Служебна карта, направление ${newRoute} за цялата ${newServiceYear} г. (без плащане)`,
                        amount: 0,
                        performedBy: currentUser?.username || 'Админ'
                    })
                });
            } catch (err) {
                console.error(err);
                setModalMessage({ text: 'Грешка при подновяване.', type: 'error' });
                return;
            }
            const cardNumSvc = getClientCardNumber(selectedClient);
            const nameSvc = cardNumSvc ? `${selectedClient.name} (Карта № ${cardNumSvc})` : selectedClient.name;
            await logGlobalActivity(isNewDirSvc ? 'Добавяне на направление' : 'Подновяване', nameSvc, `Служебна карта, направление ${newRoute} за цялата ${newServiceYear} г.`, 0);
            setModalMessage({ text: `${isNewDirSvc ? 'Добавено' : 'Подновено'} направление „${newRoute}" (служебна) за цялата ${newServiceYear} г.`, type: 'success' });
            return;
        }

        if (!newMonth || !newRoute || (effectiveNewAmount <= 0 && !isServiceCard) || Number.isNaN(effectiveNewAmount)) {
            alert(isMixedRenew ? 'Моля, въведете месец, курс и сумите за смесеното плащане.' : 'Моля, въведете валиден месец, сума и курс.');
            return;
        }

        const renewPaymentLabel = isMixedRenew ? `Смесено (Банка: ${renewBank.toFixed(2)} / Кеш: ${renewCash.toFixed(2)})` : newPaymentMethod;
        const renewPaymentFields = isMixedRenew
            ? { paymentMethod: newPaymentMethod, bankAmount: renewBank, cashAmount: renewCash }
            : { paymentMethod: newPaymentMethod };

        const curRoutes = getClientRoutes(selectedClient);
        const newRoutes = curRoutes.includes(newRoute) ? curRoutes : [...curRoutes, newRoute];
        const isNewDir = !curRoutes.includes(newRoute);
        const newExpiry = newMonth > (selectedClient.expiryDate || '') ? newMonth : selectedClient.expiryDate;
        const isoNow = new Date().toISOString();

        // Atomic update: appending to history/renewalHistory and bumping the running
        // total with arrayUnion + increment instead of overwriting the whole document.
        // The chosen route is merged into the client's directions (a new one is
        // ADDED as a separate subscription; an existing one is renewed).
        try {
            await updateDoc(doc(db, 'clients', selectedClient.id), {
                route: newRoutes.join(', '),
                routes: newRoutes,
                expiryDate: newExpiry,
                isCanceled: false,
                amountPaid: increment(effectiveNewAmount),
                renewalHistory: arrayUnion({
                    date: isoNow,
                    amount: effectiveNewAmount,
                    month: newMonth,
                    route: newRoute,
                    ...renewPaymentFields
                }),
                history: arrayUnion({
                    date: isoNow,
                    action: isNewDir ? 'Добавяне на направление' : 'Подновяване',
                    details: `Направление ${newRoute} — месец ${newMonth}. Сума: ${effectiveNewAmount.toFixed(2)} € | Начин на плащане: ${renewPaymentLabel}`,
                    amount: effectiveNewAmount,
                    performedBy: currentUser?.username || 'Админ'
                })
            });
        } catch (err) {
            console.error(err);
            setModalMessage({ text: 'Грешка при подновяване.', type: 'error' });
            return;
        }

        const cardNum = getClientCardNumber(selectedClient);
        const nameWithCard = cardNum ? `${selectedClient.name} (Карта № ${cardNum})` : selectedClient.name;
        await logGlobalActivity(isNewDir ? 'Добавяне на направление' : 'Подновяване', nameWithCard, `Направление ${newRoute} — месец ${newMonth}. Сума: ${effectiveNewAmount.toFixed(2)} € | Начин на плащане: ${renewPaymentLabel}`, effectiveNewAmount);
        setModalMessage({
            text: `${isNewDir ? 'Добавено' : 'Подновено'} направление „${newRoute}" за ${newMonth}. Сума: ${effectiveNewAmount.toFixed(2)} €.`,
            type: 'success'
        });
        setNewMonth('');
        setNewAmount('');
        setNewPaymentMethod('В брой');
        setNewBankAmount('');
        setNewCashAmount('');
    };

    // Renew every selected client for the chosen month at each one's own price
    // (route + card type). Service cards get the whole year of that month.
    const bulkRenew = async () => {
        const targets = clients.filter(c => selectedClientIds.has(c.id));
        if (targets.length === 0) return;
        setBulkProcessing(true);
        setBulkResult(null);
        let ok = 0, fail = 0;
        for (const c of targets) {
            const isoNow = new Date().toISOString();
            const cardNum = getClientCardNumber(c);
            const nameWithCard = cardNum ? `${c.name} (Карта № ${cardNum})` : c.name;
            try {
                const primaryDir = getClientRoutes(c)[0] || c.route;
                if (c.cardType === 'Служебна карта') {
                    const year = Number(bulkMonth.slice(0, 4));
                    const entries = buildYearMonths(year).map(m => ({ date: isoNow, amount: 0, month: m, route: primaryDir, paymentMethod: 'Служебна' }));
                    await updateDoc(doc(db, 'clients', c.id), {
                        expiryDate: `${year}-12`,
                        isCanceled: false,
                        renewalHistory: arrayUnion(...entries),
                        history: arrayUnion({ date: isoNow, action: 'Групово подновяване', details: `Служебна карта за цялата ${year} г. (без плащане) | Направление: ${primaryDir}`, amount: 0, performedBy: currentUser?.username || 'Админ' })
                    });
                    // One audit-log entry per client, with its full details.
                    await logGlobalActivity('Групово подновяване', nameWithCard, `Служебна карта за цялата ${year} г. (без плащане). Направление: ${primaryDir} | Вид: Служебна карта`, 0);
                } else {
                    const amount = computeCardAmount(primaryDir, c.cardType);
                    await updateDoc(doc(db, 'clients', c.id), {
                        expiryDate: bulkMonth,
                        isCanceled: false,
                        amountPaid: increment(amount),
                        renewalHistory: arrayUnion({ date: isoNow, amount, month: bulkMonth, route: primaryDir, paymentMethod: bulkPaymentMethod }),
                        history: arrayUnion({ date: isoNow, action: 'Групово подновяване', details: `Месец: ${bulkMonth}. Сума: ${amount.toFixed(2)} €. Курс: ${c.route} | Начин на плащане: ${bulkPaymentMethod}`, amount, performedBy: currentUser?.username || 'Админ' })
                    });
                    await logGlobalActivity('Групово подновяване', nameWithCard, `Месец: ${bulkMonth}. Сума: ${amount.toFixed(2)} €. Курс: ${c.route} | Вид: ${c.cardType || 'Нормална карта'} | Начин на плащане: ${bulkPaymentMethod}`, amount);
                }
                ok++;
            } catch (err) {
                console.error('Bulk renew failed for', c.id, err);
                fail++;
            }
        }
        setBulkProcessing(false);
        setBulkResult({ ok, fail });
        setSelectedClientIds(new Set());
    };

    const deleteRenewal = async (client: Client, index: number) => {
        if (!isAdmin || !client.renewalHistory) return;
        
        if (!window.confirm('Сигурни ли сте, че искате да изтриете това плащане? Това ще промени общата сума и валидността на картата.')) return;

        const entryToDelete = client.renewalHistory[index];

        // Run inside a transaction: read the freshest document, recompute the
        // remaining history / total / expiry from it, then write. Recomputing from
        // the live data (not the stale in-memory copy) avoids resurrecting a payment
        // that another moderator added or deleted in the meantime.
        try {
            await runTransaction(db, async (tx) => {
                const ref = doc(db, 'clients', client.id);
                const snap = await tx.get(ref);
                if (!snap.exists()) throw new Error('Клиентът не съществува.');
                const data = snap.data() as Client;
                const rh = data.renewalHistory || [];

                let removed = false;
                const newRenewalHistory = rh.filter(e => {
                    if (!removed && e.month === entryToDelete.month && e.amount === entryToDelete.amount && e.date === entryToDelete.date) {
                        removed = true;
                        return false;
                    }
                    return true;
                });

                let newExpiryDate = data.expiryDate;
                if (newRenewalHistory.length > 0) {
                    newExpiryDate = [...newRenewalHistory].sort((a, b) => b.month.localeCompare(a.month))[0].month;
                }

                tx.update(ref, {
                    renewalHistory: newRenewalHistory,
                    amountPaid: (data.amountPaid || 0) - entryToDelete.amount,
                    expiryDate: newExpiryDate,
                    history: [...(data.history || []), {
                        date: new Date().toISOString(),
                        action: 'Изтрито плащане',
                        details: `Изтрито плащане за месец ${entryToDelete.month} (${entryToDelete.amount} €)`,
                        performedBy: currentUser?.username || 'Админ'
                    }]
                });
            });
        } catch (err) {
            console.error(err);
            setMessage({ text: 'Грешка при изтриване на плащане.', type: 'error' });
            return;
        }

        const cardNum = getClientCardNumber(client);
        const nameWithCard = cardNum ? `${client.name} (Карта № ${cardNum})` : client.name;
        await logGlobalActivity('Изтриване на плащане', nameWithCard, `Месец: ${entryToDelete.month} (${entryToDelete.amount} €).`, -entryToDelete.amount);
        setModalMessage({ 
            text: `Изтрито плащане за месец ${entryToDelete.month} (${entryToDelete.amount} €). Общата сума и валидността бяха преизчислени.`, 
            type: 'success' 
        });
    };

    const generateNfcBatch = () => {
        const baseUrl = `${window.location.origin}${window.location.pathname}#/client/`;
        const newLinks = [];
        for (let i = 0; i < nfcQuantity; i++) {
            newLinks.push(`${baseUrl}${generateClientId()}`);
        }
        setGeneratedLinks(newLinks);
        logGlobalActivity('Генериране на NFC линкове', 'Система', `Генерирани ${nfcQuantity} NFC линка.`);
    };

    const copyLinksToClipboard = () => {
        const text = generatedLinks.join(',');
        navigator.clipboard.writeText(text);
        setMessage({ text: 'Линковете са копирани в клипборда!', type: 'success' });
        logGlobalActivity('Копиране на NFC линкове', 'Система', `Копирани ${generatedLinks.length} NFC линка в клипборда.`);
    };

    const cancelClient = async () => {
        if (!selectedClient || !cancelReason) return;
        
        try {
            await updateDoc(doc(db, 'clients', selectedClient.id), {
                isCanceled: true,
                cancelReason,
                history: arrayUnion({
                    date: new Date().toISOString(),
                    action: 'Анулиране',
                    details: cancelReason,
                    performedBy: currentUser?.username || 'Админ'
                })
            });
        } catch (err) {
            console.error(err);
            setModalMessage({ text: 'Грешка при анулиране.', type: 'error' });
            return;
        }

        const cardNum = getClientCardNumber(selectedClient);
        const nameWithCard = cardNum ? `${selectedClient.name} (Карта № ${cardNum})` : selectedClient.name;
        await logGlobalActivity('Анулиране', nameWithCard, `Анулирана карта. Причина: ${cancelReason}`);
        setModalMessage({ 
            text: `Картата бе анулирана успешно. Причина: ${cancelReason}`, 
            type: 'success' 
        });
        setCancelReason('');
    };

    const handleDeleteClient = async (id: string, name: string) => {
        if (currentUser?.role !== 'admin') return;
        if (window.confirm(`Сигурни ли сте, че искате да ИЗТРИЕТЕ ПОСТОЯННО клиента "${name}"? Това ще премахне цялата история и плащания!`)) {
            try {
                await deleteDoc(doc(db, 'clients', id));
                setMessage({ text: `Клиентът "${name}" бе изтрит постоянно.`, type: 'success' });
                const cardNum = CARDS_MAPPING[id] || '';
                const nameWithCard = cardNum ? `${name} (Карта № ${cardNum})` : name;
                await logGlobalActivity('Изтриване на клиент', nameWithCard, `Клиентът "${name}" (ID: ${id}) беше изтрит постоянно.`);
                if (selectedClient?.id === id) {
                    setShowActionModal(false);
                    setSelectedClient(null);
                }
            } catch (err) {
                console.error(err);
                setMessage({ text: 'Грешка при изтриване.', type: 'error' });
            }
        }
    };
    const isExpired = (monthStr: string | undefined, client?: Client) => {
        if (!monthStr) return true;
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // If we have the full client, check if they have paid for THIS month
        if (client?.renewalHistory) {
            return !client.renewalHistory.some(rh => rh.month === currentMonthStr);
        }

        const [year, month] = monthStr.split('-');
        const expiry = new Date(Number(year), Number(month), 0, 23, 59, 59);
        return now > expiry;
    };

    



    const filteredClientsByFilters = clients.filter(c => {
        const sTerm = searchTerm.toLowerCase();
        const sSanitized = sanitizeId(searchTerm).toLowerCase();
        const cCardNum = getClientCardNumber(c).toLowerCase();
        const matchesSearch = !searchTerm || 
            c.name.toLowerCase().includes(sTerm) ||
            c.id.toLowerCase().includes(sTerm) ||
            c.id.toLowerCase().includes(sSanitized) ||
            (c.nfcUid && c.nfcUid.toLowerCase().includes(sTerm)) ||
            (c.nfcUid && c.nfcUid.toLowerCase().includes(sSanitized)) ||
            c.route.toLowerCase().includes(sTerm) ||
            cCardNum.includes(sTerm) ||
            cCardNum.includes(sSanitized);
        
        const matchesRoute = filterRoute === 'all' || getClientRoutes(c).includes(filterRoute);
        const matchesCardType = filterCardType === 'all' || (c.cardType || 'Нормална карта') === filterCardType;
        const matchesSchool = filterCardType !== 'Ученическа карта' || filterSchool === 'all' || (c.school || '') === filterSchool;

        return matchesSearch && matchesRoute && matchesCardType && matchesSchool;
    }).sort((a, b) => {
        switch (sortBy) {
            case 'alpha':
                return a.name.localeCompare(b.name, 'bg');
            case 'cardType': {
                const ta = a.cardType || 'Нормална карта';
                const tb = b.cardType || 'Нормална карта';
                if (ta !== tb) return ta.localeCompare(tb, 'bg');
                return a.name.localeCompare(b.name, 'bg');
            }
            case 'paid':
            case 'unpaid': {
                const statusA = getClientStatusForMonth(a, filterMonth);
                const statusB = getClientStatusForMonth(b, filterMonth);
                const weights: Record<string, number> = sortBy === 'unpaid'
                    ? { 'Неплатен': 0, 'Платен': 1, 'Анулиран': 2 }
                    : { 'Платен': 0, 'Неплатен': 1, 'Анулиран': 2 };
                if (weights[statusA] !== weights[statusB]) return weights[statusA] - weights[statusB];
                return a.name.localeCompare(b.name, 'bg');
            }
            case 'recent':
            default:
                // Most recently added first (createdAt is an ISO string).
                return (b.createdAt || '').localeCompare(a.createdAt || '');
        }
    });
    
    // Financial Calculations for Accountant
    const todayIso = new Date().toISOString().split('T')[0];
    const registrationsToday = clients.filter(c => c.createdAt?.startsWith(todayIso)).length;
    const revenueToday = clients.reduce((acc, c) => {
        const todayPayments = (c.renewalHistory || []).filter(r => r.date?.startsWith(todayIso));
        return acc + todayPayments.reduce((sum, p) => sum + p.amount, 0);
    }, 0);

    const registrationsSelectedDay = clients.filter(c => c.createdAt?.startsWith(selectedDate)).length;
    const revenueSelectedDay = clients.reduce((acc, c) => {
        const payments = (c.renewalHistory || []).filter(r => r.date?.startsWith(selectedDate));
        return acc + payments.reduce((sum, p) => sum + p.amount, 0);
    }, 0) + fines.filter(f => f.date?.startsWith(selectedDate)).reduce((sum, f) => sum + f.amount, 0);

    const currentMonthIso = todayIso.substring(0, 7);
    // Revenue actually RECEIVED during the calendar month — filter by payment date
    // (r.date), not by the subscription month being paid for (r.month). Otherwise a
    // payment made this month for another month's subscription wouldn't count, which
    // made the monthly total smaller than a single day's total.
    const revenueMonthCurrent = clients.reduce((acc, c) => {
        const monthPayments = (c.renewalHistory || []).filter(r => r.date?.startsWith(currentMonthIso));
        return acc + monthPayments.reduce((sum, p) => sum + p.amount, 0);
    }, 0);

    const unreadSignalsCount = signals.filter(s => s.status === 'new').length;
    const unreadRentalsCount = rentals.filter(r => r.status === 'new').length;

    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        const rev = clients.reduce((acc, c) => {
            const dayPayments = (c.renewalHistory || []).filter(r => r.date?.startsWith(iso));
            return acc + dayPayments.reduce((sum, p) => sum + p.amount, 0);
        }, 0);
        const curRegs = clients.filter(c => c.createdAt?.startsWith(iso)).length;
        return { date: iso, revenue: rev, regs: curRegs };
    });



    return (
        <div style={{ width: '100%', animation: 'fadeIn 0.4s ease', padding: isMobile ? '0' : '0 1.5rem 1.5rem' }}>

            <div style={{ 
                display: 'flex', 
                flexDirection: isMobile ? 'column' : 'row',
                justifyContent: 'space-between', 
                alignItems: isMobile ? 'flex-start' : 'center', 
                marginBottom: isMobile ? '1rem' : '2.5rem', 
                gap: isMobile ? '0.75rem' : '1.25rem',
                padding: isMobile ? '0' : '0'
            }}>
                <div>
                    <h2 style={{ fontSize: isMobile ? '1.35rem' : '2.25rem', fontWeight: 900, marginBottom: '0.25rem', letterSpacing: '-0.02em' }}>Мениджър</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: isMobile ? '0.7rem' : '0.85rem', fontWeight: 600 }}>
                            {isAdmin ? <ShieldCheck size={12} color="#ff5252" /> : <Shield size={12} color="var(--primary-color)" />}
                            {isAdmin ? 'Админ' : 'Мод'} — {currentUser?.username}
                        </div>
                        <div style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', 
                            padding: '2px 8px', borderRadius: '50px', 
                            background: isOnline ? 'rgba(0,230,118,0.1)' : 'rgba(255,152,0,0.1)',
                            color: isOnline ? '#00e676' : '#ff9800',
                            border: `1px solid ${isOnline ? 'rgba(0,230,118,0.2)' : 'rgba(255,152,0,0.2)'}`,
                            fontWeight: 800
                        }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#00e676' : '#ff9800', boxShadow: isOnline ? '0 0 8px #00e676' : 'none' }} />
                            {isOnline ? 'ОНЛАЙН' : 'ОФЛАЙН'}
                        </div>
                        {isAdmin && (
                            <a 
                                href="https://drive.google.com/drive/folders/1r666nS3BCGAV9WVNm69aiOTtdyyAp4IB?usp=sharing"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.4rem', 
                                    fontSize: '0.7rem', 
                                    padding: '2px 10px', 
                                    borderRadius: '50px', 
                                    background: 'rgba(0,145,234,0.1)',
                                    color: '#0091ea',
                                    border: '1px solid rgba(0,145,234,0.2)',
                                    fontWeight: 800,
                                    textDecoration: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(0,145,234,0.2)';
                                    e.currentTarget.style.border = '1px solid rgba(0,145,234,0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(0,145,234,0.1)';
                                    e.currentTarget.style.border = '1px solid rgba(0,145,234,0.2)';
                                }}
                            >
                                <ExternalLink size={12} />
                                ИЗТЕГЛИ PC ПРИЛОЖЕНИЕ
                            </a>
                        )}
                    </div>
                </div>
                <div style={{ 
                    display: 'flex', 
                    gap: isMobile ? '0.35rem' : '0.75rem', 
                    flexWrap: 'wrap',
                    justifyContent: isMobile ? 'center' : 'flex-start',
                    width: '100%',
                    margin: isMobile ? '0.5rem 0' : '0',
                    padding: isMobile ? '0 0.25rem' : '0'
                }}>
                    <TabButton id="register" icon={PlusCircle} label={isMobile ? "ДОБАВИ КАРТА" : "ДОБАВИ КАРТИ"} activeColor="#00c853" activeTab={activeTab} setActiveTab={setActiveTab} isMobile={isMobile} />
                    <TabButton id="clients" icon={Users} label="КЛИЕНТИ" activeTab={activeTab} setActiveTab={setActiveTab} isMobile={isMobile} />
                    <TabButton id="finances" icon={PiggyBank} label="ФИНАНСИ" activeColor="#ff9800" activeTab={activeTab} setActiveTab={setActiveTab} isMobile={isMobile} />
                    <TabButton id="rentals" icon={Bus} label="НАЕМИ" activeColor="#0091ea" activeTab={activeTab} setActiveTab={setActiveTab} badge={unreadRentalsCount} isMobile={isMobile} />
                    <TabButton id="signals" icon={AlertCircle} label="СИГНАЛИ" activeColor="#ff5252" activeTab={activeTab} setActiveTab={setActiveTab} badge={unreadSignalsCount} isMobile={isMobile} />
                    {isAdmin && (
                        <>
                            <TabButton id="notifications" icon={Bell} label="ИЗВЕСТИЯ" activeColor="#ff4081" activeTab={activeTab} setActiveTab={setActiveTab} isMobile={isMobile} />
                            <TabButton id="nfc" icon={ExternalLink} label="NFC КОДОВЕ" activeColor="var(--accent-color)" activeTab={activeTab} setActiveTab={setActiveTab} isMobile={isMobile} />
                        </>
                    )}
                </div>
            </div>

            <style>{`
        @media (max-width: 600px) { 
            .tab-label { font-size: 0.75rem; }
            .mobile-hide { display: none; }
            .desktop-table { display: none; }
            .mobile-cards { display: grid !important; }
            .nfc-connect-container { flex-direction: column !important; }
            .nfc-scan-button { width: 100% !important; justify-content: center !important; }
        }
        @media (min-width: 601px) {
            .mobile-cards { display: none !important; }
        }
        .stat-card { padding: 1.5rem; border-radius: 16px; min-height: 140px; }
        .table-container { overflow-x: auto; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid var(--surface-border); }
        .mobile-cards { display: none; grid-template-columns: 1fr; gap: 1rem; }
        .client-card { background: rgba(255,255,255,0.03); border: 1px solid var(--surface-border); border-radius: 16px; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th, td { padding: 1rem; border-bottom: 1px solid var(--surface-border); }
        th { color: var(--text-secondary); font-weight: 500; }
        .register-print { display: none; }
        .print-only-header { display: none; }
        @page {
            size: auto;
            margin: 0mm;
        }
        @media print {
            body * { visibility: hidden; }
            #printable-report, #printable-report * { visibility: visible !important; color: #000 !important; }
            #printable-report { 
                position: absolute; 
                left: 0; 
                top: 0; 
                width: 100%; 
                margin: 0; 
                padding: 12mm 15mm 12mm 15mm; 
                background: white; 
                box-sizing: border-box; 
            }
            #printable-report .glass {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                border-radius: 0 !important;
            }
            #printable-report .no-print { display: none !important; }
            #printable-report .print-only-header { display: block !important; }
            #printable-report table, #printable-report th, #printable-report td { border: 1px solid #ddd !important; border-collapse: collapse; padding: 8px; }
            #printable-report th { background: #f5f5f5 !important; }
            /* Регистър на издадените карти: show the register layout, hide the on-screen
               financial table when printing a student/pensioner report. */
            #printable-report .register-print { display: block !important; }
            #printable-report .screen-only-report { display: none !important; }
            #printable-report .register-print th, #printable-report .register-print td { text-align: left; }
        }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .modal-content { background: var(--bg-color); border: 1px solid var(--surface-border); border-radius: 20px; width: 100%; maxWidth: 500px; padding: 2rem; position: relative; }
        .route-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.05); overflow: hidden; }
        .route-fill { height: 100%; background: var(--primary-color); transition: width 0.5s ease; }
        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
            100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

            {activeTab === 'notifications' && (
                <div style={{ animation: 'fadeIn 0.4s ease', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '2rem' }}>
                        <Card>
                            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ff4081' }}>
                                <Send size={20} /> Изпрати Известие
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ДО КУРС / ЛИНИЯ (Изберете една или повече)</label>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--primary-color)', fontWeight: 800, background: 'rgba(0, 173, 181, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                                            ОБЩО АБОНАТИ: {new Set(subscribers.map(s => s.token)).size}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', padding: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '12px' }}>
                                        <button
                                            onClick={() => setSelectedNotifRoutes(['all'])}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                borderRadius: '50px',
                                                border: '1px solid var(--surface-border)',
                                                background: selectedNotifRoutes.includes('all') ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                                                color: selectedNotifRoutes.includes('all') ? '#fff' : 'var(--text-secondary)',
                                                fontSize: '0.75rem',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                transition: 'all 0.3s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem'
                                            }}
                                        >
                                            ВСИЧКИ <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>({new Set(subscribers.map(s => s.token)).size})</span>
                                        </button>
                                        {Object.keys(ROUTE_METADATA).map(routeId => {
                                            const isSelected = selectedNotifRoutes.includes(routeId);
                                            const routeSubCount = subscribers.filter(s => s.courseId === routeId).length;
                                            return (
                                                <button
                                                    key={routeId}
                                                    onClick={() => {
                                                        if (selectedNotifRoutes.includes('all')) {
                                                            setSelectedNotifRoutes([routeId]);
                                                        } else {
                                                            if (isSelected) {
                                                                const next = selectedNotifRoutes.filter(r => r !== routeId);
                                                                setSelectedNotifRoutes(next.length === 0 ? ['all'] : next);
                                                            } else {
                                                                setSelectedNotifRoutes([...selectedNotifRoutes, routeId]);
                                                            }
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '0.5rem 1rem',
                                                        borderRadius: '50px',
                                                        border: `1px solid ${isSelected ? getRouteColor(routeId) : 'var(--surface-border)'}`,
                                                        background: isSelected ? `${getRouteColor(routeId)}22` : 'rgba(255,255,255,0.05)',
                                                        color: isSelected ? getRouteColor(routeId) : 'var(--text-secondary)',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 800,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.3s',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.4rem'
                                                    }}
                                                >
                                                    {routeId} <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>({routeSubCount})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ЗАГЛАВИЕ</label>
                                    <input 
                                        type="text"
                                        placeholder="Пример: Промяна в разписанието"
                                        value={notifTitle}
                                        onChange={e => setNotifTitle(e.target.value)}
                                        style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '10px', outline: 'none' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>СЪОБЩЕНИЕ</label>
                                    <textarea 
                                        placeholder="Въведете важно съобщение към пътниците..."
                                        rows={4}
                                        value={notifBody}
                                        onChange={e => setNotifBody(e.target.value)}
                                        style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '10px', outline: 'none', resize: 'none' }}
                                    />
                                </div>

                                <button
                                    onClick={handleSendNotification}
                                    disabled={sendingNotification || !notifTitle || !notifBody}
                                    style={{
                                        padding: '1rem',
                                        background: sendingNotification ? 'rgba(255,255,255,0.05)' : '#ff4081',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.8rem',
                                        transition: 'all 0.3s'
                                    }}
                                >
                                    {sendingNotification ? <RefreshCw className="spin" size={20} /> : <Send size={20} />}
                                    {sendingNotification ? 'ИЗПРАЩАНЕ...' : 'ИЗПРАТИ СЕГА'}
                                </button>
                            </div>
                        </Card>

                        <Card>
                            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <Bell size={20} /> История на Известията
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                {notifications.length > 0 ? (
                                    notifications.map(notif => (
                                        <div key={notif.id} style={{ 
                                            padding: '1rem', 
                                            background: 'rgba(255,255,255,0.02)', 
                                            border: '1px solid var(--surface-border)', 
                                            borderRadius: '12px',
                                            position: 'relative'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', paddingRight: '2rem' }}>
                                                <div style={{ fontWeight: 800, color: '#ff4081', fontSize: '0.9rem' }}>{notif.title}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{new Date(notif.timestamp).toLocaleString('bg-BG')}</div>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#fff', marginBottom: '0.5rem' }}>{notif.body}</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                                                    До: {notif.courseId === 'all' ? 'Всички линии' : notif.courseId}
                                                </div>
                                            </div>

                                            {/* Delete Button */}
                                            <button 
                                                onClick={async () => {
                                                    if (window.confirm('Сигурни ли сте, че искате да изтриете това известие от историята?')) {
                                                        try {
                                                            await deleteDoc(doc(db, 'push_notifications', notif.id));
                                                        } catch (err) {
                                                            console.error('Delete notification error:', err);
                                                            alert('Грешка при триене на известието.');
                                                        }
                                                    }
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    top: '0.8rem',
                                                    right: '0.8rem',
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'rgba(255,255,255,0.2)',
                                                    cursor: 'pointer',
                                                    padding: '4px',
                                                    borderRadius: '6px',
                                                    transition: '0.3s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.color = '#ff5252'}
                                                onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Няма изпратени известия.</div>
                                )}
                            </div>
                        </Card>
                    </div>

                    <Card style={{ marginTop: '2rem' }}>
                        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary-color)' }}>
                            <Users size={20} /> Статистика на Абонатите по Линии
                        </h3>
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))', 
                            gap: '1rem' 
                        }}>
                            {Object.keys(ROUTE_METADATA).map(routeId => {
                                const count = subscribers.filter(s => s.courseId === routeId).length;
                                if (count === 0) return null; // Only show routes with subscribers to keep it clean, or show all? 
                                return (
                                    <div key={routeId} style={{ 
                                        padding: '1rem', 
                                        background: 'rgba(255,255,255,0.02)', 
                                        border: '1px solid var(--surface-border)', 
                                        borderRadius: '12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.5rem'
                                    }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: getRouteColor(routeId) }}>{routeId}</div>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                                            <span style={{ fontSize: '1.5rem', fontWeight: 900 }}>{count}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>АБОНАТИ</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {subscribers.length === 0 && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                    Все още няма регистрирани абонати по нито една линия.
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {activeTab === 'finances' && (
                <div style={{ animation: 'fadeIn 0.4s ease', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))', gap: isMobile ? '1rem' : '1.5rem' }}>
                        <Card style={{ borderLeft: '4px solid #00c853', padding: isMobile ? '1.25rem' : '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><DollarSign size={18} /> ПРИХОД ДНЕС</div>
                                <div style={{ background: 'rgba(0, 200, 83, 0.1)', color: '#00c853', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>ДНЕС</div>
                            </div>
                            <div style={{ fontSize: isMobile ? '1.75rem' : '2.5rem', fontWeight: 900, color: '#fff' }}>{revenueToday.toFixed(2)} €</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Регистрирани днес: <b>{registrationsToday}</b></div>
                        </Card>

                        <Card style={{ borderLeft: '4px solid var(--primary-color)', padding: isMobile ? '1.25rem' : '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><TrendingUp size={18} /> ПРИХОД ЗА МЕСЕЦА</div>
                                <div style={{ background: 'rgba(0, 173, 181, 0.1)', color: 'var(--primary-color)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{currentMonthIso}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div
                                    onClick={() => setShowMonthlyRevenue(v => !v)}
                                    style={{
                                        fontSize: isMobile ? '1.75rem' : '2.5rem',
                                        fontWeight: 900,
                                        color: '#fff',
                                        filter: showMonthlyRevenue ? 'none' : 'blur(11px)',
                                        userSelect: showMonthlyRevenue ? 'auto' : 'none',
                                        transition: 'filter 0.25s ease',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {revenueMonthCurrent.toFixed(2)} €
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowMonthlyRevenue(v => !v)}
                                    title={showMonthlyRevenue ? 'Скрий сумата' : 'Покажи сумата'}
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', borderRadius: '10px', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                >
                                    {showMonthlyRevenue ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Общо активни този месец</div>
                        </Card>
                    </div>

                    {/* Historical Lookup */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <Card>
                            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ff9800' }}>
                                <Clock size={20} /> Справка по Дати
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--surface-border)' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>ИЗБЕРИ ДАТА ЗА ОТЧЕТ</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input 
                                            type="date" 
                                            value={selectedDate}
                                            onChange={(e) => setSelectedDate(e.target.value)}
                                            style={{ 
                                                flex: 1,
                                                background: 'rgba(0,0,0,0.2)', 
                                                color: '#fff', 
                                                border: '1px solid var(--surface-border)', 
                                                padding: '0.75rem', 
                                                borderRadius: '8px',
                                                outline: 'none',
                                                colorScheme: 'dark'
                                            }}
                                        />
                                    </div>
                                    <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,152,0,0.05)', borderRadius: '12px', border: '1px solid rgba(255,152,0,0.1)' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Оборот</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ff9800' }}>{revenueSelectedDay.toFixed(2)} €</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Нови Карти</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>{registrationsSelectedDay}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card>
                            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <List size={20} /> Последни 7 Дни
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {last7Days.map((day, idx) => (
                                    <div key={idx} style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        padding: '0.8rem 1.25rem', 
                                        background: idx === 0 ? 'rgba(0, 173, 181, 0.05)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${idx === 0 ? 'rgba(0, 173, 181, 0.2)' : 'var(--surface-border)'}`,
                                        borderRadius: '12px'
                                    }}>
                                        <div style={{ fontWeight: 600 }}>{new Date(day.date).toLocaleDateString('bg-BG', { day: '2-digit', month: 'short' })}</div>
                                        <div style={{ display: 'flex', gap: '1.5rem' }}>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}><PlusCircle size={10} /> {day.regs}</div>
                                            <div style={{ fontWeight: 800, color: day.revenue > 0 ? '#00e676' : 'var(--text-secondary)' }}>{day.revenue.toFixed(2)} €</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {/* --- ACTIVITY BY DAY-OF-MONTH CHART --- */}
                    <Card>
                        <h3 style={{ marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary-color)' }}>
                            <BarChart3 size={20} /> Кога се издават/подновяват карти (по ден от месеца)
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                            Всяка издадена или подновена карта се брои по деня от месеца на транзакцията (сборувано за цялата история).
                        </p>
                        {(() => {
                            // Count unique transaction days per client (dedupes the 12 identical
                            // service-card entries into one), bucketed by day-of-month 1–31.
                            const counts = new Array(31).fill(0);
                            for (const c of clients) {
                                const dates = new Set<string>();
                                (c.renewalHistory || []).forEach(rh => { if (rh.date) dates.add(rh.date.slice(0, 10)); });
                                if (c.createdAt) dates.add(c.createdAt.slice(0, 10));
                                dates.forEach(d => {
                                    const day = Number(d.slice(8, 10));
                                    if (day >= 1 && day <= 31) counts[day - 1]++;
                                });
                            }
                            const maxCount = Math.max(1, ...counts);
                            const totalEvents = counts.reduce((a, b) => a + b, 0);
                            const busiestDay = counts.indexOf(Math.max(...counts)) + 1;
                            const CHART_H = 200;
                            const gap = isMobile ? '2px' : '4px';
                            // Y-axis ticks (count), top -> 0, evenly spaced to match the gridlines.
                            const yTicks = Array.from({ length: 5 }, (_, i) => Math.round(maxCount - (maxCount / 4) * i));
                            return (
                                <>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {/* Y-axis caption */}
                                        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1px', color: 'var(--text-secondary)', textAlign: 'center', height: `${CHART_H}px`, display: 'flex', alignItems: 'center' }}>
                                            БРОЙ КАРТИ
                                        </div>
                                        {/* Y-axis tick values */}
                                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: `${CHART_H}px`, fontSize: '0.6rem', color: 'var(--text-secondary)', textAlign: 'right', minWidth: '16px' }}>
                                            {yTicks.map((t, i) => <div key={i} style={{ lineHeight: 1, transform: i === 0 ? 'translateY(-3px)' : i === yTicks.length - 1 ? 'translateY(3px)' : 'none' }}>{t}</div>)}
                                        </div>
                                        {/* Plot area */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ position: 'relative', height: `${CHART_H}px` }}>
                                                {/* horizontal gridlines */}
                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                    {yTicks.map((_, i) => <div key={i} style={{ borderTop: '1px dashed rgba(255,255,255,0.08)' }} />)}
                                                </div>
                                                {/* bars */}
                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap }}>
                                                    {counts.map((n, i) => {
                                                        const day = i + 1;
                                                        const isTop = n === maxCount && n > 0;
                                                        return (
                                                            <div key={day} title={`${day}-о число: ${n} издадени/подновени карти`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                                                                {isTop && <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--primary-color)', marginBottom: '2px' }}>{n}</div>}
                                                                <div style={{
                                                                    width: '100%',
                                                                    height: `${Math.round((n / maxCount) * 100)}%`,
                                                                    minHeight: n > 0 ? '3px' : '0',
                                                                    background: isTop ? 'var(--primary-color)' : 'rgba(0,173,181,0.45)',
                                                                    borderRadius: '3px 3px 0 0',
                                                                    transition: 'height 0.3s ease'
                                                                }} />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {/* X-axis day labels (aligned under the bars) */}
                                            <div style={{ display: 'flex', gap, marginTop: '6px' }}>
                                                {counts.map((n, i) => {
                                                    const day = i + 1;
                                                    const show = day === 1 || day % 5 === 0 || day === 31;
                                                    const isTop = n === maxCount && n > 0;
                                                    return (
                                                        <div key={day} style={{ flex: 1, textAlign: 'center', fontSize: '0.58rem', fontWeight: isTop ? 800 : 500, color: isTop ? 'var(--primary-color)' : 'var(--text-secondary)' }}>
                                                            {show || isTop ? day : ''}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div style={{ textAlign: 'center', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '1px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                                                ДЕН ОТ МЕСЕЦА
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--surface-border)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        <div>📊 Общо транзакции: <b style={{ color: '#fff' }}>{totalEvents}</b></div>
                                        {totalEvents > 0 && <div>🔺 Най-натоварен ден: <b style={{ color: 'var(--primary-color)' }}>{busiestDay}-о число</b> ({maxCount} карти)</div>}
                                    </div>
                                </>
                            );
                        })()}
                    </Card>

                    {/* --- DETAILS REPORT EXPORT SECTION --- */}
                    <div style={{ marginTop: '1rem' }} id="printable-report">
                        {(() => {
                            const getReportAmount = (c: Client) => {
                                if (reportPeriodType === 'month') {
                                    if (reportMonth === 'all') {
                                        if (reportPaymentMethod !== 'all') {
                                            return (c.renewalHistory || [])
                                                .filter(rh => (rh.paymentMethod || 'В брой') === reportPaymentMethod)
                                                .reduce((sum, rh) => sum + rh.amount, 0);
                                        }
                                        return c.amountPaid || 0;
                                    }
                                    return (c.renewalHistory || [])
                                        .filter(rh => rh.month === reportMonth && (reportPaymentMethod === 'all' || (rh.paymentMethod || 'В брой') === reportPaymentMethod))
                                        .reduce((sum, rh) => sum + rh.amount, 0);
                                } else {
                                    return (c.renewalHistory || [])
                                        .filter(rh => rh.date && rh.date.startsWith(reportDate) && (reportPaymentMethod === 'all' || (rh.paymentMethod || 'В брой') === reportPaymentMethod))
                                        .reduce((sum, rh) => sum + rh.amount, 0);
                                }
                            };

                            // Breakdown of how the reported amount was paid (splits "Смесено"
                            // into its bank + cash parts), for display in the printed list.
                            const getReportPaymentBreakdown = (c: Client) => {
                                const inPeriod = (rh: { date?: string; month?: string }) => {
                                    if (reportPeriodType === 'month') {
                                        return reportMonth === 'all' ? true : rh.month === reportMonth;
                                    }
                                    return !!rh.date && rh.date.startsWith(reportDate);
                                };
                                let bank = 0, cash = 0, card = 0;
                                (c.renewalHistory || []).forEach(rh => {
                                    if (!inPeriod(rh)) return;
                                    const m = rh.paymentMethod || 'В брой';
                                    if (reportPaymentMethod !== 'all' && m !== reportPaymentMethod) return;
                                    if (m === 'Смесено') { bank += rh.bankAmount || 0; cash += rh.cashAmount || 0; }
                                    else if (m === 'Банка') bank += rh.amount;
                                    else if (m === 'С карта') card += rh.amount;
                                    else cash += rh.amount;
                                });
                                const parts: string[] = [];
                                const names: string[] = [];
                                if (bank > 0) { parts.push(`Банка ${bank.toFixed(2)}`); names.push('Банка'); }
                                if (cash > 0) { parts.push(`Кеш ${cash.toFixed(2)}`); names.push('Кеш'); }
                                if (card > 0) { parts.push(`Карта ${card.toFixed(2)}`); names.push('Карта'); }
                                return { bank, cash, card, label: parts.join(' + ') || '---', methods: names.join(' + ') || '---' };
                            };

                            const filteredReportClients = clients.filter(c => {
                                let match = true;
                                if (reportCardType !== 'all') {
                                    const cType = c.cardType || 'Нормална карта';
                                    if (cType !== reportCardType) match = false;
                                }
                                if (reportRoute !== 'all' && !getClientRoutes(c).includes(reportRoute)) match = false;
                                if (reportByContract) {
                                    if (!contractMunicipalities.includes(c.municipality || '')) match = false;
                                } else {
                                    if (reportMunicipality !== 'all' && (c.municipality || '') !== reportMunicipality) match = false;
                                }
                                
                                if (reportPeriodType === 'month') {
                                    if (reportMonth !== 'all') {
                                        const monthAmount = getMonthPayment(c, reportMonth);
                                        if (monthAmount <= 0) match = false;
                                        
                                        if (reportPaymentMethod !== 'all') {
                                            const hasMatchingPayment = (c.renewalHistory || []).some(rh => 
                                                rh.month === reportMonth && 
                                                (rh.paymentMethod || 'В брой') === reportPaymentMethod
                                            );
                                            if (!hasMatchingPayment) match = false;
                                        }
                                    } else {
                                        if (reportPaymentMethod !== 'all') {
                                            const hasMatchingPayment = (c.renewalHistory || []).some(rh => 
                                                (rh.paymentMethod || 'В брой') === reportPaymentMethod
                                            );
                                            if (!hasMatchingPayment) match = false;
                                        }
                                    }
                                } else {
                                    const dayAmount = getDayPayment(c, reportDate);
                                    if (dayAmount <= 0) match = false;
                                    
                                    if (reportPaymentMethod !== 'all') {
                                        const hasMatchingPayment = (c.renewalHistory || []).some(rh => 
                                            rh.date && rh.date.startsWith(reportDate) && 
                                            (rh.paymentMethod || 'В брой') === reportPaymentMethod
                                        );
                                        if (!hasMatchingPayment) match = false;
                                    }
                                }
                                
                                const isShortDistance = ["Ясен", "Опанец", "Ясен-Дисевица"].includes(c.route);
                                if (reportDistanceFilter === 'under10' && !isShortDistance) match = false;
                                if (reportDistanceFilter === 'over10' && isShortDistance) match = false;

                                return match;
                            });
                            
                            const totalReportRevenue = filteredReportClients.reduce((sum, c) => sum + getReportAmount(c), 0);

                            const showMunicipalityCol = reportByContract || reportCardType === 'Ученическа карта' || reportCardType === 'Пенсионерска карта' || reportCardType === 'Учителска карта' || reportMunicipality !== 'all';
                            const showAddressCol = reportCardType === 'Пенсионерска карта' || reportCardType === 'Инвалидна карта';
                            const reportColSpan = 5 /* name, card no, type, route, amount */
                                + (reportDistanceFilter !== 'all' ? 1 : 0)
                                + (showAddressCol ? 1 : 0)
                                + (reportCardType === 'Ученическа карта' ? 1 : 0)
                                + (showMunicipalityCol ? 1 : 0);

                            const useRegisterPrint = reportByContract || reportCardType === 'Ученическа карта' || reportCardType === 'Пенсионерска карта' || reportCardType === 'Учителска карта' || reportCardType === 'Инвалидна карта';
                            const SHORT_ROUTES = ["Ясен", "Опанец", "Ясен-Дисевица"];

                            const registerCategoryLabel = reportCardType === 'Пенсионерска карта' ? 'ПЕНСИОНЕРИ'
                                : reportCardType === 'Учителска карта' ? 'УЧИТЕЛИ'
                                : reportCardType === 'Инвалидна карта' ? 'ИНВАЛИДИ'
                                : 'УЧЕНИЦИ';
                            const registerLines = (reportRoute !== 'all'
                                ? [reportRoute]
                                : reportDistanceFilter === 'under10' ? SHORT_ROUTES
                                : reportDistanceFilter === 'over10' ? ROUTES.filter(r => !SHORT_ROUTES.includes(r))
                                : ROUTES).join(', ');

                            const getRegisterDate = (c: Client) => {
                                let iso = c.createdAt;
                                if (reportPeriodType === 'month') {
                                    if (reportMonth !== 'all') {
                                        const rh = (c.renewalHistory || []).find(r => r.month === reportMonth);
                                        if (rh?.date) iso = rh.date;
                                    }
                                } else {
                                    const rh = (c.renewalHistory || []).find(r => r.date && r.date.startsWith(reportDate));
                                    if (rh?.date) iso = rh.date;
                                }
                                if (!iso) return '---';
                                const d = new Date(iso);
                                return isNaN(d.getTime()) ? '---' : d.toLocaleDateString('bg-BG');
                            };
                            
                            const handleShareReport = async () => {
                                const periodStr = reportPeriodType === 'month' ? `Месец: ${reportMonth === 'all' ? 'Всички' : reportMonth}` : `Ден: ${reportDate}`;
                                const header = `Финансов Отчет DARY COMMERCE\n${periodStr} | Начин на плащане: ${reportPaymentMethod === 'all' ? 'Всички' : reportPaymentMethod} | Вид: ${reportCardType === 'all' ? 'Всички' : reportCardType} | Маршрут: ${reportRoute === 'all' ? 'Всички' : reportRoute} | Община: ${reportMunicipality === 'all' ? 'Всички' : reportMunicipality} | Дистанция: ${reportDistanceFilter === 'all' ? 'Всички' : (reportDistanceFilter === 'under10' ? 'До 10 км' : 'Над 10 км')}\n---\n`;
                                const rows = filteredReportClients.map(c => {
                                    const isShort = ["Ясен", "Опанец", "Ясен-Дисевица"].includes(c.route);
                                    const distStr = isShort ? "До 10 км" : "Над 10 км";
                                    const distancePart = reportDistanceFilter === 'all' ? '' : ` (${distStr})`;
                                    const addressPart = ((reportCardType === 'Пенсионерска карта' || reportCardType === 'Инвалидна карта') && c.address) ? ` - Адрес: ${c.address}` : '';
                                    const schoolPart = (reportCardType === 'Ученическа карта' && c.school) ? ` (${c.school})` : '';
                                    const municipalityPart = ((c.cardType === 'Ученическа карта' || c.cardType === 'Пенсионерска карта' || c.cardType === 'Учителска карта') && c.municipality) ? ` - Община: ${c.municipality}` : '';
                                    const cardNum = getClientCardNumber(c);
                                    const cardNumPart = cardNum ? ` (Карта № ${cardNum})` : '';
                                    return `${c.name}${cardNumPart}${schoolPart}${addressPart}${municipalityPart} - ${c.cardType || 'Нормална карта'} - ${c.route}${distancePart} - ${getReportAmount(c)} € (${getReportPaymentBreakdown(c).label})`;
                                }).join('\n');
                                const footer = `\n---\nОбщо: ${totalReportRevenue.toFixed(2)} €`;
                                const shareText = header + rows + footer;

                                if (navigator.share) {
                                    try {
                                        await navigator.share({
                                            title: 'Финансов Отчет DARY COMMERCE',
                                            text: shareText
                                        });
                                    } catch (err) {
                                        console.log('Споделянето отменено.', err);
                                    }
                                } else {
                                    navigator.clipboard.writeText(shareText);
                                    alert('Данните са копирани в клипборда! Можете да ги поставите в имейл или съобщение.');
                                }
                            };

                            // Print via a clean, manually-paginated document in a new window.
                            // The previous approach (position:absolute + visibility on the live
                            // DOM) clipped everything after the first page, so the printed list
                            // was incomplete. Here every page carries the report title, date and
                            // "Страница X от Y", and rows never split across pages.
                            const handlePrintReport = () => {
                                const dateStr = new Date().toLocaleDateString('bg-BG');
                                const periodStr = reportPeriodType === 'month'
                                    ? `Месец: ${reportMonth === 'all' ? 'Всички' : reportMonth}`
                                    : `Ден: ${(() => { const d = new Date(reportDate); return isNaN(d.getTime()) ? reportDate : d.toLocaleDateString('bg-BG'); })()}`;
                                const title = reportByContract
                                    ? `РЕГИСТЪР ЗА ИЗДАДЕНИТЕ КАРТИ (${(reportCardType === 'all' ? 'всички видове' : reportCardType).toUpperCase()}) ПО ДОГОВОР С ОБЩИНА : ${contractMunicipalities.join(', ').toUpperCase()}`
                                    : (useRegisterPrint ? `РЕГИСТЪР НА ИЗДАДЕНИТЕ КАРТИ (${registerCategoryLabel})` : 'ФИНАНСОВ ОТЧЕТ НА ПРИХОДИТЕ');
                                const subStr = reportByContract
                                    ? (reportPeriodType === 'month'
                                        ? `МЕСЕЦ: ${reportMonth === 'all' ? 'Всички' : reportMonth.toUpperCase()}`
                                        : `ДЕН: ${(() => { const d = new Date(reportDate); return isNaN(d.getTime()) ? reportDate : d.toLocaleDateString('bg-BG'); })()}`)
                                    : [
                                        `Дата: ${dateStr}`,
                                        periodStr,
                                        `Вид: ${reportCardType === 'all' ? 'Всички' : reportCardType}`,
                                        `Плащане: ${reportPaymentMethod === 'all' ? 'Всички' : reportPaymentMethod}`,
                                        `Маршрут: ${reportRoute === 'all' ? 'Всички' : reportRoute}`,
                                    ].join(' | ');

                                const detailLabel = reportCardType === 'Ученическа карта' ? 'Училище'
                                    : (reportCardType === 'Пенсионерска карта' || reportCardType === 'Инвалидна карта') ? 'Адрес' : '';

                                let cols: string[];
                                let rowVals: (c: Client, n: number) => (string | number)[];
                                if (useRegisterPrint) {
                                    // Pensioner & student registers are official name lists — drop the
                                    // "Направление" (route) and "Плащане" (amount) columns for them.
                                    const hideRoutePayment = reportCardType === 'Пенсионерска карта' || reportCardType === 'Ученическа карта';
                                    cols = hideRoutePayment
                                        ? ['№', 'ИМЕ', 'Община', detailLabel || '—', 'КАРТА №', 'ДАТА']
                                        : ['№', 'ИМЕ', 'Община', detailLabel || '—', 'КАРТА №', 'ДАТА', 'Направление', 'Плащане'];
                                    rowVals = (c, n) => {
                                        const base = [
                                            n,
                                            c.name,
                                            c.municipality || '---',
                                            (reportCardType === 'Ученическа карта' ? c.school : (reportCardType === 'Пенсионерска карта' || reportCardType === 'Инвалидна карта') ? c.address : '') || '---',
                                            getClientCardNumber(c) || '---',
                                            getRegisterDate(c),
                                        ];
                                        return hideRoutePayment ? base : [...base, c.route, `${getReportAmount(c)} €`];
                                    };
                                } else {
                                    // Show the "Плащане" (method) column ONLY when no single
                                    // payment method is filtered (otherwise it's redundant — the
                                    // header already states the method and there is a "Сума" column).
                                    // When shown, it lists only the method name(s), not the amount.
                                    const showMethodCol = reportPaymentMethod === 'all';
                                    cols = showMethodCol
                                        ? ['№', 'Име', 'Карта №', 'Вид', 'Курс', 'Плащане', 'Сума']
                                        : ['№', 'Име', 'Карта №', 'Вид', 'Курс', 'Сума'];
                                    rowVals = (c, n) => showMethodCol
                                        ? [n, c.name, getClientCardNumber(c) || '---', c.cardType || 'Нормална карта', c.route, getReportPaymentBreakdown(c).methods, `${getReportAmount(c)} €`]
                                        : [n, c.name, getClientCardNumber(c) || '---', c.cardType || 'Нормална карта', c.route, `${getReportAmount(c)} €`];
                                }

                                const rows = filteredReportClients;
                                const rowsData = rows.map((c, i) => rowVals(c, i + 1).map(v => String(v)));
                                let logoUrl = '';
                                try { logoUrl = new URL(logoMain, window.location.href).href; } catch { logoUrl = ''; }

                                const payload = {
                                    title,
                                    sub: subStr,
                                    cols,
                                    rows: rowsData,
                                    logo: logoUrl,
                                    footLeft: '<b>СЪСТАВИЛ:</b> К. ВАСИЛЕВА &nbsp;.............................',
                                    footRight: '<b>Общо записи:</b> ' + rows.length + (!useRegisterPrint ? ' &nbsp;|&nbsp; <b>Общо приход:</b> ' + totalReportRevenue.toFixed(2) + ' €' : ''),
                                };
                                const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');

                                const css = `@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { font-family: Arial, "Segoe UI", sans-serif; color: #000; margin: 0; }
.page { padding: 12mm 14mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.rep-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 10px; }
.rep-left { display: flex; align-items: center; gap: 12px; }
.rep-logo { height: 40px; width: auto; }
.rep-title { font-size: 18px; font-weight: 800; text-transform: uppercase; line-height: 1.15; }
.rep-sub { font-size: 12px; color: #444; margin-top: 3px; }
.rep-page { font-size: 14px; font-weight: 700; white-space: nowrap; padding-top: 2px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 6px 8px; font-size: 13px; text-align: left; vertical-align: top; }
th { background: #e8e8e8; font-weight: 700; }
tbody tr:nth-child(even) { background: #f6f6f6; }
tr { page-break-inside: avoid; }
.rep-foot { display: flex; justify-content: space-between; gap: 12px; margin-top: 12px; padding-top: 9px; border-top: 1px solid #222; font-size: 13px; }`;

                                // This script runs inside the print window: it paginates by MEASURING
                                // real row heights so each A4 page is filled, then prints.
                                const script = `
var D = ${payloadJson};
var esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(m){ return m==='&'?'&amp;':m==='<'?'&lt;':m==='>'?'&gt;':'&quot;'; }); };
var logoHtml = D.logo ? '<img class="rep-logo" src="'+D.logo+'"/>' : '';
function headerHtml(pn, tp){ return '<div class="rep-header"><div class="rep-left">'+logoHtml+'<div><div class="rep-title">'+esc(D.title)+'</div><div class="rep-sub">'+esc(D.sub)+'</div></div></div><div class="rep-page">Страница '+pn+' от '+tp+'</div></div>'; }
var thead = '<thead><tr>'+D.cols.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead>';
function rowHtml(r){ return '<tr>'+r.map(function(c){return '<td>'+esc(c)+'</td>';}).join('')+'</tr>'; }
var probe = document.createElement('div'); probe.style.cssText='position:absolute;visibility:hidden;height:273mm;'; document.body.appendChild(probe);
var PAGE_H = probe.offsetHeight - 6; probe.remove();
var meas = document.createElement('div'); meas.style.cssText='position:absolute;visibility:hidden;left:-10000px;top:0;width:182mm;'; document.body.appendChild(meas);
function blockH(ch){ meas.innerHTML = headerHtml(1,9)+'<table>'+thead+'<tbody>'+ch.map(rowHtml).join('')+'</tbody></table>'; return meas.offsetHeight; }
var chunks=[]; var cur=[];
for (var i=0;i<D.rows.length;i++){ cur.push(D.rows[i]); if (blockH(cur) > PAGE_H && cur.length>1){ cur.pop(); chunks.push(cur); cur=[D.rows[i]]; } }
if (cur.length) chunks.push(cur);
if (chunks.length===0) chunks.push([]);
meas.remove();
var tp = chunks.length; var out='';
for (var p=0;p<tp;p++){ var foot=(p===tp-1)?'<div class="rep-foot"><div>'+D.footLeft+'</div><div>'+D.footRight+'</div></div>':''; out += '<div class="page">'+headerHtml(p+1,tp)+'<table>'+thead+'<tbody>'+chunks[p].map(rowHtml).join('')+'</tbody></table>'+foot+'</div>'; }
document.getElementById('pages').innerHTML = out;
var done=false; function go(){ if(done) return; done=true; window.focus(); window.print(); }
var imgs=document.images;
if(!imgs.length){ setTimeout(go,200); } else { var left=imgs.length; var tick=function(){ if(--left<=0) setTimeout(go,150); }; for(var k=0;k<imgs.length;k++){ var im=imgs[k]; if(im.complete) tick(); else { im.onload=tick; im.onerror=tick; } } setTimeout(go,3000); }
`;
                                const html = `<!DOCTYPE html><html lang="bg"><head><meta charset="utf-8"><title>${title.replace(/[<>]/g, '')}</title><style>${css}</style></head><body><div id="pages"></div><script>${script}</script></body></html>`;

                                const w = window.open('', '_blank');
                                if (!w) { alert('Моля, разрешете изскачащите прозорци (pop-ups), за да принтирате отчета.'); return; }
                                w.document.open();
                                w.document.write(html);
                                w.document.close();
                            };

                            return (
                                <Card>
                                    {/* 🖨️ Professional Print Header Summary */}
                                    <div style={{ display: 'none' }} className="print-only-header">
                                        <div style={{ borderBottom: '3px double #222', paddingBottom: '1.25rem', marginBottom: '1.5rem', fontFamily: 'sans-serif' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                <img src={logoMain} alt="Dary Commerce" style={{ height: '44px', width: 'auto', objectFit: 'contain', display: 'block', margin: '0' }} />
                                                {!reportByContract && (
                                                    <span style={{ fontSize: '11px', color: '#666' }}>Дата на съставяне: {new Date().toLocaleDateString('bg-BG')} г.</span>
                                                )}
                                            </div>
                                            <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#000', margin: '0 0 1rem 0', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
                                                {reportByContract ? `РЕГИСТЪР ЗА ИЗДАДЕНИТЕ КАРТИ (${(reportCardType === 'all' ? 'всички видове' : reportCardType).toUpperCase()}) ПО ДОГОВОР С ОБЩИНА : ${contractMunicipalities.join(', ').toUpperCase()}` : (useRegisterPrint ? `РЕГИСТЪР НА ИЗДАДЕНИТЕ КАРТИ (${registerCategoryLabel})` : "ФИНАНСОВ ОТЧЕТ НА ПРИХОДИТЕ")}
                                            </h1>
                                            
                                            {reportByContract ? (
                                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#000', marginTop: '10px', textTransform: 'uppercase', textAlign: 'center' }}>
                                                    {reportPeriodType === 'month'
                                                        ? `МЕСЕЦ: ${reportMonth === 'all' ? 'Всички месеци' : reportMonth}`
                                                        : `ДЕН: ${(() => {
                                                            if (!reportDate) return '---';
                                                            const d = new Date(reportDate);
                                                            return isNaN(d.getTime()) ? reportDate : d.toLocaleDateString('bg-BG');
                                                        })()}`}
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem 1.5rem', fontSize: '12px', color: '#111', marginTop: '1rem', background: '#fafafa', padding: '10px 15px', borderRadius: '8px', border: '1px solid #eee' }}>
                                                    <div><strong>Период:</strong> {reportPeriodType === 'month' ? (reportMonth === 'all' ? 'Всички месеци' : reportMonth) : (() => {
                                                        if (!reportDate) return '---';
                                                        const d = new Date(reportDate);
                                                        return isNaN(d.getTime()) ? reportDate : d.toLocaleDateString('bg-BG');
                                                    })()}</div>
                                                    <div><strong>Вид Карта:</strong> {reportCardType === 'all' ? 'Всички видове' : reportCardType}</div>
                                                    <div><strong>Начин на плащане:</strong> {reportPaymentMethod === 'all' ? 'Всички методи' : reportPaymentMethod}</div>
                                                    <div><strong>Маршрут:</strong> {reportRoute === 'all' ? 'Всички маршрути' : reportRoute}</div>
                                                    <div><strong>Община:</strong> {reportByContract ? contractMunicipalities.join(', ') : (reportMunicipality === 'all' ? 'Всички общини' : reportMunicipality)}</div>
                                                    <div><strong>Разстояние:</strong> {reportDistanceFilter === 'all' ? 'Всички' : (reportDistanceFilter === 'under10' ? 'До 10 км' : 'Над 10 км')}</div>
                                                    {useRegisterPrint && <div style={{ gridColumn: 'span 3' }}><strong>Линии/Курсове:</strong> {registerLines}</div>}
                                                </div>
                                            )}
                                        </div>
                                        
                                        
                                    </div>
                                    <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary-color)' }}>
                                            <List size={20} /> Подробни Отчети и Експорт
                                        </h3>
                                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                            <button 
                                                onClick={handleShareReport}
                                                style={{ padding: '0.6rem 1.2rem', background: 'rgba(0, 173, 181, 0.1)', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                                title="Сподели данните по Имейл / Съобщение"
                                            >
                                                <Share2 size={16} /> Сподели Данни
                                            </button>
                                            <button
                                                onClick={handlePrintReport}
                                                style={{ padding: '0.6rem 1.2rem', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                            >
                                                🖨️ Принтирай Отчета
                                            </button>
                                        </div>
                                    </div>

                                    <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--surface-border)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Тип отчет</label>
                                            <select value={reportPeriodType} onChange={e => setReportPeriodType(e.target.value as 'month' | 'day')} style={{ padding: '0.6rem', background: '#fff', border: '1px solid var(--surface-border)', color: '#000', borderRadius: '8px', outline: 'none', fontWeight: 600 }}>
                                                <option value="month">Месечен Отчет</option>
                                                <option value="day">Дневен Отчет</option>
                                            </select>
                                        </div>
                                        
                                        {reportPeriodType === 'month' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Месец</label>
                                                <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ padding: '0.6rem', background: '#fff', border: '1px solid var(--surface-border)', color: '#000', borderRadius: '8px', outline: 'none', fontWeight: 600 }}>
                                                    <option value="all">Всички Месеци</option>
                                                    {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Дата (Ден)</label>
                                                <input 
                                                    type="date" 
                                                    value={reportDate} 
                                                    onChange={e => setReportDate(e.target.value)} 
                                                    style={{ padding: '0.6rem', background: '#fff', border: '1px solid var(--surface-border)', color: '#000', borderRadius: '8px', outline: 'none', fontWeight: 600, height: '38px', boxSizing: 'border-box' }}
                                                />
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Вид Плащане</label>
                                            <select value={reportPaymentMethod} onChange={e => setReportPaymentMethod(e.target.value)} style={{ padding: '0.6rem', background: '#fff', border: '1px solid var(--surface-border)', color: '#000', borderRadius: '8px', outline: 'none', fontWeight: 600 }}>
                                                <option value="all">Всички Методи</option>
                                                <option value="В брой">В брой</option>
                                                <option value="С карта">С карта</option>
                                                <option value="Банка">Банка</option>
                                                <option value="Смесено">Смесено (Банка+Кеш)</option>
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Вид Карта</label>
                                            <select value={reportCardType} onChange={e => setReportCardType(e.target.value)} style={{ padding: '0.6rem', background: '#fff', border: '1px solid var(--surface-border)', color: '#000', borderRadius: '8px', outline: 'none', fontWeight: 600 }}>
                                                <option value="all">Всички Видове</option>
                                                <option value="Нормална карта">Нормална карта</option>
                                                <option value="Ученическа карта">Ученическа карта</option>
                                                <option value="Пенсионерска карта">Пенсионерска карта</option>
                                                <option value="Учителска карта">Учителска карта</option>
                                                <option value="Инвалидна карта">Инвалидна карта</option>
                                                <option value="Служебна карта">Служебна карта</option>
                                            </select>
                                        </div>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Разстояние</label>
                                            <select value={reportDistanceFilter} onChange={e => setReportDistanceFilter(e.target.value)} style={{ padding: '0.6rem', background: '#fff', border: '1px solid var(--surface-border)', color: '#000', borderRadius: '8px', outline: 'none', fontWeight: 600 }}>
                                                <option value="all">Всички</option>
                                                <option value="under10">До 10 км</option>
                                                <option value="over10">Над 10 км</option>
                                            </select>
                                        </div>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Маршрут</label>
                                            <select value={reportRoute} onChange={e => setReportRoute(e.target.value)} style={{ padding: '0.6rem', background: '#fff', border: '1px solid var(--surface-border)', color: '#000', borderRadius: '8px', outline: 'none', fontWeight: 600 }}>
                                                <option value="all">Всички Маршрути</option>
                                                {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        
                                        {!reportByContract && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Община</label>
                                                <select value={reportMunicipality} onChange={e => setReportMunicipality(e.target.value)} style={{ padding: '0.6rem', background: '#fff', border: '1px solid var(--surface-border)', color: '#000', borderRadius: '8px', outline: 'none', fontWeight: 600 }}>
                                                    <option value="all">Всички Общини</option>
                                                    {MUNICIPALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                                                </select>
                                            </div>
                                        )}

                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Договор</label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const nextVal = !reportByContract;
                                                    setReportByContract(nextVal);
                                                    if (nextVal && contractMunicipalities.length === 0) {
                                                        setContractMunicipalities([...MUNICIPALITIES]);
                                                    }
                                                }}
                                                style={{
                                                    padding: '0.6rem',
                                                    background: reportByContract ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                                                    border: '1px solid var(--surface-border)',
                                                    color: reportByContract ? '#000' : '#fff',
                                                    borderRadius: '8px',
                                                    outline: 'none',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    textAlign: 'center',
                                                    height: '38px',
                                                    boxSizing: 'border-box'
                                                }}
                                            >
                                                {reportByContract ? '✓ ПО ДОГОВОР' : 'БЕЗ ДОГОВОР'}
                                            </button>
                                        </div>

                                        {reportByContract && (
                                            <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', padding: '1rem', background: 'rgba(255,255,255,0.015)', border: '1px dashed var(--surface-border)', borderRadius: '12px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Избери общини по договора:</label>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setContractMunicipalities([...MUNICIPALITIES])}
                                                            style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                                        >
                                                            Всички
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setContractMunicipalities([])}
                                                            style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                                        >
                                                            Изчисти
                                                        </button>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem' }}>
                                                    {MUNICIPALITIES.map(m => {
                                                        const isChecked = contractMunicipalities.includes(m);
                                                        return (
                                                            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', color: isChecked ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => {
                                                                        if (isChecked) {
                                                                            setContractMunicipalities(contractMunicipalities.filter(x => x !== m));
                                                                        } else {
                                                                            setContractMunicipalities([...contractMunicipalities, m]);
                                                                        }
                                                                    }}
                                                                    style={{ cursor: 'pointer' }}
                                                                />
                                                                {m}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {useRegisterPrint && (
                                        <div className="register-print" style={{ color: '#000' }}>
                                            
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                <thead>
                                                    <tr>
                                                        <th>№</th>
                                                        <th>ИМЕ</th>
                                                        <th>Община</th>
                                                        <th>{reportCardType === 'Ученическа карта' ? 'Училище' : (reportCardType === 'Пенсионерска карта' || reportCardType === 'Инвалидна карта') ? 'Адрес' : '—'}</th>
                                                        <th>КАРТА №</th>
                                                        <th>ДАТА</th>
                                                        {!(reportCardType === 'Пенсионерска карта' || reportCardType === 'Ученическа карта') && (
                                                            <>
                                                                <th>Направление</th>
                                                                <th>Плащане</th>
                                                            </>
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredReportClients.length > 0 ? filteredReportClients.map((c, i) => (
                                                        <tr key={c.id}>
                                                            <td>{i + 1}</td>
                                                            <td>{c.name}</td>
                                                            <td>{c.municipality || '---'}</td>
                                                            <td>{(reportCardType === 'Ученическа карта' ? c.school : (reportCardType === 'Пенсионерска карта' || reportCardType === 'Инвалидна карта') ? c.address : '') || '---'}</td>
                                                            <td>{getClientCardNumber(c) || '---'}</td>
                                                            <td>{getRegisterDate(c)}</td>
                                                            {!(reportCardType === 'Пенсионерска карта' || reportCardType === 'Ученическа карта') && (
                                                                <>
                                                                    <td>{c.route}</td>
                                                                    <td>{getReportAmount(c)} €</td>
                                                                </>
                                                            )}
                                                        </tr>
                                                    )) : (
                                                        <tr><td colSpan={(reportCardType === 'Пенсионерска карта' || reportCardType === 'Ученическа карта') ? 6 : 8} style={{ textAlign: 'center', padding: '12px' }}>Няма данни за избраните филтри</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '2px solid #333', paddingTop: '10px', fontSize: '13px', color: '#000' }}>
                                                <div><b>СЪСТАВИЛ:</b> К. ВАСИЛЕВА &nbsp;&nbsp;.................................</div>
                                                <div style={{ fontWeight: 700 }}><b>Общо издадени карти:</b> {filteredReportClients.length}</div>
                                            </div>
                                        </div>
                                    )}
                                    <div className={useRegisterPrint ? 'screen-only-report' : undefined}>
                                        {!isMobile ? (
                                            <div style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                                                    <thead>
                                                        <tr>
                                                            <th>Име на Клиент</th>
                                                            <th>Номер Карта</th>
                                                            <th>Вид Карта</th>
                                                            <th>Курс</th>
                                                            {reportDistanceFilter !== 'all' && <th>Разстояние</th>}
                                                            {showAddressCol && <th>Адрес</th>}
                                                            {reportCardType === 'Ученическа карта' && <th>Училище</th>}
                                                            {showMunicipalityCol && <th>Община</th>}
                                                            <th>Платена Сума</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {filteredReportClients.length > 0 ? filteredReportClients.map(c => (
                                                            <tr key={c.id}>
                                                                <td style={{ fontWeight: 600 }}>{c.name}</td>
                                                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{getClientCardNumber(c) || '---'}</td>
                                                                <td><span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>{c.cardType || 'Нормална карта'}</span></td>
                                                                <td style={{ fontSize: '0.9rem' }}>{c.route}</td>
                                                                {reportDistanceFilter !== 'all' && (
                                                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                                        {["Ясен", "Опанец", "Ясен-Дисевица"].includes(c.route) ? "До 10 км" : "Над 10 км"}
                                                                    </td>
                                                                )}
                                                                {showAddressCol && <td style={{ fontSize: '0.8rem' }}>{c.address || '---'}</td>}
                                                                {reportCardType === 'Ученическа карта' && <td style={{ fontSize: '0.8rem' }}>{c.school || '---'}</td>}
                                                                {showMunicipalityCol && <td style={{ fontSize: '0.8rem' }}>{c.municipality || '---'}</td>}
                                                                <td style={{ fontWeight: 700, color: 'var(--success-color)' }}>{getReportAmount(c)} €</td>
                                                            </tr>
                                                        )) : (
                                                            <tr>
                                                                <td colSpan={reportColSpan} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Няма данни за избраните филтри</td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {filteredReportClients.length > 0 ? filteredReportClients.map(c => (
                                                    <div key={c.id} style={{ 
                                                        padding: '1.25rem', 
                                                        background: 'rgba(255,255,255,0.03)', 
                                                        borderRadius: '16px', 
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '0.75rem'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{c.name}</div>
                                                            <div style={{ fontWeight: 900, color: '#00e676', fontSize: '1.1rem' }}>
                                                                {getReportAmount(c)} €
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', color: 'var(--text-secondary)' }}>
                                                                {c.cardType || 'Нормална карта'}
                                                            </span>
                                                            <span style={{ fontSize: '0.7rem', padding: '0.6rem 1.2rem', background: 'rgba(0, 173, 181, 0.1)', borderRadius: '6px', color: 'var(--primary-color)', fontWeight: 600 }}>
                                                                {c.route}
                                                            </span>
                                                            {reportDistanceFilter !== 'all' && (
                                                                <span style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', color: 'var(--text-secondary)' }}>
                                                                    {["Ясен", "Опанец", "Ясен-Дисевица"].includes(c.route) ? "До 10 км" : "Над 10 км"}
                                                                </span>
                                                            )}
                                                            {showAddressCol && (
                                                                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'rgba(255,171,0,0.8)', fontStyle: 'italic' }}>
                                                                    <b>Адрес:</b> {c.address || 'Няма въведен адрес'}
                                                                </div>
                                                            )}
                                                            {reportCardType === 'Ученическа карта' && (
                                                                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--primary-color)', fontStyle: 'italic' }}>
                                                                    <b>Училище:</b> {c.school || 'Няма въведено училище'}
                                                                </div>
                                                            )}
                                                            {(c.cardType === 'Ученическа карта' || c.cardType === 'Пенсионерска карта' || c.cardType === 'Учителска карта') && (
                                                                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--accent-color)', fontStyle: 'italic' }}>
                                                                    <b>Община:</b> {c.municipality || 'Няма въведена община'}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.01)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                                        Няма данни за избраните филтри
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '2px solid rgba(255,255,255,0.1)' }}>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                                                Общо: <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#00e676', marginLeft: '1rem' }}>{totalReportRevenue.toFixed(2)} €</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })()}
                    </div>
                </div>
            )}


            {activeTab === 'clients' && (
                <div style={{ animation: 'fadeIn 0.4s ease' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexDirection: isMobile ? 'column' : 'row' }}>
                        <div style={{ flex: 1 }}>
                            <input
                                type="text" placeholder="Търсене по име, ID, № карта или курс..."
                                style={{ width: '100%', padding: '0.8rem 1.5rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)', outline: 'none', fontSize: '0.9rem' }}
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                title="Подреждане"
                                style={{ flex: 1, minWidth: '150px', padding: '0.8rem 1rem', borderRadius: '50px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.3)', color: '#fff', outline: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}
                            >
                                <option value="recent" style={{ background: '#222' }}>↓ Последно добавени</option>
                                <option value="alpha" style={{ background: '#222' }}>А–Я (Азбучен ред)</option>
                                <option value="cardType" style={{ background: '#222' }}>По вид карта</option>
                                <option value="paid" style={{ background: '#222' }}>Първо платени</option>
                                <option value="unpaid" style={{ background: '#222' }}>Първо неплатени</option>
                            </select>

                            <select
                                value={filterCardType}
                                onChange={(e) => { setFilterCardType(e.target.value); if (e.target.value !== 'Ученическа карта') setFilterSchool('all'); }}
                                title="Вид карта"
                                style={{ flex: 1, minWidth: '150px', padding: '0.8rem 1rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                <option value="all" style={{ background: '#222' }}>Всички видове карти</option>
                                {CARD_TYPES.map(t => (
                                    <option key={t} value={t} style={{ background: '#222' }}>{t}</option>
                                ))}
                            </select>

                            {filterCardType === 'Ученическа карта' && (
                                <select
                                    value={filterSchool}
                                    onChange={(e) => setFilterSchool(e.target.value)}
                                    title="Училище"
                                    style={{ flex: 1, minWidth: '150px', padding: '0.8rem 1rem', borderRadius: '50px', background: 'rgba(0,173,181,0.08)', border: '1px solid rgba(0,173,181,0.3)', color: '#fff', outline: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}
                                >
                                    <option value="all" style={{ background: '#222' }}>Всички училища</option>
                                    {Array.from(new Set([
                                        ...SCHOOLS,
                                        ...clients.filter(c => c.cardType === 'Ученическа карта' && c.school).map(c => c.school as string)
                                    ])).sort((a, b) => a.localeCompare(b, 'bg')).map(s => (
                                        <option key={s} value={s} style={{ background: '#222' }}>{s}</option>
                                    ))}
                                </select>
                            )}

                            <select
                                value={filterMonth}
                                onChange={(e) => setFilterMonth(e.target.value)}
                                title="Месец за статус"
                                style={{ flex: 1, minWidth: '120px', padding: '0.8rem 1rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                {allMonths.map(m => (
                                    <option key={m} value={m} style={{ background: '#222' }}>{m}</option>
                                ))}
                            </select>

                            <select
                                value={filterRoute}
                                onChange={(e) => setFilterRoute(e.target.value)}
                                title="Курс"
                                style={{ flex: 1, minWidth: '150px', padding: '0.8rem 1rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                <option value="all" style={{ background: '#222' }}>Всички Курсове</option>
                                {ROUTES.map(r => (
                                    <option key={r} value={r} style={{ background: '#222' }}>{r}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="desktop-table">
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '34px' }}>
                                            <input
                                                type="checkbox"
                                                title="Избери всички (по текущия филтър)"
                                                checked={filteredClientsByFilters.length > 0 && filteredClientsByFilters.every(c => selectedClientIds.has(c.id))}
                                                onChange={(e) => setSelectedClientIds(prev => {
                                                    const next = new Set(prev);
                                                    if (e.target.checked) filteredClientsByFilters.forEach(c => next.add(c.id));
                                                    else filteredClientsByFilters.forEach(c => next.delete(c.id));
                                                    return next;
                                                })}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                                            />
                                        </th>
                                        <th>Клиент</th>
                                        <th>Курс</th>
                                        <th>Вид карта</th>
                                        <th>Платено (€)</th>
                                        <th>Статус за {filterMonth}</th>
                                        <th>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClientsByFilters.length > 0 ? (
                                        filteredClientsByFilters.slice(0, visibleClients).map(client => {
                                            const status = getClientStatusForMonth(client, filterMonth);
                                            return (
                                                <tr key={client.id} style={{ background: selectedClientIds.has(client.id) ? 'rgba(0,173,181,0.06)' : undefined }}>
                                                    <td style={{ width: '34px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedClientIds.has(client.id)}
                                                            onChange={() => toggleClientSelected(client.id)}
                                                            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                                                        />
                                                    </td>
                                                    <td style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        <img src={client.photo} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{client.name}</div>
                                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>ID: {client.id}</span>
                                                                {getClientCardNumber(client) && (
                                                                    <span style={{ 
                                                                        fontSize: '0.7rem', 
                                                                        fontWeight: 700, 
                                                                        background: 'rgba(0, 173, 181, 0.1)', 
                                                                        color: 'var(--primary-color)', 
                                                                        padding: '1px 5px', 
                                                                        borderRadius: '4px',
                                                                        border: '1px solid rgba(0, 173, 181, 0.3)'
                                                                    }}>
                                                                        Карта № {getClientCardNumber(client)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{ 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 700, 
                                                            color: getRouteColor(client.route),
                                                            padding: '0.2rem 0.6rem',
                                                            borderRadius: '6px',
                                                            background: 'rgba(255,255,255,0.03)',
                                                            border: `1px solid ${getRouteColor(client.route)}`
                                                        }}>
                                                            {client.route}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            color: 'var(--text-secondary)',
                                                            padding: '0.2rem 0.6rem',
                                                            borderRadius: '6px',
                                                            background: 'rgba(255,255,255,0.05)',
                                                            border: '1px solid var(--surface-border)',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {client.cardType || 'Нормална карта'}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontWeight: 700, color: getMonthPayment(client, filterMonth) > 0 ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                                                        {getMonthPayment(client, filterMonth)} €
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            padding: '0.25rem 0.75rem', borderRadius: '50px', fontSize: '0.75rem',
                                                            background: status === 'Анулиран' || status === 'Неплатен' ? 'rgba(255,0,0,0.1)' : 'var(--success-bg)',
                                                            color: status === 'Анулиран' || status === 'Неплатен' ? '#ff4040' : 'var(--success-color)',
                                                            fontWeight: 700
                                                        }}>
                                                            {status}
                                                        </span>
                                                    </td>
                                                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            onClick={() => { setSelectedClient(client); setNewRoute(getClientRoutes(client)[0] || ''); setShowActionModal(true); }}
                                                            style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--surface-border)', fontSize: '0.75rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                                                        >
                                                            Управление
                                                        </button>
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => handleDeleteClient(client.id, client.name)}
                                                                style={{ padding: '0.4rem', color: 'var(--error-color)', borderRadius: '6px', border: '1px solid rgba(255,0,0,0.2)', cursor: 'pointer', background: 'rgba(255,0,0,0.05)', display: 'flex', alignItems: 'center' }}
                                                                title="Изтрий Постоянно"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                        <a 
                                                            href={`${import.meta.env.BASE_URL}#/client/${client.id}`} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--primary-color)', fontSize: '0.75rem', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}
                                                        >
                                                            <ExternalLink size={14} /> Виж
                                                        </a>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                                                Няма намерени клиенти по този критерий.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="mobile-cards">
                        {filteredClientsByFilters.length > 0 ? (
                            filteredClientsByFilters.slice(0, visibleClients).map(client => {
                                const status = getClientStatusForMonth(client, filterMonth);
                                const isMonthPaid = getMonthPayment(client, filterMonth) > 0;
                                return (
                                    <div key={client.id} className="client-card" style={selectedClientIds.has(client.id) ? { border: '1px solid var(--primary-color)', background: 'rgba(0,173,181,0.06)' } : undefined}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedClientIds.has(client.id)}
                                                    onChange={() => toggleClientSelected(client.id)}
                                                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--primary-color)', marginTop: '0.4rem', flexShrink: 0 }}
                                                />
                                                <img src={client.photo} style={{ width: '50px', height: '50px', borderRadius: '12px', objectFit: 'cover' }} />
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{client.name}</div>
                                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>ID: {client.id}</span>
                                                        {getClientCardNumber(client) && (
                                                            <span style={{ 
                                                                fontSize: '0.65rem', 
                                                                fontWeight: 700, 
                                                                background: 'rgba(0, 173, 181, 0.1)', 
                                                                color: 'var(--primary-color)', 
                                                                padding: '1px 4px', 
                                                                borderRadius: '4px',
                                                                border: '1px solid rgba(0, 173, 181, 0.3)'
                                                            }}>
                                                                Карта № {getClientCardNumber(client)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
                                                <span style={{
                                                    fontSize: '0.7rem', fontWeight: 700, color: getRouteColor(client.route),
                                                    padding: '0.2rem 0.6rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${getRouteColor(client.route)}`, whiteSpace: 'nowrap'
                                                }}>
                                                    {client.route}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)',
                                                    padding: '0.15rem 0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', whiteSpace: 'nowrap'
                                                }}>
                                                    {client.cardType || 'Нормална карта'}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.1rem' }}>Платено {filterMonth}</div>
                                                <div style={{ fontWeight: 700, color: isMonthPaid ? 'var(--success-color)' : 'var(--text-secondary)' }}>{getMonthPayment(client, filterMonth)} €</div>
                                            </div>
                                            <span style={{
                                                padding: '0.2rem 0.6rem', borderRadius: '50px', fontSize: '0.7rem', fontWeight: 700,
                                                background: status === 'Анулиран' || status === 'Неплатен' ? 'rgba(255,0,0,0.1)' : 'var(--success-bg)',
                                                color: status === 'Анулиран' || status === 'Неплатен' ? '#ff4040' : 'var(--success-color)'
                                            }}>
                                                {status}
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => { setSelectedClient(client); setNewRoute(getClientRoutes(client)[0] || ''); setShowActionModal(true); }}
                                                style={{ padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--surface-border)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', background: 'var(--primary-color)', color: '#fff' }}
                                            >
                                                Управление
                                            </button>
                                            <a 
                                                href={`#/client/${client.id}`} target="_blank" rel="noopener noreferrer"
                                                style={{ padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                <ExternalLink size={18} />
                                            </a>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => handleDeleteClient(client.id, client.name)}
                                                    style={{ padding: '0.7rem', color: 'var(--error-color)', borderRadius: '8px', border: '1px solid rgba(255,0,0,0.2)', background: 'rgba(255,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Няма намерени клиенти.</div>
                        )}
                    </div>

                    {filteredClientsByFilters.length > visibleClients && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                            <button
                                onClick={() => setVisibleClients(n => n + 20)}
                                style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--surface-border)', borderRadius: '50px', padding: '0.8rem 2rem', fontWeight: 800, cursor: 'pointer' }}
                            >
                                Зареди още ({filteredClientsByFilters.length - visibleClients})
                            </button>
                        </div>
                    )}

                    {/* Floating bulk-selection bar */}
                    {selectedClientIds.size > 0 && !showBulkRenew && (
                        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 900, background: '#17171c', border: '1px solid var(--primary-color)', borderRadius: '50px', padding: '0.6rem 0.75rem 0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 12px 40px rgba(0,0,0,0.55)', flexWrap: 'wrap', maxWidth: '95vw' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{selectedClientIds.size} избрани</span>
                            <button onClick={() => { setBulkResult(null); setBulkMonth(getDefaultExpiryMonth()); setBulkPaymentMethod('В брой'); setShowBulkRenew(true); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--success-color)', color: '#fff', border: 'none', borderRadius: '50px', padding: '0.6rem 1.1rem', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                <RefreshCw size={16} /> Поднови групово
                            </button>
                            <button onClick={() => setSelectedClientIds(new Set())} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)', borderRadius: '50px', padding: '0.6rem 1rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                Изчисти
                            </button>
                        </div>
                    )}

                    {/* Bulk renewal modal */}
                    {showBulkRenew && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => { if (!bulkProcessing) { setShowBulkRenew(false); setBulkResult(null); } }}>
                            <div onClick={(e) => e.stopPropagation()} style={{ background: '#17171c', border: '1px solid var(--surface-border)', borderRadius: '20px', width: '100%', maxWidth: '520px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                {bulkResult ? (
                                    <div style={{ padding: '2.5rem 2rem', textAlign: 'center' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
                                        <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '0.75rem' }}>Готово!</h3>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Успешно подновени: <b style={{ color: 'var(--success-color)' }}>{bulkResult.ok}</b> карти за <b>{bulkMonth}</b>.</p>
                                        {bulkResult.fail > 0 && <p style={{ color: '#ff5252', marginBottom: '0.5rem' }}>Неуспешни: <b>{bulkResult.fail}</b></p>}
                                        <button onClick={() => { setShowBulkRenew(false); setBulkResult(null); }} style={{ marginTop: '1rem', padding: '0.8rem 2rem', borderRadius: '50px', background: 'var(--primary-color)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}>Затвори</button>
                                    </div>
                                ) : (() => {
                                    const selectedList = clients.filter(c => selectedClientIds.has(c.id));
                                    const total = selectedList.reduce((s, c) => s + computeCardAmount(getClientRoutes(c)[0] || c.route, c.cardType), 0);
                                    return (
                                        <>
                                            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--surface-border)' }}>
                                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.15rem', color: 'var(--success-color)' }}><RefreshCw size={20} /> Групово подновяване ({selectedList.length})</h3>
                                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0' }}>Всяка карта се подновява по своята цена (курс + вид). Служебните — за цялата година.</p>
                                            </div>
                                            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', gap: '1rem', borderBottom: '1px solid var(--surface-border)', flexWrap: 'wrap' }}>
                                                <div style={{ flex: 1, minWidth: '140px' }}>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>МЕСЕЦ</label>
                                                    <input type="month" value={bulkMonth} onChange={(e) => setBulkMonth(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: '#fff', colorScheme: 'dark' }} />
                                                </div>
                                                <div style={{ flex: 1, minWidth: '140px' }}>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>НАЧИН НА ПЛАЩАНЕ</label>
                                                    <select value={bulkPaymentMethod} onChange={(e) => setBulkPaymentMethod(e.target.value)} style={{ width: '100%', padding: '0.6rem', background: '#222', border: '1px solid var(--surface-border)', borderRadius: '8px', color: '#fff' }}>
                                                        {['В брой', 'С карта', 'Банка'].map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div style={{ overflowY: 'auto', flex: 1, padding: '0.5rem 1.5rem' }}>
                                                {selectedList.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Няма избрани клиенти.</div>
                                                ) : selectedList.map(c => (
                                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <img src={c.photo} style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{c.route} · {c.cardType || 'Нормална карта'}</div>
                                                        </div>
                                                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: c.cardType === 'Служебна карта' ? 'var(--text-secondary)' : 'var(--success-color)', whiteSpace: 'nowrap' }}>
                                                            {c.cardType === 'Служебна карта' ? 'цяла година' : `${computeCardAmount(getClientRoutes(c)[0] || c.route, c.cardType).toFixed(2)} €`}
                                                        </div>
                                                        <button onClick={() => toggleClientSelected(c.id)} title="Махни от групата" style={{ background: 'transparent', border: 'none', color: '#ff5252', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                                                            <XCircle size={20} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                                                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Общо: <b style={{ color: '#fff' }}>{total.toFixed(2)} €</b></div>
                                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                    <button disabled={bulkProcessing} onClick={() => { setShowBulkRenew(false); }} style={{ padding: '0.7rem 1.25rem', borderRadius: '8px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--surface-border)', fontWeight: 700, cursor: 'pointer' }}>Отказ</button>
                                                    <button disabled={bulkProcessing || selectedList.length === 0} onClick={bulkRenew} style={{ padding: '0.7rem 1.5rem', borderRadius: '8px', background: 'var(--success-color)', color: '#fff', border: 'none', fontWeight: 800, cursor: bulkProcessing || selectedList.length === 0 ? 'not-allowed' : 'pointer', opacity: bulkProcessing || selectedList.length === 0 ? 0.6 : 1 }}>
                                                        {bulkProcessing ? 'Подновяване…' : `Поднови ${selectedList.length}`}
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'register' && (
                <div style={{ marginBottom: '2rem', animation: 'fadeIn 0.4s ease' }}>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#00c853', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <PlusCircle size={24} /> ДОБАВЯНЕ НА КАРТА
                    </h2>
                    
                    {registrationSuccess ? (
                        <Card style={{ 
                            padding: '3rem 2rem', 
                            textAlign: 'center', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            gap: '1.5rem',
                            border: '2px solid rgba(0, 200, 83, 0.3)',
                            background: 'linear-gradient(135deg, rgba(0, 200, 83, 0.05) 0%, rgba(0, 0, 0, 0) 100%)'
                        }}>
                            <div style={{ 
                                width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(0, 200, 83, 0.1)', 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c853',
                                marginBottom: '0.5rem', boxShadow: '0 0 20px rgba(0, 200, 83, 0.2)'
                            }}>
                                <ShieldCheck size={48} />
                            </div>
                            
                            <div>
                                <h3 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', color: '#00c853' }}>Успешно създадена карта!</h3>
                                <p style={{ color: 'var(--text-secondary)' }}>Картата на <b>{registrationSuccess.name}</b> за курс <b>{registrationSuccess.route}</b> е готова.</p>
                                <div style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', display: 'inline-block', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em', fontSize: '1.1rem', color: 'var(--primary-color)' }}>
                                    ID: {registrationSuccess.id}
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' }}>
                                <button 
                                    onClick={() => setRegistrationSuccess(null)}
                                    style={{ 
                                        padding: '1rem 2rem', borderRadius: '50px', background: '#00c853', color: '#fff', 
                                        fontWeight: 700, fontSize: '1rem', cursor: 'pointer', border: 'none',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 4px 15px rgba(0, 200, 83, 0.3)'
                                    }}
                                >
                                    <PlusCircle size={20} /> Добави нова карта
                                </button>
                                <button 
                                    onClick={() => { setRegistrationSuccess(null); setActiveTab('clients'); }}
                                    style={{ 
                                        padding: '1rem 2rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', color: '#fff', 
                                        fontWeight: 700, fontSize: '1rem', cursor: 'pointer', border: '1px solid var(--surface-border)',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem'
                                    }}
                                >
                                    <Users size={20} /> Виж всички карти
                                </button>
                            </div>
                        </Card>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))', gap: isMobile ? '1rem' : '2rem' }}>
                            <Card style={{ padding: isMobile ? '1.25rem' : '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: 0 }}>Снимка на Клиента</h3>
                                </div>

                                {!photoDataURL && isCapturing && (
                                    <div style={{ width: '100%', aspectRatio: '1', background: '#000', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', border: '2px solid var(--primary-color)' }}>
                                        <video 
                                            ref={videoRef} 
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                            playsInline 
                                            muted
                                        />
                                        <div style={{ position: 'absolute', bottom: '1rem', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                                            <button 
                                                type="button" 
                                                onClick={capturePhoto} 
                                                style={{ background: '#22c55e', color: '#fff', padding: '0.6rem 1.2rem', borderRadius: '50px', fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                                            >
                                                Снимай
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={stopWebcam} 
                                                style={{ background: '#ef4444', color: '#fff', padding: '0.6rem 1.2rem', borderRadius: '50px', fontWeight: 600, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                                            >
                                                Отказ
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {!photoDataURL && !isCapturing && (
                                    <div style={{ width: '100%', aspectRatio: '1', background: 'rgba(0,0,0,0.3)', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', border: '2px dashed var(--surface-border)' }}>
                                        <PlusCircle size={40} color="var(--primary-color)" style={{ marginBottom: '1rem', opacity: 0.6 }} />
                                        <button 
                                            type="button" 
                                            onClick={startWebcam} 
                                            style={{ background: 'var(--primary-color)', color: '#fff', padding: '0.8rem 1.5rem', borderRadius: '50px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer' }}
                                        >
                                            <Camera size={18} /> Пусни Камерата
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => fileInputRef.current?.click()} 
                                            style={{ background: 'transparent', color: 'var(--text-secondary)', marginTop: '1rem', border: 'none', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
                                        >
                                            или качете файл от компютъра
                                        </button>
                                        <p style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>Макс. 10MB (Samsung Galaxy/iPhone OK)</p>
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            capture="environment"
                                            ref={fileInputRef} 
                                            style={{ display: 'none' }} 
                                            onChange={handleFileUpload} 
                                        />
                                    </div>
                                )}
                                
                                {photoDataURL && (
                                    <div style={{ position: 'relative' }}>
                                        <img src={photoDataURL} style={{ width: '100%', aspectRatio: '1', borderRadius: '16px', objectFit: 'cover', border: '2px solid var(--primary-color)' }} />
                                        <button type="button" onClick={retakePhoto} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', backdropFilter: 'blur(4px)', fontWeight: 600 }}>Нова Снимка</button>
                                    </div>
                                )}
                                
                                {photoError && <div style={{ marginTop: '1rem', color: 'var(--error-color)', fontSize: '0.85rem', textAlign: 'center', background: 'rgba(255,0,0,0.1)', padding: '0.5rem', borderRadius: '8px' }}>{photoError}</div>}
                            </Card>
                            <Card style={{ padding: isMobile ? '1.25rem' : '1.5rem' }}>
                                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Име</label>
                                        <input type="text" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)' }} value={clientName} onChange={e => setClientName(e.target.value)} required />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Вид Карта</label>
                                        <select style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', color: 'white' }} value={cardType} onChange={e => {
                                            const val = e.target.value;
                                            setCardType(val);
                                            // Pensioners default to Плевен; students get their община from the
                                            // school choice; other card types carry no община.
                                            if (val === 'Пенсионерска карта') {
                                                setMunicipality(DEFAULT_MUNICIPALITY);
                                                setCustomMunicipality('');
                                            } else if (val === 'Ученическа карта') {
                                                setMunicipality(selectedSchool && selectedSchool !== 'custom' ? (SCHOOL_MUNICIPALITY[selectedSchool] || DEFAULT_MUNICIPALITY) : '');
                                                setCustomMunicipality('');
                                            } else if (val === 'Учителска карта') {
                                                setMunicipality(DEFAULT_MUNICIPALITY);
                                                setCustomMunicipality('');
                                            } else {
                                                setMunicipality('');
                                                setCustomMunicipality('');
                                            }
                                        }} required>
                                            <option value="Нормална карта">Нормална карта</option>
                                            <option value="Ученическа карта">Ученическа карта</option>
                                            <option value="Пенсионерска карта">Пенсионерска карта</option>
                                            <option value="Учителска карта">Учителска карта</option>
                                            <option value="Инвалидна карта">Инвалидна карта</option>
                                            <option value="Служебна карта">Служебна карта</option>
                                        </select>
                                    </div>
                                    {(cardType === 'Пенсионерска карта' || cardType === 'Инвалидна карта') && (
                                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#ffab00', fontWeight: 700 }}>Адрес (Задължително)</label>
                                            <input
                                                type="text"
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(255, 171, 0, 0.05)', border: '1px solid rgba(255, 171, 0, 0.3)', color: '#ffab00' }}
                                                value={address}
                                                onChange={e => setAddress(e.target.value)}
                                                placeholder="напр. ул. Иван Вазов 10, Плевен"
                                                required={cardType === 'Пенсионерска карта' || cardType === 'Инвалидна карта'}
                                            />
                                        </div>
                                    )}
                                    {cardType === 'Служебна карта' && (
                                        <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#4dd0e1', fontWeight: 700 }}>Причина за служебна карта (Задължително)</label>
                                                <textarea
                                                    rows={2}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(77, 208, 225, 0.05)', border: '1px solid rgba(77, 208, 225, 0.3)', color: '#4dd0e1', resize: 'vertical', fontFamily: 'inherit' }}
                                                    value={serviceReason}
                                                    onChange={e => setServiceReason(e.target.value)}
                                                    placeholder="напр. роднина на шофьор / договор с Община Плевен"
                                                    required={cardType === 'Служебна карта'}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#4dd0e1', fontWeight: 700 }}>Абонамент за цялата година</label>
                                                <select
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-color)', border: '1px solid rgba(77, 208, 225, 0.3)', color: '#fff', colorScheme: 'dark' }}
                                                    value={serviceYear}
                                                    onChange={e => setServiceYear(Number(e.target.value))}
                                                >
                                                    {getServiceYearOptions().map(y => <option key={y} value={y}>{y} г. (Януари – Декември)</option>)}
                                                </select>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                                                    Служебната карта е безплатна и валидна за всичките 12 месеца на избраната година.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {cardType === 'Ученическа карта' && (
                                        <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--primary-color)', fontWeight: 700 }}>Училище</label>
                                                <select 
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-color)', border: '1px solid var(--primary-color)', color: 'white' }} 
                                                    value={selectedSchool}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setSelectedSchool(val);
                                                        // Predefined (Pleven) school → auto Плевен. Custom school → leave
                                                        // empty so the operator picks/enters the община manually.
                                                        if (val === 'custom' || val === '') {
                                                            setMunicipality('');
                                                        } else {
                                                            setMunicipality(SCHOOL_MUNICIPALITY[val] || DEFAULT_MUNICIPALITY);
                                                        }
                                                        setCustomMunicipality('');
                                                    }}
                                                    required={cardType === 'Ученическа карта'}
                                                >
                                                    <option value="">-- Изберете Училище --</option>
                                                    {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    <option value="custom">Друго (въведи ръчно)...</option>
                                                </select>
                                            </div>
                                            {selectedSchool === 'custom' && (
                                                <div style={{ animation: 'slideDown 0.3s ease' }}>
                                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Име на Училището</label>
                                                    <input 
                                                        type="text" 
                                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)' }} 
                                                        value={customSchool} 
                                                        onChange={e => setCustomSchool(e.target.value)} 
                                                        placeholder="Въведете училище тук..."
                                                        required={selectedSchool === 'custom'}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {(cardType === 'Ученическа карта' || cardType === 'Пенсионерска карта' || cardType === 'Учителска карта') && (
                                        <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--accent-color)', fontWeight: 700 }}>Община</label>
                                                <select
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', color: 'white' }}
                                                    value={municipality}
                                                    onChange={e => { setMunicipality(e.target.value); if (e.target.value !== MUNICIPALITY_CUSTOM) setCustomMunicipality(''); }}
                                                    required={cardType === 'Ученическа карта' || cardType === 'Пенсионерска карта' || cardType === 'Учителска карта'}
                                                >
                                                    <option value="">-- Изберете Община --</option>
                                                    {MUNICIPALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                                                    <option value={MUNICIPALITY_CUSTOM}>Друго (въведи ръчно)...</option>
                                                </select>
                                            </div>
                                            {municipality === MUNICIPALITY_CUSTOM && (
                                                <div style={{ animation: 'slideDown 0.3s ease' }}>
                                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Име на Община</label>
                                                    <input
                                                        type="text"
                                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)' }}
                                                        value={customMunicipality}
                                                        onChange={e => setCustomMunicipality(e.target.value)}
                                                        placeholder="Въведете община тук..."
                                                        required={municipality === MUNICIPALITY_CUSTOM}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Курс (Маршрут)</label>
                                        <select style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', color: 'white' }} value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)} required>
                                            <option value="" disabled>-- Изберете Маршрут --</option>
                                            {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                    {cardType !== 'Служебна карта' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Сума (€)</label>
                                            <input type="number" step="0.01" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)' }} value={amountPaid} onChange={e => setAmountPaid(e.target.value)} required={cardType !== 'Служебна карта'} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Месец</label>
                                            <input type="month" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', colorScheme: 'dark' }} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} required={cardType !== 'Служебна карта'} />
                                        </div>
                                    </div>
                                    )}
                                    {cardType !== 'Служебна карта' && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Начин на плащане</label>
                                        <PaymentMethodSelector
                                            value={paymentMethod}
                                            onChange={(m) => { setPaymentMethod(m); if (m === MIXED_METHOD && !bankAmount && !cashAmount) { setBankAmount(amountPaid || ''); setCashAmount('0'); } }}
                                            bankAmount={bankAmount}
                                            cashAmount={cashAmount}
                                            onBankAmountChange={setBankAmount}
                                            onCashAmountChange={setCashAmount}
                                        />
                                    </div>
                                    )}
                                    <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                        <label style={{ display: 'block', marginBottom: '0.8rem', color: 'var(--accent-color)', fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Свързване на Карта (NFC/Link)</label>
                                        <div className="nfc-connect-container" style={{ display: 'flex', gap: '0.75rem' }}>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <input 
                                                    type="text" 
                                                    placeholder="ID от Карта (напр. ABC123)" 
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--surface-border)', color: 'var(--primary-color)', fontWeight: 700, fontFamily: 'monospace' }} 
                                                    value={nfcLinkId} 
                                                    onChange={e => setNfcLinkId(e.target.value.toUpperCase())} 
                                                />
                                                {(() => {
                                                    const mappedCard = CARDS_MAPPING[sanitizeId(nfcLinkId)];
                                                    if (!nfcLinkId) return null;
                                                    return (
                                                        <div style={{ fontSize: '0.75rem', color: mappedCard ? '#00e676' : 'var(--text-secondary)', padding: '2px 4px', fontWeight: mappedCard ? 800 : 500 }}>
                                                            {mappedCard ? (
                                                                <span>Автоматично разпозната Карта № <b>{mappedCard}</b></span>
                                                            ) : (
                                                                <span>Разпознат ID: <b>{sanitizeId(nfcLinkId)}</b></span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={toggleWaitingForScan}
                                                className="nfc-scan-button"
                                                style={{ 
                                                    padding: '0.8rem 1.2rem', 
                                                    borderRadius: '8px', 
                                                    background: isWaitingForScan ? 'var(--error-color)' : 'var(--accent-color)', 
                                                    color: '#ffffff', 
                                                    fontWeight: 700, 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '0.5rem',
                                                    boxShadow: isWaitingForScan ? '0 0 15px rgba(255,23,68,0.3)' : 'none',
                                                    animation: isWaitingForScan ? 'pulse 1.5s infinite' : 'none',
                                                    whiteSpace: 'nowrap',
                                                    flexShrink: 0
                                                }}
                                            >
                                                {isWaitingForScan ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                                {isWaitingForScan ? 'Чакам...' : 'Сканирай'}
                                            </button>
                                        </div>
                                        <p style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            Натиснете "Сканирай" и доближете картата до телефона си. ID-то ще се попълни само.
                                        </p>
                                    </div>
                                    {message && <div style={{ color: message.type === 'success' ? 'var(--success-color)' : 'var(--error-color)' }}>{message.text}</div>}
                                    <button type="submit" disabled={isWaitingForScan} style={{ background: 'var(--primary-color)', color: '#ffffff', padding: '1rem', borderRadius: '8px', fontWeight: 600, display: 'flex', justifyContent: 'center', gap: '0.5rem', opacity: isWaitingForScan ? 0.5 : 1 }}><Save size={20} /> Запази Клиента</button>
                                </form>

                                    {/* Duplicate Warning Overlay */}
                                    {showDuplicateWarning && duplicateCheckClient && (
                                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 10, borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center', animation: 'fadeIn 0.3s ease' }}>
                                            <AlertTriangle size={48} color="#ffab00" style={{ marginBottom: '1rem' }} />
                                            <h3 style={{ color: '#ffab00', marginBottom: '0.5rem' }}>Внимание! Дублирано име</h3>
                                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                                                Вече има регистриран клиент с името <b>{duplicateCheckClient.name}</b>.
                                            </p>
                                            
                                            <div style={{ marginBottom: '1.5rem', border: '1px solid var(--surface-border)', borderRadius: '12px', padding: '1rem', background: 'rgba(255,255,255,0.03)', width: '100%' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>СЪЩЕСТВУВАЩ ПРОФИЛ:</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}>
                                                    <img src={duplicateCheckClient.photo} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary-color)' }} />
                                                    <div style={{ textAlign: 'left' }}>
                                                        <div style={{ fontWeight: 700 }}>{duplicateCheckClient.name}</div>
                                                        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{duplicateCheckClient.route}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '0.8rem', width: '100%' }}>
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        setShowDuplicateWarning(false);
                                                        setDuplicateCheckClient(null);
                                                        setClientName('');
                                                        alert('Моля, не регистрирайте един и същ човек два пъти. Използвайте менюто "Подновяване" за съществуващи карти.');
                                                    }}
                                                    style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                                                >
                                                    Това е същият човек
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        setShowDuplicateWarning(false);
                                                        setDuplicateCheckClient(null);
                                                        alert('Моля, добавете презиме на новия клиент, за да ги различаваме.');
                                                    }}
                                                    style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', background: 'var(--primary-color)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                                                >
                                                    Това е друг човек (добавете презиме)
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'nfc' && isAdmin && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <Card style={{ padding: isMobile ? '1.25rem' : '2rem' }}>
                            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-color)' }}>
                                <ExternalLink size={24} /> Генериране на NFC Линкове
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
                                Използвайте този инструмент, за да генерирате уникални линкове за нови карти. 
                                Изпратете списъка на производителя, за да ги запише в NFC чиповете на картите.
                            </p>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '2rem' }}>
                                <div style={{ flex: 1, minWidth: '150px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Количество карти</label>
                                    <input 
                                        type="number" 
                                        value={nfcQuantity} 
                                        onChange={(e) => setNfcQuantity(parseInt(e.target.value))}
                                        style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none' }}
                                    />
                                </div>
                                <button 
                                    onClick={generateNfcBatch}
                                    style={{ padding: '0.8rem 2rem', borderRadius: '12px', background: 'var(--accent-color)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    Генерирай
                                </button>
                            </div>

                            {generatedLinks.length > 0 && (
                                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h3 style={{ fontSize: '1rem' }}>Генерирани линкове ({generatedLinks.length})</h3>
                                        <button 
                                            onClick={copyLinksToClipboard}
                                            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid var(--surface-border)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                        >
                                            Копирай Списъка
                                        </button>
                                    </div>
                                    <div style={{ 
                                        maxHeight: '400px', 
                                        overflowY: 'auto', 
                                        background: 'rgba(0,0,0,0.3)', 
                                        borderRadius: '12px', 
                                        padding: '1rem',
                                        border: '1px solid var(--surface-border)',
                                        fontFamily: 'monospace',
                                        fontSize: '0.85rem'
                                    }}>
                                        {generatedLinks.map((link, idx) => (
                                            <div key={idx} style={{ padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--primary-color)' }}>
                                                {link}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>
                )}

                {activeTab === 'signals' && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#e53935', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <AlertCircle size={24} /> СИГНАЛИ И ПРЕПОРЪКИ
                        </h2>
                        
                        <Card style={{ padding: '0', overflow: 'hidden' }}>
                            {/* Desktop View */}
                            <div className="table-container desktop-table">
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--surface-border)' }}>
                                            <th style={{ padding: '1.25rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ДАТА</th>
                                            <th style={{ padding: '1.25rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ТИП</th>
                                            <th style={{ padding: '1.25rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>КОНТАКТ</th>
                                            <th style={{ padding: '1.25rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>СЪОБЩЕНИЕ</th>
                                            <th style={{ padding: '1.25rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>СТАТУС</th>
                                            <th style={{ padding: '1.25rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>ДЕЙСТВИЕ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {signals.length > 0 ? (
                                            signals.map((signal) => (
                                                <tr key={signal.id} style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background 0.2s', background: signal.status === 'new' ? 'rgba(229,57,53,0.03)' : 'transparent' }}>
                                                    <td style={{ padding: '1.25rem', fontSize: '0.9rem' }}>
                                                        {new Date(signal.timestamp).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td style={{ padding: '1.25rem' }}>
                                                        <span style={{ 
                                                            padding: '0.25rem 0.75rem', borderRadius: '50px', fontSize: '0.75rem', fontWeight: 800,
                                                            background: signal.type === 'complaint' ? 'rgba(229,57,53,0.1)' : 'rgba(0,145,234,0.1)',
                                                            color: signal.type === 'complaint' ? '#ff5252' : '#0091ea',
                                                            border: `1px solid ${signal.type === 'complaint' ? 'rgba(229,57,53,0.2)' : 'rgba(0,145,234,0.2)'}`
                                                        }}>
                                                            {signal.type === 'complaint' ? 'ОПЛАКВАНЕ' : 'СЪВЕТ'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '1.25rem', fontSize: '0.9rem' }}>
                                                        <div style={{ fontWeight: 600 }}>{signal.name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{signal.phone !== 'N/A' ? signal.phone : signal.email}</div>
                                                    </td>
                                                    <td style={{ padding: '1.25rem', fontSize: '0.9rem', maxWidth: '300px' }}>
                                                        <div style={{ 
                                                            maxHeight: '60px', overflowY: 'auto', lineHeight: 1.4, color: 'var(--text-primary)',
                                                            paddingRight: '0.5rem'
                                                        }}>
                                                            {signal.message}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '1.25rem' }}>
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            {['new', 'read', 'resolved'].map((s) => (
                                                                <button
                                                                    key={s}
                                                                    onClick={() => {
                                                                        const ref = doc(db, 'signals', signal.id);
                                                                        updateDoc(ref, { status: s });
                                                                    }}
                                                                    style={{
                                                                        padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer',
                                                                        background: signal.status === s ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                                                                        color: signal.status === s ? '#fff' : 'var(--text-secondary)',
                                                                        border: 'none', transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    {s.toUpperCase()}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '1.25rem', textAlign: 'center' }}>
                                                        <button
                                                            onClick={async () => {
                                                                if (window.confirm('Изтриване на този сигнал?')) {
                                                                    await deleteDoc(doc(db, 'signals', signal.id));
                                                                }
                                                            }}
                                                            style={{ background: 'rgba(229,57,53,0.1)', color: '#ff5252', border: 'none', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Няма постъпили сигнали.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile View */}
                            <div className="mobile-cards" style={{ padding: '1rem' }}>
                                {signals.length > 0 ? (
                                    signals.map((signal) => (
                                        <div key={signal.id} style={{ 
                                            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', 
                                            borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', 
                                            gap: '1rem', position: 'relative', borderLeft: signal.status === 'new' ? '4px solid #ff5252' : '1px solid var(--surface-border)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                                        {new Date(signal.timestamp).toLocaleString('bg-BG')}
                                                    </div>
                                                    <span style={{ 
                                                        padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800,
                                                        background: signal.type === 'complaint' ? 'rgba(229,57,53,0.1)' : 'rgba(0,145,234,0.1)',
                                                        color: signal.type === 'complaint' ? '#ff5252' : '#0091ea'
                                                    }}>
                                                        {signal.type === 'complaint' ? 'ОПЛАКВАНЕ' : 'СЪВЕТ'}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={async () => {
                                                        if (window.confirm('Изтриване?')) await deleteDoc(doc(db, 'signals', signal.id));
                                                    }}
                                                    style={{ background: 'rgba(229,57,53,0.1)', color: '#ff5252', border: 'none', padding: '0.4rem', borderRadius: '6px' }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>

                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{signal.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                    {signal.phone !== 'N/A' && <span>📞 {signal.phone} </span>}
                                                    {signal.email !== 'N/A' && <span>📧 {signal.email}</span>}
                                                </div>
                                            </div>

                                            <div style={{ 
                                                padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', 
                                                fontSize: '0.9rem', lineHeight: 1.5, color: '#fff' 
                                            }}>
                                                {signal.message}
                                            </div>

                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {['new', 'read', 'resolved'].map((s) => (
                                                    <button
                                                        key={s}
                                                        onClick={() => updateDoc(doc(db, 'signals', signal.id), { status: s })}
                                                        style={{
                                                            flex: 1, padding: '0.5rem', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 800,
                                                            background: signal.status === s ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                                                            color: signal.status === s ? '#fff' : 'var(--text-secondary)',
                                                            border: 'none'
                                                        }}
                                                    >
                                                        {s.toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Няма сигнали.</div>
                                )}
                            </div>
                        </Card>
                    </div>
                )}

                {activeTab === 'rentals' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.4s ease' }}>
                        <Card style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ff5252' }}>
                                    <Bus size={20} /> Запитвания за Наем на Автобус
                                </h3>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    Общо: <b>{rentals.length}</b> запитвания
                                </div>
                            </div>

                            {/* Desktop Table */}
                            <div className="desktop-table" style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                            <th style={{ padding: '1.25rem', textAlign: 'left' }}>Дата/Час</th>
                                            <th style={{ padding: '1.25rem', textAlign: 'left' }}>Клиент</th>
                                            <th style={{ padding: '1.25rem', textAlign: 'left' }}>Детайли (Пътници/Дата)</th>
                                            <th style={{ padding: '1.25rem', textAlign: 'left' }}>Дестинация</th>
                                            <th style={{ padding: '1.25rem', textAlign: 'left' }}>Статус</th>
                                            <th style={{ padding: '1.25rem', textAlign: 'center' }}>Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rentals.length > 0 ? (
                                            rentals.map((rental) => (
                                                <tr key={rental.id} style={{ 
                                                    borderBottom: '1px solid var(--surface-border)',
                                                    background: rental.status === 'new' ? 'rgba(255,82,82,0.03)' : 'transparent',
                                                    transition: 'background 0.2s'
                                                }}>
                                                    <td style={{ padding: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {new Date(rental.timestamp).toLocaleString('bg-BG')}
                                                    </td>
                                                    <td style={{ padding: '1.25rem' }}>
                                                        <div style={{ fontWeight: 700 }}>{rental.name}</div>
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--primary-color)' }}>📞 {rental.phone}</div>
                                                    </td>
                                                    <td style={{ padding: '1.25rem' }}>
                                                        <div style={{ fontSize: '0.9rem' }}>👥 {rental.passengers || 'N/A'} места</div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>📅 {rental.date ? new Date(rental.date).toLocaleDateString('bg-BG') : 'Непосочена'}</div>
                                                    </td>
                                                    <td style={{ padding: '1.25rem', maxWidth: '250px' }}>
                                                        <div style={{ fontSize: '0.9rem', maxHeight: '60px', overflowY: 'auto' }}>{rental.destination}</div>
                                                    </td>
                                                    <td style={{ padding: '1.25rem' }}>
                                                        <select 
                                                            value={rental.status} 
                                                            onChange={(e) => {
                                                                const ref = doc(db, 'rentals', rental.id);
                                                                updateDoc(ref, { status: e.target.value });
                                                            }}
                                                            style={{ 
                                                                padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--surface-border)', 
                                                                background: rental.status === 'new' ? 'rgba(255,82,82,0.1)' : 'rgba(0,0,0,0.2)',
                                                                color: rental.status === 'new' ? '#ff5252' : '#fff',
                                                                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', outline: 'none'
                                                            }}
                                                        >
                                                            <option value="new">НОВО</option>
                                                            <option value="read">ПРОЧЕТЕНО</option>
                                                            <option value="contacted">СВЪРЗАНО СЕ</option>
                                                            <option value="completed">ЗАВЪРШЕНО</option>
                                                        </select>
                                                    </td>
                                                    <td style={{ padding: '1.25rem', textAlign: 'center' }}>
                                                        <button
                                                            onClick={async () => {
                                                                if (window.confirm('Сигурни ли сте, че искате да изтриете това запитване?')) {
                                                                    await deleteDoc(doc(db, 'rentals', rental.id));
                                                                }
                                                            }}
                                                            style={{ background: 'rgba(255,82,82,0.1)', color: '#ff5252', border: 'none', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Все още няма запитвания за наем на автобус.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile View */}
                            <div className="mobile-cards" style={{ padding: '1rem' }}>
                                {rentals.length > 0 ? rentals.map((rental) => (
                                    <div key={rental.id} style={{ 
                                        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', 
                                        borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', 
                                        gap: '1rem', borderLeft: rental.status === 'new' ? '4px solid #ff5252' : '1px solid var(--surface-border)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                                    {new Date(rental.timestamp).toLocaleString('bg-BG')}
                                                </div>
                                                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{rental.name}</div>
                                                <div style={{ fontSize: '0.9rem', color: 'var(--primary-color)', marginTop: '0.25rem' }}>📞 {rental.phone}</div>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm('Изтриване?')) await deleteDoc(doc(db, 'rentals', rental.id));
                                                }}
                                                style={{ background: 'rgba(255,82,82,0.1)', color: '#ff5252', border: 'none', padding: '0.5rem', borderRadius: '8px' }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                                            <div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>ПЪТНИЦИ</div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{rental.passengers || 'N/A'}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>ДАТА</div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{rental.date ? new Date(rental.date).toLocaleDateString('bg-BG') : '---'}</div>
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>ДЕСТИНАЦИЯ И ДЕТАЙЛИ</div>
                                            <div style={{ fontSize: '0.95rem', lineHeight: 1.5, background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '10px' }}>
                                                {rental.destination}
                                            </div>
                                        </div>

                                        <select 
                                            value={rental.status} 
                                            onChange={(e) => updateDoc(doc(db, 'rentals', rental.id), { status: e.target.value })}
                                            style={{ 
                                                padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--surface-border)', 
                                                background: rental.status === 'new' ? 'rgba(255,82,82,0.1)' : 'rgba(255,255,255,0.05)',
                                                color: rental.status === 'new' ? '#ff5252' : '#fff',
                                                fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', outline: 'none', width: '100%'
                                            }}
                                        >
                                            <option value="new">НОВО ЗАПИТВАНЕ</option>
                                            <option value="read">ПРОЧЕТЕНО</option>
                                            <option value="contacted">СВЪРЗАНО СЕ</option>
                                            <option value="completed">ЗАВЪРШЕНО</option>
                                        </select>
                                    </div>
                                )) : <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Няма запитвания.</div>}
                            </div>
                        </Card>
                    </div>
                )}


                {/* Action Modal */}
                {showActionModal && selectedClient && (
                    <div className="modal-overlay" onClick={() => setShowActionModal(false)} style={{ padding: isMobile ? '0.5rem' : '1rem' }}>
                        <div className="modal-content" style={{ maxWidth: '600px', width: '100%', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <img src={selectedClient.photo} style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover' }} />
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{selectedClient.name}</h3>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>ID: {selectedClient.id}</div>
                                    </div>
                                </div>
                                <button onClick={() => setShowActionModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer' }}><XCircle size={20} /></button>
                            </div>

                            {/* Tabs */}
                            <div style={{ display: 'flex', padding: isMobile ? '0.25rem' : '0.5rem', gap: isMobile ? '0.25rem' : '0.5rem', background: 'rgba(0,0,0,0.2)' }}>
                                <button 
                                    onClick={() => setModalTab('info')}
                                    style={{ flex: 1, padding: isMobile ? '0.5rem' : '0.6rem', borderRadius: '8px', border: 'none', color: modalTab === 'info' ? '#fff' : 'var(--text-secondary)', background: modalTab === 'info' ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: 700, fontSize: isMobile ? '0.75rem' : '0.85rem' }}
                                >ИНФО</button>
                                <button 
                                    onClick={() => setModalTab('actions')}
                                    style={{ flex: 1, padding: isMobile ? '0.5rem' : '0.6rem', borderRadius: '8px', border: 'none', color: modalTab === 'actions' ? '#fff' : 'var(--text-secondary)', background: modalTab === 'actions' ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: 700, fontSize: isMobile ? '0.75rem' : '0.85rem' }}
                                >ДЕЙСТВИЯ</button>
                                <button 
                                    onClick={() => setModalTab('history')}
                                    style={{ flex: 1, padding: isMobile ? '0.5rem' : '0.6rem', borderRadius: '8px', border: 'none', color: modalTab === 'history' ? '#fff' : 'var(--text-secondary)', background: modalTab === 'history' ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: 700, fontSize: isMobile ? '0.75rem' : '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                                ><Clock size={isMobile ? 12 : 14} /> ИСТОРИЯ</button>
                            </div>

                            {/* Content */}
                            <div style={{ padding: '1.5rem', minHeight: '300px', maxHeight: '70vh', overflowY: 'auto', position: 'relative' }}>
                                {modalMessage && (
                                    <div style={{ 
                                        position: 'absolute', inset: 0, zIndex: 100, 
                                        background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', 
                                        alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center',
                                        animation: 'fadeIn 0.3s ease'
                                    }}>
                                        <div style={{ 
                                            width: '64px', height: '64px', borderRadius: '50%', 
                                            background: modalMessage.type === 'success' ? 'rgba(0,255,150,0.1)' : 'rgba(255,82,82,0.1)',
                                            color: modalMessage.type === 'success' ? 'var(--success-color)' : 'var(--error-color)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem'
                                        }}>
                                            {modalMessage.type === 'success' ? <ShieldCheck size={40} /> : <XCircle size={40} />}
                                        </div>
                                        <h3 style={{ color: modalMessage.type === 'success' ? 'var(--success-color)' : 'var(--error-color)', marginBottom: '1rem' }}>
                                            {modalMessage.type === 'success' ? 'Операцията е успешна' : 'Грешка'}
                                        </h3>
                                        <p style={{ fontSize: '1rem', lineHeight: '1.5', marginBottom: '2rem' }}>{modalMessage.text}</p>
                                        <button 
                                            onClick={() => setModalMessage(null)}
                                            style={{ padding: '0.8rem 2rem', borderRadius: '50px', background: 'var(--primary-color)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                                        >Разбрах</button>
                                    </div>
                                )}

                                {modalTab === 'info' && (
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '0.75rem' : '1rem', animation: 'fadeIn 0.3s ease' }}>
                                        <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Статус</div>
                                            <div style={{ fontWeight: 700, color: selectedClient.isCanceled || isExpired(selectedClient.expiryDate, selectedClient) ? 'var(--error-color)' : 'var(--success-color)' }}>
                                                {selectedClient.isCanceled ? 'Анулиран' : isExpired(selectedClient.expiryDate, selectedClient) ? 'Неплатен' : 'Платен'}
                                            </div>
                                        </div>
                                        <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Линия</div>
                                            <div style={{ fontWeight: 600 }}>{selectedClient.route}</div>
                                        </div>
                                        <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Дата на регистрация</div>
                                            <div style={{ fontWeight: 600 }}>{new Date(selectedClient.createdAt).toLocaleDateString('bg-BG')}</div>
                                        </div>
                                        <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Общо платено</div>
                                            <div style={{ fontWeight: 700, color: 'var(--success-color)', fontSize: '1.1rem' }}>{selectedClient.amountPaid} €</div>
                                        </div>
                                        <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Clock size={13} /> Последно сканиране</div>
                                            <div style={{ fontWeight: 600 }}>{selectedClient.lastScanAt ? new Date(selectedClient.lastScanAt).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Никога сканирана'}</div>
                                        </div>
                                        {selectedClient.cardType === 'Служебна карта' && (
                                            <div style={{ gridColumn: 'span 2', padding: '1rem', background: 'rgba(77, 208, 225, 0.08)', borderRadius: '10px', border: '1px solid rgba(77, 208, 225, 0.25)', fontSize: '0.85rem' }}>
                                                <b style={{ color: '#4dd0e1' }}>Причина за служебна карта:</b> {selectedClient.serviceReason || 'Няма въведена причина'}
                                            </div>
                                        )}
                                        {selectedClient.isCanceled && (
                                            <div style={{ gridColumn: 'span 2', padding: '1rem', background: 'rgba(255,0,0,0.1)', borderRadius: '10px', border: '1px solid rgba(255,0,0,0.2)', fontSize: '0.85rem' }}>
                                                <b style={{ color: 'var(--error-color)' }}>Причина за анулиране:</b> {selectedClient.cancelReason}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {modalTab === 'actions' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease' }}>
                                        {/* Directions & subscriptions status */}
                                        <div style={{ padding: isMobile ? '1.25rem' : '1.5rem', borderRadius: '12px', background: 'rgba(0,173,181,0.04)', border: '1px solid rgba(0,173,181,0.15)' }}>
                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', margin: '0 0 1rem 0', fontSize: isMobile ? '1rem' : '1.1rem' }}><Bus size={18} /> Направления (за {currentMonthIso})</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {getClientRoutes(selectedClient).map(dir => {
                                                    const paid = isDirectionPaid(selectedClient, dir, currentMonthIso);
                                                    return (
                                                        <div key={dir} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.9rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--surface-border)' }}>
                                                            <span style={{ fontWeight: 700 }}>{dir}</span>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: '50px', background: paid ? 'rgba(0,230,118,0.12)' : 'rgba(255,82,82,0.12)', color: paid ? '#00e676' : '#ff5252' }}>
                                                                {paid ? '✓ Платено' : '✗ Неплатено'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
                                                За да <b>добавиш ново направление</b> или да <b>подновиш</b> — избери маршрута долу в „Подновяване". Ново направление се добавя; съществуващо се подновява.
                                            </div>
                                        </div>

                                        {/* Renew / add direction */}
                                        <div style={{ padding: isMobile ? '1.25rem' : '1.5rem', borderRadius: '12px', background: 'rgba(0,255,150,0.03)', border: '1px solid rgba(0,255,150,0.1)' }}>
                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-color)', margin: '0 0 1rem 0', fontSize: isMobile ? '1rem' : '1.1rem' }}><RefreshCw size={18} /> Подновяване / добави направление</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '0.75rem' : '1rem', marginBottom: '1rem' }}>
                                                {selectedClient.cardType === 'Служебна карта' ? (
                                                    <div style={{ gridColumn: 'span 2' }}>
                                                        <label style={{ display: 'block', fontSize: '0.7rem', color: '#4dd0e1', marginBottom: '0.3rem', fontWeight: 700 }}>Абонамент за цялата година</label>
                                                        <select
                                                            style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(77, 208, 225, 0.3)', borderRadius: '6px', color: '#fff', colorScheme: 'dark' }}
                                                            value={newServiceYear}
                                                            onChange={e => setNewServiceYear(Number(e.target.value))}
                                                        >
                                                            {getServiceYearOptions().map(y => <option key={y} value={y} style={{ background: '#222' }}>{y} г. (Януари – Декември)</option>)}
                                                        </select>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                                                            Служебната карта е безплатна – ще стане валидна за всичките 12 месеца на избраната година.
                                                        </div>
                                                    </div>
                                                ) : (
                                                <>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Месец</label>
                                                    <input type="month" style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '6px', color: '#fff', colorScheme: 'dark' }} value={newMonth} onChange={e => setNewMonth(e.target.value)} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Сума (€)</label>
                                                    <input type="number" placeholder="0.00" style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '6px', color: '#fff' }} value={newAmount} onChange={e => setNewAmount(e.target.value)} />
                                                </div>
                                                </>
                                                )}
                                                <div style={{ gridColumn: 'span 2' }}>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Курс (Маршрут)</label>
                                                    <select
                                                        style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '6px', color: '#fff', colorScheme: 'dark' }}
                                                        value={newRoute}
                                                        onChange={e => setNewRoute(e.target.value)}
                                                    >
                                                        {ROUTES.map(r => <option key={r} value={r} style={{ background: '#222' }}>{r}</option>)}
                                                    </select>
                                                </div>
                                                {selectedClient.cardType !== 'Служебна карта' && (
                                                <div style={{ gridColumn: 'span 2' }}>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Начин на плащане</label>
                                                    <PaymentMethodSelector
                                                        value={newPaymentMethod}
                                                        onChange={(m) => { setNewPaymentMethod(m); if (m === MIXED_METHOD && !newBankAmount && !newCashAmount) { setNewBankAmount(newAmount || ''); setNewCashAmount('0'); } }}
                                                        bankAmount={newBankAmount}
                                                        cashAmount={newCashAmount}
                                                        onBankAmountChange={setNewBankAmount}
                                                        onCashAmountChange={setNewCashAmount}
                                                        activeColor="var(--success-color)"
                                                    />
                                                </div>
                                                )}
                                            </div>
                                            <button onClick={renewClient} style={{ width: '100%', background: 'var(--success-color)', color: '#ffffff', padding: '0.75rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', border: 'none' }}>Поднови Абонамент</button>
                                        </div>

                                        {/* Cancel */}
                                        <div style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(255,0,0,0.03)', border: '1px solid rgba(255,0,0,0.1)' }}>
                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--error-color)', margin: '0 0 1rem 0' }}><Trash2 size={18} /> Анулиране</h4>
                                            <textarea
                                                placeholder="Причина за анулиране..."
                                                style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '6px', marginBottom: '1rem', minHeight: '80px', color: '#fff', fontSize: '0.85rem' }}
                                                value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                                            />
                                            <button onClick={cancelClient} style={{ width: '100%', background: 'var(--error-color)', color: '#fff', padding: '0.75rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', border: 'none' }}>Анулирай Картата</button>
                                        </div>
                                    </div>
                                )}

                                {modalTab === 'history' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease' }}>
                                        
                                        {/* Renewal History with Delete option for Admins (Moved from Actions Tab) */}
                                        {selectedClient.renewalHistory && selectedClient.renewalHistory.length > 0 && (
                                            <div style={{ padding: '1.25rem', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid var(--surface-border)' }}>
                                                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700, color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                    <DollarSign size={18} /> История на Плащанията
                                                </h4>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                                                    {[...selectedClient.renewalHistory].sort((a, b) => b.month.localeCompare(a.month)).map((rh, idx) => (
                                                        <div key={idx} style={{ 
                                                            position: 'relative',
                                                            display: 'flex', 
                                                            flexDirection: 'column',
                                                            padding: '0.75rem', 
                                                            background: 'rgba(0,0,0,0.2)', 
                                                            borderRadius: '12px', 
                                                            border: '1px solid var(--surface-border)',
                                                            transition: 'all 0.2s ease'
                                                        }}>
                                                            <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{rh.month}</div>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--success-color)', fontWeight: 700 }}>{rh.amount} €</div>
                                                            
                                                            {isAdmin && (
                                                                <button 
                                                                    onClick={() => {
                                                                        const originalIndex = selectedClient.renewalHistory!.findIndex(entry => entry === rh);
                                                                        deleteRenewal(selectedClient, originalIndex);
                                                                    }}
                                                                    style={{ 
                                                                        position: 'absolute',
                                                                        top: '0.5rem',
                                                                        right: '0.5rem',
                                                                        background: 'rgba(255,82,82,0.1)', 
                                                                        border: 'none', 
                                                                        color: '#ff5252', 
                                                                        padding: '4px', 
                                                                        borderRadius: '6px', 
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center'
                                                                    }}
                                                                    title="Изтрий плащането"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                                            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <Clock size={18} /> Пълна История на Активността
                                            </h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {selectedClient.history && selectedClient.history.length > 0 ? (
                                                    selectedClient.history.slice().reverse().map((log, idx) => (
                                                        <div key={idx} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '10px', display: 'flex', gap: '1rem' }}>
                                                            <div style={{ width: '3px', background: log.action === 'Създаване' ? 'var(--primary-color)' : log.action === 'Подновяване' ? 'var(--success-color)' : 'var(--error-color)', borderRadius: '3px' }} />
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                                                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{log.action}</span>
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(log.date).toLocaleString('bg-BG')}</span>
                                                                </div>
                                                                {log.details && <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.4rem' }}>{log.details}</div>}
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    {log.amount && <div style={{ fontWeight: 800, color: 'var(--success-color)', fontSize: '0.9rem' }}>{log.amount} €</div>}
                                                                    {log.performedBy && (
                                                                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                                                                            От: {log.performedBy.split('@')[0]}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Няма история на дейностите.</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
};

export default AdminPanel;
