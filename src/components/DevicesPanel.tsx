import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
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
    Radio, RadioTower, Bug, ChevronDown, ChevronRight, MapPin,
    Satellite, MapPinOff, Route, Map as MapIcon
} from 'lucide-react';
import BatteryAlertsButton from './BatteryAlertsButton';
import TestPrintCard from './TestPrintCard';
import type { LivePosition } from './devices/DevicesLiveMap';

// Картите теглят Leaflet — зареждат се чак когато някой ги отвори.
const DeviceTrack = lazy(() => import('./devices/DeviceTrack'));
const DevicesLiveMap = lazy(() => import('./devices/DevicesLiveMap'));

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

/** `positions/{id}` — какво терминалът докладва на всеки 30 s (vehiclePosition.ts). */
interface PositionDoc {
    reportedAt?: string;
    gps?: 'ok' | 'denied' | 'unavailable' | 'waiting';
    gpsDetail?: string;
    lat?: number;
    lng?: number;
    accuracy?: number | null;
    fixAt?: string;
    track?: number[];
}

/**
 * Колко бърза или изостава часовникът на терминала: часът на сървъра минус
 * часа на терминала при един и същ запис. Под минута е мрежата, не часовникът.
 * Отрицателно — терминалът бърза (ръчно сверен и не минал на зимно време).
 */
const clockSkew = (d: DeviceDoc): number => {
    const server = d.serverSeen?.toMillis?.();
    const own = d.lastSeen ? Date.parse(d.lastSeen) : NaN;
    if (!server || !isFinite(own)) return 0;
    const skew = server - own;
    return Math.abs(skew) > 60 * 1000 ? skew : 0;
};

/** Часовете, писани с часовника на терминала, преместени на верния час. */
const shiftIso = (iso: string | null | undefined, skew: number) =>
    iso && skew ? new Date(Date.parse(iso) + skew).toISOString() : iso;

const shiftDevice = (d: DeviceDoc & { id: string }, skew: number): DeviceDoc & { id: string } => skew ? {
    ...d,
    lastSeen: shiftIso(d.lastSeen, skew) || undefined,
    lastScanAt: shiftIso(d.lastScanAt, skew) || undefined,
    batteryAt: shiftIso(d.batteryAt, skew) ?? null,
    nfcLastTagAt: shiftIso(d.nfcLastTagAt, skew) ?? null,
    nfcLastErrorAt: shiftIso(d.nfcLastErrorAt, skew) ?? null,
    currentRouteAt: shiftIso(d.currentRouteAt, skew) || undefined,
} : d;

const shiftPosition = (p: PositionDoc, skew: number): PositionDoc => skew ? {
    ...p,
    reportedAt: shiftIso(p.reportedAt, skew) || undefined,
    fixAt: shiftIso(p.fixAt, skew) || undefined,
    track: (p.track || []).map((x, i) => (i % 3 === 2 ? x + skew : x)),
} : p;

/** Точка, по-стара от това, вече не е „сега". */
const GPS_FRESH_MS = 3 * 60 * 1000;
/** Толкова без точка, докато терминалът работи, е проблем. */
const GPS_LOST_MS = 10 * 60 * 1000;

/**
 * Какво да пише на реда за GPS-а. Без документ значи терминалът е със старо APK,
 * което не праща позиция — това не е повреда, затова е сиво, не червено.
 */
