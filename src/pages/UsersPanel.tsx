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

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 3000);
    };

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername.trim() || !newPassword.trim()) return;
        const ok = addUser(newUsername.trim(), newPassword, newRole);
        if (ok) {
            showMsg(`Потребител "${newUsername}" е създаден.`, 'success');
            setNewUsername(''); setNewPassword('');
        } else {
            showMsg('Потребителското име вече съществува.', 'error');
        }
    };

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <h2 style={{ fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={24} color="#ff5252" /> Управление на Потребители
            </h2>

            {/* Add user form */}
            <Card>
                <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserPlus size={20} color="var(--primary-color)" /> Нов Потребител
                </h3>
                <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Потребителско Име</label>
                        <input
                            type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required
                            style={{ width: '100%', padding: '0.7rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: 'white', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Парола</label>
                        <input
                            type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required
                            style={{ width: '100%', padding: '0.7rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: 'white', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Роля</label>
                        <select
                            value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}
                            style={{ padding: '0.7rem', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: 'white', cursor: 'pointer' }}
                        >
                            <option value="moderator">Модератор</option>
                            <option value="admin">Администратор</option>
                        </select>
                    </div>
                    <button type="submit" style={{ padding: '0.7rem 1.5rem', background: 'var(--primary-color)', color: '#fff', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Добави
                    </button>
                </form>
                {message && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', background: message.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)', color: message.type === 'success' ? 'var(--success-color)' : 'var(--error-color)', fontSize: '0.875rem' }}>
                        {message.text}
                    </div>
                )}
            </Card>

            {/* Users list */}
            <Card>
                <h3 style={{ marginBottom: '1.25rem' }}>Съществуващи Потребители</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {users.map(user => (
                        <div key={user.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.9rem 1.25rem', borderRadius: '10px',
                            background: 'rgba(255,255,255,0.04)',
                            border: `1px solid ${user.id === currentUser?.id ? 'rgba(0,173,181,0.4)' : 'var(--surface-border)'}`,
                            flexWrap: 'wrap', gap: '0.75rem',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: '38px', height: '38px', borderRadius: '50%',
                                    background: ROLE_COLORS[user.role],
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontWeight: 700, fontSize: '1rem',
                                }}>{user.username[0].toUpperCase()}</div>
                                <div>
                                    <div style={{ fontWeight: 600 }}>
                                        {user.username}
                                        {user.id === currentUser?.id && (
                                            <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: 'rgba(0,173,181,0.2)', color: 'var(--primary-color)', padding: '2px 8px', borderRadius: '50px' }}>Вие</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        {new Date(user.createdAt).toLocaleDateString('bg-BG')}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{
                                    padding: '0.25rem 0.75rem', borderRadius: '50px', fontSize: '0.8rem',
                                    background: `${ROLE_COLORS[user.role]}22`, color: ROLE_COLORS[user.role],
                                    fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem',
                                }}>
                                    {user.role === 'admin' ? <ShieldCheck size={14} /> : <Shield size={14} />}
                                    {ROLE_LABELS[user.role]}
                                </span>

                                {/* Change role — admins only, can't change their own role or the default admin */}
                                {currentUser?.role === 'admin' && user.id !== 'default-admin' && user.id !== currentUser?.id && (
                                    <select
                                        value={user.role}
                                        onChange={e => updateUserRole(user.id, e.target.value as UserRole)}
                                        style={{ padding: '0.3rem 0.5rem', background: 'var(--bg-color)', border: '1px solid var(--surface-border)', borderRadius: '6px', color: 'white', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >
                                        <option value="moderator">Модератор</option>
                                        <option value="admin">Администратор</option>
                                    </select>
                                )}

                                {currentUser?.role === 'admin' && user.id !== 'default-admin' && user.id !== currentUser?.id && (
                                    <button
                                        onClick={() => {
                                            if (window.confirm(`Сигурни ли сте, че искате да изтриете потребител "${user.username}"?`)) {
                                                deleteUser(user.id);
                                                showMsg(`Потребител "${user.username}" е изтрит.`, 'success');
                                            }
                                        }}
                                        style={{ padding: '0.3rem', color: 'var(--error-color)', borderRadius: '6px', display: 'flex', alignItems: 'center', opacity: 0.8, cursor: 'pointer' }}
                                        title="Изтрий потребител"
                                    >
                                        <Trash2 size={16} />
                                    </button>
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
