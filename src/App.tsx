import { lazy, Suspense, useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { NFCService } from './services/NFCService';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingScreen from './components/LoadingScreen';
import ClientProfile from './pages/ClientProfile';
import LoginPage from './pages/LoginPage';

import SystemAdminPanel from './pages/SystemAdminPanel';
const Landing = lazy(() => import('./pages/Landing'));
const StaffPortal = lazy(() => import('./pages/StaffPortal'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const Help = lazy(() => import('./pages/Help'));
const Signal = lazy(() => import('./pages/Signal'));
const BusRental = lazy(() => import('./pages/BusRental'));
const Legal = lazy(() => import('./pages/Legal'));

const PageLoader = () => <LoadingScreen />;

function ClientProfileWrapper() {
  return <ClientProfile />;
}

function DeepLinkHandler() {
  const navigate = useNavigate();
  const [isOffline, setIsOffline] = useState(!window.navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const setupListener = async () => {
      // 1. App Links / Deep Links
      CapApp.addListener('appUrlOpen', (data) => {
        const url = new URL(data.url);
        let path = url.hash ? url.hash.replace('#', '') : url.pathname;
        if (path) {
          if (path === '/' || path === '') path = '/';
          navigate(path);
        }
      });

      // 2. NFC Scanning with Diagnostic Status
      NFCService.init(
        (tagId) => {
          if (tagId) {
            navigate(`/client/${tagId}`);
          }
        },
        () => {} // Status updates no longer needed
      );
    };

    setupListener();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      CapApp.removeAllListeners();
      NFCService.stop();
    };
  }, [navigate]);

  return (
    <>
      {isOffline && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: '#ff5252',
          color: 'white',
          textAlign: 'center',
          padding: '4px',
          fontSize: '0.7rem',
          fontWeight: 'bold',
          zIndex: 9999
        }}>
          НЯМА ВРЪЗКА С ИНТЕРНЕТ
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <DeepLinkHandler />
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

              <Route path="legal" element={<Legal />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
