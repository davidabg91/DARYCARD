import React, { useMemo, useState } from 'react';
import { Ticket, X, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Bus } from 'lucide-react';
import { canPrint } from '../utils/terminalPrinter';
import { issueTicket } from '../utils/ticketPrinter';
import { destinationsFor, formatPrice, ticketLines, type Destination } from '../data/ticketing';

/**
 * Билети от терминала. Бутонът стои над всички екрани на устройството и НЕ иска
 * логване — шофьорът не влиза в системата.
 *
 * Избраната линия се пази в `sessionStorage`: държи, докато приложението е
 * отворено, и се забравя при затваряне — точно както се сменя курсът.
 */
const LINE_KEY = 'ticket_line';

const TicketButton: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [lineId, setLineId] = useState<string | null>(() => {
        try { return sessionStorage.getItem(LINE_KEY); } catch { return null; }
    });
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

    const lines = useMemo(() => ticketLines(), []);
    const line = useMemo(() => lines.find(l => l.id === lineId) || null, [lines, lineId]);
    const destinations = useMemo(() => (line ? destinationsFor(line) : []), [line]);

    // На терминала бутонът стои винаги. В браузър се показва само с ?ticket=1 —
    // за да може екранът да се прегледа, без да се вади терминал от автобус.
    // Печатът там пак отказва: хартия има само терминалът.
    const preview = typeof location !== 'undefined' && location.href.includes('ticket=1');
    if (!canPrint() && !preview) return null;

    const chooseLine = (id: string) => {
        setLineId(id);
        setNote(null);
        try { sessionStorage.setItem(LINE_KEY, id); } catch { /* няма къде да се запомни */ }
    };

    const changeLine = () => {
        setLineId(null);
        setNote(null);
        try { sessionStorage.removeItem(LINE_KEY); } catch { /* ignore */ }
    };

    const sell = async (d: Destination) => {
        if (!line || busy) return;
        const key = `${d.from}>${d.to}`;
        setBusy(key);
        setNote(null);
        try {
            // Издателят на хартия е НОМЕРЪТ на терминала (чл. 26, ал. 1, т. 6 допуска
            // име ИЛИ номер). Името на шофьора не се печата: терминалът не е логнат и
            // няма право да го чете. В справките номерът се превръща в име.
            const res = await issueTicket(line, d, '');
            setNote({
                ok: res.ok,
                text: res.ok
                    ? `Билет ${res.ticket?.number} — ${d.fromName} → ${d.toName}, ${formatPrice(d.price)}`
                    : res.message,
            });
        } finally {
            setBusy(null);
        }
    };

    const primary = destinations.filter(d => d.primary);
    const rest = destinations.filter(d => !d.primary);

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                aria-label="Издай билет"
                style={{
                    position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 9000,
                    width: '64px', height: '64px', borderRadius: '50%', border: 'none',
                    background: '#00c853', color: '#fff', boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                }}
            >
                <Ticket size={30} />
            </button>

            {open && (
                <div
                    style={{
                        // Плътен фон: екранът се гледа в движещ се автобус, понякога на слънце.
                        position: 'fixed', inset: 0, zIndex: 9001, background: '#0a0a0a',
                        display: 'flex', flexDirection: 'column'
                    }}
                >
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#fff' }}>
                            <Ticket size={22} color="#00c853" />
                            <strong style={{ fontSize: '1.05rem' }}>{line ? line.id : 'Избери линия'}</strong>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {line && (
                                <button
                                    onClick={changeLine}
                                    style={{
                                        padding: '0.5rem 0.8rem', borderRadius: '10px', fontWeight: 700,
                                        background: 'rgba(255,255,255,0.08)', color: '#fff',
                                        border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.8rem'
                                    }}
                                >
                                    Смени линия
                                </button>
                            )}
                            <button
                                onClick={() => setOpen(false)}
                                style={{
                                    width: '40px', height: '40px', borderRadius: '10px',
                                    background: 'rgba(255,255,255,0.08)', color: '#fff',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {note && (
                        <div style={{
                            margin: '0.75rem 1rem 0', padding: '0.7rem 0.9rem', borderRadius: '12px',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem',
                            color: note.ok ? '#00c853' : '#ff5252',
                            background: note.ok ? 'rgba(0,200,83,0.12)' : 'rgba(255,82,82,0.12)'
                        }}>
                            {note.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                            <span>{note.text}</span>
                        </div>
                    )}

                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {!line && lines.map(l => (
                            <button
                                key={l.id}
                                onClick={() => chooseLine(l.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.7rem', textAlign: 'left',
                                    padding: '1rem', borderRadius: '14px', background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
                                    fontSize: '1.05rem', fontWeight: 700
                                }}
                            >
                                <Bus size={20} color="#00c853" />
                                {l.id}
                            </button>
                        ))}

                        {line && [{ items: primary, label: null as string | null },
                                  { items: rest, label: 'Между спирките' }].map(({ items, label }) => (
                            items.length === 0 ? null : (
                                <React.Fragment key={label || 'main'}>
                                    {label && (
                                        <div style={{
                                            color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem',
                                            fontWeight: 800, textTransform: 'uppercase', margin: '0.75rem 0 0.25rem'
                                        }}>
                                            {label}
                                        </div>
                                    )}
                                    {items.map(d => {
                                        const key = `${d.from}>${d.to}`;
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => sell(d)}
                                                disabled={!!busy}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    gap: '0.75rem', padding: '1rem', borderRadius: '14px',
                                                    background: busy === key ? 'rgba(0,200,83,0.2)' : 'rgba(255,255,255,0.05)',
                                                    border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
                                                    opacity: busy && busy !== key ? 0.4 : 1
                                                }}
                                            >
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 700 }}>
                                                    {d.fromName}
                                                    <ArrowRight size={16} color="#00c853" />
                                                    {d.toName}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 900, color: '#00c853' }}>
                                                    {busy === key ? <Loader2 size={18} className="spin" /> : null}
                                                    {formatPrice(d.price)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </React.Fragment>
                            )
                        ))}
                    </div>
                </div>
            )}
        </>
    );
};

export default TicketButton;
