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
    
    // Zoomed window: From current time - 30 mins to current time + 180 mins (3 hours)
    const windowStart = currentMinutes - 30;
    const windowEnd = currentMinutes + 180;
    const windowRange = windowEnd - windowStart;
    
    // Calculate progress (fixed at start for the "now" bus icon)
    const dayProgress = Math.max(0, Math.min(100, ((currentMinutes - windowStart) / windowRange) * 100));

    // Visible dots: Only next 4 buses that fit in the 3-hour window
    const visibleBuses = schedule.filter(time => {
        const mins = getMinutes(time);
        return mins > currentMinutes && mins <= windowEnd;
    }).slice(0, 4);

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

            {/* Timeline with Labels and Dots */}
            <div style={{ position: 'relative', height: '80px', marginBottom: '1rem' }}>
                {/* Labels at ends */}
                <div style={{ position: 'absolute', left: 0, top: '70%', fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>
                    {origin}
                </div>
                <div style={{ position: 'absolute', right: 0, top: '70%', fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>
                    {destination}
                </div>

                {/* Main Line */}
                <div style={{ 
                    position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', 
                    background: 'rgba(255,255,255,0.1)', 
                    borderRadius: '1px', transform: 'translateY(-50%)' 
                }} />
                
                {/* Schedule Dots */}
                {visibleBuses.map((time) => {
                    const mins = getMinutes(time);
                    const pos = Math.max(0, Math.min(100, ((mins - windowStart) / windowRange) * 100));
                    
                    return (
                        <div key={time} style={{
                            position: 'absolute',
                            left: `${pos}%`,
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            zIndex: 1
                        }}>
                            <div style={{ 
                                width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.4)', 
                                border: '2px solid #111'
                            }} />
                            <div style={{ 
                                marginTop: '12px', fontSize: '0.75rem', fontWeight: 800, 
                                color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.3)',
                                padding: '2px 4px', borderRadius: '4px'
                            }}>
                                {time}
                            </div>
                        </div>
                    );
                })}

                {/* The Bus Icon (Live Indicator) */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${dayProgress}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '38px',
                    height: '38px',
                    background: '#111',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${themeColor}`,
                    boxShadow: `0 0 20px ${themeColor}44`,
                    zIndex: 2,
                    transition: 'left 1s ease-in-out'
                }}>
                    <Bus size={20} color={themeColor} />
                    <div style={{ 
                        position: 'absolute', bottom: '-22px', fontSize: '0.8rem', fontWeight: 900, 
                        color: themeColor, whiteSpace: 'nowrap', background: 'rgba(0,230,118,0.1)',
                        padding: '1px 6px', borderRadius: '6px'
                    }}>
                        {currentTime.getHours().toString().padStart(2, '0')}:{currentTime.getMinutes().toString().padStart(2, '0')}
                    </div>
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
