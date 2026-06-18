import React from 'react';
import { MIXED_METHOD } from '../data/paymentMethods';

const BUTTONS: { key: string; label: string }[] = [
    { key: 'В брой', label: '💵 В брой' },
    { key: 'С карта', label: '💳 С карта' },
    { key: 'Банка', label: '🏛️ Банка' },
    { key: 'Смесено', label: '🔀 Смесено' },
];

interface Props {
    value: string;
    onChange: (method: string) => void;
    /** Bank part of a mixed payment (string from the input). */
    bankAmount: string;
    /** Cash part of a mixed payment (string from the input). */
    cashAmount: string;
    onBankAmountChange: (v: string) => void;
    onCashAmountChange: (v: string) => void;
    /** Background colour of the selected button. */
    activeColor?: string;
    /** Container background. */
    surface?: string;
}

/**
 * Payment-method selector. The first three options are simple (cash / card /
 * bank). The fourth, "Смесено" (mixed), reveals two amount inputs so the operator
 * can split the payment between bank transfer and cash. When mixed is used the
 * stored amount equals bankAmount + cashAmount.
 */
const PaymentMethodSelector: React.FC<Props> = ({
    value, onChange, bankAmount, cashAmount, onBankAmountChange, onCashAmountChange,
    activeColor = 'var(--primary-color)', surface = 'rgba(0,0,0,0.2)',
}) => {
    const isMixed = value === MIXED_METHOD;
    const total = (Number(bankAmount) || 0) + (Number(cashAmount) || 0);

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '0.6rem', borderRadius: '6px',
        background: 'rgba(0,0,0,0.25)', border: '1px solid var(--surface-border)', color: '#fff', outline: 'none',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', background: surface, padding: '4px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                {BUTTONS.map(b => (
                    <button
                        key={b.key}
                        type="button"
                        onClick={() => onChange(b.key)}
                        style={{
                            flex: '1 1 40%', minWidth: '88px', padding: '0.6rem', borderRadius: '6px', border: 'none',
                            background: value === b.key ? activeColor : 'transparent',
                            color: '#fff', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s ease', fontSize: '0.85rem',
                        }}
                    >
                        {b.label}
                    </button>
                ))}
            </div>

            {isMixed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: surface, borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>🏛️ По банка (€)</label>
                            <input type="number" step="0.01" min="0" value={bankAmount} onChange={e => onBankAmountChange(e.target.value)} style={inputStyle} placeholder="0.00" />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>💵 В брой (€)</label>
                            <input type="number" step="0.01" min="0" value={cashAmount} onChange={e => onCashAmountChange(e.target.value)} style={inputStyle} placeholder="0.00" />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: activeColor, textAlign: 'right' }}>Общо: {total.toFixed(2)} €</div>
                </div>
            )}
        </div>
    );
};

export default PaymentMethodSelector;
