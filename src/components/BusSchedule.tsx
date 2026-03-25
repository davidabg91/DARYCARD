import React, { useState, useEffect } from 'react';
import { Bus, ChevronDown, ChevronUp } from 'lucide-react';
import { SCHEDULES } from '../data/schedules';

interface BusScheduleProps {
    route: string;
}

const BusSchedule: React.FC<BusScheduleProps> = ({ route }) => {
    const scheduleData = SCHEDULES[route];
    const [currentTime, setCurrentTime] = useState(new Date());
    const [direction, setDirection] = useState<'fromPleven' | 'fromDestination'>('fromPleven');
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000); // update every minute
        return () => clearInterval(timer);
    }, []);

    if (!scheduleData) {
        return null;
    }

    const schedule = direction === 'fromPleven' ? scheduleData.fromPleven : scheduleData.fromDestination;
    const origin = direction === 'fromPleven' ? 'ПЛЕВЕН' : route.toUpperCase();
    const destination = direction === 'fromPleven' ? route.toUpperCase() : 'ПЛЕВЕН';

    const getMinutes = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    
    // Day relative progress: From 05:00 to 22:00 for calculation scale
    const startDayMins = getMinutes(schedule[0]) - 60; // 1 hour before first bus
    const endDayMins = getMinutes(schedule[schedule.length - 1]) + 60; // 1 hour after last bus
    const totalDayRange = endDayMins - startDayMins;
    const dayProgress = Math.max(0, Math.min(100, ((currentMinutes - startDayMins) / totalDayRange) * 100));

    const upcomingBuses = schedule.filter(time => getMinutes(time) > currentMinutes).slice(0, 4);

    const themeColor = '#00e676';

    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px',
            padding: '1.5rem',
            width: '100%',
            fontFamily: '"Outfit", "Inter", sans-serif',
            color: '#fff',
            marginTop: '1rem'
        }}>
            {/* Header / Direction Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: themeColor }}>
                    <Bus size={20} />
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '1px' }}>ГРАФИК</span>
                </div>
                
                <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '12px', padding: '4px', display: 'flex', gap: '4px' }}>
                    <button
                        onClick={() => setDirection('fromPleven')}
                        style={{
                            background: direction === 'fromPleven' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: direction === 'fromPleven' ? '#fff' : 'rgba(255,255,255,0.4)',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            cursor: 'pointer'
                        }}
                    >
                        ОТ ПЛЕВЕН
                    </button>
                    <button
                        onClick={() => setDirection('fromDestination')}
                        style={{
                            background: direction === 'fromDestination' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: direction === 'fromDestination' ? '#fff' : 'rgba(255,255,255,0.4)',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            cursor: 'pointer'
                        }}
                    >
                        ОТ {route.toUpperCase()}
                    </button>
                </div>
            </div>

            {/* Timeline with Labels */}
            <div style={{ position: 'relative', height: '60px', marginBottom: '1.5rem' }}>
                {/* Labels at ends */}
                <div style={{ position: 'absolute', left: 0, top: '100%', transform: 'translateY(-5px)', fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>
                    {origin}
                </div>
                <div style={{ position: 'absolute', right: 0, top: '100%', transform: 'translateY(-5px)', fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>
                    {destination}
                </div>

                {/* Main Line */}
                <div style={{ 
                    position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', 
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.2), rgba(255,255,255,0.05))', 
                    borderRadius: '1px', transform: 'translateY(-50%)' 
                }} />
                
                {/* The Bus Icon */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${dayProgress}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '36px',
                    height: '36px',
                    background: '#111',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${themeColor}`,
                    boxShadow: `0 0 15px ${themeColor}33`,
                    zIndex: 2,
                    transition: 'left 1s ease-in-out'
                }}>
                    <Bus size={18} color={themeColor} />
                    <div style={{ position: 'absolute', top: '-18px', fontSize: '0.7rem', fontWeight: 900, color: themeColor }}>
                        {currentTime.getHours().toString().padStart(2, '0')}:{currentTime.getMinutes().toString().padStart(2, '0')}
                    </div>
                </div>
            </div>

            {/* Upcoming Departures - "Simple hours below the line" */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    {upcomingBuses.length > 0 ? 'СЛЕДВАЩИ АВТОБУСИ:' : 'НЯМА ПОВЕЧЕ ЗА ДНЕС'}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {upcomingBuses.map((time, idx) => (
                        <div key={time} style={{
                            background: idx === 0 ? `${themeColor}22` : 'rgba(255,255,255,0.05)',
                            color: idx === 0 ? themeColor : '#fff',
                            padding: '10px 14px',
                            borderRadius: '12px',
                            fontSize: '0.9rem',
                            fontWeight: 900,
                            border: `1px solid ${idx === 0 ? themeColor : 'rgba(255,255,255,0.1)'}`,
                            flex: 1,
                            textAlign: 'center',
                            minWidth: '70px'
                        }}>
                            {time}
                        </div>
                    ))}
                </div>
            </div>

            {/* Expandable Full Schedule */}
            <div style={{ marginTop: '1.5rem' }}>
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: '8px',
                        color: 'rgba(255,255,255,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer'
                    }}
                >
                    {isExpanded ? 'СКРИЙ ВСИЧКИ' : 'ВИЖ ПЪЛНИЯ ГРАФИК'}
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {isExpanded && (
                    <div style={{ 
                        marginTop: '1rem', 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', 
                        gap: '6px',
                        animation: 'fadeIn 0.3s ease'
                    }}>
                        {schedule.map((time) => {
                            const isPast = getMinutes(time) < currentMinutes;
                            return (
                                <div key={time} style={{
                                    background: isPast ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.03)',
                                    color: isPast ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    textAlign: 'center',
                                    fontSize: '0.75rem',
                                    fontWeight: 700
                                }}>
                                    {time}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default BusSchedule;
