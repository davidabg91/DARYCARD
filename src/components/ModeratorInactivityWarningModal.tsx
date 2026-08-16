import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ModeratorInactivityWarningModalProps {
    isOpen: boolean;
    reason: 'timeout' | 'action';
    clientName: string;
    clientRoute?: string;
    cardNumber?: string;
    lastPaidMonth?: string;
    isPaidCurrentMonth?: boolean;
    onStayAndRenew: () => void;
    onContinueWithoutChange: () => void;
}

const ModeratorInactivityWarningModal: React.FC<ModeratorInactivityWarningModalProps> = ({
    isOpen,
    reason,
    clientName,
    clientRoute,
    cardNumber,
    lastPaidMonth,
    isPaidCurrentMonth,
    onStayAndRenew,
    onContinueWithoutChange
}) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            animation: 'fadeIn 0.25s ease-out'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '480px',
                background: '#18181b',
                border: '2px solid rgba(255, 152, 0, 0.5)',
                borderRadius: '24px',
                padding: '2rem 1.75rem',
                boxShadow: '0 20px 60px rgba(255, 152, 0, 0.25)',
                textAlign: 'center',
                color: '#fff',
                position: 'relative',
                animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
                <style>{`
                    @keyframes pulseWarning {
                        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.6); }
                        70% { transform: scale(1.08); box-shadow: 0 0 0 16px rgba(255, 152, 0, 0); }
                        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 152, 0, 0); }
                    }
                    @keyframes scaleUp {
                        from { transform: scale(0.92); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }
                `}</style>

                {/* Pulsing Warning Icon */}
                <div style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '50%',
                    background: 'rgba(255, 152, 0, 0.18)',
                    border: '2px solid rgba(255, 152, 0, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.25rem',
                    color: '#ff9800',
                    animation: 'pulseWarning 2s infinite ease-in-out'
                }}>
                    <AlertTriangle size={36} />
                </div>

                {/* Role Badge */}
                <div style={{
                    display: 'inline-block',
                    padding: '3px 12px',
                    borderRadius: '50px',
                    background: 'rgba(0, 173, 181, 0.15)',
                    border: '1px solid rgba(0, 173, 181, 0.3)',
                    color: '#00adb5',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    marginBottom: '0.75rem'
                }}>
                    Напомняне за Модератор
                </div>

                {/* Main Heading */}
                <h3 style={{
                    fontSize: '1.4rem',
                    fontWeight: 900,
                    margin: '0 0 0.75rem 0',
                    color: '#ff9800',
                    letterSpacing: '-0.5px'
                }}>
                    НЕ Е НАПРАВЕНА ПРОМЯНА!
                </h3>

                {/* Description */}
                <p style={{
                    fontSize: '0.95rem',
                    color: 'rgba(255, 255, 255, 0.85)',
                    lineHeight: 1.5,
                    margin: '0 0 1.25rem 0'
                }}>
                    {reason === 'timeout' ? (
                        <>Изминаха <strong>20 секунди</strong> от влизането в картата, без да бъде направено подновяване на абонамент или друга промяна.</>
                    ) : (
                        <>Опитвате се да излезете / натиснахте бутон, преди да направите <strong>бързо подновяване</strong> или промяна по тази карта.</>
                    )}
                </p>

                {/* Card summary box */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '0.9rem 1.1rem',
                    textAlign: 'left',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    fontSize: '0.85rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Клиент:</span>
                        <span style={{ fontWeight: 800, color: '#fff' }}>{clientName}</span>
                    </div>
                    {cardNumber && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Карта №:</span>
                            <span style={{ fontWeight: 700, color: '#00adb5' }}>{cardNumber}</span>
                        </div>
                    )}
                    {clientRoute && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Маршрут:</span>
                            <span style={{ fontWeight: 700, color: '#fff' }}>{clientRoute}</span>
                        </div>
                    )}
                    {lastPaidMonth && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Последен платен месец:</span>
                            <span style={{ fontWeight: 800, color: isPaidCurrentMonth ? '#00e676' : '#ff5252' }}>
                                {lastPaidMonth} {isPaidCurrentMonth ? '(Платен)' : '(НЕ Е ПЛАТЕН)'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button
                        onClick={onStayAndRenew}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            borderRadius: '14px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #00e676 0%, #00b0ff 100%)',
                            color: '#000',
                            fontWeight: 900,
                            fontSize: '1rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.6rem',
                            boxShadow: '0 8px 24px rgba(0, 230, 118, 0.3)',
                            transition: 'transform 0.15s ease'
                        }}
                    >
                        <RefreshCw size={18} />
                        Върни се и направи подновяване
                    </button>

                    <button
                        onClick={onContinueWithoutChange}
                        style={{
                            width: '100%',
                            padding: '0.85rem',
                            borderRadius: '14px',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        Продължи без промяна (Само преглед)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ModeratorInactivityWarningModal;
