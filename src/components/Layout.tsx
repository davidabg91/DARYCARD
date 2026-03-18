import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import { useAuth } from '../context/AuthContext';
import { LogOut, ShieldCheck, Shield } from 'lucide-react';

const Layout: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const isAdminPath = location.pathname.startsWith('/admin');
    const { currentUser, logout } = useAuth();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <header style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: 'var(--bg-color)',
                padding: '0.6rem 2.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid rgba(229,57,53,0.35)',
                boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
            }}>
                <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', gap: '0', userSelect: 'none' }}>
                    {/* Logo in a small white pill so the JPEG bg blends cleanly */}
                    <div style={{
                        background: '#fff',
                        borderRadius: '10px',
                        padding: '4px 10px',
                        display: 'flex',
                        alignItems: 'center',
                    }}>
                        <img
                            src={logo}
                            alt="Dary Travel"
                            style={{
                                height: '46px',
                                width: 'auto',
                                objectFit: 'contain',
                                display: 'block',
                            }}
                        />
                    </div>
                    {/* CARD SYSTEM badge */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        marginLeft: '12px',
                        alignSelf: 'center',
                        borderLeft: '3px solid #e53935',
                        paddingLeft: '10px',
                        lineHeight: 1.2,
                    }}>
                        <span style={{
                            fontSize: '1.25rem',
                            fontWeight: 900,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: '#ff5252',
                        }}>CARD</span>
                        <span style={{
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            letterSpacing: '0.22em',
                            textTransform: 'uppercase',
                            color: 'var(--text-secondary)',
                        }}>SYSTEM</span>
                    </div>
                </Link>

                <nav style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                    <Link
                        to="/"
                        style={{
                            color: location.pathname === '/' ? '#ff5252' : 'var(--text-secondary)',
                            fontWeight: 600, fontSize: '0.9rem', transition: 'color 0.2s',
                            borderBottom: location.pathname === '/' ? '2px solid #ff5252' : '2px solid transparent',
                            paddingBottom: '2px',
                        }}
                    >Начало</Link>

                    {currentUser && (
                        <>
                            <Link
                                to="/admin"
                                style={{
                                    color: isAdminPath && location.pathname === '/admin' ? '#ff5252' : 'var(--text-secondary)',
                                    fontWeight: 600, fontSize: '0.9rem', transition: 'color 0.2s',
                                    borderBottom: isAdminPath && location.pathname === '/admin' ? '2px solid #ff5252' : '2px solid transparent',
                                    paddingBottom: '2px',
                                }}
                            >Карти</Link>

                            {currentUser.role === 'admin' && (
                                <Link
                                    to="/admin/users"
                                    style={{
                                        color: location.pathname === '/admin/users' ? '#ff5252' : 'var(--text-secondary)',
                                        fontWeight: 600, fontSize: '0.9rem', transition: 'color 0.2s',
                                        borderBottom: location.pathname === '/admin/users' ? '2px solid #ff5252' : '2px solid transparent',
                                        paddingBottom: '2px',
                                    }}
                                >Потребители</Link>
                            )}

                            {/* User chip */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.3rem 0.75rem', borderRadius: '50px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid var(--surface-border)',
                                fontSize: '0.82rem',
                            }}>
                                {currentUser.role === 'admin'
                                    ? <ShieldCheck size={14} color="#ff5252" />
                                    : <Shield size={14} color="var(--primary-color)" />}
                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentUser.username}</span>
                            </div>

                            <button
                                onClick={handleLogout}
                                title="Изход"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    padding: '0.35rem 0.85rem', borderRadius: '8px',
                                    background: 'rgba(229,57,53,0.12)', color: '#ff5252',
                                    border: '1px solid rgba(229,57,53,0.3)', fontWeight: 600,
                                    fontSize: '0.82rem', cursor: 'pointer', transition: 'background 0.2s',
                                }}
                            >
                                <LogOut size={14} /> Изход
                            </button>
                        </>
                    )}

                    {!currentUser && (
                        <Link
                            to="/login"
                            style={{
                                padding: '0.35rem 1rem', borderRadius: '8px',
                                background: '#e53935', color: '#fff',
                                fontWeight: 600, fontSize: '0.85rem',
                            }}
                        >Вход</Link>
                    )}
                </nav>
            </header>

            <main style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.4s ease' }}>
                <Outlet />
            </main>

            <footer style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                borderTop: '1px solid var(--surface-border)',
                fontSize: '0.875rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
            }}>
                <a 
                    href="https://davidax-elite-it-solutions-898715197082.us-west1.run.app/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ 
                        textDecoration: 'none', 
                        color: 'inherit', 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.6rem 1.25rem',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(10px)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.borderColor = 'rgba(255,82,82,0.3)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(229,57,53,0.15)';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }}
                >
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #e53935 0%, #ff5252 100%)',
                        color: '#fff',
                        boxShadow: '0 0 15px rgba(229,57,53,0.3)',
                    }}>
                        <ShieldCheck size={18} strokeWidth={2.5} />
                    </div>
                    <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ 
                            fontSize: '0.6rem', 
                            opacity: 0.5, 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.15em',
                            fontWeight: 700,
                            marginBottom: '-2px'
                        }}>Developed by</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ 
                                fontWeight: 900, 
                                fontSize: '1.1rem', 
                                letterSpacing: '0.02em', 
                                color: 'var(--text-primary)',
                                textShadow: '0 0 20px rgba(255,255,255,0.1)'
                            }}>DavidaX</span>
                            <span style={{ 
                                fontSize: '0.7rem', 
                                color: '#ff5252',
                                fontWeight: 800,
                                opacity: 0.9
                            }}>&lt;/&gt;</span>
                        </div>
                    </div>
                </a>
                <p>© {new Date().getFullYear()} Dary Commerce. Всички права запазени.</p>
                <p style={{ opacity: 0.6 }}>Обществен транспорт за град Плевен и региона</p>
            </footer>
        </div>
    );
};

export default Layout;
