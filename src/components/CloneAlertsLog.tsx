import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { Clock, AlertTriangle, CreditCard, MapPin, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { CARDS_MAPPING } from '../data/cardsMapping';

interface CloneAlert {
    id: string;
    timestamp: string;
    clientId: string;
    clientName: string;
    route: string;
    registeredUid: string;
    scannedUid: string;
    resolved?: boolean;
}

/**
 * Renders security alerts logged when a physical card clone (UID mismatch) is detected.
 */
const CloneAlertsLog: React.FC = () => {
    const [alerts, setAlerts] = useState<CloneAlert[]>([]);

    useEffect(() => {
        const q = query(collection(db, 'clone_alerts'), orderBy('timestamp', 'desc'), limit(30));
        const unsub = onSnapshot(q, (snap) => {
            const list: CloneAlert[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as CloneAlert));
            setAlerts(list);
        }, (err) => console.error('CloneAlertsLog error:', err));
        return () => unsub();
    }, []);

    const handleDeleteAlert = async (alertId: string) => {
        if (!window.confirm('Сигурни ли сте, че искате да изтриете този сигнал?')) return;
        try {
            await deleteDoc(doc(db, 'clone_alerts', alertId));
        } catch (err) {
            console.error('Failed to delete clone alert:', err);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <AlertTriangle size={20} color="#ff1744" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Сигнали за дублирани карти ({alerts.length})</h4>
            </div>

            {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.3, fontWeight: 700 }}>Няма засечени опити за измама.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {alerts.map((a) => {
                        const cardNum = CARDS_MAPPING[a.clientId] || '';
                        return (
                            <div key={a.id} style={{
                                background: 'rgba(255,23,68,0.04)', border: '1px solid rgba(255,23,68,0.15)',
                                borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>{a.clientName}</span>
                                            {cardNum && (
                                                <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                                                    КАРТА № {cardNum}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '2px' }}>
                                            ID на документ: {a.clientId}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ fontSize: '0.72rem', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Clock size={12} /> {new Date(a.timestamp).toLocaleString('bg-BG')}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteAlert(a.id)}
                                            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                                            title="Изтрий сигнала"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1.5rem', fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <MapPin size={13} color="#ff5252" /> Линия: <strong>{a.route || 'Неизвестна'}</strong>
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <CreditCard size={13} color="#ff5252" /> Регистриран UID: <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>{a.registeredUid}</code>
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <AlertTriangle size={13} color="#ff1744" /> Сканиран UID: <code style={{ background: 'rgba(255,23,68,0.15)', color: '#ff8a80', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>{a.scannedUid}</code>
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CloneAlertsLog;
