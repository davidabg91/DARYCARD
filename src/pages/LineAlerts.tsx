import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Bell, ArrowLeft } from 'lucide-react';
import PushSubscription from '../components/PushSubscription';
import { ROUTES } from '../data/routeMetadata';
import { routeFromSlug, linePagePath } from '../data/routeSlugs';

/**
 * Известия за една линия.
 *
 * Откакто всяка линия има собствена страница, старият разгъващ се изглед в
 * началната страница не се отваря — а с него изчезна и бутонът за абонамент.
 * Страницата на линията води тук.
 */
const LineAlerts: React.FC = () => {
    const { slug = '' } = useParams();
    const line = routeFromSlug(slug, ROUTES);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-color)', padding: '1.5rem 1rem 3rem' }}>
            <div style={{ maxWidth: '520px', margin: '0 auto' }}>
                <Link
                    to="/"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700 }}
                >
                    <ArrowLeft size={16} /> Начало
                </Link>

                <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.4rem', fontWeight: 900, margin: '1.25rem 0 0.35rem' }}>
                    <Bell size={22} color="var(--primary-color)" />
                    Известия за линията
                </h1>

                {line ? (
                    <>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                            Получавайте съобщение на това устройство при промяна в разписанието или цените
                            по <strong style={{ color: '#fff' }}>{line}</strong>. Можете да ги спрете по всяко време.
                        </p>

                        <PushSubscription courseId={line} />

                        <a
                            href={linePagePath(line)}
                            style={{ display: 'inline-block', marginTop: '1.5rem', color: 'var(--primary-color)', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}
                        >
                            Разписание и цени за {line} →
                        </a>
                    </>
                ) : (
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Такава линия не е намерена. Изберете я от <Link to="/" style={{ color: 'var(--primary-color)' }}>началната страница</Link>.
                    </p>
                )}
            </div>
        </div>
    );
};

export default LineAlerts;
