import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
    ArrowLeftRight, ArrowRight, Ban, CircleHelp, Clock, CreditCard, History, Pencil,
    RefreshCw, Shield, ShieldCheck, Wallet,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import logoMain from '../assets/logo_main.png';

// Началният екран на служителя след вход: какво е направил последно, равносметка
// за деня и последните му действия. Данните са тези, които системата и без това
// записва — `activity_logs` за модератори и администратори, `inspector_scans` за
// проверяващите. Нищо ново не се пише.

export interface StaffAction {
    id: string;
    /** ISO време на действието. */
    at: string;
    action: string;
    target: string;
    details: string;
    amount: number;
}

/** Колко от последните действия на служителя се слушат. Стига за най-натоварения ден. */
const OWN_LIMIT = 200;
/** Без индекс по служител: последните действия на всички, отсяти тук. */
const SHARED_LIMIT = 300;

const pad = (n: number) => String(n).padStart(2, '0');
const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const displayName = (username?: string) => {
    if (!username) return 'колега';
    const name = username.includes('@') ? username.split('@')[0] : username;
    return name.charAt(0).toUpperCase() + name.slice(1);
};

const roleTitle = (role?: string) =>
    role === 'admin' ? 'Администратор' : role === 'moderator' ? 'Модератор' : role === 'inspector' ? 'Инспектор' : 'Служител';

const greeting = (now: Date) => {
    const h = now.getHours();
    return h >= 5 && h < 11 ? 'Добро утро' : h >= 11 && h < 18 ? 'Добър ден' : 'Добър вечер';
};

/** „днес в 12:41“, „вчера в 16:02“, „24.11 в 09:15“. */
const whenLabel = (at: Date, now: Date) => {
    const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    if (sameDay(at, now)) return `днес в ${time}`;
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (sameDay(at, yesterday)) return `вчера в ${time}`;
    const date = `${pad(at.getDate())}.${pad(at.getMonth() + 1)}`;
    return `${date}${at.getFullYear() === now.getFullYear() ? '' : `.${at.getFullYear()}`} в ${time}`;
};

const agoLabel = (at: Date, now: Date) => {
    const mins = Math.round((now.getTime() - at.getTime()) / 60000);
    if (mins < 1) return 'току-що';
    if (mins < 60) return `преди ${mins} мин`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `преди ${hours} ч`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'преди 1 ден' : `преди ${days} дни`;
};

