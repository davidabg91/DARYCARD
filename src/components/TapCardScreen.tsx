import React, { useEffect, useRef, useState } from 'react';
import { ArrowBigUp, Nfc, Ticket } from 'lucide-react';

/**
 * Екранът на терминала, докато никой не сканира: къде се допира картата.
 *
 * Профилът на пътника стои 10 s и отстъпва на този екран (App.tsx) — така
 * следващите пътници не гледат чужда карта, а виждат какво да направят.
 * Стрелката сочи четеца: на N96 той е най-отгоре на апарата, над екрана —
 * затова зоната с вълните е опряна в горния ръб и стрелката сочи нагоре.
 *
 * Под него остават бутонът за билети (z 9000) и червената лента (z 50000);
 * профилът на пътника (z 10000) е над него. Съдържанието свършва над тях.
 */

/** Служител, който трябва да стигне до сайта под екрана, задържа часа толкова. */
const HOLD_TO_HIDE_MS = 3000;

const STYLE_ID = 'dary-tap-card-style';
const CSS = `
@keyframes daryTapCard { 0% { transform: translateY(0) rotate(-8deg); opacity: 0.95; }
  55% { transform: translateY(var(--dary-tap-move)) rotate(0deg); opacity: 1; }
  75% { transform: translateY(var(--dary-tap-move)) rotate(0deg); opacity: 1; }
  100% { transform: translateY(0) rotate(-8deg); opacity: 0.95; } }
@keyframes daryTapArrow { 0%, 100% { transform: translateY(0); opacity: 0.55; } 50% { transform: translateY(var(--dary-arrow-move)); opacity: 1; } }
@keyframes daryTapWave { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes daryTapGlow { 0%, 100% { box-shadow: 0 0 30px rgba(0,230,118,0.25); } 50% { box-shadow: 0 0 60px rgba(0,230,118,0.55); } }
`;

const pad = (n: number) => String(n).padStart(2, '0');

const STEPS: Array<[string, string]> = [
    ['1', 'Допрете картата горе, над екрана'],
    ['2', 'Задръжте я неподвижно до сигнала'],
    ['3', 'Зелено — приятно пътуване!'],
];

