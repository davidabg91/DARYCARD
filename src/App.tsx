import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import AdminPanel from './pages/AdminPanel';
import ClientProfile from './pages/ClientProfile';
import LoginPage from './pages/LoginPage';
import UsersPanel from './pages/UsersPanel';
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

            {/* Moderator + Admin */}
            <Route path="admin" element={
              <ProtectedRoute><AdminPanel /></ProtectedRoute>
            } />

            {/* Admin only */}
            <Route path="admin/users" element={
              <ProtectedRoute requiredRole="admin"><UsersPanel /></ProtectedRoute>
            } />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;
