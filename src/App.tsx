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
  // 🛡️ NUCLEAR VERSIONING: The true bundle version
  const INTERNAL_APP_VERSION = "2026.04.30.16.52";

  useEffect(() => {
    // 🛡️ FORCE UPDATE LOGIC: Reusable check function
    const checkVersion = async () => {
      try {
        const entropy = Math.random().toString(36).substring(7);
        const response = await fetch(`/version.json?t=${Date.now()}&e=${entropy}`, { cache: 'no-store' });
        if (!response.ok) return;
        
        const data = await response.json();
        const serverVersion = data.version;
        
        console.log(`[Version Check] Internal: ${INTERNAL_APP_VERSION} | Server: ${serverVersion}`);

        // Compare against hardcoded version for 100% accuracy
        const lastTriedVersion = localStorage.getItem('last_tried_version');
        
        if (serverVersion && INTERNAL_APP_VERSION !== serverVersion) {
          // 🛡️ STOP THE LOOP: If the URL already has this version, don't redirect again
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('v') === serverVersion) {
            console.log('⚠️ VERSION MISMATCH PERSISTS DESPITE URL PARAM. ABORTING REDIRECT TO PREVENT LOOP.');
            return;
          }

          // 🛡️ PROTECT ACTIVE SESSION: If the user is currently viewing a scanned profile, 
          // don't interrupt them with a refresh. Wait for next time.
          if (window.location.hash.includes('/client/')) {
            console.log('⏳ Update available, but session active. Postponing...');
            return;
          }

          if (lastTriedVersion === serverVersion) {
            console.log('⚠️ UPDATE ATTEMPTED BUT CACHE PERSISTS. STANDING BY...');
            return;
          }
          
          console.log('🚀 OUTDATED BUNDLE DETECTED. NUCLEAR REFRESH STARTING...');
          localStorage.setItem('last_tried_version', serverVersion);
          
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
               await registration.unregister();
            }
          }
          
          // Small delay for logs to flush
          setTimeout(() => {
            // 🚀 RELOAD: We use reload() instead of changing the URL to keep the links clean
            // as requested by the user. The localStorage 'last_tried_version' check
            // above prevents infinite reload loops.
            window.location.reload();
          }, 500);
        } else if (serverVersion === INTERNAL_APP_VERSION) {
            // Success! Clear the retry flag
            localStorage.removeItem('last_tried_version');
        }
      } catch (err) {
        console.error('⚠️ Version check failed:', err);
      }
    };

    checkVersion();
    
    // Check every 5 minutes while the app is open
    const versionInterval = setInterval(checkVersion, 5 * 60 * 1000);

    // 🛡️ CHUNK LOAD ERROR RECOVERY: If a lazy-loaded chunk fails, reload immediately
    const handleError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const error = (e instanceof ErrorEvent) ? e.error : (e instanceof PromiseRejectionEvent ? e.reason : e);
      const message = (error && typeof error === 'object' && 'message' in error) ? String(error.message) : String(error);
      
      if (message.includes("loading chunk") || message.includes("Loading chunk") || message.includes("Script error")) {
        console.warn("🛡️ CHUNK LOAD ERROR DETECTED. FORCING RELOAD...");
        window.location.reload();
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

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

    return () => {
        clearInterval(versionInterval);
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleError);
    };
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
