import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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

    if (requiredRole === 'admin' && currentUser.role !== 'admin') {
        return (
            <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
                <h2 style={{ color: 'var(--error-color)', marginBottom: '0.5rem' }}>Забранен достъп</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Нямаш необходимите права за тази страница.</p>
            </div>
        );
    }

    return <>{children}</>;
};

export default ProtectedRoute;
