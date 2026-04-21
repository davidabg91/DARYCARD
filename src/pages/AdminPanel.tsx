import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
    Users, PlusCircle, ExternalLink, 
    Trash2, XCircle, Clock, DollarSign, Camera, 
    RefreshCw, List, Save, 
    ShieldCheck, Shield, TrendingUp,
    PiggyBank, AlertTriangle, Share2,
    AlertCircle, Bus, Send, Bell
} from 'lucide-react';
import Card from '../components/Card';
import { db } from '../firebase';
import { 
    addDoc,
    doc, 
    setDoc, 
    collection, 
    onSnapshot,
    updateDoc,
    deleteDoc,
    query
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useConnectivity } from '../context/ConnectivityContext';
import { ROUTE_METADATA } from '../data/routeMetadata';

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
    route: string;
    amountPaid: number;
    expiryDate: string; // "YYYY-MM"
    photo: string;
    createdAt: string;
    isCanceled?: boolean;
    cancelReason?: string;
    renewalHistory?: { date: string, amount: number, month: string }[];
    history?: ClientLog[];
    scanCount?: number;
    lastScanAt?: string;
    scanHistory?: string[];
    cardType?: string;
    address?: string;
    school?: string;
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
    "Горни Дъбник", "Ясен-Дисевица",
    "Долни Дъбник - Садовец", "Долна Митрополия - Тръстеник", "Долна Митрополия - Славовица"
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

const generateClientId = () => Math.random().toString(36).substr(2, 9).toUpperCase();

