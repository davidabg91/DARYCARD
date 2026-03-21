import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, Users, BarChart3, Fingerprint } from 'lucide-react';

// Import assets
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
                top: '-20%',
                left: '20%',
                width: '60vw',
                height: '60vw',
                background: 'radial-gradient(circle, rgba(0, 173, 181, 0.12) 0%, transparent 70%)',
                filter: 'blur(100px)',
                zIndex: 0,
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                top: '40%',
                right: '10%',
                width: '50vw',
                height: '50vw',
                background: 'radial-gradient(circle, rgba(255, 82, 82, 0.06) 0%, transparent 70%)',
                filter: 'blur(120px)',
                zIndex: 0,
                pointerEvents: 'none'
            }} />

            <style>{`
                @media (max-width: 900px) {
                    .hero-section {
                        padding: 6rem 1.25rem !important;
                    }
                    .hero-text h1 {
                        font-size: clamp(2.4rem, 12vw, 4.5rem) !important;
                        letter-spacing: -2px !important;
                        line-height: 1.05 !important;
                    }
                    .hero-text p {
                        font-size: 1.1rem !important;
                        max-width: 100% !important;
                        margin-bottom: 2.5rem !important;
                    }
                    .premium-button-lg {
                        padding: 1.25rem 2.5rem !important;
                        font-size: 1.1rem !important;
                        width: 100% !important;
                        max-width: 400px !important;
                    }
                    .features-grid {
                        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) !important;
                        gap: 2rem !important;
                    }
                }
                .premium-button-lg {
                    position: relative;
                    overflow: hidden;
                    transition: all 0.4s cubic-bezier(0.19, 1, 0.22, 1);
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }
                .premium-button-lg:hover {
                    transform: translateY(-8px) scale(1.05);
                    box-shadow: 0 25px 50px rgba(0, 173, 181, 0.4), 0 0 30px rgba(0, 255, 245, 0.3);
                }
            `}</style>

            {/* Hero Section - Typographic Focus */}
            <section className="hero-section" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '10rem 2rem',
                maxWidth: '1200px',
                margin: '0 auto',
                width: '100%',
                position: 'relative',
                zIndex: 1
            }}>
                <div className="hero-text" style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    maxWidth: '900px'
                }}>
                    <div className="glass" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.8rem',
                        padding: '0.8rem 1.5rem',
                        borderRadius: '100px',
                        fontSize: '0.85rem',
                        fontWeight: 900,
                        color: 'var(--primary-color)',
                        textTransform: 'uppercase',
                        letterSpacing: '4px',
                        marginBottom: '2.5rem',
                        border: '1px solid rgba(0, 173, 181, 0.4)',
                        background: 'rgba(0, 173, 181, 0.08)',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <Fingerprint size={20} /> Advanced Transit Interface
                    </div>
                    
                    <h1 style={{
                        fontSize: 'clamp(3.5rem, 10vw, 6.5rem)',
                        fontWeight: 900,
                        lineHeight: 0.9,
                        margin: '0 0 2.5rem 0',
                        letterSpacing: '-4px',
                        color: '#ffffff'
                    }}>
                        Интелигентен <br/>
                        <span className="gradient-text" style={{ 
                            padding: '0 10px',
                            filter: 'drop-shadow(0 0 30px rgba(0, 173, 181, 0.4))' 
                        }}>Транспорт</span>
                    </h1>

                    <p style={{
                        fontSize: '1.4rem',
                        color: 'rgba(255,255,255,0.6)',
                        maxWidth: '700px',
                        lineHeight: 1.4,
                        marginBottom: '4rem',
                        fontWeight: 500,
                        letterSpacing: '-0.3px'
                    }}>
                        Професионална екосистема за дигитален контрол на абонаменти. <br/>
                        Интелигентна верификация и анализи, проектирани за мащаб.
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Link to="/admin" className="premium-button-lg glass neon-border" style={{
                            padding: '1.5rem 4.5rem',
                            borderRadius: '24px',
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1.2rem',
                            fontSize: '1.3rem',
                            background: 'linear-gradient(135deg, rgba(0, 173, 181, 0.7), rgba(0, 173, 181, 0.3))',
                            color: '#ffffff',
                            boxShadow: '0 15px 40px rgba(0,0,0,0.5)'
                        }}>
                             <ShieldCheck size={30} /> Влез в Системата
                        </Link>
                    </div>
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