const describeGps = (p: PositionDoc | undefined, online: boolean, now: number): { text: string; color: string } => {
    if (!p) return { text: 'GPS: няма данни (старо APK)', color: 'var(--text-secondary)' };
    const fixAge = p.fixAt ? now - new Date(p.fixAt).getTime() : Infinity;
    const acc = typeof p.accuracy === 'number' ? ` · ±${p.accuracy} м` : '';
    if (p.gps === 'denied') return { text: 'GPS: отказан достъп до местоположение', color: '#ff5252' };
    if (fixAge < GPS_FRESH_MS) return { text: `GPS работи${acc}`, color: '#00c853' };
    if (!online) return { text: p.fixAt ? `GPS: последна точка ${fmtAgo(p.fixAt, now)}` : 'GPS: още няма точка', color: 'var(--text-secondary)' };
    return {
        text: p.fixAt ? `GPS: без сигнал, последна точка ${fmtAgo(p.fixAt, now)}` : 'GPS: чака сигнал',
        color: '#ff9800',
    };
};

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
    /** Без платен месец или анулирана. */
    unpaid?: boolean;
    /** Проверена от списъка в терминала, без връзка. */
    offline?: boolean;
    lat?: number;
    lng?: number;
    place?: string;
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
const findProblems = (d: DeviceDoc, online: boolean, newestVersion: string, now: number, pos?: PositionDoc, skew = 0): Problem[] => {
    const problems: Problem[] = [];
    if (Math.abs(skew) >= 2 * 60 * 1000) {
        const mins = Math.round(Math.abs(skew) / 60000);
        problems.push({
            text: `Часовникът на терминала ${skew < 0 ? 'бърза' : 'изостава'} с ${mins} мин — включи „Автоматични дата и час“`,
            hard: mins >= 10,
        });
    }
    // GPS — само за терминали, които изобщо пращат позиция (новото APK).
    if (online && pos) {
        const fixAge = pos.fixAt ? now - new Date(pos.fixAt).getTime() : Infinity;
        const reporting = !!pos.reportedAt && now - new Date(pos.reportedAt).getTime() < GPS_FRESH_MS;
        if (pos.gps === 'denied') {
            problems.push({ text: 'GPS: отказан достъп — разреши местоположението на терминала', hard: true });
        } else if (reporting && fixAge > GPS_LOST_MS) {
            problems.push({ text: pos.fixAt ? `Няма GPS сигнал от ${fmtAgo(pos.fixAt, now).replace('преди ', '')}` : 'GPS не е хванал сигнал', hard: false });
        }
    }
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
    const [positions, setPositions] = useState<Record<string, PositionDoc>>({});
    const [openTrack, setOpenTrack] = useState<string | null>(null);
    const [showLiveMap, setShowLiveMap] = useState(false);
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
        // Позициите са малки документи, по един на терминал — слушат се всички,
        // за да се вижда GPS-ът на всеки ред без натискане.
        const unsubPos = onSnapshot(
            collection(db, 'positions'),
            snap => setPositions(Object.fromEntries(snap.docs.map(d => [d.id, d.data() as PositionDoc]))),
            err => console.error('Позициите не се заредиха:', err)
        );
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => { unsub(); unsubPos(); clearInterval(timer); };
    }, []);

    // Всички часове от терминала се показват поправени с отклонението на часовника му.
    const skews = useMemo(() => Object.fromEntries(devices.map(d => [d.id, clockSkew(d)])), [devices]);
    const fixedDevices = useMemo(() => devices.map(d => shiftDevice(d, skews[d.id] || 0)), [devices, skews]);
    const fixedPositions = useMemo(() => Object.fromEntries(Object.entries(positions)
        .map(([id, p]) => [id, shiftPosition(p, skews[id] || 0)])), [positions, skews]);

    const rows = useMemo(() => {
        // Версиите са с водещи нули (ГГГГ.ММ.ДД.ЧЧ.ММ), значи азбучният ред съвпада
        // с хронологичния и най-новата се намира с обикновено сравнение.
        const newestVersion = fixedDevices.reduce(
            (max, d) => (d.appVersion && d.appVersion > max ? d.appVersion : max), '');
        return fixedDevices
            .map(d => {
                const online = !!d.lastSeen && (now - new Date(d.lastSeen).getTime()) < OFFLINE_AFTER_MS;
                return { ...d, online, problems: findProblems(d, online, newestVersion, now, fixedPositions[d.id], skews[d.id] || 0) };
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
    }, [fixedDevices, now, fixedPositions, skews]);

    const livePositions = useMemo<LivePosition[]>(() => rows
        .filter(r => typeof fixedPositions[r.id]?.lat === 'number' && typeof fixedPositions[r.id]?.lng === 'number')
        .map(r => ({
            id: r.id,
            label: r.name || r.autoName || r.id,
            lat: fixedPositions[r.id].lat!,
            lng: fixedPositions[r.id].lng!,
            fixAt: fixedPositions[r.id].fixAt,
        })), [rows, fixedPositions]);
    const gpsWorking = rows.filter(r => r.online && fixedPositions[r.id]?.fixAt
        && now - new Date(fixedPositions[r.id].fixAt!).getTime() < GPS_FRESH_MS).length;

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
                <div style={{ flex: 1, minWidth: '150px', padding: '1rem', background: 'rgba(0,173,181,0.08)', border: '1px solid rgba(0,173,181,0.25)', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>С GPS сигнал сега</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: gpsWorking ? 'var(--primary-color)' : 'var(--text-secondary)' }}>{gpsWorking} / {onlineCount}</div>
                </div>
            </div>

            <button
                onClick={() => setShowLiveMap(v => !v)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', marginBottom: showLiveMap ? '0.7rem' : '1.25rem', padding: '0.55rem 0.9rem', borderRadius: '10px', background: 'rgba(0,173,181,0.12)', border: '1px solid rgba(0,173,181,0.35)', color: 'var(--primary-color)', fontWeight: 800, cursor: 'pointer' }}
            >
                <MapIcon size={16} /> {showLiveMap ? 'Скрий картата' : 'Всички терминали на картата'}
            </button>
            {showLiveMap && (
                <div style={{ marginBottom: '1.25rem' }}>
                    {livePositions.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Още няма терминал с GPS точка. Позицията идва само от новото APK (1.4.5 и нагоре) и след като на терминала е разрешено местоположението.
                        </div>
                    ) : (
                        <Suspense fallback={<div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Зареждам картата…</div>}>
                            <DevicesLiveMap positions={livePositions} now={now} />
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                                Зелено — точка от последните 3 минути. Сиво — последната известна точка, с часа ѝ.
                            </div>
                        </Suspense>
                    )}
                </div>
            )}

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
                                {(() => {
                                    const g = describeGps(fixedPositions[d.id], d.online, now);
                                    const Icon = fixedPositions[d.id] ? Satellite : MapPinOff;
                                    return (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: g.color, fontWeight: 700 }}>
                                            <Icon size={13} /> {g.text}
                                        </span>
                                    );
                                })()}
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
                                    onClick={() => setOpenTrack(openTrack === d.id ? null : d.id)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: 700, padding: 0 }}
                                >
                                    {openTrack === d.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                    <Route size={13} /> Път на картата
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

                            {openTrack === d.id && (
                                <div style={{ marginTop: '0.7rem', padding: '0.7rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--surface-border)', borderRadius: '10px' }}>
                                    <Suspense fallback={<div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Зареждам картата…</div>}>
                                        <DeviceTrack deviceId={d.id} liveTrack={fixedPositions[d.id]?.track} skewMs={skews[d.id] || 0} />
                                    </Suspense>
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
                                                        {s.unpaid && (
                                                            <span style={{ color: '#fff', fontSize: '0.68rem', fontWeight: 900, background: '#e53935', padding: '1px 6px', borderRadius: '5px' }}>
                                                                БЕЗ АБОНАМЕНТ
                                                            </span>
                                                        )}
                                                        {s.offline && (
                                                            <span style={{ color: '#29b6f6', fontSize: '0.68rem', fontWeight: 700 }} title="Проверена от списъка в терминала, без връзка">без връзка</span>
                                                        )}
                                                        {(s.place || (typeof s.lat === 'number' && typeof s.lng === 'number')) && (
                                                            typeof s.lat === 'number' && typeof s.lng === 'number'
                                                                ? <a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: '#4fc3f7', fontSize: '0.7rem' }}>📍 {s.place || 'на картата'}</a>
                                                                : <span style={{ color: '#4fc3f7', fontSize: '0.7rem' }}>📍 {s.place}</span>
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

            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <BatteryAlertsButton />
                {/* Показва се само на самия терминал — от браузър няма какво да печата. */}
                <TestPrintCard />
            </div>
        </div>
    );
};

export default DevicesPanel;
