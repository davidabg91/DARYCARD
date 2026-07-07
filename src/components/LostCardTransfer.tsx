import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, doc, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { uploadClientPhoto } from '../utils/photoStorage';
import { CARDS_MAPPING } from '../data/cardsMapping';
import { LOST_CARD_FINE } from '../data/lostCard';
import { Search, X, AlertTriangle, CreditCard, CheckCircle, Loader2, ArrowRight } from 'lucide-react';

/** Minimal client shape needed for the transfer (mirrors the clients collection). */
interface TransferClient {
    id: string;
    name: string;
    route?: string;
    routes?: string[];
    cardType?: string;
    address?: string;
    serviceReason?: string;
    school?: string;
    municipality?: string;
    photo?: string;
    photoThumb?: string;
    cardNumber?: string;
    isCanceled?: boolean;
    renewalHistory?: { date: string; amount: number; month: string; route?: string; paymentMethod?: string }[];
}

interface Props {
    newCardId: string;
    newCardUid?: string;
    onClose: () => void;
    onDone: () => void;
}

const currentMonthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
};

// Turn a photo (Storage URL or data URL) into a data URL so it can be re-uploaded
// under the new card id. Falls back to null on any failure.
const photoToDataUrl = async (src: string): Promise<string | null> => {
    try {
        const res = await fetch(src);
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.8rem 0.9rem', background: 'rgba(0,0,0,0.25)',
    border: '1px solid var(--surface-border)', borderRadius: '12px', color: '#fff',
    fontSize: '1rem', outline: 'none', colorScheme: 'dark',
};

const LostCardTransfer: React.FC<Props> = ({ newCardId, newCardUid = '', onClose, onDone }) => {
    const { currentUser } = useAuth();
    const [clients, setClients] = useState<TransferClient[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [queryText, setQueryText] = useState('');
    const [selected, setSelected] = useState<TransferClient | null>(null);
    const [month, setMonth] = useState(currentMonthStr());
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const snap = await getDocs(collection(db, 'clients'));
                if (cancelled) return;
                setClients(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TransferClient, 'id'>) })));
            } catch (e) {
                console.error('Load clients failed:', e);
                if (!cancelled) setError('Грешка при зареждане на клиентите.');
            } finally {
                if (!cancelled) setLoadingList(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const results = useMemo(() => {
        const q = queryText.trim().toLowerCase();
        if (!q) return [];
        return clients
            .filter(c => c.id !== newCardId)
            .filter(c =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.id || '').toLowerCase().includes(q) ||
                (c.cardNumber || CARDS_MAPPING[c.id] || '').toLowerCase().includes(q) ||
                (c.route || '').toLowerCase().includes(q)
            )
            .slice(0, 25);
    }, [clients, queryText, newCardId]);

    const hasSubForMonth = !!selected?.renewalHistory?.some(r => r.month === month);

    const handleTransfer = async () => {
        if (!selected || !currentUser) return;
        setSubmitting(true);
        setError('');
        const nowIso = new Date().toISOString();
        const oldId = selected.id;
        const routes = selected.routes && selected.routes.length ? selected.routes : (selected.route ? [selected.route] : []);

        try {
            // Copy the photo to the new card id (fall back to reusing the URL).
            let photoValue = selected.photo || '';
            if (selected.photo) {
                const dataUrl = await photoToDataUrl(selected.photo);
                if (dataUrl) {
                    try { photoValue = await uploadClientPhoto(dataUrl, newCardId); }
                    catch { photoValue = selected.photo; }
                }
            }

            const renewalHistory = hasSubForMonth
                ? [{ date: nowIso, amount: 0, month, route: selected.route || '', paymentMethod: 'Прехвърлен от загубена карта' }]
                : [];

            const newClient = {
                id: newCardId,
                nfcUid: (newCardUid || '').toUpperCase(),
                name: selected.name || '',
                route: selected.route || '',
                routes,
                cardType: selected.cardType || 'Нормална карта',
                address: selected.address || '',
                serviceReason: selected.serviceReason || '',
                school: selected.school || '',
                municipality: selected.municipality || '',
                cardNumber: CARDS_MAPPING[newCardId] || '',
                expiryDate: hasSubForMonth ? month : '',
                photo: photoValue,
                photoThumb: selected.photoThumb || '',
                createdAt: nowIso,
                amountPaid: 0,
                isCanceled: false,
                renewalHistory,
                history: [{
                    date: nowIso,
                    action: `Активиране (прехвърляне от загубена карта ${oldId})`,
                    details: `Профил прехвърлен от загубена карта ${oldId}${hasSubForMonth ? `; абонамент за ${month}` : '; без абонамент'}; глоба ${LOST_CARD_FINE}€`,
                    amount: LOST_CARD_FINE,
                    performedBy: currentUser.username,
                }],
            };

            const batch = writeBatch(db);
            batch.set(doc(db, 'clients', newCardId), newClient);
            batch.update(doc(db, 'clients', oldId), {
                isCanceled: true,
                cancelReason: 'Загубена карта',
                history: arrayUnion({
                    date: nowIso,
                    action: 'Анулиране (загубена карта)',
                    details: `Профилът е прехвърлен на карта ${newCardId}`,
                    performedBy: currentUser.username,
                }),
            });
            batch.set(doc(collection(db, 'fines')), {
                clientId: newCardId,
                oldCardId: oldId,
                clientName: selected.name || '',
                amount: LOST_CARD_FINE,
                reason: 'Загубена карта',
                month: currentMonthStr(),
                date: nowIso,
                performedBy: currentUser.username,
                paymentMethod: 'В брой',
            });
            batch.set(doc(collection(db, 'activity_logs')), {
                timestamp: nowIso,
                performedBy: currentUser.username || 'Admin',
                action: 'Загубена карта (прехвърляне)',
                targetName: selected.name || 'Клиент',
                details: `От карта ${oldId} на ${newCardId}; глоба ${LOST_CARD_FINE}€${hasSubForMonth ? `; прехвърлен абонамент за ${month}` : ''}`,
                amount: LOST_CARD_FINE,
            });

            await batch.commit();
            onDone();
        } catch (e) {
            console.error('Lost card transfer failed:', e);
            setError('Грешка при прехвърлянето. Опитай отново.');
            setSubmitting(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '520px', margin: '3vh 0', background: '#1c222b', border: '1px solid var(--surface-border)', borderRadius: '24px', padding: '1.5rem', color: '#fff', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ width: '38px', height: '38px', borderRadius: '11px', background: 'rgba(255,82,82,0.14)', border: '1px solid rgba(255,82,82,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <AlertTriangle size={19} color="#ff5252" />
                        </span>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>Загубена карта</h3>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}><X size={22} /></button>
                </div>

                {!selected ? (
                    <>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                            Намери клиента, чиято карта е загубена. Профилът му ще се прехвърли на новата карта <b style={{ color: '#fff', fontFamily: 'monospace' }}>{CARDS_MAPPING[newCardId] || newCardId}</b>.
                        </p>
                        <div style={{ position: 'relative', marginBottom: '1rem' }}>
                            <Search size={18} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input autoFocus value={queryText} onChange={e => setQueryText(e.target.value)} placeholder="Търси по име, № на карта или маршрут" style={{ ...inputStyle, paddingLeft: '2.6rem' }} />
                        </div>
                        {loadingList ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}><Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /></div>
                        ) : queryText.trim() === '' ? (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Започни да пишеш за търсене…</div>
                        ) : results.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Няма намерени клиенти.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '46vh', overflowY: 'auto' }}>
                                {results.map(c => (
                                    <button key={c.id} onClick={() => setSelected(c)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left', padding: '0.65rem 0.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '12px', color: '#fff', cursor: 'pointer' }}>
                                        {c.photoThumb ? <img src={c.photoThumb} alt="" style={{ width: '38px', height: '38px', borderRadius: '9px', objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ width: '38px', height: '38px', borderRadius: '9px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CreditCard size={17} color="var(--text-secondary)" /></span>}
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || '—'}{c.isCanceled ? ' · анулиран' : ''}</span>
                                            <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>№{c.cardNumber || CARDS_MAPPING[c.id] || c.id} · {c.route || '—'}</span>
                                        </span>
                                        <ArrowRight size={16} color="var(--text-secondary)" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* Selected client summary */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--surface-border)', borderRadius: '14px', marginBottom: '1rem' }}>
                            {selected.photoThumb ? <img src={selected.photoThumb} alt="" style={{ width: '46px', height: '46px', borderRadius: '10px', objectFit: 'cover' }} /> : <span style={{ width: '46px', height: '46px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CreditCard size={20} color="var(--text-secondary)" /></span>}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 800, fontSize: '1rem' }}>{selected.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Стара карта №{selected.cardNumber || CARDS_MAPPING[selected.id] || selected.id} · {selected.route || '—'}</div>
                            </div>
                            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>Смени</button>
                        </div>

                        {/* Month */}
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Абонамент за месец</label>
                        <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, marginBottom: '0.5rem' }} />
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '1rem', color: hasSubForMonth ? '#00e676' : '#ffab00', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {hasSubForMonth ? <><CheckCircle size={15} /> Има абонамент за {month} — ще се прехвърли.</> : <><AlertTriangle size={15} /> Няма абонамент за {month} — само глоба.</>}
                        </div>

                        {/* Fine notice */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.3)', borderRadius: '12px', marginBottom: '1.25rem' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ff8a8a' }}>Глоба за загубена карта</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ff5252' }}>{LOST_CARD_FINE.toFixed(2)} €</span>
                        </div>

                        {error && <div style={{ color: '#ff5252', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>{error}</div>}

                        <button disabled={submitting} onClick={handleTransfer} style={{ width: '100%', padding: '1rem', borderRadius: '14px', background: submitting ? 'rgba(0,230,118,0.5)' : '#00e676', color: '#00351c', fontWeight: 900, fontSize: '1rem', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            {submitting ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Прехвърляне…</> : <>Прехвърли и активирай</>}
                        </button>
                        <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', textAlign: 'center', margin: '0.75rem 0 0', lineHeight: 1.5 }}>
                            Старата карта ще се анулира (причина „Загубена карта").
                        </p>
                    </>
                )}
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
};

export default LostCardTransfer;
