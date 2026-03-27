import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { AlertCircle, CheckCircle, Send, MessageSquare, Phone, Mail, User } from 'lucide-react';

const Signal: React.FC = () => {
    const [type, setType] = useState<'complaint' | 'suggestion'>('complaint');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setStatus('submitting');
        try {
            await addDoc(collection(db, 'signals'), {
                type,
                name: name.trim() || 'Анонимен',
                phone: phone.trim() || 'N/A',
                email: email.trim() || 'N/A',
                message: message.trim(),
                timestamp: new Date().toISOString(),
                status: 'new'
            });
            setStatus('success');
            // Reset form
            setName('');
            setPhone('');
            setEmail('');
            setMessage('');
        } catch (error) {
            console.error('Error submitting signal:', error);
            setStatus('error');
        }
    };

    if (status === 'success') {
        return (
            <div style={{ 
                minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' 
            }}>
                <div style={{ 
                    maxWidth: '500px', width: '100%', padding: '3rem 2rem', background: 'rgba(255,255,255,0.03)', 
                    backdropFilter: 'blur(20px)', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.08)',
                    textAlign: 'center', animation: 'fadeIn 0.5s ease'
                }}>
                    <div style={{ 
                        width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(0, 200, 83, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c853',
                        margin: '0 auto 1.5rem', boxShadow: '0 0 30px rgba(0, 200, 83, 0.2)'
                    }}>
                        <CheckCircle size={48} />
                    </div>
                    <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginBottom: '1rem' }}>Успешно подаден сигнал</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '2rem' }}>
                        Вашето съобщение беше изпратено успешно до екипа на DARY. Благодарим ви за обратната връзка!
                    </p>
                    <button 
                        onClick={() => setStatus('idle')}
                        style={{ 
                            padding: '1rem 2rem', borderRadius: '16px', background: '#ff5252', color: '#fff',
                            fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.3s ease',
                            boxShadow: '0 8px 16px rgba(255,82,82,0.3)'
                        }}
                    >
                        Подай нов сигнал
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '80vh', padding: 'clamp(2rem, 5vw, 4rem) 1rem 6rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ maxWidth: '800px', width: '100%', textAlign: 'center', marginBottom: 'clamp(1.5rem, 4vw, 3rem)' }}>
                <h1 style={{ fontSize: 'clamp(2rem, 7vw, 4rem)', fontWeight: 900, marginBottom: '1rem', letterSpacing: '-0.02em', color: '#fff' }}>
                    ПОДАЙ <span style={{ color: '#ff5252' }}>СИГНАЛ</span>
                </h1>
                <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)', maxWidth: '600px', margin: '0 auto', lineHeight: 1.5 }}>
                    Имате оплакване или искате да дадете съвет? Вашето мнение е важна стъпка към подобряване на нашите услуги.
                </p>
            </div>

            <div style={{ 
                maxWidth: '700px', width: '100%', background: 'rgba(255,255,255,0.03)', 
                backdropFilter: 'blur(20px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.08)',
                padding: 'clamp(1.5rem, 5vw, 3rem)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
            }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Signal Type */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'row', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => setType('complaint')}
                            style={{
                                flex: '1 1 150px', padding: '1.1rem', borderRadius: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s ease',
                                background: type === 'complaint' ? 'rgba(255,82,82,0.1)' : 'rgba(255,255,255,0.03)',
                                color: type === 'complaint' ? '#ff5252' : 'rgba(255,255,255,0.4)',
                                border: `2px solid ${type === 'complaint' ? '#ff5252' : 'rgba(255,255,255,0.05)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '0.9rem'
                            }}
                        >
                            <AlertCircle size={18} /> ОПЛАКВАНЕ
                        </button>
                        <button
                            type="button"
                            onClick={() => setType('suggestion')}
                            style={{
                                flex: '1 1 150px', padding: '1.1rem', borderRadius: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.3s ease',
                                background: type === 'suggestion' ? 'rgba(0,145,234,0.1)' : 'rgba(255,255,255,0.03)',
                                color: type === 'suggestion' ? '#0091ea' : 'rgba(255,255,255,0.4)',
                                border: `2px solid ${type === 'suggestion' ? '#0091ea' : 'rgba(255,255,255,0.05)'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '0.9rem'
                            }}
                        >
                            <MessageSquare size={18} /> СЪВЕТ / СЪОБЩЕНИЕ
                        </button>
                    </div>

                    {/* Contact Info Group */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', paddingLeft: '0.5rem', letterSpacing: '0.05em' }}>ИМЕ (ПО ЖЕЛАНИЕ)</label>
                            <div style={{ position: 'relative' }}>
                                <User style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} size={18} />
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Вашето име"
                                    style={{
                                        width: '100%', padding: '0.9rem 1rem 0.9rem 2.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px', color: '#fff', fontSize: '1rem', outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', paddingLeft: '0.5rem', letterSpacing: '0.05em' }}>ТЕЛЕФОН (ПО ЖЕЛАНИЕ)</label>
                            <div style={{ position: 'relative' }}>
                                <Phone style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} size={18} />
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="08XX XXX XXX"
                                    style={{
                                        width: '100%', padding: '0.9rem 1rem 0.9rem 2.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px', color: '#fff', fontSize: '1rem', outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', paddingLeft: '0.5rem', letterSpacing: '0.05em' }}>EMAIL (ПО ЖЕЛАНИЕ)</label>
                        <div style={{ position: 'relative' }}>
                            <Mail style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} size={18} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="example@mail.com"
                                style={{
                                    width: '100%', padding: '0.9rem 1rem 0.9rem 2.8rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px', color: '#fff', fontSize: '1rem', outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {/* Message */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', paddingLeft: '0.5rem', letterSpacing: '0.05em' }}>ОПИСАНИЕ НА СИГНАЛА</label>
                        <textarea
                            required
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Опишете проблема или Вашето предложение..."
                            style={{
                                width: '100%', minHeight: '120px', padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '14px', color: '#fff', fontSize: '1rem', transition: 'all 0.2s ease', resize: 'vertical', lineHeight: 1.5, outline: 'none'
                            }}
                        />
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={status === 'submitting'}
                        style={{
                            width: '100%', padding: '1.1rem', borderRadius: '14px', background: type === 'complaint' ? '#ff5252' : '#0091ea',
                            color: '#fff', fontWeight: 800, fontSize: '1.1rem', cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
                            border: 'none', transition: 'all 0.3s ease', opacity: status === 'submitting' ? 0.7 : 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                            boxShadow: `0 10px 30px ${type === 'complaint' ? 'rgba(255,82,82,0.2)' : 'rgba(0,145,234,0.2)'}`,
                            marginTop: '0.5rem'
                        }}
                    >
                        {status === 'submitting' ? 'ИЗПРАЩАНЕ...' : (
                            <>
                                <Send size={18} /> ИЗПРАТИ СИГНАЛ
                            </>
                        )}
                    </button>

                    {status === 'error' && (
                        <div style={{ 
                            padding: '1rem', borderRadius: '12px', background: 'rgba(255,82,82,0.1)', 
                            border: '1px solid rgba(255,82,82,0.2)', color: '#ff5252', 
                            textAlign: 'center', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                        }}>
                             <AlertCircle size={16} /> Грешка при изпращане. Моля, проверете правата в Firebase!
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default Signal;
