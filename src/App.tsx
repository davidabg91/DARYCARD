import { lazy, Suspense, useEffect, useState, useCallback } from 'react';
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

import TransitView from './components/TransitView';

function DeepLinkHandler() {
  const navigate = useNavigate();
  const [isOffline, setIsOffline] = useState(!window.navigator.onLine);
  const [transitId, setTransitId] = useState<string | null>(null);
  
  useEffect(() => {
    window.onNfcRawEvent = (tagId: string, url: string) => {
      console.log('🚀 NUCLEAR INJECTION:', { tagId, url });
      let idFromUrl = null;
      if (url && url.includes('darycommerce.com') && url.includes('client/')) {
        const parts = url.split('/');
        idFromUrl = parts[parts.length - 1];
      }
      const finalId = idFromUrl || tagId;
      if (finalId) setTransitId(finalId);
    };
    return () => { delete window.onNfcRawEvent; };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleInjectedScan = (e: CustomEvent<{ id: string; url: string }>) => {
      const { id, url } = e.detail || {};
      console.log('🛡️ IRON GUARD SIGNAL RECEIVED:', { id, url });
      
      let idFromUrl = null;
      if (url && url.includes('darycommerce.com') && url.includes('client/')) {
        const parts = url.split('/');
        idFromUrl = parts[parts.length - 1];
      }
      
      const finalId = idFromUrl || id;
      if (finalId) setTransitId(finalId);
    };

    window.addEventListener('dary-nfc-scan', handleInjectedScan as EventListener);
    return () => window.removeEventListener('dary-nfc-scan', handleInjectedScan as EventListener);
  }, []);

  const handleTransitClose = useCallback(() => setTransitId(null), []);
  const handleTransitUnregistered = useCallback((id: string) => {
    setTransitId(null);
    navigate(`/client/${id}`);
  }, [navigate]);

  return (
    <div id="transit-id-setter">
      {transitId && (
        <TransitView 
            id={transitId} 
            onClose={handleTransitClose} 
            onUnregistered={handleTransitUnregistered}
        />
      )}
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
    </div>
  );
}



function App() {
  useEffect(() => {
    // 🛡️ FORCE UPDATE LOGIC: Check for new version on mount
    const checkVersion = async () => {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`);
        if (!response.ok) return;
        
        const data = await response.json();
        const serverVersion = data.version;
        const localVersion = localStorage.getItem('app_version');

        if (localVersion && serverVersion && localVersion !== serverVersion) {
          console.log('🚀 NEW VERSION DETECTED. REFRESHING...', { localVersion, serverVersion });
          localStorage.setItem('app_version', serverVersion);
          
          // Clear any aggressive service worker cache if exists
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
               await registration.unregister();
            }
          }
          
          // Hard reload
          window.location.reload();
        } else if (serverVersion) {
            localStorage.setItem('app_version', serverVersion);
        }
      } catch (err) {
        console.error('⚠️ Version check failed:', err);
      }
    };
    checkVersion();

    // 🛡️ IRON GUARD: Initialize NFC at the ROOF level. Never stops.
    NFCService.init(
      (tagId, url) => {
        // Find the global entry point or local state update
        const transitView = document.getElementById('transit-id-setter');
        if (transitView) {
           const event = new CustomEvent('dary-nfc-scan', { detail: { id: tagId, url: url } });
           window.dispatchEvent(event);
        }
      },
      () => {}
    );

    const flag = document.getElementById('app-mounted');
    if (flag) flag.style.display = 'block';
  }, []);

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
