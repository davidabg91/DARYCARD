import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    CalendarClock, MapPin, Route as RouteIcon, Plus, Trash2, Save, X, Check,
    AlertTriangle, Loader2, Search, Download, CalendarDays, ChevronDown, ChevronUp, ListChecks, Ticket,
} from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import {
    HOLIDAY_RULES, STANDARD_SERVICES, WEEKDAYS, checkDirection, describeDays, hasPoint,
    normalizeStopName, toMinutes, useServices, useStops, useTimetables,
    type HolidayRule, type Service, type Stop, type Timetable,
} from '../../utils/timetable';
import { buildImportPlan } from '../../utils/timetableImport';
import { holidaysFor } from '../../utils/holidays';
import StopMap, { type Point } from './StopMap';
import TimetableEditor from './TimetableEditor';
import ComplianceCard from './ComplianceCard';
import StopSuggestions from './StopSuggestions';
import { RIDER_CATEGORIES, buildFareTable, sameFare } from '../../utils/fares';

/**
 * „Разписания“ — където се въвежда това, което Наредба Н-7 иска да се подаде в
 * Националната точка за достъп: спирките на картата, дните на движение и
 * часовете по всяка линия.
 *
 * Пренесено от TransitFlow и стеснено до една фирма: колекциите са на горно
 * ниво (`stops`, `services`, `timetables`), без пакети и модули. Линиите идват
 * от разписанието на сайта (`src/data/schedules.ts`) с бутона „Пренеси“ —
 * сайтът и Landing продължават да четат оттам, докато не се реши друго.
 *
 * Отделен файл, зареждан лениво от админ панела: картата (Leaflet) е тежка и
 * трябва само тук.
 */

const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--surface-border)',
    borderRadius: '20px',
    padding: '1.5rem',
    marginBottom: '2rem',
};

const input: React.CSSProperties = {
    width: '100%', padding: '0.7rem 0.9rem', borderRadius: '11px',
    background: 'rgba(0,0,0,0.28)', border: '1px solid var(--surface-border)',
    color: '#fff', fontSize: '0.95rem', outline: 'none',
};

const label: React.CSSProperties = {
    display: 'block', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.4rem',
};

const h2: React.CSSProperties = {
    margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem',
};

const greenBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
    padding: '0.6rem 1.1rem', borderRadius: '11px', cursor: 'pointer',
    background: 'rgba(0,200,83,0.12)', border: '1px solid rgba(0,200,83,0.35)',
    color: '#00c853', fontWeight: 700, fontSize: '0.88rem',
};

const plainBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.45rem 0.9rem', borderRadius: '9px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)',
    color: '#fff', fontSize: '0.82rem', fontWeight: 700,
};

const errText = (e: unknown, fallback: string) => (e as { message?: string }).message || fallback;

