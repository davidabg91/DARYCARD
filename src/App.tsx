import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
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

function ClientProfileWrapper() {
  return <ClientProfile />;
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
