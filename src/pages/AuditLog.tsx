import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { History as HistoryIcon, Clock, Search } from 'lucide-react';

interface GlobalLog {
    id: string;
    timestamp: string;
    performedBy: string;
    action: string;
    targetName: string;
    details: string;
    amount: number;
}

const AuditLog: React.FC = () => {
    const [globalLogs, setGlobalLogs] = useState<GlobalLog[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'activity_logs'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs: GlobalLog[] = [];
            snapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() } as GlobalLog));
            // Sort by timestamp descending
            setGlobalLogs(logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const filteredLogs = globalLogs.filter(log => 
        log.performedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.targetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', animation: 'fadeIn 0.4s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '2.25rem', fontWeight: 900, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <HistoryIcon size={32} color="var(--primary-color)" /> Глобален Одит
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Лог на всички административни действия в системата</p>
                </div>
                
                <div style={{ position: 'relative', width: '100%', maxWidth: '350px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input 
                        type="text" 
                        placeholder="Търсене в лога..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '0.8rem 1rem 0.8rem 2.75rem', borderRadius: '50px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', fontSize: '0.9rem' }}
                    />
                </div>
            </div>

            <style>{`
                .audit-table-container { 
                    background: rgba(0,0,0,0.2); 
                    border-radius: 16px; 
                    border: 1px solid var(--surface-border); 
                    overflow: hidden; 
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                .audit-mobile-cards { display: none; flex-direction: column; gap: 1rem; }
                
                @media (max-width: 850px) {
                    .audit-desktop-table { display: none; }
                    .audit-mobile-cards { display: flex; }
                }

                .audit-card {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid var(--surface-border);
                    border-radius: 16px;
                    padding: 1.25rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    position: relative;
                    overflow: hidden;
                }
                .audit-card::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 4px;
                    background: var(--primary-color);
                    opacity: 0.5;
                }
                .audit-card.create::before { background: #00c853; }
                .audit-card.delete::before { background: #ff5252; }
                .audit-card.cancel::before { background: #ffab00; }
            `}</style>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-secondary)' }}>
                    <div style={{ animation: 'spin 2s linear infinite', marginBottom: '1.5rem', display: 'inline-block' }}>
                        <HistoryIcon size={40} opacity={0.3} />
                    </div>
                    <p>Зареждане на лога...</p>
                </div>
            ) : (
                <>
                    {/* Desktop View */}
                    <div className="audit-desktop-table">
                        <div className="audit-table-container">
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
                                    <tr>
                                        <th style={{ padding: '1.25rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Време</th>
                                        <th style={{ padding: '1.25rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Изпълнител</th>
                                        <th style={{ padding: '1.25rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Действие</th>
                                        <th style={{ padding: '1.25rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Обект</th>
                                        <th style={{ padding: '1.25rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Детайли</th>
                                        <th style={{ padding: '1.25rem', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', textAlign: 'right' }}>Сума</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLogs.length > 0 ? (
                                        filteredLogs.map((log) => (
                                            <tr key={log.id} style={{ borderBottom: '1px solid var(--surface-border)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                                    {new Date(log.timestamp).toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td style={{ padding: '1.25rem' }}>
                                                    <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', fontSize: '0.85rem', fontWeight: 600 }}>
                                                        {log.performedBy ? log.performedBy.split('@')[0] : 'Система'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1.25rem' }}>
                                                    <span style={{ 
                                                        fontSize: '0.85rem', fontWeight: 800,
                                                        color: log.action === 'Създаване' ? '#00c853' : 
                                                               log.action === 'Изтриване на клиент' ? '#ff5252' :
                                                               log.action === 'Анулиране' ? '#ffab00' : 'var(--primary-color)'
                                                    }}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1.25rem', fontWeight: 700, fontSize: '0.9rem' }}>{log.targetName}</td>
                                                <td style={{ padding: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '300px' }}>
                                                    {log.details}
                                                </td>
                                                <td style={{ padding: '1.25rem', textAlign: 'right', fontWeight: 800, color: log.amount > 0 ? '#00e676' : log.amount < 0 ? '#ff5252' : 'var(--text-primary)' }}>
                                                    {log.amount !== 0 ? `${log.amount} €` : '-'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-secondary)' }}>
                                                <HistoryIcon size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                                                <p>Няма намерени записи.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile View */}
                    <div className="audit-mobile-cards">
                        {filteredLogs.length > 0 ? (
                            filteredLogs.map((log) => (
                                <div key={log.id} className={`audit-card ${log.action === 'Създаване' ? 'create' : log.action === 'Изтриване на клиент' ? 'delete' : log.action === 'Анулиране' ? 'cancel' : ''}`}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Clock size={12} /> {new Date(log.timestamp).toLocaleString('bg-BG')}
                                        </span>
                                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', fontSize: '0.7rem' }}>
                                            {log.performedBy ? log.performedBy.split('@')[0] : 'Система'}
                                        </span>
                                    </div>
                                    
                                    <div>
                                        <div style={{ 
                                            fontSize: '0.85rem', fontWeight: 900, marginBottom: '0.2rem',
                                            color: log.action === 'Създаване' ? '#00c853' : 
                                                   log.action === 'Изтриване на клиент' ? '#ff5252' :
                                                   log.action === 'Анулиране' ? '#ffab00' : 'var(--primary-color)'
                                        }}>
                                            {log.action}
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{log.targetName}</div>
                                    </div>
                                    
                                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', lineHeight: '1.4' }}>
                                        {log.details}
                                    </div>
                                    
                                    {log.amount !== 0 && (
                                        <div style={{ 
                                            marginTop: '0.25rem', padding: '0.5rem', borderRadius: '8px', 
                                            background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                        }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Сума</span>
                                            <span style={{ fontWeight: 900, color: log.amount > 0 ? '#00e676' : '#ff5252' }}>{log.amount} €</span>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed var(--surface-border)' }}>
                                Няма записи.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default AuditLog;
