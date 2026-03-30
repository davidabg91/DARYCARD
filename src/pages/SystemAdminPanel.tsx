import React, { useState, useEffect } from 'react';
import { 
    BarChart, Users as UsersIcon, History as HistoryIcon, 
    TrendingUp, DollarSign, 
    RefreshCw, Search, Clock, Shield,
    UserPlus, Trash2
} from 'lucide-react';
import { collection, query, onSnapshot } from 'firebase/firestore';
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
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem', animation: 'fadeIn 0.4s ease' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', color: '#ff5252' }}>
                <Shield size={40} /> АДМИН ПАНЕЛ
            </h1>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                <TabButton id="dashboard" icon={BarChart} label="ТАБЛО" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} color="#ff5252" />
                <TabButton id="users" icon={UsersIcon} label="ПОТРЕБИТЕЛИ" active={activeTab === 'users'} onClick={() => setActiveTab('users')} color="#ff5252" />
                <TabButton id="audit" icon={HistoryIcon} label="ОДИТ" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} color="#ff5252" />
            </div>

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease' }}>
                    {/* Month Selector */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <TrendingUp color="#ff5252" />
                            <select 
                                value={statsMonth} 
                                onChange={(e) => setStatsMonth(e.target.value)}
                                style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid var(--surface-border)', padding: '0.6rem 1rem', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, outline: 'none' }}
                            >
                                {Array.from(new Set([todayIso.slice(0, 7), ...clients.flatMap(c => (c.renewalHistory || []).map(r => r.month))])).sort().reverse().map(m => (
                                    <option key={m} value={m} style={{ background: '#222' }}>{m}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                        <StatCard icon={DollarSign} label="Обороти" value={`${totalRevenue.toFixed(2)} €`} color="#00e676" />
                        <StatCard icon={UsersIcon} label="Активни Карти" value={activeClientsCount} color="var(--primary-color)" />
                        <StatCard icon={Percent} label="Степен на Плащане" value={`${paymentRate}%`} color="#ffab00" />
                        <StatCard icon={RefreshCw} label="Средно на Карта" value={`${avgProfit} €`} color="#e91e63" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem' }}>
                        {/* Daily Stats & Bar Chart */}
                        <Card>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Clock size={20} /> Активност на Линиите
                                </h3>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <input 
                                        type="date" 
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid var(--surface-border)', padding: '0.5rem', borderRadius: '8px', fontSize: '0.85rem' }}
                                    />
                                    <select 
                                        value={chartRoute} 
                                        onChange={(e) => setChartRoute(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid var(--surface-border)', padding: '0.5rem', borderRadius: '8px', fontSize: '0.85rem' }}
                                    >
                                        <option value="all_routes">Всички Линии</option>
                                        {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            {/* Hourly distribution simplified visual */}
                            <div style={{ height: '220px', display: 'flex', alignItems: 'flex-end', gap: '4px', padding: '1rem 0' }}>
                                {hourlyDistribution.map((count, hr) => (
                                    <div key={hr} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '8px', height: '100%', position: 'relative' }}>
                                        {count > 0 && <span style={{ position: 'absolute', top: '-18px', width: '100%', textAlign: 'center', fontSize: '0.6rem', color: hr === peakHour ? '#ff5252' : 'var(--primary-color)' }}>{count}</span>}
                                        <div style={{ width: '100%', height: `${(count/maxScans)*100}%`, background: hr === peakHour ? '#ff5252' : 'var(--primary-color)', opacity: count > 0 ? 1 : 0.1, borderRadius: '4px', minHeight: count > 0 ? '4px' : '2px' }}></div>
                                        <span style={{ fontSize: '0.6rem', textAlign: 'center', opacity: hr % 4 === 0 ? 0.8 : 0.3 }}>{hr}:00</span>
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--surface-border)', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ОБОРОТ (ДЕН)</div>
                                    <div style={{ fontWeight: 800, color: '#ff9800', fontSize: '1.2rem' }}>{revenueSelectedDay.toFixed(2)} €</div>
                                </div>
                                <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--surface-border)', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>НОВИ КАРТИ</div>
                                    <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{registrationsSelectedDay}</div>
                                </div>
                            </div>
                        </Card>

                        {/* Top Users */}
                        <Card>
                            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)' }}>
                                <RefreshCw size={20} /> Най-активни Пътници (Общо)
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {topScannedClients.length > 0 ? topScannedClients.map((c, i) => (
                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid var(--surface-border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: i < 3 ? ['gold', 'silver', '#cd7f32'][i] : 'rgba(255,255,255,0.1)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 900 }}>{i + 1}</div>
                                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontWeight: 900, color: 'var(--primary-color)', fontSize: '1.1rem' }}>{c.scanCount}</div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>пътувания</div>
                                        </div>
                                    </div>
                                )) : <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.3 }}>Няма данни.</div>}
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
                <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem', animation: 'fadeIn 0.3s ease' }}>
                    <Card>
                        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><UserPlus size={20} color="var(--primary-color)" /> Добави Нов Персонал</h3>
                        <form onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', alignItems: 'flex-end' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Потребителско Име</label>
                                <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Парола</label>
                                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Роля</label>
                                <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: '#333', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none' }}>
                                    <option value="moderator">Модератор</option>
                                    <option value="admin">Администратор</option>
                                </select>
                            </div>
                            <button type="submit" disabled={userLoading} style={{ background: 'var(--primary-color)', color: '#fff', padding: '0.8rem', borderRadius: '10px', border: 'none', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>{userLoading ? '...' : 'Добави Персонал'}</button>
                        </form>
                        {userMsg && <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '10px', background: userMsg.type === 'success' ? 'rgba(0, 200, 83, 0.1)' : 'rgba(255, 82, 82, 0.1)', color: userMsg.type === 'success' ? '#00c853' : '#ff5252', border: `1px solid ${userMsg.type === 'success' ? '#00c85333' : '#ff525233'}` }}>{userMsg.text}</div>}
                    </Card>

                    <Card>
                        <h3 style={{ marginBottom: '1.5rem' }}>Управление на Персонала</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {users.map(user => (
                                <div key={user.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.01)', borderRadius: '16px', border: '1px solid var(--surface-border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ width: '45px', height: '45px', borderRadius: '12px', background: ROLE_COLORS[user.role], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.2rem', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>{user.username[0].toUpperCase()}</div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{user.username}</div>
                                            <div style={{ fontSize: '0.75rem', color: ROLE_COLORS[user.role], fontWeight: 800 }}>{ROLE_LABELS[user.role]}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        {user.id !== 'default-admin' && user.id !== currentUser?.id && (
                                            <>
                                                <select
                                                    value={user.role}
                                                    onChange={e => updateUserRole(user.id, e.target.value as UserRole)}
                                                    style={{ padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: 'white', fontSize: '0.8rem' }}
                                                >
                                                    <option value="moderator">Модератор</option>
                                                    <option value="admin">Администратор</option>
                                                </select>
                                                <button onClick={() => window.confirm('Наистина ли искате да изтриете този потребител?') && deleteUser(user.id)} style={{ padding: '0.6rem', color: '#ff5252', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.2)', borderRadius: '8px', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                            </>
                                        )}
                                        {user.id === currentUser?.id && <span style={{ fontSize: '0.7rem', padding: '0.25rem 0.75rem', borderRadius: '50px', background: 'rgba(0,173,181,0.1)', color: 'var(--primary-color)', fontWeight: 800 }}>ВИЕ</span>}
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
                                            <td style={{ padding: '1.25rem' }}><span style={{ fontWeight: 900, fontSize: '0.85rem', color: log.action === 'Създаване' ? '#00e676' : log.action === 'Изтриване' ? '#ff5252' : '#ffab00' }}>{log.action}</span></td>
                                            <td style={{ padding: '1.25rem', fontWeight: 600 }}>{log.targetName}</td>
                                            <td style={{ padding: '1.25rem', fontSize: '0.85rem', opacity: 0.7, maxWidth: '250px' }}>{log.details}</td>
                                            <td style={{ padding: '1.25rem', textAlign: 'right', fontWeight: 900, color: log.amount > 0 ? '#00e676' : log.amount < 0 ? '#ff5252' : '#fff' }}>{log.amount !== 0 ? `${log.amount} €` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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
}

const TabButton = ({ icon: Icon, label, active, onClick, color }: TabButtonProps) => (
    <button
        onClick={onClick}
        style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.75rem', borderRadius: '16px',
            background: active ? color : 'rgba(255,255,255,0.02)',
            color: active ? '#fff' : 'rgba(255,255,255,0.4)',
            border: `1px solid ${active ? color : 'var(--surface-border)'}`,
            fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s ease',
            whiteSpace: 'nowrap', fontSize: '1rem',
            boxShadow: active ? `0 8px 20px -5px ${color}66` : 'none'
        }}
    >
        <Icon size={20} /> {label}
    </button>
);

interface StatCardProps {
    icon: React.ElementType;
    label: string;
    value: string | number;
    color: string;
}

const StatCard = ({ icon: Icon, label, value, color }: StatCardProps) => (
    <Card style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: color }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
            <Icon size={16} color={color} /> {label}
        </div>
        <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#fff' }}>{value}</div>
    </Card>
);

export default SystemAdminPanel;
