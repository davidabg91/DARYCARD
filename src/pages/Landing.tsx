import React, { useState, useEffect } from 'react';
import { 
  Bus, Clock, MapPin, Search, 
  CreditCard, 
  ArrowRight, ArrowLeft, Phone, MessageCircle
} from 'lucide-react';
import { SCHEDULES } from '../data/schedules';
import { ROUTE_METADATA } from '../data/routeMetadata';

const Landing: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [expandedRoute, setExpandedRoute] = useState<string | null>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 10000);
        return () => clearInterval(timer);
    }, []);

    const routes = Object.keys(SCHEDULES);
    const filteredRoutes = routes.filter(r => 
        r.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getNextBus = (line: string, direction: 'fromPleven' | 'fromDestination') => {
        const sched = SCHEDULES[line];
        const times = sched[direction];
        if (!times) return null;
        
        const now = currentTime.getHours() * 60 + currentTime.getMinutes();
        const soonest = times
            .map(t => {
                const [h, m] = t.split(':').map(Number);
                const total = h * 60 + m;
                return total > now ? total - now : (24 * 60 - now) + total;
            })
            .sort((a, b) => a - b)[0];

        return soonest === undefined ? null : soonest;
    };

    const formatCountdown = (mins: number | null) => {
        if (mins === null) return '--';
        if (mins > 60) {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${h}ч ${m}м`;
        }
        return `${mins} мин`;
    };

    return (
        <div style={{ 
            minHeight: '100vh', 
            background: 'var(--bg-color)',
            color: '#fff',
            fontFamily: 'var(--font-family)',
            paddingBottom: '5rem'
        }}>
            <style>{`
                .hero-bg {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 600px;
                    background: radial-gradient(circle at 50% -20%, rgba(0,173,181,0.15) 0%, transparent 70%);
                    z-index: 0;
                }
                .search-container:focus-within {
                    border-color: var(--primary-color) !important;
                    box-shadow: 0 0 20px rgba(0,173,181,0.2);
                }
                .route-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 1px solid rgba(255,255,255,0.05) !important;
                }
                .route-card:hover {
                    transform: translateY(-5px);
                    border-color: rgba(0,173,181,0.3) !important;
                    background: rgba(255,255,255,0.03) !important;
                }
                .stop-dot {
                    width: 8px; height: 8px; border-radius: 50%;
                    background: var(--primary-color);
                    position: relative;
                }
                .stop-line {
                    height: 2px; flex: 1;
                    background: rgba(255,255,255,0.1);
                    margin: 0 4px;
                }
                .schedule-tag {
                    padding: 0.3rem 0.6rem;
                    background: rgba(255,255,255,0.05);
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    border: 1px solid rgba(255,255,255,0.1);
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <div className="hero-bg" />

            {/* Main Content */}
            <main style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: '4rem 1.5rem' }}>
                
                {/* Hero Text */}
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>


                    <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontWeight: 900, marginBottom: '1.5rem', letterSpacing: '-2px' }}>
                        Вашите Пътувания, <br/>
                        <span style={{ color: 'var(--primary-color)' }}>По-Умни и По-Бързи</span>
                    </h1>
                    <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.5)', maxWidth: '600px', margin: '0 auto 3rem' }}>
                        Следете разписанията в реално време, проверете следващия автобус и планирайте пътуването си с лекота.
                    </p>

                    {/* Search Bar */}
                    <div className="search-container" style={{ 
                        maxWidth: '600px', 
                        margin: '0 auto',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '20px',
                        padding: '0.5rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        backdropFilter: 'blur(10px)',
                        transition: '0.3s'
                    }}>
                        <Search size={24} color="rgba(255,255,255,0.3)" />
                        <input 
                            placeholder="Намери своята линия (напр. Тръстеник, Садовец...)"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ 
                                width: '100%', 
                                background: 'none', 
                                border: 'none', 
                                color: '#fff', 
                                fontSize: '1.1rem',
                                padding: '0.8rem 0',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>

                {/* Schedules Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                    {filteredRoutes.map(line => {
                        const nextFromPleven = getNextBus(line, 'fromPleven');
                        const nextFromDest = getNextBus(line, 'fromDestination');
                        const meta = ROUTE_METADATA[line];
                        const sched = SCHEDULES[line];
                        const isExpanded = expandedRoute === line;
                        
                        return (
                            <div key={line} className="route-card" style={{ 
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: '24px',
                                padding: '1.5rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1.2rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '0.3rem' }}>ЛИНИЯ</div>
                                        <h3 style={{ fontSize: '1.6rem', fontWeight: 900 }}>{line}</h3>
                                    </div>
                                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <div>
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>ОТ ПЛЕВЕН</div>
                                            <div style={{ 
                                                fontSize: '1rem', 
                                                fontWeight: 900, 
                                                color: nextFromPleven && nextFromPleven <= 15 ? 'var(--success-color)' : '#fff',
                                                display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end'
                                            }}>
                                                <Clock size={16} /> {formatCountdown(nextFromPleven)}
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>ОТ {line.toUpperCase()}</div>
                                            <div style={{ 
                                                fontSize: '1rem', 
                                                fontWeight: 900, 
                                                color: nextFromDest && nextFromDest <= 15 ? 'var(--success-color)' : '#fff',
                                                display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end'
                                            }}>
                                                <Clock size={16} /> {formatCountdown(nextFromDest)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Visual Paths */}
                                {meta && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', padding: '0.8rem 0 1.2rem' }}>
                                        {/* Pleven -> Destination */}
                                        <div style={{ background: 'rgba(0,173,181,0.03)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(0,173,181,0.1)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                                                <div style={{ width: '8px', height: '8px', background: 'var(--primary-color)', borderRadius: '50%' }} />
                                                <div style={{ fontSize: '0.65rem', color: 'var(--primary-color)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                                     ОТ ПЛЕВЕН → {line.toUpperCase()}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
                                                {meta.stops.map((stop, i) => (
                                                    <React.Fragment key={i}>
                                                        <div className="stop-dot" title={stop} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
                                                            <div style={{ width: '10px', height: '10px', background: 'var(--primary-color)', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)' }} />
                                                            <span style={{ 
                                                                position: 'absolute', 
                                                                top: '16px', 
                                                                fontSize: '0.55rem', 
                                                                whiteSpace: 'nowrap', 
                                                                opacity: 0.9,
                                                                fontWeight: 700,
                                                                textAlign: 'center',
                                                                color: i === 0 || i === meta.stops.length -1 ? 'var(--primary-color)' : '#fff'
                                                            }}>
                                                                {stop}
                                                            </span>
                                                        </div>
                                                        {i < meta.stops.length - 1 && (
                                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
                                                                <div className="stop-line" style={{ background: 'linear-gradient(90deg, var(--primary-color), rgba(255,255,255,0.1))', height: '2px', width: '100%' }} />
                                                                <ArrowRight size={10} color="var(--primary-color)" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', opacity: 0.5 }} />
                                                            </div>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Destination -> Pleven */}
                                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                                                <div style={{ width: '8px', height: '8px', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: '50%' }} />
                                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                                     ОТ {line.toUpperCase()} → ПЛЕВЕН
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
                                                {[...meta.stops].reverse().map((stop, i) => (
                                                    <React.Fragment key={i}>
                                                        <div className="stop-dot" title={stop} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
                                                            <div style={{ width: '10px', height: '10px', border: '2px solid rgba(255,255,255,0.4)', background: 'transparent', borderRadius: '50%' }} />
                                                            <span style={{ 
                                                                position: 'absolute', 
                                                                top: '16px', 
                                                                fontSize: '0.55rem', 
                                                                whiteSpace: 'nowrap', 
                                                                opacity: 0.7,
                                                                fontWeight: 600,
                                                                textAlign: 'center'
                                                            }}>
                                                                {stop}
                                                            </span>
                                                        </div>
                                                        {i < meta.stops.length - 1 && (
                                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
                                                                <div className="stop-line" style={{ background: 'linear-gradient(270deg, var(--primary-color), rgba(255,255,255,0.1))', height: '2px', width: '100%', opacity: 0.3 }} />
                                                                <ArrowLeft size={10} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }} />
                                                            </div>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div style={{ 
                                    display: 'flex', 
                                    gap: '1rem', 
                                    background: 'rgba(255,255,255,0.03)', 
                                    padding: '1rem', 
                                    borderRadius: '16px' 
                                }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>БИЛЕТ</div>
                                        <div style={{ fontWeight: 800 }}>{meta?.priceSingle || '---'}</div>
                                    </div>
                                    <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>КАРТА (Месец)</div>
                                        <div style={{ fontWeight: 800 }}>{meta?.priceCard || '---'}</div>
                                    </div>
                                </div>

                                {/* Expanded Schedule */}
                                {isExpanded && (
                                    <div style={{ 
                                        padding: '1rem', 
                                        background: 'rgba(255,255,255,0.02)', 
                                        borderRadius: '16px',
                                        animation: 'fadeIn 0.3s ease-out'
                                    }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--primary-color)', fontWeight: 800, marginBottom: '0.5rem' }}>ОТ ПЛЕВЕН</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                    {sched.fromPleven.map(t => <span key={t} className="schedule-tag">{t}</span>)}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--primary-color)', fontWeight: 800, marginBottom: '0.5rem' }}>ОТ {line.toUpperCase()}</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                    {sched.fromDestination.map(t => <span key={t} className="schedule-tag">{t}</span>)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <button 
                                    onClick={() => setExpandedRoute(isExpanded ? null : line)}
                                    style={{ 
                                        marginTop: 'auto',
                                        width: '100%', 
                                        padding: '1rem', 
                                        background: isExpanded ? 'rgba(255,255,255,0.05)' : 'rgba(0,173,181,0.1)',
                                        border: '1px solid rgba(0,173,181,0.2)',
                                        borderRadius: '16px',
                                        color: isExpanded ? '#fff' : 'var(--primary-color)',
                                        fontWeight: 700,
                                        fontSize: '0.9rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        cursor: 'pointer',
                                        transition: '0.3s'
                                    }}
                                >
                                    {isExpanded ? 'Затвори Разписание' : 'Виж Пълно Разписание'} 
                                    {isExpanded ? <Clock size={16} /> : <ArrowRight size={16} />}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Info Section */}
                <section style={{ marginTop: '6rem' }}>
                    <div style={{ 
                        background: 'linear-gradient(135deg, rgba(0,173,181,0.1), rgba(0,173,181,0.05))',
                        borderRadius: '32px',
                        padding: '3rem',
                        border: '1px solid rgba(0,173,181,0.1)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '3rem',
                        alignItems: 'center'
                    }}>
                        <div style={{ flex: '1', minWidth: '300px' }}>
                            <div style={{ 
                                display: 'inline-flex', padding: '0.6rem 1.2rem', 
                                background: 'rgba(0,173,181,0.2)', borderRadius: '100px',
                                fontSize: '0.75rem', fontWeight: 900, color: 'var(--primary-color)',
                                marginBottom: '1.5rem', letterSpacing: '2px'
                            }}>
                                ВАЖНА ИНФОРМАЦИЯ
                            </div>
                            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1.5rem' }}>Как да извадите абонаментна карта?</h2>
                            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '2rem' }}>
                                Абонаментните карти за всички линии се издават на нашето специализирано гише. Процесът отнема по-малко от 5 минути и картата е готова веднага.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MapPin size={20} color="var(--primary-color)" /></div>
                                    <div>
                                        <div style={{ fontWeight: 800 }}>Автогара Плевен</div>
                                        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' }}>Гише DARY COMMERCE</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CreditCard size={20} color="var(--primary-color)" /></div>
                                    <div>
                                        <div style={{ fontWeight: 800 }}>Електронна Карта</div>
                                        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' }}>Валидна за всички курсове по избраната линия</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ flex: '1', minWidth: '300px', position: 'relative' }}>
                             <div className="glass" style={{ 
                                 padding: '2rem', borderRadius: '24px', 
                                 border: '1px solid rgba(255,255,255,0.1)',
                                 background: 'rgba(255,255,255,0.02)',
                                 textAlign: 'center'
                             }}>
                                 <h4 style={{ marginBottom: '1rem' }}>Работно Време</h4>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                     <span>Понеделник - Петък</span>
                                     <span style={{ fontWeight: 800 }}>07:30 - 18:30</span>
                                 </div>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                     <span>Събота</span>
                                     <span style={{ fontWeight: 800 }}>08:00 - 13:00</span>
                                 </div>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', color: 'rgba(255,255,255,0.3)' }}>
                                     <span>Неделя</span>
                                     <span style={{ fontWeight: 800 }}>Почивен ден</span>
                                 </div>
                             </div>
                        </div>
                    </div>
                </section>

            </main>

            {/* Footer */}
            <footer style={{ 
                borderTop: '1px solid rgba(255,255,255,0.05)', 
                padding: '4rem 2rem 2rem',
                marginTop: '4rem'
            }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '4rem', justifyContent: 'space-between' }}>
                    <div style={{ maxWidth: '300px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem' }}>
                             <Bus color="var(--primary-color)" size={28} />
                             <span style={{ fontSize: '1.5rem', fontWeight: 900 }}>DARY COMMERCE</span>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                            Вашият доверен партньор в пътническия транспорт в област Плевен. Сигурност, точност и комфорт.
                        </p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '4rem' }}>
                        <div>
                            <h5 style={{ marginBottom: '1.2rem', fontWeight: 800 }}>КОНТАКТИ</h5>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Phone size={14} /> +359 888 123 456</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MessageCircle size={14} /> dary.commerce@gmail.com</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ 
                    textAlign: 'center', marginTop: '4rem', 
                    paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)',
                    fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '1px'
                }}>
                    © {new Date().getFullYear()} DARY COMMERCE. ВСИЧКИ ПРАВА ЗАПАЗЕНИ.
                </div>
            </footer>
        </div>
    );
};

export default Landing;
