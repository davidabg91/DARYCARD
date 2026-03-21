import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
    Users, PlusCircle, BarChart, ExternalLink, 
    Trash2, XCircle, Clock, DollarSign, Camera, 
    RefreshCw, List, Zap, Save, Eye, EyeOff, 
    ShieldCheck, Shield, TrendingUp, Percent, 
    PiggyBank, AlertTriangle, UserCheck, Filter, ChevronUp
} from 'lucide-react';
import Card from '../components/Card';
import { db } from '../firebase';
import { collection, onSnapshot, query, setDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

interface ClientLog {
    date: string;
    action: string;
    details?: string;
    amount?: number;
    performedBy?: string;
}

interface Client {
    id: string;
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
}

const ROUTES = [
    "Бъркач", "Тръстеник", "Биволаре", "Горна Митрополия", "Долни Дъбник",
    "Рибен", "Садовец", "Славовица", "Байкал", "Гиген",
    "Долна Митрополия", "Ясен", "Крушовица", "Дисевица", "Градина",
    "Петърница", "Опанец", "Победа", "Подем", "Божурица"
];

const generateClientId = () => Math.random().toString(36).substr(2, 9).toUpperCase();

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
    id: 'dashboard' | 'clients' | 'register' | 'nfc';
    icon: React.ElementType;
    label: string;
    activeTab: 'dashboard' | 'clients' | 'register' | 'nfc';
    setActiveTab: (id: 'dashboard' | 'clients' | 'register' | 'nfc') => void;
    activeColor?: string;
}

