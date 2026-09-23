// ============================================================
// ServerPage.tsx — Vista de detalle de un servidor
// ============================================================
// Esta es la página que aparece al hacer clic en una tarjeta.
// Muestra:
// - Sidebar izquierda con las secciones del servidor
// - Contenido principal que cambia según la sección seleccionada
// - Controles de servidor (iniciar, parar, reiniciar, matar)
// ============================================================

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Terminal,
  Puzzle,
  Plug,
  Package,
  FolderOpen,
  Settings,
  HardDrive,
  Play,
  Square,
  RotateCcw,
  Skull,
  RefreshCw,
  Download,
  Activity,
  Zap,
  Clock,
  Users,
  Cpu,
  Bell,
} from 'lucide-react';
import { ServerState, ServerStats } from '../types';
import { api, getSocket } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import Console from '../components/Console';
import Workshop from '../components/Workshop';
import ServerSettings from '../components/ServerSettings';
import FileManager from '../components/FileManager';
import ServerMetrics from '../components/ServerMetrics';
import Backups from '../components/Backups';
import { Schedules } from '../components/Schedules';
import { AlertsSettings } from '../components/AlertsSettings';
import { useAuth } from '../context/AuthContext';

/** Secciones disponibles en la sidebar */
type Section = 'console' | 'metrics' | 'mods' | 'plugins' | 'modpacks' | 'files' | 'settings' | 'schedules' | 'backups' | 'alerts';

interface SidebarItem {
  id: Section;
  label: string;
  icon: React.ReactNode;
  /** Mostrar solo si el servidor usa este tipo de software */
  showFor?: string[];
}

const sidebarItems: SidebarItem[] = [
  { id: 'console',   label: 'Consola',          icon: <Terminal size={18} /> },
  { id: 'metrics',   label: 'Rendimiento',      icon: <Activity size={18} /> },
  { id: 'mods',      label: 'Mods',             icon: <Puzzle size={18} />,  showFor: ['fabric', 'forge', 'mohist', 'neoforge'] },
  { id: 'plugins',   label: 'Plugins',          icon: <Plug size={18} />,    showFor: ['paper', 'mohist'] },
  { id: 'modpacks',  label: 'Modpacks',         icon: <Package size={18} />, showFor: ['fabric', 'forge', 'neoforge'] },
  { id: 'files',     label: 'Archivos',         icon: <FolderOpen size={18} /> },
  { id: 'settings',  label: 'Ajustes',          icon: <Settings size={18} /> },
  { id: 'schedules', label: 'Horarios',         icon: <Clock size={18} /> },
  { id: 'backups',   label: 'Backups',          icon: <HardDrive size={18} /> },
  { id: 'alerts',    label: 'Alertas & Discord', icon: <Bell size={18} /> },
];

