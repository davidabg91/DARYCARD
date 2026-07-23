import React from 'react';
import { Shield, FileText, Info, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const Legal: React.FC = () => {
    return (
        <div style={{ 
            minHeight: '100vh', 
            background: 'var(--bg-color)',
            color: '#fff',
            padding: '2rem 1rem',
            fontFamily: 'var(--font-family)'
        }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                <Link 
                    to="/" 
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem', 
                        color: 'rgba(255,255,255,0.5)', 
                        textDecoration: 'none',
                        marginBottom: '2rem',
                        fontWeight: 600,
                        fontSize: '0.9rem'
                    }}
                >
                    <ArrowLeft size={16} /> Обратно към Начало
                </Link>

                <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '3rem', textAlign: 'center' }}>
                    Правна Информация
                </h1>

                {/* Section: Imprint */}
                <section style={{ 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: '24px', 
                    padding: '2rem',
                    border: '1px solid rgba(255,255,255,0.05)',
                    marginBottom: '2rem',
                    backdropFilter: 'blur(10px)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', color: '#ff5252' }}>
                        <Info size={24} />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Данни за Фирмата</h2>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <div>
                            <div style={{ opacity: 0.5, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Наименование</div>
                            <div style={{ fontWeight: 600 }}>„ДАРИ КОМЕРС - НА“ ООД</div>
                        </div>
                        <div>
                            <div style={{ opacity: 0.5, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>ЕИК/ДДС</div>
                            <div style={{ fontWeight: 600 }}>BG114601542</div>
                        </div>
                        <div>
                            <div style={{ opacity: 0.5, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Седалище и Адрес</div>
                            <div style={{ fontWeight: 600 }}>гр. Плевен, ул. ДАНАИЛ ПОПОВ 12</div>
                        </div>
                        <div>
                            <div style={{ opacity: 0.5, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Управител</div>
                            <div style={{ fontWeight: 600 }}>ДАРИНКА ЦВЕТАНОВА КРЪСТЕВА</div>
                        </div>
                    </div>
                </section>

                {/* Section: Privacy Policy */}
                <section style={{ 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: '24px', 
                    padding: '2rem',
                    border: '1px solid rgba(255,255,255,0.05)',
                    marginBottom: '2rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', color: '#00e676' }}>
                        <Shield size={24} />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Политика за Поверителност (GDPR)</h2>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <p>Ние, <strong>„ДАРИ КОМЕРС - НА“ ООД</strong> (ЕИК 114601542), в качеството си на <strong>администратор на лични данни</strong>, уважаваме Вашата неприкосновеност и се ангажираме със защитата на Вашите лични данни съгласно Регламент (ЕС) 2016/679 (GDPR) и Закона за защита на личните данни (ЗЗЛД).</p>

                        <div>
                            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>1. Какви данни събираме?</h4>
                            <ul style={{ paddingLeft: '1.2rem' }}>
                                <li>Уникален идентификатор на Вашата NFC карта.</li>
                                <li>История на валидациите (линия, дата и точен час).</li>
                                <li>Токени за уеб известия (ако сте дали съгласие).</li>
                                <li>При издаване на персонална карта на наше гише: име, адрес и снимка на притежателя, вид на картата и данни за платените абонаменти.</li>
                                <li>При подаване на сигнал или запитване за наем: име и данни за контакт (телефон, имейл), които сами сте предоставили.</li>
                            </ul>
                        </div>

                        <div>
                            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>2. Цел на обработването</h4>
                            <p>Данните се използват единствено за нуждите на транспортната услуга: издаване и контрол на абонаментните карти, контрол на редовността на пътниците, анализ на натовареността на линиите, обработка на подадени сигнали и запитвания, и техническа поддръжка на системата.</p>
                        </div>

                        <div>
                            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>3. Правно основание</h4>
                            <ul style={{ paddingLeft: '1.2rem' }}>
                                <li><strong>Изпълнение на договор</strong> (чл. 6, ал. 1, б. „б“ GDPR) — за издаването и обслужването на Вашата абонаментна карта.</li>
                                <li><strong>Съгласие</strong> (чл. 6, ал. 1, б. „а“ GDPR) — за уеб известията, както и за обработката на данните, подадени чрез формите за сигнали и наем.</li>
                                <li><strong>Законен интерес</strong> (чл. 6, ал. 1, б. „е“ GDPR) — за анализ на натовареността и предотвратяване на злоупотреби с карти.</li>
                            </ul>
                        </div>

                        <div>
                            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>4. Срок на съхранение</h4>
                            <p>Данните за картите и абонаментите се съхраняват за срока на действие на картата и до 5 години след това с оглед на счетоводни и данъчни изисквания. Данните от подадени сигнали и запитвания се съхраняват до приключване на съответната преписка и разумен срок след това. След изтичане на съответния срок данните се изтриват или анонимизират.</p>
                        </div>

                        <div>
                            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>5. Получатели и обработващи</h4>
                            <p>Не продаваме и не предоставяме Вашите данни на трети лица за маркетинг. За техническото функциониране на системата ползваме услугите на <strong>Google Firebase (Google Ireland Ltd.)</strong> като обработващ лични данни, със сървъри в рамките на Европейския съюз. Данните се предават криптирано.</p>
                        </div>

                        <div>
                            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>6. Вашите права</h4>
                            <p>Съгласно GDPR имате право на: достъп до Вашите данни, коригиране, изтриване („право да бъдете забравени“), ограничаване на обработването, преносимост, възражение срещу обработването, както и оттегляне на дадено съгласие по всяко време (без това да засяга законосъобразността на обработването преди оттеглянето).</p>
                            <p style={{ marginTop: '0.75rem' }}>За да упражните тези права, можете да се свържете с нас писмено на адреса на управление, посочен по-горе в раздел „Данни за Фирмата“.</p>
                            <p style={{ marginTop: '0.75rem' }}>Имате право и на жалба до надзорния орган — <strong>Комисия за защита на личните данни (КЗЛД)</strong>, гр. София 1592, бул. „Проф. Цветан Лазаров“ № 2, интернет страница <span style={{ color: 'var(--primary-color)' }}>www.cpdp.bg</span>.</p>
                        </div>
                    </div>
                </section>

                {/* Section: Terms of Service */}
                <section style={{ 
                    background: 'rgba(255,255,255,0.02)', 
                    borderRadius: '24px', 
                    padding: '2rem',
                    border: '1px solid rgba(255,255,255,0.05)',
                    marginBottom: '4rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', color: '#2979ff' }}>
                        <FileText size={24} />
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Общи Условия</h2>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <p>Настоящите условия уреждат ползването на платформата DARY CARD за дигитален транспортен контрол.</p>
                        
                        <div>
                            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>1. Валидация на карти</h4>
                            <p>Всеки пътник е длъжен да валидира своята NFC карта при качване в автобуса чрез сканиране на устройството на шофьора.</p>
                        </div>

                        <div>
                            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>2. Абонаменти</h4>
                            <p>Абонаментите са лични. Предоставянето на карта на трети лица може да доведе до нейната блокировка и анулиране на абонамента без право на обезщетение.</p>
                        </div>

                        <div>
                            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>3. Отговорност</h4>
                            <p>Транспортната компания не носи отговорност за технически повреди в персоналните мобилни устройства на потребителите. При невъзможност за проверка на дигиталната карта, пътникът се счита за нередовен.</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Legal;
