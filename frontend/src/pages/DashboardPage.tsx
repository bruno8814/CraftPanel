// ============================================================
// DashboardPage.tsx — Página principal con la cuadrícula de servidores
// ============================================================
// Muestra todas las tarjetas de servidores en un grid responsive
// y un botón para crear nuevos servidores.
// ============================================================

import { useState, useEffect } from 'react';
import { Plus, RefreshCw, Server, Cpu, HardDrive } from 'lucide-react';
import { ServerState, ServerSoftware, SystemStats } from '../types';
import { api, getSocket } from '../api/client';
import ServerCard from '../components/ServerCard';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [servers, setServers] = useState<ServerState[]>([]);
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // ── Cargar servidores y telemetría ──
  const fetchServers = async () => {
    try {
      const [serverData, sysData] = await Promise.all([
        api.getServers(),
        api.getSystemStats().catch(() => null),
      ]);
      setServers(serverData);
      if (sysData) setSysStats(sysData);
    } catch (err) {
      console.error('Error al cargar datos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();

    // Escuchar cambios de estado y métricas del sistema en tiempo real
    const socket = getSocket();
    const handleStatus = () => {
      fetchServers();
    };
    const handleSysStats = (data: SystemStats) => {
      setSysStats(data);
    };

    socket.on('server:status', handleStatus);
    socket.on('system:stats', handleSysStats);

    return () => {
      socket.off('server:status', handleStatus);
      socket.off('system:stats', handleSysStats);
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* ── Banner de Telemetría del Sistema Anfitrión (Host) ── */}
      {sysStats && (
        <div className="mb-8 bg-[#161b22] border border-[#30363d] rounded-2xl p-5 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider font-mono">
                  Servidor Anfitrión Activo
                </span>
              </div>
              <h2 className="text-base font-bold text-white mt-1 truncate max-w-md">
                {sysStats.cpuModel.includes('Xeon') ? 'HP ProLiant DL380 Gen10 (Intel Xeon)' : sysStats.cpuModel}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {sysStats.cpuCores} núcleos lógicos &bull; Plataforma {sysStats.platform} &bull; Uptime {Math.floor(sysStats.uptimeSeconds / 3600)}h {Math.floor((sysStats.uptimeSeconds % 3600) / 60)}m
              </p>
            </div>

            {/* Medidores rápidos */}
            <div className="flex items-center gap-6 flex-wrap">
              {/* CPU Host */}
              <div className="min-w-[120px]">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Cpu size={13} className="text-emerald-400" /> CPU Host
                  </span>
                  <span className="font-mono font-bold text-white">{sysStats.cpuUsage}%</span>
                </div>
                <div className="w-full bg-[#21262d] h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      sysStats.cpuUsage > 80 ? 'bg-rose-500' : sysStats.cpuUsage > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, sysStats.cpuUsage)}%` }}
                  />
                </div>
              </div>

              {/* RAM Host (Mostrando los GB con contexto del total) */}
              <div className="min-w-[170px]">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400 flex items-center gap-1">
                    <HardDrive size={13} className="text-cyan-400" /> RAM Host
                  </span>
                  <span className="font-mono font-bold text-white">
                    {(sysStats.usedMemMB / 1024).toFixed(1)} / {(sysStats.totalMemMB / 1024).toFixed(0)} GB
                  </span>
                </div>
                <div className="w-full bg-[#21262d] h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      sysStats.memUsagePercent > 85
                        ? 'bg-rose-500'
                        : sysStats.memUsagePercent > 70
                        ? 'bg-amber-500'
                        : 'bg-cyan-500'
                    }`}
                    style={{ width: `${Math.min(100, sysStats.memUsagePercent)}%` }}
                  />
                </div>
              </div>

              {/* Servidores Online */}
              <div className="hidden sm:block text-right border-l border-[#30363d] pl-6">
                <span className="text-xs text-gray-400 block">Servidores Online</span>
                <span className="text-lg font-bold font-mono text-emerald-400">
                  {servers.filter((s) => s.status === 'ONLINE').length}{' '}
                  <span className="text-xs text-gray-500 font-normal">/ {servers.length}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Encabezado ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tus Servidores</h1>
          <p className="mt-1 text-sm text-panel-muted">
            {servers.length} servidor{servers.length !== 1 && 'es'} configurado
            {servers.length !== 1 && 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchServers}
            className="rounded-lg border border-panel-border p-2 text-panel-muted
                       transition-colors hover:border-panel-accent/40 hover:text-white"
            title="Refrescar"
          >
            <RefreshCw size={18} />
          </button>
          {(user?.isOwner || hasPermission('servers:create')) && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-panel-accent px-4 py-2
                         text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              <Plus size={18} /> Nuevo Servidor
            </button>
          )}
        </div>
      </div>

      {/* ── Grid de servidores ── */}
      {loading ? (
        <div className="mt-16 flex flex-col items-center justify-center text-panel-muted">
          <RefreshCw size={32} className="animate-spin" />
          <p className="mt-3">Cargando servidores...</p>
        </div>
      ) : servers.length === 0 && !showCreate ? (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <div className="rounded-2xl bg-panel-surface p-6">
            <Server size={48} className="mx-auto text-panel-muted" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">
            No tienes servidores todavía
          </h2>
          <p className="mt-1 text-sm text-panel-muted">
            Crea tu primer servidor de Minecraft para empezar.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-panel-accent px-4 py-2
                       text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            <Plus size={18} /> Crear Servidor
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <ServerCard key={server.config.id} server={server} onRefresh={fetchServers} />
          ))}
        </div>
      )}

      {/* ── Modal: Crear nuevo servidor ── */}
      {showCreate && (
        <CreateServerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchServers();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Modal para crear un nuevo servidor
// ═══════════════════════════════════════════════════════════════

function CreateServerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [software, setSoftware] = useState<ServerSoftware>('paper');
  const [version, setVersion] = useState('');
  const [memoryMB, setMemoryMB] = useState(2048);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'config' | 'downloading'>('config');
  const [downloadStatus, setDownloadStatus] = useState('');

  // ── Cargar versiones dinámicamente cuando cambia el software ──
  const [versions, setVersions] = useState<{ version: string; stable: boolean }[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingVersions(true);
    setVersions([]);
    setVersion('');

    api.getVersions(software)
      .then((data) => {
        if (cancelled) return;
        // Filtrar solo versiones estables por defecto
        const stableVersions = data.filter((v) => v.stable);
        setVersions(stableVersions.length > 0 ? stableVersions : data);
        // Seleccionar la primera (más reciente) por defecto
        if (stableVersions.length > 0) setVersion(stableVersions[0].version);
        else if (data.length > 0) setVersion(data[0].version);
      })
      .catch((err) => {
        if (!cancelled) setError(`Error al cargar versiones: ${err.message}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });

    return () => { cancelled = true; };
  }, [software]);

  const softwareOptions: { value: ServerSoftware; label: string; desc: string }[] = [
    { value: 'neoforge', label: '⚡ NeoForge', desc: 'Mods · El estándar moderno (1.21+) · Recomendado' },
    { value: 'paper', label: '📄 Paper', desc: 'Plugins · Optimizado · El más popular' },
    { value: 'fabric', label: '🧵 Fabric', desc: 'Mods · Ligero · Moderno' },
    { value: 'vanilla', label: '🟫 Vanilla', desc: 'El servidor oficial de Mojang' },
    { value: 'forge', label: '🔨 Forge', desc: 'Mods · El clásico (1.20.1 y anteriores) · Próximamente' },
    { value: 'mohist', label: '⚗️ Mohist', desc: 'Mods + Plugins · Próximamente' },
  ];

  const memoryOptions = [
    { value: 1024, label: '1 GB' },
    { value: 2048, label: '2 GB' },
    { value: 4096, label: '4 GB' },
    { value: 8192, label: '8 GB' },
    { value: 12288, label: '12 GB' },
    { value: 16384, label: '16 GB' },
    { value: 24576, label: '24 GB' },
    { value: 32768, label: '32 GB' },
    { value: 49152, label: '48 GB' },
    { value: 65536, label: '64 GB' },
    { value: 98304, label: '96 GB' },
    { value: 131072, label: '128 GB' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      // Paso 1: Crear el servidor (carpeta, config, eula.txt)
      const created = await api.createServer({ name, software, version, memoryMB });

      // Paso 2: Descargar el .jar automáticamente
      setStep('downloading');
      setDownloadStatus(`Descargando ${software} ${version}... Esto puede tardar unos segundos.`);

      try {
        await api.downloadSoftware(created.id);
        setDownloadStatus('¡Descarga completada! El servidor está listo.');
        // Esperar un segundo para que el usuario vea el mensaje
        setTimeout(() => onCreated(), 1000);
      } catch (dlErr: any) {
        // Si falla la descarga, el servidor se creó pero sin jar
        setDownloadStatus('');
        setError(
          `El servidor se creó pero no se pudo descargar el .jar: ${dlErr.message}. ` +
          `Puedes intentar descargarlo de nuevo desde el panel del servidor.`
        );
        setStep('config');
        setSubmitting(false);
      }
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  // ── Vista de descarga en progreso ──
  if (step === 'downloading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-xl border border-panel-border bg-panel-surface p-8 shadow-2xl text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-panel-accent/10 flex items-center justify-center mb-4">
            <RefreshCw size={24} className="text-panel-accent animate-spin" />
          </div>
          <h2 className="text-lg font-bold">Preparando servidor</h2>
          <p className="mt-2 text-sm text-panel-muted">{downloadStatus}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-panel-border bg-panel-surface p-6 shadow-2xl">
        <h2 className="text-xl font-bold">Crear nuevo servidor</h2>
        <p className="mt-1 text-sm text-panel-muted">
          Configura los ajustes básicos. El software se descargará automáticamente.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-panel-muted mb-1.5">
              Nombre del servidor
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Survival con amigos"
              className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2
                         text-sm text-white outline-none transition-colors
                         placeholder:text-zinc-600 focus:border-panel-accent/50"
              required
            />
          </div>

          {/* Tipo de servidor */}
          <div>
            <label className="block text-sm font-medium text-panel-muted mb-1.5">
              Tipo de servidor
            </label>
            <div className="grid grid-cols-1 gap-2">
              {softwareOptions.map((opt) => {
                const isDisabled = opt.value === 'forge' || opt.value === 'mohist';
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3
                               transition-colors ${
                                 isDisabled
                                   ? 'border-panel-border opacity-40 cursor-not-allowed'
                                   : software === opt.value
                                     ? 'border-panel-accent/50 bg-panel-accent/5'
                                     : 'border-panel-border hover:bg-panel-hover'
                               }`}
                  >
                    <input
                      type="radio"
                      name="software"
                      value={opt.value}
                      checked={software === opt.value}
                      onChange={() => !isDisabled && setSoftware(opt.value)}
                      disabled={isDisabled}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-panel-muted">{opt.desc}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Versión y RAM en fila */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-panel-muted mb-1.5">
                Versión de Minecraft
              </label>
              {loadingVersions ? (
                <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-panel-muted">
                  <RefreshCw size={14} className="animate-spin" /> Cargando...
                </div>
              ) : (
                <select
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2
                             text-sm text-white outline-none transition-colors
                             focus:border-panel-accent/50"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      {v.version} {v.stable ? '' : '(snapshot)'}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-panel-muted mb-1.5">
                Memoria RAM
              </label>
              <select
                value={memoryMB}
                onChange={(e) => setMemoryMB(Number(e.target.value))}
                className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2
                           text-sm text-white outline-none transition-colors
                           focus:border-panel-accent/50"
              >
                {memoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-panel-danger/10 px-3 py-2 text-sm text-panel-danger">
              {error}
            </p>
          )}

          {/* Botones */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-panel-border px-4 py-2 text-sm text-panel-muted
                         transition-colors hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !version}
              className="rounded-lg bg-panel-accent px-4 py-2 text-sm font-medium text-white
                         transition-colors hover:bg-blue-600
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creando...' : 'Crear y Descargar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