const TapCardScreen: React.FC<{ onHide: () => void }> = ({ onHide }) => {
    const [now, setNow] = useState(() => new Date());
    const holdRef = useRef<number | null>(null);

    useEffect(() => {
        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        const t = setInterval(() => setNow(new Date()), 15_000);
        return () => clearInterval(t);
    }, []);

    const startHold = () => { holdRef.current = window.setTimeout(onHide, HOLD_TO_HIDE_MS); };
    const endHold = () => { if (holdRef.current) clearTimeout(holdRef.current); holdRef.current = null; };

    const dateText = now.toLocaleDateString('bg-BG', { weekday: 'short', day: 'numeric', month: 'long' });
    const wave = (delay: number): React.CSSProperties => ({
        position: 'absolute', top: '-80px', width: '160px', height: '160px', borderRadius: '50%',
        border: '3px solid rgba(0,230,118,0.7)', animation: 'daryTapWave 1.8s ease-out infinite', animationDelay: `${delay}s`,
    });

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 8000, overflow: 'hidden',
            background: 'radial-gradient(ellipse at 50% 0%, #0d2b3e 0%, #06121f 45%, #000 100%)',
            color: '#fff', fontFamily: '"Outfit", "Inter", sans-serif',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0 1rem 9.8rem', boxSizing: 'border-box',
        }}>
            {/* Часът — задържан 3 s крие екрана за 5 минути (за служител на терминала). */}
            <div
                onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
                style={{ position: 'absolute', top: '0.6rem', left: '0.8rem', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', lineHeight: 1.1 }}
            >
                <div style={{ fontSize: '1.35rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{pad(now.getHours())}:{pad(now.getMinutes())}</div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{dateText}</div>
            </div>

            {/* Четецът е над екрана: вълни, излизащи от горния ръб, и стрелка към тях. */}
            <div style={{ position: 'relative', width: '100%', height: '58px', display: 'flex', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                <span style={wave(0)} />
                <span style={wave(0.6)} />
                <span style={wave(1.2)} />
                <div style={{
                    position: 'absolute', top: '-56px', width: '110px', height: '110px', borderRadius: '50%',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '14px', boxSizing: 'border-box',
                    background: 'radial-gradient(circle, rgba(0,230,118,0.35) 0%, rgba(0,230,118,0.08) 70%)',
                    border: '2px solid rgba(0,230,118,0.8)', animation: 'daryTapGlow 2s ease-in-out infinite',
                }}>
                    <Nfc size={32} color="#00e676" strokeWidth={2.2} />
                </div>
            </div>
            <div style={{ ['--dary-arrow-move' as string]: '-12px', animation: 'daryTapArrow 1.2s ease-in-out infinite', flexShrink: 0 } as React.CSSProperties}>
                <ArrowBigUp size={66} color="#00e676" fill="rgba(0,230,118,0.25)" strokeWidth={1.6} />
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#00e676', letterSpacing: '1px', flexShrink: 0 }}>ЧЕТЕЦЪТ Е НАД ЕКРАНА</div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly', textAlign: 'center', width: '100%' }}>
                {/* Картата, която „отива“ към четеца. */}
                <div style={{
                    ['--dary-tap-move' as string]: '-22px',
                    width: '168px', height: '106px', borderRadius: '14px', position: 'relative', flexShrink: 0, marginTop: '1.4rem',
                    background: 'linear-gradient(135deg, #00adb5 0%, #0a6e8a 55%, #123a5a 100%)',
                    boxShadow: '0 16px 36px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
                    animation: 'daryTapCard 2.6s ease-in-out infinite',
                } as React.CSSProperties}>
                    <div style={{ position: 'absolute', top: '13px', left: '15px', width: '28px', height: '21px', borderRadius: '5px', background: 'linear-gradient(135deg, #ffe082, #ffb300)' }} />
                    <Nfc size={22} color="rgba(255,255,255,0.85)" style={{ position: 'absolute', top: '13px', right: '13px' }} />
                    <div style={{ position: 'absolute', bottom: '11px', left: '15px', fontWeight: 900, fontSize: '1.1rem', letterSpacing: '3px' }}>DARY</div>
                    <div style={{ position: 'absolute', bottom: '14px', right: '13px', fontSize: '0.62rem', fontWeight: 700, opacity: 0.8 }}>КАРТА</div>
                </div>

                <div>
                    <div style={{ fontSize: 'clamp(1.8rem, 8.5vw, 2.8rem)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '0.5px' }}>
                        ДОПРЕТЕ КАРТАТА
                    </div>
                    <div style={{ fontSize: 'clamp(1.05rem, 4.6vw, 1.5rem)', fontWeight: 800, color: '#00e676', marginTop: '0.3rem' }}>
                        НАЙ-ГОРЕ, НАД ЕКРАНА
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', width: '100%', maxWidth: '440px' }}>
                    {STEPS.map(([n, text]) => (
                        <div key={n} style={{
                            display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.5rem 0.8rem', borderRadius: '12px',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', textAlign: 'left',
                        }}>
                            <span style={{
                                flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: n === '3' ? '#00e676' : 'rgba(0,173,181,0.25)', color: n === '3' ? '#00261a' : '#4dd0e1', fontWeight: 900, fontSize: '0.95rem',
                            }}>{n}</span>
                            <span style={{ fontSize: '1rem', fontWeight: 700 }}>{text}</span>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: 600 }}>
                    <Ticket size={16} /> Без карта? Купете билет от шофьора.
                </div>
            </div>
        </div>
    );
};

export default TapCardScreen;
