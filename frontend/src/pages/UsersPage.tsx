// ============================================================
// UsersPage.tsx — Panel de gestión de usuarios, permisos y PINs
// ============================================================
// Solo accesible por el Dueño (Owner) o usuarios con permiso users:manage.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  Users,
  KeyRound,
  Shield,
  ShieldCheck,
  Check,
  Copy,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  Clock,
  UserCheck,
} from 'lucide-react';
import { UserPublic, Permission, InvitationPin } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface PermissionOption {
  key: Permission;
  label: string;
  description: string;
}

const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    key: 'servers:view',
    label: 'Ver Servidores',
    description: 'Ver la lista de servidores y su estado en tiempo real',
  },
  {
    key: 'servers:control',
    label: 'Control de Energía',
    description: 'Iniciar, detener, reiniciar y forzar apagado',
  },
  {
    key: 'servers:console',
    label: 'Consola y Comandos',
    description: 'Ver logs en vivo y enviar comandos a la consola',
  },
  {
    key: 'servers:create',
    label: 'Crear Servidores',
    description: 'Crear y descargar nuevos servidores',
  },
  {
    key: 'servers:delete',
    label: 'Eliminar Servidores',
    description: 'Eliminar servidores y sus carpetas',
  },
  {
    key: 'workshop:manage',
    label: 'Workshop (Mods y Plugins)',
    description: 'Instalar, desinstalar y activar/desactivar mods',
  },
  {
    key: 'files:edit',
    label: 'Explorador de Archivos',
    description: 'Navegar, editar, crear y borrar archivos del servidor',
  },
  {
    key: 'settings:edit',
    label: 'Editar Ajustes',
    description: 'Modificar la configuración de server.properties',
  },
  {
    key: 'users:manage',
    label: 'Administrar Usuarios',
    description: 'Gestionar permisos y generar PINs de invitación',
  },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'users' | 'pins'>('users');
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [pins, setPins] = useState<InvitationPin[]>([]);
  const [loading, setLoading] = useState(true);

  // Permisos en edición por usuario: { [userId]: Permission[] }
  const [editingPermissions, setEditingPermissions] = useState<Record<string, Permission[]>>({});
  const [savingUser, setSavingUser] = useState<string | null>(null);

  // PINs
  const [generatingPin, setGeneratingPin] = useState(false);
  const [copiedPin, setCopiedPin] = useState<string | null>(null);

  // Notificaciones
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // ── Cargar usuarios y PINs ──
  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersData, pinsData] = await Promise.all([
        api.getUsers(),
        api.getPins(),
      ]);
      setUsers(usersData);
      setPins(pinsData);

      // Inicializar mapa de permisos
      const initialPerms: Record<string, Permission[]> = {};
      for (const u of usersData) {
        initialPerms[u.id] = u.permissions;
      }
      setEditingPermissions(initialPerms);
    } catch (err: any) {
      showNotification('error', `Error al cargar datos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── Modificar permiso en el estado local ──
  const handleTogglePerm = (userId: string, perm: Permission) => {
    setEditingPermissions((prev) => {
      const current = prev[userId] || [];
      const has = current.includes(perm);
      return {
        ...prev,
        [userId]: has ? current.filter((p) => p !== perm) : [...current, perm],
      };
    });
  };

  // ── Guardar permisos en el backend ──
  const handleSavePermissions = async (userId: string) => {
    setSavingUser(userId);
    try {
      const perms = editingPermissions[userId] || [];
      await api.updateUserPermissions(userId, perms);
      showNotification('success', 'Permisos actualizados correctamente.');
      await fetchData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setSavingUser(null);
    }
  };

  // ── Eliminar usuario ──
  const handleDeleteUser = async (user: UserPublic) => {
    if (!confirm(`¿Eliminar al usuario "${user.email}"? Perderá acceso inmediatamente.`)) return;

    try {
      await api.deleteUser(user.id);
      showNotification('success', `Usuario ${user.email} eliminado.`);
      await fetchData();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // ── Generar nuevo PIN ──
  const handleCreatePin = async () => {
    setGeneratingPin(true);
    try {
      const newPin = await api.createPin();
      showNotification('success', `¡PIN generado: ${newPin.code}!`);
      await fetchData();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setGeneratingPin(false);
    }
  };

  // ── Revocar PIN ──
  const handleRevokePin = async (code: string) => {
    try {
      await api.revokePin(code);
      showNotification('success', `PIN ${code} revocado.`);
      await fetchData();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // ── Copiar PIN al portapapeles ──
  const handleCopyPin = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedPin(code);
    setTimeout(() => setCopiedPin(null), 2000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-panel-bg">
      {/* ── Barra Superior ── */}
      <div className="border-b border-panel-border bg-panel-surface/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-panel-accent" /> Administración de Usuarios
          </h2>
          <p className="text-xs text-panel-muted mt-0.5">
            Gestiona cuentas de amigos, permisos granulares y PINs de invitación
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-panel-border bg-panel-bg p-1 text-xs">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-panel-accent text-white shadow'
                : 'text-panel-muted hover:text-white'
            }`}
          >
            <Users size={13} /> Usuarios ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('pins')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'pins'
                ? 'bg-panel-accent text-white shadow'
                : 'text-panel-muted hover:text-white'
            }`}
          >
            <KeyRound size={13} /> PINs de Invitación ({pins.filter((p) => !p.used).length})
          </button>
        </div>
      </div>

      {/* ── Banner de Notificación ── */}
      {notification && (
        <div
          className={`px-6 py-2.5 text-sm font-medium flex items-center gap-2 transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-b border-red-500/20'
          }`}
        >
          {notification.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* ── PESTAÑA 1: USUARIOS ── */}
      {activeTab === 'users' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-panel-muted">
              <RefreshCw size={28} className="animate-spin text-panel-accent" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-panel-muted py-10">No hay usuarios registrados.</p>
          ) : (
            users.map((u) => {
              const perms = editingPermissions[u.id] || [];
              const isSaving = savingUser === u.id;
              const hasUnsavedChanges =
                JSON.stringify(perms.sort()) !== JSON.stringify([...u.permissions].sort());

              return (
                <div
                  key={u.id}
                  className="rounded-xl border border-panel-border bg-panel-surface p-5 transition-colors"
                >
                  {/* Cabecera del usuario */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-panel-border/60">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          u.isOwner
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-panel-accent/20 text-panel-accent border border-panel-accent/30'
                        }`}
                      >
                        {u.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{u.email}</span>
                          {u.isOwner ? (
                            <span className="rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium flex items-center gap-1">
                              👑 Dueño (Owner)
                            </span>
                          ) : (
                            <span className="rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 text-[11px] font-medium flex items-center gap-1">
                              Amigo
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-panel-muted">
                          Registrado el {new Date(u.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Acciones */}
                    {!u.isOwner && (
                      <div className="flex items-center gap-2">
                        {hasUnsavedChanges && (
                          <button
                            onClick={() => handleSavePermissions(u.id)}
                            disabled={isSaving}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-panel-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                          >
                            {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                            Guardar Permisos
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="rounded-lg p-1.5 text-panel-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Eliminar usuario"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Matriz de Permisos */}
                  {u.isOwner ? (
                    <div className="pt-3 text-xs text-panel-muted flex items-center gap-2">
                      <ShieldCheck size={15} className="text-amber-400" />
                      <span>El Dueño tiene acceso total y permanente a todas las funciones del panel.</span>
                    </div>
                  ) : (
                    <div className="pt-4">
                      <h4 className="text-xs font-semibold text-panel-muted uppercase tracking-wider mb-3">
                        Permisos Granulares
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                        {PERMISSION_OPTIONS.map((opt) => {
                          const checked = perms.includes(opt.key);

                          return (
                            <label
                              key={opt.key}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                                checked
                                  ? 'border-panel-accent/40 bg-panel-accent/5'
                                  : 'border-panel-border/60 bg-panel-bg/50 hover:bg-panel-hover'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleTogglePerm(u.id, opt.key)}
                                className="mt-0.5 rounded border-panel-border bg-panel-bg text-panel-accent focus:ring-0"
                              />
                              <div>
                                <span className={`text-xs font-medium block ${checked ? 'text-white' : 'text-zinc-400'}`}>
                                  {opt.label}
                                </span>
                                <span className="text-[10px] text-panel-muted block leading-tight mt-0.5">
                                  {opt.description}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── PESTAÑA 2: PINS DE INVITACIÓN ── */}
      {activeTab === 'pins' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Cabecera con botón de crear */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-panel-border bg-panel-surface">
            <div>
              <h3 className="text-sm font-semibold text-white">Generar PIN de Invitación</h3>
              <p className="text-xs text-panel-muted mt-0.5">
                Los amigos necesitan un PIN para poder crearse una cuenta en tu panel.
              </p>
            </div>
            <button
              onClick={handleCreatePin}
              disabled={generatingPin}
              className="inline-flex items-center gap-1.5 rounded-lg bg-panel-accent px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors shadow"
            >
              {generatingPin ? (
                <>
                  <RefreshCw size={13} className="animate-spin" /> Generando...
                </>
              ) : (
                <>
                  <Plus size={14} /> Crear Nuevo PIN
                </>
              )}
            </button>
          </div>

          {/* Tabla de PINs */}
          <div className="rounded-xl border border-panel-border bg-panel-surface overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-panel-border bg-panel-bg/40 text-xs text-panel-muted font-medium">
                <tr>
                  <th className="px-4 py-3">Código PIN</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 hidden md:table-cell">Creado por</th>
                  <th className="px-4 py-3 hidden md:table-cell">Fecha</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-panel-border">
                {pins.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-panel-muted">
                      No hay PINs creados todavía. Haz clic en "Crear Nuevo PIN" para invitar a un amigo.
                    </td>
                  </tr>
                ) : (
                  pins.map((pin) => (
                    <tr key={pin.code} className="hover:bg-panel-hover/40 transition-colors">
                      {/* Código PIN */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-bold text-panel-accent tracking-wider bg-panel-accent/10 border border-panel-accent/20 px-2.5 py-1 rounded-lg">
                            {pin.code}
                          </span>
                          {!pin.used && (
                            <button
                              onClick={() => handleCopyPin(pin.code)}
                              className="rounded p-1 text-panel-muted hover:text-white transition-colors"
                              title="Copiar PIN"
                            >
                              {copiedPin === pin.code ? (
                                <Check size={14} className="text-emerald-400" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        {pin.used ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 text-xs font-medium">
                            <UserCheck size={12} /> Usado por {pin.usedBy}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-xs font-medium">
                            <Clock size={12} /> Disponible
                          </span>
                        )}
                      </td>

                      {/* Creado por */}
                      <td className="px-4 py-3 text-xs text-panel-muted hidden md:table-cell">
                        {pin.createdBy}
                      </td>

                      {/* Fecha */}
                      <td className="px-4 py-3 text-xs text-panel-muted hidden md:table-cell">
                        {new Date(pin.createdAt).toLocaleString()}
                      </td>

                      {/* Botón Revocar */}
                      <td className="px-4 py-3 text-right">
                        {!pin.used && (
                          <button
                            onClick={() => handleRevokePin(pin.code)}
                            className="rounded p-1 text-panel-muted hover:text-red-400 transition-colors"
                            title="Revocar PIN"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
