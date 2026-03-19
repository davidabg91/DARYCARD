import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, MapPin, Ban, Clock, User, Settings, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

interface Client {
    id: string;
    name: string;
    route: string;
    expiryDate: string;
    photo: string;
    createdAt: string;
    amountPaid?: number;
    isCanceled?: boolean;
    cancelReason?: string;
    renewalHistory?: { date: string, amount: number, month: string }[];
    history?: { date: string; action: string; details?: string; amount?: number; }[];
}

const ClientProfile: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { currentUser } = useAuth();
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [scanTime] = useState(new Date().toLocaleTimeString('bg-BG'));
    const [showRenewConfirm, setShowRenewConfirm] = useState(false);
    const [renewError, setRenewError] = useState<string | null>(null);
    const [renewAmount, setRenewAmount] = useState<number>(50);
    const [renewMonth, setRenewMonth] = useState<string>('');
    const [showPhotoModal, setShowPhotoModal] = useState(false);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        
        // Listen to specific client in Firestore
        const unsubscribe = onSnapshot(doc(db, 'clients', id), (docSnap) => {
            if (docSnap.exists()) {
                setClient({ id: docSnap.id, ...docSnap.data() } as Client);
            } else {
                setClient(null);
            }
            setLoading(false);
        }, (err) => {
            console.error("Firestore error:", err);
            setError(err.message);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [id]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: '#fff' }}>
                <div style={{ textAlign: 'center' }}>
                    <RefreshCw className="spin" size={48} color="var(--primary-color)" />
                    <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Зареждане на данни...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: '#fff', padding: '1rem' }}>
                <div style={{ textAlign: 'center', maxWidth: '400px', width: '100%' }}>
                    <Ban size={64} color="var(--error-color)" style={{ marginBottom: '1.5rem' }} />
                    <h2 style={{ marginBottom: '1rem' }}>Грешка при зареждане</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>{error}</p>
                    <Link to="/" style={{ padding: '0.8rem 2rem', background: 'var(--primary-color)', color: '#fff', borderRadius: '50px', textDecoration: 'none', fontWeight: 600 }}>Към Начало</Link>
                </div>
            </div>
        );
    }

    if (!client) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: '#fff', padding: '1rem' }}>
                <div style={{ textAlign: 'center', maxWidth: '400px', width: '100%' }}>
                    <XCircle size={64} color="var(--error-color)" style={{ marginBottom: '1.5rem' }} />
                    <h2 style={{ marginBottom: '1rem' }}>Картата не е намерена</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>ID: {id}</p>
                    <Link to="/" style={{ padding: '0.8rem 2rem', background: 'var(--primary-color)', color: '#fff', borderRadius: '50px', textDecoration: 'none', fontWeight: 600 }}>Към Начало</Link>
                </div>
            </div>
        );
    }

    const getQuickRenewSummary = () => {
        const now = new Date();
        const day = now.getDate();
        let month = now.getMonth();
        let year = now.getFullYear();

        if (day > 10) {
            month += 1;
            if (month > 11) {
                month = 0;
                year += 1;
            }
        }
        
        const targetMonth = `${year}-${(month + 1).toString().padStart(2, '0')}`;
        
        // Bulgarian months
        const bgMonths = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];
        const monthName = bgMonths[month];

        // Use last payment amount as default, or 50 if first time
        let defaultAmount = 50;
        if (client?.renewalHistory && client.renewalHistory.length > 0) {
            defaultAmount = client.renewalHistory[client.renewalHistory.length - 1].amount;
        } else if (client?.amountPaid) {
            defaultAmount = client.amountPaid;
        }

        return { targetMonth, monthName, year, defaultAmount };
    };

    const initiationRenew = () => {
        const { targetMonth, defaultAmount } = getQuickRenewSummary();
        setRenewAmount(defaultAmount);
        setRenewMonth(targetMonth);
        setShowRenewConfirm(true);
    };

    const handleConfirmRenew = async () => {
        if (!client) return;
        setRenewError(null);

        try {
            const amount = Number(renewAmount);
            const targetMonth = renewMonth;

            if (isNaN(amount) || amount <= 0) {
                setRenewError('Моля, въведете валидна сума.');
                return;
            }
            if (!targetMonth) {
                setRenewError('Моля, изберете месец.');
                return;
            }
            
            const history = client.history || [];
            const renewalHistory = client.renewalHistory || [];
            
            const updatedClient = {
                ...client,
                expiryDate: targetMonth,
                amountPaid: (client.amountPaid || 0) + amount,
                isCanceled: false,
                cancelReason: "",
                renewalHistory: [...renewalHistory, { date: new Date().toISOString(), amount, month: targetMonth }],
                history: [...history, {
                    date: new Date().toISOString(),
                    action: 'Бързо Подновяване (Профил)',
                    details: `Месец: ${targetMonth}`,
                    amount
                }]
            };

            await setDoc(doc(db, 'clients', client.id), updatedClient);
            setShowRenewConfirm(false);
        } catch (err) {
            console.error(err);
            setRenewError('Грешка при записване. Моля, опитайте пак.');
        }
    };

    if (loading) return null;

    if (!client) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', background: '#1a1a1a' }}>
                <Ban size={80} color="#ff4444" style={{ marginBottom: '1.5rem' }} />
                <h1 style={{ fontSize: '2.5rem', color: '#fff', marginBottom: '1rem' }}>НЕВАЛИДЕН ТАГ</h1>
                <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.6)' }}>Картата не е намерена в базата данни.</p>
            </div>
        );
    }

    // Check status
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    // Bulgarian month for display
    const getFormattedMonth = (dateStr: string) => {
        if (!dateStr) return '';
        const [year, month] = dateStr.split('-');
        const bgMonths = ["ЯНУАРИ", "ФЕВРУАРИ", "МАРТ", "АПРИЛ", "МАЙ", "ЮНИ", "ЮЛИ", "АВГУСТ", "СЕПТЕМВРИ", "ОКТОМВРИ", "НОЕМВРИ", "ДЕКЕМВРИ"];
        return `${bgMonths[parseInt(month) - 1]} ${year}`;
    };

    const isCanceled = client.isCanceled;
    const hasPaidCurrentMonth = (client.renewalHistory || []).some(rh => rh.month === currentMonthStr);
    
    // A card is active ONLY if it is not canceled AND have payment for THIS current month
    const isActive = !isCanceled && hasPaidCurrentMonth;
    
    const themeColor = isActive ? '#00e676' : '#ff1744';
    
    let statusText = isCanceled ? 'АНУЛИРАН' : 'НЕАКТИВЕН';
    if (!isCanceled && !hasPaidCurrentMonth) {
        statusText = `БЕЗ ТАКСА ЗА ${getFormattedMonth(currentMonthStr).split(' ')[0]}`;
    } else if (isActive) {
        statusText = 'АКТИВЕН';
    }

    const StatusIcon = isActive ? CheckCircle : XCircle;

    return (
        <div style={{ 
            minHeight: '100vh', 
            background: '#000', 
            display: 'flex', 
            flexDirection: 'column',
            color: '#fff',
            fontFamily: 'Inter, sans-serif'
        }}>
            {/* Status Strip Header */}
            <div style={{ 
                background: themeColor, 
                padding: '2rem 1rem', 
                textAlign: 'center',
                boxShadow: `0 0 40px ${themeColor}44`,
                position: 'relative',
                zIndex: 10
            }}>
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '1rem',
                    animation: isActive ? 'pulse 2s infinite' : 'none'
                }}>
                    <StatusIcon size={40} color="#000" />
                    <h1 style={{ 
                        margin: 0, 
                        fontSize: '2.5rem', 
                        fontWeight: 900, 
                        color: '#000',
                        letterSpacing: '2px'
                    }}>{statusText}</h1>
                </div>
            </div>

            {/* Main Content */}
            <div style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                padding: '2rem 1rem',
                gap: '2rem'
            }}>
                
                {/* Photo Section */}
                <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setShowPhotoModal(true)}>
                    <div style={{
                        position: 'absolute',
                        inset: '-10px',
                        background: themeColor,
                        borderRadius: '32px',
                        opacity: 0.2,
                        filter: 'blur(20px)'
                    }} />
                    <img 
                        src={client.photo} 
                        style={{ 
                            width: '240px', 
                            height: '240px', 
                            borderRadius: '24px', 
                            objectFit: 'cover', 
                            border: `4px solid ${themeColor}`,
                            position: 'relative',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                            transition: 'transform 0.2s'
                        }} 
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        alt="Client" 
                    />
                    <div style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.6)',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '0.7rem',
                        color: '#fff',
                        backdropFilter: 'blur(4px)',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none'
                    }}>
                        КЛИКНИ ЗА УВЕЛИЧЕНИЕ
                    </div>
                </div>

                {/* Info Card */}
                <div style={{ 
                    background: 'rgba(255,255,255,0.03)', 
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '32px',
                    padding: '2.5rem 2rem',
                    width: '100%',
                    maxWidth: '440px',
                    textAlign: 'center',
                    boxShadow: '0 40px 100px rgba(0,0,0,0.5)'
                }}>
                    <h2 style={{ fontSize: '2.4rem', margin: '0 0 1.5rem 0', fontWeight: 900, color: '#fff' }}>{client.name}</h2>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem' }}>
                            <MapPin size={22} color={themeColor} />
                            <span>КУРС: <strong style={{ color: '#fff' }}>{client.route}</strong></span>
                        </div>

                        <div style={{ 
                            background: `${themeColor}15`, 
                            padding: '1.5rem', 
                            borderRadius: '20px', 
                            border: `1px solid ${themeColor}33`,
                            marginTop: '0.5rem'
                        }}>
                            <div style={{ color: themeColor, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '1px' }}>Картата е валидна за</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff' }}>
                                {getFormattedMonth(client.expiryDate)}
                            </div>
                        </div>

                        {/* Active/Future Paid Months List */}
                        {client.renewalHistory && client.renewalHistory.length > 0 && (
                            <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.8rem', letterSpacing: '1px' }}>Активни Плащания</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {client.renewalHistory
                                        .filter(rh => {
                                            const now = new Date();
                                            const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
                                            return rh.month >= currentMonthStr;
                                        })
                                        .sort((a, b) => a.month.localeCompare(b.month))
                                        .map((rh, index) => (
                                            <div key={index} style={{ 
                                                background: 'rgba(255,255,255,0.05)', 
                                                padding: '0.8rem 1rem', 
                                                borderRadius: '12px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                border: '1px solid rgba(255,255,255,0.05)'
                                            }}>
                                                <div style={{ fontWeight: 700, color: '#fff' }}>{getFormattedMonth(rh.month)}</div>
                                                <div style={{ fontSize: '0.9rem', color: themeColor, fontWeight: 800 }}>{rh.amount} €</div>
                                            </div>
                                        ))
                                    }
                                    {client.renewalHistory.filter(rh => {
                                        const now = new Date();
                                        const currentStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
                                        return rh.month >= currentStr;
                                    }).length === 0 && (
                                        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.875rem', fontStyle: 'italic' }}>Няма активни бъдещи плащания.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Admin/Moderator Manage Button */}
                    {currentUser && (
                        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button 
                                onClick={initiationRenew}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.6rem',
                                    background: '#00e676',
                                    color: '#000',
                                    padding: '1.2rem 2rem',
                                    border: 'none',
                                    borderRadius: '50px',
                                    fontWeight: 900,
                                    fontSize: '1.4rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 0 20px rgba(0, 230, 118, 0.4)',
                                    transition: 'transform 0.2s',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <RefreshCw size={24} /> ПОДНОВИ
                            </button>

                            <Link 
                                to={`/admin?edit=${client.id}`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.6rem',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: '#fff',
                                    padding: '0.8rem 2rem',
                                    borderRadius: '50px',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '1rem',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                }}
                            >
                                <Settings size={18} /> Управление
                            </Link>
                        </div>
                    )}
                </div>

                {/* Footer / Time */}
                <div style={{ 
                    marginTop: 'auto', 
                    padding: '1.5rem', 
                    background: 'rgba(255,255,255,0.03)', 
                    width: '100%', 
                    borderRadius: '24px 24px 0 0',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
                        <Clock size={16} /> Сканирано на: {scanTime}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: themeColor, fontSize: '0.8rem', fontWeight: 600 }}>
                        <User size={14} /> ID: {client.id}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); }
                }
                body { margin: 0; padding: 0; overflow-x: hidden; }
            `}</style>

            {/* Confirmation Overlay */}
            {showRenewConfirm && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.9)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                    textAlign: 'center'
                }}>
                    <div style={{ 
                        background: '#1a1a1a', 
                        padding: '2.5rem', 
                        borderRadius: '32px', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        width: '100%',
                        maxWidth: '400px',
                        boxShadow: '0 40px 100px rgba(0,0,0,1)'
                    }}>
                        <div style={{ 
                            background: '#00e676', 
                            width: '80px', 
                            height: '80px', 
                            borderRadius: '50%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                            boxShadow: '0 0 30px rgba(0,230,118,0.3)'
                        }}>
                            <RefreshCw size={40} color="#000" />
                        </div>
                        
                        <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.5rem 0' }}>Подновяване</h2>
                        <div style={{ color: 'var(--primary-color)', fontWeight: 700, fontSize: '1.2rem', marginBottom: '1.5rem' }}>
                            {client.name}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Курс</div>
                                <div style={{ fontWeight: 700 }}>{client.route}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Месец за подновяване</div>
                                <input 
                                    type="month"
                                    value={renewMonth}
                                    onChange={(e) => setRenewMonth(e.target.value)}
                                    style={{
                                        background: 'rgba(255,255,255,0.1)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: '#fff',
                                        fontSize: '1.2rem',
                                        fontWeight: 700,
                                        padding: '0.5rem 1rem',
                                        borderRadius: '12px',
                                        width: '100%',
                                        outline: 'none',
                                        colorScheme: 'dark'
                                    }}
                                />
                            </div>
                            
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '16px' }}>
                                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Сума (EUR)</div>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <input 
                                        type="number"
                                        value={renewAmount}
                                        onChange={(e) => setRenewAmount(Number(e.target.value))}
                                        style={{
                                            background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: '#fff',
                                            fontSize: '2rem',
                                            fontWeight: 900,
                                            padding: '0.5rem 1rem',
                                            borderRadius: '12px',
                                            width: '140px',
                                            textAlign: 'center',
                                            outline: 'none'
                                        }}
                                    />
                                    <span style={{ marginLeft: '0.5rem', fontSize: '1.5rem', fontWeight: 800 }}>€</span>
                                </div>
                            </div>
                        </div>

                        {renewError && (
                            <div style={{ color: '#ff4444', marginBottom: '1rem', fontSize: '0.9rem' }}>{renewError}</div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button 
                                onClick={handleConfirmRenew}
                                style={{
                                    background: '#00e676',
                                    color: '#000',
                                    border: 'none',
                                    padding: '1.2rem',
                                    borderRadius: '16px',
                                    fontWeight: 800,
                                    fontSize: '1.2rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Потвърди Плащането
                            </button>
                            <button 
                                onClick={() => setShowRenewConfirm(false)}
                                style={{
                                    background: 'transparent',
                                    color: 'rgba(255,255,255,0.5)',
                                    border: 'none',
                                    padding: '1rem',
                                    fontSize: '1rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Отказ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Photo Fullscreen Modal */}
            {showPhotoModal && (
                <div 
                    onClick={() => setShowPhotoModal(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.95)',
                        backdropFilter: 'blur(15px)',
                        zIndex: 2000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        cursor: 'zoom-out',
                        animation: 'fadeIn 0.2s ease'
                    }}
                >
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img 
                            src={client.photo} 
                            style={{ 
                                maxWidth: '100%', 
                                maxHeight: '90vh', 
                                borderRadius: '24px', 
                                boxShadow: '0 0 50px rgba(0,0,0,1)',
                                border: `2px solid ${themeColor}`
                            }} 
                            alt="Zoomed Client" 
                        />
                        <div style={{ position: 'absolute', top: '2rem', right: '2rem', color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '0.6rem 1.2rem', borderRadius: '50px', fontWeight: 600 }}>
                            Затвори
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientProfile;
