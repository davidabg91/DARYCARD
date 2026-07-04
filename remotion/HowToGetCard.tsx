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
    CreditCard, Camera, FileText, Bus, ScanLine,
    ShieldCheck, RefreshCcw, Clock,
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
                fontSize: 44, fontWeight: 800, letterSpacing: 6, color: TEAL_LIGHT,
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
                display: 'flex', alignItems: 'center', gap: 36,
                opacity: r.opacity, translate: `${-r.ty}px 0px`,
            }}>
                <div style={{
                    width: 128, height: 128, borderRadius: 32, flexShrink: 0,
                    background: accent ? `${accent}1f` : 'rgba(255,255,255,0.06)',
                    border: `2px solid ${accent ? accent + '66' : 'rgba(255,255,255,0.12)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={72} color={accent || TEAL_LIGHT} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 72, fontWeight: 700, color: col }}>{text}</div>
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
                <Img src={staticFile('logo_main.png')} style={{ width: 520, opacity: logoOp, scale: String(logoScale) }} />
                <div style={{ height: 6, width: lineW, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${TEAL}, transparent)` }} />
                <div style={{
                    fontSize: 100, fontWeight: 900, color: WHITE, textAlign: 'center', lineHeight: 1.15,
                    maxWidth: 1400, opacity: t.opacity, translate: `0px ${t.ty}px`, letterSpacing: -1,
                }}>
                    Как да извадите<br />абонаментна карта?
                </div>
            </div>
        </AbsoluteFill>
    );
};

// ---- Scene 2: Step 1 — at the counter with 3D Card ------------------------
const ThreeDCard: React.FC<{ frame: number; startFrame: number }> = ({ frame, startFrame }) => {
    const appearProgress = interpolate(frame, [startFrame, startFrame + 30], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: EASE,
    });

    // 3D rotation animations
    const rotateY = interpolate(appearProgress, [0, 1], [60, -15]);
    const rotateX = interpolate(appearProgress, [0, 1], [20, 8]);
    const rotateZ = interpolate(appearProgress, [0, 1], [-10, -3]);
    const scale = interpolate(appearProgress, [0, 1], [0.5, 0.9]);
    const opacity = appearProgress;

    // Subtly float up and down after entry
    const floatY = Math.sin(Math.max(0, frame - startFrame - 30) / 20) * 12;
    const tiltX = Math.cos(Math.max(0, frame - startFrame - 30) / 25) * 2;
    const tiltY = Math.sin(Math.max(0, frame - startFrame - 30) / 30) * 3;

    return (
        <div style={{
            flex: '1.2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            perspective: 1200,
            opacity,
            transform: `translateY(${floatY}px)`,
        }}>
            <div style={{
                width: 660,
                height: 416,
                borderRadius: 40,
                boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0,173,181,0.2)',
                background: '#0d1117',
                overflow: 'hidden',
                transform: `rotateY(${rotateY + tiltY}deg) rotateX(${rotateX + tiltX}deg) rotateZ(${rotateZ}deg) scale(${scale})`,
                transformStyle: 'preserve-3d',
                border: '1px solid rgba(255,255,255,0.1)',
            }}>
                <Img 
                    src={staticFile('bb6def80-ee6b-444b-a25f-de2941d48942.png')} 
                    style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',
                        display: 'block' 
                    }} 
                />
            </div>
        </div>
    );
};

const Step1: React.FC = () => {
    const frame = useCurrentFrame();
    const opacity = sceneFade(frame, STEP1);
    return (
        <AbsoluteFill style={{ opacity, fontFamily: FONT, padding: '80px 100px 80px 120px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 60, width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 64, flex: '1' }}>
                    <StepHeader n={1} label="На гишето" frame={frame} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 36, marginLeft: 8 }}>
                        <Row icon={CreditCard} text="Плащате за абонамента" frame={frame} start={30} />
                        <Row icon={Camera} text="Правим ви снимка" frame={frame} start={60} />
                        <Row icon={FileText} text="Въвеждаме вашите данни" frame={frame} start={90} />
                        <Row icon={CreditCard} text="Получавате вашата карта" frame={frame} start={130} accent={TEAL} />
                    </div>
                </div>
                <ThreeDCard frame={frame} startFrame={145} />
            </div>
        </AbsoluteFill>
    );
};

