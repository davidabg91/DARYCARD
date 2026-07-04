import React from 'react';
import {
    AbsoluteFill,
    Sequence,
    Img,
    staticFile,
    useCurrentFrame,
    interpolate,
    Easing,
} from 'remotion';
import {
    CreditCard, Camera, FileText, Bus, ScanLine, CheckCircle2,
    ShieldCheck, RefreshCcw, Clock, User,
} from 'lucide-react';

// ---- Theme -----------------------------------------------------------------
const TEAL = '#00ADB5';
const TEAL_LIGHT = '#4de1ea';
const GREEN = '#00e676';
const AMBER = '#ffab00';
const WHITE = '#ffffff';
const MUTED = 'rgba(255,255,255,0.62)';
const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';
const SYSTEM_NAME = 'DARY CARD';

// ---- Scene timing (30 fps) -------------------------------------------------
const INTRO = 150;
const STEP1 = 285;
const STEP2 = 330;
const INFO = 270;
const OUTRO = 165;
export const TOTAL_FRAMES = INTRO + STEP1 + STEP2 + INFO + OUTRO;

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

// Fade content in at the start of a scene and out at the end (over the bg).
const sceneFade = (frame: number, dur: number) =>
    interpolate(frame, [0, 14, dur - 16, dur], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: EASE,
    });

// Staggered reveal: returns { opacity, ty } for an item appearing at `start`.
const reveal = (frame: number, start: number, dist = 26) => {
    const p = interpolate(frame, [start, start + 16], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: EASE,
    });
    return { opacity: p, ty: (1 - p) * dist };
};

// ---- Background (persistent) ----------------------------------------------
const Background: React.FC = () => {
    const frame = useCurrentFrame();
    const drift = Math.sin(frame / 90) * 40;
    return (
        <AbsoluteFill style={{ background: 'linear-gradient(160deg, #0a0e13 0%, #0d1520 55%, #0a0e13 100%)' }}>
            <div style={{
                position: 'absolute', width: 1100, height: 1100, borderRadius: '50%',
                left: -200 + drift, top: -350,
                background: `radial-gradient(circle, ${TEAL}22 0%, transparent 62%)`,
            }} />
            <div style={{
                position: 'absolute', width: 900, height: 900, borderRadius: '50%',
                right: -180 - drift, bottom: -320,
                background: `radial-gradient(circle, ${TEAL}18 0%, transparent 60%)`,
            }} />
            {/* subtle vignette */}
            <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 45%, transparent 55%, rgba(0,0,0,0.45) 100%)' }} />
        </AbsoluteFill>
    );
};

