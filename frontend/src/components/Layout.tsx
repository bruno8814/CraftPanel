// ============================================================
// Layout.tsx — Barra de navegación superior con perfil y permisos
// ============================================================

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Server, Wifi, WifiOff, Users, LogOut, ArrowUpCircle, Sparkles } from 'lucide-react';
import { api, getSocket } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { SystemVersionInfo } from '../types';
import SystemUpdateModal from './SystemUpdateModal';

interface Props {
  children: React.ReactNode;
}

export default function Layout({ children }: Props) {
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const [connected, setConnected] = useState(false);
  const [versionInfo, setVersionInfo] = useState<SystemVersionInfo | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const fetchVersion = async () => {
    try {
      setLoadingVersion(true);
      const res = await api.getSystemVersion();
      setVersionInfo(res);
    } catch {
      // Si falla silenciosamente o no tiene conexión, mantener null
    } finally {
      setLoadingVersion(false);
    }
  };

  useEffect(() => {
    fetchVersion();
  }, []);

  useEffect(() => {
    const socket = getSocket();

    setConnected(socket.connected);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-panel-bg">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-panel-border bg-panel-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          {/* Logo y Enlaces */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="rounded-lg bg-panel-accent/10 p-1.5 transition-colors group-hover:bg-panel-accent/20">
                <Server size={20} className="text-panel-accent" />
              </div>
              <span className="text-lg font-bold tracking-tight text-white">
                Craft<span className="text-panel-accent">Panel</span>
              </span>
            </Link>

            {/* Navegación central */}
            <nav className="flex items-center gap-1">
              <NavLink to="/" current={location.pathname === '/' || location.pathname.startsWith('/server/')}>
                Servidores
              </NavLink>

              {(user?.isOwner || hasPermission('users:manage')) && (
                <NavLink to="/users" current={location.pathname === '/users'}>
                  <Users size={14} className="inline mr-1.5" />
                  Usuarios
                </NavLink>
              )}
            </nav>
          </div>

          {/* Lado derecho: Estado de conexión + Perfil + Logout */}
          <div className="flex items-center gap-3">
            {/* Badge de Versión y Actualizaciones */}
            {versionInfo?.updateAvailable ? (
              <button
                onClick={() => setShowUpdateModal(true)}
                className="flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/25 transition-colors animate-pulse"
                title="Nueva actualización disponible en GitHub"
              >
                <ArrowUpCircle size={13} />
                <span className="hidden sm:inline">Actualizar</span>
              </button>
            ) : (
              <button
                onClick={() => setShowUpdateModal(true)}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-panel-border/60 hover:bg-panel-border px-2.5 py-1 text-[11px] text-panel-muted hover:text-white transition-colors"
                title="Ver versión y comprobar actualizaciones"
              >
                <Sparkles size={11} className="text-panel-accent" />
                <span>v{versionInfo?.version || '1.0.0'}</span>
              </button>
            )}

            {/* Estado WebSocket */}
            {connected ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-panel-success/10 px-2.5 py-1 text-xs text-panel-success">
                <Wifi size={12} /> Conectado
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-panel-danger/10 px-2.5 py-1 text-xs text-panel-danger">
                <WifiOff size={12} /> Desconectado
              </span>
            )}

            {/* Información de Usuario */}
            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-panel-border">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                      user.isOwner
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-panel-accent/20 text-panel-accent border border-panel-accent/30'
                    }`}
                  >
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden md:block text-left">
                    <span className="text-xs font-medium text-white block leading-tight truncate max-w-[130px]">
                      {user.email}
                    </span>
                    <span className="text-[10px] text-panel-muted block leading-tight">
                      {user.isOwner ? '👑 Dueño' : 'Amigo'}
                    </span>
                  </div>
                </div>

                {/* Botón Logout */}
                <button
                  onClick={logout}
                  className="rounded-lg p-1.5 text-panel-muted hover:text-white hover:bg-panel-hover transition-colors ml-1"
                  title="Cerrar sesión"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Contenido principal ── */}
      <main className="flex-1">{children}</main>

      {/* ── Modal de Actualizaciones del Sistema ── */}
      <SystemUpdateModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        versionInfo={versionInfo}
        isLoading={loadingVersion}
        onRefresh={fetchVersion}
        isOwner={Boolean(user?.isOwner)}
      />
    </div>
  );
}

// ── Componente auxiliar para los enlaces de la navbar ──
function NavLink({
  to,
  current,
  children,
}: {
  to: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        current
          ? 'bg-panel-accent/10 text-panel-accent'
          : 'text-panel-muted hover:text-white hover:bg-panel-hover'
      }`}
    >
      {children}
    </Link>
  );
}