const sanitizeId = (id: string | null | undefined): string => {
    if (!id) return '';
    let trimmed = id.trim();
    
    // Remove query parameters
    trimmed = trimmed.split('?')[0];
    
    // Split by both / and # to get all path segments
    const parts = trimmed.split(/[/#]/);
    
    // Filter out empty parts and known URL segments that aren't IDs
    const cleanParts = parts.filter(p => 
        p.length > 0 && 
        !['http:', 'https:', 'davidabg91.github.io', 'darycard', 'client'].includes(p.toLowerCase())
    );
    
    if (cleanParts.length === 0) return trimmed.toUpperCase();
    
    // The last part is our ID
    const lastPart = cleanParts[cleanParts.length - 1];
    return lastPart.toUpperCase();
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
    const [signals, setSignals] = useState<Signal[]>([]);
    const [rentals, setRentals] = useState<Rental[]>([]);
    const [notifications, setNotifications] = useState<PushNotification[]>([]);
    const [subscribers, setSubscribers] = useState<{ courseId: string; token: string }[]>([]);
    const [sendingNotification, setSendingNotification] = useState(false);
    const [notifTitle, setNotifTitle] = useState('');
    const [notifBody, setNotifBody] = useState('');
    const [selectedNotifRoutes, setSelectedNotifRoutes] = useState<string[]>(['all']);
    const [searchTerm, setSearchTerm] = useState('');
    const { isOnline } = useConnectivity();
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);


    // Registration Form State
    const [clientName, setClientName] = useState('');
    const [cardType, setCardType] = useState('Нормална карта');
    const [selectedRoute, setSelectedRoute] = useState('');
    const [amountPaid, setAmountPaid] = useState('');
    const [expiryDate, setExpiryDate] = useState(getDefaultExpiryMonth());
    const [photoDataURL, setPhotoDataURL] = useState<string | null>(null);
    const [nfcLinkId, setNfcLinkId] = useState('');
    const [address, setAddress] = useState('');
    const [selectedSchool, setSelectedSchool] = useState('');
    const [customSchool, setCustomSchool] = useState('');
    const [isWaitingForScan, setIsWaitingForScan] = useState(false);

    // Modal/Action State
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [newMonth, setNewMonth] = useState('');
    const [newAmount, setNewAmount] = useState('');
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

    const [filterRoute, setFilterRoute] = useState<string>('all');
    const [reportMonth, setReportMonth] = useState<string>('all');
    const [reportCardType, setReportCardType] = useState<string>('all');
    const [reportRoute, setReportRoute] = useState<string>('all');
    const [reportDistanceFilter, setReportDistanceFilter] = useState<string>('all');

    const [photoError, setPhotoError] = useState<string | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);



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

        return () => {
            unsubscribe();
            unsubscribeSignals();
            unsubscribeRentals();
            unsubscribeNotifications();
            unsubscribeSub();
            actionUnsubscribe();
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
        const newClient: Client = {
            id: generatedId,
            name: clientName,
            route: selectedRoute,
            cardType: cardType,
            amountPaid: Number(amountPaid),
            expiryDate: expiryDate,
            photo: photoDataURL || '',
            address: cardType === 'Пенсионерска карта' ? address : '',
            school: cardType === 'Ученическа карта' ? (selectedSchool === 'custom' ? customSchool : selectedSchool) : '',
            createdAt: new Date().toISOString(),
            renewalHistory: [{ date: new Date().toISOString(), amount: Number(amountPaid), month: expiryDate }],
            history: [{
                date: new Date().toISOString(),
                action: 'Създаване',
                details: `Първоначално плащане: ${amountPaid} € за месец ${expiryDate}`,
                amount: Number(amountPaid),
                performedBy: currentUser?.username || 'Админ'
            }]
        };

        await saveClient(newClient);
        await logGlobalActivity('Създаване', newClient.name, `Нова карта: ${newClient.id}. Сума: ${amountPaid} €. Регион: ${selectedRoute}`, Number(amountPaid));
    };

    const saveClient = async (client: Client, isNew: boolean = true) => {
        try {
            await setDoc(doc(db, 'clients', client.id), client);
            
            if (isNew) {
                setRegistrationSuccess(client);
                setClientName(''); setCardType('Нормална карта'); setAddress(''); setSelectedSchool(''); setCustomSchool(''); setAmountPaid(''); setExpiryDate(getDefaultExpiryMonth()); setPhotoDataURL(null); setNfcLinkId('');
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
        
        if (!newMonth || !newAmount || Number(newAmount) <= 0 || !newRoute) {
            alert('Моля, въведете валиден месец, сума и курс.');
            return;
        }

        const history = selectedClient.history || [];
        const renewalHistory = selectedClient.renewalHistory || [];
        const routeChanged = newRoute !== selectedClient.route;
        
        const updatedClient: Client = {
            ...selectedClient,
            route: newRoute,
            expiryDate: newMonth,
            amountPaid: selectedClient.amountPaid + Number(newAmount),
            isCanceled: false,
            renewalHistory: [...renewalHistory, { 
                date: new Date().toISOString(), 
                amount: Number(newAmount), 
                month: newMonth 
            }],
            history: [...history, {
                date: new Date().toISOString(),
                action: 'Подновяване',
                details: `Нов месец: ${newMonth}${routeChanged ? ` | Променен курс: ${selectedClient.route} -> ${newRoute}` : ''}`,
                amount: Number(newAmount),
                performedBy: currentUser?.username || 'Админ'
            }]
        };

        await saveClient(updatedClient, false);
        await logGlobalActivity('Подновяване', selectedClient.name, `Месец: ${newMonth}. Сума: ${newAmount} €. ${routeChanged ? `Курс: ${newRoute}` : ''}`, Number(newAmount));
        setModalMessage({ 
            text: `Успешно подновен абонамент за ${newMonth}. Сума: ${newAmount} €. ${routeChanged ? `Курсът е сменен на ${newRoute}.` : ''}`, 
            type: 'success' 
        });
        setNewMonth('');
        setNewAmount('');
    };

    const deleteRenewal = async (client: Client, index: number) => {
        if (!isAdmin || !client.renewalHistory) return;
        
        if (!window.confirm('Сигурни ли сте, че искате да изтриете това плащане? Това ще промени общата сума и валидността на картата.')) return;

        const entryToDelete = client.renewalHistory[index];
        const newRenewalHistory = client.renewalHistory.filter((_, i) => i !== index);
        
        // Recalculate expiry date - find the latest month in the remaining history
        let newExpiryDate = client.expiryDate;
        if (newRenewalHistory.length > 0) {
            const sortedByMonth = [...newRenewalHistory].sort((a, b) => b.month.localeCompare(a.month));
            newExpiryDate = sortedByMonth[0].month;
        }

        const updatedClient: Client = {
            ...client,
            renewalHistory: newRenewalHistory,
            amountPaid: client.amountPaid - entryToDelete.amount,
            expiryDate: newExpiryDate,
            history: [...(client.history || []), {
                date: new Date().toISOString(),
                action: 'Изтрито плащане',
                details: `Изтрито плащане за месец ${entryToDelete.month} (${entryToDelete.amount} €)`,
                performedBy: currentUser?.username || 'Админ'
            }]
        };

        await saveClient(updatedClient, false);
        await logGlobalActivity('Изтриване на плащане', client.name, `Месец: ${entryToDelete.month} (${entryToDelete.amount} €).`, -entryToDelete.amount);
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
        
        const history = selectedClient.history || [];
        const updatedClient: Client = {
            ...selectedClient,
            isCanceled: true,
            cancelReason,
            history: [...history, {
                date: new Date().toISOString(),
                action: 'Анулиране',
                details: cancelReason,
                performedBy: currentUser?.username || 'Админ'
            }]
        };

        await saveClient(updatedClient, false);
        await logGlobalActivity('Анулиране', selectedClient.name, `Анулирана карта. Причина: ${cancelReason}`);
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
                await logGlobalActivity('Изтриване на клиент', name, `Клиентът "${name}" (ID: ${id}) беше изтрит постоянно.`);
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
        const matchesSearch = !searchTerm || 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.route.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesRoute = filterRoute === 'all' || c.route === filterRoute;
        
        return matchesSearch && matchesRoute;
    }).sort((a, b) => {
        const statusA = getClientStatusForMonth(a, filterMonth);
        const statusB = getClientStatusForMonth(b, filterMonth);
        
        const weights: Record<string, number> = { 'Неплатен': 0, 'Платен': 1, 'Анулиран': 2 };
        return weights[statusA] - weights[statusB];
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
    }, 0);

    const currentMonthIso = todayIso.substring(0, 7);
    const revenueMonthCurrent = clients.reduce((acc, c) => {
        const monthPayments = (c.renewalHistory || []).filter(r => r.month === currentMonthIso);
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
        @media print {
            body * { visibility: hidden; }
            #printable-report, #printable-report * { visibility: visible !important; color: #000 !important; }
            #printable-report { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; background: white; }
            #printable-report .no-print { display: none !important; }
            #printable-report table, #printable-report th, #printable-report td { border: 1px solid #ddd !important; border-collapse: collapse; padding: 8px; }
            #printable-report th { background: #f5f5f5 !important; }
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
                            <div style={{ fontSize: isMobile ? '1.75rem' : '2.5rem', fontWeight: 900, color: '#fff' }}>{revenueMonthCurrent.toFixed(2)} €</div>
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

                    {/* --- DETAILS REPORT EXPORT SECTION --- */}
                    <div style={{ marginTop: '1rem' }} id="printable-report">
                        {(() => {
                            const filteredReportClients = clients.filter(c => {
                                let match = true;
                                if (reportCardType !== 'all') {
                                    const cType = c.cardType || 'Нормална карта';
                                    if (cType !== reportCardType) match = false;
                                }
                                if (reportRoute !== 'all' && c.route !== reportRoute) match = false;
                                if (reportMonth !== 'all' && getMonthPayment(c, reportMonth) <= 0) match = false;
                                
                                // Distance Filter Logic
                                const isShortDistance = ["Ясен", "Опанец", "Ясен-Дисевица"].includes(c.route);
                                if (reportDistanceFilter === 'under10' && !isShortDistance) match = false;
                                if (reportDistanceFilter === 'over10' && isShortDistance) match = false;

                                return match;
                            });
                            
                            const totalReportRevenue = filteredReportClients.reduce((sum, c) => sum + (reportMonth === 'all' ? (c.amountPaid || 0) : getMonthPayment(c, reportMonth)), 0);
                            
                            const handleShareReport = async () => {
                                const header = `Финансов Отчет DARY COMMERCE\nМесец: ${reportMonth === 'all' ? 'Всички' : reportMonth} | Вид: ${reportCardType === 'all' ? 'Всички' : reportCardType} | Маршрут: ${reportRoute === 'all' ? 'Всички' : reportRoute} | Дистанция: ${reportDistanceFilter === 'all' ? 'Всички' : (reportDistanceFilter === 'under10' ? 'До 10 км' : 'Над 10 км')}\n---\n`;
                                const rows = filteredReportClients.map(c => {
                                    const isShort = ["Ясен", "Опанец", "Ясен-Дисевица"].includes(c.route);
                                    const distStr = isShort ? "До 10 км" : "Над 10 км";
                                    const distancePart = reportDistanceFilter === 'all' ? '' : ` (${distStr})`;
                                    const addressPart = (reportCardType === 'Пенсионерска карта' && c.address) ? ` - Адрес: ${c.address}` : '';
                                    const schoolPart = (reportCardType === 'Ученическа карта' && c.school) ? ` (${c.school})` : '';
                                    return `${c.name}${schoolPart}${addressPart} - ${c.cardType || 'Нормална карта'} - ${c.route}${distancePart} - ${reportMonth === 'all' ? (c.amountPaid || 0) : getMonthPayment(c, reportMonth)} €`;
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

                            return (
                                <Card>
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
                                                onClick={() => window.print()} 
                                                style={{ padding: '0.6rem 1.2rem', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                            >
                                                🖨️ Принтирай Отчета
                                            </button>
                                        </div>
                                    </div>

                                    <div className="no-print" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '150px' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Месец</label>
                                            <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '8px', outline: 'none' }}>
                                                <option value="all">Всички Месеци</option>
                                                {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '150px' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Вид Карта</label>
                                            <select value={reportCardType} onChange={e => setReportCardType(e.target.value)} style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '8px', outline: 'none' }}>
                                                <option value="all">Всички Видове</option>
                                                <option value="Нормална карта">Нормална карта</option>
                                                <option value="Ученическа карта">Ученическа карта</option>
                                                <option value="Пенсионерска карта">Пенсионерска карта</option>
                                                <option value="Инвалидна карта">Инвалидна карта</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '150px' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Разстояние</label>
                                            <select value={reportDistanceFilter} onChange={e => setReportDistanceFilter(e.target.value)} style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '8px', outline: 'none' }}>
                                                <option value="all">Всички</option>
                                                <option value="under10">До 10 км</option>
                                                <option value="over10">Над 10 км</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '150px' }}>
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Маршрут</label>
                                            <select value={reportRoute} onChange={e => setReportRoute(e.target.value)} style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '8px', outline: 'none' }}>
                                                <option value="all">Всички Маршрути</option>
                                                {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <>
                                        <div style={{ display: 'none' }} className="print-only-header">
                                            <h2 style={{ marginBottom: '1rem', color: 'black' }}>Финансов Отчет DARY COMMERCE</h2>
                                            <p style={{ marginBottom: '1.5rem', fontSize: '14px', color: '#555' }}>
                                                <strong>Месец:</strong> {reportMonth === 'all' ? 'Всички' : reportMonth} | 
                                                <strong>Вид Карта:</strong> {reportCardType === 'all' ? 'Всички' : reportCardType} | 
                                                <strong> Маршрут:</strong> {reportRoute === 'all' ? 'Всички' : reportRoute}
                                                {reportDistanceFilter !== 'all' && (
                                                    <> | <strong>Разстояние:</strong> {reportDistanceFilter === 'under10' ? 'До 10 км' : 'Над 10 км'}</>
                                                )}
                                            </p>
                                        </div>
                                        {!isMobile ? (
                                            <div style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                                                    <thead>
                                                        <tr>
                                                            <th>Име на Клиент</th>
                                                            <th>Вид Карта</th>
                                                            <th>Курс</th>
                                                            {reportDistanceFilter !== 'all' && <th>Разстояние</th>}
                                                            {reportCardType === 'Пенсионерска карта' && <th>Адрес</th>}
                                                            {reportCardType === 'Ученическа карта' && <th>Училище</th>}
                                                            <th>Платена Сума</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {filteredReportClients.length > 0 ? filteredReportClients.map(c => (
                                                            <tr key={c.id}>
                                                                <td style={{ fontWeight: 600 }}>{c.name}</td>
                                                                <td><span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>{c.cardType || 'Нормална карта'}</span></td>
                                                                <td style={{ fontSize: '0.9rem' }}>{c.route}</td>
                                                                {reportDistanceFilter !== 'all' && (
                                                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                                        {["Ясен", "Опанец", "Ясен-Дисевица"].includes(c.route) ? "До 10 км" : "Над 10 км"}
                                                                    </td>
                                                                )}
                                                                {reportCardType === 'Пенсионерска карта' && <td style={{ fontSize: '0.8rem' }}>{c.address || '---'}</td>}
                                                                {reportCardType === 'Ученическа карта' && <td style={{ fontSize: '0.8rem' }}>{c.school || '---'}</td>}
                                                                <td style={{ fontWeight: 700, color: 'var(--success-color)' }}>{reportMonth === 'all' ? (c.amountPaid || 0) : getMonthPayment(c, reportMonth)} €</td>
                                                            </tr>
                                                        )) : (
                                                            <tr>
                                                                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Няма данни за избраните филтри</td>
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
                                                                {reportMonth === 'all' ? (c.amountPaid || 0) : getMonthPayment(c, reportMonth)} €
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
                                                            {reportCardType === 'Пенсионерска карта' && (
                                                                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'rgba(255,171,0,0.8)', fontStyle: 'italic' }}>
                                                                    <b>Адрес:</b> {c.address || 'Няма въведен адрес'}
                                                                </div>
                                                            )}
                                                            {reportCardType === 'Ученическа карта' && (
                                                                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--primary-color)', fontStyle: 'italic' }}>
                                                                    <b>Училище:</b> {c.school || 'Няма въведено училище'}
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
                                    </>
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
                                type="text" placeholder="Търсене по име, ID или курс..."
                                style={{ width: '100%', padding: '0.8rem 1.5rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)', outline: 'none', fontSize: '0.9rem' }}
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <select 
                                value={filterMonth}
                                onChange={(e) => setFilterMonth(e.target.value)}
                                style={{ flex: 1, padding: '0.8rem 1rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                {allMonths.map(m => (
                                    <option key={m} value={m} style={{ background: '#222' }}>{m}</option>
                                ))}
                            </select>

                            <select 
                                value={filterRoute}
                                onChange={(e) => setFilterRoute(e.target.value)}
                                style={{ flex: 1, padding: '0.8rem 1rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
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
                                        <th>Клиент</th>
                                        <th>Курс</th>
                                        <th>Платено (€)</th>
                                        <th>Статус за {filterMonth}</th>
                                        <th>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClientsByFilters.length > 0 ? (
                                        filteredClientsByFilters.map(client => {
                                            const status = getClientStatusForMonth(client, filterMonth);
                                            return (
                                                <tr key={client.id}>
                                                    <td style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                        <img src={client.photo} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{client.name}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{client.id}</div>
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
                                                            onClick={() => { setSelectedClient(client); setNewRoute(client.route); setShowActionModal(true); }}
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
                                            <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
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
                            filteredClientsByFilters.map(client => {
                                const status = getClientStatusForMonth(client, filterMonth);
                                const isMonthPaid = getMonthPayment(client, filterMonth) > 0;
                                return (
                                    <div key={client.id} className="client-card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                <img src={client.photo} style={{ width: '50px', height: '50px', borderRadius: '12px', objectFit: 'cover' }} />
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{client.name}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>ID: {client.id}</div>
                                                </div>
                                            </div>
                                            <span style={{ 
                                                fontSize: '0.7rem', fontWeight: 700, color: getRouteColor(client.route),
                                                padding: '0.2rem 0.6rem', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${getRouteColor(client.route)}`
                                            }}>
                                                {client.route}
                                            </span>
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
                                                onClick={() => { setSelectedClient(client); setNewRoute(client.route); setShowActionModal(true); }}
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

                                {!photoDataURL && (
                                    <div style={{ width: '100%', aspectRatio: '1', background: 'rgba(0,0,0,0.3)', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', border: '2px dashed var(--surface-border)' }}>
                                        <PlusCircle size={40} color="var(--primary-color)" style={{ marginBottom: '1rem', opacity: 0.6 }} />
                                        <button type="button" onClick={() => fileInputRef.current?.click()} style={{ background: 'var(--primary-color)', color: '#fff', padding: '0.8rem 1.5rem', borderRadius: '50px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Camera size={18} /> Направи Снимка
                                        </button>
                                        <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>или изберете файл от галерията</p>
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
                                        <select style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', color: 'white' }} value={cardType} onChange={e => setCardType(e.target.value)} required>
                                            <option value="Нормална карта">Нормална карта</option>
                                            <option value="Ученическа карта">Ученическа карта</option>
                                            <option value="Пенсионерска карта">Пенсионерска карта</option>
                                            <option value="Инвалидна карта">Инвалидна карта</option>
                                        </select>
                                    </div>
                                    {cardType === 'Пенсионерска карта' && (
                                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#ffab00', fontWeight: 700 }}>Адрес (Задължително за пенсионери)</label>
                                            <input 
                                                type="text" 
                                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(255, 171, 0, 0.05)', border: '1px solid rgba(255, 171, 0, 0.3)', color: '#ffab00' }} 
                                                value={address} 
                                                onChange={e => setAddress(e.target.value)} 
                                                placeholder="напр. ул. Иван Вазов 10, Плевен"
                                                required={cardType === 'Пенсионерска карта'} 
                                            />
                                        </div>
                                    )}
                                    {cardType === 'Ученическа карта' && (
                                        <div style={{ animation: 'fadeIn 0.3s ease', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--primary-color)', fontWeight: 700 }}>Училище</label>
                                                <select 
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-color)', border: '1px solid var(--primary-color)', color: 'white' }} 
                                                    value={selectedSchool} 
                                                    onChange={e => setSelectedSchool(e.target.value)}
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
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Курс (Маршрут)</label>
                                        <select style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', color: 'white' }} value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)} required>
                                            <option value="" disabled>-- Изберете Маршрут --</option>
                                            {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Сума (€)</label>
                                            <input type="number" step="0.01" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)' }} value={amountPaid} onChange={e => setAmountPaid(e.target.value)} required />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Месец</label>
                                            <input type="month" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', colorScheme: 'dark' }} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} required />
                                        </div>
                                    </div>
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
                                                {nfcLinkId && nfcLinkId.includes('/') && (
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--success-color)', padding: '2px 4px' }}>
                                                        Разпознат ID: <b>{sanitizeId(nfcLinkId)}</b>
                                                    </div>
                                                )}
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
                                        {selectedClient.isCanceled && (
                                            <div style={{ gridColumn: 'span 2', padding: '1rem', background: 'rgba(255,0,0,0.1)', borderRadius: '10px', border: '1px solid rgba(255,0,0,0.2)', fontSize: '0.85rem' }}>
                                                <b style={{ color: 'var(--error-color)' }}>Причина за анулиране:</b> {selectedClient.cancelReason}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {modalTab === 'actions' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease' }}>
                                        {/* Renew */}
                                        <div style={{ padding: isMobile ? '1.25rem' : '1.5rem', borderRadius: '12px', background: 'rgba(0,255,150,0.03)', border: '1px solid rgba(0,255,150,0.1)' }}>
                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-color)', margin: '0 0 1rem 0', fontSize: isMobile ? '1rem' : '1.1rem' }}><RefreshCw size={18} /> Подновяване</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '0.75rem' : '1rem', marginBottom: '1rem' }}>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Месец</label>
                                                    <input type="month" style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '6px', color: '#fff', colorScheme: 'dark' }} value={newMonth} onChange={e => setNewMonth(e.target.value)} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Сума (€)</label>
                                                    <input type="number" placeholder="0.00" style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '6px', color: '#fff' }} value={newAmount} onChange={e => setNewAmount(e.target.value)} />
                                                </div>
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


            <div style={{ position: 'fixed', bottom: '10px', right: '15px', fontSize: '10px', opacity: 0.3, zIndex: 100, pointerEvents: 'none' }}>v5.0-SYNC</div>
        </div>
    );
};

export default AdminPanel;
