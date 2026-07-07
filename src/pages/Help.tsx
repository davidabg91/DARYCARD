import React from 'react';
import {
    HelpCircle, RefreshCw, CheckCircle, XCircle, Search, User,
    ScanLine, Camera, Phone, Sparkles, Info, Ban, UserPlus,
    PencilLine, Palette, MousePointerClick, Smartphone, CreditCard,
} from 'lucide-react';

/* ---- Design tokens (brand teal/green/red + a real gold for the "golden rule") ---- */
const GOLD = '#FFB300';
const GREEN = '#00E676';
const TEAL = '#00ADB5';
const RED = '#FF5252';
const CARD_BG = 'rgba(255,255,255,0.03)';
const BORDER = 'var(--surface-border)';

type Tone = 'green' | 'teal' | 'red' | 'gold' | 'neutral';
const toneColor: Record<Tone, string> = { green: GREEN, teal: TEAL, red: RED, gold: GOLD, neutral: '#cfd6dc' };

/* A small chip that visually stands in for an on-screen button or tab, so staff
   can match the instruction to the real element they see in the app. */
const Pill: React.FC<{ children: React.ReactNode; tone?: Tone }> = ({ children, tone = 'neutral' }) => {
    const c = toneColor[tone];
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.1rem 0.55rem', margin: '0 0.1rem', borderRadius: '7px',
            background: tone === 'neutral' ? 'rgba(255,255,255,0.08)' : `${c}22`,
            border: `1px solid ${tone === 'neutral' ? 'rgba(255,255,255,0.18)' : `${c}55`}`,
            color: tone === 'neutral' ? '#fff' : c, fontWeight: 800, fontSize: '0.82em',
            whiteSpace: 'nowrap', letterSpacing: '0.2px',
        }}>{children}</span>
    );
};

/* Circular numbered step badge — replaces the old ❶❷❸ / "1." mix. */
const StepBadge: React.FC<{ n: number; tone: Tone }> = ({ n, tone }) => {
    const c = toneColor[tone];
    return (
        <span style={{
            flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%',
            background: `${c}1f`, border: `1.5px solid ${c}66`, color: c,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums',
        }}>{n}</span>
    );
};

/* One instruction row: numbered badge + rich text. */
const Step: React.FC<{ n: number; tone: Tone; children: React.ReactNode }> = ({ n, tone, children }) => (
    <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
        <StepBadge n={n} tone={tone} />
        <div style={{ paddingTop: '0.2rem', lineHeight: 1.55, fontSize: '0.98rem' }}>{children}</div>
    </div>
);

/* Section eyebrow label with a short accent underline. */
const SectionLabel: React.FC<{ children: React.ReactNode; tone?: Tone }> = ({ children, tone = 'teal' }) => (
    <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.72rem', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-secondary)' }}>{children}</div>
        <div style={{ width: '44px', height: '3px', borderRadius: '3px', marginTop: '0.55rem', background: toneColor[tone] }} />
    </div>
);

