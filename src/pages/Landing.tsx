import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, Users, BarChart3, Fingerprint } from 'lucide-react';

// Import assets
import heroImage from '../assets/hero_white_card.png';
import stepRegistration from '../assets/step_registration.png';
import stepScan from '../assets/step_scan.png';
import stepVerify from '../assets/step_verify.png';

const Landing: React.FC = () => {
    return (
        <div style={{ 
            minHeight: 'calc(100vh - 80px)', 
            display: 'flex', 
            flexDirection: 'column',
            fontFamily: 'var(--font-family)',
            animation: 'fadeIn 0.8s ease-out',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Background Nebula Orbs */}
            <div style={{
                position: 'absolute',
                top: '-10%',
                left: '-5%',
                width: '40vw',
                height: '40vw',
                background: 'radial-gradient(circle, rgba(0, 173, 181, 0.15) 0%, transparent 70%)',
                filter: 'blur(80px)',
                zIndex: 0,
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                top: '20%',
                right: '-10%',
                width: '35vw',
                height: '35vw',
                background: 'radial-gradient(circle, rgba(255, 82, 82, 0.1) 0%, transparent 70%)',
                filter: 'blur(100px)',
                zIndex: 0,
                pointerEvents: 'none'
            }} />

            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0) rotateY(-5deg); }
                    50% { transform: translateY(-20px) rotateY(-3deg); }
                }
                .floating-card {
                    animation: float 6s ease-in-out infinite;
                }
                @media (max-width: 900px) {
                    .hero-section {
                        padding: 4rem 1.5rem !important;
                        gap: 4rem !important;
                        text-align: center !important;
                    }
                    .hero-text {
                        padding-right: 0 !important;
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: center !important;
                    }
                    .hero-image-wrapper {
                        width: 100% !important;
                        max-width: 450px !important;
                        margin: 0 auto !important;
                    }
                    .floating-card {
                        animation: float-mobile 5s ease-in-out infinite !important;
                    }
                    @keyframes float-mobile {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-15px); }
                    }
                    .hero-text h1 {
                        font-size: 3.2rem !important;
                        letter-spacing: -2px !important;
                    }
                    .hero-text p {
                        font-size: 1.1rem !important;
                    }
                }
                .premium-button {
                    position: relative;
                    overflow: hidden;
                    transition: all 0.4s cubic-bezier(0.19, 1, 0.22, 1);
                }
                .premium-button:hover {
                    transform: translateY(-5px) scale(1.02);
                    box-shadow: 0 20px 40px rgba(0, 173, 181, 0.3), 0 0 20px rgba(0, 255, 245, 0.2);
                }
                .premium-button::after {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                    opacity: 0;
                    transition: opacity 0.4s;
                }
                .premium-button:hover::after {
                    opacity: 1;
                }
            `}</style>

            {/* Hero Section */}
            <section className="hero-section" style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(450px, 1.2fr) 1fr',
                alignItems: 'center',
                gap: '6rem',
                padding: '6rem 4rem',
                maxWidth: '1400px',
                margin: '0 auto',
                width: '100%',
                position: 'relative',
                zIndex: 1
            }}>
                <div className="hero-text" style={{ paddingRight: '1rem' }}>
                    <div className="glass" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.6rem 1.2rem',
                        borderRadius: '100px',
                        fontSize: '0.8rem',
                        fontWeight: 900,
                        color: 'var(--primary-color)',
                        textTransform: 'uppercase',
                        letterSpacing: '3px',
                        marginBottom: '2rem',
                        border: '1px solid rgba(0, 173, 181, 0.3)',
                        background: 'rgba(0, 173, 181, 0.05)'
                    }}>
                        <Fingerprint size={18} /> Next-Gen Security
                    </div>
                    
                    <h1 style={{
                        fontSize: 'clamp(3rem, 8vw, 5.5rem)',
                        fontWeight: 900,
                        lineHeight: 0.95,
                        margin: '0 0 2rem 0',
                        letterSpacing: '-3px',
                        color: '#ffffff'
                    }}>
                        Интелигентен <br/>
                        <span className="gradient-text" style={{ filter: 'drop-shadow(0 0 20px rgba(0, 173, 181, 0.4))' }}>Транспорт</span>
                    </h1>

                    <p style={{
                        fontSize: '1.25rem',
                        color: 'rgba(255,255,255,0.65)',
                        maxWidth: '580px',
                        lineHeight: 1.5,
                        marginBottom: '3.5rem',
                        fontWeight: 500,
                        letterSpacing: '-0.2px'
                    }}>
                        Мащабируема екосистема за дигитален контрол. Превърнете управлението на абонаменти в безпроблемно преживяване с AI верификация и анализи в реално време.
                    </p>

                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'inherit' }}>
                        <Link to="/admin" className="premium-button glass neon-border" style={{
                            padding: '1.4rem 3.5rem',
                            borderRadius: '20px',
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem',
                            fontSize: '1.15rem',
                            background: 'linear-gradient(135deg, rgba(0, 173, 181, 0.6), rgba(0, 173, 181, 0.2))',
                            color: '#ffffff',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
                        }}>
                             <ShieldCheck size={26} /> Влез в Системата
                        </Link>
                    </div>
                </div>

                <div className="hero-image-wrapper" style={{ position: 'relative' }}>
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '140%',
                        height: '140%',
                        background: 'radial-gradient(circle, rgba(0, 173, 181, 0.15) 0%, rgba(0, 0, 0, 0) 70%)',
                        zIndex: -1,
                        filter: 'blur(40px)'
                    }} />
                    <img 
                        src={heroImage} 
                        className="floating-card"
                        style={{ 
                            width: '100%', 
                            borderRadius: '40px', 
                            boxShadow: '0 50px 100px rgba(0,0,0,0.7), 0 0 50px rgba(0,173,181,0.2)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            transition: 'all 0.5s ease',
                            display: 'block'
                        }} 
                        alt="Hero" 
                    />
                </div>
            </section>

            {/* Features Section */}
            <section style={{ 
                padding: '6rem 2rem', 
                background: 'linear-gradient(to bottom, transparent, rgba(0, 173, 181, 0.05), transparent)'
            }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                        <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1rem', color: '#ffffff' }}>Експертно Управление</h2>
                        <div style={{ width: '60px', height: '4px', background: 'var(--primary-color)', margin: '0 auto', borderRadius: '2px' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
                        {[
                            { icon: <Zap color="var(--success-color)" />, title: 'Бърза Регистрация', desc: 'Сканиране и въвеждане на данни за секунди чрез вградената AI камера.', img: stepRegistration },
                            { icon: <Users color="var(--primary-color)" />, title: 'Умна Верификация', desc: 'Моментална визуална проверка на пътника и статуса на картата.', img: stepScan },
                            { icon: <BarChart3 color="var(--neon-purple)" />, title: 'Дълбок Анализ', desc: 'Следене на потоци, приходи и нарушения в реално време.', img: stepVerify }
                        ].map((f, i) => (
                            <div key={i} className="glass" style={{
                                padding: '2rem',
                                borderRadius: '24px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1.5rem',
                                transition: 'transform 0.3s ease',
                                cursor: 'default'
                            }}>
                                <img src={f.img} style={{ width: '100%', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }} alt={f.title} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    {f.icon}
                                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{f.title}</h3>
                                </div>
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', lineHeight: 1.6 }}>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer Quick Info */}
            <footer style={{ 
                padding: '3rem 2rem', 
                textAlign: 'center',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '0.8rem',
                letterSpacing: '1px',
                textTransform: 'uppercase'
            }}>
                &copy; {new Date().getFullYear()} DARY COMMERCE &bull; SMART TRANSIT INTERFACE &bull; ПЛЕВЕН
            </footer>
        </div>
    );
};

export default Landing;
