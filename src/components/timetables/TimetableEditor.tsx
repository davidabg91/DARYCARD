import React, { useMemo, useState } from 'react';
import {
    X, Save, Loader2, Plus, Copy, Trash2, ArrowUp, ArrowDown, ArrowLeftRight,
    AlertTriangle, Check, ArrowUpDown, MapPin,
} from 'lucide-react';
import { setDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import {
    checkDirection, newTripId, normalizeStopName, normalizeTime,
    shiftTimes, timetableRef, toMinutes,
    type Direction, type Service, type Stop, type Timetable,
} from '../../utils/timetable';

/**
 * One line's timetable, both ways.
 *
 * Laid out the way a printed timetable is: the stops down the side, one column
 * per run, the time in each cell. That is also how an operator's own Excel sheet
 * is usually laid out, so a block copied from it pastes straight in.
 *
 * Nothing is written until Запази. A timetable is edited as a whole — half of a
 * re-timed run is worse than the old one.
 */

interface Props {
    initial: Timetable;
    stops: Stop[];
    services: Service[];
    /** Makes a stop that is not on the list yet, and gives back its id. */
    createStop: (name: string) => Promise<string>;
    onClose: () => void;
}

const input: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.8rem', borderRadius: '10px',
    background: 'rgba(0,0,0,0.28)', border: '1px solid var(--surface-border)',
    color: '#fff', fontSize: '0.9rem', outline: 'none',
};

const smallBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
    padding: '0.5rem 0.85rem', borderRadius: '10px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)',
    color: '#fff', fontSize: '0.82rem', fontWeight: 700,
};

const iconBtn: React.CSSProperties = {
    background: 'none', border: 'none', color: 'var(--text-secondary)',
    cursor: 'pointer', padding: '2px', display: 'inline-flex',
};

const SERVICE_COLORS = ['#00ADB5', '#ffab00', '#ff4081', '#a78bfa', '#00e676', '#29b6f6'];

