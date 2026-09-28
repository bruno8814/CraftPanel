// ============================================================
// PlayersManager.tsx — Gestor Visual de Jugadores de Minecraft
// ============================================================
// Gestiona:
//   1. Jugadores Conectados en Vivo (skins 3D, ping, acciones directas)
//   2. Operadores (ops.json) con niveles de permiso 1 a 4
//   3. Lista Blanca (whitelist.json) con alternador on/off
//   4. Baneos (banned-players.json y banned-ips.json)
//   5. Acciones en tiempo real: Kick, Ban, Gamemode, TP Spawn, Susurro
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserPlus,
  UserMinus,
  UserCheck,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Crown,
  Gamepad2,
  Compass,
  MessageSquare,
  LogOut,
  Gavel,
  Search,
  RefreshCw,
  Check,
  AlertCircle,
  X,
  Wifi,
  Info,
} from 'lucide-react';
import {
  ServerState,
  ServerPlayersData,
  ConnectedPlayer,
  OpPlayer,
  WhitelistPlayer,
  BannedPlayer,
  BannedIp,
} from '../types';
import { api } from '../api/client';

interface Props {
  server: ServerState;
}

type TabType = 'online' | 'ops' | 'whitelist' | 'bans';
type BanSubTab = 'players' | 'ips';

