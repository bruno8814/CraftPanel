// ============================================================
// App.tsx — Componente raíz con autenticación y rutas
// ============================================================

import { Routes, Route, Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import ServerPage from './pages/ServerPage';
import UsersPage from './pages/UsersPage';
import AuthPage from './pages/AuthPage';

function AppContent() {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-panel-bg flex flex-col items-center justify-center text-panel-muted">
        <RefreshCw size={36} className="animate-spin text-panel-accent mb-3" />
        <p className="text-sm font-medium">Iniciando CraftPanel...</p>
      </div>
    );
  }

  // Si no hay sesión iniciada, mostrar AuthPage
  if (!user) {
    return <AuthPage />;
  }

  return (
    <Layout>
      <Routes>
        {/* Dashboard principal */}
        <Route path="/" element={<DashboardPage />} />

        {/* Detalle del servidor */}
        <Route path="/server/:id" element={<ServerPage />} />

        {/* Panel de administración de usuarios (Owner o users:manage) */}
        <Route
          path="/users"
          element={
            user.isOwner || hasPermission('users:manage') ? (
              <UsersPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Cualquier otra ruta redirige a inicio */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
