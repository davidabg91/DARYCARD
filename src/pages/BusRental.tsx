import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import {
    Bus, BusFront, Users, Send, Check, CheckCircle, ShieldCheck,
    Clock, ArrowRight, MapPin, CalendarDays, Phone, User,
    Headset, Route as RouteIcon
} from 'lucide-react';

// ── Design tokens (kept local so this page reads as one coherent system) ──
const C = {
    accent: '#ff5252',
    accentDeep: '#e5393e',
    ink: '#f5f6f7',
    sub: 'rgba(255,255,255,0.62)',
    faint: 'rgba(255,255,255,0.42)',
    surface: 'rgba(255,255,255,0.035)',
    surface2: 'rgba(255,255,255,0.055)',
    border: 'rgba(255,255,255,0.09)',
    borderStrong: 'rgba(255,255,255,0.16)',
    bg: '#16181d',
};
const R = { card: 20, input: 14, chip: 999, tile: 14 };

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.95rem 1rem 0.95rem 2.75rem', background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${C.border}`, borderRadius: R.input, color: C.ink, fontSize: '1rem',
    outline: 'none', transition: 'border-color 0.18s ease, box-shadow 0.18s ease', fontFamily: 'inherit'
};

// Kicker label above section headings (defined at module scope so inputs never remount).
const Kicker: React.FC<{ text: string }> = ({ text }) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.9rem' }}>
        <span style={{ width: 26, height: 2, background: C.accent, borderRadius: 2 }} />
        <span style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent }}>{text}</span>
    </div>
);

// Labelled field with a leading icon (module scope: keeps every input identical and stable).
const Field: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '0.95rem', color: C.faint, display: 'flex', pointerEvents: 'none' }}>{icon}</span>
            {children}
        </div>
    </div>
);

