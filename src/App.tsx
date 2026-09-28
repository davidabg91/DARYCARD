import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { NFCService } from './services/NFCService';
import { recordDeviceScan, startDeviceHeartbeat } from './utils/deviceHeartbeat';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import TicketButton from './components/TicketButton';
import LoadingScreen from './components/LoadingScreen';
import ClientProfile from './pages/ClientProfile';
import LoginPage from './pages/LoginPage';

import SystemAdminPanel from './pages/SystemAdminPanel';
const Landing = lazy(() => import('./pages/Landing'));
const Inspections = lazy(() => import('./pages/Inspections'));
const StaffPortal = lazy(() => import('./pages/StaffPortal'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const Help = lazy(() => import('./pages/Help'));
const Signal = lazy(() => import('./pages/Signal'));
const BusRental = lazy(() => import('./pages/BusRental'));
const Legal = lazy(() => import('./pages/Legal'));

const PageLoader = () => <LoadingScreen />;

// The true bundle version. Живее извън компонента, защото и регистърът
// на устройствата я докладва, за да се вижда кой терминал е със старо APK.
const INTERNAL_APP_VERSION = "2026.09.28.17.19";

function ClientProfileWrapper() {
  return <ClientProfile />;
}

import TransitView from './components/TransitView';

function DeepLinkHandler() {
  const navigate = useNavigate();
  const [isOffline, setIsOffline] = useState(!window.navigator.onLine);
  const [transitId, setTransitId] = useState<string | null>(null);
  const [transitPhysicalUid, setTransitPhysicalUid] = useState<string | undefined>(undefined);
  const [transitNfcCounter, setTransitNfcCounter] = useState<number | undefined>(undefined);
  // Bumped on every scan so TransitView remounts even when the SAME card is
  // scanned twice in a row — required for anti-passback to fire on a re-scan.
  const [scanNonce, setScanNonce] = useState(0);
  const lastTriggerRef = useRef<{ id: string; t: number }>({ id: '', t: 0 });

  const triggerScan = useCallback((finalId: string, physicalUid?: string, nfcCounter?: number) => {
    if (!finalId) return;
    const now = Date.now();
    // Ignore duplicate events from the same physical tap (some readers fire twice).
    if (lastTriggerRef.current.id === finalId && now - lastTriggerRef.current.t < 2000) return;
    lastTriggerRef.current = { id: finalId, t: now };
    // Регистърът на устройствата — кой терминал кога е чел карта.
    recordDeviceScan(INTERNAL_APP_VERSION);
    setTransitId(finalId);
    setTransitPhysicalUid(physicalUid);
    setTransitNfcCounter(nfcCounter);
    setScanNonce(n => n + 1);
  }, []);

  useEffect(() => {
    window.onNfcRawEvent = (tagId: string, url: string) => {
      console.log('🚀 NUCLEAR INJECTION:', { tagId, url });
      let idFromUrl = null;
      if (url && url.includes('darycommerce.com') && url.includes('client/')) {
        const match = url.match(/\/client\/([^/?#]+)/);
        if (match) {
          idFromUrl = match[1].toUpperCase();
        }
      }
      const pUid = tagId ? tagId.toUpperCase() : undefined;
      triggerScan(idFromUrl || pUid || '', pUid, undefined);
    };
    return () => { delete window.onNfcRawEvent; };
  }, [triggerScan]);

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
    const handleInjectedScan = (e: CustomEvent<{ id: string; url: string; nfcCounter?: number }>) => {
      const { id, url, nfcCounter } = e.detail || {};
      console.log('🛡️ IRON GUARD SIGNAL RECEIVED:', { id, url, nfcCounter });
      
      let idFromUrl = null;
      if (url && url.includes('darycommerce.com') && url.includes('client/')) {
        const match = url.match(/\/client\/([^/?#]+)/);
        if (match) {
          idFromUrl = match[1].toUpperCase();
        }
      }
      const pUid = id ? id.toUpperCase() : undefined;
      triggerScan(idFromUrl || pUid || '', pUid, nfcCounter);
    };

    window.addEventListener('dary-nfc-scan', handleInjectedScan as EventListener);
    return () => window.removeEventListener('dary-nfc-scan', handleInjectedScan as EventListener);
  }, [triggerScan]);

  const handleTransitClose = useCallback(() => setTransitId(null), []);
  const handleTransitUnregistered = useCallback((id: string) => {
    setTransitId(null);
    navigate(`/client/${id}`);
  }, [navigate]);

  return (
    <div id="transit-id-setter">
      {transitId && (
        <TransitView
            key={scanNonce}
            id={transitId}
            physicalUid={transitPhysicalUid}
            nfcCounter={transitNfcCounter}
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
    // 🛡️ FORCE UPDATE LOGIC: Reusable check function
    const checkVersion = async () => {
      try {
        const entropy = Math.random().toString(36).substring(7);
        const response = await fetch(`./version.json?t=${Date.now()}&e=${entropy}`, { cache: 'no-store' });
        if (!response.ok) return;
        
        const data = await response.json();
        const serverVersion = data.version;
        
        console.log(`[Version Check] Internal: ${INTERNAL_APP_VERSION} | Server: ${serverVersion}`);

        if (serverVersion && INTERNAL_APP_VERSION !== serverVersion) {
          // Спирачка срещу безкраен кръг: презареждаме най-много веднъж за дадена
          // версия в рамките на една сесия.
          //
          // Преди спирачката беше `?v=` в адреса, но той остава там завинаги
          // (HashRouter мени само диезата). Ако service worker-ът сервира стар index.html,
          // сравнението съвпада и проверката се изключва завинаги — устройството остава
          // заковано на старата версия и не получава повече нито една поправка.
          // Ако sessionStorage е забранен, localStorage върши същата работа — важното
          // е да има къде да се запише, че вече сме презареждали за тази версия.
          const marker = (() => {
            for (const store of [
              () => sessionStorage,
              () => localStorage,
            ]) {
              try { const s = store(); s.getItem('forced_version'); return s; } catch { /* next */ }
            }
            return null;
          })();
          if (marker) {
            if (marker.getItem('forced_version') === serverVersion) return;
            marker.setItem('forced_version', serverVersion);
          }

          console.log('🚀 OUTDATED BUNDLE DETECTED. NUCLEAR REFRESH STARTING...');
          
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
               // Push известията стоят на отделен service worker
               // (`firebase-messaging-sw.js`, собствен scope). Той не сервира нищо от
               // приложението, така че не може да задържи стар код — а разрегистрирането
               // му разваля push абонамента: токенът умира, Cloud Function-ът получава
               // `registration-token-not-registered` и изтрива устройството от
               // `admin_push_tokens`. Така всяка нова версия тихо отписваше всички от
               // известията. Него го оставяме.
               const url = registration.active?.scriptURL || registration.waiting?.scriptURL
                 || registration.installing?.scriptURL || '';
               if (url.includes('firebase-messaging-sw') || registration.scope.includes('firebase-cloud-messaging-push-scope')) continue;
               await registration.unregister();
            }
          }
          
          localStorage.removeItem('last_tried_version');
          // Адресът остава чист; срещу кеша стига разрегистрираният service worker.
          window.location.reload();
        }
      } catch (err) {
        console.error('⚠️ Version check failed:', err);
      }
    };

    checkVersion();
    
    // Check every 5 minutes while the app is open
    const versionInterval = setInterval(checkVersion, 5 * 60 * 1000);

    // Терминалът се вписва в регистъра на устройствата и праща пулс.
    // В браузър и PWA не прави нищо.
    const stopHeartbeat = startDeviceHeartbeat(INTERNAL_APP_VERSION);

    // Счупен бъндъл: лениво зареждан модул не се сваля. Тогава `Suspense`
    // чака завинаги и на екрана остава въртяща се въртележка над празно място.
    //
    // Vite не казва „loading chunk“ — съобщението е „Failed to fetch dynamically
    // imported module“ (Chrome), „error loading dynamically imported module“ (Firefox)
    // или „Importing a module script failed“ (Safari). Старата проверка ги пропускаше,
    // затова нищо не се самопоправяше.
    //
    // Само презареждане не стига: ако service worker-ът сервира стар index.html с
    // имена на файлове, които вече ги няма, следващото зареждане се чупи по същия
    // начин. Затова първо се чистят кешовете и worker-ът на приложението (този за
    // известията остава), и се презарежда най-много веднъж за сесия.
    const recoverFromBrokenBundle = async (reason: string) => {
      try {
        if (sessionStorage.getItem('bundle_recovery')) {
          console.error('Бъндълът пак е счупен след възстановяване:', reason);
          return;
        }
        sessionStorage.setItem('bundle_recovery', '1');
      } catch { /* без sessionStorage — по-добре да опитаме, отколкото да заседнем */ }

      console.warn('Счупен бъндъл — чистя кеша и презареждам:', reason);
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch (err) { console.error('Кешът не се изчисти:', err); }

      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            const url = registration.active?.scriptURL || registration.waiting?.scriptURL
              || registration.installing?.scriptURL || '';
            if (url.includes('firebase-messaging-sw') || registration.scope.includes('firebase-cloud-messaging-push-scope')) continue;
            await registration.unregister();
          }
        }
      } catch (err) { console.error('Service workerът не се махна:', err); }

      window.location.reload();
    };

    const handleError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const error = (e instanceof ErrorEvent) ? e.error : (e instanceof PromiseRejectionEvent ? e.reason : e);
      const message = (error && typeof error === 'object' && 'message' in error) ? String(error.message) : String(error);
      const broken = /loading chunk|dynamically imported module|Importing a module script failed|Script error/i.test(message);
      if (broken) void recoverFromBrokenBundle(message);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    // 🛡️ IRON GUARD: Initialize NFC at the ROOF level. Never stops.
    NFCService.init(
      (tagId, url, nfcCounter) => {
        // Find the global entry point or local state update
        const transitView = document.getElementById('transit-id-setter');
        if (transitView) {
           const event = new CustomEvent('dary-nfc-scan', { 
               detail: { id: tagId, url: url, nfcCounter: nfcCounter } 
           });
           window.dispatchEvent(event);
        }
      },
      () => {}
    );

    const flag = document.getElementById('app-mounted');
    if (flag) flag.style.display = 'block';

    return () => {
        clearInterval(versionInterval);
        stopHeartbeat();
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleError);
    };
  }, []);

  return (
    <ErrorBoundary>
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

              {/* Moderator + Admin (inspectors are redirected to /inspections) */}
              <Route path="admin" element={
                <ProtectedRoute allowedRoles={['admin', 'moderator']}><AdminPanel /></ProtectedRoute>
              } />

              {/* Inspectors + Admin */}
              <Route path="inspections" element={
                <ProtectedRoute allowedRoles={['admin', 'inspector']}><Inspections /></ProtectedRoute>
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
        {/* Билетите са извън Routes: бутонът трябва да стои над всеки екран на
            терминала и да не иска логване. В браузър не се показва изобщо. */}
        <TicketButton />
      </HashRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