/* A guide card with a colored top accent + icon header. */
const GuideCard: React.FC<{ tone: Tone; icon: React.ReactNode; title: string; children: React.ReactNode; badge?: string }> = ({ tone, icon, title, children, badge }) => {
    const c = toneColor[tone];
    return (
        <div className="help-card" style={{
            position: 'relative', background: CARD_BG, border: `1px solid ${BORDER}`,
            borderRadius: '20px', padding: '1.75rem', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
        }}>
            <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: c }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.4rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', margin: 0, color: c, fontSize: '1.2rem', fontWeight: 800 }}>
                    <span style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${c}1a`, border: `1px solid ${c}40`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
                    {title}
                </h3>
                {badge && <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: c, background: `${c}18`, border: `1px solid ${c}40`, padding: '0.25rem 0.6rem', borderRadius: '50px', whiteSpace: 'nowrap' }}>{badge}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>{children}</div>
        </div>
    );
};

const Help: React.FC = () => {
    return (
        <div style={{ maxWidth: '1080px', margin: '0 auto', width: '100%', animation: 'fadeIn 0.4s ease', padding: '1.5rem 1rem 4rem' }}>
            <style>{`
                .help-card { transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
                .help-card:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.16); box-shadow: 0 16px 40px rgba(0,0,0,0.35); }
                .help-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
                .help-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(0,173,181,0.45); }
                .help-cta { transition: transform 0.2s ease, box-shadow 0.2s ease; }
                @media (max-width: 760px) {
                    .help-grid { grid-template-columns: 1fr; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .help-card, .help-cta { transition: none !important; }
                    .help-card:hover, .help-cta:hover { transform: none !important; }
                }
            `}</style>

            {/* ---------- Header ---------- */}
            <div style={{ textAlign: 'center', marginBottom: '2.75rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.35rem 0.9rem', borderRadius: '50px', background: 'rgba(0,173,181,0.1)', border: '1px solid rgba(0,173,181,0.3)', color: TEAL, fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '1.1rem' }}>
                    <HelpCircle size={15} /> Ръководство за работа
                </div>
                <h1 style={{ fontSize: 'clamp(1.9rem, 5vw, 3rem)', fontWeight: 900, margin: '0 0 0.85rem', color: '#fff', letterSpacing: '-0.5px' }}>
                    Как да работим със сайта?
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', maxWidth: '620px', margin: '0 auto', lineHeight: 1.55 }}>
                    Всичко необходимо, за да обслужваш клиентите бързо и лесно — стъпка по стъпка.
                </p>
            </div>

            {/* ---------- Golden Rule (hero) ---------- */}
            <div style={{
                position: 'relative', overflow: 'hidden', textAlign: 'center',
                background: `linear-gradient(135deg, ${GOLD}18, rgba(255,193,7,0.02))`,
                border: `1px solid ${GOLD}33`, borderRadius: '24px',
                padding: 'clamp(2rem, 5vw, 3.25rem) 1.5rem', marginBottom: '3.5rem',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}>
                <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '160px', height: '160px', background: GOLD, opacity: 0.08, borderRadius: '50%', filter: 'blur(50px)' }} />
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: GOLD, fontWeight: 900, fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '1rem' }}>
                    <Sparkles size={16} /> Златното правило
                </div>
                <p style={{ margin: '0 auto 1.75rem', maxWidth: '640px', fontSize: 'clamp(1.15rem, 3vw, 1.5rem)', lineHeight: 1.45, color: '#fff', fontWeight: 700 }}>
                    Най-лесният начин за нова карта или подновяване е просто да&nbsp;
                    <span style={{ color: TEAL, whiteSpace: 'nowrap' }}>сканираш картата.</span>
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem', maxWidth: '640px', margin: '0 auto' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', padding: '0.6rem 1rem', background: 'rgba(0,173,181,0.1)', border: '1px solid rgba(0,173,181,0.28)', borderRadius: '12px', color: '#fff', fontSize: '0.92rem', fontWeight: 600 }}>
                        <Smartphone size={18} color={TEAL} /> Работи дори от началния екран на телефона
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', padding: '0.6rem 1rem', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.28)', borderRadius: '12px', color: RED, fontSize: '0.92rem', fontWeight: 800 }}>
                        <Info size={18} /> Трябва да си вписан, за да правиш промени
                    </div>
                </div>
            </div>

            {/* ---------- Section 1: Scanning ---------- */}
            <SectionLabel tone="teal">Най-бързо — чрез сканиране</SectionLabel>
            <div className="help-grid" style={{ marginBottom: '3.5rem' }}>
                <GuideCard tone="green" icon={<UserPlus size={20} color={GREEN} />} title="Нова карта" badge="Регистрация">
                    <Step n={1} tone="green"><b>Сканирай</b> чистата карта с телефона.</Step>
                    <Step n={2} tone="green">Системата сама отваря формата <Pill tone="green">ДОБАВИ</Pill>.</Step>
                    <Step n={3} tone="green">Попълни имената и направи <Pill tone="green">СНИМКА</Pill>.</Step>
                    <Step n={4} tone="green">Натисни <Pill tone="green">ЗАПАЗИ</Pill> — картата е готова!</Step>
                </GuideCard>

                <GuideCard tone="teal" icon={<RefreshCw size={20} color={TEAL} />} title="Стара карта" badge="Подновяване">
                    <Step n={1} tone="teal"><b>Сканирай</b> картата на клиента.</Step>
                    <Step n={2} tone="teal">Системата отваря неговия <Pill tone="teal">ПРОФИЛ</Pill> веднага.</Step>
                    <Step n={3} tone="teal">Натисни големия зелен бутон <Pill tone="green">ПОДНОВИ</Pill> под снимката.</Step>
                    <Step n={4} tone="teal">Избери <b>месец</b> и сума, после отново <Pill tone="green">ПОДНОВИ</Pill>.</Step>
                </GuideCard>
            </div>

            {/* ---------- Manual note ---------- */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', padding: '1.35rem 1.5rem', background: CARD_BG, border: `1px dashed ${BORDER}`, borderRadius: '18px', marginBottom: '3.5rem' }}>
                <span style={{ flexShrink: 0, width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PencilLine size={20} color="#cfd6dc" />
                </span>
                <div>
                    <h3 style={{ margin: '0 0 0.3rem', color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>Ръчно управление (без карта)</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55, fontSize: '0.95rem' }}>
                        Ако вече имаш <b>данните на клиента и неговия код (ID)</b>, можеш да ползваш панелите долу директно — <b>без картата да е пред теб</b>. Просто въведи кода ръчно в полето за ID.
                    </p>
                </div>
            </div>

            {/* ---------- Section 2: Detailed actions ---------- */}
            <SectionLabel tone="green">Подробно — стъпка по стъпка</SectionLabel>
            <div className="help-grid" style={{ marginBottom: '1.5rem' }}>
                <GuideCard tone="green" icon={<UserPlus size={20} color={GREEN} />} title="Добави нов клиент">
                    <Step n={1} tone="green">Отиди на таб <Pill tone="green">ДОБАВИ</Pill>.</Step>
                    <Step n={2} tone="green">Сканирай картата <b>или</b> напиши кода ѝ ръчно в полето.</Step>
                    <Step n={3} tone="green">Направи <Pill tone="green">СНИМКА</Pill> на човека <span style={{ color: GREEN, fontWeight: 700 }}>(много важно!)</span>.</Step>
                    <Step n={4} tone="green">Напиши <b>имената</b> и избери неговия <b>маршрут</b>.</Step>
                    <Step n={5} tone="green">Натисни големия бутон <Pill tone="green">ЗАПАЗИ</Pill>.</Step>
                </GuideCard>

                <GuideCard tone="teal" icon={<RefreshCw size={20} color={TEAL} />} title="Поднови карта">
                    <p style={{ margin: '0 0 0.3rem', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>Ако клиентът вече има карта, но е изтекла:</p>
                    <Step n={1} tone="teal">Намери го в списъка <Pill tone="teal">КЛИЕНТИ</Pill> (ползвай търсачката).</Step>
                    <Step n={2} tone="teal">Кликни бутона <Pill tone="teal">Управление</Pill> до името му.</Step>
                    <Step n={3} tone="teal">Натисни бутона <Pill tone="green">ПОДНОВИ</Pill>.</Step>
                    <Step n={4} tone="teal">Избери <b>месеца</b> и сумата — готово!</Step>
                </GuideCard>

                <GuideCard tone="red" icon={<Ban size={20} color={RED} />} title="Спри (анулирай) карта">
                    <p style={{ margin: '0 0 0.3rem', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>За да спреш карта на клиент веднага:</p>
                    <Step n={1} tone="red">Отиди на <Pill tone="teal">Управление</Pill> до името на клиента.</Step>
                    <Step n={2} tone="red">Влез в таб <Pill>Действие</Pill>.</Step>
                    <Step n={3} tone="red">Натисни червения бутон <Pill tone="red">Анулирай абонамент</Pill>.</Step>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginTop: '0.3rem', padding: '0.75rem 0.9rem', background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.22)', borderRadius: '12px' }}>
                        <XCircle size={17} color={RED} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ fontSize: '0.85rem', color: '#ffc9c9', lineHeight: 1.5 }}>Картата става <b>НЕВАЛИДНА</b> и шофьорът ще види червен сигнал.</span>
                    </div>
                </GuideCard>

                <GuideCard tone="gold" icon={<CreditCard size={20} color={GOLD} />} title="Загубена карта" badge="Такса 5 €">
                    <p style={{ margin: '0 0 0.3rem', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>Когато клиент загуби картата си — прехвърляш профила на нова карта:</p>
                    <Step n={1} tone="gold"><b>Сканирай</b> новата (празна) карта на клиента.</Step>
                    <Step n={2} tone="gold">Натисни бутона <Pill tone="gold">Загубена карта</Pill>.</Step>
                    <Step n={3} tone="gold">Намери клиента чрез <b>търсене</b> и го избери.</Step>
                    <Step n={4} tone="gold">Избери <b>месеца</b> — ако има абонамент за него, се прехвърля на новата карта.</Step>
                    <Step n={5} tone="gold">Натисни <Pill tone="green">Прехвърли и активирай</Pill>.</Step>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', marginTop: '0.3rem', padding: '0.75rem 0.9rem', background: `${GOLD}14`, border: `1px solid ${GOLD}33`, borderRadius: '12px' }}>
                        <Info size={17} color={GOLD} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ fontSize: '0.85rem', color: '#ffe0a3', lineHeight: 1.5 }}>Старата карта се <b>анулира автоматично</b> (става червена). Начислява се <b>глоба 5 €</b>, която влиза в оборота.</span>
                    </div>
                </GuideCard>

                <GuideCard tone="neutral" icon={<Search size={20} color="#cfd6dc" />} title="Как да намираме хора">
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.55 }}>
                        В таб <Pill tone="teal">КЛИЕНТИ</Pill> има поле за търсене. Можеш да пишеш:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}><User size={17} color={TEAL} /><span>Имената на човека</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}><MousePointerClick size={17} color={TEAL} /><span>Селото / маршрута му</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}><ScanLine size={17} color={TEAL} /><span>Кода на картата (ID)</span></div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Резултатите се показват веднага докато пишеш.</p>
                </GuideCard>
            </div>

            {/* ---------- Color legend (full-width) ---------- */}
            <div className="help-card" style={{ position: 'relative', background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '20px', padding: '1.75rem', overflow: 'hidden', marginBottom: '3.5rem' }}>
                <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: `linear-gradient(to right, ${GREEN}, ${TEAL}, ${RED})` }} />
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', margin: '0 0 1.4rem', color: '#fff', fontSize: '1.2rem', fontWeight: 800 }}>
                    <span style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Palette size={20} color="#cfd6dc" /></span>
                    Какво значат цветовете?
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '1rem 1.1rem', background: `${GREEN}12`, border: `1px solid ${GREEN}33`, borderRadius: '14px' }}>
                        <CheckCircle size={26} color={GREEN} style={{ flexShrink: 0 }} />
                        <div><div style={{ fontWeight: 900, color: GREEN }}>ЗЕЛЕНО</div><div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Платено — може да пътува.</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '1rem 1.1rem', background: `${RED}12`, border: `1px solid ${RED}33`, borderRadius: '14px' }}>
                        <XCircle size={26} color={RED} style={{ flexShrink: 0 }} />
                        <div><div style={{ fontWeight: 900, color: RED }}>ЧЕРВЕНО</div><div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Изтекла карта — трябва да плати.</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '1rem 1.1rem', background: `${TEAL}12`, border: `1px solid ${TEAL}33`, borderRadius: '14px' }}>
                        <Camera size={26} color={TEAL} style={{ flexShrink: 0 }} />
                        <div><div style={{ fontWeight: 900, color: TEAL }}>СНИМКА</div><div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Винаги сверявай снимка и човек.</div></div>
                    </div>
                </div>
            </div>

            {/* ---------- Contact footer ---------- */}
            <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', background: `linear-gradient(135deg, rgba(0,173,181,0.08), rgba(0,173,181,0.02))`, border: '1px solid rgba(0,173,181,0.2)', borderRadius: '24px' }}>
                <h4 style={{ color: '#fff', margin: '0 0 0.4rem', fontSize: '1.35rem', fontWeight: 800 }}>Имаш още въпроси?</h4>
                <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.98rem' }}>Обади се на администратора за допълнителна помощ.</p>
                <a href="tel:0876141826" className="help-cta" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
                    background: TEAL, color: '#00252a', padding: '0.85rem 1.75rem',
                    borderRadius: '50px', textDecoration: 'none', fontWeight: 900, fontSize: '1.1rem',
                    boxShadow: '0 8px 20px rgba(0,173,181,0.35)',
                }}>
                    <Phone size={20} /> Позвъни на 0876 141 826
                </a>
            </div>
        </div>
    );
};

export default Help;