export default function PlayersManager({ server }: Props) {
  const { config, status } = server;
  const isOnline = status === 'ONLINE';

  const [activeTab, setActiveTab] = useState<TabType>('online');
  const [banSubTab, setBanSubTab] = useState<BanSubTab>('players');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Datos normalizados del backend
  const [playersData, setPlayersData] = useState<ServerPlayersData>({
    onlinePlayers: [],
    ops: [],
    whitelist: [],
    bannedPlayers: [],
    bannedIps: [],
    whitelistEnabled: false,
  });

  // Filtros de búsqueda
  const [searchQuery, setSearchQuery] = useState('');

  // Notificaciones locales
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  };

  // Modales
  const [modalType, setModalType] = useState<
    'add-op' | 'add-whitelist' | 'ban-player' | 'ban-ip' | 'kick' | 'whisper' | 'gamemode' | null
  >(null);
  const [targetPlayerName, setTargetPlayerName] = useState('');
  const [modalInput, setModalInput] = useState('');
  const [modalLevel, setModalLevel] = useState<number>(4);
  const [modalGamemode, setModalGamemode] = useState<'survival' | 'creative' | 'adventure' | 'spectator'>('survival');
  const [actionLoading, setActionLoading] = useState(false);

  // Normalizador defensivo para evitar cualquier crash de datos incompletos
  const normalizeData = (raw: any): ServerPlayersData => {
    if (!raw || typeof raw !== 'object') {
      return {
        onlinePlayers: [],
        ops: [],
        whitelist: [],
        bannedPlayers: [],
        bannedIps: [],
        whitelistEnabled: false,
      };
    }
    return {
      onlinePlayers: Array.isArray(raw.onlinePlayers)
        ? raw.onlinePlayers
        : Array.isArray(raw.players)
        ? raw.players
        : [],
      ops: Array.isArray(raw.ops) ? raw.ops : [],
      whitelist: Array.isArray(raw.whitelist) ? raw.whitelist : [],
      bannedPlayers: Array.isArray(raw.bannedPlayers) ? raw.bannedPlayers : [],
      bannedIps: Array.isArray(raw.bannedIps) ? raw.bannedIps : [],
      whitelistEnabled: Boolean(raw.whitelistEnabled),
    };
  };

  // Cargar datos
  const fetchPlayers = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const data = await api.getServerPlayers(config.id);
      setPlayersData(normalizeData(data));
    } catch (err: any) {
      if (!isSilent) {
        showToast('error', `Error al cargar jugadores: ${err.message || 'Error de conexión'}`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [config.id]);

  useEffect(() => {
    fetchPlayers();
    // Auto-refresco cada 8 segundos si el servidor está online para ver jugadores conectados
    const timer = setInterval(() => {
      fetchPlayers(true);
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchPlayers, isOnline]);

  // Colecciones seguras garantizadas
  const safeOnlinePlayers: ConnectedPlayer[] = playersData?.onlinePlayers || [];
  const safeOps: OpPlayer[] = playersData?.ops || [];
  const safeWhitelist: WhitelistPlayer[] = playersData?.whitelist || [];
  const safeBannedPlayers: BannedPlayer[] = playersData?.bannedPlayers || [];
  const safeBannedIps: BannedIp[] = playersData?.bannedIps || [];
  const isWhitelistEnabled: boolean = Boolean(playersData?.whitelistEnabled);

  // Sets para búsqueda rápida segura
  const opsSet = useMemo(() => {
    return new Set(
      safeOps
        .map((o) => (o?.name ? String(o.name).trim().toLowerCase() : ''))
        .filter(Boolean)
    );
  }, [safeOps]);

  const cleanQuery = (searchQuery || '').trim().toLowerCase();

  // ── Acciones de Whitelist ──
  const handleToggleWhitelist = async () => {
    setActionLoading(true);
    try {
      const res = await api.toggleWhitelist(config.id, !isWhitelistEnabled);
      setPlayersData((prev) => ({ ...prev, whitelistEnabled: res.whitelistEnabled }));
      showToast('success', `Lista blanca ${res.whitelistEnabled ? 'activada' : 'desactivada'}.`);
    } catch (err: any) {
      showToast('error', `Error al cambiar lista blanca: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddWhitelist = async () => {
    const clean = targetPlayerName.trim();
    if (!clean) return;
    setActionLoading(true);
    try {
      await api.addWhitelistPlayer(config.id, clean);
      showToast('success', `Jugador "${clean}" añadido a la lista blanca.`);
      setModalType(null);
      setTargetPlayerName('');
      await fetchPlayers(true);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveWhitelist = async (name: string) => {
    if (!confirm(`¿Eliminar a "${name}" de la lista blanca?`)) return;
    try {
      await api.removeWhitelistPlayer(config.id, name);
      showToast('success', `Jugador "${name}" eliminado de la lista blanca.`);
      await fetchPlayers(true);
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // ── Acciones de OPs ──
  const handleAddOp = async () => {
    const clean = targetPlayerName.trim();
    if (!clean) return;
    setActionLoading(true);
    try {
      await api.addOpPlayer(config.id, clean, modalLevel);
      showToast('success', `Jugador "${clean}" configurado como operador (Nivel ${modalLevel}).`);
      setModalType(null);
      setTargetPlayerName('');
      await fetchPlayers(true);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveOp = async (name: string) => {
    if (!confirm(`¿Revocar privilegios de operador a "${name}"?`)) return;
    try {
      await api.removeOpPlayer(config.id, name);
      showToast('success', `Privilegios de operador revocados a "${name}".`);
      await fetchPlayers(true);
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // ── Acciones de Baneos ──
  const handleBanPlayer = async () => {
    const clean = targetPlayerName.trim();
    if (!clean) return;
    setActionLoading(true);
    try {
      await api.banPlayer(config.id, clean, modalInput.trim() || 'Baneado por el administrador');
      showToast('success', `Jugador "${clean}" ha sido baneado.`);
      setModalType(null);
      setTargetPlayerName('');
      setModalInput('');
      await fetchPlayers(true);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnbanPlayer = async (name: string) => {
    if (!confirm(`¿Desbanear al jugador "${name}"?`)) return;
    try {
      await api.unbanPlayer(config.id, name);
      showToast('success', `Jugador "${name}" desbaneado con éxito.`);
      await fetchPlayers(true);
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleBanIp = async () => {
    const clean = targetPlayerName.trim();
    if (!clean) return;
    setActionLoading(true);
    try {
      await api.banIp(config.id, clean, modalInput.trim() || 'IP bloqueada por el administrador');
      showToast('success', `IP "${clean}" baneada.`);
      setModalType(null);
      setTargetPlayerName('');
      setModalInput('');
      await fetchPlayers(true);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnbanIp = async (ip: string) => {
    if (!confirm(`¿Desbanear la IP "${ip}"?`)) return;
    try {
      await api.unbanIp(config.id, ip);
      showToast('success', `IP "${ip}" desbaneada con éxito.`);
      await fetchPlayers(true);
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  // ── Acciones en Vivo ──
  const handleKickPlayer = async () => {
    if (!targetPlayerName) return;
    setActionLoading(true);
    try {
      await api.kickPlayer(config.id, targetPlayerName, modalInput.trim() || 'Expulsado por el administrador');
      showToast('success', `Jugador "${targetPlayerName}" expulsado.`);
      setModalType(null);
      setTargetPlayerName('');
      setModalInput('');
      await fetchPlayers(true);
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetGamemode = async () => {
    if (!targetPlayerName) return;
    setActionLoading(true);
    try {
      await api.setPlayerGamemode(config.id, targetPlayerName, modalGamemode);
      showToast('success', `Modo de "${targetPlayerName}" cambiado a ${modalGamemode}.`);
      setModalType(null);
      setTargetPlayerName('');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTeleportSpawn = async (name: string) => {
    try {
      await api.teleportPlayerToSpawn(config.id, name);
      showToast('success', `Jugador "${name}" teletransportado al spawn.`);
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleWhisper = async () => {
    if (!targetPlayerName || !modalInput.trim()) return;
    setActionLoading(true);
    try {
      await api.whisperPlayer(config.id, targetPlayerName, modalInput.trim());
      showToast('success', `Mensaje enviado a "${targetPlayerName}".`);
      setModalType(null);
      setTargetPlayerName('');
      setModalInput('');
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d1117] overflow-hidden text-panel-text">
      {/* ── Toast de Notificación ── */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium ${
              notification.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/90 border-red-500/30 text-red-300'
            }`}
          >
            {notification.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-80">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Barra Superior / Título ── */}
      <div className="border-b border-panel-border bg-panel-surface/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="text-panel-accent" size={22} />
            <h1 className="text-xl font-bold text-white tracking-tight">Gestor de Jugadores</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-panel-accent/10 border border-panel-accent/30 text-panel-accent font-medium">
              Minecraft Java
            </span>
          </div>
          <p className="text-xs text-panel-muted mt-1">
            Administra jugadores en vivo, operadores (ops), lista blanca de acceso y sanciones.
          </p>
        </div>

        {/* Botón Refrescar */}
        <button
          onClick={() => fetchPlayers(false)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-panel-border bg-panel-bg hover:bg-panel-surface text-panel-muted hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* ── Selector de Pestañas ── */}
      <div className="border-b border-panel-border bg-panel-surface/30 px-6 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => {
            setActiveTab('online');
            setSearchQuery('');
          }}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'online'
              ? 'border-panel-accent text-white'
              : 'border-transparent text-panel-muted hover:text-gray-300'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Conectados en Vivo</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-panel-bg border border-panel-border font-mono text-emerald-400">
            {safeOnlinePlayers.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('ops');
            setSearchQuery('');
          }}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'ops'
              ? 'border-panel-accent text-white'
              : 'border-transparent text-panel-muted hover:text-gray-300'
          }`}
        >
          <Crown size={15} className="text-amber-400" />
          <span>Operadores (Ops)</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-panel-bg border border-panel-border font-mono text-amber-400">
            {safeOps.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('whitelist');
            setSearchQuery('');
          }}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'whitelist'
              ? 'border-panel-accent text-white'
              : 'border-transparent text-panel-muted hover:text-gray-300'
          }`}
        >
          <ShieldCheck size={15} className={isWhitelistEnabled ? 'text-emerald-400' : 'text-gray-400'} />
          <span>Lista Blanca (Whitelist)</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-panel-bg border border-panel-border font-mono">
            {safeWhitelist.length}
          </span>
          {isWhitelistEnabled ? (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-medium">ON</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-500/20 text-gray-400 font-medium">OFF</span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('bans');
            setSearchQuery('');
          }}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'bans'
              ? 'border-panel-accent text-white'
              : 'border-transparent text-panel-muted hover:text-gray-300'
          }`}
        >
          <Gavel size={15} className="text-red-400" />
          <span>Baneados</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-panel-bg border border-panel-border font-mono text-red-400">
            {safeBannedPlayers.length + safeBannedIps.length}
          </span>
        </button>
      </div>

      {/* ── Contenido de la pestaña activa ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* ============================================================ */}
        {/* PESTAÑA 1: JUGADORES CONECTADOS                              */}
        {/* ============================================================ */}
        {activeTab === 'online' && (
          <div className="space-y-4">
            {!isOnline && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
                <Info size={18} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-200/90 leading-relaxed">
                  <strong className="text-amber-300">El servidor está OFFLINE.</strong> Las acciones en tiempo real (expulsar, cambiar modo de juego, teletransporte o susurros) requieren que el servidor esté iniciado. Puedes seguir gestionando la Lista Blanca, Operadores y Baneos en sus respectivas pestañas.
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">Jugadores Activos</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-panel-surface border border-panel-border text-panel-accent">
                  {safeOnlinePlayers.length} conectados
                </span>
              </div>
            </div>

            {safeOnlinePlayers.length === 0 ? (
              <div className="rounded-xl border border-panel-border bg-panel-surface/20 p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-panel-surface border border-panel-border flex items-center justify-center mb-3 text-panel-muted">
                  <Users size={28} />
                </div>
                <p className="text-sm font-medium text-white">No hay jugadores conectados ahora mismo</p>
                <p className="text-xs text-panel-muted max-w-sm mt-1">
                  Cuando alguien se una al servidor con su cliente de Minecraft, aparecerá aquí con su skin 3D, ping y opciones de administración.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {safeOnlinePlayers.map((player) => {
                  const playerName = player?.name || 'Desconocido';
                  const isPlayerOp = opsSet.has(playerName.toLowerCase());
                  return (
                    <div
                      key={playerName}
                      className="rounded-xl border border-panel-border bg-panel-surface/50 p-4 flex flex-col justify-between hover:border-panel-accent/40 transition-colors shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={`https://mc-heads.net/head/${player?.uuid || playerName}/64`}
                          alt={playerName}
                          className="w-12 h-12 rounded-lg bg-panel-bg border border-panel-border shadow-inner pixelated shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://mc-heads.net/avatar/${playerName}/64`;
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white text-sm truncate">{playerName}</span>
                            {isPlayerOp && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                                <Crown size={10} /> OP
                              </span>
                            )}
                          </div>
                          {player?.uuid && (
                            <p className="text-[10px] text-panel-muted font-mono truncate" title={player.uuid}>
                              {player.uuid}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {typeof player?.pingMs === 'number' && (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                  player.pingMs < 60
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : player.pingMs < 150
                                    ? 'bg-yellow-500/20 text-yellow-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                              >
                                <Wifi size={10} />
                                {player.pingMs} ms
                              </span>
                            )}
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              En línea
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Botones de acción directa */}
                      {isOnline && (
                        <div className="mt-4 pt-3 border-t border-panel-border/60 flex flex-wrap items-center gap-1.5">
                          {/* Alternar OP */}
                          {isPlayerOp ? (
                            <button
                              onClick={() => handleRemoveOp(playerName)}
                              className="px-2 py-1 rounded bg-panel-bg hover:bg-amber-950/30 border border-panel-border hover:border-amber-500/40 text-[11px] font-medium text-amber-400 flex items-center gap-1"
                              title="Revocar operador"
                            >
                              <Crown size={12} /> Quitar OP
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setTargetPlayerName(playerName);
                                setModalLevel(4);
                                setModalType('add-op');
                              }}
                              className="px-2 py-1 rounded bg-panel-bg hover:bg-amber-950/30 border border-panel-border hover:border-amber-500/40 text-[11px] font-medium text-amber-400 flex items-center gap-1"
                              title="Hacer operador"
                            >
                              <Crown size={12} /> Hacer OP
                            </button>
                          )}

                          {/* Gamemode */}
                          <button
                            onClick={() => {
                              setTargetPlayerName(playerName);
                              setModalGamemode('survival');
                              setModalType('gamemode');
                            }}
                            className="px-2 py-1 rounded bg-panel-bg hover:bg-panel-surface border border-panel-border text-[11px] font-medium text-gray-300 hover:text-white flex items-center gap-1"
                            title="Cambiar modo de juego"
                          >
                            <Gamepad2 size={12} /> Modo
                          </button>

                          {/* TP Spawn */}
                          <button
                            onClick={() => handleTeleportSpawn(playerName)}
                            className="px-2 py-1 rounded bg-panel-bg hover:bg-panel-surface border border-panel-border text-[11px] font-medium text-gray-300 hover:text-white flex items-center gap-1"
                            title="Teletransportar al spawn mundial"
                          >
                            <Compass size={12} /> Spawn
                          </button>

                          {/* Mensaje privado */}
                          <button
                            onClick={() => {
                              setTargetPlayerName(playerName);
                              setModalInput('');
                              setModalType('whisper');
                            }}
                            className="px-2 py-1 rounded bg-panel-bg hover:bg-panel-surface border border-panel-border text-[11px] font-medium text-gray-300 hover:text-white flex items-center gap-1"
                            title="Enviar mensaje en el chat"
                          >
                            <MessageSquare size={12} /> Mensaje
                          </button>

                          {/* Expulsar */}
                          <button
                            onClick={() => {
                              setTargetPlayerName(playerName);
                              setModalInput('Expulsado por el administrador');
                              setModalType('kick');
                            }}
                            className="px-2 py-1 rounded bg-panel-bg hover:bg-orange-950/40 border border-panel-border hover:border-orange-500/40 text-[11px] font-medium text-orange-400 flex items-center gap-1"
                            title="Expulsar del servidor"
                          >
                            <LogOut size={12} /> Expulsar
                          </button>

                          {/* Banear */}
                          <button
                            onClick={() => {
                              setTargetPlayerName(playerName);
                              setModalInput('Baneado por el administrador');
                              setModalType('ban-player');
                            }}
                            className="px-2 py-1 rounded bg-panel-bg hover:bg-red-950/40 border border-panel-border hover:border-red-500/40 text-[11px] font-medium text-red-400 flex items-center gap-1 ml-auto"
                            title="Banear del servidor"
                          >
                            <Gavel size={12} /> Banear
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* PESTAÑA 2: OPERADORES (OPS)                                  */}
        {/* ============================================================ */}
        {activeTab === 'ops' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-panel-muted" />
                <input
                  type="text"
                  placeholder="Buscar operador..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-panel-border bg-panel-surface text-xs text-white placeholder-panel-muted focus:outline-none focus:border-panel-accent"
                />
              </div>

              <button
                onClick={() => {
                  setTargetPlayerName('');
                  setModalLevel(4);
                  setModalType('add-op');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-semibold shadow transition-colors"
              >
                <Crown size={14} />
                <span>+ Añadir Operador</span>
              </button>
            </div>

            {/* Explicación rápida de niveles */}
            <div className="rounded-xl border border-panel-border bg-panel-surface/30 p-3 text-xs text-panel-muted flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-white">Niveles OP:</span>
              </div>
              <div><strong className="text-amber-400">1:</strong> Ignora protección de spawn</div>
              <div><strong className="text-amber-400">2:</strong> Comandos básicos (/clear, /gamemode, /tp)</div>
              <div><strong className="text-amber-400">3:</strong> Moderación (/kick, /ban, /op)</div>
              <div><strong className="text-amber-400">4:</strong> Administrador total (/stop)</div>
            </div>

            {safeOps.length === 0 ? (
              <div className="rounded-xl border border-panel-border bg-panel-surface/20 p-12 text-center flex flex-col items-center justify-center">
                <Crown size={28} className="text-panel-muted mb-2" />
                <p className="text-sm font-medium text-white">No hay operadores registrados</p>
                <p className="text-xs text-panel-muted max-w-sm mt-1">
                  Añade un jugador para otorgarle permisos de administración dentro de Minecraft.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {safeOps
                  .filter((op) => (op?.name || '').toLowerCase().includes(cleanQuery))
                  .map((op) => {
                    const opName = op?.name || 'Desconocido';
                    return (
                      <div
                        key={op?.uuid || opName}
                        className="rounded-xl border border-panel-border bg-panel-surface/50 p-4 flex items-center justify-between gap-3 hover:border-amber-500/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={`https://mc-heads.net/avatar/${opName}/64`}
                            alt={opName}
                            className="w-11 h-11 rounded-lg bg-panel-bg border border-panel-border pixelated shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-sm truncate">{opName}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Nivel {op?.level || 4}
                              </span>
                            </div>
                            {op?.uuid && (
                              <p className="text-[10px] text-panel-muted font-mono truncate" title={op.uuid}>
                                {op.uuid}
                              </p>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveOp(opName)}
                          className="px-2.5 py-1.5 rounded-lg border border-panel-border hover:border-red-500/40 bg-panel-bg hover:bg-red-950/30 text-xs text-red-400 font-medium transition-colors shrink-0"
                          title="Quitar permisos de operador"
                        >
                          Revocar
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* PESTAÑA 3: LISTA BLANCA (WHITELIST)                          */}
        {/* ============================================================ */}
        {activeTab === 'whitelist' && (
          <div className="space-y-4">
            {/* Tarjeta de estado de Whitelist */}
            <div className="rounded-xl border border-panel-border bg-panel-surface/50 p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isWhitelistEnabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-panel-bg text-panel-muted border border-panel-border'
                  }`}
                >
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">Estado de la Lista Blanca</span>
                    {isWhitelistEnabled ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        PROTEGIDO
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
                        ABIERTO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-panel-muted mt-0.5">
                    {isWhitelistEnabled
                      ? 'Solo los jugadores presentes en la lista pueden entrar al servidor.'
                      : 'Cualquier jugador puede unirse sin restricciones.'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleToggleWhitelist}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-xs font-semibold shadow transition-colors flex items-center gap-2 ${
                  isWhitelistEnabled
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30'
                    : 'bg-emerald-500 hover:bg-emerald-600 text-black'
                }`}
              >
                <Shield size={14} />
                <span>{isWhitelistEnabled ? 'Desactivar Lista Blanca' : 'Activar Lista Blanca'}</span>
              </button>
            </div>

            {/* Barra de búsqueda y botón añadir */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-panel-muted" />
                <input
                  type="text"
                  placeholder="Buscar en lista blanca..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-panel-border bg-panel-surface text-xs text-white placeholder-panel-muted focus:outline-none focus:border-panel-accent"
                />
              </div>

              <button
                onClick={() => {
                  setTargetPlayerName('');
                  setModalType('add-whitelist');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-accent hover:bg-panel-accent-hover text-white text-xs font-semibold shadow transition-colors"
              >
                <UserPlus size={14} />
                <span>+ Añadir Jugador</span>
              </button>
            </div>

            {safeWhitelist.length === 0 ? (
              <div className="rounded-xl border border-panel-border bg-panel-surface/20 p-12 text-center flex flex-col items-center justify-center">
                <ShieldCheck size={28} className="text-panel-muted mb-2" />
                <p className="text-sm font-medium text-white">La lista blanca está vacía</p>
                <p className="text-xs text-panel-muted max-w-sm mt-1">
                  Si activas la lista blanca sin añadir jugadores, nadie (excepto operadores) podrá entrar al servidor.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {safeWhitelist
                  .filter((w) => (w?.name || '').toLowerCase().includes(cleanQuery))
                  .map((player) => {
                    const playerName = player?.name || 'Desconocido';
                    const isOp = opsSet.has(playerName.toLowerCase());
                    return (
                      <div
                        key={player?.uuid || playerName}
                        className="rounded-xl border border-panel-border bg-panel-surface/50 p-4 flex items-center justify-between gap-3 hover:border-panel-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={`https://mc-heads.net/avatar/${playerName}/64`}
                            alt={playerName}
                            className="w-11 h-11 rounded-lg bg-panel-bg border border-panel-border pixelated shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white text-sm truncate">{playerName}</span>
                              {isOp && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                                  <Crown size={9} /> OP
                                </span>
                              )}
                            </div>
                            {player?.uuid && (
                              <p className="text-[10px] text-panel-muted font-mono truncate" title={player.uuid}>
                                {player.uuid}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!isOp && (
                            <button
                              onClick={() => {
                                setTargetPlayerName(playerName);
                                setModalLevel(4);
                                setModalType('add-op');
                              }}
                              className="p-1.5 rounded-lg border border-panel-border hover:border-amber-500/40 text-panel-muted hover:text-amber-400 bg-panel-bg"
                              title="Hacer OP"
                            >
                              <Crown size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveWhitelist(playerName)}
                            className="p-1.5 rounded-lg border border-panel-border hover:border-red-500/40 text-panel-muted hover:text-red-400 bg-panel-bg"
                            title="Eliminar de la lista blanca"
                          >
                            <UserMinus size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* PESTAÑA 4: BANEADOS (JUGADORES E IPS)                         */}
        {/* ============================================================ */}
        {activeTab === 'bans' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Selector de subpestaña */}
              <div className="flex items-center p-1 rounded-lg bg-panel-surface border border-panel-border text-xs font-medium">
                <button
                  onClick={() => setBanSubTab('players')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    banSubTab === 'players' ? 'bg-panel-bg text-white font-semibold shadow' : 'text-panel-muted hover:text-white'
                  }`}
                >
                  Jugadores ({safeBannedPlayers.length})
                </button>
                <button
                  onClick={() => setBanSubTab('ips')}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    banSubTab === 'ips' ? 'bg-panel-bg text-white font-semibold shadow' : 'text-panel-muted hover:text-white'
                  }`}
                >
                  Direcciones IP ({safeBannedIps.length})
                </button>
              </div>

              {/* Botón para añadir baneo */}
              {banSubTab === 'players' ? (
                <button
                  onClick={() => {
                    setTargetPlayerName('');
                    setModalInput('Baneado por el administrador');
                    setModalType('ban-player');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow transition-colors"
                >
                  <Gavel size={14} />
                  <span>+ Banear Jugador</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setTargetPlayerName('');
                    setModalInput('IP Bloqueada');
                    setModalType('ban-ip');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow transition-colors"
                >
                  <ShieldAlert size={14} />
                  <span>+ Bloquear IP</span>
                </button>
              )}
            </div>

            {/* Lista de Jugadores Baneados */}
            {banSubTab === 'players' && (
              <>
                {safeBannedPlayers.length === 0 ? (
                  <div className="rounded-xl border border-panel-border bg-panel-surface/20 p-12 text-center flex flex-col items-center justify-center">
                    <UserCheck size={28} className="text-emerald-400 mb-2" />
                    <p className="text-sm font-medium text-white">No hay jugadores baneados</p>
                    <p className="text-xs text-panel-muted max-w-sm mt-1">
                      El servidor está limpio de sanciones de jugadores.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {safeBannedPlayers.map((ban) => {
                      const banName = ban?.name || 'Desconocido';
                      const createdStr = ban?.created ? String(ban.created).slice(0, 16) : '';
                      return (
                        <div
                          key={ban?.uuid || banName}
                          className="rounded-xl border border-red-500/20 bg-panel-surface/50 p-4 flex flex-col justify-between gap-3 hover:border-red-500/40 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative shrink-0">
                              <img
                                src={`https://mc-heads.net/avatar/${banName}/64`}
                                alt={banName}
                                className="w-12 h-12 rounded-lg bg-panel-bg border border-panel-border pixelated grayscale opacity-80"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-red-500 font-bold text-xl drop-shadow">✕</span>
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-white text-sm truncate block">{banName}</span>
                              <p className="text-[11px] text-red-300 font-medium mt-0.5 line-clamp-2">
                                Motivo: {ban?.reason || 'Sin motivo especificado'}
                              </p>
                              {createdStr && (
                                <p className="text-[10px] text-panel-muted mt-1">
                                  Fecha: {createdStr}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-panel-border/60 flex items-center justify-end">
                            <button
                              onClick={() => handleUnbanPlayer(banName)}
                              className="px-3 py-1 rounded-lg bg-panel-bg hover:bg-emerald-950/30 border border-panel-border hover:border-emerald-500/40 text-xs text-emerald-400 font-medium transition-colors"
                            >
                              Desbanear
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Lista de IPs Baneadas */}
            {banSubTab === 'ips' && (
              <>
                {safeBannedIps.length === 0 ? (
                  <div className="rounded-xl border border-panel-border bg-panel-surface/20 p-12 text-center flex flex-col items-center justify-center">
                    <ShieldCheck size={28} className="text-emerald-400 mb-2" />
                    <p className="text-sm font-medium text-white">No hay direcciones IP bloqueadas</p>
                    <p className="text-xs text-panel-muted max-w-sm mt-1">
                      No se ha restringido el acceso a ninguna IP.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {safeBannedIps.map((ban) => {
                      const ipStr = ban?.ip || '0.0.0.0';
                      return (
                        <div
                          key={ipStr}
                          className="rounded-xl border border-red-500/20 bg-panel-surface/50 p-4 flex items-center justify-between gap-3 hover:border-red-500/40 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-red-950/40 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
                              <ShieldAlert size={20} />
                            </div>
                            <div className="min-w-0">
                              <span className="font-mono font-bold text-white text-sm truncate block">{ipStr}</span>
                              <p className="text-[11px] text-panel-muted truncate">
                                {ban?.reason || 'IP Bloqueada'}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleUnbanIp(ipStr)}
                            className="px-3 py-1 rounded-lg bg-panel-bg hover:bg-emerald-950/30 border border-panel-border hover:border-emerald-500/40 text-xs text-emerald-400 font-medium transition-colors shrink-0"
                          >
                            Desbloquear
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODALES DE ACCIONES                                          */}
      {/* ============================================================ */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-panel-border bg-panel-surface p-6 shadow-2xl space-y-4">
            {/* Header del modal */}
            <div className="flex items-center justify-between border-b border-panel-border pb-3">
              <div className="flex items-center gap-2">
                {modalType === 'add-op' && <Crown className="text-amber-400" size={18} />}
                {modalType === 'add-whitelist' && <UserPlus className="text-panel-accent" size={18} />}
                {modalType === 'ban-player' && <Gavel className="text-red-400" size={18} />}
                {modalType === 'ban-ip' && <ShieldAlert className="text-red-400" size={18} />}
                {modalType === 'kick' && <LogOut className="text-orange-400" size={18} />}
                {modalType === 'whisper' && <MessageSquare className="text-sky-400" size={18} />}
                {modalType === 'gamemode' && <Gamepad2 className="text-emerald-400" size={18} />}
                <h3 className="font-bold text-white text-base">
                  {modalType === 'add-op' && 'Configurar Operador'}
                  {modalType === 'add-whitelist' && 'Añadir a Lista Blanca'}
                  {modalType === 'ban-player' && `Banear a "${targetPlayerName || 'Jugador'}"`}
                  {modalType === 'ban-ip' && 'Bloquear Dirección IP'}
                  {modalType === 'kick' && `Expulsar a "${targetPlayerName}"`}
                  {modalType === 'whisper' && `Susurrar a "${targetPlayerName}"`}
                  {modalType === 'gamemode' && `Modo de juego para "${targetPlayerName}"`}
                </h3>
              </div>
              <button
                onClick={() => setModalType(null)}
                className="text-panel-muted hover:text-white p-1 rounded-lg hover:bg-panel-bg"
              >
                <X size={16} />
              </button>
            </div>

            {/* Cuerpo del modal según tipo */}
            {(modalType === 'add-op' || modalType === 'add-whitelist' || modalType === 'ban-player' || modalType === 'ban-ip') && (
              <div className="space-y-3">
                {modalType !== 'ban-ip' ? (
                  <div>
                    <label className="block text-xs font-semibold text-panel-muted mb-1">
                      Nombre de Usuario de Minecraft
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Ej. Notch, Alex..."
                        value={targetPlayerName}
                        onChange={(e) => setTargetPlayerName(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-panel-border bg-panel-bg text-sm text-white focus:outline-none focus:border-panel-accent"
                        autoFocus
                      />
                      {targetPlayerName.trim() && (
                        <img
                          src={`https://mc-heads.net/avatar/${targetPlayerName.trim()}/48`}
                          alt="preview"
                          className="w-10 h-10 rounded-lg bg-panel-bg border border-panel-border pixelated shrink-0"
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-panel-muted mb-1">
                      Dirección IP a Bloquear
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. 192.168.1.100"
                      value={targetPlayerName}
                      onChange={(e) => setTargetPlayerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-panel-border bg-panel-bg text-sm text-white font-mono focus:outline-none focus:border-panel-accent"
                      autoFocus
                    />
                  </div>
                )}

                {modalType === 'add-op' && (
                  <div>
                    <label className="block text-xs font-semibold text-panel-muted mb-1">
                      Nivel de Permiso OP
                    </label>
                    <select
                      value={modalLevel}
                      onChange={(e) => setModalLevel(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-panel-border bg-panel-bg text-sm text-white focus:outline-none focus:border-panel-accent"
                    >
                      <option value={4}>Nivel 4 — Administrador Total (Recomendado)</option>
                      <option value={3}>Nivel 3 — Moderador (/kick, /ban, /op)</option>
                      <option value={2}>Nivel 2 — Comandos de Juego (/gamemode, /tp, /give)</option>
                      <option value={1}>Nivel 1 — Ignorar protección de spawn</option>
                    </select>
                  </div>
                )}

                {(modalType === 'ban-player' || modalType === 'ban-ip') && (
                  <div>
                    <label className="block text-xs font-semibold text-panel-muted mb-1">
                      Motivo del Baneo
                    </label>
                    <input
                      type="text"
                      placeholder="Motivo que verá el jugador al intentar entrar"
                      value={modalInput}
                      onChange={(e) => setModalInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-panel-border bg-panel-bg text-sm text-white focus:outline-none focus:border-panel-accent"
                    />
                  </div>
                )}
              </div>
            )}

            {modalType === 'kick' && (
              <div>
                <label className="block text-xs font-semibold text-panel-muted mb-1">
                  Motivo de la Expulsión
                </label>
                <input
                  type="text"
                  placeholder="Expulsado por el administrador"
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-panel-border bg-panel-bg text-sm text-white focus:outline-none focus:border-panel-accent"
                  autoFocus
                />
              </div>
            )}

            {modalType === 'whisper' && (
              <div>
                <label className="block text-xs font-semibold text-panel-muted mb-1">
                  Mensaje Privado a {targetPlayerName}
                </label>
                <input
                  type="text"
                  placeholder="Escribe el mensaje aquí..."
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-panel-border bg-panel-bg text-sm text-white focus:outline-none focus:border-panel-accent"
                  autoFocus
                />
              </div>
            )}

            {modalType === 'gamemode' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-panel-muted mb-1">
                  Selecciona el nuevo modo de juego
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['survival', 'creative', 'adventure', 'spectator'] as const).map((gm) => (
                    <button
                      key={gm}
                      type="button"
                      onClick={() => setModalGamemode(gm)}
                      className={`p-3 rounded-xl border text-left transition-colors flex flex-col gap-0.5 ${
                        modalGamemode === gm
                          ? 'border-panel-accent bg-panel-accent/10 text-white'
                          : 'border-panel-border bg-panel-bg text-panel-muted hover:text-white'
                      }`}
                    >
                      <span className="font-bold text-xs capitalize">{gm}</span>
                      <span className="text-[10px] opacity-80">
                        {gm === 'survival' && 'Supervivencia'}
                        {gm === 'creative' && 'Creativo'}
                        {gm === 'adventure' && 'Aventura'}
                        {gm === 'spectator' && 'Espectador'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Footer con botones de confirmación */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-panel-border">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-xl border border-panel-border bg-panel-bg hover:bg-panel-surface text-xs font-medium text-panel-muted hover:text-white transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={actionLoading || (!targetPlayerName && modalType !== 'kick' && modalType !== 'whisper' && modalType !== 'gamemode')}
                onClick={() => {
                  if (modalType === 'add-op') handleAddOp();
                  else if (modalType === 'add-whitelist') handleAddWhitelist();
                  else if (modalType === 'ban-player') handleBanPlayer();
                  else if (modalType === 'ban-ip') handleBanIp();
                  else if (modalType === 'kick') handleKickPlayer();
                  else if (modalType === 'whisper') handleWhisper();
                  else if (modalType === 'gamemode') handleSetGamemode();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold shadow transition-colors flex items-center gap-1.5 disabled:opacity-50 ${
                  modalType === 'ban-player' || modalType === 'ban-ip'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : modalType === 'kick'
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : modalType === 'add-op'
                    ? 'bg-amber-500 hover:bg-amber-600 text-black'
                    : 'bg-panel-accent hover:bg-panel-accent-hover text-white'
                }`}
              >
                {actionLoading && <RefreshCw size={13} className="animate-spin" />}
                <span>
                  {modalType === 'add-op' && 'Guardar Operador'}
                  {modalType === 'add-whitelist' && 'Añadir a Whitelist'}
                  {modalType === 'ban-player' && 'Confirmar Baneo'}
                  {modalType === 'ban-ip' && 'Bloquear IP'}
                  {modalType === 'kick' && 'Expulsar'}
                  {modalType === 'whisper' && 'Enviar'}
                  {modalType === 'gamemode' && 'Aplicar Modo'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
