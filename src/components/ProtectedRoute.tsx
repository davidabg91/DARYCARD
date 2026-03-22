import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import type { UserRole } from '../types/auth';

interface Props {
    children: React.ReactNode;
    requiredRole?: UserRole;
}

const ProtectedRoute: React.FC<Props> = ({ children, requiredRole }) => {
    const { currentUser, loading } = useAuth();

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid rgba(0, 173, 181, 0.2)', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    if (!currentUser.role) {
        return (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#fff', background: 'var(--bg-color)', minHeight: '100vh' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
                <h2 style={{ color: '#ff5252', marginBottom: '0.5rem' }}>Достъпът е ограничен</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Вашият акаунт все още не е одобрен от администратор.</p>
                <div style={{ display: 'inline-block', padding: '0.5rem 1rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.85rem' }}>
                    Свържете се с началник смяна за активиране на профила.
                </div>
            </div>
        );
    }

    if (requiredRole === 'admin' && currentUser.role !== 'admin') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#fff', background: 'var(--bg-color)', minHeight: '100vh' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
                <h2 style={{ color: '#ff5252', marginBottom: '0.5rem' }}>Забранен достъп</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Нямате администраторски права за тази секция.</p>
            </div>
        );
    }

    return <>{children}</>;
};

export default ProtectedRoute;