/** „(Карта № 0000000341)“ → „(Карта № 341)“ — водещите нули само пречат на окото. */
const tidyTarget = (target: string) => target.replace(/№\s*0+(\d)/g, '№ $1').replace(/\s*\(/, ' (').trim();

interface Look { label: string; color: string; icon: React.ReactNode }

const lookOf = (action: string, size = 18): Look => {
    if (action === 'Подновяване') return { label: 'Подновяване', color: '#00e676', icon: <RefreshCw size={size} /> };
    if (action === 'Създаване') return { label: 'Нова карта', color: '#00adb5', icon: <CreditCard size={size} /> };
    if (action === 'Проверка') return { label: 'Проверка', color: '#00adb5', icon: <ShieldCheck size={size} /> };
    if (/^Анулиране|^Изтриване/.test(action)) return { label: action, color: '#ff5252', icon: <Ban size={size} /> };
    if (/^Загубена карта/.test(action)) return { label: 'Загубена карта', color: '#ffab00', icon: <ArrowLeftRight size={size} /> };
    return { label: action || 'Действие', color: '#82b1ff', icon: <Pencil size={size} /> };
};

/** Сумата и знакът за евро не се разделят на два реда. */
const money = (n: number) => `${n.toFixed(2)}\u00a0€`;

/** По какъв начин е платено — чете се от описанието, което системата сама пише. */
const paymentSplit = (a: StaffAction): { cash: number; card: number; bank: number } => {
    const out = { cash: 0, card: 0, bank: 0 };
    const mixed = a.details.match(/Смесено\s*\(Банка:\s*([\d.,]+)\s*\/\s*Кеш:\s*([\d.,]+)\)/);
    if (mixed) {
        out.bank = Number(mixed[1].replace(',', '.')) || 0;
        out.cash = Number(mixed[2].replace(',', '.')) || 0;
        return out;
    }
    const m = a.details.match(/Начин на плащане:\s*(В брой|С карта|Банка)/);
    if (m && a.amount > 0) {
        if (m[1] === 'В брой') out.cash = a.amount;
        else if (m[1] === 'С карта') out.card = a.amount;
        else out.bank = a.amount;
    }
    return out;
};

interface ViewProps {
    username?: string;
    role?: string;
    now: Date;
    /** null — още се зарежда. */
    actions: StaffAction[] | null;
    error?: boolean;
    /** Проверяващите виждат проверките си, не действията по картите. */
    inspector?: boolean;
    /** Списъкът е стигнал тавана си и днешният ден може да не е цял. */
    truncated?: boolean;
}

export const StaffHomeView: React.FC<ViewProps> = ({ username, role, now, actions, error, inspector, truncated }) => {
    const today = useMemo(() => (actions || []).filter(a => sameDay(new Date(a.at), now)), [actions, now]);
    const last = actions && actions.length ? actions[0] : null;
    const recent = (actions || []).slice(0, 6);

    const stats = useMemo(() => {
        let renewals = 0, created = 0, total = 0, cash = 0, card = 0, bank = 0;
        for (const a of today) {
            if (a.action === 'Подновяване') renewals++;
            else if (a.action === 'Създаване') created++;
            total += a.amount;
            const p = paymentSplit(a);
            cash += p.cash; card += p.card; bank += p.bank;
        }
        return { renewals, created, other: today.length - renewals - created, total, cash, card, bank, rest: total - cash - card - bank };
    }, [today]);

    const loading = actions === null && !error;
    const plus = truncated ? '+' : '';
    const isAdmin = role === 'admin';
    const accent = isAdmin ? '#ff5252' : '#00adb5';
    const lastLook = last ? lookOf(last.action, 26) : null;
    const lastAt = last ? new Date(last.at) : null;

    const tiles: { key: string; label: string; value: string; hint?: string[]; color: string; icon: React.ReactNode }[] = inspector
        ? [
            { key: 'checks', label: 'Проверки днес', value: `${today.length}${plus}`, color: '#00adb5', icon: <ShieldCheck size={18} /> },
        ]
        : [
            { key: 'renew', label: 'Подновявания днес', value: `${stats.renewals}${plus}`, color: '#00e676', icon: <RefreshCw size={18} /> },
            { key: 'new', label: 'Нови карти днес', value: `${stats.created}${plus}`, color: '#00adb5', icon: <CreditCard size={18} /> },
            { key: 'other', label: 'Други промени днес', value: `${stats.other}${plus}`, color: '#82b1ff', icon: <Pencil size={18} /> },
            {
                key: 'money', label: 'Събрано днес', value: money(stats.total), color: '#ffd54f', icon: <Wallet size={18} />,
                hint: [
                    stats.cash ? `в брой ${money(stats.cash)}` : '',
                    stats.card ? `с карта ${money(stats.card)}` : '',
                    stats.bank ? `по банка ${money(stats.bank)}` : '',
                    // Глоби, изтрити и поправени плащания: не носят начин на плащане,
                    // но влизат в сбора — без този ред частите не дават общото.
                    Math.abs(stats.rest) >= 0.005 ? `други и корекции ${stats.rest < 0 ? '−' : '+'}${money(Math.abs(stats.rest))}` : '',
                ].filter(Boolean),
            },
        ];

    return (
        <section className="sh-wrap" aria-label="Начало за служители">
            <style>{`
                .sh-wrap { max-width: 980px; margin: 0 auto 3.5rem; padding: 1.75rem; text-align: left;
                    background: #131316; border: 1px solid rgba(255,255,255,0.09); border-radius: 24px;
                    box-shadow: 0 12px 36px rgba(0,0,0,0.3); }
                .sh-head { display: flex; align-items: center; justify-content: space-between; gap: 1.25rem; flex-wrap: wrap; }
                .sh-id { display: flex; align-items: center; gap: 1rem; min-width: 0; }
                .sh-logo { height: 56px; width: auto; flex-shrink: 0; }
                .sh-hello { margin: 0.3rem 0 0.15rem; font-size: clamp(1.45rem, 4.2vw, 2rem); font-weight: 900; letter-spacing: -0.6px; line-height: 1.15; }
                .sh-date { color: rgba(255,255,255,0.55); font-size: 0.9rem; font-weight: 600; }
                .sh-nav { display: flex; gap: 0.6rem; flex-wrap: wrap; }
                .sh-btn { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.7rem 1.1rem; border-radius: 12px;
                    font-weight: 700; font-size: 0.88rem; text-decoration: none; color: #fff;
                    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); }
                .sh-btn:hover { background: rgba(255,255,255,0.1); }
                .sh-btn.primary { background: #e53935; border-color: #e53935; }
                .sh-btn.primary:hover { background: #ff5252; }
                .sh-label { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
                .sh-last { display: flex; align-items: center; gap: 1.1rem; margin-top: 1.5rem; padding: 1.2rem 1.3rem;
                    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.09); border-radius: 18px; }
                .sh-last-icon { width: 54px; height: 54px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .sh-last-main { flex: 1; min-width: 0; }
                .sh-last-title { margin: 0.25rem 0 0.2rem; font-size: 1.15rem; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
                .sh-last-details { color: rgba(255,255,255,0.62); font-size: 0.88rem; line-height: 1.45; overflow-wrap: anywhere; }
                .sh-last-when { text-align: right; flex-shrink: 0; }
                .sh-last-time { font-size: 1.05rem; font-weight: 800; white-space: nowrap; }
                .sh-last-ago { color: rgba(255,255,255,0.5); font-size: 0.8rem; font-weight: 600; margin-top: 0.15rem; white-space: nowrap; }
                .sh-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.8rem; margin-top: 0.9rem; }
                .sh-tile { padding: 1rem 1.1rem; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; }
                .sh-tile-top { display: flex; align-items: center; gap: 0.5rem; color: rgba(255,255,255,0.6); font-size: 0.8rem; font-weight: 700; }
                .sh-tile-value { margin-top: 0.45rem; font-size: 1.7rem; font-weight: 900; letter-spacing: -0.5px; line-height: 1.1; font-variant-numeric: tabular-nums; }
                .sh-tile-hint { margin-top: 0.3rem; color: rgba(255,255,255,0.5); font-size: 0.76rem; font-weight: 600; line-height: 1.35; }
                .sh-list-head { display: flex; align-items: center; gap: 0.5rem; margin: 1.6rem 0 0.6rem; }
                .sh-row { display: grid; grid-template-columns: 96px 32px minmax(0, 1fr) auto; align-items: center; gap: 0.8rem;
                    padding: 0.7rem 0.2rem; border-top: 1px solid rgba(255,255,255,0.07); }
                .sh-row-when { color: rgba(255,255,255,0.6); font-size: 0.82rem; font-weight: 700; font-variant-numeric: tabular-nums; }
                .sh-row-icon { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; }
                .sh-row-title { font-size: 0.92rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .sh-row-details { color: rgba(255,255,255,0.5); font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.1rem; }
                .sh-row-amount { font-size: 0.9rem; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
                .sh-note { margin-top: 1.5rem; padding: 1.1rem 1.3rem; border-radius: 16px; background: rgba(255,255,255,0.035);
                    border: 1px solid rgba(255,255,255,0.09); color: rgba(255,255,255,0.7); font-size: 0.92rem; line-height: 1.5; }
                .sh-skel { background: rgba(255,255,255,0.06); border-radius: 12px; }
                @media (max-width: 640px) {
                    .sh-wrap { padding: 1.15rem; border-radius: 18px; }
                    .sh-logo { height: 42px; }
                    .sh-nav { width: 100%; }
                    .sh-btn { flex: 1 1 auto; justify-content: center; }
                    .sh-last { flex-wrap: wrap; }
                    .sh-last-when { text-align: left; width: 100%; padding-left: calc(54px + 1.1rem); }
                    .sh-tiles { grid-template-columns: 1fr 1fr; gap: 0.6rem; }
                    .sh-tile { padding: 0.85rem 0.9rem; }
                    .sh-tile-value { font-size: 1.45rem; }
                    .sh-row { grid-template-columns: 32px minmax(0, 1fr) auto; }
                    /* На телефон името на клиента е по-важно от един ред: пренася се. */
                    .sh-row-title { white-space: normal; overflow: visible; overflow-wrap: anywhere; }
                    .sh-row-when { grid-column: 2 / -1; grid-row: 1; font-size: 0.74rem; }
                    .sh-row-icon { grid-row: 1 / span 2; }
                    .sh-row-main { grid-column: 2; grid-row: 2; }
                    .sh-row-amount { grid-column: 3; grid-row: 2; }
                }
            `}</style>

            {/* Кой е влязъл и накъде може да тръгне */}
            <header className="sh-head">
                <div className="sh-id">
                    <img className="sh-logo" src={logoMain} alt="DARY Commerce" />
                    <div style={{ minWidth: 0 }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.22rem 0.7rem', borderRadius: '50px',
                            background: `${accent}22`, border: `1px solid ${accent}55`, color: accent,
                            fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase'
                        }}>
                            {isAdmin ? <ShieldCheck size={13} /> : <Shield size={13} />} {roleTitle(role)}
                        </span>
                        <h1 className="sh-hello">{greeting(now)}, <span style={{ color: '#ff5252' }}>{displayName(username)}</span></h1>
                        <div className="sh-date">
                            {now.toLocaleDateString('bg-BG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                    </div>
                </div>
                <nav className="sh-nav">
                    {role !== 'inspector' && <Link className="sh-btn primary" to="/admin">Към панела за карти <ArrowRight size={16} /></Link>}
                    {(isAdmin || role === 'inspector') && <Link className={`sh-btn${role === 'inspector' ? ' primary' : ''}`} to="/inspections">Проверки</Link>}
                    {isAdmin && <Link className="sh-btn" to="/system-admin">Админ панел</Link>}
                    <Link className="sh-btn" to="/help"><CircleHelp size={16} /> Помощ</Link>
                </nav>
            </header>

            {error && (
                <div className="sh-note" role="status">
                    Действията ви не се заредиха. Проверете връзката с интернет — входът ви е наред и можете да работите.
                </div>
            )}

            {loading && (
                <div aria-busy="true" aria-label="Зареждане">
                    <div className="sh-skel" style={{ height: '92px', marginTop: '1.5rem', borderRadius: '18px' }} />
                    <div className="sh-tiles">
                        {[0, 1, 2, 3].map(i => <div key={i} className="sh-skel" style={{ height: '88px', borderRadius: '16px' }} />)}
                    </div>
                </div>
            )}

            {actions && !last && (
                <div className="sh-note">
                    {inspector
                        ? 'Все още нямате записани проверки. Първата ще се появи тук веднага щом проверите карта.'
                        : 'Все още нямате записани действия. Тук ще виждате последното, което сте направили, и равносметка за деня.'}
                </div>
            )}

            {actions && last && lastLook && lastAt && (
                <>
                    {/* Последното действие — най-важното на екрана */}
                    <div className="sh-last">
                        <div className="sh-last-icon" style={{ background: `${lastLook.color}1f`, color: lastLook.color }}>{lastLook.icon}</div>
                        <div className="sh-last-main">
                            <div className="sh-label">{inspector ? 'Последна проверка' : 'Последно направихте'}</div>
                            <div className="sh-last-title">
                                <span style={{ color: lastLook.color }}>{lastLook.label}</span>
                                {last.target ? <> · {tidyTarget(last.target)}</> : null}
                            </div>
                            {last.details && <div className="sh-last-details">{last.details}</div>}
                        </div>
                        <div className="sh-last-when">
                            <div className="sh-last-time"><Clock size={15} style={{ verticalAlign: '-2px', marginRight: '0.3rem', opacity: 0.6 }} />{whenLabel(lastAt, now)}</div>
                            <div className="sh-last-ago">{agoLabel(lastAt, now)}</div>
                        </div>
                    </div>

                    {/* Равносметка за деня */}
                    <div className="sh-tiles">
                        {tiles.map(t => (
                            <div key={t.key} className="sh-tile">
                                <div className="sh-tile-top"><span style={{ color: t.color, display: 'flex' }}>{t.icon}</span>{t.label}</div>
                                <div className="sh-tile-value">{t.value}</div>
                                {t.hint && t.hint.length > 0 && (
                                    <div className="sh-tile-hint">{t.hint.map(h => <div key={h}>{h}</div>)}</div>
                                )}
                            </div>
                        ))}
                    </div>
                    {today.length === 0 && (
                        <div style={{ marginTop: '0.7rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.84rem', fontWeight: 600 }}>
                            {inspector ? 'Днес още нямате проверки.' : 'Днес още нямате действия — числата са за днешния ден.'}
                        </div>
                    )}

                    {/* Последните няколко, за да се види какво вече е свършено */}
                    <div className="sh-list-head">
                        <History size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
                        <span className="sh-label">{inspector ? 'Последни проверки' : 'Последни действия'}</span>
                    </div>
                    <div>
                        {recent.map(a => {
                            const look = lookOf(a.action, 16);
                            return (
                                <div key={a.id} className="sh-row">
                                    <div className="sh-row-when">{whenLabel(new Date(a.at), now)}</div>
                                    <div className="sh-row-icon" style={{ background: `${look.color}1f`, color: look.color }}>{look.icon}</div>
                                    <div className="sh-row-main" style={{ minWidth: 0 }}>
                                        <div className="sh-row-title">
                                            <span style={{ color: look.color }}>{look.label}</span>{a.target ? ` · ${tidyTarget(a.target)}` : ''}
                                        </div>
                                        {a.details && <div className="sh-row-details">{a.details}</div>}
                                    </div>
                                    <div className="sh-row-amount" style={{ color: a.amount > 0 ? '#00e676' : a.amount < 0 ? '#ff5252' : 'transparent' }}>
                                        {a.amount > 0 ? `+${money(a.amount)}` : a.amount < 0 ? `−${money(Math.abs(a.amount))}` : '—'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
};

/** Слуша действията на влезлия служител и ги подава на екрана. */
const StaffHome: React.FC = () => {
    const { currentUser } = useAuth();
    const [actions, setActions] = useState<StaffAction[] | null>(null);
    const [truncated, setTruncated] = useState(false);
    const [error, setError] = useState(false);
    const [now, setNow] = useState(() => new Date());

    // „преди 6 мин“ и „днес“ да не остаряват, докато екранът стои отворен.
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(t);
    }, []);

    const uid = currentUser?.id;
    const username = currentUser?.username;
    const role = currentUser?.role;

    useEffect(() => {
        if (!uid || !username) return;
        let unsub = () => {};

        if (role === 'inspector') {
            // Проверяващият чете само своите проверки (правилата не дават друго).
            unsub = onSnapshot(
                query(collection(db, 'inspector_scans'), where('inspectorId', '==', uid), orderBy('at', 'desc'), limit(OWN_LIMIT)),
                snap => {
                    setActions(snap.docs.map(d => {
                        const x = d.data();
                        const card = x.clientCard ? ` (Карта № ${x.clientCard})` : '';
                        return {
                            id: d.id, at: String(x.at || ''), action: 'Проверка',
                            target: `${x.clientName || 'Клиент'}${card}`,
                            details: [x.route, x.address].filter(Boolean).join(' · '),
                            amount: 0,
                        };
                    }));
                    setTruncated(snap.size >= OWN_LIMIT);
                    setError(false);
                },
                err => { console.error('Проверките не се заредиха:', err); setError(true); },
            );
            return () => unsub();
        }

        const logs = collection(db, 'activity_logs');
        const toAction = (id: string, x: Record<string, unknown>): StaffAction => ({
            id, at: String(x.timestamp || ''), action: String(x.action || ''), target: String(x.targetName || ''),
            details: String(x.details || ''), amount: typeof x.amount === 'number' && Number.isFinite(x.amount) ? x.amount : 0,
        });

        // Ако индексът по служител го няма (или още се строи), взимаме последните
        // действия на всички и оставяме само неговите. Покрива няколко дни назад.
        const listenShared = () => {
            unsub = onSnapshot(
                query(logs, orderBy('timestamp', 'desc'), limit(SHARED_LIMIT)),
                snap => {
                    setActions(snap.docs.filter(d => d.get('performedBy') === username).map(d => toAction(d.id, d.data())));
                    setTruncated(false);
                    setError(false);
                },
                err => { console.error('Действията не се заредиха:', err); setError(true); },
            );
        };

        unsub = onSnapshot(
            query(logs, where('performedBy', '==', username), orderBy('timestamp', 'desc'), limit(OWN_LIMIT)),
            snap => {
                setActions(snap.docs.map(d => toAction(d.id, d.data())));
                // Таванът е стигнат и най-старото още е от днес → денят не е цял.
                const oldest = snap.docs.length ? String(snap.docs[snap.docs.length - 1].get('timestamp') || '') : '';
                setTruncated(snap.size >= OWN_LIMIT && !!oldest && sameDay(new Date(oldest), new Date()));
                setError(false);
            },
            err => {
                if (err.code === 'failed-precondition') {
                    console.warn('Няма индекс за действията по служител — чета общия списък.');
                    listenShared();
                } else {
                    console.error('Действията не се заредиха:', err);
                    setError(true);
                }
            },
        );
        return () => unsub();
    }, [uid, username, role]);

    if (!currentUser) return null;
    return (
        <StaffHomeView
            username={username}
            role={role}
            now={now}
            actions={actions}
            error={error}
            inspector={role === 'inspector'}
            truncated={truncated}
        />
    );
};

export default StaffHome;
