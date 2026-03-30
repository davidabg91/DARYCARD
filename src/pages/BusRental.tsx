import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { 
    Bus, Users, Send, 
    CheckCircle, ShieldCheck, Clock, Star, 
    ArrowRight, Info
} from 'lucide-react';

const BusRental: React.FC = () => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [date, setDate] = useState('');
    const [passengers, setPassengers] = useState('');
    const [destination, setDestination] = useState('');
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const formRef = useRef<HTMLElement>(null);

    const scrollToForm = () => {
        formRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !phone || !destination) return;

        setStatus('submitting');
        try {
            await addDoc(collection(db, 'rentals'), {
                name: name.trim(),
                phone: phone.trim(),
                date,
                passengers,
                destination: destination.trim(),
                timestamp: new Date().toISOString(),
                status: 'new'
            });
            setStatus('success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // Reset form
            setName('');
            setPhone('');
            setDate('');
            setPassengers('');
            setDestination('');
        } catch (error) {
            console.error('Error submitting rental inquiry:', error);
            setStatus('error');
            alert('Възникна грешка при изпращането. Моля, опитайте отново или се свържете с нас по телефона.');
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
                    <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginBottom: '1rem' }}>Запитването е изпратено!</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '2rem' }}>
                        Благодарим Ви! Наш представител ще се свърже с Вас възможно най-скоро с индивидуална оферта.
                    </p>
                    <button 
                        onClick={() => setStatus('idle')}
                        style={{ 
                            padding: '1rem 2rem', borderRadius: '16px', background: '#ff5252', color: '#fff',
                            fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.3s ease',
                            boxShadow: '0 8px 16px rgba(255,82,82,0.3)'
                        }}
                    >
                        Ново запитване
                    </button>
                </div>
            </div>
        );
    }

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '6rem' }}>
            {/* Hero Section */}
            <section style={{ 
                position: 'relative', height: '70vh', minHeight: '500px', width: '100%', 
                overflow: 'hidden', display: 'flex', 
                alignItems: 'center', justifyContent: 'center' 
            }}>
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'url(/bus_rental_hero.png) center/cover no-repeat',
                    filter: 'brightness(0.5)'
                }} />
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'linear-gradient(to bottom, rgba(26,26,26,0.2) 0%, rgba(26,26,26,0.8) 100%)'
                }} />
                
                <div style={{ 
                    position: 'relative', zIndex: 2, textAlign: 'center', padding: '0 1.5rem', 
                    maxWidth: '1000px', animation: 'fadeIn 0.8s ease-out' 
                }}>
                    <div style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem', 
                        padding: '0.5rem 1rem', borderRadius: '50px', background: 'rgba(255,82,82,0.1)', 
                        border: '1px solid rgba(255,82,82,0.3)', color: '#ff5252',
                        fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', 
                        letterSpacing: '0.15em', marginBottom: '1.5rem'
                    }}>
                        <Star size={14} fill="#ff5252" /> Премиум Обслужване
                    </div>
                    <h1 style={{ 
                        fontSize: 'clamp(2.5rem, 8vw, 5rem)', fontWeight: 900, color: '#fff', 
                        lineHeight: 1.1, marginBottom: '1.5rem', letterSpacing: '-0.03em',
                        textShadow: '0 10px 30px rgba(0,0,0,0.5)'
                    }}>
                        Вашето събитие заслужава <span style={{ color: '#ff5252' }}>най-доброто</span>
                    </h1>
                    <p style={{ 
                        fontSize: 'clamp(1.1rem, 2vw, 1.4rem)', color: 'rgba(255,255,255,0.8)', 
                        maxWidth: '700px', margin: '0 auto 2.5rem', lineHeight: 1.6
                    }}>
                        От малки групи до големи корпоративни събития – предлагаме луксозен транспорт с шофьор, 
                        съобразен изцяло с вашите изисквания.
                    </p>
                    <button 
                        onClick={scrollToForm}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '1rem',
                            padding: '1.2rem 2.5rem', borderRadius: '18px', background: '#ff5252',
                            color: '#fff', fontWeight: 800, fontSize: '1.1rem', transition: 'all 0.3s ease',
                            boxShadow: '0 15px 30px rgba(255,82,82,0.3)', textTransform: 'uppercase',
                            cursor: 'pointer'
                        }}
                    >
                        Направи запитване <ArrowRight size={20} />
                    </button>
                </div>
            </section>

            {/* Fleet Info Section */}
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '6rem 1.5rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 850, marginBottom: '1rem' }}>Нашият <span style={{ color: '#ff5252' }}>Автопарк</span></h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.1rem' }}>Разполагаме с разнообразие от модерни автобуси за всякакви нужди</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                    {[
                        {
                            title: 'Микробуси',
                            description: 'Перфектни за летищни трансфери, малки групи и ВИП клиенти.',
                            capacity: '8 - 20 места',
                            icon: <Users size={32} color="#ff5252" />,
                            features: ['Луксозен интериор', 'AC', 'Трансфери']
                        },
                        {
                            title: 'Средни Автобуси',
                            description: 'Оптимален избор за корпоративни пътувания, тимбилдинги и сватби.',
                            capacity: '21 - 45 места',
                            icon: <Bus size={32} color="#ff5252" />,
                            features: ['Удобни седалки', 'Багажно отделение', 'TV']
                        },
                        {
                            title: 'Големи Автобуси',
                            description: 'За мащабни екскурзии, училищни мероприятия и големи делегации.',
                            capacity: '46 - 75 места',
                            icon: <div style={{ transform: 'scale(1.2)' }}><Bus size={32} color="#ff5252" /></div>,
                            features: ['Панорамен изглед', 'Toilet', 'Max Comfort']
                        }
                    ].map((item, idx) => (
                        <div key={idx} style={{
                            padding: isMobile ? '1.5rem' : '2.5rem', borderRadius: '30px', background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)',
                            display: 'flex', flexDirection: 'column', gap: '1.5rem',
                            transition: 'transform 0.3s ease, border-color 0.3s ease'
                        }} className="fleet-card">
                            <div style={{ 
                                width: '64px', height: '64px', borderRadius: '18px', 
                                background: 'rgba(255,82,82,0.1)', display: 'flex', 
                                alignItems: 'center', justifyContent: 'center' 
                            }}>
                                {item.icon}
                            </div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{item.title}</h3>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ff5252' }}>
                                {item.capacity}
                            </div>
                            <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{item.description}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: 'auto' }}>
                                {item.features.map((f, i) => (
                                    <span key={i} style={{ 
                                        padding: '0.4rem 0.8rem', borderRadius: '8px', 
                                        background: 'rgba(255,255,255,0.05)', fontSize: '0.75rem', 
                                        fontWeight: 600, color: 'rgba(255,255,255,0.8)' 
                                    }}>{f}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Why Us Section */}
            <section style={{ background: 'rgba(0,0,0,0.2)', padding: '6rem 1.5rem' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '4rem' }}>
                    {[
                        { icon: <ShieldCheck size={40} />, title: 'Сигурност', text: 'Всички наши превозни средства преминават редовни технически прегледи и застраховки.' },
                        { icon: <Clock size={40} />, title: 'Коректност', text: 'Точност и професионализъм са нашитe основни принципи при всяко изпълнение.' },
                        { icon: <Star size={40}/>, title: 'Опитни Шофьори', text: 'Нашите шофьори са доказани професионалисти с дългогодишен опит в туризма.' }
                    ].map((feature, i) => (
                        <div key={i} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ color: '#ff5252', marginBottom: '0.5rem' }}>{feature.icon}</div>
                            <h4 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{feature.title}</h4>
                            <p style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, fontSize: '0.95rem' }}>{feature.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Inquiry Form Section */}
            <section ref={formRef} id="inquiry-form" style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '4rem 1rem' : '8rem 1.5rem' }}>
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))', 
                    gap: isMobile ? '0' : '4rem', 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: isMobile ? '24px' : '40px', 
                    border: '1px solid rgba(255,255,255,0.06)', 
                    overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.4)'
                }}>
                    {/* Left Side: Info */}
                    <div style={{ padding: isMobile ? '2.5rem 1.25rem' : '4rem', background: 'linear-gradient(135deg, rgba(229,57,53,0.1) 0%, rgba(26,26,26,0) 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <h2 style={{ fontSize: isMobile ? '1.8rem' : '2.5rem', fontWeight: 900, marginBottom: '1rem', lineHeight: 1.2 }}>Потърсете ни за <span style={{ color: '#ff5252' }}>оферта</span></h2>
                        <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, fontSize: isMobile ? '0.95rem' : '1.1rem', marginBottom: '2rem' }}>
                            Попълнете формата и ще получите индивидуално ценово предложение, съобразено с вашите нужди, километраж и продължителност на наемане.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff5252', flexShrink: 0 }}><Info size={16}/></div>
                                <span style={{ fontWeight: 600, fontSize: isMobile ? '0.85rem' : '1rem' }}>Индивидуален подход за всяко събитие</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff5252', flexShrink: 0 }}><Clock size={16}/></div>
                                <span style={{ fontWeight: 600, fontSize: isMobile ? '0.85rem' : '1rem' }}>Бърз отговор до няколко часа</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Form */}
                    <div style={{ padding: isMobile ? '2rem 1.25rem' : '4rem', background: 'rgba(255,255,255,0.01)' }}>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '0.8rem' : '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '0.25rem' }}>Вашето Име</label>
                                    <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Име Фамилия" style={{ padding: '0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '0.25rem' }}>Телефон</label>
                                    <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08XX XXX XXX" style={{ padding: '0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '1rem', outline: 'none', width: '100%', maxWidth: '350px' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '0.8rem' : '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '0.25rem' }}>Дата</label>
                                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: '0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '1rem', outline: 'none' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '0.25rem' }}>Брой Пътници</label>
                                    <input type="number" value={passengers} onChange={(e) => setPassengers(e.target.value)} placeholder="напр. 35" style={{ padding: '0.9rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '1rem', outline: 'none' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Дестинация и Детайли</label>
                                <textarea required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Откъде до къде, продължителност..." style={{ padding: '1rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', fontSize: '1rem', minHeight: '100px', outline: 'none', resize: 'vertical' }} />
                            </div>

                            <button type="submit" disabled={status === 'submitting'} style={{ padding: '1.2rem', borderRadius: '14px', background: '#ff5252', color: '#fff', fontWeight: 800, fontSize: '1.1rem', cursor: status === 'submitting' ? 'not-allowed' : 'pointer', border: 'none', transition: 'all 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', boxShadow: '0 10px 30px rgba(255,82,82,0.2)' }}>
                                {status === 'submitting' ? 'ИЗПРАЩАНЕ...' : (
                                    <>
                                        <Send size={18} /> ПОЛУЧИ ОФЕРТА
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default BusRental;
