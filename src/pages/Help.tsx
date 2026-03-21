import React from 'react';
import { HelpCircle, PlusCircle, RefreshCw, List, CheckCircle, XCircle, Search, User } from 'lucide-react';
import Card from '../components/Card';

const Help: React.FC = () => {
    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', animation: 'fadeIn 0.4s ease', padding: '1rem' }}>
            <style>{`
                @media (max-width: 768px) {
                    .help-grid { grid-template-columns: 1fr !important; }
                    .step-number { font-size: 2rem !important; }
                    .highlight-box { padding: 1.5rem !important; }
                }
                .step-card {
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .step-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                }
            `}</style>

            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 900, marginBottom: '1rem', color: '#fff' }}>
                    <HelpCircle size={40} color="var(--primary-color)" style={{ verticalAlign: 'middle', marginRight: '10px' }} />
                    Как да работим със сайта?
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: '700px', margin: '0 auto' }}>
                    Тук ще научиш всичко необходимо, за да обслужваш клиентите бързо и лесно!
                </p>
            </div>

            {/* Златното Правило - HERO SECTION */}
            <div style={{ 
                background: 'linear-gradient(135deg, rgba(255,160,0,0.1), rgba(255,193,7,0.02))', 
                padding: '3.5rem 2rem', 
                borderRadius: '30px', 
                marginBottom: '4rem', 
                border: '1px solid rgba(255,160,0,0.2)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Декорация */}
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'var(--accent-color)', opacity: 0.05, borderRadius: '50%', filter: 'blur(40px)' }}></div>
                
                <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-color)', fontWeight: 900, fontSize: '2.5rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Златното Правило!
                </h2>
                <p style={{ margin: '0 0 2rem 0', fontSize: '1rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                    (за създаване на нова карта или подновяване за другия месец)
                </p>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <p style={{ margin: '0 0 1.5rem 0', fontSize: '1.4rem', lineHeight: '1.5', color: '#fff', fontWeight: 700 }}>
                        НАЙ-ЛЕСНИЯТ НАЧИН Е ПРОСТО ДА <br/>
                        <span style={{ fontSize: '2rem', color: 'var(--primary-color)' }}>СКАНИРАТЕ КАРТАТА!</span>
                    </p>
                    <p style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)' }}>
                        Можеш да я сканираш дори когато телефонът ти е на начален екран.
                    </p>
                    <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        padding: '10px 20px', 
                        background: 'rgba(255,82,82,0.1)', 
                        borderRadius: '12px',
                        border: '1px solid rgba(255,82,82,0.2)',
                        color: '#ff5252',
                        fontWeight: 800,
                        fontSize: '1rem'
                    }}>
                        <HelpCircle size={18} /> ВАЖНО: Трябва да си вписан в профила си, за да правиш промени!
                    </div>
                </div>
            </div>

            {/* Scanning Steps */}
            <div className="help-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '4rem' }}>
                <div style={{ background: 'rgba(0, 200, 83, 0.05)', padding: '2rem', borderRadius: '24px', border: '1px solid rgba(0, 200, 83, 0.1)' }}>
                    <h3 style={{ color: '#00c853', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', fontSize: '1.2rem', fontWeight: 800 }}>
                        <PlusCircle size={20} /> НОВА КАРТА (Регистрация)
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#00c853', fontWeight: 900 }}>1.</div>
                            <div><b>Сканирайте</b> чистата карта с телефона.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#00c853', fontWeight: 900 }}>2.</div>
                            <div>Системата сама ще ви отвори формата <b>"ДОБАВИ"</b>.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#00c853', fontWeight: 900 }}>3.</div>
                            <div>Попълнете имената и направете <b>СНИМКА</b>.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#00c853', fontWeight: 900 }}>4.</div>
                            <div>Натиснете <b>ЗАПАЗИ</b> и картата е готова!</div>
                        </div>
                    </div>
                </div>

                <div style={{ background: 'rgba(0, 173, 181, 0.05)', padding: '2rem', borderRadius: '24px', border: '1px solid rgba(0, 173, 181, 0.1)' }}>
                    <h3 style={{ color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', fontSize: '1.2rem', fontWeight: 800 }}>
                        <RefreshCw size={20} /> СТАРА КАРТА (Подновяване)
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: 'var(--primary-color)', fontWeight: 900 }}>1.</div>
                            <div><b>Сканирайте</b> картата на клиента.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: 'var(--primary-color)', fontWeight: 900 }}>2.</div>
                            <div>Системата ще отвори неговия <b>ПРОФИЛ</b> веднага.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: 'var(--primary-color)', fontWeight: 900 }}>3.</div>
                            <div>Горе вдясно натиснете бутона <b> "Управление" </b>.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: 'var(--primary-color)', fontWeight: 900 }}>4.</div>
                            <div>Изберете <b>МЕСЕЦ</b>, сума и натиснете <b>ПОДНОВИ</b>.</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Ръчно управление (Manual Entry) */}
            <div style={{ marginBottom: '2.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px dashed rgba(255,255,255,0.2)' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff', fontSize: '1.2rem', fontWeight: 800 }}>Ръчно управление (без карта)</h3>
                <p style={{ margin: 0, opacity: 0.8, lineHeight: '1.5' }}>
                    Ако вече имате <b>данните на клиента и неговия код (ID)</b>, можете да ползвате долните два панела директно, <b>без да е нужно картата да е пред вас</b>. Просто въведете кода ръчно в полето за ID.
                </p>
            </div>

            <div className="help-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem' }}>
                
                {/* Стъпка 1: Добавяне */}
                <Card className="step-card" style={{ padding: '2rem', borderTop: '6px solid #00c853' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0, color: '#00c853', fontSize: '1.5rem', fontWeight: 800 }}>
                            <PlusCircle size={24} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            Добави нов клиент
                        </h3>
                        <span className="step-number" style={{ fontSize: '3rem', fontWeight: 900, opacity: 0.1, lineHeight: 1 }}>1</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#00c853', fontWeight: 900 }}>❶</div>
                            <div>Отиди на таб <b>"ДОБАВИ"</b>.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#00c853', fontWeight: 900 }}>❷</div>
                            <div>Сканирай картата <b>ИЛИ</b> напиши кода ѝ ръчно в полето.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#00c853', fontWeight: 900 }}>❸</div>
                            <div>Направи <b>СНИМКА</b> на човека (много е важно!).</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#00c853', fontWeight: 900 }}>❹</div>
                            <div>Напиши <b>Имена</b> и избери неговия <b>Маршрут</b>.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#00c853', fontWeight: 900 }}>❺</div>
                            <div>Натисни големия бутон <b>"ЗАПАЗИ"</b>.</div>
                        </div>
                    </div>
                </Card>

                {/* Стъпка 2: Подновяване */}
                <Card className="step-card" style={{ padding: '2rem', borderTop: '6px solid var(--primary-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0, color: 'var(--primary-color)', fontSize: '1.5rem', fontWeight: 800 }}>
                            <RefreshCw size={24} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            Поднови карта
                        </h3>
                        <span className="step-number" style={{ fontSize: '3rem', fontWeight: 900, opacity: 0.1, lineHeight: 1 }}>2</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Ако клиентът вече има карта, но е изтекла:</p>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: 'var(--primary-color)', fontWeight: 900 }}>❶</div>
                            <div>Намери го в списъка <b>"КЛИЕНТИ"</b> (ползвай търсачката).</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: 'var(--primary-color)', fontWeight: 900 }}>❷</div>
                            <div>Кликни на бутона <b>"Управление"</b> до името му.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: 'var(--primary-color)', fontWeight: 900 }}>❸</div>
                            <div>Натисни бутона <b>"ПОДНОВИ"</b>.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: 'var(--primary-color)', fontWeight: 900 }}>❹</div>
                            <div>Избери <b>МЕСЕЦА</b> и сумата и готово!</div>
                        </div>
                    </div>
                </Card>

                {/* Анулиране (Cancellation) */}
                <Card className="step-card" style={{ padding: '2rem', borderTop: '6px solid #ff1744' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ff1744', marginBottom: '1.5rem', fontSize: '1.3rem', fontWeight: 800 }}>
                        <XCircle size={22} /> Как се спира (анулира) карта?
                    </h3>
                    <p style={{ lineHeight: '1.6', marginBottom: '1.2rem' }}>
                        Ако искате да спрете картата на клиент веднага:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#ff1744', fontWeight: 900 }}>1.</div>
                            <div>Отиди на <b>"Управление"</b> до името на клиента.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#ff1744', fontWeight: 900 }}>2.</div>
                            <div>Влез в таб <b>"Действие"</b>.</div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ color: '#ff1744', fontWeight: 900 }}>3.</div>
                            <div>Натисни червения бутон <b>"Анулирай Абонамент"</b>.</div>
                        </div>
                    </div>
                    <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        *Това ще направи картата <b>НЕВАЛИДНА</b> и шофьорът ще види червен сигнал.
                    </p>
                </Card>

                {/* Търсене */}
                <Card className="step-card" style={{ padding: '2rem', background: 'rgba(255,255,255,0.02)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-color)', marginBottom: '1.5rem', fontSize: '1.3rem' }}>
                        <Search size={22} /> Как да намираме хора?
                    </h3>
                    <p style={{ lineHeight: '1.6' }}>
                        В таб <b>"КЛИЕНТИ"</b> има кутийка за търсене. Можеш да пишеш: <br/>
                        • Имената на човека <br/>
                        • Името на селото/маршрута му <br/>
                        • Кода на картата му (ID) <br/>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Сайтът е умен и ще ти покаже резултатите веднага!</span>
                    </p>
                </Card>

                {/* Цветове */}
                <Card className="step-card" style={{ padding: '2rem', background: 'rgba(255,255,255,0.02)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#fff', marginBottom: '1.5rem', fontSize: '1.3rem' }}>
                        <List size={22} /> Какво значат цветовете?
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <CheckCircle size={20} color="#00c853" />
                            <span><b>ЗЕЛЕНО</b> – Всичко е платено, може да пътува!</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <XCircle size={20} color="#ff1744" />
                            <span><b>ЧЕРВЕНО</b> – Картата е изтекла, трябва да плати.</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <User size={20} color="var(--primary-color)" />
                            <span><b>Иконата със снимка</b> – Винаги проверявай дали снимката отговаря на човека.</span>
                        </div>
                    </div>
                </Card>

            </div>

            <div style={{ marginTop: '4rem', textAlign: 'center', padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px' }}>
                <h4 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>Имаш още въпроси?</h4>
                <p style={{ margin: '0 0 1rem 0', opacity: 0.6 }}>Попитай администратора за допълнителна помощ.</p>
                <a href="tel:0876141826" style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    background: 'var(--primary-color)', 
                    color: '#fff', 
                    padding: '0.8rem 1.5rem', 
                    borderRadius: '50px', 
                    textDecoration: 'none', 
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    boxShadow: '0 5px 15px rgba(0, 173, 181, 0.3)'
                }}>
                    Позвъни на 0876141826
                </a>
            </div>
        </div>
    );
};

export default Help;
