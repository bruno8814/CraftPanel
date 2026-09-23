// ============================================================
// ServerCard.tsx — Tarjeta de servidor para el Dashboard
// ============================================================
// Cada servidor se muestra como una tarjeta con:
// - Nombre del servidor
// - Tipo de software (Paper, Fabric, etc.) y versión
// - Estado actual (punto de color)
// - RAM asignada y puerto
// - Botón para entrar a gestionar el servidor
// ============================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Square,
  MemoryStick,
  Network,
  ChevronRight,
  Cpu,
  Users,
} from 'lucide-react';
import { ServerState, ServerStats } from '../types';
import StatusBadge from './StatusBadge';
import { api, getSocket } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface Props {
  server: ServerState;
  onRefresh: () => void;
}

/** Mapeo de software → icono emoji y color */
const softwareStyles: Record<string, { emoji: string; color: string }> = {
  vanilla: { emoji: '🟫', color: 'text-amber-400' },
  paper:   { emoji: '📄', color: 'text-blue-400' },
  fabric:  { emoji: '🧵', color: 'text-indigo-400' },
  forge:   { emoji: '🔨', color: 'text-orange-400' },
  mohist:  { emoji: '⚗️', color: 'text-purple-400' },
};

export default function ServerCard({ server, onRefresh }: Props) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { config, status } = server;
  const style = softwareStyles[config.software] ?? softwareStyles.vanilla;

  const [liveStats, setLiveStats] = useState<ServerStats | null>(null);

  useEffect(() => {
    if (status !== 'ONLINE') return;

    const socket = getSocket();
    const handleStats = (data: ServerStats) => {
      if (data.serverId === config.id) {
        setLiveStats(data);
      }
    };

    socket.on('server:stats', handleStats);
    return () => {
      socket.off('server:stats', handleStats);
    };
  }, [config.id, status]);

  /** Arrancar o parar el servidor directamente desde la tarjeta */
  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar que haga clic en la tarjeta
    try {
      if (status === 'OFFLINE') {
        await api.startServer(config.id);
      } else if (status === 'ONLINE') {
        await api.stopServer(config.id);
      }
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div
      onClick={() => navigate(`/server/${config.id}`)}
      className="group relative flex flex-col justify-between rounded-xl border border-panel-border
                 bg-panel-surface p-5 transition-all duration-200
                 hover:border-panel-accent/40 hover:bg-panel-hover cursor-pointer"
    >
      {/* ── Cabecera: nombre + estado ── */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">
            {config.name}
          </h3>
          <p className={`mt-1 text-sm ${style.color}`}>
            {style.emoji} {config.software.charAt(0).toUpperCase() + config.software.slice(1)}{' '}
            <span className="text-panel-muted">{config.version}</span>
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* ── Detalles: RAM y Puerto + Telemetría en vivo si está ONLINE ── */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-panel-muted">
        <span className="inline-flex items-center gap-1.5 font-mono">
          <MemoryStick size={14} className={status === 'ONLINE' ? 'text-cyan-400' : ''} />
          {status === 'ONLINE' && liveStats
            ? `${((liveStats.memoryMB || 0) / 1024).toFixed(1)} / ${(config.memoryMB / 1024).toFixed(1)}GB`
            : config.memoryMB >= 1024
            ? `${(config.memoryMB / 1024).toFixed(1)}GB`
            : `${config.memoryMB}MB`}
        </span>
        <span className="inline-flex items-center gap-1.5 font-mono">
          <Network size={14} />
          :{config.port}
        </span>
        {status === 'ONLINE' && (
          <>
            <span className="inline-flex items-center gap-1 font-mono text-emerald-400">
              <Cpu size={13} />
              {liveStats?.cpu ?? 0}%
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-amber-400">
              <Users size={13} />
              {liveStats?.playersOnline ?? 0}
            </span>
          </>
        )}
      </div>

      {/* ── Barra inferior: botón de acción + flecha ── */}
      <div className="mt-4 flex items-center justify-between border-t border-panel-border pt-3">
        {/* Botón de inicio/parada rápida */}
        {hasPermission('servers:control') && (status === 'OFFLINE' || status === 'ONLINE') && (
          <button
            onClick={handleToggle}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium
                       transition-colors ${
                         status === 'OFFLINE'
                           ? 'bg-panel-success/10 text-panel-success hover:bg-panel-success/20'
                           : 'bg-panel-danger/10 text-panel-danger hover:bg-panel-danger/20'
                       }`}
          >
            {status === 'OFFLINE' ? (
              <>
                <Play size={12} /> Iniciar
              </>
            ) : (
              <>
                <Square size={12} /> Detener
              </>
            )}
          </button>
        )}
        {(status === 'STARTING' || status === 'STOPPING') && (
          <span className="text-xs text-panel-muted italic">
            {status === 'STARTING' ? 'Arrancando...' : 'Deteniendo...'}
          </span>
        )}

        {/* Flecha para indicar que se puede hacer clic */}
        <ChevronRight
          size={18}
          className="text-panel-muted transition-transform group-hover:translate-x-1
                     group-hover:text-panel-accent"
        />
      </div>
    </div>
  );
}
