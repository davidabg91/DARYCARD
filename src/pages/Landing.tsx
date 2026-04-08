import logoTravel from '../assets/logo_travel.png';
import React, { useState, useEffect } from 'react';
import { 
  Clock, MapPin, Search, 
  CreditCard, ExternalLink,
  ArrowRight, Phone, MessageCircle, AlertTriangle, Info, Ticket
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { SCHEDULES } from '../data/schedules';
import { ROUTE_METADATA, abbreviate } from '../data/routeMetadata';
import PushSubscription from '../components/PushSubscription';

const Landing: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 10000);
        return () => clearInterval(timer);
    }, []);

    const EXCLUDED_ROUTES = [
        "Долни Дъбник - Садовец",
        "Долна Митрополия - Славовица",
        "Долна Митрополия - Тръстеник"
    ];

    const routes = Object.keys(ROUTE_METADATA)
        .filter(r => !EXCLUDED_ROUTES.includes(r))
        .sort((a,b) => a.localeCompare(b, 'bg'));
    
    const filteredRoutes = routes.filter(r => 
        r.toLowerCase().includes(searchQuery.toLowerCase())
    );


    const getNextBus = (line: string, direction: 'fromPleven' | 'fromDestination') => {
        const sched = SCHEDULES[line];
        if (!sched) return null;
        
        const day = currentTime.getDay();
        const now = currentTime.getHours() * 60 + currentTime.getMinutes();
        
        const getScheduleForDay = (d: number) => {
            if (d === 6 && sched.saturday) return sched.saturday[direction];
            if (d === 0 && sched.sunday) return sched.sunday[direction];
            return sched[direction];
        };

        const todayTimes = getScheduleForDay(day);
        if (!todayTimes || todayTimes.length === 0) return null;

        const nextToday = todayTimes
            .map(t => {
                const parts = t.replace('*', '').split(':');
                return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            })
            .filter(m => m > now)
            .sort((a,b) => a - b)[0];

        if (nextToday !== undefined) {
            return nextToday - now;
        }

        // This is a simplified "tomorrow":
        const tomorrowDay = (day + 1) % 7;
        const tomorrowTimes = getScheduleForDay(tomorrowDay);
        if (!tomorrowTimes || tomorrowTimes.length === 0) return null;

        const firstTomorrow = tomorrowTimes
            .map(t => {
                const parts = t.replace('*', '').split(':');
                return parseInt(parts[0]) * 60 + parseInt(parts[1]);
            })
            .sort((a,b) => a - b)[0];

        return (24 * 60 - now) + firstTomorrow;
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

    const currentDay = currentTime.getDay();
    const isSat = currentDay === 6;
    const isSun = currentDay === 0;
    const isWorkday = currentDay >= 1 && currentDay <= 5;

    const getNextTime = (times: string[] | undefined) => {
        if (!times || times.length === 0) return null;
        const now = currentTime.getHours() * 60 + currentTime.getMinutes();
        const future = times
            .map(t => {
                const parts = t.replace('*', '').split(':');
                const h = parseInt(parts[0]);
                const m = parseInt(parts[1]);
                return { t: t.replace('*', ''), mins: h * 60 + m };
            })
            .filter(x => x.mins > now)
            .sort((a, b) => a.mins - b.mins);
        return future.length > 0 ? future[0].t : null;
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
                .next-bus-tag-active {
                    background: rgba(46, 204, 113, 0.2) !important;
                    color: #2ecc71 !important;
                    border-color: #2ecc71 !important;
                    box-shadow: 0 0 15px rgba(46, 204, 113, 0.3);
                    animation: pulse-green 2s infinite ease-in-out;
                    z-index: 10;
                }
                @keyframes pulse-green {
                    0% { box-shadow: 0 0 5px rgba(46, 204, 113, 0.3); transform: scale(1); }
                    50% { box-shadow: 0 0 20px rgba(46, 204, 113, 0.6); transform: scale(1.05); }
                    100% { box-shadow: 0 0 5px rgba(46, 204, 113, 0.3); transform: scale(1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .selection-card {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 16px;
                    padding: 0.8rem 1.2rem;
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    gap: 1rem;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: left;
                }
                .selection-card:hover {
                    background: rgba(0, 173, 181, 0.1);
                    border-color: var(--primary-color);
                    transform: translateY(-5px);
                    box-shadow: 0 10px 30px rgba(0,173,181,0.15);
                }
                .selection-icon {
                    width: 36px;
                    height: 36px;
                    min-width: 36px;
                    background: rgba(0, 173, 181, 0.1);
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary-color);
                    transition: 0.3s;
                }
                .selection-card h3 {
                    margin: 0;
                }
                .selection-card:hover .selection-icon {
                    background: var(--primary-color);
                    color: #fff;
                    transform: scale(1.1);
                }

                .info-container {
                    background: linear-gradient(135deg, rgba(0,173,181,0.1), rgba(0,173,181,0.05));
                    border-radius: 32px;
                    padding: 3rem;
                    border: 1px solid rgba(0,173,181,0.1);
                    display: flex;
                    flex-wrap: wrap;
                    gap: 3rem;
                    align-items: flex-start;
                    transition: 0.3s;
                }

                .working-hours-card {
                    padding: 2.5rem;
                    border-radius: 24px;
                    border: 1px solid rgba(255,255,255,0.1);
                    background: rgba(255,255,255,0.02);
                    text-align: center;
                    backdrop-filter: blur(10px);
                }

                @media (max-width: 768px) {
                    .info-container {
                        padding: 1.5rem;
                        gap: 2rem;
                        border-radius: 24px;
                    }
                    .working-hours-card {
                        padding: 1.5rem;
                        border-radius: 20px;
                    }
                    .route-grid {
                        gap: 0.5rem !important;
                    }
                    .selection-card {
                        padding: 0.6rem 0.5rem !important;
                        border-radius: 12px !important;
                        gap: 0.4rem !important;
                        min-width: 0 !important;
                    }
                    .selection-icon {
                        display: none !important;
                    }
                    .selection-card h3 {
                        font-size: 0.8rem !important;
                        text-align: center;
                        width: 100%;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                    }
                    .selection-card div > div {
                        display: none !important;
                    }
                }
                .route-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
                    gap: 1rem;
                }
                @media (max-width: 480px) {
                    .route-grid.selection-grid {
                        grid-template-columns: repeat(3, 1fr) !important;
                        gap: 0.4rem !important;
                    }
                }
                
                @media (max-width: 768px) {
                    .main-content {
                        padding: 2rem 0.6rem !important;
                    }
                    .mobile-info-section {
                        padding: 0 !important;
                    }
                    .info-container {
                        padding: 1.2rem 0.8rem !important;
                        flex-direction: column !important;
                        gap: 1.5rem !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        border-radius: 20px !important;
                        margin: 0 !important;
                        box-sizing: border-box !important;
                        overflow: hidden !important;
                    }
                    .info-container > div {
                        width: 100% !important;
                        min-width: 0 !important;
                    }
                    .info-container h2 {
                        font-size: 1.5rem !important;
                    }
                    .info-container p {
                        font-size: 0.9rem !important;
                        line-height: 1.5 !important;
                        padding: 0 !important;
                    }
                    .info-container .info-list-item {
                        gap: 0.8rem !important;
                    }
                    .info-container .info-list-item div:last-child {
                        flex: 1 !important;
                        min-width: 0 !important;
                    }
                    .info-container .info-list-item div:last-child div {
                        font-size: 0.85rem !important;
                        white-space: normal !important;
                    }
                    .info-container .info-list-item div:last-child div:last-child {
                        font-size: 0.75rem !important;
                    }
                    .footer-content {
                        flex-direction: column !important;
                        align-items: center !important;
                        text-align: center !important;
                        gap: 2rem !important;
                    }
                    .footer-brand {
                        max-width: 100% !important;
                        width: 100% !important;
                    }
                    .footer-links {
                        width: 100% !important;
                        gap: 0.8rem !important;
                        flex-direction: row !important;
                        justify-content: center !important;
                    }
                    .footer-card .signal-btn {
                        padding: 0.5rem 0.4rem !important;
                        font-size: 0.7rem !important;
                        width: 100% !important;
                        justify-content: center !important;
                        gap: 0.3rem !important;
                    }
                    .footer-card {
                        min-width: 0 !important;
                        flex: 1 !important;
                        padding: 1rem 0.3rem !important;
                    }
                    .footer-card h5 {
                        font-size: 0.65rem !important;
                    }
                    .footer-card p {
                        font-size: 0.7rem !important;
                    }
                    .footer-card img {
                        height: 60px !important;
                    }
                    .footer-card .contact-item {
                        font-size: 0.7rem !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        max-width: 100% !important;
                        display: block !important;
                    }
                    .footer-card a[href^="tel"] {
                        display: flex !important;
                        justify-content: center !important;
                    }
                    .footer-card .contact-item .lucide {
                        display: none !important;
                    }
                    .footer-card .signal-btn {
                        padding: 0.4rem 0.3rem !important;
                        font-size: 0.65rem !important;
                        width: 100% !important;
                        justify-content: center !important;
                        gap: 0.3rem !important;
                    }
                    .footer-card a[to="/signal"] svg,
                    .footer-card a[href="/signal"] svg {
                        width: 10px !important;
                        height: 10px !important;
                    }
                }
                @media (min-width: 481px) and (max-width: 768px) {
                    .route-grid.selection-grid {
                        grid-template-columns: repeat(2, 1fr) !important;
                    }
                }
                .main-content {
                    position: relative;
                    z-index: 1;
                    width: 100%;
                    margin: 0 auto;
                    padding: 4rem 1.5rem;
                }
            `}</style>

            <div className="hero-bg" />

            {/* Main Content */}
            <main className="main-content">
                
                {/* Hero Text */}
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>


                    <h1 style={{ 
                        fontSize: 'clamp(2rem, 8vw, 4.5rem)', 
                        fontWeight: 900, 
                        marginBottom: '1rem', 
                        letterSpacing: '-2px',
                        lineHeight: 1.1
                    }}>
                        Вашите Пътувания, <br/>
                        По-Умни с <span style={{ color: '#ff5252' }}>DARY Commerce</span>
                    </h1>
                    <p style={{ 
                        fontSize: 'clamp(1.1rem, 4vw, 1.4rem)', 
                        color: 'rgba(255,255,255,0.7)', 
                        maxWidth: '800px', 
                        margin: '0 auto 2rem',
                        padding: '0 1rem',
                        fontWeight: 600
                    }}>
                        Пълни графици и информация за всички автобусни линии в град Плевен и региона
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
                            placeholder="Намери своята линия"
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

                {/* Back Button for Selected Route */}
                {selectedRoute && (
                    <button 
                        onClick={() => setSelectedRoute(null)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            padding: '0.8rem 1.5rem',
                            borderRadius: '14px',
                            color: 'rgba(255,255,255,0.6)',
                            fontWeight: 700,
                            marginBottom: '2rem',
                            cursor: 'pointer',
                            transition: '0.3s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                            e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                        }}
                    >
                        <ArrowRight size={18} style={{ transform: 'rotate(180deg)' }} /> Всички Дестинации
                    </button>
                )}

                {/* Selection Grid OR Route Detail */}
                {!selectedRoute ? (
                    <>
                        <div style={{ 
                            marginBottom: '3rem', 
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '1rem',
                            animation: 'fadeIn 0.6s ease-out'
                        }}>
                            <h2 style={{ 
                                fontSize: 'clamp(2rem, 5vw, 2.8rem)', 
                                fontWeight: 950, 
                                marginBottom: '0.2rem', 
                                letterSpacing: '-1.5px',
                                background: 'linear-gradient(to bottom, #fff 30%, rgba(255,255,255,0.7) 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                lineHeight: 1
                            }}>
                                Актуални Линии
                            </h2>
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '0.8rem',
                                color: 'rgba(255,255,255,0.4)',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '2px'
                            }}>
                                <span style={{ width: '30px', height: '1.5px', background: 'linear-gradient(90deg, transparent, rgba(0, 173, 181, 0.3))' }} />
                                към {new Date().toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                <span style={{ width: '30px', height: '1.5px', background: 'linear-gradient(90deg, rgba(0, 173, 181, 0.3), transparent)' }} />
                            </div>
                        </div>
                        <div className="route-grid selection-grid">
                            {filteredRoutes.map((line) => (
                                <div 
                                    key={line} 
                                    className="selection-card"
                                    onClick={() => setSelectedRoute(line)}
                                >
                                <div className="selection-icon">
                                    <MapPin size={18} />
                                </div>
                                <div style={{ overflow: 'hidden', width: '100%' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</h3>
                                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Преглед</div>
                                </div>
                            </div>
                        ))}
                        </div>
                    </>
                ) : (
                    <div className="route-grid" style={{ gridTemplateColumns: '1fr' }}>
                        {filteredRoutes.filter(l => l === selectedRoute).map((line) => {
                            const nextFromPleven = getNextBus(line, 'fromPleven');
                            const nextFromDest = getNextBus(line, 'fromDestination');
                            const meta = ROUTE_METADATA[line];
                            const sched = SCHEDULES[line];
                            const isExpanded = true; // Use true to show full schedule by default as requested
                            
                            // Parse labels for "From - To" routes
                            let fromLabel = 'ПЛЕВЕН';
                            let toLabel = line.toUpperCase();
                            
                            // Special origin mappings for sub-routes
                            const originMapping: Record<string, string> = {
                                "Божурица": "РИБЕН",
                                "Победа": "РИБЕН",
                                "Биволаре": "РИБЕН",
                                "Градина": "БЪРКАЧ",
                                "Крушовица": "САДОВЕЦ",
                                "Ореховица": "БАЙКАЛ",
                                "Брегаре": "БАЙКАЛ",
                                "Крушовене": "БАЙКАЛ"
                            };

                            if (originMapping[line]) {
                                toLabel = originMapping[line];
                            } else if (line.includes(' - ')) {
                                const parts = line.split(' - ');
                                fromLabel = parts[0].toUpperCase();
                                toLabel = parts[1].toUpperCase();
                            }
                            
                            return (
                                <div 
                                    key={line} 
                                    className="route-card" 
                                    style={{ 
                                        width: '100%',
                                        maxWidth: '1200px',
                                        margin: '0 auto',
                                        background: 'rgba(255,255,255,0.02)',
                                        borderRadius: '24px',
                                        padding: 'clamp(1.2rem, 5vw, 2.5rem)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '2rem'
                                    }}
                                >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '0.3rem' }}>ЛИНИЯ</div>
                                                <h3 style={{ fontSize: '1.6rem', fontWeight: 900 }}>{line}</h3>
                                                {meta?.description && (
                                                    <div style={{ 
                                                        fontSize: '0.75rem', 
                                                        color: 'var(--accent-color)', 
                                                        fontWeight: 600,
                                                        maxWidth: '200px',
                                                        lineHeight: 1.3,
                                                        marginTop: '0.4rem'
                                                    }}>
                                                        {meta.description}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>ОТ {fromLabel} СЛЕД:</div>
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
                                                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>ОТ {toLabel} СЛЕД:</div>
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
                                                <div style={{ background: 'rgba(0,173,181,0.03)', padding: '4.5rem 1rem 4.5rem', borderRadius: '16px', border: '1px solid rgba(0,173,181,0.1)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', position: 'relative' }}>
                                                        {meta.stops.map((stop, i) => (
                                                            <React.Fragment key={i}>
                                                                <div className="stop-dot" title={stop} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
                                                                    <div style={{ width: '10px', height: '10px', background: 'var(--primary-color)', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)' }} />
                                                                    <span style={{ 
                                                                        position: 'absolute', 
                                                                        top: i % 2 === 0 ? '22px' : 'auto',
                                                                        bottom: i % 2 !== 0 ? '22px' : 'auto', 
                                                                        fontSize: 'clamp(0.6rem, 1.25vw, 0.85rem)', 
                                                                        whiteSpace: 'nowrap', 
                                                                        opacity: 0.9,
                                                                        fontWeight: 800,
                                                                        textAlign: 'center',
                                                                        color: i === 0 || i === meta.stops.length -1 ? 'var(--primary-color)' : '#fff'
                                                                    }}>
                                                                        {abbreviate(stop)}
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
                                            </div>
                                        )}

                                        <div style={{ 
                                            display: 'flex', 
                                            gap: '1rem', 
                                            background: 'rgba(255,255,255,0.03)', 
                                            padding: '1rem', 
                                            borderRadius: '16px' 
                                        }}>
                                            <div style={{ flex: 1, textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>БИЛЕТ</div>
                                                <div style={{ fontWeight: 800 }}>{meta?.priceSingle || '---'}</div>
                                            </div>
                                            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                                            <div style={{ flex: 1, textAlign: 'center' }}>
                                                <div style={{ 
                                                    fontSize: '0.7rem', 
                                                    color: 'rgba(255,255,255,0.4)', 
                                                    fontWeight: 700,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem',
                                                    justifyContent: 'center'
                                                }}>
                                                    КАРТА (Месец)
                                                    <button 
                                                        onClick={() => document.getElementById('info-section')?.scrollIntoView({ behavior: 'smooth' })}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            padding: 0,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            cursor: 'pointer',
                                                            color: 'var(--primary-color)',
                                                            opacity: 0.8,
                                                            transition: 'opacity 0.2s'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                                                        title="Повече информация за карти"
                                                    >
                                                        <Info size={18} />
                                                    </button>
                                                </div>
                                                <div style={{ fontWeight: 800 }}>{meta?.priceCard || '---'}</div>
                                            </div>
                                        </div>

                                        {/* Discount Information Notice */}
                                        <div style={{
                                            padding: '0.8rem 1rem',
                                            background: 'rgba(0,173,181,0.05)',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(0,173,181,0.2)',
                                            fontSize: '0.8rem',
                                            color: 'rgba(255,255,255,0.8)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.8rem',
                                            marginTop: '-0.5rem'
                                        }}>
                                            <div style={{ 
                                                width: '24px', 
                                                height: '24px', 
                                                borderRadius: '50%', 
                                                background: 'rgba(0,173,181,0.1)', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                color: 'var(--primary-color)',
                                                flexShrink: 0
                                            }}>
                                                <Info size={14} />
                                            </div>
                                            <p style={{ margin: 0, lineHeight: 1.4, fontWeight: 500 }}>
                                                Цените за ученици и пенсионери са <span style={{ color: 'var(--primary-color)', fontWeight: 700 }}>-50%</span> от тези цени, а за хора с увреждания над 70.99% са с <span style={{ color: 'var(--primary-color)', fontWeight: 700 }}>-25%</span>.
                                            </p>
                                        </div>

                                        {/* Expanded Schedule */}
                                        {isExpanded && (
                                            <div style={{ 
                                                padding: '1.2rem', 
                                                background: 'rgba(255,255,255,0.02)', 
                                                borderRadius: '16px',
                                                animation: 'fadeIn 0.3s ease-out',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '1.5rem'
                                            }}>
                                                <div style={{ marginBottom: '-0.5rem', paddingBottom: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                        <Clock size={16} /> Пълно разписание на курса
                                                    </h4>
                                                </div>

                                                {/* Reordered Schedule Groups */}
                                                {[
                                                    { 
                                                        id: 'sunday', 
                                                        condition: !!sched.sunday, 
                                                        isCurrent: isSun, 
                                                        label: 'НЕДЕЛЯ',
                                                        color: '#ff5252',
                                                        times: sched.sunday
                                                    },
                                                    { 
                                                        id: 'saturday', 
                                                        condition: !!sched.saturday, 
                                                        isCurrent: isSat, 
                                                        label: 'СЪБОТА',
                                                        color: '#ff9800',
                                                        times: sched.saturday
                                                    },
                                                    { 
                                                        id: 'workdays', 
                                                        condition: true, 
                                                        isCurrent: isWorkday, 
                                                        label: 'ДЕЛНИК',
                                                        color: 'var(--primary-color)',
                                                        times: { fromPleven: sched.fromPleven, fromDestination: sched.fromDestination }
                                                    }
                                                ]
                                                .filter(group => group.condition)
                                                .sort((a, b) => (a.isCurrent ? -1 : 1))
                                                .map((group) => (
                                                    <div key={group.id} style={{ 
                                                        marginTop: '0.5rem', 
                                                        padding: '1rem', 
                                                        background: group.isCurrent ? 'rgba(255,255,255,0.03)' : 'transparent',
                                                        borderRadius: '12px',
                                                        border: group.isCurrent ? `1px solid ${group.color}44` : '1px solid transparent'
                                                    }}>
                                                        <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: 900, color: group.color, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                                {group.label} {group.isCurrent && <span style={{ fontSize: '0.6rem', background: group.color, color: '#000', padding: '1px 6px', borderRadius: '4px', marginLeft: '5px' }}>ДНЕС</span>}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                                                            <div>
                                                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800, marginBottom: '0.5rem' }}>ОТ ПЛЕВЕН</div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                                    {group.times!.fromPleven.map(t => {
                                                                        const isNew = t.includes('*');
                                                                        const displayTime = t.replace('*', '');
                                                                        return (
                                                                            <span key={t} className={`schedule-tag ${group.isCurrent && displayTime === getNextTime(group.times!.fromPleven) ? 'next-bus-tag-active' : ''}`} style={{ position: 'relative' }}>
                                                                                {isNew && (
                                                                                    <span style={{
                                                                                        position: 'absolute',
                                                                                        top: '-10px',
                                                                                        left: '50%',
                                                                                        transform: 'translateX(-50%)',
                                                                                        background: '#ff5252',
                                                                                        color: '#fff',
                                                                                        fontSize: '0.45rem',
                                                                                        fontWeight: 900,
                                                                                        padding: '1px 4px',
                                                                                        borderRadius: '4px',
                                                                                        zIndex: 5,
                                                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                                                        border: '1px solid rgba(255,255,255,0.2)'
                                                                                    }}>НОВО</span>
                                                                                )}
                                                                                {displayTime}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 800, marginBottom: '0.5rem' }}>ОТ {toLabel}</div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                                    {group.times!.fromDestination.map(t => {
                                                                        const isNew = t.includes('*');
                                                                        const displayTime = t.replace('*', '');
                                                                        return (
                                                                            <span key={t} className={`schedule-tag ${group.isCurrent && displayTime === getNextTime(group.times!.fromDestination) ? 'next-bus-tag-active' : ''}`} style={{ position: 'relative' }}>
                                                                                {isNew && (
                                                                                    <span style={{
                                                                                        position: 'absolute',
                                                                                        top: '-10px',
                                                                                        left: '50%',
                                                                                        transform: 'translateX(-50%)',
                                                                                        background: '#ff5252',
                                                                                        color: '#fff',
                                                                                        fontSize: '0.45rem',
                                                                                        fontWeight: 900,
                                                                                        padding: '1px 4px',
                                                                                        borderRadius: '4px',
                                                                                        zIndex: 5,
                                                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                                                        border: '1px solid rgba(255,255,255,0.2)'
                                                                                    }}>НОВО</span>
                                                                                )}
                                                                                {displayTime}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Push Notification Subscription */}
                                                <PushSubscription courseId={line} />

                                                {originMapping[line] && (
                                                    <div style={{ 
                                                        marginTop: '1rem', 
                                                        fontSize: '0.7rem', 
                                                        color: 'rgba(255,255,255,0.4)', 
                                                        fontWeight: 600,
                                                        fontStyle: 'italic',
                                                        borderTop: '1px solid rgba(255,255,255,0.05)',
                                                        paddingTop: '0.8rem'
                                                    }}>
                                                        * Посочените часове са за преминаването на автобуса през началната точка на линията ({toLabel}).
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Info Section */}
                <section id="info-section" className="mobile-info-section" style={{ marginTop: 'clamp(3rem, 10vw, 6rem)', padding: '0 1rem', overflowX: 'hidden' }}>
                    <div className="info-container">
                        <div style={{ flex: '1', width: '100%', minWidth: 0 }}>
                            <div style={{ 
                                display: 'inline-flex', padding: '0.6rem 1.2rem', 
                                background: 'rgba(0,173,181,0.2)', borderRadius: '100px',
                                fontSize: '0.75rem', fontWeight: 900, color: 'var(--primary-color)',
                                marginBottom: '1.5rem', letterSpacing: '2px'
                            }}>
                                ВАЖНА ИНФОРМАЦИЯ
                            </div>
                            <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 900, marginBottom: '1.2rem', lineHeight: 1.2 }}>Как да извадите абонаментна карта?</h2>
                            <p style={{ fontSize: 'clamp(1rem, 3.5vw, 1.1rem)', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '2rem' }}>
                                Абонаментните карти за всички линии се издават на нашето специализирано гише. Процесът отнема по-малко от 5 минути и картата е готова веднага. Билети за пътуване се продават както на автогарата, така и от шофьора на място.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <a href="https://share.google/ElVTTGsi6ivVOx7PW" className="info-list-item" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '1rem', textDecoration: 'none', color: 'inherit', transition: 'transform 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(5px)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}>
                                    <div style={{ width: '40px', height: '40px', minWidth: '40px', background: 'rgba(0,173,181,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,173,181,0.3)' }}><MapPin size={20} color="var(--primary-color)" /></div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 800, color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            Автогара Плевен <ExternalLink size={12} />
                                        </div>
                                        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' }}>Гише DARY COMMERCE</div>
                                    </div>
                                </a>
                                 <div className="info-list-item" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ width: '40px', height: '40px', minWidth: '40px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CreditCard size={20} color="var(--primary-color)" /></div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 800 }}>Електронна Карта</div>
                                        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' }}>Валидна за всички линии</div>
                                    </div>
                                </div>
                                <div className="info-list-item" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ width: '40px', height: '40px', minWidth: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ticket size={20} color="var(--primary-color)" /></div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 800 }}>Еднократен Билет</div>
                                        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' }}>От гише или шофьор</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ flex: '1', width: '100%', position: 'relative' }}>
                             <div className="working-hours-card glass">
                                 <h4 style={{ marginBottom: '1.5rem', fontWeight: 900, color: 'var(--primary-color)' }}>Работно Време</h4>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                     <span>Понеделник - Петък</span>
                                     <span style={{ fontWeight: 800 }}>08:00 - 17:00</span>
                                 </div>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>
                                     <span>Събота</span>
                                     <span style={{ fontWeight: 800 }}>Почивен ден</span>
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
                padding: 'clamp(2rem, 8vw, 4rem) 1.5rem 2rem',
                marginTop: 'clamp(2rem, 8vw, 4rem)'
            }}>
                <div className="footer-content" style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 'clamp(2rem, 5vw, 4rem)', justifyContent: 'space-between' }}>
                    <div className="footer-brand" style={{ maxWidth: '300px' }}>
                        <div style={{ marginBottom: '1.2rem' }}>
                             <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ff5252', letterSpacing: '0.05em' }}>DARY COMMERCE</h3>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                            Вашият доверен партньор в пътническия транспорт в област Плевен. Сигурност, точност и комфорт.
                        </p>
                    </div>
                    
                    <div className="footer-links" style={{ display: 'flex', flexWrap: 'wrap', gap: '4rem' }}>
                        <div className="footer-card" style={{ 
                            background: 'rgba(255,255,255,0.03)', 
                            backdropFilter: 'blur(10px)', 
                            padding: '1.5rem', 
                            borderRadius: '24px', 
                            border: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            minWidth: '220px'
                        }}>
                            <h5 style={{ marginBottom: '0.8rem', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>ПАРТНЬОРИ</h5>
                            <a href="https://darytravel.com/" target="_blank" rel="noopener noreferrer" style={{ display: 'block', transition: 'transform 0.2s', marginBottom: '0.5rem' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                                <img src={logoTravel} alt="Dary Travel" style={{ height: '90px', width: 'auto' }} />
                            </a>
                            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', margin: 0 }}>
                                Екскурзии навсякъде по света
                            </p>
                        </div>
                        <div className="footer-card" style={{ 
                            background: 'rgba(255,255,255,0.03)', 
                            backdropFilter: 'blur(10px)', 
                            padding: '1.5rem', 
                            borderRadius: '24px', 
                            border: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            minWidth: '220px'
                        }}>
                            <h5 style={{ marginBottom: '1.2rem', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>КОНТАКТИ</h5>
                            <div className="footer-contact-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', alignItems: 'center' }}>
                                <a href="tel:0898481433" className="contact-item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'inherit' }}>
                                    <Phone size={14} /> 0898481433
                                </a>
                                <div className="contact-item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <MessageCircle size={14} /> dary.commerce@gmail.com
                                </div>
                                <Link 
                                    to="/signal" 
                                    className="signal-btn"
                                    style={{ 
                                        marginTop: '0.5rem',
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.6rem', 
                                        textDecoration: 'none', 
                                        color: '#fff',
                                        background: 'rgba(229,57,53,0.15)',
                                        padding: '0.6rem 1.2rem',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(229,57,53,0.3)',
                                        fontWeight: 700,
                                        fontSize: '0.85rem',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(229,57,53,0.25)';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(229,57,53,0.15)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                >
                                    <AlertTriangle size={14} color="#ff5252" /> Изпрати Сигнал
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Legal Info Bar */}
                <div style={{ 
                    maxWidth: '1200px', 
                    margin: '3rem auto 0', 
                    padding: '2rem 0', 
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem',
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.3)'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'center' }}>
                            <div><strong>ФИРМА:</strong> ДАРИ КОМЕРС - НА (ООД)</div>
                            <div><strong>АДРЕС:</strong> гр. Плевен, ул. ДАНАИЛ ПОПОВ 12</div>
                            <div><strong>УПРАВИТЕЛ:</strong> ДАРИНКА ЦВЕТАНОВА КРЪСТЕВА</div>
                            <div><strong>ЕИК/ДДС:</strong> BG114601542</div>
                        </div>
                        <div style={{ 
                            padding: '0.4rem 1.2rem', 
                            background: 'rgba(0,173,181,0.05)', 
                            borderRadius: '100px', 
                            border: '1px solid rgba(0,173,181,0.1)',
                            color: 'rgba(0,173,181,0.6)',
                            fontWeight: 700,
                            fontSize: '0.8rem'
                        }}>
                            Услугата се изпълнява по договор за обществен превоз с Община Плевен
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.02)', paddingTop: '1rem' }}>
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.65rem' }}>Контролни органи:</span>
                        <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>КЗП</a>
                        <span style={{ opacity: 0.3 }}>•</span>
                        <a href="https://www.rta.government.bg" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>ИААА</a>
                        <span style={{ opacity: 0.3 }}>•</span>
                        <a href="https://cpdp.bg" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>КЗЛД</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
