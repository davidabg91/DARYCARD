import React, { useState, useEffect } from 'react';
import { AlertTriangle, BellRing, BellOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { enableAlert, disableAlert, syncAlert } from '../utils/pushAlerts';

/**
 * Абонира ТОВА устройство за push известие в момента, в който карта без валиден
 * абонамент бъде сканирана (виж alertUnpaidScan). Състоянието на бутона идва от
 * `admin_push_tokens`, а не от localStorage — виж utils/pushAlerts.ts защо.
 */
const UnpaidAlertsButton: React.FC = () => {
    const { currentUser } = useAuth();
    // Стартово състояние: бутонът е готов за натискане. Сверяването с базата тече
    // отзад и може само да го ВДИГНЕ на „включено“ — ако то заседне (мрежа, service
    // worker), бутонът пак се натиска, вместо да остане на „Активиране...“.
    const [state, setState] = useState<'idle' | 'loading' | 'enabled' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    // Коя стъпка тече в момента — за да се вижда, че има движение, а не едно и също
    // „Активиране...“ без край.
    const [step, setStep] = useState<string | null>(null);

    // Истинското състояние при отваряне на таба. Ако устройството е искало
    // известия, но токенът му е бил подменен, записът се вдига наново тук.
    useEffect(() => {
        let cancelled = false;
        syncAlert('unpaidAlerts', currentUser ?? undefined)
            .then(s => { if (!cancelled && s === 'enabled') setState('enabled'); })
            .catch(err => console.error('Проверката на абонамента се провали:', err));
        return () => { cancelled = true; };
    }, [currentUser]);

    const handleEnable = async () => {
        setError(null);
        setState('loading');
        try {
            await enableAlert('unpaidAlerts', currentUser ?? undefined, setStep);
            setState('enabled');
        } catch (err: unknown) {
            console.error('Failed to enable unpaid alerts:', err);
            setError(err instanceof Error ? err.message : 'Грешка при активиране.');
            setState('error');
        } finally {
            setStep(null);
        }
    };

    const handleDisable = async () => {
        setError(null);
        setState('loading');
        try {
            await disableAlert('unpaidAlerts');
            setState('idle');
        } catch (err: unknown) {
            console.error('Failed to disable unpaid alerts:', err);
            setError(err instanceof Error ? err.message : 'Грешка при изключване.');
            setState('error');
        }
    };

    return (
        <div style={{
            background: 'rgba(255,152,0,0.05)', border: '1px solid rgba(255,152,0,0.25)',
            borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <AlertTriangle size={20} color="#ff9800" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Известия за пътуване без абонамент</h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                Получавай push известие на това устройство веднага щом някой сканира карта без платен абонамент (с име, номер на картата, маршрут и час) — за да идеш на проверка в автобуса.
            </p>

            {error && (
                <div style={{ fontSize: '0.78rem', color: '#ff5252', background: 'rgba(255,82,82,0.1)', padding: '0.6rem 0.8rem', borderRadius: '10px' }}>
                    {error}
                </div>
            )}

            {state === 'enabled' ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#00c853', fontWeight: 700, fontSize: '0.9rem' }}>
                        <CheckCircle2 size={18} /> Активирано на това устройство
                    </div>
                    <button
                        onClick={handleDisable}
                        style={{
                            padding: '0.55rem 0.9rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#fff',
                            border: '1px solid var(--surface-border)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        <BellOff size={16} /> Изключи
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleEnable}
                    disabled={state === 'loading'}
                    style={{
                        padding: '0.85rem 1rem', borderRadius: '12px', background: '#ff9800', color: '#000',
                        border: 'none', fontWeight: 800, fontSize: '0.9rem', cursor: state === 'loading' ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem'
                    }}
                >
                    {state === 'loading'
                        ? <><Loader2 size={18} className="spin" /> {step ? `${step}...` : 'Активиране...'}</>
                        : <><BellRing size={18} /> Активирай на това устройство</>}
                </button>
            )}
        </div>
    );
};

export default UnpaidAlertsButton;
