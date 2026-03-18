import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

// Import assets for relative path resolution
import stepRegistration from '../assets/step_registration.png';
import stepScan from '../assets/step_scan.png';
import stepVerify from '../assets/step_verify.png';
import stepAnalytics from '../assets/step_analytics.png';

const Landing: React.FC = () => {
    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '2rem 1rem' }}>
            {/* Hero Section - Official Internal Look */}
            <section style={{
                textAlign: 'center',
                padding: '3rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem',
                borderBottom: '1px solid var(--surface-border)',
                marginBottom: '3rem'
            }}>
                <div style={{ 
                    padding: '0.5rem 1rem', 
                    background: 'rgba(255,255,255,0.05)', 
                    borderRadius: '50px', 
                    fontSize: '0.8rem', 
                    fontWeight: 700, 
                    color: 'var(--primary-color)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    border: '1px solid var(--primary-color)'
                }}>
                    Само за вътрешно ползване
                </div>
                <h1 style={{
                    fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                    fontWeight: 800,
                    lineHeight: 1.2,
                    maxWidth: '900px',
                    margin: 0
                }}>
                    Система за Управление на Карти <br/>
                    <span className="gradient-text">Dary Commerce</span>
                </h1>

                <p style={{
                    fontSize: '1.1rem',
                    color: 'var(--text-secondary)',
                    maxWidth: '700px',
                    lineHeight: 1.6
                }}>
                    Този портал е предназначен изключително за служители на Dary Commerce. 
                    Тук можете да управлявате регистрации на клиенти, да подновявате абонаменти и да извършвате бърза верификация на пътниците по маршрутите.
                </p>

                <div style={{ marginTop: '1rem' }}>
                    <Link to="/admin" style={{
                        background: 'var(--primary-color)',
                        color: '#fff',
                        padding: '1.1rem 2.5rem',
                        borderRadius: '50px',
                        fontWeight: 700,
                        boxShadow: 'var(--shadow-neon)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        textDecoration: 'none',
                        fontSize: '1.1rem'
                    }}>
                        <ShieldCheck size={22} /> Вход в Системата
                    </Link>
                </div>
            </section>

            {/* Visual Guide Section */}
            <section style={{ marginBottom: '5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <div style={{ color: 'var(--primary-color)', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem', marginBottom: '1rem', letterSpacing: '2px' }}>Ръководство за служители</div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0 }}>Как работи CRM системата?</h2>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '2.5rem'
                }}>
                    {/* Step 1 - Moderators */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <img src={stepRegistration} style={{ width: '100%', borderRadius: '24px', boxShadow: '0 15px 30px rgba(0,230,118,0.15)', border: '1px solid rgba(0,230,118,0.2)' }} alt="Registration" />
                            <div style={{ position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)', background: '#00e676', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', border: '3px solid var(--bg-color)', color: '#000' }}>1</div>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#00e676' }}>РЕГИСТРАЦИЯ (Модератори)</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                Заснемете снимка и въведете данните на клиента. Системата автоматично генерира цифров профил и подготвя картата.
                            </p>
                        </div>
                    </div>

                    {/* Step 2 - Drivers */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <img src={stepScan} style={{ width: '100%', borderRadius: '24px', boxShadow: 'var(--shadow-neon)', border: '1px solid rgba(0,173,181,0.2)' }} alt="Scan" />
                            <div style={{ position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)', background: 'var(--primary-color)', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', border: '3px solid var(--bg-color)' }}>2</div>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: 'var(--primary-color)' }}>СКАНИРАНЕ (Шофьори)</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                Приближете картата до служебния телефон. Системата моментално зарежда профила на пътника чрез NFC или QR.
                            </p>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <img src={stepVerify} style={{ width: '100%', borderRadius: '24px', boxShadow: '0 15px 30px rgba(0,0,0,0.4)', border: '1px solid rgba(255,165,0,0.2)' }} alt="Verify" />
                            <div style={{ position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)', background: '#ffa500', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', border: '3px solid var(--bg-color)', color: '#000' }}>3</div>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#ffa500' }}>ВЕРИФИКАЦИЯ</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                Сравнете снимката с лицето на пътника. Статусът (<b>АКТИВЕН/НЕАКТИВЕН</b>) се вижда ясно и с цветово кодиране.
                            </p>
                        </div>
                    </div>

                    {/* Step 4 - Admins */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <img src={stepAnalytics} style={{ width: '100%', borderRadius: '24px', boxShadow: '0 15px 30px rgba(160,32,240,0.15)', border: '1px solid rgba(160,32,240,0.2)' }} alt="Analytics" />
                            <div style={{ position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)', background: '#a020f0', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', border: '3px solid var(--bg-color)' }}>4</div>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#a020f0' }}>АНАЛИЗ (Администратори)</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                Следете приходите и събираемостта на плащанията в реално време чрез интелигентното табло с данни.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Landing;
