import React, { useState, useEffect } from 'react';
import { Bus } from 'lucide-react';
import { SCHEDULES } from '../data/schedules';
import { abbreviate } from '../data/routeMetadata';

interface BusScheduleProps {
    route: string;
}

const BusSchedule: React.FC<BusScheduleProps> = ({ route }) => {
    const isBarkachRoute = ['Дисевица', 'Търнене', 'Градина', 'Петърница', 'Телиш', 'Ракита', 'Радомирци'].includes(route);
    const scheduleData = isBarkachRoute ? SCHEDULES['Бъркач'] : SCHEDULES[route];
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    if (!scheduleData) return null;

    const day = currentTime.getDay();
    const isSunday = day === 0;
    const isSaturday = day === 6;
    
    let activeSchedule = scheduleData;
    if (isSunday && scheduleData.sunday) {
        activeSchedule = scheduleData.sunday;
    } else if (isSaturday && scheduleData.saturday) {
        activeSchedule = scheduleData.saturday;
    }

    const getMinutes = (timeStr: string) => {
        const parts = timeStr.split(':');
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]); // parseInt handles strings like "00 (ново)" correctly
        return hours * 60 + minutes;
    };

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    // Determine labels based on route name
    let fromLabel = 'ПЛЕВЕН';
    let toLabel = route.toUpperCase();
    if (route.includes(' - ')) {
        const parts = route.split(' - ');
        fromLabel = parts[0].toUpperCase();
        toLabel = parts[1].toUpperCase();
    }

    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '24px',
            padding: '1.5rem',
            width: '100%',
            fontFamily: '"Outfit", "Inter", sans-serif',
            color: '#fff',
            marginTop: '1.5rem'
        }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00e676' }}>
                    <Bus size={20} />
                    <span style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '1px' }}>РАЗПИСАНИЕ АВТОБУСИ</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                    ({isSunday ? 'неделя' : 
                      isSaturday ? 'събота' : 
                      (route === 'Тръстеник' ? 'понеделник-събота' : 'делнични дни')})
                </div>
                {isBarkachRoute && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.75rem', color: '#ffb74d', fontWeight: 600, textAlign: 'center', marginTop: '6px', maxWidth: '90%' }}>
                            * Посочените часове са за курса до Бъркач. Автобусът обслужва и {abbreviate(route)}.
                        </div>
                        <div style={{ 
                            fontSize: '0.75rem', 
                            color: '#00e676', 
                            fontWeight: 800, 
                            textAlign: 'center', 
                            marginTop: '2px', 
                            maxWidth: '90%', 
                            padding: '4px 12px', 
                            background: 'rgba(0, 230, 118, 0.05)', 
                            borderRadius: '100px',
                            border: '1px solid rgba(0, 230, 118, 0.1)'
                        }}>
                             ВАЖНО: Има промяна в разписанието за делнични дни (отбелязани с "ново").
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Outward */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: '4px' }}>ОТ {fromLabel}</div>
                            {activeSchedule.fromPleven.map(time => {
                                const isPast = getMinutes(time) < currentMinutes;
                                const isNext = !isPast && activeSchedule.fromPleven.find(t => getMinutes(t) >= currentMinutes) === time;
                                const isNew = time.includes('*');
                                const displayTime = time.replace('*', '');
                                
                                return (
                                    <div key={time} style={{
                                        background: isNext ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255,255,255,0.03)',
                                        color: isNext ? '#00e676' : (isPast ? 'rgba(255,255,255,0.2)' : '#fff'),
                                        padding: '8px',
                                        paddingTop: isNew ? '12px' : '8px', // Adjust padding for badge
                                        borderRadius: '10px',
                                        textAlign: 'center',
                                        fontSize: '0.9rem',
                                        fontWeight: isNext ? 900 : 700,
                                        border: isNext ? '1px solid #00e676' : '1px solid transparent',
                                        position: 'relative' // For badge positioning
                                    }}>
                                        {isNew && (
                                            <span style={{
                                                position: 'absolute',
                                                top: '-8px',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                background: '#ff5252',
                                                color: '#fff',
                                                fontSize: '0.55rem',
                                                fontWeight: 900,
                                                padding: '2px 6px',
                                                borderRadius: '6px',
                                                textTransform: 'uppercase',
                                                zIndex: 5,
                                                boxShadow: '0 2px 4px rgba(255, 82, 82, 0.3)',
                                                letterSpacing: '0.5px'
                                            }}>ново</span>
                                        )}
                                        {displayTime}
                                    </div>
                                );
                            })}
                        </div>

                {/* Return */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: '4px' }}>ОТ {toLabel === 'ПЛЕВЕН' ? 'ДЕСТИНАЦИЯ' : toLabel}</div>
                            {activeSchedule.fromDestination.map(time => {
                                const isPast = getMinutes(time) < currentMinutes;
                                const isNext = !isPast && activeSchedule.fromDestination.find(t => getMinutes(t) >= currentMinutes) === time;
                                const isNew = time.includes('*');
                                const displayTime = time.replace('*', '');

                                return (
                                    <div key={time} style={{
                                        background: isNext ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255,255,255,0.03)',
                                        color: isNext ? '#00e676' : (isPast ? 'rgba(255,255,255,0.2)' : '#fff'),
                                        padding: '8px',
                                        paddingTop: isNew ? '12px' : '8px',
                                        borderRadius: '10px',
                                        textAlign: 'center',
                                        fontSize: '0.9rem',
                                        fontWeight: isNext ? 900 : 700,
                                        border: isNext ? '1px solid #00e676' : '1px solid transparent',
                                        position: 'relative'
                                    }}>
                                        {isNew && (
                                            <span style={{
                                                position: 'absolute',
                                                top: '-8px',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                background: '#ff5252',
                                                color: '#fff',
                                                fontSize: '0.55rem',
                                                fontWeight: 900,
                                                padding: '2px 6px',
                                                borderRadius: '6px',
                                                textTransform: 'uppercase',
                                                zIndex: 5,
                                                boxShadow: '0 2px 4px rgba(255, 82, 82, 0.3)',
                                                letterSpacing: '0.5px'
                                            }}>ново</span>
                                        )}
                                        {displayTime}
                                    </div>
                                );
                            })}
                        </div>
            </div>
        </div>
    );
};

export default BusSchedule;
