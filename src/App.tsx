import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import StaffPortal from './pages/StaffPortal';
import AdminPanel from './pages/AdminPanel';
import ClientProfile from './pages/ClientProfile';
import LoginPage from './pages/LoginPage';
import SystemAdminPanel from './pages/SystemAdminPanel';
import Help from './pages/Help';
import Signal from './pages/Signal';
import BusRental from './pages/BusRental';
import { useParams } from 'react-router-dom';

function ClientProfileWrapper() {
  const { id } = useParams<{ id: string }>();
  return <ClientProfile key={id} />;
}

function App() {
  return (
    <AuthProvider>
      <HashRouter>
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
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
