import React, { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AlertOctagon, X, Loader2, CheckCircle2, ArrowLeft, Bus, Wrench, Ban, Car, Clock, Signpost, WifiOff } from 'lucide-react';
import app from '../firebase';
import { getDeviceId } from '../utils/deviceHeartbeat';
import { ticketLines } from '../data/ticketing';
import { routeSlug } from '../data/routeSlugs';

/**
 * Червеният бутон на терминала: отменен курс или смущение (Наредба Н-7 —
 * „анулирани курсове“ и „прекъсвания и смущения“, подавани без забавяне).
 *
 * Стои най-долу на ВСЕКИ екран, но само в приложението на терминала
 * (`Capacitor.isNativePlatform()` — същото условие като бутона за билети). В
 * браузър го няма, за да не може всеки да подава сигнали. Сървърът проверява и
 * сам: приема само от терминал, на който админът е дал име в УСТРОЙСТВА.
 *
 * Шофьорът казва какво се е случило; кой курс е — го знае системата от GPS. Ако
 * не го знае (първи курс, още няма въведени точки), пита шофьора: първо линията,
 * после часа на тръгване. Всичко минава през функцията `reportDisruption` —
 * терминалът няма право да пише в `disruptions` сам.
 *
 * Преглед от браузър: `?disruption=1` (сървърът ще откаже — браузърът не е терминал).
 *
 * На екрана на сканираната карта лентата отдолу би закрила долния край на
 * картата, а шофьорът трябва да я вижда цялата. Затова там картата слага бутона
 * под себе си (`variant="inline"`), а лентата се скрива, докато той е на екрана.
 *
 * Без връзка сигналът не се губи: пази се в терминала и се праща сам, щом има
 * интернет (на 30 s и при връщане на връзката), с това преди колко време е
 * натиснат. Сървърът тогава не може да подскаже курса, затова терминалът пита
 * шофьора само за линията — от собствения си списък, без сървър.
 */

/** Същите видове и етикети като functions/src/disruptionKinds.ts. */
const KINDS = [
    { id: 'breakdown', label: 'Авария — курсът не продължава', icon: Wrench },
    { id: 'cancelled', label: 'Курсът е отменен', icon: Ban },
    { id: 'accident', label: 'Пътен инцидент', icon: Car },
    { id: 'delay', label: 'Голямо закъснение', icon: Clock },
    { id: 'detour', label: 'Отклонение / затворен път', icon: Signpost },
] as const;

/** Височината на лентата — толкова място се оставя най-долу на всяка страница. */
export const DISRUPTION_BAR_PX = 64;

interface TripOption { key: string; routeId: string; routeName: string; departure: string; from: string; to: string }
interface Active { id: string; kind: string; label: string; routeName: string; departure: string; at: string }

// Общо за лентата и бутона под картата: бутонът се качва при всяко сканиране и
// не бива всеки път да пита сървъра — пита го само ако последното е по-старо.
const STATUS_EVERY_MS = 5 * 60 * 1000;
let lastActive: Active[] = [];
let lastStatusAt = 0;
// Колко бутона под карта има на екрана — докато има поне един, лентата се крие.
let inlineShown = 0;
const inlineListeners = new Set<(n: number) => void>();
const setInlineShown = (delta: number) => {
    inlineShown += delta;
    inlineListeners.forEach(f => f(inlineShown));
};
// ── Опашката без връзка ──────────────────────────────────────────────────────
const QUEUE_KEY = 'dary_disruption_queue';
const FLUSH_EVERY_MS = 30 * 1000;
interface Queued { id: string; action: 'report' | 'resolve'; kind?: string; routeId?: string; pressedAt: number }

const readQueue = (): Queued[] => {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as Queued[]; } catch { return []; }
};
const queueListeners = new Set<(n: number) => void>();
const writeQueue = (q: Queued[]) => {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* пълна памет — няма какво да се направи */ }
    queueListeners.forEach(f => f(q.length));
};
const enqueue = (item: Omit<Queued, 'id' | 'pressedAt'>) =>
    writeQueue([...readQueue(), { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, pressedAt: Date.now() }]);

let flushing = false;
/** Праща чакащите по ред. Спира при първата липса на връзка — ще опита пак. */
const flushQueue = async (): Promise<boolean> => {
    if (flushing) return false;
    flushing = true;
    let sent = false;
    try {
        for (const item of readQueue()) {
            try {
                // ageMs е мерено с часовника на терминала и в двата края, затова
                // сгрешен часовник не мести часа на сигнала.
                const r = await call({ action: item.action, kind: item.kind, routeId: item.routeId, ageMs: Math.max(1, Date.now() - item.pressedAt) });
                if (!r.ok) console.warn('Чакащ сигнал не е приет:', r.error);
            } catch {
                break;   // още няма връзка
            }
            writeQueue(readQueue().filter(q => q.id !== item.id));
            sent = true;
        }
    } finally {
        flushing = false;
    }
    return sent;
};

