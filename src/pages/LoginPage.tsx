import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

const LoginPage: React.FC = () => {
    const { login, addUser } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSignup, setIsSignup] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        setLoading(true);

        try {
            if (isSignup) {
                await addUser(username.trim(), password, 'admin');
                setMessage({ text: 'Профилът е създаден успешно! Сега влезете.', type: 'success' });
                setIsSignup(false);
            } else {
                await login(username.trim(), password);
                navigate('/admin');
            }
        } catch (err: unknown) {
            console.error(err);
            const error = err as { code?: string };
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setError('Грешно потребителско име или парола.');
            } else if (error.code === 'auth/email-already-in-use') {
                setError('Този потребител вече съществува.');
            } else if (error.code === 'auth/weak-password') {
                setError('Паролата трябва да е поне 6 символа.');
            } else {
                setError('Възникна грешка. Моля, опитайте пак.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', padding: '1rem', color: '#fff' }}>
            <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
                <div style={{ marginBottom: '2.5rem' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <img src={logo} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--primary-color)' }}>DARY CARD</div>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>SYSTEM</div>
                        </div>
                    </div>
                </div>

                <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', fontWeight: 800 }}>
                    {isSignup ? 'Нов Администратор' : 'Добре дошли'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                    {isSignup ? 'Създайте първия си облачен акаунт' : 'Влезте в системния панел'}
                </p>

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

                    {message && (
                        <div style={{ padding: '0.75rem', background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.2)', borderRadius: '8px', color: '#00c853', fontSize: '0.85rem' }}>
                            {message.text}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        style={{ width: '100%', padding: '1rem', borderRadius: '12px', background: 'var(--primary-color)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', marginTop: '0.5rem', boxShadow: '0 4px 15px rgba(0, 173, 181, 0.3)' }}
                    >
                        {loading ? 'Зареждане...' : isSignup ? 'Регистрирай' : 'Вход'}
                    </button>

                    <button
                        type="button"
                        onClick={() => { setIsSignup(!isSignup); setError(null); setMessage(null); }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        {isSignup ? 'Вече имате акаунт? Вход' : 'Нямате акаунт? Създайте първия админ'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;
