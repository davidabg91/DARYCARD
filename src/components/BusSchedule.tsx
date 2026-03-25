import React, { useState, useEffect } from 'react';
import { Bus } from 'lucide-react';
import { SCHEDULES } from '../data/schedules';

interface BusScheduleProps {
    route: string;
}

const BusSchedule: React.FC<BusScheduleProps> = ({ route }) => {
    const scheduleData = SCHEDULES[route];
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    if (!scheduleData) return null;

    const isSunday = currentTime.getDay() === 0;
    const activeSchedule = (isSunday && scheduleData.sunday) ? scheduleData.sunday : scheduleData;

    const getMinutes = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

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
                {['Тръстеник', 'Рибен', 'Долни Дъбник', 'Садовец'].includes(route) && (
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                        ({isSunday ? 'неделя' : 'понеделник-събота'})
                    </div>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* From Pleven */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: '4px' }}>ОТ ПЛЕВЕН</div>
                    {activeSchedule.fromPleven.map(time => {
                        const isPast = getMinutes(time) < currentMinutes;
                        const isNext = !isPast && activeSchedule.fromPleven.find(t => getMinutes(t) >= currentMinutes) === time;
                        return (
                            <div key={time} style={{
                                background: isNext ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255,255,255,0.03)',
                                color: isNext ? '#00e676' : (isPast ? 'rgba(255,255,255,0.2)' : '#fff'),
                                padding: '8px',
                                borderRadius: '10px',
                                textAlign: 'center',
                                fontSize: '0.9rem',
                                fontWeight: isNext ? 900 : 700,
                                border: isNext ? '1px solid #00e676' : '1px solid transparent'
                            }}>
                                {time}
                            </div>
                        );
                    })}
                </div>

                {/* To Pleven */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: '4px' }}>ОТ {route.toUpperCase()}</div>
                    {activeSchedule.fromDestination.map(time => {
                        const isPast = getMinutes(time) < currentMinutes;
                        const isNext = !isPast && activeSchedule.fromDestination.find(t => getMinutes(t) >= currentMinutes) === time;
                        return (
                            <div key={time} style={{
                                background: isNext ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255,255,255,0.03)',
                                color: isNext ? '#00e676' : (isPast ? 'rgba(255,255,255,0.2)' : '#fff'),
                                padding: '8px',
                                borderRadius: '10px',
                                textAlign: 'center',
                                fontSize: '0.9rem',
                                fontWeight: isNext ? 900 : 700,
                                border: isNext ? '1px solid #00e676' : '1px solid transparent'
                            }}>
                                {time}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default BusSchedule;
