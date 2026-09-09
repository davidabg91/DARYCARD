import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Smartphone, X, RefreshCw, SkipForward, CheckCircle, AlertTriangle } from 'lucide-react';
import {
    createWriteSession,
    estimateNdefUrlBytes,
    getNdefReaderCtor,
    NTAG213_USER_BYTES,
    type BatchCard,
    type WriteSession,
    type WriterState,
} from '../utils/nfcCardWriter';

// Вибрация + кратък звук при приета карта, за да не се гледа екранът.
const vibrate = (pattern: number | number[]) => {
    try { navigator.vibrate?.(pattern); } catch { /* без вибрация — няма проблем */ }
};

const beep = (ctx: AudioContext | null, ok: boolean) => {
    if (!ctx) return;
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = ok ? 'sine' : 'square';
        osc.frequency.value = ok ? 1200 : 320;
        gain.gain.value = 0.14;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime;
        osc.start(t);
        osc.stop(t + (ok ? 0.11 : 0.24));
    } catch { /* без звук — няма проблем */ }
};

interface CardWriterProps {
    cards: BatchCard[];
    onClose: () => void;
}

const CardWriter: React.FC<CardWriterProps> = ({ cards, onClose }) => {
    const [state, setState] = useState<WriterState | null>(null);
    const sessionRef = useRef<WriteSession | null>(null);
    const audioRef = useRef<AudioContext | null>(null);

    const linkBytes = useMemo(
        () => (cards.length ? estimateNdefUrlBytes(cards[0].link) : 0),
        [cards]
    );
    const fits = linkBytes <= NTAG213_USER_BYTES;

    // Спираме слушането при затваряне на екрана — AbortController в сесията.
    useEffect(() => () => { sessionRef.current?.stop(); }, []);

    const start = useCallback(async () => {
        const Ctor = getNdefReaderCtor();
        if (!Ctor) return;
        // AudioContext се създава при натискане на бутона — иначе браузърът го спира.
        if (!audioRef.current) {
            const AC = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
            audioRef.current = AC ? new AC() : null;
        }
        await audioRef.current?.resume?.().catch(() => { /* без звук */ });

        const session = createWriteSession(cards, {
            createReader: () => new Ctor(),
            onState: setState,
            feedback: (kind) => {
                if (kind === 'written') { vibrate(120); beep(audioRef.current, true); }
                else { vibrate([70, 60, 70]); beep(audioRef.current, false); }
            },
        });
        sessionRef.current = session;
        setState(session.getState());
        await session.start();
    }, [cards]);

    const close = () => {
        sessionRef.current?.stop();
        onClose();
    };

    const status = state?.status ?? 'idle';
    const total = cards.length;
    const doneCount = state?.written.length ?? 0;
    const progress = total ? Math.round((doneCount / total) * 100) : 0;
    const current = state?.current;

    const headline = (() => {
        if (status === 'idle') return 'Готов за записване';
        if (status === 'writing') return 'Записвам — не махай картата';
        if (status === 'blocked') return 'Картата отказа записа';
        if (status === 'done') return 'Партидата е записана';
        if (status === 'fatal') return 'Спряно';
        return 'Допри картата до телефона';
    })();

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '1rem', overflowY: 'auto'
        }}>
            <div style={{
                width: '100%', maxWidth: '440px', background: 'var(--surface-color, #16181d)',
                border: '1px solid var(--surface-border, rgba(255,255,255,0.12))',
                borderRadius: '18px', padding: '1.25rem', color: '#fff'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Smartphone size={20} /> Записване на картите
                    </h3>
                    <button
                        onClick={close}
                        aria-label="Затвори"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Проверка, че линкът се побира в чипа. */}
                <div style={{
                    fontSize: '0.78rem', marginBottom: '1rem',
                    color: fits ? 'var(--text-secondary)' : '#ff5252', fontWeight: fits ? 400 : 700
                }}>
                    Линк в чипа: {linkBytes} от {NTAG213_USER_BYTES} байта (NTAG213)
                    {!fits && ' — НЕ СЕ ПОБИРА.'}
                </div>

                {/* Лента с напредъка. */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                        <span>Записани {doneCount} от {total}</span>
                        <span>{progress}%</span>
                    </div>
                    <div style={{ height: '8px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${progress}%`, height: '100%', background: '#00c853', transition: 'width 0.25s ease' }} />
                    </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{headline}</div>

                {/* НАЙ-ВАЖНОТО: физическият номер на картата, която трябва да сложа сега. */}
                {current && status !== 'done' && status !== 'fatal' && (
                    <div style={{
                        padding: '1.1rem', borderRadius: '14px', textAlign: 'center', marginBottom: '1rem',
                        background: status === 'writing' ? 'rgba(255,152,0,0.12)' : 'rgba(0,200,83,0.1)',
                        border: `1px solid ${status === 'writing' ? 'rgba(255,152,0,0.4)' : 'rgba(0,200,83,0.35)'}`
                    }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                            Сега запиши карта
                        </div>
                        <div style={{ fontSize: '2.1rem', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '1px', lineHeight: 1.1 }}>
                            № {current.cardNumber}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.45rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {current.code}
                        </div>
                    </div>
                )}

                {state?.lastWritten && status !== 'fatal' && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.8rem',
                        borderRadius: '10px', background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.3)',
                        fontSize: '0.82rem', marginBottom: '1rem'
                    }}>
                        <CheckCircle size={16} color="#00c853" />
                        Готова: № {state.lastWritten.cardNumber} (чип {state.lastWritten.serial})
                    </div>
                )}

                {status === 'blocked' && state?.failure && (
                    <div style={{
                        padding: '0.8rem', borderRadius: '12px', marginBottom: '1rem',
                        background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.35)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                            <AlertTriangle size={16} color="#ff5252" /> {state.failure.message}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => sessionRef.current?.retryCurrent()}
                                style={{ flex: 1, minWidth: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '10px', border: 'none', background: 'var(--accent-color, #2979ff)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                            >
                                <RefreshCw size={15} /> Опитай пак
                            </button>
                            <button
                                onClick={() => sessionRef.current?.skipCurrent()}
                                style={{ flex: 1, minWidth: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '10px', border: '1px solid var(--surface-border, rgba(255,255,255,0.15))', background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                            >
                                <SkipForward size={15} /> Прескочи картата
                            </button>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.55rem' }}>
                            „Опитай пак" — махни картата и я допри отново. „Прескочи картата" — остави
                            я настрана, № {state.failure.card.cardNumber} чака следващата карта.
                        </div>
                    </div>
                )}

                {status === 'fatal' && (
                    <div style={{
                        padding: '0.85rem', borderRadius: '12px', marginBottom: '1rem', fontSize: '0.85rem',
                        background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.35)'
                    }}>
                        {state?.fatal}
                    </div>
                )}

                {status === 'done' && (
                    <div style={{
                        padding: '0.9rem', borderRadius: '12px', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 700,
                        background: 'rgba(0,200,83,0.12)', border: '1px solid rgba(0,200,83,0.4)'
                    }}>
                        Всичките {total} карти са записани. Слушането е спряно.
                    </div>
                )}

                {status === 'idle' && (
                    <>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Дръж по една карта на телефона, докато номерът горе се смени. Телефонът
                            не пише в цикъл — разпознава всяка нова карта по серийния ѝ номер, така че
                            задържана карта не получава втори линк.
                        </p>
                        <button
                            onClick={start}
                            disabled={!fits || !total}
                            style={{
                                width: '100%', padding: '0.9rem', borderRadius: '12px', border: 'none',
                                background: fits && total ? '#00c853' : 'rgba(255,255,255,0.12)',
                                color: '#fff', fontWeight: 800, fontSize: '0.95rem',
                                cursor: fits && total ? 'pointer' : 'not-allowed'
                            }}
                        >
                            Започни записването
                        </button>
                    </>
                )}

                {(status === 'done' || status === 'fatal') && (
                    <button
                        onClick={close}
                        style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid var(--surface-border, rgba(255,255,255,0.15))', background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Затвори
                    </button>
                )}
            </div>
        </div>
    );
};

export default CardWriter;
