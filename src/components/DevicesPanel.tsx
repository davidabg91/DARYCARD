import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import {
    LOW_BATTERY,
    OFFLINE_AFTER_MS,
    type DeviceDoc,
} from '../utils/deviceHeartbeat';
import {
    Smartphone, Wifi, WifiOff, BatteryFull, BatteryLow, BatteryCharging,
    Check, Pencil, Trash2, X, AlertTriangle, CreditCard, RefreshCw,
    Radio, RadioTower, Bug, ChevronDown, ChevronRight, MapPin
} from 'lucide-react';
import BatteryAlertsButton from './BatteryAlertsButton';

interface Props {
    /** Админ може да трие изчезнали устройства; модератор само гледа и преименува. */
    isAdmin: boolean;
}

// `now` се подава отвън: рисуването трябва да е чисто, а и така целият екран
// показва едно и също време, вместо всеки ред да чете часовника поотделно.
const fmtAgo = (iso: string | undefined, now: number): string => {
    if (!iso) return 'никога';
    const ms = now - new Date(iso).getTime();
    if (ms < 0) return 'сега';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'преди по-малко от минута';
    if (mins < 60) return `преди ${mins} мин.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `преди ${hours} ч.`;
    const days = Math.floor(hours / 24);
    return `преди ${days} дни`;
};

const fmtWhen = (iso?: string): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

interface Problem { text: string; hard: boolean }

interface DeviceError {
    id: string;
    message?: string;
    source?: string;
    appVersion?: string;
    lastAt?: string;
    count?: number;
}

/** Един прочетен чип, както го е записал `attributeScanToDevice`. */
interface SeenScan {
    at: string;
    clientId: string;
    name?: string;
    cardNumber?: string;
    route?: string;
    cardType?: string;
}

/** „0000000490" се чете трудно; на екрана върши работа само номерът. */
const fmtCardNumber = (n?: string): string => {
    const digits = String(n || '').replace(/^0+/, '');
    return digits ? `№ ${digits}` : '—';
};

/** След толкова без нито един прочетен чип вече е подозрително. */
const NFC_SILENT_MS = 12 * 60 * 60 * 1000;

/**
 * Изключен терминал НЕ е проблем — вечер всички са изключени. Затова липсата на
 * връзка се вижда само по реда („Последно преди 2 ч.") и не влиза в брояча.
 * Проблем е чак когато устройство мълчи с дни: тогава или е забравено някъде,
 * или е счупено.
 */
const LOST_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Четецът докладва „UID read" и когато картата се отдръпва СЛЕД като вече е
 * прочетена — това е краят на нормалното допиране, не повреда. Мерено на живо:
 * и трите терминала, които светеха оранжево, имаха грешка на по-малко от
 * секунда от успешно четене, а помежду си бяха прочели 162 карти за деня.
 * Затова грешка на една и съща ръка с четене се брои за част от същото допиране.
 */
const NFC_SAME_TAP_MS = 5000;

/**
 * Стара грешка не е текущ проблем. Плъгинът помни последната, докато
 * приложението не се рестартира, затова без таван на екрана стоеше грешка
 * отпреди пет дни.
 */
const NFC_ERROR_FRESH_MS = 6 * 60 * 60 * 1000;

/**
 * Заслужава ли грешката да се покаже. Само когато четенето наистина е спряло:
 * след нея няма успешно четене, не е опашка на същото допиране и е отскоро.
 * Иначе екранът вика при всяко нормално прекарване на карта и се научаваш да
 * не му вярваш — а тогава не върши работа и когато четецът наистина откаже.
 */
const isNfcErrorWorthShowing = (d: DeviceDoc, online: boolean, now: number): boolean => {
    if (!d.nfcLastError || !d.nfcLastErrorAt) return false;
    const errAt = new Date(d.nfcLastErrorAt).getTime();
    if (!isFinite(errAt)) return false;
    if (!online) return false;
    if (now - errAt > NFC_ERROR_FRESH_MS) return false;
    const tagAt = d.nfcLastTagAt ? new Date(d.nfcLastTagAt).getTime() : 0;
    if (tagAt > errAt) return false;
    return Math.abs(errAt - tagAt) > NFC_SAME_TAP_MS;
};

/** Съобщенията идват от плъгина на английски и с кратко име на мястото. */
const NFC_ERROR_TEXT: { prefix: string; text: string }[] = [
    { prefix: 'UID read', text: 'Картата е усетена, но номерът на чипа не се прочете — бързо прекарване, слаб контакт или чужда карта' },
    { prefix: 'Detection', text: 'Прекъснато откриване на карта' },
    { prefix: 'Hardware loop', text: 'Прекъсване в четящия цикъл' },
    { prefix: 'Process', text: 'Грешка при обработката на картата' },
    { prefix: 'SDK binding', text: 'myPOS четецът не се върза към приложението' },
];

const describeNfcError = (raw: string): string => {
    const hit = NFC_ERROR_TEXT.find(e => raw.startsWith(e.prefix));
    if (!hit) return raw;
    const detail = raw.slice(hit.prefix.length).replace(/^:\s*/, '').trim();
    return detail ? `${hit.text} (${detail})` : hit.text;
};

/**
 * `newestVersion` е най-новата версия СРЕД ТЕРМИНАЛИТЕ, а не версията на сайта.
 * Версията в терминала се сменя само с ново APK, а сайтът се обновява и заради
 * промени, които изобщо не го засягат — сравнението със сайта светеше винаги и
 * не значеше нищо. Така етикетът излиза точно когато един терминал е пропуснал
 * обновяване, което другите са получили.
 */
const findProblems = (d: DeviceDoc, online: boolean, newestVersion: string, now: number): Problem[] => {
    const problems: Problem[] = [];
    const silentFor = d.lastSeen ? now - new Date(d.lastSeen).getTime() : Infinity;
    if (!online && silentFor > LOST_AFTER_MS) {
        problems.push({ text: `Не се е обаждало ${fmtAgo(d.lastSeen, now)}`, hard: false });
    }
    if (typeof d.batteryLevel === 'number' && d.batteryLevel <= LOW_BATTERY && !d.batteryCharging) {
        problems.push({ text: `Батерия ${d.batteryLevel}%`, hard: d.batteryLevel <= 10 });
    }
    if (newestVersion && d.appVersion && d.appVersion < newestVersion) {
        problems.push({ text: `По-стара версия от другите терминали (${d.appVersion})`, hard: false });
    }
    if (online && d.scanDate !== new Date(now).toISOString().slice(0, 10)) {
        problems.push({ text: 'Няма сканирания днес', hard: false });
    }
    // Здравето на четеца го докладва нативният плъгин. `undefined` значи старо
    // APK, което още не го докладва — тогава мълчим, вместо да лъжем.
    if (online && d.nfcBound === false) {
        problems.push({ text: 'NFC четецът не е вързан', hard: true });
    } else if (online && d.nfcBound === true && d.nfcLastTagAt
        && now - new Date(d.nfcLastTagAt).getTime() > NFC_SILENT_MS) {
        problems.push({ text: `NFC мълчи от ${fmtAgo(d.nfcLastTagAt, now)}`, hard: false });
    }
    return problems;
};

const DevicesPanel: React.FC<Props> = ({ isAdmin }) => {
    const [devices, setDevices] = useState<(DeviceDoc & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftName, setDraftName] = useState('');
    // Дневникът се чете чак при разгъване — няма смисъл да се тегли за всяко
    // устройство при отваряне на таба.
    const [openLog, setOpenLog] = useState<string | null>(null);
    const [logs, setLogs] = useState<Record<string, DeviceError[]>>({});
    const [logLoading, setLogLoading] = useState(false);
    // Същото като дневника: списъкът с карти се тегли чак при натискане.
    const [openCards, setOpenCards] = useState<string | null>(null);
    const [cards, setCards] = useState<Record<string, SeenScan[]>>({});
    const [cardsLoading, setCardsLoading] = useState(false);
    // Прекроява екрана веднъж в минута, за да не остарява „преди 3 мин.".
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, 'devices'),
            snap => {
                setDevices(snap.docs.map(d => ({ ...(d.data() as DeviceDoc), id: d.id })));
                setLoading(false);
            },
            err => { console.error('Списъкът с устройства не се зареди:', err); setLoading(false); }
        );
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => { unsub(); clearInterval(timer); };
    }, []);

    const rows = useMemo(() => {
        // Версиите са с водещи нули (ГГГГ.ММ.ДД.ЧЧ.ММ), значи азбучният ред съвпада
        // с хронологичния и най-новата се намира с обикновено сравнение.
        const newestVersion = devices.reduce(
            (max, d) => (d.appVersion && d.appVersion > max ? d.appVersion : max), '');
        return devices
            .map(d => {
                const online = !!d.lastSeen && (now - new Date(d.lastSeen).getTime()) < OFFLINE_AFTER_MS;
                return { ...d, online, problems: findProblems(d, online, newestVersion, now) };
            })
            .sort((a, b) => {
                if (a.online !== b.online) return a.online ? -1 : 1;
                // Работещите се нареждат по име, не по `lastSeen`. Всеки терминал
                // пише пулс на всеки две минути, значи „кой се е обадил последен"
                // се сменя постоянно — измерено на живо съседните редове бяха на
                // 1 до 23 секунди един от друг, тоест списъкът се пренареждаше
                // непрекъснато, без това да значи каквото и да е. Името не мърда,
                // затова редът си стои и окото намира устройството, където го е
                // оставило. Изключените остават отдолу, най-скоро видяното първо —
                // там времето наистина е информация.
                if (a.online) {
                    return (a.name || a.autoName || a.id)
                        .localeCompare(b.name || b.autoName || b.id, 'bg');
                }
                return (b.lastSeen || '').localeCompare(a.lastSeen || '');
            });
    }, [devices, now]);

    const onlineCount = rows.filter(r => r.online).length;
    const troubled = rows.filter(r => r.problems.some(p => p.hard)).length;
    // Изтощените батерии са на върха на екрана, не само като етикет на реда —
    // това е нещото, което иска да се види от вратата.
    const lowBattery = rows.filter(r =>
        typeof r.batteryLevel === 'number' && r.batteryLevel <= LOW_BATTERY && !r.batteryCharging);

    const saveName = async (id: string) => {
        const name = draftName.trim();
        try {
            await updateDoc(doc(db, 'devices', id), { name });
            setEditingId(null);
        } catch (err) {
            console.error('Името не се записа:', err);
        }
    };

    const toggleLog = async (id: string) => {
        if (openLog === id) { setOpenLog(null); return; }
        setOpenLog(id);
        if (logs[id]) return;
        setLogLoading(true);
        try {
            const snap = await getDocs(query(
                collection(db, 'devices', id, 'errors'),
                orderBy('lastAt', 'desc'),
                limit(25)
            ));
            setLogs(prev => ({ ...prev, [id]: snap.docs.map(d => ({ ...(d.data() as DeviceError), id: d.id })) }));
        } catch (err) {
            console.error('Дневникът не се зареди:', err);
            setLogs(prev => ({ ...prev, [id]: [] }));
        } finally {
            setLogLoading(false);
        }
    };

    // Дневният документ се прекроява само докато терминалът чете карти, затова
    // повторното отваряне тегли наново — иначе списъкът замръзва до презареждане.
    const toggleCards = async (id: string) => {
        if (openCards === id) { setOpenCards(null); return; }
        setOpenCards(id);
        setCardsLoading(true);
        try {
            const today = new Date().toISOString().slice(0, 10);
            const snap = await getDoc(doc(db, 'devices', id, 'seen', today));
            const list = snap.exists() ? ((snap.data().scans as SeenScan[]) || []) : [];
            setCards(prev => ({ ...prev, [id]: [...list].sort((a, b) => (b.at || '').localeCompare(a.at || '')) }));
        } catch (err) {
            console.error('Списъкът с карти не се зареди:', err);
            setCards(prev => ({ ...prev, [id]: [] }));
        } finally {
            setCardsLoading(false);
        }
    };

    const clearLog = async (id: string) => {
        if (!window.confirm('Да изчистя ли дневника на това устройство?')) return;
        try {
            const snap = await getDocs(collection(db, 'devices', id, 'errors'));
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            setLogs(prev => ({ ...prev, [id]: [] }));
        } catch (err) {
            console.error('Дневникът не се изчисти:', err);
        }
    };

    const removeDevice = async (id: string, label: string) => {
        if (!window.confirm(`Да махна ли „${label}" от списъка?\n\nАко устройството още работи, само след няколко минути ще се впише отново.`)) return;
        try {
            await deleteDoc(doc(db, 'devices', id));
        } catch (err) {
            console.error('Устройството не се изтри:', err);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Зареждам устройствата…</div>;
    }

    if (!rows.length) {
        return (
            <div>
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <Smartphone size={40} style={{ opacity: 0.4, marginBottom: '1rem' }} />
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: '#fff' }}>Още няма вписано устройство</div>
                    <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                        Всеки терминал се вписва сам при пускане на приложението — до две минути
                        след като APK-то с тази промяна влезе на него. Браузър и PWA не се вписват.
                    </div>
                </div>
                <BatteryAlertsButton />
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                <div style={{ flex: 1, minWidth: '150px', padding: '1rem', background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>На линия</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#00c853' }}>{onlineCount} / {rows.length}</div>
                </div>
                <div style={{ flex: 1, minWidth: '150px', padding: '1rem', background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.25)', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>С проблем</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: troubled ? '#ff5252' : 'var(--text-secondary)' }}>{troubled}</div>
                </div>
            </div>

            {lowBattery.length > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.7rem',
                    padding: '0.9rem 1rem', marginBottom: '1.25rem', borderRadius: '12px',
                    background: 'rgba(255,152,0,0.1)', border: '1px solid rgba(255,152,0,0.4)'
                }}>
                    <BatteryLow size={22} color="#ff9800" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 800, color: '#ff9800', marginBottom: '0.2rem' }}>
                            {lowBattery.length === 1 ? 'Изтощена батерия' : `Изтощени батерии: ${lowBattery.length}`}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>
                            {lowBattery.map(d => `${d.name || d.autoName || d.id} — ${d.batteryLevel}%`).join(' · ')}
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {rows.map(d => {
                    const label = d.name || d.autoName || d.id;
                    const battery = typeof d.batteryLevel === 'number' ? d.batteryLevel : null;
                    const batteryColor = battery === null ? 'var(--text-secondary)'
                        : d.batteryCharging ? '#00c853'
                            : battery <= 10 ? '#ff5252'
                                : battery <= LOW_BATTERY ? '#ff9800' : '#00c853';
                    const BatteryIcon = d.batteryCharging ? BatteryCharging : (battery !== null && battery <= LOW_BATTERY ? BatteryLow : BatteryFull);

                    return (
                        <div key={d.id} style={{
                            padding: '0.9rem 1rem',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--surface-border)',
                            borderLeft: `3px solid ${d.online ? '#00c853' : '#616161'}`,
                            borderRadius: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                {d.online
                                    ? <Wifi size={18} color="#00c853" />
                                    : <WifiOff size={18} color="#9e9e9e" />}

                                {editingId === d.id ? (
                                    <>
                                        <input
                                            value={draftName}
                                            onChange={e => setDraftName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') saveName(d.id); if (e.key === 'Escape') setEditingId(null); }}
                                            placeholder="Име на шофьора"
                                            autoFocus
                                            style={{ flex: 1, minWidth: '140px', padding: '0.45rem 0.7rem', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none', fontWeight: 700 }}
                                        />
                                        <button onClick={() => saveName(d.id)} aria-label="Запиши" style={{ background: '#00c853', border: 'none', color: '#fff', borderRadius: '8px', padding: '0.45rem 0.6rem', cursor: 'pointer' }}>
                                            <Check size={16} />
                                        </button>
                                        <button onClick={() => setEditingId(null)} aria-label="Откажи" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--surface-border)', color: '#fff', borderRadius: '8px', padding: '0.45rem 0.6rem', cursor: 'pointer' }}>
                                            <X size={16} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ fontWeight: 800, fontSize: '1rem' }}>{label}</span>
                                        {!d.name && (
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>
                                                без име
                                            </span>
                                        )}
                                        <button
                                            onClick={() => { setEditingId(d.id); setDraftName(d.name || ''); }}
                                            aria-label="Преименувай"
                                            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem' }}
                                        >
                                            <Pencil size={15} />
                                        </button>
                                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem', color: batteryColor, fontWeight: 800, fontSize: '0.95rem' }}>
                                            <BatteryIcon size={18} />
                                            {battery === null ? '—' : `${battery}%`}
                                        </span>
                                    </>
                                )}
                            </div>

                            {/*
                                Линията се познава по картите, четени днес — значи е
                                заключение, не факт. Показва се като днешна само ако е
                                от днес; иначе се показва избледняла с датата, за да не
                                изглежда вчерашният курс като текущ.
                             */}
                            {d.currentRoute && (() => {
                                const today = new Date().toISOString().slice(0, 10);
                                const fresh = (d.currentRouteAt || '').slice(0, 10) === today;
                                return (
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                        alignSelf: 'flex-start', margin: '0.15rem 0 0.1rem',
                                        padding: '0.28rem 0.7rem', borderRadius: '10px',
                                        background: fresh ? 'rgba(0,173,181,0.12)' : 'rgba(255,255,255,0.04)',
                                        border: `1px solid ${fresh ? 'rgba(0,173,181,0.35)' : 'var(--surface-border)'}`,
                                        color: fresh ? 'var(--primary-color)' : 'var(--text-secondary)',
                                        fontWeight: 800, fontSize: '0.82rem'
                                    }}>
                                        <MapPin size={14} />
                                        {d.currentRoute}
                                        <span style={{ fontWeight: 600, fontSize: '0.7rem', opacity: 0.75 }}>
                                            {fresh
                                                ? `· по ${d.currentRouteScans || 0} карти днес`
                                                : `· от ${fmtWhen(d.currentRouteAt)}`}
                                        </span>
                                    </div>
                                );
                            })()}

                            <div style={{ display: 'flex', gap: '0.4rem 1rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                <span>{d.online ? 'На линия' : `Последно ${fmtAgo(d.lastSeen, now)}`}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <CreditCard size={13} /> {d.scansToday || 0} днес · последна {fmtWhen(d.lastScanAt)}
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <RefreshCw size={13} /> {d.appVersion || '—'}
                                </span>
                                {d.nfcBound !== undefined && d.nfcBound !== null && (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                        color: d.nfcBound ? '#00c853' : '#ff5252', fontWeight: 700
                                    }}>
                                        {d.nfcBound ? <RadioTower size={13} /> : <Radio size={13} />}
                                        {d.nfcBound
                                            ? `NFC работи${d.nfcLastTagAt ? ` · четене ${fmtAgo(d.nfcLastTagAt, now)}` : ''}`
                                            : 'NFC не е вързан'}
                                    </span>
                                )}
                                <button
                                    onClick={() => toggleCards(d.id)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 700, padding: 0 }}
                                >
                                    {openCards === d.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                    <CreditCard size={13} /> Карти днес
                                </button>
                                <button
                                    onClick={() => toggleLog(d.id)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 700, padding: 0 }}
                                >
                                    {openLog === d.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                    <Bug size={13} /> Грешки
                                </button>
                                {isAdmin && (
                                    <button
                                        onClick={() => removeDevice(d.id, label)}
                                        style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ff5252', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700, padding: 0 }}
                                    >
                                        <Trash2 size={13} /> Махни
                                    </button>
                                )}
                            </div>

                            {isNfcErrorWorthShowing(d, d.online, now) && d.nfcLastError && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', lineHeight: 1.45, color: '#ff9800' }}>
                                    Четецът не е прочел карта {fmtAgo(d.nfcLastErrorAt ?? undefined, now)} и оттогава няма успешно
                                    четене: {describeNfcError(d.nfcLastError)}
                                </div>
                            )}

                            {openCards === d.id && (
                                <div style={{ marginTop: '0.7rem', padding: '0.7rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--surface-border)', borderRadius: '10px' }}>
                                    {cardsLoading && !cards[d.id] ? (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Зареждам…</div>
                                    ) : !cards[d.id] || cards[d.id].length === 0 ? (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                            Няма разпознати карти за днес.
                                            {(d.scansToday || 0) > 0 && ` Терминалът е чел ${d.scansToday} карти — когато две устройства сканират в една и съща секунда, картата не се приписва на никое от тях.`}
                                        </div>
                                    ) : (
                                        <>
                                            {/*
                                                Показваше „N разпознати от M прочетени днес" и изглеждаше
                                                като пропуск, какъвто няма: `scansToday` е броячът на
                                                терминала от полунощ, а списъкът се пълни само докато
                                                свързването работи — при пускането му в 12:07 всички
                                                сутрешни допирания вече бяха минали и не могат да се
                                                възстановят. Двете числа просто не покриват едно и също
                                                време, затова сега пише обхвата, а не съотношение.
                                             */}
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                                                {cards[d.id].length} карти · от {
                                                    new Date(cards[d.id][cards[d.id].length - 1].at)
                                                        .toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
                                                } до {
                                                    new Date(cards[d.id][0].at)
                                                        .toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
                                                }
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                {cards[d.id].map(s => (
                                                    <div key={`${s.at}-${s.clientId}`} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '0.78rem', lineHeight: 1.45 }}>
                                                        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--primary-color)' }}>
                                                            {new Date(s.at).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        <span style={{ fontWeight: 700 }}>{s.name || '—'}</span>
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{fmtCardNumber(s.cardNumber)}</span>
                                                        {s.route && (
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '5px' }}>
                                                                {s.route}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {openLog === d.id && (
                                <div style={{ marginTop: '0.7rem', padding: '0.7rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--surface-border)', borderRadius: '10px' }}>
                                    {logLoading && !logs[d.id] ? (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Зареждам…</div>
                                    ) : !logs[d.id] || logs[d.id].length === 0 ? (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Няма записани грешки.</div>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {logs[d.id].map(e => (
                                                    <div key={e.id} style={{ fontSize: '0.78rem', lineHeight: 1.45 }}>
                                                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 800, color: '#ff9800' }}>{e.count || 1}×</span>
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '5px' }}>{e.source || '?'}</span>
                                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{fmtWhen(e.lastAt)}</span>
                                                            {e.appVersion && <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>v{e.appVersion}</span>}
                                                        </div>
                                                        <div style={{ fontFamily: 'monospace', wordBreak: 'break-word', color: 'rgba(255,255,255,0.8)' }}>{e.message}</div>
                                                    </div>
                                                ))}
                                            </div>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => clearLog(d.id)}
                                                    style={{ marginTop: '0.7rem', background: 'transparent', border: 'none', color: '#ff5252', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, padding: 0 }}
                                                >
                                                    Изчисти дневника
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {d.problems.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                                    {d.problems.map((p, i) => (
                                        <span key={i} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                            fontSize: '0.72rem', fontWeight: 700,
                                            color: p.hard ? '#ff5252' : '#ff9800',
                                            background: p.hard ? 'rgba(255,82,82,0.12)' : 'rgba(255,152,0,0.12)',
                                            padding: '3px 9px', borderRadius: '6px'
                                        }}>
                                            <AlertTriangle size={12} /> {p.text}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: '1.5rem' }}>
                <BatteryAlertsButton />
            </div>
        </div>
    );
};

export default DevicesPanel;
