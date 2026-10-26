import React, { useCallback, useEffect, useState } from 'react';
import {
    ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Copy, Download, RefreshCw, Loader2,
    ExternalLink, CalendarCheck,
} from 'lucide-react';
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { GTFS_FEED_URL, GTFS_REPORT_URL, GTFS_RT_JSON_URL, GTFS_RT_URL } from '../../utils/timetable';

/**
 * Where the owner sees whether the company does what Наредба Н-7 asks.
 *
 * Three things decide it, each answered here:
 *   - is the timetable file valid — read from the same report the national
 *     access point would trip over (`gtfs/darycard.json`);
 *   - is the company registered at the access point with that file's address,
 *     which the access point then fetches by itself;
 *   - has the data been confirmed as current in the last year, which the
 *     ordinance asks for once a year.
 *
 * The registration itself happens on the access point's own portal, in the
 * company's name (ЕИК 114601542) — this records that it was done and when.
 */

interface Report {
    generatedAt: string;
    feedStart: string;
    feedEnd: string;
    counts: { routes: number; stops: number; trips: number; stopTimes: number; services: number };
    problems: Array<{ level: 'error' | 'warning'; message: string }>;
}

interface NapState {
    registered: boolean;
    registeredAt: string;
    confirmedAt: string;
    note: string;
}

interface LiveVehicle {
    deviceId: string;
    label: string;
    match: { routeName: string; delay: number } | null;
    note: string;
}

/** Същите етикети като functions/src/disruptionKinds.ts. */
const DISRUPTION_LABELS: Record<string, string> = {
    breakdown: 'Авария — курсът не продължава', cancelled: 'Курсът е отменен', accident: 'Пътен инцидент',
    delay: 'Голямо закъснение', detour: 'Отклонение / затворен път',
};

const EMPTY_NAP: NapState = { registered: false, registeredAt: '', confirmedAt: '', note: '' };

const DEADLINE = new Date(2027, 0, 1);
const YEAR_MS = 365 * 86400000;

const fmt = (iso: string) => iso ? new Date(iso).toLocaleDateString('bg-BG') : '—';

