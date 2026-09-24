// ============================================================
// api/client.ts — Cliente para comunicarse con el backend
// ============================================================
// Aquí centralizamos TODAS las llamadas al backend.
// En vez de escribir fetch('/api/servers') en cada componente,
// importamos funciones limpias como api.getServers().
//
// También configuramos Socket.io para recibir datos en
// tiempo real (logs de la consola, cambios de estado).
// ============================================================

import { io, Socket } from 'socket.io-client';
import {
  ServerConfig,
  ServerState,
  CreateServerRequest,
  InstalledAddon,
  ModrinthSearchResponse,
  ModrinthVersion,
  ServerPropertiesData,
  FileItem,
  UserPublic,
  Permission,
  InvitationPin,
  SystemStats,
  ServerStats,
  ConnectedPlayer,
  BackupItem,
  BackupsResponse,
  ScheduleItem,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  AlertsConfig,
  CrashEvent,
  SystemVersionInfo,
} from '../types';


// ── Configuración base ──────────────────────────────────────

// En desarrollo, Vite hace proxy de /api y /socket.io al backend.
// En producción, ambos estarán en el mismo servidor.
const API_BASE = '/api';

// ── Cliente HTTP (REST API) ─────────────────────────────────

/**
 * Función auxiliar para hacer peticiones HTTP.
 * Añade automáticamente el token Bearer si existe y maneja errores.
 */
async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = localStorage.getItem('craftpanel_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(data.error || 'Error desconocido');
  }

  return data.data as T;
}

