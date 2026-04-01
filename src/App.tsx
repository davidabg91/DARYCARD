import React, { lazy, Suspense } from 'react';
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

const PageLoader = () => <LoadingScreen />;

function GlobalNfcListener() {
  const navigate = useNavigate();
  const nfcStartedRef = React.useRef(false);

  React.useEffect(() => {
    const startNfc = async () => {
      if (!('NDEFReader' in window) || nfcStartedRef.current) return;
      try {
        const reader = new (window as any).NDEFReader();
        await reader.scan();
        nfcStartedRef.current = true;
        reader.onreading = (event: any) => {
          const { message } = event;
          for (const record of message.records) {
            if (record.recordType === "url") {
              const decoder = new TextDecoder();
              const url = decoder.decode(record.data);
              const parts = url.split('/client/');
              if (parts.length > 1) {
                const id = parts[1].split(/[?#]/)[0].trim();
                if (id) navigate(`/client/${id}`);
              }
            }
          }
        };
      } catch (e) { console.warn("NFC error:", e); }
    };

    const handleInteraction = () => {
      startNfc();
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [navigate]);

  return null;
}

function ClientProfileWrapper() {
  return <ClientProfile />;
}

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <GlobalNfcListener />
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