// ---- Scene 3: Step 2 — at the bus (scan) -----------------------------------
const Terminal: React.FC<{ frame: number }> = ({ frame }) => {
    // Card slides up to the top contactless zone, taps (~62), then screen displays scanned profile.
    const cardY = interpolate(frame, [18, 58], [520, -12], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
    const cardOp = interpolate(frame, [18, 30, 70, 84], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const scanned = frame >= 62;

    // Smooth transition from standby to scanned casing (takes 8 frames starting at 62)
    const scannedOp = interpolate(frame, [62, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    // Green flash overlay centered at frame 62-65 to make the switch completely invisible
    const flash = interpolate(frame, [59, 62, 65, 78], [0, 0.75, 0.75, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    return (
        <div style={{ position: 'relative', width: 440, height: 962 }}>
            {/* incoming card — transparent PNG directly rendered with drop-shadow for perfect edges */}
            <Img
                src={staticFile('bb6def80-ee6b-444b-a25f-de2941d48942.png')}
                style={{
                    position: 'absolute',
                    left: 50,
                    top: 0,
                    translate: `0px ${cardY}px`,
                    opacity: cardOp,
                    width: 340,
                    height: 214,
                    filter: 'drop-shadow(0 25px 35px rgba(0,0,0,0.7))',
                    zIndex: 5,
                }}
            />

            {/* standby device body (real casing image) */}
            <div style={{
                position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
                zIndex: 2,
            }}>
                <Img src={staticFile('mps-ultra-device-xxl.png')} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />

                {/* screen overlay with smoother rounded edges (38px) */}
                <div style={{
                    position: 'absolute',
                    left: '14.98%',
                    width: '70.95%',
                    top: '8.53%',
                    height: '77.48%',
                    borderRadius: '38px',
                    overflow: 'hidden',
                    background: '#091410',
                    border: '3px solid rgba(255,255,255,0.05)',
                    zIndex: 3,
                }}>
                    {/* Standby screen */}
                    <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#091410',
                        padding: 20,
                        gap: 30,
                    }}>
                        {/* Pulsing signal icon */}
                        <div style={{
                            position: 'relative',
                            width: 100,
                            height: 100,
                            borderRadius: '50%',
                            background: 'rgba(0,173,181,0.15)',
                            border: '2px solid rgba(0,173,181,0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            scale: String(0.9 + 0.1 * Math.abs(Math.sin(frame / 10))),
                        }}>
                            <ScanLine size={46} color={TEAL_LIGHT} strokeWidth={2.5} />
                        </div>
                        <div style={{
                            color: WHITE,
                            fontWeight: 800,
                            fontSize: 20,
                            textAlign: 'center',
                            fontFamily: FONT,
                            letterSpacing: 2,
                            lineHeight: 1.3,
                        }}>
                            МОЛЯ,<br />ДОПРЕТЕ КАРТА
                        </div>
                        <div style={{
                            color: 'rgba(255,255,255,0.4)',
                            fontSize: 13,
                            fontWeight: 600,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                            marginTop: 10,
                        }}>
                            DARY COMMERCE
                        </div>
                    </div>
                </div>
            </div>

            {/* Scanned device casing (fades in smoothly over the standby casing) */}
            {frame >= 62 && (
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    opacity: scannedOp,
                    zIndex: 4,
                }}>
                    <Img src={staticFile('26fe1bc6-3579-4143-9905-03edbd65af09.png')} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
            )}

            {/* tap green flash over the entire validator casing to make transition seamless */}
            <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                background: GREEN,
                opacity: flash,
                pointerEvents: 'none',
                zIndex: 10,
            }} />
        </div>
    );
};

const Step2: React.FC = () => {
    const frame = useCurrentFrame();
    const opacity = sceneFade(frame, STEP2);
    const cap = reveal(frame, 100, 26);
    return (
        <AbsoluteFill style={{ opacity, fontFamily: FONT, padding: '80px 100px 80px 120px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 80, width: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 50, flex: '1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24, opacity: reveal(frame, 4).opacity, translate: `0px ${reveal(frame, 4).ty}px` }}>
                        <div style={{ width: 92, height: 92, borderRadius: 26, background: `linear-gradient(135deg, ${TEAL}, #067a80)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, fontWeight: 900, color: '#001012', boxShadow: `0 18px 50px ${TEAL}55` }}>2</div>
                        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 6, color: TEAL_LIGHT, textTransform: 'uppercase' }}>Сканиране</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 30, opacity: cap.opacity, translate: `0px ${cap.ty}px` }}>
                        <div style={{ fontSize: 72, fontWeight: 900, color: WHITE, lineHeight: 1.25 }}>
                            Сканирате при<br />качване в автобуса
                        </div>
                        <div style={{ fontSize: 48, fontWeight: 600, color: MUTED, lineHeight: 1.45 }}>
                            Допрете картата в <span style={{ color: TEAL_LIGHT, fontWeight: 800 }}>горната част</span> на апарата.
                        </div>
                    </div>
                </div>
                <div style={{ flex: '1', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Terminal frame={frame} />
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
                    <div style={{ fontSize: 96, fontWeight: 900, color: AMBER, letterSpacing: 2 }}>ПАЗЕТЕ КАРТАТА!</div>
                </div>
                <div style={{ fontSize: 68, fontWeight: 800, color: WHITE, opacity: l1.opacity, translate: `0px ${l1.ty}px` }}>
                    Картата <span style={{ color: AMBER }}>не се подменя</span>.
                </div>
                <div style={{ fontSize: 56, fontWeight: 600, color: MUTED, lineHeight: 1.35, opacity: l2.opacity, translate: `0px ${l2.ty}px` }}>
                    При изтичане само я <span style={{ color: TEAL_LIGHT, fontWeight: 800 }}>презареждате</span> на гишето.
                </div>
                <div style={{
                    opacity: pillOp, scale: String(pill),
                    display: 'flex', alignItems: 'center', gap: 20, marginTop: 10,
                    background: `${TEAL}18`, border: `2px solid ${TEAL}66`, borderRadius: 60, padding: '22px 44px',
                }}>
                    <Clock size={54} color={TEAL_LIGHT} />
                    <span style={{ fontSize: 60, fontWeight: 900, color: WHITE }}>за под 1 минута</span>
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
                <Img src={staticFile('logo_main.png')} style={{ width: 580, opacity: logoOp, scale: String(logoScale) }} />
                <div style={{ fontSize: 84, fontWeight: 900, color: WHITE, letterSpacing: 8, opacity: t.opacity, translate: `0px ${t.ty}px` }}>{SYSTEM_NAME}</div>
                <div style={{ fontSize: 46, fontWeight: 600, color: TEAL_LIGHT, letterSpacing: 3, opacity: w.opacity }}>Абонаментна система · darycommerce.com</div>
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