const TabButton = ({ id, icon: Icon, label, activeTab, setActiveTab, activeColor = 'var(--primary-color)' }: TabButtonProps) => (
    <button
        onClick={() => setActiveTab(id)}
        style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', borderRadius: '50px',
            fontWeight: 700, 
            background: activeTab === id ? activeColor : (id === 'register' ? 'rgba(0, 200, 83, 0.1)' : 'transparent'),
            color: activeTab === id ? '#fff' : (id === 'register' ? '#00c853' : 'var(--text-secondary)'),
            border: `2px solid ${activeTab === id ? activeColor : (id === 'register' ? '#00c853' : 'var(--surface-border)')}`,
            boxShadow: id === 'register' ? '0 0 15px rgba(0, 200, 83, 0.2)' : 'none',
            transition: 'all 0.3s ease',
            fontSize: 'var(--tab-font-size, 0.9rem)'
        }}
    >
        <Icon size={18} /> <span className="tab-label">{label}</span>
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
    const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'register' | 'nfc'>(
        isAdmin ? 'dashboard' : 'clients'
    );
    const [clients, setClients] = useState<Client[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Registration Form State
    const [clientName, setClientName] = useState('');
    const [selectedRoute, setSelectedRoute] = useState('');
    const [amountPaid, setAmountPaid] = useState('');
    const [expiryDate, setExpiryDate] = useState(getDefaultExpiryMonth());
    const [photoDataURL, setPhotoDataURL] = useState<string | null>(null);
    const [nfcLinkId, setNfcLinkId] = useState('');
    const [isWaitingForScan, setIsWaitingForScan] = useState(false);

    // Modal/Action State
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [newMonth, setNewMonth] = useState('');
    const [newAmount, setNewAmount] = useState('');

    const [showTotalRevenue, setShowTotalRevenue] = useState(false);
    const [modalTab, setModalTab] = useState<'info' | 'actions' | 'history'>('info');
    
    // NFC Tools State
    const [nfcQuantity, setNfcQuantity] = useState<number>(100);
    const [generatedLinks, setGeneratedLinks] = useState<string[]>([]);
    
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsMonth, setStatsMonth] = useState<string>(() => {
        const now = new Date();
        return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    });

    const [filterMonth, setFilterMonth] = useState<string>(() => {
        const now = new Date();
        return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    });

    const handleResetAllScans = async () => {
        if (!isAdmin || !window.confirm('Сигурни ли сте, че искате да нулирате статистиката за сканиранията за ВСИЧКИ клиенти?')) return;
        
        try {
            setStatsLoading(true);
            const batchPromises = clients.map(async (c) => {
                const ref = doc(db, 'clients', c.id);
                return updateDoc(ref, {
                    scanCount: 0,
                    scanHistory: []
                });
            });
            await Promise.all(batchPromises);
            alert('Статистиката е нулирана успешно.');
        } catch (err) {
            console.error(err);
            alert('Грешка при нулиране.');
        } finally {
            setStatsLoading(false);
        }
    };
    const [filterRoute, setFilterRoute] = useState<string>('all');

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

    const [isSyncing, setIsSyncing] = useState(true);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [registrationSuccess, setRegistrationSuccess] = useState<Client | null>(null);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);



    useEffect(() => {
        // 1. Listen for Clients in Real-time
        const q = query(collection(db, 'clients'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const clientList: Client[] = [];
            snapshot.forEach((doc) => {
                clientList.push({ id: doc.id, ...doc.data() } as Client);
            });
            setClients(clientList);
            setIsSyncing(false);
            setSyncError(null);

            // Check for edit param in URL after clients are loaded
            const params = new URLSearchParams(location.search);
            const editId = params.get('edit');
            if (editId) {
                const clientToEdit = clientList.find((c: Client) => c.id === editId);
                if (clientToEdit) {
                    setSelectedClient(clientToEdit as Client);
                    setShowActionModal(true);
                    setActiveTab('clients');
                }
            }
        }, (err) => {
            console.error("Firestore error:", err);
            setSyncError(err.message);
            setIsSyncing(false);
        });

        // 2. Listen for Admin Actions (Cloud Scan)
        const actionUnsubscribe = onSnapshot(doc(db, 'admin_actions', 'current'), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.action === 'id_received' && data.cardId) {
                    // Standard registration scan
                    setNfcLinkId(data.cardId);
                    setIsWaitingForScan(false);
                    // Clear the action so it doesn't trigger again
                    updateDoc(doc(db, 'admin_actions', 'current'), { action: 'idle' });
                }
            }
        });

        return () => {
            unsubscribe();
            actionUnsubscribe();
        };
    }, [location.search]);

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

        const generatedId = nfcLinkId.trim() || generateClientId();
        const newClient: Client = {
            id: generatedId,
            name: clientName,
            route: selectedRoute,
            amountPaid: Number(amountPaid),
            expiryDate: expiryDate,
            photo: photoDataURL || '',
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

        saveClient(newClient);
    };

    const saveClient = async (client: Client) => {
        try {
            await setDoc(doc(db, 'clients', client.id), client);
            
            // Set success view instead of simple message
            setRegistrationSuccess(client);
            
            setClientName(''); setAmountPaid(''); setExpiryDate(getDefaultExpiryMonth()); setPhotoDataURL(null); setNfcLinkId('');
            setShowActionModal(false);
            setSelectedClient(null);
        } catch (err) {
            console.error(err);
            setMessage({ text: 'Грешка при записване.', type: 'error' });
        }
    };

    const renewClient = async () => {
        if (!selectedClient || !newMonth || !newAmount) return;
        const updatedClients = clients.map(c => {
            if (c.id === selectedClient.id) {
                const history = c.history || [];
                return {
                    ...c,
                    expiryDate: newMonth,
                    amountPaid: c.amountPaid + Number(newAmount),
                    isCanceled: false,
                    cancelReason: undefined,
                    renewalHistory: [...(c.renewalHistory || []), { date: new Date().toISOString(), amount: Number(newAmount), month: newMonth }],
                    history: [...history, {
                        date: new Date().toISOString(),
                        action: 'Подновяване',
                        details: `Нов месец: ${newMonth}`,
                        amount: Number(newAmount),
                        performedBy: currentUser?.username || 'Админ'
                    }]
                };
            }
            return c;
        });
        await saveClient(updatedClients.find(c => c.id === selectedClient.id)!);
        setNewMonth('');
        setNewAmount('');
    };

    const generateNfcBatch = () => {
        const baseUrl = `${window.location.origin}${window.location.pathname}#/client/`;
        const newLinks = [];
        for (let i = 0; i < nfcQuantity; i++) {
            newLinks.push(`${baseUrl}${generateClientId()}`);
        }
        setGeneratedLinks(newLinks);
    };

    const copyLinksToClipboard = () => {
        const text = generatedLinks.join('\n');
        navigator.clipboard.writeText(text);
        setMessage({ text: 'Линковете са копирани в клипборда!', type: 'success' });
    };

    const cancelClient = async () => {
        if (!selectedClient || !cancelReason) return;
        const updatedClients = clients.map(c => {
            if (c.id === selectedClient.id) {
                const history = c.history || [];
                return {
                    ...c,
                    isCanceled: true,
                    cancelReason,
                    history: [...history, {
                        date: new Date().toISOString(),
                        action: 'Анулиране',
                        details: cancelReason,
                        performedBy: currentUser?.username || 'Админ'
                    }]
                };
            }
            return c;
        });
        await saveClient(updatedClients.find(c => c.id === selectedClient.id)!);
        setCancelReason('');
    };

    const handleDeleteClient = async (id: string, name: string) => {
        if (currentUser?.role !== 'admin') return;
        if (window.confirm(`Сигурни ли сте, че искате да ИЗТРИЕТЕ ПОСТОЯННО клиента "${name}"? Това ще премахне цялата история и плащания!`)) {
            try {
                await deleteDoc(doc(db, 'clients', id));
                setMessage({ text: `Клиентът "${name}" бе изтрит постоянно.`, type: 'success' });
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

    // Stats
    const allMonths = Array.from(new Set([
        new Date().toISOString().slice(0, 7), // Always include current month
        ...clients.flatMap(c => (c.renewalHistory || []).map(r => r.month))
    ])).sort().reverse();

    const isAll = statsMonth === 'all';
    
    // Route Color Helper
    const getRouteColor = (route: string = '') => {
        if (!route) return 'var(--text-secondary)';
        let hash = 0;
        for (let i = 0; i < route.length; i++) {
            hash = route.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash % 360);
        return `hsl(${h}, 70%, 60%)`;
    };
    
    const totalRevenue = isAll 
        ? clients.reduce((acc, c) => acc + (c.amountPaid || 0), 0)
        : clients.reduce((acc, c) => {
            const monthlyRenewal = (c.renewalHistory || []).find(r => r.month === statsMonth);
            return acc + (monthlyRenewal ? monthlyRenewal.amount : 0);
          }, 0);

    const activeClientsCount = isAll
        ? clients.filter(c => !c.isCanceled && !isExpired(c.expiryDate, c)).length
        : clients.filter(c => (c.renewalHistory || []).some(r => r.month === statsMonth)).length;

    const renewedCount = isAll ? 0 : clients.filter(c => (c.renewalHistory || []).some(r => r.month === statsMonth)).length;
    const nonRenewedCount = isAll ? 0 : clients.filter(c => !c.isCanceled && !(c.renewalHistory || []).some(r => r.month === statsMonth)).length;

    const routeStats = ROUTES.map(route => {
        const routeClients = clients.filter(c => c.route === route);
        const revenue = isAll
            ? routeClients.reduce((acc, c) => acc + (c.amountPaid || 0), 0)
            : routeClients.reduce((acc, c) => {
                const monthlyRenewal = (c.renewalHistory || []).find(r => r.month === statsMonth);
                return acc + (monthlyRenewal ? monthlyRenewal.amount : 0);
              }, 0);
        const count = isAll 
            ? routeClients.length 
            : routeClients.filter(c => (c.renewalHistory || []).some(r => r.month === statsMonth)).length;
        
        return { route, count, revenue };
    }).sort((a, b) => b.revenue - a.revenue);

    const getClientStatusForMonth = (client: Client, month: string) => {
        if (client.isCanceled) return 'Анулиран';
        
        const hasPaymentForMonth = (client.renewalHistory || []).some(rh => rh.month === month);
        return hasPaymentForMonth ? 'Активен' : 'Неактивен';
    };

    const getMonthPayment = (client: Client, month: string) => {
        const payment = (client.renewalHistory || []).find(rh => rh.month === month);
        return payment ? payment.amount : 0;
    };

    // Advanced Stats for Dashboard
    const totalNonCanceled = clients.filter(c => !c.isCanceled).length;
    const newClientsMonth = clients.filter(c => c.createdAt?.startsWith(statsMonth)).length;
    const paymentRate = totalNonCanceled > 0 ? Math.round((activeClientsCount / totalNonCanceled) * 100) : 0;
    const avgProfit = activeClientsCount > 0 ? Math.round(totalRevenue / activeClientsCount) : 0;
    const pendingTotal = totalNonCanceled - activeClientsCount;

    const topScannedClients = [...clients]
        .filter(c => (c.scanCount || 0) > 0)
        .sort((a, b) => (b.scanCount || 0) - (a.scanCount || 0))
        .slice(0, 5);

    const todayStr = new Date().toISOString().split('T')[0];
    const scannedToday = clients.filter(c => c.lastScanAt?.startsWith(todayStr)).length;
    
    // Group suspicious activity by date and client
    const suspiciousClientsData = clients.map(c => {
        if (!c.scanHistory) return null;
        
        // Group scans by date
        const byDate = c.scanHistory.reduce((acc, ts) => {
            const d = ts.split('T')[0];
            if (!acc[d]) acc[d] = [];
            acc[d].push(ts);
            return acc;
        }, {} as Record<string, string[]>);

        // Find days with > 3 scans
        const abuseDays = Object.entries(byDate)
            .filter(([, scans]) => scans.length > 3)
            .sort((a, b) => b[0].localeCompare(a[0])); // Recent dates first

        if (abuseDays.length === 0) return null;

        return { ...c, abuseDays };
    }).filter(item => item !== null) as (Client & { abuseDays: [string, string[]][] })[];

    const suspiciousClients = suspiciousClientsData.slice(0, 5);

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
        
        const weights: Record<string, number> = { 'Неактивен': 0, 'Активен': 1, 'Анулиран': 2 };
        return weights[statusA] - weights[statusB];
    });

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', animation: 'fadeIn 0.4s ease' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Управление на Карти</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {isAdmin ? <ShieldCheck size={14} color="#ff5252" /> : <Shield size={14} color="var(--primary-color)" />}
                            {isAdmin ? 'Администратор' : 'Модератор'} — {currentUser?.username}
                        </div>
                        <div style={{ 
                            display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', 
                            padding: '2px 8px', borderRadius: '50px', 
                            background: syncError ? 'rgba(255,82,82,0.1)' : 'rgba(0,173,181,0.1)',
                            color: syncError ? '#ff5252' : 'var(--primary-color)',
                            border: `1px solid ${syncError ? 'rgba(255,82,82,0.2)' : 'rgba(0,173,181,0.2)'}`
                        }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: syncError ? '#ff5252' : 'var(--primary-color)', animation: isSyncing ? 'pulse 1.5s infinite' : 'none' }} />
                            {isSyncing ? 'Синхронизиране...' : syncError ? 'Грешка в Облака' : 'Облак: Свързан'}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <TabButton id="register" icon={PlusCircle} label="ДОБАВИ КАРТИ" activeColor="#00c853" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton id="clients" icon={Users} label="КЛИЕНТИ" activeTab={activeTab} setActiveTab={setActiveTab} />
                    {isAdmin && <TabButton id="dashboard" icon={BarChart} label="ТАБЛО" activeTab={activeTab} setActiveTab={setActiveTab} />}
                    {isAdmin && <TabButton id="nfc" icon={ExternalLink} label="NFC КОДОВЕ" activeColor="var(--accent-color)" activeTab={activeTab} setActiveTab={setActiveTab} />}
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

            {activeTab === 'dashboard' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Period Selector */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Период за Статистика:</span>
                        <select 
                            value={statsMonth} 
                            onChange={(e) => setStatsMonth(e.target.value)}
                            style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid var(--surface-border)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="all">Всичко до момента (Общо)</option>
                            {allMonths.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <Card className="stat-card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
                            <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><DollarSign size={16} /> Общ Оборот</div>
                                <button
                                    onClick={() => setShowTotalRevenue(!showTotalRevenue)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                                    type="button"
                                    title={showTotalRevenue ? "Скрий оборота" : "Покажи оборота"}
                                >
                                    {showTotalRevenue ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>
                                {showTotalRevenue ? `${totalRevenue.toFixed(2)} €` : '••••••'}
                            </div>
                        </Card>
                        <Card className="stat-card" style={{ borderLeft: '4px solid #00e676' }}>
                            <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}><Users size={16} />{isAll ? 'Всички Профили' : 'Активни Карти'}</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 800 }}>{activeClientsCount}</div>
                        </Card>
                        <Card className="stat-card" style={{ borderLeft: '4px solid var(--accent-color)' }}>
                            <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={16} /> Клиенти</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{clients.length}</div>
                        </Card>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
                        <Card>
                            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><List size={20} /> Статистика по Курсове</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {routeStats.slice(0, 8).map(st => (
                                    <div key={st.route}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span>{st.route}</span>
                                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{st.count} карти | <b>{st.revenue} €</b></span>
                                        </div>
                                        <div className="route-bar">
                                            <div className="route-fill" style={{ width: `${totalRevenue ? (st.revenue / totalRevenue) * 100 : 0}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                        <Card>
                            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><TrendingUp size={20} color="var(--primary-color)" /> Бизнес Инсайти ({isAll ? 'Всичко' : statsMonth})</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><PlusCircle size={12} /> Нови Клиенти</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-color)' }}>+{newClientsMonth}</div>
                                </div>
                                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Percent size={12} /> Събираемост</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#00e676' }}>{paymentRate}%</div>
                                </div>
                                {!isAll && (
                                    <>
                                        <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(0,230,118,0.05)', border: '1px solid rgba(0,230,118,0.1)' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(0,230,118,0.7)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><UserCheck size={12} /> Активни (Платени)</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#00e676' }}>{renewedCount}</div>
                                        </div>
                                        <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,82,82,0.05)', border: '1px solid rgba(255,82,82,0.1)' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,82,82,0.7)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><XCircle size={12} /> Неактивни (Минали)</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ff5252' }}>{nonRenewedCount}</div>
                                        </div>
                                    </>
                                )}
                                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><PiggyBank size={12} /> Среден Приход</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{avgProfit} €</div>
                                </div>
                                <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={12} /> Остават</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: pendingTotal > 0 ? '#ff5252' : 'var(--text-secondary)' }}>{pendingTotal}</div>
                                </div>
                            </div>
                            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '10px', background: 'rgba(0,173,181,0.05)', fontSize: '0.8rem', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Zap size={14} /> <span>{paymentRate > 80 ? 'Отлична събираемост този месец!' : 'Внимание: Има голям брой неплатени карти.'}</span>
                            </div>
                        </Card>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        {/* Top Active Users */}
                        <Card>
                            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)' }}>
                                <UserCheck size={20} /> Най-активни Пътници
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {topScannedClients.length > 0 ? topScannedClients.map((c, idx) => (
                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: idx === 0 ? 'gold' : idx === 1 ? 'silver' : '#cd7f32', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900 }}>{idx + 1}</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary-color)' }}>{c.scanCount}</div>
                                            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>пътувания</div>
                                        </div>
                                    </div>
                                )) : <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Няма данни за сканирания.</div>}
                            </div>
                        </Card>

                        {/* Security & Alerts */}
                        <Card>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ff5252' }}>
                                    <AlertTriangle size={20} /> Сигурност и Нарушения
                                </h3>
                                {isAdmin && (
                                    <button 
                                        onClick={handleResetAllScans}
                                        disabled={statsLoading}
                                        style={{ 
                                            background: statsLoading ? 'rgba(255,255,255,0.05)' : 'rgba(255,82,82,0.1)', 
                                            border: '1px solid rgba(255,82,82,0.2)', 
                                            color: statsLoading ? 'var(--text-secondary)' : '#ff5252', 
                                            borderRadius: '8px', cursor: statsLoading ? 'not-allowed' : 'pointer', 
                                            fontSize: '0.75rem', padding: '0.5rem 1rem',
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            fontWeight: 600, transition: 'all 0.2s'
                                        }}
                                        title="Нулирай всички броячи за сканиране"
                                    >
                                        <RefreshCw size={14} className={statsLoading ? 'spin' : ''} /> 
                                        {statsLoading ? 'Нулиране...' : 'Нулирай Сканове'}
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(255,82,82,0.05)', border: '1px solid rgba(255,82,82,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,82,82,0.7)' }}>Сканирани карти днес</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ff5252' }}>{scannedToday}</div>
                                    </div>
                                    <Zap size={24} color="#ff5252" opacity={0.5} />
                                </div>
                                
                                {suspiciousClients.length > 0 ? (
                                    <>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '0.5rem' }}>Пътници с над 3 сканирания за ден (цяла история):</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                            {suspiciousClients.map(c => (
                                                <div key={c.id} style={{ padding: '1rem', background: 'rgba(255,0,0,0.05)', border: '1px solid rgba(255,0,0,0.1)', borderRadius: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{c.name}</div>
                                                        <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>ID: {c.id}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                        {c.abuseDays.map(([date, times]) => (
                                                            <div key={date} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '6px' }}>
                                                                <div style={{ color: '#ff5252', fontWeight: 700, marginBottom: '0.2rem' }}>📅 {new Date(date).toLocaleDateString('bg-BG')} — {times.length} пъти</div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                                    {times.map((ts, idx) => (
                                                                        <span key={idx} style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.65rem' }}>
                                                                            {new Date(ts).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--success-color)', background: 'rgba(0,255,150,0.05)', borderRadius: '12px' }}>
                                        ✅ Няма засечени нарушения.
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {activeTab === 'clients' && (
                <div style={{ animation: 'fadeIn 0.4s ease' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                            <input
                                type="text" placeholder="Търсене по име, ID или курс..."
                                style={{ width: '100%', padding: '0.75rem 1.5rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)', outline: 'none' }}
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <select 
                                value={filterMonth}
                                onChange={(e) => setFilterMonth(e.target.value)}
                                style={{ padding: '0.75rem 1rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', cursor: 'pointer' }}
                            >
                                {allMonths.map(m => (
                                    <option key={m} value={m} style={{ background: '#222' }}>{m}</option>
                                ))}
                            </select>

                            <select 
                                value={filterRoute}
                                onChange={(e) => setFilterRoute(e.target.value)}
                                style={{ padding: '0.75rem 1rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', cursor: 'pointer' }}
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
                                                            background: status === 'Анулиран' || status === 'Неактивен' ? 'rgba(255,0,0,0.1)' : 'var(--success-bg)',
                                                            color: status === 'Анулиран' || status === 'Неактивен' ? '#ff4040' : 'var(--success-color)',
                                                            fontWeight: 700
                                                        }}>
                                                            {status}
                                                        </span>
                                                    </td>
                                                    <td style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            onClick={() => { setSelectedClient(client); setShowActionModal(true); }}
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
                                                background: status === 'Анулиран' || status === 'Неактивен' ? 'rgba(255,0,0,0.1)' : 'var(--success-bg)',
                                                color: status === 'Анулиран' || status === 'Неактивен' ? '#ff4040' : 'var(--success-color)'
                                            }}>
                                                {status}
                                            </span>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => { setSelectedClient(client); setShowActionModal(true); }}
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                            <Card style={{ padding: '1.5rem' }}>
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
                            <Card>
                                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Име</label>
                                        <input type="text" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)' }} value={clientName} onChange={e => setClientName(e.target.value)} required />
                                    </div>
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
                                            <input 
                                                type="text" 
                                                placeholder="ID от Карта (напр. ABC123)" 
                                                style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--surface-border)', color: 'var(--primary-color)', fontWeight: 700, fontFamily: 'monospace', minWidth: '0' }} 
                                                value={nfcLinkId} 
                                                onChange={e => setNfcLinkId(e.target.value.toUpperCase())} 
                                            />
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
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'nfc' && isAdmin && (
                <div style={{ animation: 'fadeIn 0.4s ease' }}>
                    <Card style={{ padding: '2rem' }}>
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



            {/* Action Modal */}
            {showActionModal && selectedClient && (
                <div className="modal-overlay" onClick={() => setShowActionModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '600px', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
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
                        <div style={{ display: 'flex', padding: '0.5rem', gap: '0.5rem', background: 'rgba(0,0,0,0.2)' }}>
                            <button 
                                onClick={() => setModalTab('info')}
                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', color: modalTab === 'info' ? '#fff' : 'var(--text-secondary)', background: modalTab === 'info' ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: 600, fontSize: '0.85rem' }}
                            >Инфо</button>
                            <button 
                                onClick={() => setModalTab('actions')}
                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', color: modalTab === 'actions' ? '#fff' : 'var(--text-secondary)', background: modalTab === 'actions' ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: 600, fontSize: '0.85rem' }}
                            >Действие</button>
                            <button 
                                onClick={() => setModalTab('history')}
                                style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', color: modalTab === 'history' ? '#fff' : 'var(--text-secondary)', background: modalTab === 'history' ? 'rgba(255,255,255,0.1)' : 'transparent', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                            ><Clock size={14} /> История</button>
                        </div>

                        {/* Content */}
                        <div style={{ padding: '1.5rem', minHeight: '300px', maxHeight: '70vh', overflowY: 'auto' }}>
                            {modalTab === 'info' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', animation: 'fadeIn 0.3s ease' }}>
                                    <div style={{ padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Статус</div>
                                        <div style={{ fontWeight: 700, color: selectedClient.isCanceled || isExpired(selectedClient.expiryDate, selectedClient) ? 'var(--error-color)' : 'var(--success-color)' }}>
                                            {selectedClient.isCanceled ? 'Анулиран' : isExpired(selectedClient.expiryDate, selectedClient) ? 'Невалиден' : 'Активен'}
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
                                    <div style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(0,255,150,0.03)', border: '1px solid rgba(0,255,150,0.1)' }}>
                                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-color)', margin: '0 0 1rem 0' }}><RefreshCw size={18} /> Подновяване</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Месец</label>
                                                <input type="month" style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '6px', color: '#fff', colorScheme: 'dark' }} value={newMonth} onChange={e => setNewMonth(e.target.value)} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Сума (€)</label>
                                                <input type="number" placeholder="0.00" style={{ width: '100%', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '6px', color: '#fff' }} value={newAmount} onChange={e => setNewAmount(e.target.value)} />
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', animation: 'fadeIn 0.3s ease' }}>
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
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default AdminPanel;
