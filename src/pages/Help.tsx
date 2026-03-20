import React from 'react';
import { HelpCircle, Zap, PlusCircle, Camera, RefreshCw, List } from 'lucide-react';
import Card from '../components/Card';

const Help: React.FC = () => {
    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', animation: 'fadeIn 0.4s ease' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <Card style={{ padding: '2rem' }}>
                    <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary-color)' }}>
                        <HelpCircle size={28} /> Ръководство за Модератори
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1rem', lineHeight: '1.6' }}>
                        Добре дошли в помощния панел. Тук ще намерите подробни инструкции как да обслужвате клиентите и да използвате функциите на системата DARYCARD.
                    </p>

                    <div style={{ padding: '1.5rem', background: 'rgba(0, 173, 181, 0.1)', border: '1px solid rgba(0, 173, 181, 0.2)', borderRadius: '16px', marginBottom: '2.5rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                        <div style={{ background: 'var(--primary-color)', color: '#fff', padding: '0.5rem', borderRadius: '12px', display: 'flex' }}>
                            <Zap size={24} />
                        </div>
                        <div>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary-color)', fontWeight: 800 }}>Бърз съвет за Модератори</h4>
                            <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5', color: 'rgba(255,255,255,0.9)' }}>
                                Най-лесният начин за работа е просто да <b>сканирате физическата карта</b> (нова или на съществуващ клиент), докато сте влезли в системата. 
                                Тя автоматично ще ви отведе към правилното действие — <b>регистрация</b> на нов пътник или <b>подновяване</b> на съществуващ, без да се налага да търсите ръчно в списъците.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <section>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#00c853', marginBottom: '1.2rem' }}>
                                <PlusCircle size={20} /> 1. Регистрация на Нова Карта
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '4px solid #00c853' }}>
                                    <b>Стъпка 1:</b> Отидете в таб <b>"Добави"</b> в горната част на екрана.
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '4px solid #00c853' }}>
                                    <b>Стъпка 2:</b> Сканирайте NFC картата или използвайте предварително генериран линк за активация.
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '4px solid #00c853' }}>
                                    <b>Стъпка 3:</b> Направете снимка на клиента чрез бутона <b>"<Camera size={14} /> Камера"</b>. Това е важно за сигурността.
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '4px solid #00c853' }}>
                                    <b>Стъпка 4:</b> Въведете трите имена и изберете правилния <b>Маршрут (Курс)</b>.
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '4px solid #00c853' }}>
                                    <b>Стъпка 5:</b> Изберете месеца и сумата на плащане, след което натиснете <b>"Запази Клиент"</b>.
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)', marginBottom: '1.2rem' }}>
                                <RefreshCw size={20} /> 2. Подновяване на Абонамент
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '4px solid var(--primary-color)' }}>
                                    <b>Стъпка 1:</b> Намерете клиента в таб <b>"Клиенти"</b> чрез търсачката.
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '4px solid var(--primary-color)' }}>
                                    <b>Стъпка 2:</b> Кликнете върху името на клиента, за да отворите неговия профил.
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '4px solid var(--primary-color)' }}>
                                    <b>Стъпка 3:</b> Отидете на под-таб <b>"Действие"</b> в изскачащия прозорец.
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '4px solid var(--primary-color)' }}>
                                    <b>Стъпка 4:</b> Изберете новия месец и сума, след което натиснете <b>"Поднови Абонамент"</b>.
                                </div>
                            </div>
                        </section>

                        <section style={{ gridColumn: 'span 2' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-color)', marginBottom: '1.2rem' }}>
                                <List size={20} /> 3. Търсене и Филтриране
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                                    <b>Търсене:</b> Можете да търсите едновременно по име, ID на карта или име на маршрут.
                                </div>
                                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                                    <b>Статус на карта:</b> В списъка с клиенти виждате веднага кой е активен (<span style={{color: 'var(--success-color)'}}>Зелен</span>), неактивен (<span style={{color: 'var(--error-color)'}}>Червен</span>) или анулиран.
                                </div>
                            </div>
                        </section>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Help;