const TimetableEditor: React.FC<Props> = ({ initial, stops, services, createStop, onClose }) => {
    const { currentUser } = useAuth();
    const [tt, setTt] = useState<Timetable>(initial);
    const [dirId, setDirId] = useState<'A' | 'B'>('A');
    const [filter, setFilter] = useState<string>('all');
    const [shiftBy, setShiftBy] = useState('60');
    const [newStop, setNewStop] = useState('');
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    const stopById = useMemo(() => new Map(stops.map(s => [s.id, s])), [stops]);
    const colorOf = (serviceId: string) => {
        const i = services.findIndex(s => s.id === serviceId);
        return i < 0 ? '#ff5252' : SERVICE_COLORS[i % SERVICE_COLORS.length];
    };

    const dir = tt.directions.find(d => d.id === dirId)!;
    const other = tt.directions.find(d => d.id !== dirId)!;
    const nameOf = (id: string) => stopById.get(id)?.name || '(изтрита спирка)';
    const dirLabel = (d: Direction) => d.stopIds.length >= 2
        ? `${nameOf(d.stopIds[0])} → ${nameOf(d.stopIds[d.stopIds.length - 1])}`
        : d.id === 'A' ? 'Посока А' : 'Посока Б';

    const problems = useMemo(() => checkDirection(dir, services), [dir, services]);
    const otherProblems = useMemo(() => checkDirection(other, services), [other, services]);
    const badCell = useMemo(() => {
        const set = new Set<string>();
        problems.forEach(p => { if (p.index !== undefined) set.add(`${p.tripId}:${p.index}`); });
        return set;
    }, [problems]);

    const visible = dir.trips
        .map((trip, index) => ({ trip, index }))
        .filter(x => filter === 'all' || x.trip.serviceId === filter);

    /** Every edit goes through here, so the unsaved mark cannot be forgotten. */
    const change = (fn: (d: Direction) => Direction) => {
        setTt(t => ({ ...t, directions: t.directions.map(d => d.id === dirId ? fn(d) : d) }));
        setDirty(true);
        setMessage(null);
    };

    const defaultService = filter !== 'all' ? filter : services[0]?.id || '';

    // ── Stops of this direction ──────────────────────────────────────────────

    const moveStop = (i: number, by: -1 | 1) => change(d => {
        const j = i + by;
        if (j < 0 || j >= d.stopIds.length) return d;
        const swap = <T,>(arr: T[]) => { const a = [...arr]; [a[i], a[j]] = [a[j], a[i]]; return a; };
        return { ...d, stopIds: swap(d.stopIds), trips: d.trips.map(t => ({ ...t, times: swap(t.times) })) };
    });

    const removeStop = (i: number) => {
        const used = dir.trips.some(t => t.times[i]?.trim());
        if (used && !window.confirm(`Спирка „${nameOf(dir.stopIds[i])}“ има въведени часове. Да се махне ли от тази посока заедно с тях?`)) return;
        change(d => ({
            ...d,
            stopIds: d.stopIds.filter((_, k) => k !== i),
            trips: d.trips.map(t => ({ ...t, times: t.times.filter((_, k) => k !== i) })),
        }));
    };

    const addStop = async () => {
        const name = newStop.trim();
        if (!name) return;
        let id = stops.find(s => normalizeStopName(s.name) === normalizeStopName(name))?.id;
        try {
            if (!id) id = await createStop(name);
        } catch (e) {
            setMessage({ text: (e as { message?: string }).message || 'Спирката не беше създадена.', ok: false });
            return;
        }
        const stopId = id;
        setNewStop('');
        change(d => ({
            ...d,
            stopIds: [...d.stopIds, stopId],
            trips: d.trips.map(t => ({ ...t, times: [...t.times, ''] })),
        }));
    };

    const reverseFromOther = () => {
        if (dir.trips.length && !window.confirm('Спирките в тази посока ще бъдат заменени. Въведените курсове в нея ще се изчистят. Продължаване?')) return;
        change(d => ({ ...d, stopIds: [...other.stopIds].reverse(), trips: [] }));
    };

    // ── Runs ─────────────────────────────────────────────────────────────────

    const addTrip = () => change(d => ({
        ...d, trips: [...d.trips, { id: newTripId(), serviceId: defaultService, times: d.stopIds.map(() => '') }],
    }));

    const copyTrip = (index: number) => {
        const minutes = Number(shiftBy);
        if (!Number.isFinite(minutes)) return;
        change(d => {
            const src = d.trips[index];
            const copy = { id: newTripId(), serviceId: src.serviceId, times: shiftTimes(src.times, minutes) };
            const trips = [...d.trips];
            trips.splice(index + 1, 0, copy);
            return { ...d, trips };
        });
    };

    const copyLast = () => {
        const last = visible[visible.length - 1];
        if (last) copyTrip(last.index); else addTrip();
    };

    const removeTrip = (index: number) => {
        if (dir.trips[index].times.some(t => t.trim()) && !window.confirm(`Да се изтрие ли курс ${index + 1}?`)) return;
        change(d => ({ ...d, trips: d.trips.filter((_, k) => k !== index) }));
    };

    const setService = (index: number, serviceId: string) => change(d => ({
        ...d, trips: d.trips.map((t, k) => k === index ? { ...t, serviceId } : t),
    }));

    /** Orders the runs by when they leave, which is how they are read. */
    const sortTrips = () => change(d => {
        const first = (times: string[]) => {
            for (const t of times) { const m = toMinutes(t); if (m !== null) return m; }
            return Number.MAX_SAFE_INTEGER;
        };
        return { ...d, trips: [...d.trips].sort((a, b) => first(a.times) - first(b.times)) };
    });

    // ── Cells ────────────────────────────────────────────────────────────────

    const setCell = (tripIndex: number, stopIndex: number, value: string) => change(d => ({
        ...d,
        trips: d.trips.map((t, k) => k !== tripIndex ? t : {
            ...t, times: t.times.map((x, i) => i === stopIndex ? value : x),
        }),
    }));

    /**
     * A block copied from Excel arrives as rows separated by line breaks and
     * cells by tabs. It fills down the stops and across the runs from the cell
     * it was pasted into, adding runs where it runs out of them.
     */
    const pasteBlock = (e: React.ClipboardEvent, tripIndex: number, stopIndex: number) => {
        const text = e.clipboardData.getData('text');
        if (!/[\t\n]/.test(text)) return;
        e.preventDefault();
        const rows = text.replace(/\r/g, '').split('\n');
        while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
        const grid = rows.map(r => r.split('\t'));
        const width = Math.max(...grid.map(r => r.length));
        change(d => {
            const trips = d.trips.map(t => ({ ...t, times: [...t.times] }));
            while (trips.length < tripIndex + width) {
                trips.push({ id: newTripId(), serviceId: defaultService, times: d.stopIds.map(() => '') });
            }
            grid.forEach((row, r) => {
                const s = stopIndex + r;
                if (s >= d.stopIds.length) return;
                row.forEach((cell, c) => { trips[tripIndex + c].times[s] = normalizeTime(cell); });
            });
            return { ...d, trips };
        });
    };

    const focusCell = (tripIndex: number, stopIndex: number) => {
        const el = document.getElementById(`tt-${tripIndex}-${stopIndex}`) as HTMLInputElement | null;
        el?.focus();
        el?.select();
    };

    // ── Saving ───────────────────────────────────────────────────────────────

    const save = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const clean = {
                routeId: tt.routeId,
                name: tt.name,
                fare: tt.fare,
                servedBy: tt.servedBy,
                notes: tt.notes,
                directions: tt.directions.map(d => ({
                    id: d.id,
                    stopIds: d.stopIds,
                    trips: d.trips.map(t => ({ id: t.id, serviceId: t.serviceId, times: t.times.map(normalizeTime) })),
                })),
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser?.username || '',
            };
            // Само документът на разписанието. Спирките и цените по линиите в
            // ROUTE_METADATA (картите, сайтът) не се пипат оттук.
            await setDoc(timetableRef(tt.routeId), clean);
            setTt(t => ({ ...t, directions: clean.directions as Direction[] }));
            setDirty(false);
            setMessage({ text: 'Разписанието е запазено.', ok: true });
        } catch (e) {
            setMessage({ text: (e as { message?: string }).message || 'Разписанието не беше запазено.', ok: false });
        } finally {
            setSaving(false);
        }
    };

    const close = () => {
        if (dirty && !window.confirm('Има незапазени промени. Да се затвори ли без запазване?')) return;
        onClose();
    };


    // ── Layout ───────────────────────────────────────────────────────────────

    const th: React.CSSProperties = {
        padding: '0.5rem', background: '#1d232b', borderBottom: '1px solid var(--surface-border)',
        verticalAlign: 'top', minWidth: '96px',
    };
    const stickyCol: React.CSSProperties = {
        position: 'sticky', left: 0, zIndex: 1, background: '#161b22',
        borderRight: '1px solid var(--surface-border)',
    };

    return (
        <div onClick={close} style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', padding: '1rem', overflowY: 'auto',
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: '1200px', margin: '2vh 0', padding: '1.5rem',
                background: '#161b22', border: '1px solid var(--surface-border)',
                borderRadius: '22px', color: '#fff',
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Разписание: {tt.name}</h3>
                        <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.5 }}>
                            Спирките са отляво, всяка колона е един курс. Час като „630“ или „6.30“ се
                            оправя сам. Може да поставите цял блок, копиран от Excel.
                        </p>
                    </div>
                    <button onClick={close} style={iconBtn}><X size={22} /></button>
                </div>

                {tt.servedBy.length > 0 && (
                    <div style={{
                        display: 'flex', gap: '0.6rem', padding: '0.8rem 1rem', borderRadius: '12px', marginBottom: '1rem',
                        background: 'rgba(0,173,181,0.08)', border: '1px solid rgba(0,173,181,0.3)', fontSize: '0.86rem', lineHeight: 1.5,
                    }}>
                        <MapPin size={17} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>
                            Курсовете на тази линия се карат от <strong>{tt.servedBy.join(', ')}</strong> и се въвеждат там.
                            Курс, въведен и тук, ще излезе в данните два пъти.
                        </span>
                    </div>
                )}
                {tt.notes.length > 0 && (
                    <div style={{
                        display: 'flex', gap: '0.6rem', padding: '0.8rem 1rem', borderRadius: '12px', marginBottom: '1rem',
                        background: 'rgba(255,171,0,0.08)', border: '1px solid rgba(255,171,0,0.3)', fontSize: '0.86rem', lineHeight: 1.5,
                    }}>
                        <AlertTriangle size={17} color="#ffab00" style={{ flexShrink: 0, marginTop: 2 }} />
                        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                            {tt.notes.map((n, i) => <li key={i}>{n}</li>)}
                        </ul>
                    </div>
                )}

                {/* Direction tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {tt.directions.map(d => {
                        const on = d.id === dirId;
                        return (
                            <button key={d.id} onClick={() => setDirId(d.id)} style={{
                                ...smallBtn, padding: '0.6rem 1rem', borderRadius: '50px',
                                background: on ? 'rgba(0,173,181,0.15)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${on ? 'rgba(0,173,181,0.5)' : 'var(--surface-border)'}`,
                                color: on ? 'var(--primary-color)' : 'var(--text-secondary)',
                            }}>
                                {d.id === 'A' ? 'Отиване' : 'Връщане'} · {dirLabel(d)}
                                <span style={{ opacity: 0.7, fontWeight: 500 }}>({d.trips.length} курса)</span>
                            </button>
                        );
                    })}
                    {other.stopIds.length > 0 && (
                        <button onClick={reverseFromOther} style={smallBtn} title="Спирките на другата посока, в обратен ред">
                            <ArrowLeftRight size={14} /> Обратен ред на другата посока
                        </button>
                    )}
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.8rem' }}>
                    <button onClick={addTrip} disabled={!dir.stopIds.length} style={{ ...smallBtn, color: '#00e676', borderColor: 'rgba(0,230,118,0.35)' }}>
                        <Plus size={14} /> Нов курс
                    </button>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button onClick={copyLast} disabled={!dir.stopIds.length} style={smallBtn}>
                            <Copy size={14} /> Копирай последния с
                        </button>
                        <input value={shiftBy} onChange={e => setShiftBy(e.target.value.replace(/[^\d-]/g, ''))}
                            style={{ ...input, width: '4.2rem', padding: '0.45rem 0.5rem', textAlign: 'center' }} />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>мин.</span>
                    </span>
                    <button onClick={sortTrips} disabled={dir.trips.length < 2} style={smallBtn}>
                        <ArrowUpDown size={14} /> Подреди по час
                    </button>
                    <span style={{ flex: 1 }} />
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Покажи:</label>
                    <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...input, width: 'auto', padding: '0.45rem 0.6rem' }}>
                        <option value="all" style={{ background: '#222' }}>Всички дни</option>
                        {services.map(s => <option key={s.id} value={s.id} style={{ background: '#222' }}>{s.name}</option>)}
                    </select>
                </div>

                {services.length === 0 && (
                    <p style={{ color: '#ffab00', fontSize: '0.88rem' }}>
                        Още няма въведени режими на движение („Делник“, „Събота“…). Създайте ги на
                        страницата „Разписания“, за да можете да посочите в кои дни се движи всеки курс.
                    </p>
                )}

                {/* Grid */}
                <div style={{ overflow: 'auto', maxHeight: '60vh', border: '1px solid var(--surface-border)', borderRadius: '14px' }}>
                    <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.86rem', minWidth: '100%' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                            <tr>
                                <th style={{ ...th, ...stickyCol, background: '#1d232b', textAlign: 'left', minWidth: '210px', zIndex: 3 }}>
                                    Спирка
                                </th>
                                {visible.map(({ trip, index }) => (
                                    <th key={trip.id} style={{ ...th, borderTop: `3px solid ${colorOf(trip.serviceId)}` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                            <span style={{ fontWeight: 800 }}>{index + 1}</span>
                                            <span style={{ display: 'flex', gap: '0.15rem' }}>
                                                <button onClick={() => copyTrip(index)} style={iconBtn} title={`Копирай с ${shiftBy} мин. по-късно`}><Copy size={14} /></button>
                                                <button onClick={() => removeTrip(index)} style={{ ...iconBtn, color: '#ff5252' }} title="Изтрий курса"><Trash2 size={14} /></button>
                                            </span>
                                        </div>
                                        <select value={trip.serviceId} onChange={e => setService(index, e.target.value)}
                                            style={{ ...input, padding: '0.3rem 0.35rem', fontSize: '0.75rem', borderColor: colorOf(trip.serviceId) }}>
                                            <option value="" style={{ background: '#222' }}>— дни —</option>
                                            {services.map(s => <option key={s.id} value={s.id} style={{ background: '#222' }}>{s.name}</option>)}
                                        </select>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {dir.stopIds.map((stopId, s) => (
                                <tr key={`${stopId}-${s}`}>
                                    <td style={{ ...stickyCol, padding: '0.35rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <span style={{ color: 'var(--text-secondary)', width: '1.4rem', textAlign: 'right', fontSize: '0.75rem' }}>{s + 1}</span>
                                            <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nameOf(stopId)}>
                                                {nameOf(stopId)}
                                            </span>
                                            <button onClick={() => moveStop(s, -1)} disabled={s === 0} style={iconBtn} title="Нагоре"><ArrowUp size={13} /></button>
                                            <button onClick={() => moveStop(s, 1)} disabled={s === dir.stopIds.length - 1} style={iconBtn} title="Надолу"><ArrowDown size={13} /></button>
                                            <button onClick={() => removeStop(s)} style={{ ...iconBtn, color: '#ff5252' }} title="Махни от посоката"><X size={13} /></button>
                                        </div>
                                    </td>
                                    {visible.map(({ trip, index }) => {
                                        const bad = badCell.has(`${trip.id}:${s}`);
                                        return (
                                            <td key={trip.id} style={{ padding: '0.2rem 0.3rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <input
                                                    id={`tt-${index}-${s}`}
                                                    value={trip.times[s] || ''}
                                                    onChange={e => setCell(index, s, e.target.value)}
                                                    onBlur={e => {
                                                        const n = normalizeTime(e.target.value);
                                                        if (n !== e.target.value) setCell(index, s, n);
                                                    }}
                                                    onPaste={e => pasteBlock(e, index, s)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focusCell(index, s + 1); }
                                                        if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(index, s - 1); }
                                                    }}
                                                    placeholder="—"
                                                    inputMode="numeric"
                                                    style={{
                                                        ...input, padding: '0.35rem 0.3rem', textAlign: 'center',
                                                        fontVariantNumeric: 'tabular-nums', width: '84px',
                                                        borderColor: bad ? '#ff5252' : 'var(--surface-border)',
                                                        background: bad ? 'rgba(255,82,82,0.12)' : 'rgba(0,0,0,0.28)',
                                                    }}
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {dir.stopIds.length === 0 && (
                                <tr><td style={{ padding: '1.5rem', color: 'var(--text-secondary)' }} colSpan={visible.length + 1}>
                                    Тази посока още няма спирки. Добавете ги отдолу в реда на движение
                                    {other.stopIds.length > 0 ? ' или вземете обратния ред на другата посока.' : '.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Adding a stop */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        list="tt-stop-names"
                        value={newStop}
                        onChange={e => setNewStop(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStop(); } }}
                        placeholder="Добави спирка в края — изберете или напишете ново име"
                        style={{ ...input, flex: '1 1 300px' }}
                    />
                    <datalist id="tt-stop-names">
                        {stops.map(s => <option key={s.id} value={s.name} />)}
                    </datalist>
                    <button onClick={addStop} style={{ ...smallBtn, color: '#00e676', borderColor: 'rgba(0,230,118,0.35)' }}>
                        <Plus size={14} /> Добави спирка
                    </button>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <MapPin size={13} /> Нова спирка се създава без точка на картата — посочете я после от „Спирки“.
                    </span>
                </div>

                {/* Problems */}
                {(problems.length > 0 || otherProblems.length > 0) && (
                    <div style={{
                        marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '12px',
                        background: 'rgba(255,82,82,0.06)', border: '1px solid rgba(255,82,82,0.25)', fontSize: '0.84rem',
                    }}>
                        <div style={{ fontWeight: 800, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <AlertTriangle size={15} color="#ff5252" />
                            За оправяне преди подаване към държавата
                            {otherProblems.length > 0 && ` (още ${otherProblems.length} в другата посока)`}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6, maxHeight: '8rem', overflowY: 'auto' }}>
                            {problems.slice(0, 30).map((p, i) => <li key={i}>{p.message}</li>)}
                        </ul>
                        <div style={{ marginTop: '0.4rem', color: 'var(--text-secondary)' }}>
                            Може да запазите и с грешки — те само ще бъдат напомнени, докато не се оправят.
                        </div>
                    </div>
                )}

                {message && (
                    <div style={{
                        marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.9rem',
                        color: message.ok ? '#00e676' : '#ff5252',
                    }}>
                        {message.ok ? <Check size={16} /> : <AlertTriangle size={16} />} {message.text}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={save} disabled={saving} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.8rem 1.6rem', borderRadius: '12px', border: 'none',
                        background: 'var(--primary-color)', color: '#00252a',
                        fontWeight: 800, cursor: saving ? 'wait' : 'pointer',
                    }}>
                        {saving ? <Loader2 size={16} /> : <Save size={16} />} Запази разписанието
                    </button>
                    <button onClick={close} style={{
                        padding: '0.8rem 1.4rem', borderRadius: '12px', cursor: 'pointer',
                        background: 'transparent', border: '1px solid var(--surface-border)',
                        color: 'var(--text-secondary)', fontWeight: 700,
                    }}>Затвори</button>
                    {dirty && <span style={{ fontSize: '0.82rem', color: '#ffab00' }}>Има незапазени промени</span>}
                </div>
            </div>
        </div>
    );
};

export default TimetableEditor;
