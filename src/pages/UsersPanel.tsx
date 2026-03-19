import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/auth';
import { UserPlus, Trash2, Shield, ShieldCheck } from 'lucide-react';
import Card from '../components/Card';

const ROLE_LABELS: Record<UserRole, string> = {
    admin: 'Администратор',
    moderator: 'Модератор',
};

const ROLE_COLORS: Record<UserRole, string> = {
    admin: '#ff5252',
    moderator: '#00ADB5',
};

const UsersPanel: React.FC = () => {
    const { users, currentUser, addUser, updateUserRole, deleteUser } = useAuth();
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('moderator');
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const [loading, setLoading] = useState(false);

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 3000);
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername.trim() || !newPassword.trim()) return;
        setLoading(true);
        try {
            await addUser(newUsername.trim(), newPassword, newRole);
            showMsg(`Потребител "${newUsername}" е създаден.`, 'success');
            setNewUsername(''); setNewPassword('');
        } catch (err: unknown) {
            console.error(err);
            const error = err as { code?: string };
            if (error.code === 'auth/email-already-in-use') {
                showMsg('Потребителското име вече съществува.', 'error');
            } else {
                showMsg('Грешка при създаване на потребител.', 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', padding: '0 0.5rem' }}>
            <h2 style={{ fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Shield size={24} color="#ff5252" /> Управление на Потребители
            </h2>

            {/* Add user form */}
            <Card style={{ padding: '1.25rem' }}>
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserPlus size={20} color="var(--primary-color)" /> Нов Потребител
                </h3>
                <form onSubmit={handleAdd} style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                    gap: '1.25rem', 
                    alignItems: 'flex-end' 
                }}>
                    <div style={{ minWidth: 0 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Потребителско Име</label>
                        <input
                            type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required
                            placeholder="Име..."
                            style={{ width: '100%', padding: '0.8rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'white', boxSizing: 'border-box', outline: 'none', fontSize: '1rem' }}
                        />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Парола</label>
                        <input
                            type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required
                            placeholder="••••••••"
                            style={{ width: '100%', padding: '0.8rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'white', boxSizing: 'border-box', outline: 'none', fontSize: '1rem' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Роля</label>
                        <select
                            value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}
                            style={{ width: '100%', padding: '0.8rem 1rem', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'white', cursor: 'pointer', outline: 'none', fontSize: '1rem' }}
                        >
                            <option value="moderator">Модератор</option>
                            <option value="admin">Администратор</option>
                        </select>
                    </div>
                    <button type="submit" disabled={loading} style={{ 
                        padding: '0.8rem 1.5rem', 
                        background: loading ? 'rgba(0,173,181,0.5)' : 'var(--primary-color)', 
                        color: '#fff', 
                        borderRadius: '10px', 
                        fontWeight: 700, 
                        cursor: loading ? 'not-allowed' : 'pointer', 
                        whiteSpace: 'nowrap',
                        height: 'fit-content',
                        marginTop: '0.5rem',
                        border: 'none'
                    }}>
                        {loading ? 'Добавяне...' : 'Добави'}
                    </button>
                </form>
                {message && (
                    <div style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: '10px', background: message.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)', color: message.type === 'success' ? 'var(--success-color)' : 'var(--error-color)', fontSize: '0.9rem', fontWeight: 500, border: `1px solid ${message.type === 'success' ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)'}` }}>
                        {message.text}
                    </div>
                )}
            </Card>

            {/* Users list */}
            <Card style={{ padding: '1.25rem' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>Съществуващи Потребители</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {users.map(user => (
                        <div key={user.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '1rem 1.25rem', borderRadius: '14px',
                            background: 'rgba(255,255,255,0.03)',
                            border: `1px solid ${user.id === currentUser?.id ? 'rgba(0,173,181,0.3)' : 'rgba(255,255,255,0.08)'}`,
                            flexWrap: 'wrap', gap: '1rem',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1', minWidth: '180px' }}>
                                <div style={{
                                    width: '42px', height: '42px', borderRadius: '50%',
                                    background: ROLE_COLORS[user.role],
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontWeight: 800, fontSize: '1.1rem',
                                    boxShadow: `0 4px 12px ${ROLE_COLORS[user.role]}33`
                                }}>{user.username[0].toUpperCase()}</div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {user.username}
                                        {user.id === currentUser?.id && (
                                            <span style={{ fontSize: '0.7rem', background: 'rgba(0,173,181,0.15)', color: 'var(--primary-color)', padding: '2px 8px', borderRadius: '50px', letterSpacing: '0.02em' }}>ВИЕ</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                                        Регистриран на {new Date(user.createdAt).toLocaleDateString('bg-BG')}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1', minWidth: '220px' }}>
                                <span style={{
                                    padding: '0.4rem 0.8rem', borderRadius: '50px', fontSize: '0.85rem',
                                    background: `${ROLE_COLORS[user.role]}15`, color: ROLE_COLORS[user.role],
                                    fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    border: `1px solid ${ROLE_COLORS[user.role]}33`
                                }}>
                                    {user.role === 'admin' ? <ShieldCheck size={16} /> : <Shield size={16} />}
                                    {ROLE_LABELS[user.role]}
                                </span>

                                {/* Change role — admins only, can't change their own role or the default admin */}
                                {currentUser?.role === 'admin' && user.id !== 'default-admin' && user.id !== currentUser?.id && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <select
                                            value={user.role}
                                            onChange={e => updateUserRole(user.id, e.target.value as UserRole)}
                                            style={{ padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--surface-border)', borderRadius: '10px', color: 'white', fontSize: '0.85rem', cursor: 'pointer', outline: 'none' }}
                                        >
                                            <option value="moderator">Модератор</option>
                                            <option value="admin">Администратор</option>
                                        </select>
                                        
                                        <button
                                            onClick={() => {
                                                if (window.confirm(`Сигурни ли сте, че искате да изтриете потребител "${user.username}"?`)) {
                                                    deleteUser(user.id);
                                                    showMsg(`Потребител "${user.username}" е изтрит.`, 'success');
                                                }
                                            }}
                                            style={{ padding: '0.5rem', color: '#ff5252', borderRadius: '10px', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.2)', display: 'flex', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                                            title="Изтрий потребител"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

export default UsersPanel;