/** Objeto con todas las funciones de la API REST */
export const api = {
  /** Obtener la lista de todos los servidores */
  getServers: () => request<ServerState[]>('/servers'),

  /** Obtener un servidor por su ID */
  getServer: (id: string) => request<ServerState>(`/servers/${id}`),

  /** Crear un nuevo servidor */
  createServer: (data: CreateServerRequest) =>
    request<ServerConfig>('/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Arrancar un servidor */
  startServer: (id: string) =>
    request<void>(`/servers/${id}/start`, { method: 'POST' }),

  /** Detener un servidor limpiamente */
  stopServer: (id: string) =>
    request<void>(`/servers/${id}/stop`, { method: 'POST' }),

  /** Matar un servidor forzosamente */
  killServer: (id: string) =>
    request<void>(`/servers/${id}/kill`, { method: 'POST' }),

  /** Enviar un comando a la consola */
  sendCommand: (id: string, command: string) =>
    request<void>(`/servers/${id}/command`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),

  /** Eliminar un servidor */
  deleteServer: (id: string) =>
    request<void>(`/servers/${id}`, { method: 'DELETE' }),

  // ── Fase 3: Software y Versiones ──────────────────────

  /** Obtener versiones disponibles para un tipo de software */
  getVersions: (software: string) =>
    request<{ version: string; stable: boolean }[]>(`/software/${software}/versions`),

  /** Descargar el software del servidor (descarga el .jar) */
  downloadSoftware: (serverId: string) =>
    request<{ message: string; jarFile: string }>(`/servers/${serverId}/download`, {
      method: 'POST',
    }),

  // ── Fase 4: Workshop y Addons (Mods/Plugins) ──────────

  /** Buscar mods, plugins o modpacks en Modrinth */
  searchWorkshop: (params: {
    query?: string;
    type?: 'mod' | 'plugin' | 'modpack';
    version?: string;
    loader?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.query) searchParams.set('query', params.query);
    if (params.type) searchParams.set('type', params.type);
    if (params.version) searchParams.set('version', params.version);
    if (params.loader) searchParams.set('loader', params.loader);
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.offset) searchParams.set('offset', String(params.offset));
    return request<ModrinthSearchResponse>(`/workshop/search?${searchParams.toString()}`);
  },

  /** Obtener versiones compatibles de un proyecto */
  getProjectVersions: (id: string, params?: { version?: string; loader?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.version) searchParams.set('version', params.version);
    if (params?.loader) searchParams.set('loader', params.loader);
    const qs = searchParams.toString();
    return request<ModrinthVersion[]>(`/workshop/project/${id}/versions${qs ? `?${qs}` : ''}`);
  },

  /** Obtener lista de mods o plugins instalados en el servidor */
  getInstalledAddons: (serverId: string, type: 'mods' | 'plugins') =>
    request<InstalledAddon[]>(`/servers/${serverId}/addons/${type}`),

  /** Instalar un mod o plugin en el servidor */
  installAddon: (
    serverId: string,
    type: 'mods' | 'plugins',
    data: { downloadUrl: string; filename: string }
  ) =>
    request<{ message: string; filename: string }>(`/servers/${serverId}/addons/${type}/install`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Instalar un mod o plugin desde URL directa */
  installAddonByUrl: (
    serverId: string,
    type: 'mods' | 'plugins',
    data: { url: string; filename?: string }
  ) =>
    request<{ message: string; filename: string }>(`/servers/${serverId}/addons/${type}/install-url`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Subir un archivo .jar o .zip directamente como mod o plugin */
  uploadAddon: async (
    serverId: string,
    type: 'mods' | 'plugins',
    file: File
  ): Promise<{ message: string; filename: string }> => {
    const token = localStorage.getItem('craftpanel_token');
    const res = await fetch(
      `${API_BASE}/servers/${serverId}/addons/${type}/upload?filename=${encodeURIComponent(file.name)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/java-archive',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      }
    );
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al subir addon');
    return data;
  },

  /** Eliminar un mod o plugin instalado */
  uninstallAddon: (serverId: string, type: 'mods' | 'plugins', filename: string) =>
    request<{ message: string }>(`/servers/${serverId}/addons/${type}/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  /** Activar o desactivar un mod o plugin (.jar <-> .jar.disabled) */
  toggleAddon: (serverId: string, type: 'mods' | 'plugins', filename: string) =>
    request<{ enabled: boolean; newFilename: string }>(
      `/servers/${serverId}/addons/${type}/${encodeURIComponent(filename)}/toggle`,
      { method: 'POST' }
    ),

  // ── Fase 5: Ajustes (server.properties) y Archivos ───

  /** Obtener propiedades de server.properties */
  getServerProperties: (serverId: string) =>
    request<ServerPropertiesData>(`/servers/${serverId}/properties`),

  /** Guardar server.properties (visual o texto crudo) */
  saveServerProperties: (
    serverId: string,
    data: { properties?: Record<string, string>; raw?: string }
  ) =>
    request<{ message: string }>(`/servers/${serverId}/properties`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Listar archivos en una ruta del servidor */
  listFiles: (serverId: string, path?: string) =>
    request<FileItem[]>(`/servers/${serverId}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`),

  /** Obtener contenido de texto de un archivo */
  getFileContent: (serverId: string, path: string) =>
    request<{ content: string }>(`/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`),

  /** Guardar contenido de un archivo */
  saveFileContent: (serverId: string, data: { path: string; content: string }) =>
    request<{ message: string }>(`/servers/${serverId}/files/content`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Crear archivo o carpeta */
  createFileEntry: (
    serverId: string,
    data: { path?: string; name: string; isDirectory: boolean }
  ) =>
    request<{ message: string }>(`/servers/${serverId}/files/create`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Eliminar archivo o carpeta */
  deleteFileEntry: (serverId: string, path: string) =>
    request<{ message: string }>(`/servers/${serverId}/files?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    }),

  /** Renombrar archivo o carpeta */
  renameFileEntry: (serverId: string, data: { path: string; newName: string }) =>
    request<{ message: string }>(`/servers/${serverId}/files/rename`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Subir un archivo desde el PC al servidor */
  uploadFile: async (serverId: string, dirPath: string, file: File): Promise<{ message: string }> => {
    const token = localStorage.getItem('craftpanel_token');
    const res = await fetch(
      `${API_BASE}/servers/${serverId}/files/upload?filename=${encodeURIComponent(file.name)}&path=${encodeURIComponent(dirPath)}`,
      {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      }
    );
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al subir archivo');
    return data;
  },

  // ── Fase 6: Autenticación y Usuarios ──────────────────

  /** Comprobar si el sistema tiene ya un dueño configurado */
  getAuthStatus: () =>
    request<{ initialized: boolean }>('/auth/status'),

  /** Configuración inicial del Dueño / Administrador */
  setupOwner: (data: { email: string; password: string }) =>
    request<{ user: UserPublic; token: string }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Iniciar sesión */
  login: (data: { email: string; password: string }) =>
    request<{ user: UserPublic; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Registrarse con PIN de invitación */
  register: (data: { email: string; password: string; pin: string }) =>
    request<{ user: UserPublic; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Obtener el perfil del usuario actual */
  getMe: () =>
    request<UserPublic>('/auth/me'),

  /** Listar todos los usuarios (Admin) */
  getUsers: () =>
    request<UserPublic[]>('/admin/users'),

  /** Actualizar permisos de un usuario (Admin) */
  updateUserPermissions: (userId: string, permissions: Permission[]) =>
    request<UserPublic>(`/admin/users/${userId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),

  /** Eliminar usuario (Admin) */
  deleteUser: (userId: string) =>
    request<{ message: string }>(`/admin/users/${userId}`, {
      method: 'DELETE',
    }),

  /** Listar PINs de invitación (Admin) */
  getPins: () =>
    request<InvitationPin[]>('/admin/pins'),

  /** Generar un nuevo PIN (Admin) */
  createPin: () =>
    request<InvitationPin>('/admin/pins', {
      method: 'POST',
    }),

  /** Revocar un PIN (Admin) */
  revokePin: (code: string) =>
    request<{ message: string }>(`/admin/pins/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    }),

  // ── Fase 7: Telemetría, Rendimiento y Jugadores ──────────

  /** Obtener métricas globales de la máquina anfitriona (Host) */
  getSystemStats: () =>
    request<SystemStats>('/system/stats'),

  /** Obtener métricas en tiempo real e historial de un servidor */
  getServerStats: (id: string) =>
    request<ServerStats>(`/servers/${id}/stats`),

  /** Obtener jugadores conectados en vivo */
  getServerPlayers: (id: string) =>
    request<{ online: number; max: number; players: ConnectedPlayer[] }>(`/servers/${id}/players`),

  /** Ejecutar acción administrativa sobre un jugador (kick, ban, op, deop) */
  playerAction: (id: string, name: string, action: 'kick' | 'ban' | 'op' | 'deop', reason?: string) =>
    request<{ message: string }>(`/servers/${id}/players/${encodeURIComponent(name)}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    }),

  // ── Fase 8: Copias de Seguridad (Backups) ────────────────

  /** Listar todas las copias de seguridad de un servidor */
  getBackups: (serverId: string) =>
    request<BackupsResponse>(`/servers/${serverId}/backups`),

  /** Crear un nuevo backup */
  createBackup: (serverId: string, data?: { note?: string; excludeLogs?: boolean }) =>
    request<BackupItem>(`/servers/${serverId}/backups`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  /** Eliminar un backup */
  deleteBackup: (serverId: string, filename: string) =>
    request<{ message: string }>(`/servers/${serverId}/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  /** Restaurar un backup en 1-clic */
  restoreBackup: (serverId: string, filename: string) =>
    request<{ message: string }>(`/servers/${serverId}/backups/${encodeURIComponent(filename)}/restore`, {
      method: 'POST',
    }),

  /** Bloquear o desbloquear un backup con candado */
  toggleLockBackup: (serverId: string, filename: string) =>
    request<BackupItem>(`/servers/${serverId}/backups/${encodeURIComponent(filename)}/lock`, {
      method: 'PATCH',
    }),

  /** Subir un archivo .zip como nuevo backup */
  uploadBackup: async (serverId: string, file: File): Promise<BackupItem> => {
    const token = localStorage.getItem('craftpanel_token');
    const res = await fetch(`${API_BASE}/servers/${serverId}/backups/upload?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al subir backup');
    return data.data;
  },

  /** Obtener URL de descarga directa de un backup */
  getBackupDownloadUrl: (serverId: string, filename: string) =>
    `${API_BASE}/servers/${serverId}/backups/${encodeURIComponent(filename)}/download`,

  // ── Fase 9: Automatizaciones y Horarios Programados ───────

  /** Listar tareas programadas de un servidor */
  getSchedules: (serverId: string) =>
    request<ScheduleItem[]>(`/servers/${serverId}/schedules`),

  /** Crear una tarea programada */
  createSchedule: (serverId: string, data: CreateScheduleRequest) =>
    request<ScheduleItem>(`/servers/${serverId}/schedules`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Actualizar una tarea programada */
  updateSchedule: (serverId: string, scheduleId: string, data: UpdateScheduleRequest) =>
    request<ScheduleItem>(`/servers/${serverId}/schedules/${scheduleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Alternar estado activo/inactivo de una tarea */
  toggleSchedule: (serverId: string, scheduleId: string) =>
    request<ScheduleItem>(`/servers/${serverId}/schedules/${scheduleId}/toggle`, {
      method: 'PATCH',
    }),

  /** Eliminar una tarea programada */
  deleteSchedule: (serverId: string, scheduleId: string) =>
    request<{ message: string }>(`/servers/${serverId}/schedules/${scheduleId}`, {
      method: 'DELETE',
    }),

  /** Ejecutar o probar inmediatamente una tarea */
  runSchedule: (serverId: string, scheduleId: string, preview: boolean = false) =>
    request<{ message: string }>(`/servers/${serverId}/schedules/${scheduleId}/run${preview ? '?preview=true' : ''}`, {
      method: 'POST',
    }),

  // ── Fase 11: Alertas, Discord y Watchdog ─────────────────

  /** Obtener configuración de alertas y watchdog */
  getAlertsConfig: (serverId: string) =>
    request<AlertsConfig>(`/servers/${serverId}/alerts`),

  /** Guardar configuración de alertas */
  saveAlertsConfig: (serverId: string, data: Partial<AlertsConfig>) =>
    request<AlertsConfig>(`/servers/${serverId}/alerts`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Enviar webhook de prueba a Discord */
  testDiscordWebhook: (serverId: string, webhookUrl: string) =>
    request<{ message: string }>(`/servers/${serverId}/alerts/test`, {
      method: 'POST',
      body: JSON.stringify({ webhookUrl }),
    }),

  /** Obtener historial de caídas del Watchdog */
  getCrashHistory: (serverId: string) =>
    request<CrashEvent[]>(`/servers/${serverId}/alerts/crashes`),

  // ── Fase 12: Actualizaciones del Sistema ──────────────────

  /** Obtener versión actual del panel y comprobar actualizaciones de GitHub */
  getSystemVersion: () =>
    request<SystemVersionInfo>('/system/version'),

  /** Ejecutar actualización en caliente desde GitHub */
  triggerSystemUpdate: () =>
    request<{ message: string }>('/system/update', { method: 'POST' }),
};

// ── Cliente WebSocket (Socket.io) ───────────────────────────

/** Conexión WebSocket singleton (una sola para toda la app) */
let socket: Socket | null = null;

/**
 * Obtiene (o crea) la conexión WebSocket con el backend.
 *
 * Socket.io gestiona automáticamente:
 * - Reconexión si se pierde la conexión
 * - Fallback a HTTP polling si WebSocket no está disponible
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      // No especificamos URL porque Vite hace proxy automáticamente
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[CraftPanel] Conectado al backend via WebSocket');
    });

    socket.on('disconnect', () => {
      console.log('[CraftPanel] Desconectado del backend');
    });
  }
  return socket;
}