const Row: React.FC<{ ok: boolean; warn?: boolean; title: string; children: React.ReactNode }> = ({ ok, warn, title, children }) => (
    <div style={{ display: 'flex', gap: '0.8rem', padding: '0.9rem 1rem', borderRadius: '13px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {ok ? <CheckCircle2 size={20} color="#00e676" style={{ flexShrink: 0 }} />
            : warn ? <AlertTriangle size={20} color="#ffab00" style={{ flexShrink: 0 }} />
            : <XCircle size={20} color="#ff5252" style={{ flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, marginBottom: '0.2rem' }}>{title}</div>
            <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{children}</div>
        </div>
    </div>
);

const ComplianceCard: React.FC = () => {
    const { currentUser } = useAuth();
    const [report, setReport] = useState<Report | null>(null);
    const [reportError, setReportError] = useState('');
    const [loading, setLoading] = useState(false);
    const [nap, setNap] = useState<NapState>(EMPTY_NAP);
    const [live, setLive] = useState<LiveVehicle[] | null>(null);
    const [disruptions, setDisruptions] = useState<Array<{ id: string; kind: string; routeName: string; departure: string; deviceName: string; at: string; matchedBy: string }>>([]);
    const [gpsTrouble, setGpsTrouble] = useState<Array<{ id: string; detail: string }>>([]);
    const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
    const [copied, setCopied] = useState(false);
    // Read once: the card does not need to tick, and the render must not read the clock.
    const [now] = useState(() => Date.now());

    const feedUrl = GTFS_FEED_URL;
    const rtUrl = GTFS_RT_URL;

    const load = useCallback(async () => {
        setLoading(true);
        setReportError('');
        try {
            // A fresh copy, not the one a cache in between may keep for the access point.
            const res = await fetch(`${GTFS_REPORT_URL}?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(String(res.status));
            setReport(await res.json() as Report);
        } catch {
            setReportError('Проверката на файла не отговаря. Опитайте отново след малко.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // The buses on the road right now, as the national feed sees them.
    const loadLive = useCallback(async () => {
        try {
            const res = await fetch(`${GTFS_RT_JSON_URL}?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(String(res.status));
            setLive(((await res.json()) as { vehicles: LiveVehicle[] }).vehicles || []);
        } catch {
            setLive(null);
        }
    }, []);

    useEffect(() => {
        loadLive();
        const t = setInterval(loadLive, 30_000);
        return () => clearInterval(t);
    }, [loadLive]);

    // Terminals that report but cannot get a fix — no GPS, or location refused.
    useEffect(() => {
        return onSnapshot(collection(db, 'positions'), snap => {
            setGpsTrouble(snap.docs
                .filter(d => d.data().gps && d.data().gps !== 'ok' && d.data().gps !== 'waiting')
                .map(d => ({ id: d.id, detail: String(d.data().gpsDetail || d.data().gps) })));
        }, () => { /* nothing reported yet */ });
    }, []);

    // Сигналите от червения бутон на терминалите, които още важат.
    useEffect(() => {
        const q = query(collection(db, 'disruptions'), where('activeUntil', '>', new Date().toISOString()));
        return onSnapshot(q, snap => {
            setDisruptions(snap.docs.filter(d => !d.data().resolvedAt).map(d => ({
                id: d.id, kind: String(d.data().kind || ''), routeName: String(d.data().routeName || ''),
                departure: String(d.data().departure || ''), deviceName: String(d.data().deviceName || ''),
                at: String(d.data().at || ''), matchedBy: String(d.data().matchedBy || ''),
            })).sort((a, b) => b.at.localeCompare(a.at)));
        }, () => { /* none yet */ });
    }, []);
    const endDisruption = (id: string) => updateDoc(doc(db, 'disruptions', id), {
        resolvedAt: new Date().toISOString(), resolvedBy: currentUser?.username || 'админ',
    }).catch(err => console.error('Disruption not ended:', err));

    // Терминалите са с имената, които им е дал админът в УСТРОЙСТВА.
    useEffect(() => {
        return onSnapshot(collection(db, 'devices'), snap => {
            const out: Record<string, string> = {};
            snap.docs.forEach(d => { out[d.id] = String(d.data().name || d.data().autoName || ''); });
            setDeviceNames(out);
        }, () => { /* no devices yet */ });
    }, []);

    useEffect(() => {
        return onSnapshot(doc(db, 'settings', 'nap'), snap => {
            const d = snap.data() || {};
            setNap({
                registered: d.registered === true,
                registeredAt: String(d.registeredAt || ''),
                confirmedAt: String(d.confirmedAt || ''),
                note: String(d.note || ''),
            });
        }, () => { /* no record yet */ });
    }, []);

    const saveNap = (patch: Partial<NapState>) =>
        setDoc(doc(db, 'settings', 'nap'), { ...nap, ...patch, updatedBy: currentUser?.username || '' }, { merge: true });

    const errors = report?.problems.filter(p => p.level === 'error') || [];
    const warnings = report?.problems.filter(p => p.level === 'warning') || [];
    const fileOk = !!report && report.counts.trips > 0 && errors.length === 0;
    const confirmedRecently = !!nap.confirmedAt && now - new Date(nap.confirmedAt).getTime() < YEAR_MS - 30 * 86400000;
    const allOk = fileOk && nap.registered && confirmedRecently;
    const daysLeft = Math.ceil((DEADLINE.getTime() - now) / 86400000);

    const btn: React.CSSProperties = {
        display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', borderRadius: '9px',
        cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)',
        color: '#fff', fontSize: '0.8rem', fontWeight: 700,
    };

    return (
        <section style={{
            background: allOk ? 'rgba(0,230,118,0.05)' : 'rgba(255,171,0,0.04)',
            border: `1px solid ${allOk ? 'rgba(0,230,118,0.3)' : 'rgba(255,171,0,0.25)'}`,
            borderRadius: '20px', padding: '1.5rem', marginBottom: '2rem',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={21} color={allOk ? '#00e676' : '#ffab00'} />
                    Съответствие с Наредба Н-7
                    <span style={{
                        fontSize: '0.75rem', fontWeight: 800, padding: '0.25rem 0.7rem', borderRadius: '50px',
                        background: allOk ? 'rgba(0,230,118,0.15)' : 'rgba(255,171,0,0.15)',
                        color: allOk ? '#00e676' : '#ffab00',
                    }}>{allOk ? 'ИЗРЯДНИ' : 'ИМА ЗА ДОВЪРШВАНЕ'}</span>
                </h2>
                {daysLeft > 0 && !allOk && (
                    <span style={{ fontSize: '0.85rem', color: '#ffab00', fontWeight: 700 }}>
                        {daysLeft} дни до крайния срок (1.01.2027)
                    </span>
                )}
            </div>

            <div style={{ display: 'grid', gap: '0.6rem' }}>
                <Row ok={fileOk} warn={!!report && report.counts.trips > 0} title="Файлът с разписанията (GTFS)">
                    {loading && !report ? 'Проверка…'
                        : reportError ? reportError
                        : report && (
                            <>
                                {report.counts.routes} линии · {report.counts.stops} спирки · {report.counts.trips} курса · валиден {report.feedStart.slice(6, 8)}.{report.feedStart.slice(4, 6)}.{report.feedStart.slice(0, 4)} – {report.feedEnd.slice(6, 8)}.{report.feedEnd.slice(4, 6)}.{report.feedEnd.slice(0, 4)}
                                {errors.length > 0 && (
                                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', color: '#ff8a80', maxHeight: '9rem', overflowY: 'auto' }}>
                                        {errors.slice(0, 20).map((p, i) => <li key={i}>{p.message}</li>)}
                                    </ul>
                                )}
                                {warnings.length > 0 && (
                                    <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#ffd180', maxHeight: '7rem', overflowY: 'auto' }}>
                                        {warnings.slice(0, 20).map((p, i) => <li key={i}>{p.message}</li>)}
                                    </ul>
                                )}
                            </>
                        )}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                        <button style={btn} onClick={load} disabled={loading}>
                            {loading ? <Loader2 size={14} /> : <RefreshCw size={14} />} Провери отново
                        </button>
                        {fileOk && <a style={btn} href={feedUrl}><Download size={14} /> Свали файла</a>}
                    </div>
                </Row>

                <Row ok={nap.registered} title="Регистрация в Националната точка за достъп">
                    {nap.registered
                        ? <>Регистрирани на {fmt(nap.registeredAt)}. Порталът изтегля файла сам от адреса по-долу при всяка промяна.</>
                        : <>„ДАРИ КОМЕРС - НА“ ООД (ЕИК 114601542) се регистрира веднъж в портала на НТД като подател на данни и добавя набор от данни „GTFS“ с адреса по-долу. След това порталът изтегля файла сам.</>}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem',
                        padding: '0.55rem 0.7rem', borderRadius: '9px', background: 'rgba(0,0,0,0.3)',
                        fontFamily: 'monospace', fontSize: '0.82rem', color: '#fff', wordBreak: 'break-all',
                    }}>
                        <span style={{ flex: 1, minWidth: 0 }}>{feedUrl}</span>
                        <button style={btn} onClick={() => {
                            navigator.clipboard?.writeText(feedUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
                        }}><Copy size={14} /> {copied ? 'Копирано' : 'Копирай'}</button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem', alignItems: 'center' }}>
                        <a style={btn} href="https://sipbg.gov.bg/bgnap/admin-fe" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Портал на НТД</a>
                        <label style={{ ...btn, background: nap.registered ? 'rgba(0,230,118,0.12)' : btn.background }}>
                            <input type="checkbox" checked={nap.registered}
                                onChange={e => saveNap({ registered: e.target.checked, registeredAt: e.target.checked ? new Date().toISOString() : '' })} />
                            Регистрирани сме и адресът е добавен
                        </label>
                    </div>
                </Row>

                <Row ok={!!live && live.length > 0 && gpsTrouble.length === 0} warn={!live || live.length === 0}
                    title="Автобусите в реално време (GTFS-Realtime)">
                    Терминалите в автобусите изпращат позицията си на всеки 30 секунди. Системата сама
                    разпознава кой курс от разписанието кара всеки автобус — шофьорът не прави нищо.
                    {live && live.length > 0 ? (
                        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                            {live.map(v => (
                                <li key={v.deviceId} style={{ color: v.match ? '#b9f6ca' : '#ffd180' }}>
                                    <strong>{v.label}</strong> — {v.match
                                        ? <>{v.match.routeName}{v.match.delay > 0 ? `, закъснение ${v.match.delay} мин.` : ', навреме'}</>
                                        : v.note || 'без разпознат курс'}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div style={{ marginTop: '0.4rem' }}>В момента няма автобуси, които подават позиция.</div>
                    )}
                    <div style={{ marginTop: '0.6rem' }}>
                        <strong style={{ color: '#fff' }}>Отменени курсове и смущения.</strong> Шофьорът ги подава от червената лента
                        най-долу на терминала; влизат веднага в потока за НТД. Приемат се само от терминал с име в УСТРОЙСТВА.
                        {disruptions.length === 0 ? (
                            <div style={{ marginTop: '0.3rem' }}>В момента няма активни сигнали.</div>
                        ) : (
                            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#ff8a80' }}>
                                {disruptions.map(d => (
                                    <li key={d.id} style={{ marginBottom: '0.3rem' }}>
                                        <strong>{DISRUPTION_LABELS[d.kind] || d.kind}</strong> — {d.routeName}{d.departure ? `, курс ${d.departure}` : ''}
                                        {' '}· {d.deviceName}, {new Date(d.at).toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })}
                                        {d.matchedBy === 'driver' ? ' (курсът е избран от шофьора)' : ''}
                                        {' '}<button style={{ ...btn, padding: '0.2rem 0.6rem' }} onClick={() => endDisruption(d.id)}>Прекрати</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {gpsTrouble.length > 0 && (
                        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#ff8a80' }}>
                            {gpsTrouble.map(t => <li key={t.id}>{deviceNames[t.id] || `Терминал ${t.id.slice(0, 6)}…`}: {t.detail}</li>)}
                        </ul>
                    )}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem',
                        padding: '0.55rem 0.7rem', borderRadius: '9px', background: 'rgba(0,0,0,0.3)',
                        fontFamily: 'monospace', fontSize: '0.82rem', color: '#fff', wordBreak: 'break-all',
                    }}>
                        <span style={{ flex: 1, minWidth: 0 }}>{rtUrl}</span>
                        <button style={btn} onClick={() => navigator.clipboard?.writeText(rtUrl)}><Copy size={14} /> Копирай</button>
                    </div>
                    <div style={{ fontSize: '0.78rem', marginTop: '0.35rem' }}>Адресът за данните в реално време — добавя се в НТД до този на разписанията.</div>
                </Row>

                <Row ok={confirmedRecently} warn={!nap.confirmedAt} title="Годишно потвърждение на актуалността">
                    {nap.confirmedAt
                        ? <>Последно потвърдено на {fmt(nap.confirmedAt)}. Следващото — до {fmt(new Date(new Date(nap.confirmedAt).getTime() + YEAR_MS).toISOString())}.</>
                        : <>Наредбата изисква поне веднъж годишно да потвърдите, че данните са актуални. Прегледайте линиите и разписанията и потвърдете.</>}
                    <div style={{ marginTop: '0.6rem' }}>
                        <button style={btn} disabled={!fileOk} onClick={() => saveNap({ confirmedAt: new Date().toISOString() })}
                            title={fileOk ? '' : 'Първо оправете файла с разписанията'}>
                            <CalendarCheck size={14} /> Данните са актуални — потвърди
                        </button>
                    </div>
                </Row>
            </div>
        </section>
    );
};

export default ComplianceCard;