const BusRental: React.FC = () => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [date, setDate] = useState('');
    const [passengers, setPassengers] = useState('');
    const [destination, setDestination] = useState('');
    const [consent, setConsent] = useState(false);
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    const formRef = useRef<HTMLElement>(null);
    const fleetRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const scrollTo = (ref: React.RefObject<HTMLElement | null>) =>
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !phone || !destination || !consent) return;

        setStatus('submitting');
        try {
            await addDoc(collection(db, 'rentals'), {
                name: name.trim(),
                phone: phone.trim(),
                date,
                passengers,
                destination: destination.trim(),
                timestamp: new Date().toISOString(),
                status: 'new'
            });
            setStatus('success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setName(''); setPhone(''); setDate(''); setPassengers(''); setDestination(''); setConsent(false);
        } catch (error) {
            console.error('Error submitting rental inquiry:', error);
            setStatus('error');
            alert('Възникна грешка при изпращането. Моля, опитайте отново или се свържете с нас по телефона.');
        }
    };

    if (status === 'success') {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '1rem' : '2rem' }}>
                <div style={{
                    maxWidth: 480, width: '100%', padding: isMobile ? '2.25rem 1.5rem' : '3rem 2.5rem', background: C.surface,
                    backdropFilter: 'blur(20px)', borderRadius: R.card, border: `1px solid ${C.border}`,
                    textAlign: 'center', animation: 'fadeIn 0.5s ease', boxShadow: '0 30px 80px rgba(0,0,0,0.45)'
                }}>
                    <div style={{
                        width: isMobile ? 64 : 76, height: isMobile ? 64 : 76, borderRadius: '50%', background: 'rgba(0,200,83,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c853',
                        margin: '0 auto 1.5rem', boxShadow: '0 0 0 8px rgba(0,200,83,0.06)'
                    }}>
                        <CheckCircle size={isMobile ? 32 : 42} strokeWidth={1.75} />
                    </div>
                    <h2 style={{ fontSize: isMobile ? '1.5rem' : '1.9rem', fontWeight: 800, color: C.ink, marginBottom: '0.85rem', letterSpacing: '-0.02em' }}>Запитването е изпратено</h2>
                    <p style={{ color: C.sub, lineHeight: 1.65, marginBottom: '2rem', fontSize: isMobile ? '0.92rem' : '1.02rem' }}>
                        Благодарим Ви. Наш представител ще се свърже с Вас в рамките на работния ден с индивидуална оферта.
                    </p>
                    <button
                        onClick={() => setStatus('idle')}
                        style={{
                            padding: '0.95rem 2rem', borderRadius: R.input, background: C.accent, color: '#fff',
                            fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
                            boxShadow: '0 10px 24px rgba(255,82,82,0.28)', width: isMobile ? '100%' : 'auto'
                        }}
                    >
                        Ново запитване
                    </button>
                </div>
            </div>
        );
    }

    const fleet = [
        { n: '01', title: 'Микробуси', capacity: '8–20', unit: 'места', icon: <Users size={24} strokeWidth={1.75} />, description: 'Идеални за летищни трансфери, малки групи и VIP клиенти.', features: ['Луксозен интериор', 'Климатик', 'Трансфери'] },
        { n: '02', title: 'Средни автобуси', capacity: '21–45', unit: 'места', icon: <Bus size={24} strokeWidth={1.75} />, description: 'Балансиран избор за корпоративни пътувания, тимбилдинги и сватби.', features: ['Удобни седалки', 'Багажно', 'Мултимедия'] },
        { n: '03', title: 'Големи автобуси', capacity: '46–75', unit: 'места', icon: <BusFront size={24} strokeWidth={1.75} />, description: 'За екскурзии, училищни мероприятия и големи делегации.', features: ['Панорамен изглед', 'Тоалетна', 'Макс. комфорт'] },
    ];

    const steps = [
        { icon: <Send size={20} strokeWidth={1.75} />, title: 'Изпращате запитване', text: 'Попълвате кратката форма с маршрут, дата и брой пътници.' },
        { icon: <Headset size={20} strokeWidth={1.75} />, title: 'Получавате оферта', text: 'Наш представител се свързва с Вас с индивидуална цена.' },
        { icon: <RouteIcon size={20} strokeWidth={1.75} />, title: 'Пътувате спокойно', text: 'Опитен шофьор и обслужен автобус в уговорения час.' },
    ];

    const trust = [
        { icon: <ShieldCheck size={26} strokeWidth={1.75} />, title: 'Сигурност', text: 'Редовни технически прегледи и пълни застраховки на всеки автобус.' },
        { icon: <Clock size={26} strokeWidth={1.75} />, title: 'Коректност', text: 'Точност и професионализъм при всяко изпълнение — без изненади.' },
        { icon: <User size={26} strokeWidth={1.75} />, title: 'Опитни шофьори', text: 'Доказани професионалисти с дългогодишен опит в туризма.' },
    ];

    return (
        <div style={{ minHeight: '100vh', paddingBottom: isMobile ? '3.5rem' : '5rem', overflowX: 'hidden' }}>
            <style>{`
                .br-card { transition: transform .2s ease, border-color .2s ease, background .2s ease; }
                .br-card:hover { transform: translateY(-4px); border-color: ${C.borderStrong}; background: ${C.surface2}; }
                .br-card:hover .br-index { color: ${C.accent}; }
                .br-input:focus { border-color: ${C.accent} !important; box-shadow: 0 0 0 3px rgba(255,82,82,0.15); }
                .br-input::placeholder { color: rgba(255,255,255,0.32); }
                .br-btn-primary { transition: transform .15s ease, box-shadow .2s ease, opacity .2s ease; }
                .br-btn-primary:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(255,82,82,0.34); }
                .br-btn-ghost { transition: background .2s ease, border-color .2s ease; }
                .br-btn-ghost:hover { background: rgba(255,255,255,0.06); border-color: ${C.borderStrong}; }
                .br-step-line { background: linear-gradient(90deg, ${C.border}, transparent); }
                @media (prefers-reduced-motion: reduce) {
                    .br-card, .br-btn-primary { transition: none; }
                    .br-card:hover, .br-btn-primary:not(:disabled):hover { transform: none; }
                }
            `}</style>

            {/* ── Hero ── */}
            <section style={{
                position: 'relative', minHeight: isMobile ? 480 : 620, width: '100%',
                display: 'flex', alignItems: 'flex-end', overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', inset: 0, background: 'url(/bus_rental_hero_magazine.png) center/cover no-repeat' }} />
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(18,19,23,0.35) 0%, rgba(18,19,23,0.72) 62%, ${C.bg} 100%)` }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(18,19,23,0.65) 0%, rgba(18,19,23,0) 55%)' }} />

                <div style={{
                    position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, margin: '0 auto',
                    padding: isMobile ? '0 1.25rem 2.75rem' : '0 1.5rem 4.5rem', animation: 'fadeIn 0.7s ease-out'
                }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.9rem',
                        borderRadius: R.chip, background: 'rgba(255,82,82,0.12)', border: '1px solid rgba(255,82,82,0.32)',
                        color: C.accent, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: '1.25rem'
                    }}>
                        <BusFront size={14} strokeWidth={2} /> Наемане на автобуси с шофьор
                    </div>
                    <h1 style={{
                        fontSize: isMobile ? '2.1rem' : 'clamp(2.75rem, 6vw, 4.5rem)', fontWeight: 900, color: '#fff',
                        lineHeight: 1.05, marginBottom: '1.1rem', letterSpacing: '-0.03em', maxWidth: 820
                    }}>
                        Транспорт, на който<br />можете да разчитате
                    </h1>
                    <p style={{ fontSize: isMobile ? '0.98rem' : '1.2rem', color: 'rgba(255,255,255,0.82)', maxWidth: 600, lineHeight: 1.6, marginBottom: '2rem' }}>
                        От малки групи до големи корпоративни събития — луксозен транспорт с шофьор,
                        съобразен изцяло с вашите изисквания.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', marginBottom: isMobile ? '1.5rem' : '2rem' }}>
                        <button onClick={() => scrollTo(formRef)} className="br-btn-primary" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.7rem', padding: isMobile ? '0.9rem 1.5rem' : '1.05rem 2rem',
                            borderRadius: R.input, background: C.accent, color: '#fff', fontWeight: 800, fontSize: isMobile ? '0.95rem' : '1.05rem',
                            boxShadow: '0 12px 28px rgba(255,82,82,0.3)', cursor: 'pointer', border: 'none'
                        }}>
                            Направете запитване <ArrowRight size={19} strokeWidth={2.25} />
                        </button>
                        <button onClick={() => scrollTo(fleetRef)} className="br-btn-ghost" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.6rem', padding: isMobile ? '0.9rem 1.35rem' : '1.05rem 1.75rem',
                            borderRadius: R.input, background: 'rgba(255,255,255,0.04)', color: C.ink, fontWeight: 700, fontSize: isMobile ? '0.95rem' : '1.05rem',
                            border: `1px solid ${C.border}`, cursor: 'pointer'
                        }}>
                            Разгледайте автопарка
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? '0.75rem 1.25rem' : '2rem', color: 'rgba(255,255,255,0.72)', fontSize: '0.85rem', fontWeight: 600 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}><ShieldCheck size={16} color={C.accent} strokeWidth={2} /> Застраховани превози</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={16} color={C.accent} strokeWidth={2} /> Отговор в същия ден</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}><Users size={16} color={C.accent} strokeWidth={2} /> Групи до 75 места</span>
                    </div>
                </div>
            </section>

            {/* ── Fleet ── */}
            <div ref={fleetRef} style={{ scrollMarginTop: 80, width: '100%', maxWidth: 1200, margin: '0 auto', padding: isMobile ? '3.5rem 1.25rem' : '6rem 1.5rem' }}>
                <div style={{ marginBottom: isMobile ? '2rem' : '3rem', maxWidth: 640 }}>
                    <Kicker text="Нашият автопарк" />
                    <h2 style={{ fontSize: isMobile ? '1.8rem' : 'clamp(2rem, 4vw, 2.75rem)', fontWeight: 850, letterSpacing: '-0.02em', marginBottom: '0.75rem', color: C.ink }}>
                        Подходящ автобус за всеки повод
                    </h2>
                    <p style={{ color: C.sub, fontSize: isMobile ? '0.95rem' : '1.05rem', lineHeight: 1.6 }}>
                        Разнообразие от поддържани и комфортни превозни средства — избирате според броя пътници и характера на пътуването.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? '1rem' : '1.5rem' }}>
                    {fleet.map((item) => (
                        <div key={item.n} className="br-card" style={{
                            position: 'relative', padding: isMobile ? '1.5rem' : '2rem', borderRadius: R.card,
                            background: C.surface, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column'
                        }}>
                            <span className="br-index" style={{ position: 'absolute', top: '1.5rem', right: '1.75rem', fontSize: '0.9rem', fontWeight: 800, color: C.faint, fontVariantNumeric: 'tabular-nums', transition: 'color .2s ease' }}>{item.n}</span>
                            <div style={{ width: 52, height: 52, borderRadius: R.tile, background: 'rgba(255,82,82,0.12)', color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                                {item.icon}
                            </div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: C.ink, marginBottom: '0.35rem' }}>{item.title}</h3>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '0.9rem' }}>
                                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: C.accent, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{item.capacity}</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: C.faint }}>{item.unit}</span>
                            </div>
                            <p style={{ color: C.sub, lineHeight: 1.55, fontSize: '0.92rem', marginBottom: '1.25rem' }}>{item.description}</p>
                            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '1.1rem', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {item.features.map((f, i) => (
                                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.86rem', fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>
                                        <Check size={15} strokeWidth={2.5} color={C.accent} /> {f}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── How it works ── */}
            <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.18)' }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '3.5rem 1.25rem' : '5rem 1.5rem' }}>
                    <div style={{ marginBottom: isMobile ? '2rem' : '3rem' }}>
                        <Kicker text="Как работи" />
                        <h2 style={{ fontSize: isMobile ? '1.7rem' : 'clamp(1.9rem, 3.5vw, 2.5rem)', fontWeight: 850, letterSpacing: '-0.02em', color: C.ink }}>
                            Три стъпки до вашето пътуване
                        </h2>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? '1.25rem' : '1.5rem' }}>
                        {steps.map((s, i) => (
                            <div key={i} style={{ position: 'relative', padding: isMobile ? '1.5rem' : '1.75rem', borderRadius: R.card, background: C.surface, border: `1px solid ${C.border}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.9rem' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: R.tile, background: 'rgba(255,255,255,0.05)', color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</div>
                                    <span style={{ fontSize: '2rem', fontWeight: 900, color: 'rgba(255,255,255,0.12)', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>{i + 1}</span>
                                </div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: C.ink, marginBottom: '0.4rem' }}>{s.title}</h3>
                                <p style={{ color: C.sub, lineHeight: 1.55, fontSize: '0.9rem' }}>{s.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Trust ── */}
            <section style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '3.5rem 1.25rem' : '5.5rem 1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? '1rem' : '1.5rem' }}>
                    {trust.map((f, i) => (
                        <div key={i} style={{ padding: isMobile ? '1.5rem' : '2rem', borderRadius: R.card, background: C.surface, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div style={{ width: 52, height: 52, borderRadius: R.tile, background: 'rgba(255,82,82,0.12)', color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{f.icon}</div>
                            <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: C.ink }}>{f.title}</h4>
                            <p style={{ color: C.sub, lineHeight: 1.55, fontSize: '0.9rem' }}>{f.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Inquiry form ── */}
            <section ref={formRef} id="inquiry-form" style={{ scrollMarginTop: 80, maxWidth: 1200, margin: '0 auto', padding: isMobile ? '1rem 1.25rem 0' : '2rem 1.5rem 0' }}>
                <div style={{
                    display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '0.9fr 1.1fr', gap: 0,
                    background: C.surface, borderRadius: R.card, border: `1px solid ${C.border}`,
                    overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.4)'
                }}>
                    {/* Info */}
                    <div style={{ padding: isMobile ? '2rem 1.5rem' : '3.5rem', background: 'linear-gradient(150deg, rgba(255,82,82,0.1) 0%, rgba(255,82,82,0) 55%)', borderBottom: isMobile ? `1px solid ${C.border}` : 'none', borderRight: isMobile ? 'none' : `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
                        <Kicker text="Заявка за оферта" />
                        <h2 style={{ fontSize: isMobile ? '1.7rem' : '2.1rem', fontWeight: 850, letterSpacing: '-0.02em', color: C.ink, marginBottom: '1rem' }}>Получете индивидуална цена</h2>
                        <p style={{ color: C.sub, lineHeight: 1.65, fontSize: isMobile ? '0.92rem' : '1rem', marginBottom: '2rem' }}>
                            Ценовото предложение се съобразява с вашия маршрут, километраж, брой пътници и продължителност на наемане.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
                            {['Индивидуален подход за всяко събитие', 'Прозрачна цена без скрити такси', 'Бърз отговор в рамките на деня'].map((t, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(0,200,83,0.12)', color: '#00c853', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Check size={15} strokeWidth={2.75} />
                                    </div>
                                    <span style={{ fontWeight: 600, fontSize: isMobile ? '0.88rem' : '0.95rem', color: 'rgba(255,255,255,0.82)' }}>{t}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Form */}
                    <div style={{ padding: isMobile ? '2rem 1.25rem' : '3.5rem' }}>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                                <Field label="Вашето име" icon={<User size={18} strokeWidth={1.75} />}>
                                    <input className="br-input" required type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Име Фамилия" style={inputStyle} />
                                </Field>
                                <Field label="Телефон" icon={<Phone size={18} strokeWidth={1.75} />}>
                                    <input className="br-input" required type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08XX XXX XXX" style={inputStyle} />
                                </Field>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                                <Field label="Дата" icon={<CalendarDays size={18} strokeWidth={1.75} />}>
                                    <input className="br-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
                                </Field>
                                <Field label="Брой пътници" icon={<Users size={18} strokeWidth={1.75} />}>
                                    <input className="br-input" type="number" min={1} value={passengers} onChange={(e) => setPassengers(e.target.value)} placeholder="напр. 35" style={inputStyle} />
                                </Field>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Маршрут и детайли</label>
                                <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '0.95rem', top: '1rem', color: C.faint, display: 'flex', pointerEvents: 'none' }}><MapPin size={18} strokeWidth={1.75} /></span>
                                    <textarea className="br-input" required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Откъде до къде, продължителност, специални изисквания..." style={{ ...inputStyle, minHeight: 110, resize: 'vertical', paddingTop: '0.95rem' }} />
                                </div>
                            </div>

                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', fontSize: '0.83rem', color: C.sub, lineHeight: 1.5 }}>
                                <input
                                    type="checkbox"
                                    required
                                    checked={consent}
                                    onChange={(e) => setConsent(e.target.checked)}
                                    style={{ marginTop: '0.15rem', width: 18, height: 18, accentColor: C.accent, flexShrink: 0, cursor: 'pointer' }}
                                />
                                <span>
                                    Съгласен/на съм предоставените от мен лични данни (име и телефон) да бъдат обработени за целите на изготвяне на оферта за наем съгласно{' '}
                                    <Link to="/legal" target="_blank" style={{ color: C.accent, fontWeight: 700 }}>Политиката за поверителност</Link>.
                                </span>
                            </label>

                            <button type="submit" disabled={status === 'submitting' || !consent} className="br-btn-primary" style={{
                                padding: '1.05rem', borderRadius: R.input, background: C.accent, color: '#fff', fontWeight: 800, fontSize: '1.05rem',
                                cursor: (status === 'submitting' || !consent) ? 'not-allowed' : 'pointer', border: 'none',
                                opacity: (status === 'submitting' || !consent) ? 0.55 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem',
                                boxShadow: '0 12px 28px rgba(255,82,82,0.26)'
                            }}>
                                {status === 'submitting' ? 'ИЗПРАЩАНЕ...' : (<><Send size={18} strokeWidth={2} /> Получете оферта</>)}
                            </button>
                        </form>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default BusRental;