interface Reply {
    ok: boolean;
    error?: string;
    active?: Active[];
    needTrip?: boolean;
    options?: TripOption[];
    lines?: Array<{ routeId: string; routeName: string }>;
    routeName?: string;
    departure?: string;
    matchedBy?: 'gps' | 'driver';
    resolved?: number;
}

type Step =
    | { at: 'kind' }
    | { at: 'confirm'; kind: string }
    | { at: 'line'; kind: string; options: TripOption[]; lines: Array<{ routeId: string; routeName: string }> }
    | { at: 'trip'; kind: string; routeName: string; options: TripOption[] }
    | { at: 'offline'; kind: string }
    | { at: 'done'; text: string };

const call = async (payload: Record<string, unknown>): Promise<Reply> => {
    // Без отговор до 15 s се води „няма връзка“ — шофьорът не бива да чака минута.
    const fn = httpsCallable<Record<string, unknown>, Reply>(getFunctions(app), 'reportDisruption', { timeout: 15_000 });
    const res = await fn({ deviceId: getDeviceId(), ...payload });
    return res.data;
};

const big: React.CSSProperties = {
    width: '100%', padding: '1.15rem 1.1rem', borderRadius: '18px', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '0.9rem', fontSize: '1.2rem', fontWeight: 800,
    textAlign: 'left', color: '#fff', background: '#1f1f1f',
};

interface Props {
    /** bar — лентата най-долу на всеки екран; inline — бутон под сканираната карта. */
    variant?: 'bar' | 'inline';
}