/** "43.4170, 24.6067" as Google Maps copies it — the quickest way to place a stop that is already on Google. */
const parsePoint = (text: string): Point | null => {
    const m = /(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/.exec(text);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
};

/** Курсове, на които липсва час на последната спирка — т.е. времето за пътуване. */
const missingEnd = (tt: Timetable) => tt.directions.reduce((n, d) =>
    n + (d.stopIds.length < 2 ? d.trips.length : d.trips.filter(t => !t.times[d.stopIds.length - 1]?.trim()).length), 0);

const TimetablesPanel: React.FC = () => {
    const { currentUser } = useAuth();
    const { stops, loading: stopsLoading } = useStops();
    const { services, loading: servicesLoading } = useServices();
    const { timetables, loading: ttLoading } = useTimetables();

    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
    const [busy, setBusy] = useState(false);
    const [editingStop, setEditingStop] = useState<Stop | null>(null);
    const [editing, setEditing] = useState<Timetable | null>(null);
    const [stopFilter, setStopFilter] = useState('');
    const [showHolidays, setShowHolidays] = useState(false);
    const [showServed, setShowServed] = useState(false);
    const [showDupes, setShowDupes] = useState(false);
    const [showFares, setShowFares] = useState(false);

    // ── Fares ────────────────────────────────────────────────────────────────

    /**
     * Цените се продават от ROUTE_METADATA; функцията `gtfs` ги чете от колекция
     * `fares`. Всяко отваряне на таба ги сверява и преписва само разликите —
     * веднъж, а не при всяка снимка (не се пише в документ, който слушаш).
     */
    const fareTable = useMemo(() => buildFareTable(), []);
    const [storedFares, setStoredFares] = useState<Record<string, Record<string, unknown>> | null>(null);
    useEffect(() => onSnapshot(collection(db, 'fares'), snap => {
        const out: Record<string, Record<string, unknown>> = {};
        snap.docs.forEach(d => { out[d.id] = d.data(); });
        setStoredFares(out);
    }, err => console.error('Fares unavailable:', err)), []);
    const faresSynced = useRef(false);
    useEffect(() => {
        if (!storedFares || faresSynced.current) return;
        faresSynced.current = true;
        const changed = fareTable.filter(f => !sameFare(f, storedFares[f.id]));
        if (!changed.length) return;
        const batch = writeBatch(db);
        changed.forEach(f => batch.set(doc(db, 'fares', f.id), f));
        batch.commit().catch(err => console.error('Fares not synced:', err));
    }, [storedFares, fareTable]);
    const passCount = fareTable.reduce((n, f) => n + Object.keys(f.passes).length, 0);

    const year = new Date().getFullYear();

    // ── Lines ────────────────────────────────────────────────────────────────

    const lines = useMemo(() => Object.values(timetables).sort((a, b) => a.name.localeCompare(b.name, 'bg')), [timetables]);
    const ownLines = lines.filter(t => !t.servedBy.length);
    const servedLines = lines.filter(t => t.servedBy.length);

    const plan = useMemo(() => buildImportPlan(), []);
    const notImported = plan.timetables.filter(t => !timetables[t.routeId]);

    /**
     * Пренася линиите от разписанието на сайта. Само липсващото: линия, спирка
     * или режим, които вече ги има, не се пипат — иначе повторно натискане би
     * изтрило въведените часове и поставените на картата спирки.
     */
    const runImport = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const known = new Set(stops.map(s => s.id));
            const knownServices = new Set(services.map(s => s.id));
            const writes: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
            STANDARD_SERVICES.filter(s => !knownServices.has(s.id)).forEach(({ id, ...body }) =>
                writes.push(b => b.set(doc(db, 'services', id), body)));
            const newStops = plan.stops.filter(s => !known.has(s.id));
            newStops.forEach(s => writes.push(b => b.set(doc(db, 'stops', s.id), { name: s.name, lat: null, lng: null })));
            const now = new Date().toISOString();
            notImported.forEach(({ routeId, ...body }) => writes.push(b => b.set(doc(db, 'timetables', routeId), {
                routeId, ...body, importedAt: now, importedBy: currentUser?.username || '',
            })));
            for (let i = 0; i < writes.length; i += 400) {
                const batch = writeBatch(db);
                writes.slice(i, i + 400).forEach(w => w(batch));
                await batch.commit();
            }
            setMessage({
                text: `Пренесени: ${notImported.length} линии, ${newStops.length} спирки. Спирките са без точка на картата, а курсовете — само с час на тръгване: останалото се въвежда тук.`,
                ok: true,
            });
        } catch (e) {
            setMessage({ text: errText(e, 'Пренасянето не успя.'), ok: false });
        } finally {
            setBusy(false);
        }
    };

    const lineStatus = (tt: Timetable) => {
        const trips = tt.directions.reduce((n, d) => n + d.trips.length, 0);
        const problems = tt.directions.reduce((n, d) => n + checkDirection(d, services).length, 0);
        const ids = new Set(tt.directions.flatMap(d => d.stopIds));
        const unplaced = [...ids].filter(id => !hasPoint(stops.find(s => s.id === id))).length;
        return { trips, problems, unplaced, noEnd: missingEnd(tt) };
    };

    /**
     * Един и същ курс, записан на две линии: тръгва от същата спирка, в същия
     * режим, в същата минута. Може да е наистина един автобус (Опанец и Долна
     * Митрополия имат еднакви часове от Плевен в делник) — тогава в данните ще
     * излезе два пъти. Не се оправя само: решава превозвачът.
     */
    const duplicates = useMemo(() => {
        const seen = new Map<string, string[]>();
        ownLines.forEach(tt => tt.directions.forEach(d => d.trips.forEach(t => {
            const first = t.times.findIndex(x => toMinutes(x) !== null);
            if (first < 0) return;
            const key = `${d.stopIds[first]}|${t.serviceId}|${t.times[first]}`;
            const list = seen.get(key) || [];
            if (!list.includes(tt.name)) seen.set(key, [...list, tt.name]);
        })));
        const pairs = new Map<string, number>();
        seen.forEach(names => {
            if (names.length < 2) return;
            const k = names.sort((a, b) => a.localeCompare(b, 'bg')).join(' и ');
            pairs.set(k, (pairs.get(k) || 0) + 1);
        });
        return [...pairs].sort((a, b) => b[1] - a[1]);
    }, [ownLines]);

    // ── Stops ────────────────────────────────────────────────────────────────

    const placed = stops.filter(hasPoint).length;

    /** Which lines each stop is on, so a stop in use is not deleted from under them. */
    const usage = useMemo(() => {
        const out = new Map<string, string[]>();
        lines.forEach(tt => {
            const ids = new Set(tt.directions.flatMap(d => d.stopIds));
            ids.forEach(id => out.set(id, [...(out.get(id) || []), tt.name]));
        });
        return out;
    }, [lines]);

    const createStop = async (name: string) => {
        const ref = await addDoc(collection(db, 'stops'), { name: name.trim(), lat: null, lng: null });
        return ref.id;
    };

    const removeStop = async (s: Stop) => {
        const used = usage.get(s.id);
        if (used?.length) {
            setMessage({ text: `Спирка „${s.name}“ е в разписанието на ${used.join(', ')}. Махнете я първо оттам.`, ok: false });
            return;
        }
        if (!window.confirm(`Да се изтрие ли спирка „${s.name}“?`)) return;
        try {
            await deleteDoc(doc(db, 'stops', s.id));
        } catch (e) {
            setMessage({ text: errText(e, 'Спирката не беше изтрита.'), ok: false });
        }
    };

    const shownStops = useMemo(() => {
        const q = normalizeStopName(stopFilter);
        const list = q ? stops.filter(s => normalizeStopName(s.name).includes(q)) : stops;
        // The ones still to place first: that is what there is to do here.
        return [...list].sort((a, b) => Number(hasPoint(a)) - Number(hasPoint(b)));
    }, [stops, stopFilter]);

    // ── Days of operation ────────────────────────────────────────────────────

    const saveService = async (s: Service, patch: Partial<Omit<Service, 'id'>>) => {
        const { id, ...body } = { ...s, ...patch };
        try {
            await setDoc(doc(db, 'services', id), body);
        } catch (e) {
            setMessage({ text: errText(e, 'Режимът не беше запазен.'), ok: false });
        }
    };

    const addService = async () => {
        try {
            await addDoc(collection(db, 'services'), {
                name: 'Нов режим', days: [true, true, true, true, true, true, true],
                holidays: 'normal', order: services.length,
            });
        } catch (e) {
            setMessage({ text: errText(e, 'Режимът не беше създаден.'), ok: false });
        }
    };

    const removeService = async (s: Service) => {
        const used = lines.some(tt => tt.directions.some(d => d.trips.some(t => t.serviceId === s.id)));
        if (used) {
            setMessage({ text: `Режим „${s.name}“ се използва в разписания. Сменете първо курсовете към друг режим.`, ok: false });
            return;
        }
        if (!window.confirm(`Да се изтрие ли режим „${s.name}“?`)) return;
        try {
            await deleteDoc(doc(db, 'services', s.id));
        } catch (e) {
            setMessage({ text: errText(e, 'Режимът не беше изтрит.'), ok: false });
        }
    };

    // ── What is left to do ───────────────────────────────────────────────────

    const totalNoEnd = ownLines.reduce((n, tt) => n + missingEnd(tt), 0);
    const totalTrips = ownLines.reduce((n, tt) => n + lineStatus(tt).trips, 0);
    const linesWithNotes = ownLines.filter(tt => tt.notes.some(n => !n.startsWith('Празник:')));
    const unplacedUsed = stops.filter(s => !hasPoint(s) && usage.has(s.id));
    const todo: React.ReactNode[] = [];
    if (unplacedUsed.length) todo.push(<><strong>{unplacedUsed.length} спирки</strong> не са посочени на картата ({unplacedUsed.slice(0, 8).map(s => s.name).join(', ')}{unplacedUsed.length > 8 ? '…' : ''}). Без точка спирката не влиза в данните.</>);
    if (totalNoEnd) todo.push(<><strong>{totalNoEnd} от {totalTrips} курса</strong> имат само час на тръгване. Сайтът никога не е имал времена за пътуване — трябва час поне на крайната спирка (добре е и на междинните). Без него курсът не влиза в данните.</>);
    if (linesWithNotes.length) todo.push(<><strong>{linesWithNotes.length} линии</strong> имат бележки от пренасянето за проверка: {linesWithNotes.map(t => t.name).join(', ')}.</>);
    if (duplicates.length) todo.push(<><strong>{duplicates.length} двойки линии</strong> имат курсове в една и съща минута от една и съща спирка — проверете дали не е един автобус, записан два пъти.</>);

    return (
        <div style={{ color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                <CalendarClock size={24} color="var(--primary-color)" />
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>Разписания</h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: '2rem', lineHeight: 1.6 }}>
                Спирките, дните на движение и часовете по всяка линия. От тях се подготвят
                данните, които Наредба Н-7 изисква да се подадат в Националната точка за
                достъп до 1 януари 2027 г. Разписанието на сайта засега остава отделно —
                промяна тук не го променя.
            </p>

            {message && (
                <div style={{
                    ...card, marginBottom: '1.5rem', display: 'flex', gap: '0.7rem', alignItems: 'flex-start', padding: '1rem 1.25rem',
                    borderColor: message.ok ? 'rgba(0,230,118,0.35)' : 'rgba(255,82,82,0.35)',
                    background: message.ok ? 'rgba(0,230,118,0.07)' : 'rgba(255,82,82,0.07)',
                }}>
                    {message.ok ? <Check size={18} color="#00e676" /> : <AlertTriangle size={18} color="#ff5252" />}
                    <span style={{ fontSize: '0.92rem', flex: 1 }}>{message.text}</span>
                    <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
                </div>
            )}

            {!ttLoading && notImported.length > 0 && (
                <section style={{ ...card, borderColor: 'rgba(0,173,181,0.35)', background: 'rgba(0,173,181,0.06)' }}>
                    <h3 style={{ ...h2, marginBottom: '0.5rem' }}><Download size={19} color="var(--primary-color)" />
                        {lines.length ? `${notImported.length} линии от сайта още не са пренесени` : 'Пренеси разписанието от сайта'}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 0 }}>
                        Създава {plan.timetables.length} линии с часовете на тръгване от сайта (делник, събота, неделя,
                        празник), спирките по трасето от цените на линиите и четирите режима на движение.
                        Каквото вече е въведено тук, не се пипа. Часове на междинните и крайните спирки няма откъде
                        да се вземат — те се въвеждат на ръка.
                    </p>
                    <button onClick={runImport} disabled={busy || servicesLoading || stopsLoading} style={greenBtn}>
                        {busy ? <Loader2 size={15} /> : <Download size={15} />} Пренеси {notImported.length} линии
                    </button>
                </section>
            )}

            <ComplianceCard />

            {/* ── What is left ─────────────────────────────────────────── */}
            {lines.length > 0 && todo.length > 0 && (
                <section style={{ ...card, borderColor: 'rgba(255,171,0,0.3)' }}>
                    <h3 style={{ ...h2, marginBottom: '0.6rem' }}><ListChecks size={19} color="#ffab00" /> Какво остава да се въведе</h3>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.7, fontSize: '0.9rem' }}>
                        {todo.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                    {duplicates.length > 0 && (
                        <>
                            <button onClick={() => setShowDupes(v => !v)} style={{ ...plainBtn, marginTop: '0.8rem', background: 'transparent' }}>
                                {showDupes ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Линии с курсове в една и съща минута
                            </button>
                            {showDupes && (
                                <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    {duplicates.map(([pair, n]) => <li key={pair}>{pair} — {n} курса</li>)}
                                </ul>
                            )}
                        </>
                    )}
                </section>
            )}

            {/* ── Progress ─────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[
                    { title: 'Спирки на картата', value: `${placed} / ${stops.length}`, ok: stops.length > 0 && placed === stops.length },
                    { title: 'Режими на движение', value: String(services.length), ok: services.length > 0 },
                    {
                        title: 'Линии готови за подаване',
                        value: `${ownLines.filter(tt => { const st = lineStatus(tt); return st.trips > 0 && !st.problems && !st.unplaced; }).length} / ${ownLines.length}`,
                        ok: ownLines.length > 0 && ownLines.every(tt => { const st = lineStatus(tt); return st.trips > 0 && !st.problems && !st.unplaced; }),
                    },
                ].map(x => (
                    <div key={x.title} style={{ ...card, marginBottom: 0, padding: '1.1rem 1.25rem' }}>
                        <div style={label}>{x.title}</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {x.value}
                            {x.ok ? <Check size={20} color="#00e676" /> : <AlertTriangle size={18} color="#ffab00" />}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Lines ────────────────────────────────────────────────── */}
            <section style={card}>
                <h3 style={{ ...h2, marginBottom: '0.4rem' }}><RouteIcon size={19} color="var(--primary-color)" /> Разписания по линии ({lines.length})</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 0 }}>
                    Линиите и цените им са тези от сайта. Тук се въвеждат спирките по реда на движение и часовете.
                </p>
                {ttLoading ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Зареждане…</p>
                ) : lines.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Още няма пренесени линии — натиснете „Пренеси“ по-горе.</p>
                ) : (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
                            {ownLines.map(tt => {
                                const st = lineStatus(tt);
                                const ready = st.trips > 0 && st.problems === 0 && st.unplaced === 0;
                                return (
                                    <div key={tt.routeId} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
                                        padding: '0.9rem 1.1rem', borderRadius: '13px',
                                        background: 'rgba(0,0,0,0.22)', border: `1px solid ${ready ? 'rgba(0,230,118,0.25)' : 'rgba(255,255,255,0.06)'}`,
                                    }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                {ready ? <Check size={16} color="#00e676" /> : <AlertTriangle size={15} color="#ffab00" />}
                                                {tt.name}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                                {[
                                                    `${st.trips} курса`,
                                                    st.noEnd ? `${st.noEnd} без час на крайната спирка` : '',
                                                    st.problems && st.problems !== st.noEnd ? `${st.problems} за оправяне` : '',
                                                    st.unplaced ? `${st.unplaced} спирки без точка на картата` : '',
                                                    tt.notes.some(n => !n.startsWith('Празник:')) ? 'има бележки' : '',
                                                ].filter(Boolean).join(' · ')}
                                            </div>
                                        </div>
                                        <button onClick={() => setEditing(tt)} style={{ ...plainBtn, padding: '0.55rem 1rem' }}>
                                            <CalendarClock size={15} /> Разписание
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        {servedLines.length > 0 && (
                            <>
                                <button onClick={() => setShowServed(v => !v)} style={{ ...plainBtn, marginTop: '1rem', background: 'transparent' }}>
                                    {showServed ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {servedLines.length} линии без собствени курсове (обслужват се от други)
                                </button>
                                {showServed && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.6rem' }}>
                                        {servedLines.map(tt => (
                                            <div key={tt.routeId} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
                                                padding: '0.6rem 1rem', borderRadius: '11px', background: 'rgba(0,0,0,0.16)', border: '1px solid rgba(255,255,255,0.05)',
                                            }}>
                                                <div style={{ minWidth: 0, fontSize: '0.88rem' }}>
                                                    <strong>{tt.name}</strong>
                                                    <span style={{ color: 'var(--text-secondary)' }}> — курсовете са на {tt.servedBy.join(', ')}</span>
                                                </div>
                                                <button onClick={() => setEditing(tt)} style={plainBtn}>Отвори</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </section>

            {/* ── Fares ────────────────────────────────────────────────── */}
            <section style={card}>
                <h3 style={{ ...h2, marginBottom: '0.4rem' }}><Ticket size={19} color="var(--primary-color)" /> Тарифи ({fareTable.length})</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 0 }}>
                    Подават се сами от цените на линиите — единичен билет и месечна карта за всеки вид пътник
                    ({RIDER_CATEGORIES.map(c => c.name.toLowerCase()).join(', ')}), от първата до последната спирка
                    на всяка ценова линия, включително отсечките. Сменят се там, където се сменят цените на картите.
                    Служебните карти са безплатни за персонала и не са тарифа. В данните: {fareTable.filter(f => f.single !== null).length} цени на билет
                    и {passCount} цени на месечни карти.
                </p>
                <button onClick={() => setShowFares(v => !v)} style={{ ...plainBtn, background: 'transparent' }}>
                    {showFares ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Покажи цените
                </button>
                {showFares && (
                    <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
                        <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
                            <thead>
                                <tr style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
                                    <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem' }}>Откъде – докъде</th>
                                    <th style={{ padding: '0.35rem 0.5rem' }}>Билет</th>
                                    {RIDER_CATEGORIES.map(c => <th key={c.id} style={{ padding: '0.35rem 0.5rem' }}>Карта: {c.name}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {fareTable.map(f => (
                                    <tr key={f.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        <td style={{ textAlign: 'left', padding: '0.35rem 0.5rem' }}>{f.fromName} – {f.toName}</td>
                                        <td style={{ padding: '0.35rem 0.5rem' }}>{f.single !== null ? f.single.toFixed(2) : '—'}</td>
                                        {RIDER_CATEGORIES.map(c => <td key={c.id} style={{ padding: '0.35rem 0.5rem' }}>{f.passes[c.id]?.toFixed(2) ?? '—'}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* ── Stops ────────────────────────────────────────────────── */}
            <section style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                    <h3 style={h2}><MapPin size={19} color="var(--primary-color)" /> Спирки ({stops.length})</h3>
                    <button onClick={() => setEditingStop({ id: '', name: '', lat: null, lng: null })} style={greenBtn}>
                        <Plus size={15} /> Нова спирка
                    </button>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 0 }}>
                    Всяка спирка трябва да е посочена на картата. Пренесените са по една на село — ако в
                    селото автобусът спира на няколко места или спирката е от двете страни на пътя,
                    добавете ги отделно и ги сложете в разписанията.
                </p>

                <StopSuggestions stops={stops} who={currentUser?.username || ''} />

                {stops.length > 8 && (
                    <div style={{ position: 'relative', margin: '1rem 0 0.4rem' }}>
                        <Search size={15} color="var(--text-secondary)" style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)' }} />
                        <input value={stopFilter} onChange={e => setStopFilter(e.target.value)} placeholder="Търсене на спирка"
                            style={{ ...input, paddingLeft: '2.3rem' }} />
                    </div>
                )}

                {stopsLoading ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Зареждане…</p>
                ) : stops.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>Още няма спирки — създават се с пренасянето или с „Нова спирка“.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.8rem', maxHeight: '28rem', overflowY: 'auto' }}>
                        {shownStops.map(s => {
                            const ok = hasPoint(s);
                            const on = usage.get(s.id) || [];
                            return (
                                <div key={s.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap',
                                    padding: '0.6rem 0.9rem', borderRadius: '11px',
                                    background: 'rgba(0,0,0,0.2)', border: `1px solid ${ok ? 'rgba(255,255,255,0.06)' : 'rgba(255,171,0,0.3)'}`,
                                }}>
                                    <MapPin size={16} color={ok ? '#00e676' : '#ffab00'} />
                                    <div style={{ flex: 1, minWidth: '160px' }}>
                                        <div style={{ fontWeight: 700 }}>
                                            {s.name}{s.code && <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}> · № {s.code}</span>}
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: ok ? 'var(--text-secondary)' : '#ffab00' }}>
                                            {ok ? `${s.lat!.toFixed(5)}, ${s.lng!.toFixed(5)}` : 'не е посочена на картата'}
                                            {ok && s.locatedBy === 'boardings' && <span style={{ color: 'var(--primary-color)' }}> · от качванията</span>}
                                            {on.length > 0 && <span style={{ color: 'var(--text-secondary)' }}> · {on.length > 4 ? `${on.length} линии` : on.join(', ')}</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => setEditingStop(s)} style={plainBtn}>{ok ? 'Промени' : 'Посочи на картата'}</button>
                                    <button onClick={() => removeStop(s)} title="Изтрий" style={{
                                        padding: '0.45rem 0.7rem', borderRadius: '9px', cursor: 'pointer',
                                        background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', color: '#ff5252',
                                    }}><Trash2 size={15} /></button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ── Days of operation ────────────────────────────────────── */}
            <section style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                    <h3 style={h2}><CalendarDays size={19} color="var(--primary-color)" /> Режими на движение ({services.length})</h3>
                    {services.length > 0 && <button onClick={addService} style={greenBtn}><Plus size={15} /> Нов режим</button>}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: 0 }}>
                    В кои дни се движи даден курс. Всеки курс в разписанието се отнася към един режим.
                    Официалните празници се изчисляват автоматично за всяка година.
                </p>

                {servicesLoading ? (
                    <p style={{ color: 'var(--text-secondary)' }}>Зареждане…</p>
                ) : services.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>Режимите (Делник, Събота, Неделя, Празник) се създават с пренасянето.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1rem' }}>
                        {services.map(s => (
                            <div key={s.id} style={{
                                display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap',
                                padding: '0.8rem 1rem', borderRadius: '13px',
                                background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <input
                                    defaultValue={s.name}
                                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.name) saveService(s, { name: v }); }}
                                    style={{ ...input, width: '190px', padding: '0.5rem 0.7rem', fontWeight: 700 }}
                                />
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    {WEEKDAYS.map((d, i) => {
                                        const on = s.days[i];
                                        return (
                                            <button key={d}
                                                onClick={() => saveService(s, { days: s.days.map((x, k) => k === i ? !x : x) })}
                                                aria-pressed={on}
                                                style={{
                                                    width: '2.3rem', padding: '0.45rem 0', borderRadius: '8px', cursor: 'pointer',
                                                    fontSize: '0.78rem', fontWeight: 800,
                                                    background: on ? 'rgba(0,173,181,0.18)' : 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${on ? 'rgba(0,173,181,0.5)' : 'var(--surface-border)'}`,
                                                    color: on ? 'var(--primary-color)' : 'var(--text-secondary)',
                                                }}>{d}</button>
                                        );
                                    })}
                                </div>
                                <select
                                    value={s.holidays}
                                    onChange={e => saveService(s, { holidays: e.target.value as HolidayRule })}
                                    style={{ ...input, width: 'auto', padding: '0.5rem 0.6rem', fontSize: '0.85rem' }}
                                >
                                    {HOLIDAY_RULES.map(h => <option key={h.id} value={h.id} style={{ background: '#222' }}>{h.label}</option>)}
                                </select>
                                <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{describeDays(s)}</span>
                                <button onClick={() => removeService(s)} title="Изтрий" style={{
                                    padding: '0.45rem 0.7rem', borderRadius: '9px', cursor: 'pointer',
                                    background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', color: '#ff5252',
                                }}><Trash2 size={15} /></button>
                            </div>
                        ))}
                    </div>
                )}

                <button onClick={() => setShowHolidays(v => !v)} style={{ ...plainBtn, marginTop: '1rem', background: 'transparent' }}>
                    {showHolidays ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Официални празници за {year} г.
                </button>
                {showHolidays && (
                    <div style={{ marginTop: '0.7rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.35rem 1.25rem', fontSize: '0.84rem' }}>
                        {holidaysFor(year).map(h => (
                            <div key={h.date + h.name} style={{ display: 'flex', gap: '0.7rem' }}>
                                <span style={{ color: 'var(--primary-color)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                    {h.date.slice(8, 10)}.{h.date.slice(5, 7)}
                                </span>
                                <span style={{ color: 'var(--text-secondary)' }}>{h.name}</span>
                            </div>
                        ))}
                        <div style={{ gridColumn: '1 / -1', marginTop: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            Допълнителни почивни дни, обявени с решение на правителството, не са включени.
                        </div>
                    </div>
                )}
            </section>

            {editingStop && (
                <StopDialog
                    stop={editingStop}
                    others={stops.filter(s => s.id !== editingStop.id && hasPoint(s))}
                    onClose={() => setEditingStop(null)}
                    onSaved={text => { setEditingStop(null); setMessage({ text, ok: true }); }}
                />
            )}

            {editing && (
                <TimetableEditor
                    initial={timetables[editing.routeId] || editing}
                    stops={stops}
                    services={services}
                    createStop={createStop}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// One stop: its name, its number, and where it is
// ─────────────────────────────────────────────────────────────────────────────

interface StopDialogProps {
    stop: Stop;
    others: Stop[];
    onClose: () => void;
    onSaved: (message: string) => void;
}

const StopDialog: React.FC<StopDialogProps> = ({ stop, others, onClose, onSaved }) => {
    const [name, setName] = useState(stop.name);
    const [code, setCode] = useState(stop.code || '');
    const [point, setPoint] = useState<Point | null>(hasPoint(stop) ? { lat: stop.lat!, lng: stop.lng! } : null);
    const [coordsText, setCoordsText] = useState('');
    const [search, setSearch] = useState(stop.name);
    const [results, setResults] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const otherPoints = useMemo(
        () => others.map(o => ({ lat: o.lat!, lng: o.lng!, name: o.name })),
        [others]
    );
    // With no pin yet, look where the other stops are.
    const center = useMemo(() => {
        if (!otherPoints.length) return undefined;
        const lat = otherPoints.reduce((a, p) => a + p.lat, 0) / otherPoints.length;
        const lng = otherPoints.reduce((a, p) => a + p.lng, 0) / otherPoints.length;
        return { lat, lng };
    }, [otherPoints]);

    /**
     * OpenStreetMap's own search. Its rules ask for no more than a request a
     * second and no searching as you type, so it runs on the button only.
     */
    const runSearch = async () => {
        const q = search.trim();
        if (!q) return;
        setSearching(true);
        setError('');
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&countrycodes=bg&limit=6&accept-language=bg&q=${encodeURIComponent(q)}`
            );
            const data = await res.json() as Array<{ display_name: string; lat: string; lon: string }>;
            setResults(data.map(d => ({ name: d.display_name, lat: Number(d.lat), lng: Number(d.lon) })));
            if (!data.length) setError('Нищо не е намерено. Опитайте с името на селото или града.');
        } catch {
            setError('Търсенето не отговаря. Посочете мястото направо на картата.');
        } finally {
            setSearching(false);
        }
    };

    const save = async () => {
        if (!name.trim()) { setError('Спирката трябва да има име.'); return; }
        setSaving(true);
        setError('');
        try {
            const body = {
                name: name.trim(),
                code: code.trim(),
                lat: point ? point.lat : null,
                lng: point ? point.lng : null,
            };
            if (stop.id) await setDoc(doc(db, 'stops', stop.id), body);
            else await addDoc(collection(db, 'stops'), body);
            onSaved(`Спирка „${body.name}“ е запазена${point ? '' : ' — без точка на картата'}.`);
        } catch (e) {
            setError(errText(e, 'Спирката не беше запазена.'));
            setSaving(false);
        }
    };

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', padding: '1rem', overflowY: 'auto',
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: '760px', margin: '3vh 0', padding: '1.5rem',
                background: '#161b22', border: '1px solid var(--surface-border)', borderRadius: '22px', color: '#fff',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{stop.id ? 'Спирка' : 'Нова спирка'}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={20} /></button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={label}>Име</label>
                        <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="Плевен Автогара" />
                    </div>
                    <div>
                        <label style={label}>Номер (ако има)</label>
                        <input style={input} value={code} onChange={e => setCode(e.target.value)} placeholder="—" />
                    </div>
                </div>

                <label style={label}>Къде е</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <input style={{ ...input, flex: 1 }} value={search} onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
                        placeholder="Търсене: село, улица, обект" />
                    <button onClick={runSearch} disabled={searching} style={{ ...plainBtn, padding: '0 1rem' }}>
                        {searching ? <Loader2 size={15} /> : <Search size={15} />} Търси
                    </button>
                </div>
                {results.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.6rem', maxHeight: '9rem', overflowY: 'auto' }}>
                        {results.map((r, i) => (
                            <button key={i} onClick={() => { setPoint({ lat: r.lat, lng: r.lng }); setResults([]); }} style={{
                                textAlign: 'left', padding: '0.45rem 0.7rem', borderRadius: '8px', cursor: 'pointer',
                                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--surface-border)',
                                color: '#fff', fontSize: '0.8rem',
                            }}>{r.name}</button>
                        ))}
                    </div>
                )}

                <StopMap value={point} onChange={setPoint} others={otherPoints} fallbackCenter={center} />

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', color: point ? '#00e676' : '#ffab00', minWidth: '12rem' }}>
                        {point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : 'Кликнете на картата върху спирката.'}
                    </span>
                    <input
                        value={coordsText}
                        onChange={e => {
                            setCoordsText(e.target.value);
                            const p = parsePoint(e.target.value);
                            if (p) setPoint(p);
                        }}
                        placeholder="или поставете координати от Google Maps"
                        style={{ ...input, flex: 1, minWidth: '220px', padding: '0.5rem 0.7rem', fontSize: '0.85rem' }}
                    />
                </div>

                {error && <div style={{ marginTop: '0.8rem', color: '#ff5252', fontSize: '0.88rem' }}>{error}</div>}

                <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.3rem' }}>
                    <button onClick={save} disabled={saving} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.8rem 1.6rem', borderRadius: '12px', border: 'none',
                        background: 'var(--primary-color)', color: '#00252a', fontWeight: 800,
                        cursor: saving ? 'wait' : 'pointer',
                    }}>
                        {saving ? <Loader2 size={16} /> : <Save size={16} />} Запази спирката
                    </button>
                    <button onClick={onClose} style={{
                        padding: '0.8rem 1.4rem', borderRadius: '12px', cursor: 'pointer',
                        background: 'transparent', border: '1px solid var(--surface-border)',
                        color: 'var(--text-secondary)', fontWeight: 700,
                    }}>Отказ</button>
                </div>
            </div>
        </div>
    );
};

export default TimetablesPanel;
