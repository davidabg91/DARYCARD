import React, { useState, useEffect } from 'react';
import { Bus, Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
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

    let lastBusIndex = -1;
    let nextBusIndex = -1;

    for (let i = 0; i < schedule.length; i++) {
        const busMins = getMinutes(schedule[i]);
        if (busMins <= currentMinutes) {
            lastBusIndex = i;
        } else if (busMins > currentMinutes && nextBusIndex === -1) {
            nextBusIndex = i;
        }
    }

    let progressPercentage = 0;
    let statusText = '';
    let statusColor = 'var(--text-secondary)';
    
    // Status text formatting
    if (nextBusIndex === -1 && lastBusIndex !== -1) {
        statusText = 'НЯМА ПОВЕЧЕ АВТОБУСИ ЗА ДНЕС';
        statusColor = 'rgba(255,255,255,0.4)';
        progressPercentage = 100;
    } else if (lastBusIndex === -1 && nextBusIndex !== -1) {
        statusText = `ПЪРВИ АВТОБУС В ${schedule[nextBusIndex]}`;
        statusColor = '#00c853';
        progressPercentage = 0;
    } else if (lastBusIndex !== -1 && nextBusIndex !== -1) {
        const lastMins = getMinutes(schedule[lastBusIndex]);
        const nextMins = getMinutes(schedule[nextBusIndex]);
        const totalGap = nextMins - lastMins;
        const elapsed = currentMinutes - lastMins;
        progressPercentage = Math.max(5, Math.min(95, (elapsed / totalGap) * 100));
        
        const minsLeft = nextMins - currentMinutes;
        statusText = `СЛЕДВАЩ АВТОБУС СЛЕД ${minsLeft} МИН`;
        statusColor = minsLeft <= 15 ? '#ffab00' : '#00e676';
    }

    // Colors derived from context
    const themeColor = '#00e676'; // Primary Dary Accent

    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px',
            padding: '1.5rem',
            width: '100%',
            fontFamily: '"Outfit", "Inter", sans-serif',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.5s ease',
            color: '#fff',
            marginTop: '1rem'
        }}>
            {/* Header / Direction Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: themeColor }}>
                    <Bus size={20} />
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '1px' }}>ГРАФИК АВТОБУСИ</span>
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
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.3s'
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
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.3s'
                        }}
                    >
                        ОТ {route.toUpperCase()}
                    </button>
                </div>
            </div>

            {/* Title */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>{origin}</span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#111', padding: '0 8px' }}>
                        <MapPin size={14} color={themeColor} />
                    </div>
                </div>
                <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>{destination}</span>
            </div>

            {/* Current Status Badge */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ 
                    display: 'inline-block', 
                    padding: '6px 16px', 
                    background: `${statusColor}22`, 
                    color: statusColor, 
                    borderRadius: '50px',
                    fontWeight: 900,
                    fontSize: '0.8rem',
                    border: `1px solid ${statusColor}44`
                }}>
                    {statusText}
                </div>
            </div>

            {/* Live Timeline Component */}
            <div style={{ position: 'relative', height: '60px', marginBottom: '1rem', padding: '0 20px' }}>
                {/* Background Line */}
                <div style={{ position: 'absolute', top: '50%', left: '20px', right: '20px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', transform: 'translateY(-50%)' }} />
                
                {/* Active Progress Line */}
                <div style={{ 
                    position: 'absolute', top: '50%', left: '20px', height: '4px', 
                    background: themeColor, borderRadius: '2px', transform: 'translateY(-50%)',
                    width: `calc(${progressPercentage}% - 20px)`,
                    transition: 'width 1s ease-in-out'
                }} />

                {/* The Bus Icon */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: `calc(20px + (100% - 40px) * ${progressPercentage / 100})`,
                    transform: 'translate(-50%, -50%)',
                    width: '32px',
                    height: '32px',
                    background: '#111',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `2px solid ${themeColor}`,
                    boxShadow: `0 0 15px ${themeColor}66`,
                    transition: 'left 1s ease-in-out',
                    zIndex: 2
                }}>
                    <Bus size={16} color={themeColor} />
                </div>

                {/* Nodes on Timeline */}
                {lastBusIndex !== -1 && (
                    <div style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translate(-50%, 15px)', color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 800 }}>
                        {schedule[lastBusIndex]}
                    </div>
                )}
                {nextBusIndex !== -1 && (
                    <div style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translate(50%, 15px)', color: '#fff', fontSize: '0.85rem', fontWeight: 900 }}>
                        {schedule[nextBusIndex]}
                    </div>
                )}
            </div>

            {/* Expandable Full Schedule */}
            <div style={{ marginTop: '2rem' }}>
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        padding: '12px',
                        borderRadius: '16px',
                        color: 'rgba(255,255,255,0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'all 0.3s'
                    }}
                >
                    <Clock size={16} /> 
                    {isExpanded ? 'СКРИЙ ГРАФИКА' : 'ВИЖ ЦЕЛИЯ ГРАФИК'}
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {isExpanded && (
                    <div style={{ 
                        marginTop: '1rem', 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', 
                        gap: '8px',
                        animation: 'fadeIn 0.3s ease'
                    }}>
                        {schedule.map((time, index) => {
                            const isPast = getMinutes(time) < currentMinutes;
                            const isNext = index === nextBusIndex;
                            
                            return (
                                <div key={time} style={{
                                    background: isNext ? `${themeColor}22` : (isPast ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.05)'),
                                    color: isNext ? themeColor : (isPast ? 'rgba(255,255,255,0.3)' : '#fff'),
                                    border: `1px solid ${isNext ? themeColor : 'rgba(255,255,255,0.05)'}`,
                                    padding: '8px 4px',
                                    borderRadius: '8px',
                                    textAlign: 'center',
                                    fontSize: '0.85rem',
                                    fontWeight: isNext ? 900 : 700,
                                    position: 'relative'
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
