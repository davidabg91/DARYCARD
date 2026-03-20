import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, Users, BarChart3, Fingerprint } from 'lucide-react';

// Import assets
import heroImage from '../assets/hero_main.png';
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
            animation: 'fadeIn 0.8s ease-out'
        }}>
            {/* Hero Section */}
            <section style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                alignItems: 'center',
                gap: '4rem',
                padding: '4rem 2rem',
                maxWidth: '1400px',
                margin: '0 auto',
                width: '100%'
            }}>
                <div style={{ paddingRight: '1rem' }}>
                    <div className="glass" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        borderRadius: '50px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: 'var(--accent-color)',
                        textTransform: 'uppercase',
                        letterSpacing: '2px',
                        marginBottom: '1.5rem',
                        border: '1px solid rgba(0, 255, 245, 0.2)'
                    }}>
                        <Fingerprint size={16} /> Сигурна Среда v2.0
                    </div>
                    
                    <h1 style={{
                        fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
                        fontWeight: 900,
                        lineHeight: 1.1,
                        margin: '0 0 1.5rem 0',
                        letterSpacing: '-1px'
                    }}>
                        Интелигентен <br/>
                        <span className="gradient-text" style={{ filter: 'drop-shadow(0 0 10px rgba(0, 173, 181, 0.3))' }}>Транспорт</span>
                    </h1>

                    <p style={{
                        fontSize: '1.2rem',
                        color: 'rgba(255,255,255,0.7)',
                        maxWidth: '550px',
                        lineHeight: 1.6,
                        marginBottom: '2.5rem',
                        fontWeight: 400
                    }}>
                        Професионална екосистема за управление на абонаментни карти. 
                        Бързо сканиране, интелигентни анализи и сигурна верификация в реално време.
                    </p>

                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                        <Link to="/admin" className="glass neon-border" style={{
                            padding: '1.2rem 2.8rem',
                            borderRadius: '16px',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            fontSize: '1.1rem',
                            background: 'linear-gradient(135deg, rgba(0, 173, 181, 0.4), rgba(0, 255, 245, 0.1))',
                            color: '#ffffff',
                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                        }}>
                             <ShieldCheck size={24} /> Влез в Системата
                        </Link>
                    </div>
                </div>

                <div style={{ position: 'relative' }}>
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '120%',
                        height: '120%',
                        background: 'radial-gradient(circle, rgba(0, 173, 181, 0.1) 0%, rgba(0, 0, 0, 0) 70%)',
                        zIndex: -1
                    }} />
                    <img 
                        src={heroImage} 
                        style={{ 
                            width: '100%', 
                            borderRadius: '32px', 
                            boxShadow: '0 30px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,173,181,0.1)',
                            transform: 'perspective(1000px) rotateY(-5deg)',
                            transition: 'all 0.5s ease'
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
                        <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1rem' }}>Експертно Управление</h2>
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
