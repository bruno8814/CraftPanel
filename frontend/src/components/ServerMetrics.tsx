// ============================================================
// ServerMetrics.tsx — Panel de Rendimiento y Jugadores
// ============================================================
// Proporciona:
//   1. Tarjetas de telemetría: CPU, RAM (con aviso de los 192 GB del host),
//      TPS (Ticks Per Second), Latencia y Uptime en tiempo real.
//   2. Gráficas dobles de alta frecuencia (CPU % y Memoria RAM).
//   3. Gestor de jugadores con avatares oficiales y acciones rápidas
//      (Kick, Ban, OP) protegidas por permisos.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  HardDrive,
  Activity,
  Clock,
  Users,
  Shield,
  UserX,
  Ban,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { ServerState, ServerStats, ConnectedPlayer, MetricPoint } from '../types';
import { api, getSocket } from '../api/client';
import { useAuth } from '../context/AuthContext';
import MetricsChart from './MetricsChart';

interface ServerMetricsProps {
  server: ServerState;
  onRefresh?: () => void;
}

export default function ServerMetrics({ server, onRefresh }: ServerMetricsProps) {
  const { hasPermission } = useAuth();
  const canManagePlayers = hasPermission('servers:console') || hasPermission('servers:control');

  const [stats, setStats] = useState<ServerStats>({
    serverId: server.config.id,
    online: server.status === 'ONLINE',
    pid: server.pid,
    cpu: 0,
    memoryMB: 0,
    memoryMaxMB: server.config.memoryMB,
    memoryPercent: 0,
    tps: 20.0,
    pingMs: null,
    uptimeSeconds: 0,
    players: [],
    playersOnline: 0,
    playersMax: 20,
    history: [],
  });

  const [history, setHistory] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal de acción sobre jugador (kick / ban)
  const [targetPlayer, setTargetPlayer] = useState<ConnectedPlayer | null>(null);
  const [modalAction, setModalAction] = useState<'kick' | 'ban' | 'op' | 'deop' | null>(null);
  const [actionReason, setActionReason] = useState('');

  // ── Cargar estadísticas iniciales ──
  const fetchStats = async () => {
    try {
      const data = await api.getServerStats(server.config.id);
      setStats(data);
      if (data.history && data.history.length > 0) {
        setHistory(data.history);
      }
    } catch (err) {
      console.error('Error al cargar métricas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    const socket = getSocket();

    // Escuchar actualizaciones continuas por WebSocket (cada 2 segundos)
    const handleStatsUpdate = (data: ServerStats) => {
      if (data.serverId === server.config.id) {
        setStats(data);
        if (data.history && data.history.length > 0) {
          setHistory(data.history);
        } else {
          // Generar punto local si no viene array completo
          const now = new Date();
          const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now
            .getMinutes()
            .toString()
            .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
          setHistory((prev) => {
            const next = [...prev, { timestamp, cpu: data.cpu, memoryMB: data.memoryMB, playersOnline: data.playersOnline ?? 0 }];
            if (next.length > 40) next.shift();
            return next;
          });
        }
      }
    };

    socket.on('server:stats', handleStatsUpdate);

    return () => {
      socket.off('server:stats', handleStatsUpdate);
    };
  }, [server.config.id]);

  // ── Formateo de Uptime ──
  const formatUptime = (seconds: number) => {
    if (!seconds || seconds <= 0) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Ejecutar acción sobre jugador ──
  const handleExecutePlayerAction = async () => {
    if (!targetPlayer || !modalAction) return;
    setActionLoading(targetPlayer.name);
    try {
      await api.playerAction(server.config.id, targetPlayer.name, modalAction, actionReason);
      setModalAction(null);
      setTargetPlayer(null);
      setActionReason('');
      fetchStats();
    } catch (err: any) {
      alert(`Error al ejecutar acción: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const isServerOnline = server.status === 'ONLINE';

  return (
    <div className="space-y-6">
      {/* Aviso si el servidor no está online */}
      {!isServerOnline && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 text-amber-300">
          <AlertTriangle size={20} className="shrink-0" />
          <div className="text-sm">
            El servidor se encuentra actualmente <strong>{server.status}</strong>. Inicia el servidor para ver el consumo de CPU, RAM, TPS y jugadores conectados en tiempo real.
          </div>
        </div>
      )}

      {/* Cuadrícula de Tarjetas de Telemetría */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. CPU */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Uso de CPU</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Cpu size={18} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">
                {isServerOnline ? stats.cpu : 0}%
              </span>
              <span className="text-xs text-gray-400">Proceso Java</span>
            </div>
            {/* Barra de progreso */}
            <div className="w-full bg-[#21262d] h-2 rounded-full overflow-hidden mt-3">
              <div
                className={`h-full transition-all duration-500 ${
                  stats.cpu > 85 ? 'bg-rose-500' : stats.cpu > 65 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, stats.cpu)}%` }}
              />
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-3 flex justify-between">
            <span>PID: {stats.pid || 'N/A'}</span>
            <span>{stats.cpu > 70 ? 'Carga Alta' : 'Normal'}</span>
          </div>
        </div>

        {/* 2. Memoria RAM */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Memoria RAM</span>
            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg">
              <HardDrive size={18} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">
                {isServerOnline ? (stats.memoryMB / 1024).toFixed(2) : '0.00'}
              </span>
              <span className="text-xs text-gray-400">
                / {(stats.memoryMaxMB / 1024).toFixed(1)} GB asignados
              </span>
            </div>
            {/* Barra de progreso */}
            <div className="w-full bg-[#21262d] h-2 rounded-full overflow-hidden mt-3">
              <div
                className={`h-full transition-all duration-500 ${
                  stats.memoryPercent > 90
                    ? 'bg-rose-500'
                    : stats.memoryPercent > 75
                    ? 'bg-amber-500'
                    : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.min(100, stats.memoryPercent)}%` }}
              />
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-3 flex justify-between">
            <span>{stats.memoryPercent}% en uso</span>
            <span className="text-gray-400 font-mono">192 GB Host</span>
          </div>
        </div>

        {/* 3. TPS & Latencia */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Salud / TPS</span>
            <div className="p-2 bg-violet-500/10 text-violet-400 rounded-lg">
              <Zap size={18} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">
                {isServerOnline ? stats.tps.toFixed(1) : '20.0'}
              </span>
              <span className="text-xs text-gray-400">/ 20.0 TPS</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium mt-3">
              <CheckCircle2 size={14} />
              <span>{isServerOnline && stats.tps < 18 ? 'Ticks ralentizados' : 'Rendimiento Óptimo'}</span>
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-3 flex justify-between">
            <span>Ping local: {stats.pingMs !== null ? `${stats.pingMs} ms` : '--'}</span>
            <span>Tick target: 50ms</span>
          </div>
        </div>

        {/* 4. Tiempo Activo (Uptime) */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Tiempo Activo</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Clock size={18} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">
              {isServerOnline ? formatUptime(stats.uptimeSeconds) : 'Inactivo'}
            </div>
            <div className="text-xs text-gray-400 mt-3">
              {isServerOnline && server.startedAt
                ? `Iniciado a las ${new Date(server.startedAt).toLocaleTimeString()}`
                : 'Servidor detenido'}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-3 flex justify-between">
            <span>Puerto: {server.config.port || 25565}</span>
            <span className="text-emerald-400 font-medium">Auto-guardado activo</span>
          </div>
        </div>
      </div>

      {/* Gráficas de Rendimiento en Tiempo Real */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MetricsChart
          title="Consumo de CPU (%)"
          data={history}
          dataKey="cpu"
          unit="%"
          maxValue={100}
          color="emerald"
          height={190}
        />
        <MetricsChart
          title="Memoria RAM Ocupada (MB)"
          data={history}
          dataKey="memoryMB"
          unit="MB"
          maxValue={Math.round(server.config.memoryMB * 1.15)}
          color="cyan"
          height={190}
          thresholdValue={server.config.memoryMB}
          thresholdLabel="Límite asignado"
        />
      </div>

      {/* Gestor de Jugadores Conectados */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-emerald-400" />
            <h3 className="text-base font-semibold text-white">Jugadores Conectados</h3>
            <span className="bg-[#21262d] text-gray-300 text-xs px-2.5 py-0.5 rounded-full font-mono font-medium">
              {stats.playersOnline ?? 0} / {stats.playersMax ?? 20}
            </span>
          </div>
          <button
            onClick={fetchStats}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors bg-[#21262d] px-3 py-1.5 rounded-lg border border-[#30363d]"
          >
            <RefreshCw size={13} />
            Actualizar
          </button>
        </div>

        {/* Lista de jugadores */}
        {!stats.players || stats.players.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-[#30363d] rounded-xl">
            <Users size={36} className="mx-auto text-gray-600 mb-2" />
            <p className="text-sm text-gray-400 font-medium">No hay jugadores conectados en este momento</p>
            <p className="text-xs text-gray-600 mt-1">
              Conéctate en Minecraft a <code>localhost:{server.config.port || 25565}</code> para ver tu perfil aquí.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.players.map((p) => (
              <div
                key={p.name}
                className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3.5 flex items-center justify-between group hover:border-[#58a6ff]/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={p.avatarUrl}
                    alt={p.name}
                    className="w-10 h-10 rounded-md border border-[#30363d] bg-[#21262d] shrink-0"
                    onError={(e) => {
                      // Fallback si la API de skins no responde
                      (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/Steve/48';
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                      <span>{p.name}</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono truncate">
                      {p.uuid ? `${p.uuid.slice(0, 8)}...` : 'En línea'}
                    </div>
                  </div>
                </div>

                {/* Acciones de administración */}
                {canManagePlayers && (
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      title="Expulsar jugador"
                      onClick={() => {
                        setTargetPlayer(p);
                        setModalAction('kick');
                        setActionReason('');
                      }}
                      className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                    >
                      <UserX size={15} />
                    </button>
                    <button
                      title="Banear jugador"
                      onClick={() => {
                        setTargetPlayer(p);
                        setModalAction('ban');
                        setActionReason('');
                      }}
                      className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    >
                      <Ban size={15} />
                    </button>
                    <button
                      title="Dar rango OP"
                      onClick={() => {
                        setTargetPlayer(p);
                        setModalAction('op');
                        setActionReason('');
                      }}
                      className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                    >
                      <Shield size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmación de acción sobre jugador */}
      {modalAction && targetPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              {modalAction === 'kick' && <UserX className="text-amber-400" size={20} />}
              {modalAction === 'ban' && <Ban className="text-rose-400" size={20} />}
              {modalAction === 'op' && <Shield className="text-emerald-400" size={20} />}
              {modalAction === 'kick' && `Expulsar a ${targetPlayer.name}`}
              {modalAction === 'ban' && `Banear a ${targetPlayer.name}`}
              {modalAction === 'op' && `Dar permisos de Operador a ${targetPlayer.name}`}
            </h3>

            <p className="text-sm text-gray-400 mb-4">
              {modalAction === 'kick' && 'El jugador será desconectado del servidor inmediatamente, pero podrá volver a entrar.'}
              {modalAction === 'ban' && 'El jugador será expulsado y su cuenta añadida a la lista negra (banned-players.json).'}
              {modalAction === 'op' && 'El jugador obtendrá todos los permisos de administración (/op) en el servidor de Minecraft.'}
            </p>

            {(modalAction === 'kick' || modalAction === 'ban') && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-400 mb-1">Motivo (opcional):</label>
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Ej: Normas del servidor, conducta..."
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setModalAction(null);
                  setTargetPlayer(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionLoading !== null}
                onClick={handleExecutePlayerAction}
                className={`px-4 py-2 text-sm font-semibold rounded-xl text-white transition-colors ${
                  modalAction === 'ban'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : modalAction === 'kick'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {actionLoading ? 'Ejecutando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
