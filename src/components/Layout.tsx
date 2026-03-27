import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo_main.png';
import { useAuth } from '../context/AuthContext';
import { LogOut, ShieldCheck, Shield, Menu, X } from 'lucide-react';

const Layout: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const isAdminPath = location.pathname.startsWith('/admin');
    const isClientProfilePath = location.pathname.startsWith('/client/');
    const { currentUser, logout } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
        setIsMenuOpen(false);
    };

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

    const navLinks = (
        <>
            <Link
                to="/"
                onClick={closeMenu}
                style={{
                    color: location.pathname === '/' ? '#ff5252' : '#fff',
                    fontWeight: 600, fontSize: '0.95rem', transition: 'color 0.2s',
                    borderBottom: location.pathname === '/' ? '2px solid #ff5252' : '2px solid transparent',
                    paddingBottom: '2px',
                    display: 'flex',
                    alignItems: 'center'
                }}
            >Начало</Link>

            {currentUser && (
                <>
                    <Link
                        to="/admin"
                        onClick={closeMenu}
                        style={{
                            color: isAdminPath && location.pathname === '/admin' ? '#ff5252' : '#fff',
                            fontWeight: 600, fontSize: '0.95rem', transition: 'color 0.2s',
                            borderBottom: isAdminPath && location.pathname === '/admin' ? '2px solid #ff5252' : '2px solid transparent',
                            paddingBottom: '2px',
                        }}
                    >Карти</Link>

                        <>
                            <Link
                                to="/admin/users"
                                onClick={closeMenu}
                                style={{
                                    color: location.pathname === '/admin/users' ? '#ff5252' : '#fff',
                                    fontWeight: 600, fontSize: '0.95rem', transition: 'color 0.2s',
                                    borderBottom: location.pathname === '/admin/users' ? '2px solid #ff5252' : '2px solid transparent',
                                    paddingBottom: '2px',
                                }}
                            >Потребители</Link>
                            <Link
                                to="/admin/audit"
                                onClick={closeMenu}
                                style={{
                                    color: location.pathname === '/admin/audit' ? '#ff5252' : '#fff',
                                    fontWeight: 600, fontSize: '0.95rem', transition: 'color 0.2s',
                                    borderBottom: location.pathname === '/admin/audit' ? '2px solid #ff5252' : '2px solid transparent',
                                    paddingBottom: '2px',
                                }}
                            >Одит</Link>
                        </>

                    <Link
                        to="/help"
                        onClick={closeMenu}
                        style={{
                            color: location.pathname === '/help' ? '#ff5252' : '#fff',
                            fontWeight: 600, fontSize: '0.95rem', transition: 'color 0.2s',
                            borderBottom: location.pathname === '/help' ? '2px solid #ff5252' : '2px solid transparent',
                            paddingBottom: '2px',
                        }}
                    >Помощ</Link>

                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 0.8rem', borderRadius: '50px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--surface-border)',
                        fontSize: '0.85rem',
                    }}>
                        {currentUser.role === 'admin'
                            ? <ShieldCheck size={16} color="#ff5252" />
                            : <Shield size={16} color="var(--primary-color)" />}
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentUser.username}</span>
                    </div>

                    <button
                        onClick={handleLogout}
                        title="Изход"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 1rem', borderRadius: '10px',
                            background: 'rgba(229,57,53,0.12)', color: '#ff5252',
                            border: '1px solid rgba(229,57,53,0.3)', fontWeight: 600,
                            fontSize: '0.9rem', cursor: 'pointer', transition: 'background 0.2s',
                            width: 'fit-content'
                        }}
                    >
                        <LogOut size={16} /> Изход
                    </button>
                </>
            )}

            {!currentUser && (
                <Link
                    to="/login"
                    onClick={closeMenu}
                    style={{
                        padding: '0.5rem 1.5rem', borderRadius: '10px',
                        background: '#e53935', color: '#fff',
                        fontWeight: 700, fontSize: '0.9rem',
                        textAlign: 'center',
                        boxShadow: '0 4px 12px rgba(229,57,53,0.3)'
                    }}
                >Вход</Link>
            )}
        </>
    );

    const mobileNavLinks = (
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Link to="/" onClick={closeMenu} className="mobile-nav-link">Начало</Link>
            {currentUser && (
                <>
                    <Link to="/admin" onClick={closeMenu} className="mobile-nav-link">Карти</Link>
                    {currentUser.role === 'admin' && (
                        <>
                            <Link to="/admin/users" onClick={closeMenu} className="mobile-nav-link">Потребители</Link>
                            <Link to="/admin/audit" onClick={closeMenu} className="mobile-nav-link">Одит</Link>
                        </>
                    )}
                    <Link to="/help" onClick={closeMenu} className="mobile-nav-link">Помощ</Link>
                    <div style={{ padding: '0.8rem 1.2rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                        {currentUser.role === 'admin' ? <ShieldCheck size={18} color="#ff5252" /> : <Shield size={18} color="var(--primary-color)" />}
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{currentUser.username}</span>
                    </div>
                    <button onClick={handleLogout} className="mobile-nav-link" style={{ color: '#ff5252', background: 'rgba(229,57,53,0.1)', border: '1px solid rgba(229,57,53,0.2)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <LogOut size={18} /> Изход
                    </button>
                </>
            )}
            {!currentUser && (
                <Link to="/login" onClick={closeMenu} className="mobile-nav-link" style={{ background: '#e53935', color: '#fff', textAlign: 'center', marginTop: '1rem', border: 'none' }}>Вход</Link>
            )}
        </nav>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
            <header className="main-header" style={{
                position: 'sticky',
                top: 0,
                zIndex: 1000,
                background: 'rgba(26, 26, 26, 0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                padding: '0.6rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}>
                <Link to="/" onClick={closeMenu} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', gap: '0', userSelect: 'none' }}>
                    <div style={{
                        padding: '2px 4px',
                        display: 'flex',
                        alignItems: 'center',
                    }}>
                        <img
                            src={logo}
                            alt="Dary Travel"
                            style={{
                                height: '64px',
                                width: 'auto',
                                objectFit: 'contain',
                                display: 'block',
                            }}
                        />
                    </div>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        marginLeft: '10px',
                        alignSelf: 'center',
                        borderLeft: '2px solid #e53935',
                        paddingLeft: '8px',
                        lineHeight: 1.1,
                    }}>
                        <span style={{
                            fontSize: '1.1rem',
                            fontWeight: 900,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            color: location.pathname === '/' ? 'var(--primary-color)' : '#ff5252',
                        }}>{location.pathname === '/' ? 'TRANSPORT' : 'CARD'}</span>
                        <span style={{
                            fontSize: '0.55rem',
                            fontWeight: 700,
                            letterSpacing: '0.15em',
                            textTransform: 'uppercase',
                            color: '#fff',
                            opacity: 0.8
                        }}>SYSTEM</span>
                    </div>
                </Link>

                {/* Desktop Nav */}
                <nav className="desktop-nav" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    {navLinks}
                </nav>

                {/* Mobile Menu Toggle */}
                <button 
                    className="mobile-toggle"
                    onClick={toggleMenu}
                    style={{
                        padding: '8px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        display: 'none', // Hidden by default, shown via CSS media query
                    }}
                >
                    {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                {/* Mobile Menu Overlay */}
                <div 
                    className={`mobile-menu ${isMenuOpen ? 'open' : ''}`}
                    style={{
                        position: 'fixed',
                        top: '64px',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 'calc(100dvh - 64px)',
                        background: 'rgba(26, 26, 26, 0.99)',
                        backdropFilter: 'blur(15px)',
                        padding: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 999,
                        transform: isMenuOpen ? 'translateX(0)' : 'translateX(100%)',
                        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        opacity: isMenuOpen ? 1 : 0,
                        visibility: isMenuOpen ? 'visible' : 'hidden',
                        overflowY: 'auto'
                    }}
                >
                    {mobileNavLinks}
                </div>
            </header>

            <main 
                className={isClientProfilePath ? 'full-screen-main' : ''}
                style={{ 
                    flex: 1, 
                    padding: isClientProfilePath ? '0' : '2rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    animation: 'fadeIn 0.4s ease' 
                }}
            >
                <Outlet />
            </main>

            <footer style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.5)',
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
