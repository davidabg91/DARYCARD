import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

const LoginPage: React.FC = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await login(username, password);
            navigate('/admin');
        } catch (err: unknown) {
            console.error(err);
            const error = err as { code?: string };
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setError('Грешно потребителско име или парола.');
            } else if (error.code === 'auth/invalid-email') {
                setError('Невалиден формат на потребителско име.');
            } else {
                setError('Възникна грешка при влизане. Моля, опитайте пак.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-color)',
            padding: '1rem',
        }}>
            <div style={{
                width: '100%',
                maxWidth: '400px',
                background: 'var(--surface-color)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--surface-border)',
                borderRadius: '20px',
                padding: '2.5rem 2rem',
                boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'flex-end',
                        gap: '10px',
                        justifyContent: 'center',
                    }}>
                        <div style={{ background: '#fff', borderRadius: '10px', padding: '4px 10px' }}>
                            <img src={logo} alt="Dary Travel" style={{ height: '44px', display: 'block' }} />
                        </div>
                        <div style={{
                            borderLeft: '3px solid #e53935',
                            paddingLeft: '10px',
                            lineHeight: 1.2,
                            alignSelf: 'center',
                        }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ff5252', letterSpacing: '0.1em' }}>CARD</div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>SYSTEM</div>
                        </div>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '1.25rem' }}>
                        Влезте в системата за управление на карти
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            Потребителско Име
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => { setUsername(e.target.value); setError(''); }}
                            required
                            autoFocus
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                background: 'rgba(0,0,0,0.25)',
                                border: '1px solid var(--surface-border)',
                                borderRadius: '10px',
                                color: 'var(--text-primary)',
                                fontSize: '0.95rem',
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            Парола
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(''); }}
                            required
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                background: 'rgba(0,0,0,0.25)',
                                border: '1px solid var(--surface-border)',
                                borderRadius: '10px',
                                color: 'var(--text-primary)',
                                fontSize: '0.95rem',
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    {error && (
                        <div style={{
                            padding: '0.75rem 1rem',
                            background: 'var(--error-bg)',
                            border: '1px solid var(--error-color)',
                            borderRadius: '8px',
                            color: 'var(--error-color)',
                            fontSize: '0.875rem',
                        }}>
                            <div>{error}</div>
                            <div style={{ marginTop: '0.4rem', opacity: 0.8, fontSize: '0.75rem' }}>
                                Опитайте: <b>admin</b> / <b>admin123</b>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            padding: '0.85rem',
                            background: loading ? 'rgba(229,57,53,0.5)' : '#e53935',
                            color: '#fff',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '1rem',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            border: 'none',
                            transition: 'background 0.2s',
                            marginTop: '0.25rem',
                        }}
                    >
                        {loading ? 'Влизане...' : 'Вход'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;