// ---- Shared bits -----------------------------------------------------------
const StepHeader: React.FC<{ n: number; label: string; frame: number }> = ({ n, label, frame }) => {
    const r = reveal(frame, 4);
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 24, opacity: r.opacity,
            translate: `0px ${r.ty}px`,
        }}>
            <div style={{
                width: 92, height: 92, borderRadius: 26, flexShrink: 0,
                background: `linear-gradient(135deg, ${TEAL}, #067a80)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 52, fontWeight: 900, color: '#001012',
                boxShadow: `0 18px 50px ${TEAL}55`,
            }}>{n}</div>
            <div style={{
                fontSize: 40, fontWeight: 800, letterSpacing: 6, color: TEAL_LIGHT,
                textTransform: 'uppercase',
            }}>{label}</div>
        </div>
    );
};

const Row: React.FC<{ icon: React.ElementType; text: string; frame: number; start: number; accent?: string }>
    = ({ icon: Icon, text, frame, start, accent }) => {
        const r = reveal(frame, start, 34);
        const col = accent || WHITE;
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 32,
                opacity: r.opacity, translate: `${-r.ty}px 0px`,
            }}>
                <div style={{
                    width: 104, height: 104, borderRadius: 28, flexShrink: 0,
                    background: accent ? `${accent}1f` : 'rgba(255,255,255,0.06)',
                    border: `2px solid ${accent ? accent + '66' : 'rgba(255,255,255,0.12)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={52} color={accent || TEAL_LIGHT} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 56, fontWeight: 700, color: col }}>{text}</div>
            </div>
        );
    };

// ---- Scene 1: Intro --------------------------------------------------------
const Intro: React.FC = () => {
    const frame = useCurrentFrame();
    const opacity = sceneFade(frame, INTRO);
    const logoScale = interpolate(frame, [0, 30], [0.7, 1], { extrapolateRight: 'clamp', easing: EASE });
    const logoOp = interpolate(frame, [0, 22], [0, 1], { extrapolateRight: 'clamp' });
    const t = reveal(frame, 30, 30);
    const lineW = interpolate(frame, [46, 74], [0, 420], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
    return (
        <AbsoluteFill style={{ opacity, alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 44, padding: 100 }}>
                <Img src={staticFile('logo_main.png')} style={{ width: 460, opacity: logoOp, scale: String(logoScale) }} />
                <div style={{ height: 6, width: lineW, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${TEAL}, transparent)` }} />
                <div style={{
                    fontSize: 82, fontWeight: 900, color: WHITE, textAlign: 'center', lineHeight: 1.15,
                    maxWidth: 1400, opacity: t.opacity, translate: `0px ${t.ty}px`, letterSpacing: -1,
                }}>
                    Как да извадите<br />абонаментна карта?
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ---- Scene 2: Step 1 — at the counter -------------------------------------
const Step1: React.FC = () => {
    const frame = useCurrentFrame();
    const opacity = sceneFade(frame, STEP1);
    return (
        <AbsoluteFill style={{ opacity, fontFamily: FONT, padding: '110px 150px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 64 }}>
                <StepHeader n={1} label="На гишето" frame={frame} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 40, marginLeft: 8 }}>
                    <Row icon={CreditCard} text="Плащате за абонамента" frame={frame} start={30} />
                    <Row icon={Camera} text="Правим ви снимка" frame={frame} start={60} />
                    <Row icon={FileText} text="Въвеждаме вашите данни" frame={frame} start={90} />
                    <Row icon={CreditCard} text="Получавате вашата карта" frame={frame} start={130} accent={TEAL} />
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ---- Scene 3: Step 2 — at the bus (scan) -----------------------------------
const Terminal: React.FC<{ frame: number }> = ({ frame }) => {
    // Card slides up to the top scan zone, taps (~50), then screen turns green.
    const cardY = interpolate(frame, [18, 58], [340, -20], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
    const cardOp = interpolate(frame, [18, 30, 70, 84], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const scanned = frame >= 62;
    const flash = interpolate(frame, [58, 66, 88], [0, 0.5, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const scanPulse = 0.45 + 0.35 * Math.abs(Math.sin(frame / 7));
    // Green profile reveal
    const g = interpolate(frame, [70, 96], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
    const checkScale = interpolate(frame, [78, 100], [0.4, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
    const borderCol = scanned ? GREEN : 'rgba(255,255,255,0.14)';

    return (
        <div style={{ position: 'relative', width: 460, height: 700 }}>
            {/* incoming card */}
            <div style={{
                position: 'absolute', left: '50%', top: 0, marginLeft: -150,
                translate: `0px ${cardY}px`, opacity: cardOp,
                width: 300, height: 186, borderRadius: 20,
                background: `linear-gradient(135deg, ${TEAL}, #05666b)`,
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)', zIndex: 5,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 22,
            }}>
                <div style={{ width: 46, height: 34, borderRadius: 7, background: 'rgba(255,255,255,0.55)' }} />
                <div style={{ color: '#eaffff', fontWeight: 900, fontSize: 26, letterSpacing: 2, fontFamily: FONT }}>DARY CARD</div>
            </div>

            {/* device body */}
            <div style={{
                position: 'absolute', left: 0, top: 96, width: 460, height: 604,
                borderRadius: 40, background: '#12181f', border: `3px solid ${borderCol}`,
                boxShadow: scanned ? `0 0 60px ${GREEN}55, 0 30px 70px rgba(0,0,0,0.5)` : '0 30px 70px rgba(0,0,0,0.5)',
                overflow: 'hidden',
            }}>
                {/* top scan zone */}
                <div style={{
                    height: 92, background: scanned ? `${GREEN}22` : `${TEAL}1f`,
                    borderBottom: `2px solid ${scanned ? GREEN + '55' : TEAL + '44'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
                    opacity: scanned ? 1 : scanPulse,
                }}>
                    <ScanLine size={34} color={scanned ? GREEN : TEAL_LIGHT} />
                    <span style={{ color: scanned ? GREEN : TEAL_LIGHT, fontWeight: 800, fontSize: 26, fontFamily: FONT }}>
                        {scanned ? 'ПРОЧЕТЕНА' : 'Допрете тук'}
                    </span>
                </div>

                {/* screen */}
                <div style={{ padding: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                    {/* avatar + name (appear with green reveal) */}
                    <div style={{ opacity: g, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, translate: `0px ${(1 - g) * 20}px` }}>
                        <div style={{
                            width: 132, height: 132, borderRadius: '50%',
                            background: `linear-gradient(135deg, ${GREEN}, #059c53)`,
                            border: '4px solid rgba(255,255,255,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <User size={70} color="#00230f" />
                        </div>
                        <div style={{ color: WHITE, fontWeight: 800, fontSize: 30, fontFamily: FONT }}>ИВАН ПЕТРОВ</div>
                    </div>

                    {/* green valid panel */}
                    <div style={{
                        opacity: g, width: '100%', marginTop: 6,
                        background: `${GREEN}22`, border: `2px solid ${GREEN}66`, borderRadius: 22,
                        padding: '22px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                    }}>
                        <div style={{ scale: String(checkScale) }}>
                            <CheckCircle2 size={72} color={GREEN} strokeWidth={2.5} />
                        </div>
                        <div style={{ color: GREEN, fontWeight: 900, fontSize: 30, fontFamily: FONT, letterSpacing: 1, textAlign: 'center' }}>
                            ВАЛИДЕН АБОНАМЕНТ
                        </div>
                    </div>
                </div>

                {/* tap flash */}
                <AbsoluteFill style={{ background: GREEN, opacity: flash }} />
            </div>
        </div>
    );
};

const Step2: React.FC = () => {
    const frame = useCurrentFrame();
    const opacity = sceneFade(frame, STEP2);
    const cap = reveal(frame, 150, 26);
    return (
        <AbsoluteFill style={{ opacity, fontFamily: FONT, alignItems: 'center', justifyContent: 'flex-start', padding: '90px 100px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 22, opacity: reveal(frame, 4).opacity, translate: `0px ${reveal(frame, 4).ty}px` }}>
                    <div style={{ width: 74, height: 74, borderRadius: 22, background: `linear-gradient(135deg, ${TEAL}, #067a80)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, fontWeight: 900, color: '#001012' }}>2</div>
                    <Bus size={46} color={TEAL_LIGHT} />
                    <div style={{ fontSize: 46, fontWeight: 900, color: WHITE, letterSpacing: 1 }}>Сканирате в автобуса</div>
                </div>
                <Terminal frame={frame} />
                <div style={{
                    fontSize: 40, fontWeight: 700, color: MUTED, textAlign: 'center', maxWidth: 1100,
                    opacity: cap.opacity, translate: `0px ${cap.ty}px`, marginTop: -6,
                }}>
                    Допирате картата в <span style={{ color: TEAL_LIGHT, fontWeight: 800 }}>горната част</span> на апарата
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ---- Scene 4: Info — keep the card ----------------------------------------
const Info: React.FC = () => {
    const frame = useCurrentFrame();
    const opacity = sceneFade(frame, INFO);
    const head = reveal(frame, 8, 30);
    const l1 = reveal(frame, 46, 30);
    const l2 = reveal(frame, 78, 30);
    const pill = interpolate(frame, [110, 132], [0.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
    const pillOp = interpolate(frame, [110, 126], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
        <AbsoluteFill style={{ opacity, fontFamily: FONT, alignItems: 'center', justifyContent: 'center', padding: 120 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40, textAlign: 'center', maxWidth: 1500 }}>
                <div style={{ opacity: head.opacity, translate: `0px ${head.ty}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                    <div style={{ width: 140, height: 140, borderRadius: 40, background: `${AMBER}1f`, border: `3px solid ${AMBER}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShieldCheck size={80} color={AMBER} />
                    </div>
                    <div style={{ fontSize: 84, fontWeight: 900, color: AMBER, letterSpacing: 2 }}>ПАЗЕТЕ КАРТАТА!</div>
                </div>
                <div style={{ fontSize: 58, fontWeight: 800, color: WHITE, opacity: l1.opacity, translate: `0px ${l1.ty}px` }}>
                    Картата <span style={{ color: AMBER }}>не се подменя</span>.
                </div>
                <div style={{ fontSize: 48, fontWeight: 600, color: MUTED, lineHeight: 1.35, opacity: l2.opacity, translate: `0px ${l2.ty}px` }}>
                    При изтичане само я <span style={{ color: TEAL_LIGHT, fontWeight: 800 }}>презареждате</span> на гишето.
                </div>
                <div style={{
                    opacity: pillOp, scale: String(pill),
                    display: 'flex', alignItems: 'center', gap: 20, marginTop: 10,
                    background: `${TEAL}18`, border: `2px solid ${TEAL}66`, borderRadius: 60, padding: '22px 44px',
                }}>
                    <Clock size={54} color={TEAL_LIGHT} />
                    <span style={{ fontSize: 54, fontWeight: 900, color: WHITE }}>за под 1 минута</span>
                    <RefreshCcw size={48} color={TEAL_LIGHT} />
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ---- Scene 5: Outro --------------------------------------------------------
const Outro: React.FC = () => {
    const frame = useCurrentFrame();
    const opacity = sceneFade(frame, OUTRO);
    const logoScale = interpolate(frame, [0, 28], [0.75, 1], { extrapolateRight: 'clamp', easing: EASE });
    const logoOp = interpolate(frame, [0, 22], [0, 1], { extrapolateRight: 'clamp' });
    const t = reveal(frame, 30, 26);
    const w = reveal(frame, 52, 20);
    return (
        <AbsoluteFill style={{ opacity, fontFamily: FONT, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
                <Img src={staticFile('logo_main.png')} style={{ width: 520, opacity: logoOp, scale: String(logoScale) }} />
                <div style={{ fontSize: 72, fontWeight: 900, color: WHITE, letterSpacing: 8, opacity: t.opacity, translate: `0px ${t.ty}px` }}>{SYSTEM_NAME}</div>
                <div style={{ fontSize: 40, fontWeight: 600, color: TEAL_LIGHT, letterSpacing: 3, opacity: w.opacity }}>Абонаментна система · darycommerce.com</div>
            </div>
        </AbsoluteFill>
    );
};

// ---- Assembly --------------------------------------------------------------
export const HowToGetCard: React.FC = () => {
    let at = 0;
    const seq = (dur: number) => { const from = at; at += dur; return { from, durationInFrames: dur }; };
    return (
        <AbsoluteFill style={{ backgroundColor: '#0a0e13' }}>
            <Background />
            <Sequence {...seq(INTRO)} layout="none"><Intro /></Sequence>
            <Sequence {...seq(STEP1)} layout="none"><Step1 /></Sequence>
            <Sequence {...seq(STEP2)} layout="none"><Step2 /></Sequence>
            <Sequence {...seq(INFO)} layout="none"><Info /></Sequence>
            <Sequence {...seq(OUTRO)} layout="none"><Outro /></Sequence>
        </AbsoluteFill>
    );
};
