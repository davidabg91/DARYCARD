import React, { useState } from 'react';
import { Printer, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canPrint, printTestSlip, type PrintResult } from '../utils/terminalPrinter';

/**
 * Пробен печат от вградения принтер на терминала. Показва се САМО когато
 * приложението върви на самия терминал (APK) — от браузър няма какво да печата.
 */
const TestPrintCard: React.FC<{ deviceName?: string }> = ({ deviceName }) => {
    const { currentUser } = useAuth();
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<PrintResult | null>(null);

    if (!canPrint()) return null;

    const run = async () => {
        setBusy(true);
        setResult(null);
        try {
            setResult(await printTestSlip(currentUser?.username?.split('@')[0] || '', deviceName));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{
            background: 'rgba(0,145,234,0.05)', border: '1px solid rgba(0,145,234,0.25)',
            borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Printer size={20} color="#0091ea" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Пробен печат</h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                Отпечатва едно служебно листче от принтера на този терминал, за да се
                види работи ли печатът и как изглежда на хартия. Документът не е фискален.
            </p>

            {result && (
                <div style={{
                    fontSize: '0.8rem', padding: '0.6rem 0.8rem', borderRadius: '10px',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    color: result.ok ? '#00c853' : '#ff5252',
                    background: result.ok ? 'rgba(0,200,83,0.1)' : 'rgba(255,82,82,0.1)'
                }}>
                    {result.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    {result.message}
                </div>
            )}

            <button
                onClick={run}
                disabled={busy}
                style={{
                    padding: '0.7rem 1rem', borderRadius: '10px', background: '#0091ea', color: '#fff',
                    border: 'none', fontWeight: 800, fontSize: '0.9rem',
                    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                }}
            >
                {busy
                    ? <><Loader2 size={18} className="spin" /> Печата...</>
                    : <><Printer size={18} /> Отпечатай пробно листче</>}
            </button>
        </div>
    );
};

export default TestPrintCard;