const DisruptionButton: React.FC<Props> = ({ variant = 'bar' }) => {
    const preview = typeof location !== 'undefined' && location.href.includes('disruption=1');
    const enabled = Capacitor.isNativePlatform() || preview;
    const inline = variant === 'inline';

    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<Step>({ at: 'kind' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [active, setActive] = useState<Active[]>(lastActive);
    const [cardOnScreen, setCardOnScreen] = useState(inlineShown > 0);
    const [waiting, setWaiting] = useState(() => readQueue().length);

    const refresh = useCallback(async () => {
        try {
            const r = await call({ action: 'status' });
            if (r.ok) {
                lastActive = r.active || [];
                lastStatusAt = Date.now();
                setActive(lastActive);
            }
        } catch { /* без връзка — показваме последното известно */ }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        if (inline) {
            setInlineShown(1);
            if (Date.now() - lastStatusAt > STATUS_EVERY_MS) void refresh();
            return () => setInlineShown(-1);
        }
        void refresh();
        const t = setInterval(refresh, STATUS_EVERY_MS);
        const onInline = (n: number) => setCardOnScreen(n > 0);
        inlineListeners.add(onInline);
        // Чакащите сигнали — само лентата ги праща, тя е винаги на екрана.
        const flush = () => { void flushQueue().then(sent => { if (sent) void refresh(); }); };
        flush();
        const f = setInterval(flush, FLUSH_EVERY_MS);
        window.addEventListener('online', flush);
        // Място най-долу на всяка страница, за да не закрива лентата съдържание.
        const style = document.createElement('style');
        style.textContent = `body { padding-bottom: ${DISRUPTION_BAR_PX + 8}px !important; }`;
        document.head.appendChild(style);
        return () => {
            clearInterval(t); clearInterval(f); window.removeEventListener('online', flush);
            inlineListeners.delete(onInline); style.remove();
        };
    }, [enabled, inline, refresh]);

    useEffect(() => {
        queueListeners.add(setWaiting);
        return () => { queueListeners.delete(setWaiting); };
    }, []);

    if (!enabled) return null;

    const close = () => { setOpen(false); setStep({ at: 'kind' }); setError(''); };

    const run = async (payload: Record<string, unknown>, kind: string) => {
        setBusy(true);
        setError('');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            setBusy(false);
            setStep({ at: 'offline', kind });
            return;
        }
        try {
            const r = await call({ action: 'report', kind, ...payload });
            if (!r.ok) { setError(r.error || 'Сигналът не беше приет.'); return; }
            if (r.needTrip) {
                setStep({ at: 'line', kind, options: r.options || [], lines: r.lines || [] });
                return;
            }
            setStep({
                at: 'done',
                text: `Подадено: ${r.routeName}${r.departure ? `, курс ${r.departure}` : ''}. ${r.matchedBy === 'gps' ? 'Курсът е разпознат по GPS.' : ''}`,
            });
            void refresh();
        } catch {
            // Без връзка — сигналът се пази и тръгва сам, щом се появи интернет.
            setStep({ at: 'offline', kind });
        } finally {
            setBusy(false);
        }
    };

    /** Запазва сигнала за по-късно; `routeId` — линията, която шофьорът посочи. */
    const keepForLater = (kind: string, routeId?: string) => {
        enqueue({ action: 'report', kind, routeId });
        setStep({ at: 'done', text: 'Няма връзка — сигналът е запазен и ще се изпрати сам, щом терминалът хване интернет.' });
    };

    const resolve = async () => {
        setBusy(true);
        setError('');
        try {
            const r = await call({ action: 'resolve' });
            if (!r.ok) { setError(r.error || 'Не стана.'); return; }
            setStep({ at: 'done', text: 'Сигналът е прекратен — движението е нормално.' });
            void refresh();
        } catch {
            enqueue({ action: 'resolve' });
            lastActive = [];
            setActive([]);
            setStep({ at: 'done', text: 'Няма връзка — прекратяването е запазено и ще се изпрати сам, щом има интернет.' });
        } finally {
            setBusy(false);
        }
    };

    const kindLabel = (id: string) => KINDS.find(k => k.id === id)?.label || '';
    const current = active[0];

    return (
        <>
            {!(cardOnScreen && !inline) && <button
                onClick={e => { e.stopPropagation(); setOpen(true); void refresh(); }}
                aria-label="Отменен курс или смущение"
                style={{
                    ...(inline
                        ? { position: 'relative', width: '100%', marginTop: '1rem', borderRadius: '22px' }
                        : { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50000 }),
                    height: `${DISRUPTION_BAR_PX}px`, border: 'none', cursor: 'pointer',
                    background: current ? '#b71c1c' : '#e53935', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem',
                    fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.04em',
                    boxShadow: '0 -4px 18px rgba(0,0,0,0.5)', padding: '0 1rem',
                }}
            >
                <AlertOctagon size={26} />
                {current
                    ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>АКТИВЕН СИГНАЛ: {current.routeName}{current.departure ? ` ${current.departure}` : ''}</span>
                    : 'ОТМЕНЕН КУРС / СМУЩЕНИЕ'}
                {waiting > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 800, background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.55rem', borderRadius: '8px' }}>
                        <WifiOff size={15} /> чака връзка
                    </span>
                )}
            </button>}

            {open && (
                // Под картата прозорецът е вътре в нейния екран, а докосване там я затваря.
                <div onClick={e => e.stopPropagation()} style={{
                    position: 'fixed', inset: 0, zIndex: 60000, background: '#0a0a0a', color: '#fff',
                    overflowY: 'auto', padding: '1.25rem 1rem 2rem', fontFamily: '"Outfit", "Inter", sans-serif',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ff5252' }}>
                            <AlertOctagon size={26} /> Сигнал от автобуса
                        </h2>
                        <button onClick={close} aria-label="Затвори" style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '0.4rem' }}>
                            <X size={30} />
                        </button>
                    </div>

                    {error && (
                        <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '14px', background: 'rgba(255,82,82,0.15)', border: '1px solid rgba(255,82,82,0.4)', fontSize: '1.05rem', fontWeight: 700 }}>
                            {error}
                        </div>
                    )}
                    {busy && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', color: '#aaa', fontSize: '1.05rem' }}>
                            <Loader2 size={20} /> Изпращане…
                        </div>
                    )}

                    {step.at === 'kind' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                            {current && (
                                <>
                                    <div style={{ padding: '1rem', borderRadius: '16px', background: 'rgba(183,28,28,0.25)', border: '1px solid #b71c1c', fontSize: '1.05rem', lineHeight: 1.5 }}>
                                        Активен сигнал: <strong>{current.label}</strong><br />
                                        {current.routeName}{current.departure ? `, курс ${current.departure}` : ''} · от {new Date(current.at).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <button disabled={busy} onClick={resolve} style={{ ...big, background: '#00a152', justifyContent: 'center' }}>
                                        <CheckCircle2 size={26} /> Движението е нормално — прекрати сигнала
                                    </button>
                                    <div style={{ color: '#888', margin: '0.6rem 0 0.2rem', fontSize: '0.95rem' }}>Или подай нов сигнал (заменя стария):</div>
                                </>
                            )}
                            {!current && <div style={{ color: '#aaa', fontSize: '1rem', marginBottom: '0.3rem' }}>Какво се случи?</div>}
                            {KINDS.map(k => (
                                <button key={k.id} disabled={busy} onClick={() => setStep({ at: 'confirm', kind: k.id })} style={big}>
                                    <k.icon size={26} color="#ff5252" /> {k.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {step.at === 'confirm' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.4 }}>
                                Подаваш сигнал: <span style={{ color: '#ff5252' }}>{kindLabel(step.kind)}</span>
                            </div>
                            <div style={{ color: '#aaa', fontSize: '1rem', lineHeight: 1.5 }}>
                                Сигналът отива веднага при диспечера и в националната система за пътниците.
                            </div>
                            <button disabled={busy} onClick={() => run({}, step.kind)} style={{ ...big, background: '#e53935', justifyContent: 'center', fontSize: '1.3rem' }}>
                                ДА, ПОДАЙ СИГНАЛА
                            </button>
                            <button disabled={busy} onClick={() => setStep({ at: 'kind' })} style={{ ...big, justifyContent: 'center' }}>
                                <ArrowLeft size={22} /> Назад
                            </button>
                        </div>
                    )}

                    {step.at === 'line' && (() => {
                        // Линиите с курсове около този час; ако няма такива — всички линии.
                        const withTrips = [...new Set(step.options.map(o => o.routeName))];
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>Системата не знае кой курс караш. Коя линия?</div>
                                {withTrips.length > 0
                                    ? withTrips.map(name => (
                                        <button key={name} disabled={busy} style={big}
                                            onClick={() => setStep({ at: 'trip', kind: step.kind, routeName: name, options: step.options.filter(o => o.routeName === name) })}>
                                            <Bus size={24} color="#29b6f6" /> {name}
                                        </button>
                                    ))
                                    : step.lines.map(l => (
                                        <button key={l.routeId} disabled={busy} style={big} onClick={() => run({ routeId: l.routeId }, step.kind)}>
                                            <Bus size={24} color="#29b6f6" /> {l.routeName}
                                        </button>
                                    ))}
                                {withTrips.length > 0 && step.lines.length > withTrips.length && (
                                    <details style={{ marginTop: '0.4rem' }}>
                                        <summary style={{ color: '#aaa', fontSize: '1rem', cursor: 'pointer', padding: '0.5rem 0' }}>Линията я няма тук</summary>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                            {step.lines.filter(l => !withTrips.includes(l.routeName)).map(l => (
                                                <button key={l.routeId} disabled={busy} style={{ ...big, fontSize: '1.05rem', padding: '0.9rem 1rem' }} onClick={() => run({ routeId: l.routeId }, step.kind)}>
                                                    {l.routeName}
                                                </button>
                                            ))}
                                        </div>
                                    </details>
                                )}
                            </div>
                        );
                    })()}

                    {step.at === 'trip' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{step.routeName}: кой курс?</div>
                            {step.options.map(o => (
                                <button key={o.key} disabled={busy} style={big} onClick={() => run({ tripKey: o.key }, step.kind)}>
                                    <span style={{ fontSize: '1.5rem', fontWeight: 900, minWidth: '4.5rem' }}>{o.departure}</span>
                                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#ccc' }}>{o.from} → {o.to}</span>
                                </button>
                            ))}
                            <button disabled={busy} onClick={() => setStep({ at: 'kind' })} style={{ ...big, justifyContent: 'center' }}>
                                <ArrowLeft size={22} /> Назад
                            </button>
                        </div>
                    )}

                    {step.at === 'offline' && (() => {
                        // Списъкът е от самото приложение — без връзка сървърът не може да го даде.
                        let ticketLine = '';
                        try { ticketLine = sessionStorage.getItem('ticket_line') || ''; } catch { /* няма */ }
                        const lines = ticketLines().map(l => l.id);
                        const ordered = ticketLine && lines.includes(ticketLine) ? [ticketLine, ...lines.filter(l => l !== ticketLine)] : lines;
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.15rem', fontWeight: 800, color: '#ffb74d' }}>
                                    <WifiOff size={24} /> Няма връзка. Сигналът ще се изпрати сам, щом има интернет.
                                </div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>Коя линия караш?</div>
                                {ordered.map((name, i) => (
                                    <button key={name} style={{ ...big, ...(i === 0 && name === ticketLine ? { border: '2px solid #29b6f6' } : {}) }}
                                        onClick={() => keepForLater(step.kind, routeSlug(name))}>
                                        <Bus size={24} color="#29b6f6" /> {name}
                                    </button>
                                ))}
                                <button style={{ ...big, justifyContent: 'center', color: '#ccc' }} onClick={() => keepForLater(step.kind)}>
                                    Не знам — системата да познае
                                </button>
                            </div>
                        );
                    })()}

                    {step.at === 'done' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center', marginTop: '2rem' }}>
                            <CheckCircle2 size={64} color="#00e676" />
                            <div style={{ fontSize: '1.3rem', fontWeight: 800, lineHeight: 1.4 }}>{step.text}</div>
                            <button onClick={close} style={{ ...big, justifyContent: 'center', maxWidth: '20rem' }}>Готово</button>
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

export default DisruptionButton;
