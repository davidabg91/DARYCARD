import React, { useState, useEffect } from 'react';
import { ShieldAlert, BellRing, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { enableAlert, syncAlert } from '../utils/pushAlerts';

/**
 * Регистрира ТОВА устройство за известия за сигурност (неуспешни опити за вход).
 * reportFailedLogin праща до всички записани токени. Състоянието идва от
 * `admin_push_tokens` — виж utils/pushAlerts.ts.
 */
const AdminAlertsButton: React.FC = () => {
    const { currentUser } = useAuth();
    // Стартово състояние: бутонът е готов за натискане. Сверяването с базата тече
    // отзад и може само да го ВДИГНЕ на „включено“ — ако то заседне (мрежа, service
    // worker), бутонът пак се натиска, вместо да остане на „Активиране...“.
    const [state, setState] = useState<'idle' | 'loading' | 'enabled' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    // Коя стъпка тече в момента — за да се вижда, че има движение, а не едно и също
    // „Активиране...“ без край.
    const [step, setStep] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        syncAlert('adminAlerts', currentUser ?? undefined)
            .then(s => { if (!cancelled && s === 'enabled') setState('enabled'); })
            .catch(err => console.error('Проверката на абонамента се провали:', err));
        return () => { cancelled = true; };
    }, [currentUser]);

    const handleEnable = async () => {
        setError(null);
        setState('loading');
        try {
            await enableAlert('adminAlerts', currentUser ?? undefined, setStep);
            setState('enabled');
        } catch (err: unknown) {
            console.error('Failed to enable admin alerts:', err);
            setError(err instanceof Error ? err.message : 'Грешка при активиране.');
            setState('error');
        } finally {
            setStep(null);
        }
    };

    return (
        <div style={{
            background: 'rgba(255,82,82,0.04)', border: '1px solid rgba(255,82,82,0.2)',
            borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ShieldAlert size={20} color="#ff5252" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Известия за сигурност</h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                Получавай push известие на това устройство при повтарящи се неуспешни опити за вход (с град, IP и брой опити).
            </p>

            {error && (
                <div style={{ fontSize: '0.78rem', color: '#ff5252', background: 'rgba(255,82,82,0.1)', padding: '0.6rem 0.8rem', borderRadius: '10px' }}>
                    {error}
                </div>
            )}

            {state === 'enabled' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#00c853', fontWeight: 700, fontSize: '0.9rem' }}>
                    <CheckCircle2 size={18} /> Активирано на това устройство
                </div>
            ) : (
                <button
                    onClick={handleEnable}
                    disabled={state === 'loading'}
                    style={{
                        padding: '0.85rem 1rem', borderRadius: '12px', background: '#ff5252', color: '#fff',
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

export default AdminAlertsButton;