export default function ServerPage() {
  // useParams() extrae el :id de la URL (ej. /server/abc-123 → id = "abc-123")
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [server, setServer] = useState<ServerState | null>(null);
  const [liveStats, setLiveStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('console');
  const [actionLoading, setActionLoading] = useState(false);
  const [downloadingJar, setDownloadingJar] = useState(false);

  // ── Formatear segundos de uptime ──
  const formatUptime = (seconds: number) => {
    if (!seconds || seconds <= 0) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Descargar software .jar ──
  const handleDownloadJar = async () => {
    if (!id) return;
    setDownloadingJar(true);
    try {
      await api.downloadSoftware(id);
      await fetchServer();
    } catch (err: any) {
      alert(`Error al descargar: ${err.message}`);
    } finally {
      setDownloadingJar(false);
    }
  };

  // ── Cargar datos del servidor ──
  const fetchServer = async () => {
    if (!id) return;
    try {
      const data = await api.getServer(id);
      setServer(data);
    } catch (err) {
      console.error('Error al cargar servidor:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServer();

    // Actualizar estado y métricas en tiempo real
    const socket = getSocket();
    const handleStatus = (data: { serverId: string }) => {
      if (data.serverId === id) fetchServer();
    };
    const handleServerStats = (data: ServerStats) => {
      if (data.serverId === id) setLiveStats(data);
    };

    socket.on('server:status', handleStatus);
    socket.on('server:stats', handleServerStats);

    return () => {
      socket.off('server:status', handleStatus);
      socket.off('server:stats', handleServerStats);
    };
  }, [id]);

  // ── Acciones del servidor ──
  const handleAction = async (action: 'start' | 'stop' | 'kill') => {
    if (!id) return;
    setActionLoading(true);
    try {
      if (action === 'start') await api.startServer(id);
      else if (action === 'stop') await api.stopServer(id);
      else if (action === 'kill') await api.killServer(id);
      await fetchServer();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center text-panel-muted">
        <RefreshCw size={32} className="animate-spin" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center text-center">
        <p className="text-lg font-semibold text-white">Servidor no encontrado</p>
        <button
          onClick={() => navigate('/')}
          className="mt-3 text-sm text-panel-accent hover:underline"
        >
          Volver al dashboard
        </button>
      </div>
    );
  }

  const { user, hasPermission } = useAuth();
  const { config, status } = server;

  // Filtrar sidebar según el tipo de software y permisos
  const visibleItems = sidebarItems.filter((item) => {
    if (item.showFor && !item.showFor.includes(config.software)) return false;
    if (item.id === 'files' && !hasPermission('files:edit')) return false;
    if (item.id === 'settings' && !hasPermission('settings:edit')) return false;
    if ((item.id === 'mods' || item.id === 'plugins' || item.id === 'modpacks') && !hasPermission('workshop:manage')) return false;
    return true;
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ══════════════════════════════════════════════ */}
      {/* ══  SIDEBAR IZQUIERDA  ═══════════════════════ */}
      {/* ══════════════════════════════════════════════ */}
      <aside className="flex w-56 flex-col border-r border-panel-border bg-panel-surface">
        {/* Cabecera de la sidebar */}
        <div className="border-b border-panel-border p-4">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-sm text-panel-muted
                       transition-colors hover:text-white"
          >
            <ArrowLeft size={14} /> Volver
          </button>
          <h2 className="mt-2 text-base font-semibold text-white truncate">
            {config.name}
          </h2>
          <div className="mt-1">
            <StatusBadge status={status} size="sm" />
          </div>
        </div>

        {/* Enlaces de sección */}
        <nav className="flex-1 overflow-y-auto p-2">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm
                         transition-colors mb-0.5
                ${
                  section === item.id
                    ? 'bg-panel-accent/10 text-panel-accent font-medium'
                    : 'text-panel-muted hover:bg-panel-hover hover:text-white'
                }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Controles del servidor */}
        {hasPermission('servers:control') && (
        <div className="border-t border-panel-border p-3 space-y-1.5">
          {status === 'OFFLINE' && (
            server.jarExists ? (
              <ActionButton
                onClick={() => handleAction('start')}
                disabled={actionLoading}
                icon={<Play size={14} />}
                label="Iniciar"
                variant="success"
              />
            ) : (
              <ActionButton
                onClick={handleDownloadJar}
                disabled={downloadingJar}
                icon={downloadingJar ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                label={downloadingJar ? 'Descargando...' : 'Descargar software'}
                variant="default"
              />
            )
          )}
          {status === 'ONLINE' && (
            <>
              <ActionButton
                onClick={() => handleAction('stop')}
                disabled={actionLoading}
                icon={<Square size={14} />}
                label="Detener"
                variant="warning"
              />
              <ActionButton
                onClick={() => {
                  handleAction('stop').then(() => handleAction('start'));
                }}
                disabled={actionLoading}
                icon={<RotateCcw size={14} />}
                label="Reiniciar"
                variant="default"
              />
            </>
          )}
          {(status === 'STARTING' || status === 'STOPPING' || status === 'ONLINE') && (
            <ActionButton
              onClick={() => {
                if (confirm('¿Matar el proceso forzosamente? El mundo podría corromperse.')) {
                  handleAction('kill');
                }
              }}
              disabled={actionLoading}
              icon={<Skull size={14} />}
              label="Matar proceso"
              variant="danger"
            />
          )}
        </div>
        )}
      </aside>

      {/* ══════════════════════════════════════════════ */}
      {/* ══  CONTENIDO PRINCIPAL  ═════════════════════ */}
      {/* ══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Banner de advertencia si no está descargado el jar */}
        {!server.jarExists && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
              <Download size={16} />
              <span>
                El archivo ejecutable ({config.software} {config.version}) aún no está instalado en este servidor.
              </span>
            </div>
            <button
              onClick={handleDownloadJar}
              disabled={downloadingJar}
              className="inline-flex items-center gap-1.5 rounded-lg bg-panel-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {downloadingJar ? (
                <>
                  <RefreshCw size={12} className="animate-spin" /> Descargando...
                </>
              ) : (
                <>
                  <Download size={12} /> Descargar ahora
                </>
              )}
            </button>
          </div>
        )}

        {/* Barra persistente de telemetría rápida (visible cuando el servidor está ONLINE o STARTING) */}
        {(status === 'ONLINE' || status === 'STARTING') && (
          <div className="bg-[#161b22] border-b border-[#30363d] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              {/* CPU */}
              <div className="flex items-center gap-1.5 text-gray-300 font-mono">
                <Cpu size={14} className="text-emerald-400" />
                <span className="text-gray-400">CPU:</span>
                <span className="font-semibold text-white">{liveStats?.cpu ?? 0}%</span>
              </div>
              {/* RAM */}
              <div className="flex items-center gap-1.5 text-gray-300 font-mono">
                <HardDrive size={14} className="text-cyan-400" />
                <span className="text-gray-400">RAM:</span>
                <span className="font-semibold text-white">
                  {((liveStats?.memoryMB ?? 0) / 1024).toFixed(2)} / {(config.memoryMB / 1024).toFixed(1)} GB
                </span>
              </div>
              {/* TPS */}
              <div className="flex items-center gap-1.5 text-gray-300 font-mono">
                <Zap size={14} className="text-violet-400" />
                <span className="text-gray-400">TPS:</span>
                <span className="font-semibold text-white">{(liveStats?.tps ?? 20.0).toFixed(1)}</span>
              </div>
              {/* Jugadores */}
              <div className="flex items-center gap-1.5 text-gray-300 font-mono">
                <Users size={14} className="text-amber-400" />
                <span className="text-gray-400">Jugadores:</span>
                <span className="font-semibold text-white">
                  {liveStats?.playersOnline ?? 0} / {liveStats?.playersMax ?? 20}
                </span>
              </div>
              {/* Uptime */}
              <div className="flex items-center gap-1.5 text-gray-300 font-mono">
                <Clock size={14} className="text-gray-400" />
                <span className="text-gray-400">Uptime:</span>
                <span className="font-semibold text-white">{formatUptime(liveStats?.uptimeSeconds ?? 0)}</span>
              </div>
            </div>

            {section !== 'metrics' && (
              <button
                onClick={() => setSection('metrics')}
                className="text-panel-accent hover:underline text-xs flex items-center gap-1 font-medium"
              >
                <Activity size={13} /> Ver gráficas
              </button>
            )}
          </div>
        )}

        {section === 'console' && (
          <Console serverId={config.id} initialBuffer={server.consoleBuffer} />
        )}

        {section === 'metrics' && (
          <div className="flex-1 overflow-y-auto p-6 bg-[#0d1117]">
            <ServerMetrics server={server} onRefresh={fetchServer} />
          </div>
        )}

        {section === 'mods' && (
          <Workshop server={server} addonType="mods" />
        )}

        {section === 'plugins' && (
          <Workshop server={server} addonType="plugins" />
        )}

        {section === 'modpacks' && (
          <PlaceholderSection
            title="📦 Modpacks"
            description="Aquí podrás buscar e instalar modpacks completos. (Fase 4)"
          />
        )}

        {section === 'files' && (
          <FileManager server={server} />
        )}

        {section === 'settings' && (
          <ServerSettings server={server} />
        )}

        {section === 'schedules' && (
          <div className="flex-1 overflow-y-auto p-6 bg-[#0d1117]">
            <Schedules
              serverId={server.config.id}
              serverName={server.config.name}
              isOnline={server.status === 'ONLINE'}
            />
          </div>
        )}

        {section === 'backups' && (
          <div className="flex-1 overflow-y-auto p-6 bg-[#0d1117]">
            <Backups server={server} onRefresh={fetchServer} />
          </div>
        )}

        {section === 'alerts' && (
          <div className="flex-1 overflow-y-auto p-6 bg-[#0d1117]">
            <AlertsSettings server={server} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componentes auxiliares ───────────────────────────────────

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  variant,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'default';
}) {
  const colors = {
    success: 'bg-panel-success/10 text-panel-success hover:bg-panel-success/20',
    warning: 'bg-panel-warning/10 text-panel-warning hover:bg-panel-warning/20',
    danger: 'bg-panel-danger/10 text-panel-danger hover:bg-panel-danger/20',
    default: 'bg-white/5 text-panel-muted hover:bg-white/10 hover:text-white',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium
                 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colors[variant]}`}
    >
      {icon}
      {label}
    </button>
  );
}

function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-panel-muted max-w-md">{description}</p>
    </div>
  );
}
