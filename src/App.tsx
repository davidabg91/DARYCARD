import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { useParams } from 'react-router-dom';

// Lazy load pages
const Landing = lazy(() => import('./pages/Landing'));
const StaffPortal = lazy(() => import('./pages/StaffPortal'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const ClientProfile = lazy(() => import('./pages/ClientProfile'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SystemAdminPanel = lazy(() => import('./pages/SystemAdminPanel'));
const Help = lazy(() => import('./pages/Help'));
const Signal = lazy(() => import('./pages/Signal'));
const BusRental = lazy(() => import('./pages/BusRental'));

// Loading Fallback Component
const PageLoader = () => (
    <div style={{ 
        height: '100vh', 
        width: '100vw', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'var(--bg-color)',
        color: '#fff'
    }}>
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem'
        }}>
            <div style={{
                width: '50px',
                height: '50px',
                border: '3px solid rgba(255, 82, 82, 0.1)',
                borderTop: '3px solid #ff5252',
                borderRadius: '50%',
                animation: 'spin 1s cubic-bezier(0.4, 0, 0.2, 1) infinite'
            }} />
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
            <span style={{ 
                fontSize: '0.8rem', 
                fontWeight: 900, 
                letterSpacing: '4px', 
                textTransform: 'uppercase',
                opacity: 0.5,
                color: '#ff5252'
            }}>Зареждане</span>
        </div>
    </div>
);

function ClientProfileWrapper() {
  const { id } = useParams<{ id: string }>();
  return <ClientProfile key={id} />;
}

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public — no login needed */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/client/:id" element={<Layout />}>
              <Route index element={<ClientProfileWrapper />} />
            </Route>

            {/* App shell */}
            <Route path="/" element={<Layout />}>
              <Route index element={<Landing />} />
              <Route path="signal" element={<Signal />} />
              <Route path="rent" element={<BusRental />} />
              <Route path="portal" element={<StaffPortal />} />

              {/* Moderator + Admin */}
              <Route path="admin" element={
                <ProtectedRoute><AdminPanel /></ProtectedRoute>
              } />

              {/* Admin only */}
              <Route path="system-admin" element={
                <ProtectedRoute requiredRole="admin"><SystemAdminPanel /></ProtectedRoute>
              } />

              <Route path="help" element={
                <ProtectedRoute><Help /></ProtectedRoute>
              } />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
