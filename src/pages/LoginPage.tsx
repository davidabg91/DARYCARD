import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo_main.png';

const LoginPage: React.FC = () => {
    const { login, currentUser } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (currentUser) {
            navigate('/admin');
        }
    }, [currentUser, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await login(username.trim(), password);
            navigate('/admin');
        } catch (err: unknown) {
            console.error(err);
            const error = err as { code?: string };
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setError('Грешно потребителско име или парола.');
            } else {
                setError('Възникна грешка при вход. Моля, опитайте пак.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', padding: '1rem', color: '#fff' }}>
            <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                <div style={{ marginBottom: '2.5rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ padding: '6px 0', display: 'flex', alignItems: 'center' }}>
                            <img src={logo} alt="Logo" style={{ height: '50px', width: 'auto', objectFit: 'contain' }} />
                        </div>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#ff5252' }}>DARY CARD</div>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>SYSTEM</div>
                        </div>
                    </div>
                </div>

                <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', fontWeight: 800 }}>Добре дошли</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Влезте в системния панел</p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', marginLeft: '0.5rem' }}>Потребителско име</label>
                        <input
                            type="text"
                            placeholder="admin"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '1rem 1.25rem', 
                                borderRadius: '12px', 
                                background: 'rgba(255,255,255,0.05)', 
                                border: '1px solid var(--surface-border)', 
                                color: '#fff', 
                                outline: 'none',
                                fontSize: '1rem'
                            }}
                            required
                        />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', marginLeft: '0.5rem' }}>Парола</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '1rem 1.25rem', 
                                borderRadius: '12px', 
                                background: 'rgba(255,255,255,0.05)', 
                                border: '1px solid var(--surface-border)', 
                                color: '#fff', 
                                outline: 'none',
                                fontSize: '1rem'
                            }}
                            required
                        />
                    </div>

                    {error && (
                        <div style={{ padding: '0.75rem', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.2)', borderRadius: '8px', color: '#ff5252', fontSize: '0.85rem' }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'var(--primary-color)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '0.5rem', boxShadow: '0 4px 15px rgba(0, 173, 181, 0.3)' }}
                    >
                        {loading ? 'Зареждане...' : 'Вход'}
                    </button>
                    
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
                        Система за сигурност Dary Travel © 2026
                    </p>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;
