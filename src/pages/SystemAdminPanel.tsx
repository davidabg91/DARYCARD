import React, { useState, useEffect } from 'react';
import { 
    BarChart, Users as UsersIcon, History as HistoryIcon, 
    TrendingUp, DollarSign, 
    RefreshCw, Search, Clock, Shield,
    UserPlus, Trash2
} from 'lucide-react';
import { collection, query, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import Card from '../components/Card';
import type { UserRole } from '../types/auth';

// Custom icons since they weren't in common lists or were problematic in older versions
const Percent = ({ size }: { size: number | string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="5" x2="5" y2="19"></line>
        <circle cx="6.5" cy="6.5" r="2.5"></circle>
        <circle cx="17.5" cy="17.5" r="2.5"></circle>
    </svg>
);

// --- Interfaces ---
interface Client {
    id: string;
    name: string;
    route: string;
    amountPaid: number;
    expiryDate: string;
    isCanceled?: boolean;
    renewalHistory?: { date: string, amount: number, month: string }[];
    scanCount?: number;
    lastScanAt?: string;
    scanHistory?: string[];
    createdAt: string;
    abuseReviewedAt?: string;
}

interface GlobalLog {
    id: string;
    timestamp: string;
    performedBy: string;
    action: string;
    targetName: string;
    details: string;
    amount: number;
}

const ROUTES = [
    "Бъркач", "Тръстеник", "Биволаре", "Горна Митрополия", "Долни Дъбник",
    "Рибен", "Садовец", "Славовица", "Байкал", "Гиген",
    "Долна Митрополия", "Ясен", "Крушовица", "Дисевица", "Търнене", "Градина",
    "Петърница", "Опанец", "Победа", "Подем", "Божурица",
    "Горни Дъбник",
    "Долни Дъбник - Садовец", "Долна Митрополия - Тръстеник", "Долна Митрополия - Славовица"
];

const ROLE_LABELS: Record<UserRole, string> = {
    admin: 'Администратор',
    moderator: 'Модератор',
};

const ROLE_COLORS: Record<UserRole, string> = {
    admin: '#ff5252',
    moderator: '#00ADB5',
};

// --- Main Component ---
const SystemAdminPanel: React.FC = () => {
    const { users, currentUser, addUser, updateUserRole, deleteUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'audit'>('dashboard');
    
    // Global Data
    const [clients, setClients] = useState<Client[]>([]);
    const [globalLogs, setGlobalLogs] = useState<GlobalLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Dashboard State
    const [statsMonth, setStatsMonth] = useState<string>(() => {
        const now = new Date();
        return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    });
    const [chartRoute, setChartRoute] = useState<string>('all_routes');
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Users State
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('moderator');
    const [userMsg, setUserMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [userLoading, setUserLoading] = useState(false);

    // Audit State
    const [auditSearch, setAuditSearch] = useState('');

    useEffect(() => {
        // Listen for Clients
        const qClients = query(collection(db, 'clients'));
        const unsubClients = onSnapshot(qClients, (snap) => {
            const list: Client[] = [];
            snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Client));
            setClients(list);
        });

        // Listen for Audit Logs
        const qLogs = query(collection(db, 'activity_logs'));
        const unsubLogs = onSnapshot(qLogs, (snap) => {
            const logs: GlobalLog[] = [];
            snap.forEach(doc => logs.push({ id: doc.id, ...doc.data() } as GlobalLog));
            setGlobalLogs(() => {
                const newList = [...logs];
                return newList.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
            });
            setLoading(false);
        });

        return () => { unsubClients(); unsubLogs(); };
    }, []);

    // --- Helper Functions ---
    const isExpired = (monthStr: string | undefined, client?: Client) => {
        if (!monthStr) return true;
        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        if (client?.renewalHistory) {
            return !client.renewalHistory.some(rh => rh.month === currentMonthStr);
        }
        const [year, month] = monthStr.split('-');
        const expiry = new Date(Number(year), Number(month), 0, 23, 59, 59);
        return now > expiry;
    };

    const getActionColor = (action: string) => {
        const a = action.toLowerCase();
        if (a.includes('създаване')) return '#00e676'; // Green
        if (a.includes('изтриване') || a.includes('анулиране') || a.includes('триене')) return '#ff5252'; // Red
        if (a.includes('подновяване')) return '#2196f3'; // Blue
        if (a.includes('генериране') || a.includes('копиране')) return '#00bcd4'; // Cyan
        return '#ffab00'; // Default Orange
    };

    // --- Dashboard Calculations ---
    const isAll = statsMonth === 'all';
    const totalRevenue = isAll 
        ? clients.reduce((acc, c) => acc + (c.amountPaid || 0), 0)
        : clients.reduce((acc, c) => {
            const monthlyRenewal = (c.renewalHistory || []).find(r => r.month === statsMonth);
            return acc + (monthlyRenewal ? monthlyRenewal.amount : 0);
          }, 0);

    const activeClientsCount = isAll
        ? clients.filter(c => !c.isCanceled && !isExpired(c.expiryDate, c)).length
        : clients.filter(c => (c.renewalHistory || []).some(r => r.month === statsMonth)).length;

    const totalNonCanceled = clients.filter(c => !c.isCanceled).length;
    const paymentRate = totalNonCanceled > 0 ? Math.round((activeClientsCount / totalNonCanceled) * 100) : 0;
    const avgProfit = activeClientsCount > 0 ? Math.round(totalRevenue / activeClientsCount) : 0;

    const topScannedClients = [...clients]
        .filter(c => (c.scanCount || 0) > 0)
        .sort((a, b) => (b.scanCount || 0) - (a.scanCount || 0))
        .slice(0, 5);

    const todayIso = new Date().toISOString().split('T')[0];
    
    // Revenue for selected day
    const revenueSelectedDay = clients.reduce((acc, c) => {
        const payments = (c.renewalHistory || []).filter(r => r.date?.startsWith(selectedDate));
        return acc + payments.reduce((sum, p) => sum + p.amount, 0);
    }, 0);
    const registrationsSelectedDay = clients.filter(c => c.createdAt?.startsWith(selectedDate)).length;

    const hourlyDistribution = (() => {
        const dist = Array(24).fill(0);
        clients.forEach(c => {
            (c.scanHistory || []).forEach(ts => {
                if (ts.startsWith(selectedDate)) {
                    if (chartRoute === 'all_routes' || c.route === chartRoute) {
                        const hr = new Date(ts).getHours();
                        dist[hr]++;
                    }
                }
            });
        });
        return dist;
    })();

    const maxScans = Math.max(...hourlyDistribution, 1);
    const peakHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));

    const scannedToday = clients.filter(c => c.lastScanAt?.startsWith(todayIso)).length;

    // Renewals & Pending
    const renewedCount = clients.filter(c => (c.renewalHistory || []).some(r => r.month === statsMonth)).length;
    const pendingTotal = totalNonCanceled - renewedCount;

    // Route Stats
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

    // Suspicious Activity (Abuse detection)
    const suspiciousClientsData = clients.map(c => {
        if (!c.scanHistory) return null;
        
        // Filter out scans before last review
        const relevantScans = c.abuseReviewedAt 
            ? c.scanHistory.filter(ts => ts > c.abuseReviewedAt!)
            : c.scanHistory;

        if (relevantScans.length === 0) return null;

        const byDate = relevantScans.reduce((acc, ts) => {
            const d = ts.split('T')[0];
            if (!acc[d]) acc[d] = [];
            acc[d].push(ts);
            return acc;
        }, {} as Record<string, string[]>);

        const abuseDays = Object.entries(byDate)
            .filter(([, scans]) => scans.length > 3)
            .sort((a, b) => b[0].localeCompare(a[0]));

        if (abuseDays.length === 0) return null;
        return { ...c, abuseDays };
    }).filter(item => item !== null) as (Client & { abuseDays: [string, string[]][] })[];

    const suspiciousClients = suspiciousClientsData.slice(0, 5);

    const handleClearAbuse = async (clientId: string) => {
        try {
            await updateDoc(doc(db, 'clients', clientId), {
                abuseReviewedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error("Error clearing abuse:", err);
        }
    };

    // --- User Handlers ---
    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername.trim() || !newPassword.trim()) return;
        setUserLoading(true);
        try {
            await addUser(newUsername.trim(), newPassword, newRole);
            setUserMsg({ text: `Потребител "${newUsername}" е създаден.`, type: 'success' });
            setNewUsername(''); setNewPassword('');
            setTimeout(() => setUserMsg(null), 3000);
        } catch (err: unknown) {
            const error = err as { code?: string };
            setUserMsg({ text: error.code === 'auth/email-already-in-use' ? 'Потребителското име съществува.' : 'Грешка!', type: 'error' });
            setTimeout(() => setUserMsg(null), 3000);
        } finally { setUserLoading(false); }
    };

    if (loading) return <div style={{ padding: '5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Зареждане на системни данни...</div>;

    const filteredLogs = globalLogs.filter(log => 
        log.performedBy.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.targetName.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.details.toLowerCase().includes(auditSearch.toLowerCase())
    );

    return (
        <div style={{ width: '100%', padding: isMobile ? '0 1rem 3rem' : '1.5rem', animation: 'fadeIn 0.4s ease' }}>
            <h1 style={{ fontSize: isMobile ? '1.75rem' : '2.5rem', fontWeight: 900, marginBottom: isMobile ? '1.5rem' : '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ff5252' }}>
                <Shield size={isMobile ? 28 : 40} /> АДМИН ПАНЕЛ
            </h1>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '1rem', marginBottom: isMobile ? '1.5rem' : '2.5rem', overflowX: 'auto', paddingBottom: '0.5rem', WebkitOverflowScrolling: 'touch' }}>
                <TabButton id="dashboard" icon={BarChart} label="ТАБЛО" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} color="#ff5252" isMobile={isMobile} />
                <TabButton id="users" icon={UsersIcon} label="ПОТРЕБИТЕЛИ" active={activeTab === 'users'} onClick={() => setActiveTab('users')} color="#ff5252" isMobile={isMobile} />
                <TabButton id="audit" icon={HistoryIcon} label="ОДИТ" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} color="#ff5252" isMobile={isMobile} />
            </div>

            {/* Dashboard Tab - Support Horizontal Scroll on Mobile only */}
            {activeTab === 'dashboard' && (
                <div style={{ position: 'relative', width: '100%' }}>
                    <div className={isMobile ? 'admin-scroll-fix' : ''}>
                        <div className={isMobile ? 'admin-scroll-content' : ''} style={!isMobile ? { display: 'flex', flexDirection: 'column', gap: '2.5rem' } : {}}>
                            
                            {/* Section 1: Ключови показатели */}
                            <section>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h2 style={{ fontSize: isMobile ? '1.1rem' : '1.4rem', fontWeight: 800, color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0 }}>
                                        <BarChart size={20} color="#ff5252" /> ОСНОВНИ ПОКАЗАТЕЛИ
                                    </h2>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.8rem', borderRadius: '12px', border: '1px solid var(--surface-border)' }}>
                                        <TrendingUp size={16} color="#ff5252" />
                                        <select 
                                            value={statsMonth} 
                                            onChange={(e) => setStatsMonth(e.target.value)}
                                            style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: '0.9rem', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
                                        >
                                            {Array.from(new Set([todayIso.slice(0, 7), ...clients.flatMap(c => (c.renewalHistory || []).map(r => r.month))])).sort().reverse().map(m => (
                                                <option key={m} value={m} style={{ background: '#222' }}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ 
                                    display: 'grid', 
                                    gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(240px, 1fr))', 
                                    gap: isMobile ? '0.75rem' : '1.5rem' 
                                }}>
                                    <StatCard icon={DollarSign} label="Обороти" value={`${totalRevenue.toFixed(2)} €`} color="#00e676" isMobile={isMobile} />
                                    <StatCard icon={UsersIcon} label="Активни Карти" value={activeClientsCount} color="#00ADB5" isMobile={isMobile} />
                                    <StatCard icon={HistoryIcon} label="Сканирани" value={scannedToday} color="#ff5252" isMobile={isMobile} />
                                    <StatCard icon={Percent} label="Плащане" value={`${paymentRate}%`} color="#ffab00" isMobile={isMobile} />
                                    <StatCard icon={RefreshCw} label="Обновени" value={renewedCount} color="#4caf50" isMobile={isMobile} />
                                    <StatCard icon={Percent} label="На Карта" value={`${avgProfit} €`} color="#e91e63" isMobile={isMobile} />
                                    <StatCard icon={Shield} label="Липсващи" value={pendingTotal} color="#ff5252" isMobile={isMobile} />
                                </div>
                            </section>

                            {/* Section 2: Анализ на активността */}
                            <section>
                                <h2 style={{ fontSize: isMobile ? '1.1rem' : '1.4rem', fontWeight: 800, color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
                                    <Clock size={20} color="#ff5252" /> АНАЛИЗ НА ТРАФИКА
                                </h2>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(500px, 1fr))', gap: isMobile ? '1rem' : '2rem' }}>
                                    {/* Daily Stats & Bar Chart */}
                                    <Card style={{ padding: isMobile ? '1.25rem' : '2.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '2rem', flexDirection: isMobile ? 'column' : 'row', gap: '1.25rem' }}>
                                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Разпределение по часове</h3>
                                            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                                                <input 
                                                    type="date" 
                                                    value={selectedDate}
                                                    onChange={(e) => setSelectedDate(e.target.value)}
                                                    style={{ flex: isMobile ? 1 : 'none', background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid var(--surface-border)', padding: '0.5rem', borderRadius: '10px', fontSize: '0.8rem' }}
                                                />
                                                <select 
                                                    value={chartRoute} 
                                                    onChange={(e) => setChartRoute(e.target.value)}
                                                    style={{ flex: isMobile ? 1 : 'none', background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid var(--surface-border)', padding: '0.5rem', borderRadius: '10px', fontSize: '0.8rem' }}
                                                >
                                                    <option value="all_routes">Всички Линии</option>
                                                    {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        
                                        <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '1rem', scrollbarWidth: 'thin' }}>
                                            <div style={{ height: '240px', display: 'flex', alignItems: 'flex-end', gap: isMobile ? '3px' : '6px', padding: '1rem 0', minWidth: isMobile ? '600px' : 'auto' }}>
                                                {hourlyDistribution.map((count, hr) => (
                                                    <div key={hr} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '8px', height: '100%', position: 'relative' }}>
                                                        {count > 0 && <span style={{ position: 'absolute', top: '-20px', width: '100%', textAlign: 'center', fontSize: '0.65rem', fontWeight: 800, color: hr === peakHour ? '#ff5252' : 'var(--primary-color)' }}>{count}</span>}
                                                        <div style={{ width: '100%', height: `${(count/maxScans)*100}%`, background: hr === peakHour ? 'linear-gradient(to top, #ff5252, #ff8a80)' : 'linear-gradient(to top, var(--primary-color), var(--accent-color))', opacity: count > 0 ? 1 : 0.05, borderRadius: '4px 4px 0 0', minHeight: count > 0 ? '4px' : '2px', transition: 'height 0.5s ease-out' }}></div>
                                                        <span style={{ fontSize: '0.6rem', textAlign: 'center', opacity: hr % 4 === 0 ? 0.8 : 0.2, fontWeight: hr % 4 === 0 ? 800 : 400 }}>{hr}:00</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                            <div style={{ padding: '1rem', background: 'rgba(255,152,0,0.05)', borderRadius: '16px', border: '1px solid rgba(255,152,0,0.1)', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,152,0,0.7)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Оборот за деня</div>
                                                <div style={{ fontWeight: 900, color: '#ff9800', fontSize: '1.4rem' }}>{revenueSelectedDay.toFixed(2)} €</div>
                                            </div>
                                            <div style={{ padding: '1rem', background: 'rgba(0,173,181,0.05)', borderRadius: '16px', border: '1px solid rgba(0,173,181,0.1)', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'rgba(0,173,181,0.7)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Нови регистрации</div>
                                                <div style={{ fontWeight: 900, color: '#00ADB5', fontSize: '1.4rem' }}>{registrationsSelectedDay}</div>
                                            </div>
                                        </div>
                                    </Card>

                                    {/* Top Users */}
                                    <Card style={{ padding: isMobile ? '1.25rem' : '2.5rem' }}>
                                        <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                            Най-активни пътници
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {topScannedClients.length > 0 ? topScannedClients.map((c, i) => {
                                                const maxClientScans = Math.max(...topScannedClients.map(cl => cl.scanCount || 0));
                                                const currentScans = c.scanCount || 0;
                                                const percent = maxClientScans > 0 ? (currentScans / maxClientScans) * 100 : 0;
                                                return (
                                                    <div key={c.id} style={{ position: 'relative', overflow: 'hidden', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${percent}%`, background: 'rgba(255,255,255,0.02)', borderRadius: '0 16px 16px 0', transition: 'width 1s ease-out' }}></div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative', zIndex: 1, minWidth: 0 }}>
                                                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: i < 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][i] : 'rgba(255,255,255,0.05)', color: i < 3 ? '#000' : 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900, flexShrink: 0 }}>{i + 1}</div>
                                                            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: isMobile ? '0.9rem' : '1.05rem' }}>{c.name}</div>
                                                        </div>
                                                        <div style={{ position: 'relative', zIndex: 1, textAlign: 'right', flexShrink: 0 }}>
                                                            <div style={{ fontWeight: 900, color: 'var(--primary-color)', fontSize: '1.2rem' }}>{currentScans}</div>
                                                            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>пътувания</div>
                                                        </div>
                                                    </div>
                                                );
                                            }) : <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.3 }}>Няма данни.</div>}
                                        </div>
                                    </Card>
                                </div>
                            </section>

                            {/* Section 3: Резултати по линии и Сигурност */}
                            <section>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(500px, 1fr))', gap: isMobile ? '1rem' : '2rem' }}>
                                    {/* Route Performance */}
                                    <div>
                                        <h2 style={{ fontSize: isMobile ? '1.1rem' : '1.4rem', fontWeight: 800, color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
                                            <TrendingUp size={20} color="#00e676" /> ПРИХОДИ ПО ЛИНИИ
                                        </h2>
                                        <Card style={{ padding: isMobile ? '1.25rem' : '2.5rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                {routeStats.filter(s => s.count > 0 || s.revenue > 0).slice(0, 10).map((s, i) => {
                                                    const maxRouteRevenue = Math.max(...routeStats.map(rs => rs.revenue));
                                                    const percent = maxRouteRevenue > 0 ? (s.revenue / maxRouteRevenue) * 100 : 0;
                                                    return (
                                                        <div key={i} style={{ position: 'relative', overflow: 'hidden', padding: '0.85rem 1.25rem', background: 'rgba(0,230,118,0.03)', borderRadius: '14px', border: '1px solid rgba(0,230,118,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${percent}%`, background: 'rgba(0,230,118,0.04)', transition: 'width 1.2s ease-out' }}></div>
                                                            <div style={{ position: 'relative', zIndex: 1 }}>
                                                                <div style={{ fontWeight: 800, fontSize: isMobile ? '0.9rem' : '1rem', color: '#fff' }}>{s.route}</div>
                                                                <div style={{ fontSize: '0.7rem', color: 'rgba(0,230,118,0.6)', fontWeight: 700 }}>{s.count} активни карти</div>
                                                            </div>
                                                            <div style={{ position: 'relative', zIndex: 1, textAlign: 'right', fontWeight: 900, color: '#00e676', fontSize: '1.15rem' }}>
                                                                {s.revenue.toFixed(2)} €
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </Card>
                                    </div>

                                    {/* Suspicious Activity */}
                                    <div>
                                        <h2 style={{ fontSize: isMobile ? '1.1rem' : '1.4rem', fontWeight: 800, color: '#ff5252', display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
                                            <Shield size={20} /> КОНТРОЛ НА ЗЛОУПОТРЕБИ
                                        </h2>
                                        <Card style={{ padding: isMobile ? '1rem' : '2.5rem', background: 'rgba(255,82,82,0.02)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {suspiciousClients.length > 0 ? suspiciousClients.map(c => (
                                                    <div key={c.id} style={{ padding: '1rem', background: 'rgba(255,82,82,0.05)', borderRadius: '16px', border: '1px solid rgba(255,82,82,0.1)', position: 'relative' }}>
                                                        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>{c.name}</div>
                                                                <div style={{ color: '#ff5252', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>{c.abuseDays.length} дни с аномалии</div>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleClearAbuse(c.id)}
                                                                style={{ background: '#ff5252', color: '#fff', padding: '0.6rem 1.25rem', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 900, border: 'none', boxShadow: '0 4px 12px rgba(255,82,82,0.2)' }}
                                                            >
                                                                <Trash2 size={14} /> ИЗЧИСТИ
                                                            </button>
                                                        </div>
                                                        
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                                            {c.abuseDays.slice(0, 3).map(([date, scans], idx) => (
                                                                <div key={idx} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.5rem', opacity: 0.8 }}>{date}</div>
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                        {scans.map((ts, sIdx) => (
                                                                            <span key={sIdx} style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'rgba(255,82,82,0.15)', borderRadius: '6px', color: '#ff8a80', border: '1px solid rgba(255,82,82,0.1)' }}>
                                                                                {new Date(ts).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )) : <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.3, fontWeight: 700 }}>Няма засечени нарушения към момента.</div>}
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
                <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease' }}>
                    <Card style={{ padding: isMobile ? '1.25rem' : '2rem' }}>
                        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: isMobile ? '1.2rem' : '1.5rem' }}><UserPlus size={isMobile ? 20 : 24} color="var(--primary-color)" /> Добави Нов Персонал</h3>
                        <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Потребителско Име</label>
                                    <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Парола</label>
                                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none' }} />
                                </div>
                                {!isMobile && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Роля</label>
                                        <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: '#333', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none' }}>
                                            <option value="moderator">Модератор</option>
                                            <option value="admin">Администратор</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            
                            {isMobile && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Роля</label>
                                    <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: '#333', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none' }}>
                                        <option value="moderator">Модератор</option>
                                        <option value="admin">Администратор</option>
                                    </select>
                                </div>
                            )}

                            <button type="submit" disabled={userLoading} style={{ background: 'var(--primary-color)', color: '#fff', padding: '0.8rem', borderRadius: '10px', border: 'none', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', marginTop: '0.5rem' }}>{userLoading ? '...' : 'Добави Персонал'}</button>
                        </form>
                        {userMsg && <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '10px', background: userMsg.type === 'success' ? 'rgba(0, 200, 83, 0.1)' : 'rgba(255, 82, 82, 0.1)', color: userMsg.type === 'success' ? '#00c853' : '#ff5252', border: `1px solid ${userMsg.type === 'success' ? '#00c85333' : '#ff525233'}` }}>{userMsg.text}</div>}
                    </Card>

                    <Card style={{ padding: isMobile ? '1.25rem' : '2rem' }}>
                        <h3 style={{ marginBottom: '1.5rem', fontSize: isMobile ? '1.2rem' : '1.5rem' }}>Управление на Персонала</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {users.map(user => (
                                <div key={user.id} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.01)', borderRadius: '16px', border: '1px solid var(--surface-border)', gap: isMobile ? '1rem' : '0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: isMobile ? '100%' : 'auto' }}>
                                        <div style={{ width: isMobile ? '40px' : '45px', height: isMobile ? '40px' : '45px', borderRadius: '12px', background: ROLE_COLORS[user.role], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: isMobile ? '1rem' : '1.2rem', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>{user.username[0].toUpperCase()}</div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700, fontSize: isMobile ? '1rem' : '1.1rem' }}>{user.username}</div>
                                            <div style={{ fontSize: '0.75rem', color: ROLE_COLORS[user.role], fontWeight: 800 }}>{ROLE_LABELS[user.role]}</div>
                                        </div>
                                        {user.id === currentUser?.id && isMobile && <span style={{ fontSize: '0.6rem', padding: '0.25rem 0.6rem', borderRadius: '50px', background: 'rgba(0,173,181,0.1)', color: 'var(--primary-color)', fontWeight: 800 }}>АЗ</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                                        {user.id !== 'default-admin' && user.id !== currentUser?.id && (
                                            <>
                                                <select
                                                    value={user.role}
                                                    onChange={e => updateUserRole(user.id, e.target.value as UserRole)}
                                                    style={{ padding: '0.45rem 0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: 'white', fontSize: '0.8rem', flex: isMobile ? 1 : 'none' }}
                                                >
                                                    <option value="moderator">Модератор</option>
                                                    <option value="admin">Администратор</option>
                                                </select>
                                                <button onClick={() => window.confirm('Наистина ли искате да изтриете този потребител?') && deleteUser(user.id)} style={{ padding: '0.65rem', color: '#ff5252', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.2)', borderRadius: '8px', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                            </>
                                        )}
                                        {user.id === currentUser?.id && !isMobile && <span style={{ fontSize: '0.7rem', padding: '0.25rem 0.75rem', borderRadius: '50px', background: 'rgba(0,173,181,0.1)', color: 'var(--primary-color)', fontWeight: 800 }}>ВИЕ</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {/* Audit Tab */}
            {activeTab === 'audit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                            <Search size={18} style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.3 }} />
                            <input type="text" placeholder="Търсене в одит лога..." value={auditSearch} onChange={e => setAuditSearch(e.target.value)} style={{ width: '100%', padding: '0.9rem 1.5rem 0.9rem 3rem', borderRadius: '50px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none' }} />
                        </div>
                    </div>
                    <Card style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                        {!isMobile ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                                    <thead style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--surface-border)' }}>
                                        <tr>
                                            <th style={{ padding: '1.25rem' }}>Време</th>
                                            <th style={{ padding: '1.25rem' }}>Изпълнител</th>
                                            <th style={{ padding: '1.25rem' }}>Действие</th>
                                            <th style={{ padding: '1.25rem' }}>Обект</th>
                                            <th style={{ padding: '1.25rem' }}>Детайли</th>
                                            <th style={{ padding: '1.25rem', textAlign: 'right' }}>Сума</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLogs.slice(0, 100).map(log => (
                                            <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}>
                                                <td style={{ padding: '1.25rem', fontSize: '0.8rem', opacity: 0.5 }}>{new Date(log.timestamp).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                                <td style={{ padding: '1.25rem' }}><span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>{log.performedBy.split('@')[0]}</span></td>
                                                <td style={{ padding: '1.25rem' }}><span style={{ fontWeight: 900, fontSize: '0.85rem', color: getActionColor(log.action) }}>{log.action}</span></td>
                                                <td style={{ padding: '1.25rem', fontWeight: 600 }}>{log.targetName}</td>
                                                <td style={{ padding: '1.25rem', fontSize: '0.85rem', opacity: 0.7, maxWidth: '250px' }}>{log.details}</td>
                                                <td style={{ padding: '1.25rem', textAlign: 'right', fontWeight: 900, color: log.amount > 0 ? '#00e676' : log.amount < 0 ? '#ff5252' : '#fff' }}>{log.amount !== 0 ? `${log.amount} €` : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'rgba(255,255,255,0.05)' }}>
                                {filteredLogs.slice(0, 50).map(log => (
                                    <div key={log.id} style={{ padding: '1rem', background: '#1a1a1a', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>{new Date(log.timestamp).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                            <span style={{ fontWeight: 900, fontSize: '0.75rem', color: getActionColor(log.action), background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>{log.action}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{log.targetName}</div>
                                                <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '2px' }}>{log.details}</div>
                                            </div>
                                            {log.amount !== 0 && (
                                                <div style={{ fontWeight: 900, color: log.amount > 0 ? '#00e676' : '#ff5252', fontSize: '1.1rem' }}>{log.amount} €</div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.6rem' }}>
                                            <span style={{ opacity: 0.5 }}>Изпълнител:</span>
                                            <span style={{ fontWeight: 600 }}>{log.performedBy.split('@')[0]}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
};

// --- Sub-components ---
interface TabButtonProps {
    id: string;
    icon: React.ElementType;
    label: string;
    active: boolean;
    onClick: () => void;
    color: string;
    isMobile?: boolean;
}

const TabButton = ({ icon: Icon, label, active, onClick, color, isMobile }: TabButtonProps) => (
    <button
        onClick={onClick}
        style={{
            display: 'flex', alignItems: 'center', gap: isMobile ? '0.4rem' : '0.75rem', padding: isMobile ? '0.7rem 1rem' : '1rem 1.75rem', borderRadius: '16px',
            background: active ? color : 'rgba(255,255,255,0.02)',
            color: active ? '#fff' : 'rgba(255,255,255,0.4)',
            border: `1px solid ${active ? color : 'var(--surface-border)'}`,
            fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s ease',
            whiteSpace: 'nowrap', fontSize: isMobile ? '0.8rem' : '1rem',
            boxShadow: active ? `0 8px 20px -5px ${color}66` : 'none'
        }}
    >
        <Icon size={isMobile ? 16 : 20} /> {label}
    </button>
);

interface StatCardProps {
    icon: React.ElementType;
    label: string;
    value: string | number;
    color: string;
    isMobile?: boolean;
}

const StatCard = ({ icon: Icon, label, value, color, isMobile }: StatCardProps) => (
    <Card style={{ padding: isMobile ? '0.75rem' : '1.5rem', display: 'flex', flexDirection: 'column', gap: isMobile ? '0.1rem' : '0.4rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: color }}></div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: isMobile ? '0.6rem' : '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.1rem' }}>
            {label}
        </div>
        <div style={{ 
            fontSize: isMobile ? '1.1rem' : '2.25rem', 
            fontWeight: 900, 
            color: '#fff', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
        }}>{value}</div>
        <div style={{ position: 'absolute', right: isMobile ? '-10px' : '-20px', bottom: isMobile ? '-10px' : '-20px', opacity: 0.05 }}>
            <Icon size={isMobile ? 40 : 80} color={color} />
        </div>
    </Card>
);

export default SystemAdminPanel;
