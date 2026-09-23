// ============================================================
// types.ts — Definiciones de tipos compartidas
// ============================================================
// Aquí definimos las "formas" de datos que usará todo el backend.
// Piensa en cada "interface" como un molde: describe qué campos
// tiene un objeto y de qué tipo es cada uno (string, number, etc.).
// ============================================================

/**
 * Los posibles estados de un servidor de Minecraft.
 *
 * - OFFLINE:   El servidor no está corriendo.
 * - STARTING:  El proceso Java se ha lanzado pero el servidor aún
 *              no ha terminado de cargar el mundo.
 * - ONLINE:    El servidor está listo y aceptando jugadores.
 * - STOPPING:  Se ha enviado el comando /stop y estamos esperando
 *              a que el proceso termine limpiamente.
 */
export type ServerStatus = 'OFFLINE' | 'STARTING' | 'ONLINE' | 'STOPPING';

/**
 * Tipos de software de servidor soportados.
 *
 * - vanilla: El servidor oficial de Mojang, sin mods ni plugins.
 * - paper:   PaperMC, optimizado para rendimiento + plugins Bukkit/Spigot.
 * - fabric:  Fabric, cargador de mods ligero y moderno.
 * - forge:   Forge/NeoForge, el cargador de mods clásico.
 * - mohist:  Mohist, híbrido que soporta mods + plugins a la vez.
 */
export type ServerSoftware = 'vanilla' | 'paper' | 'fabric' | 'forge' | 'mohist' | 'neoforge';

/**
 * Configuración persistente de un servidor de Minecraft.
 * Esto es lo que se guarda en disco en el archivo `mc-panel.json`
 * dentro de la carpeta de cada servidor.
 */
export interface ServerConfig {
  /** Identificador único del servidor (UUID generado automáticamente) */
  id: string;

  /** Nombre amigable que el usuario le pone (ej. "Survival con amigos") */
  name: string;

  /** Tipo de software del servidor */
  software: ServerSoftware;

  /** Versión de Minecraft (ej. "1.20.4", "1.21") */
  version: string;

  /** Memoria máxima asignada en megabytes (ej. 2048 = 2GB) */
  memoryMB: number;

  /** Puerto en el que escucha el servidor (por defecto 25565) */
  port: number;

  /** Ruta absoluta a la carpeta del servidor en disco */
  directory: string;

  /** Nombre del archivo .jar del servidor (ej. "server.jar", "paper-1.20.4-496.jar") */
  jarFile: string;

  /** Fecha de creación en formato ISO */
  createdAt: string;
}

/**
 * Estado en tiempo real de un servidor (lo que se envía al frontend).
 * Combina la configuración guardada + información "viva" del proceso.
 */
export interface ServerState {
  /** La configuración persistente del servidor */
  config: ServerConfig;

  /** Estado actual del servidor */
  status: ServerStatus;

  /** PID del proceso Java (null si no está corriendo) */
  pid: number | null;

  /** Últimas líneas de la consola (buffer circular) */
  consoleBuffer: string[];

  /** Timestamp de cuándo se inició el servidor (null si está apagado) */
  startedAt: string | null;

  /** Indica si el archivo .jar existe en la carpeta */
  jarExists: boolean;
}

/**
 * Datos que envía el usuario cuando quiere crear un nuevo servidor.
 */
export interface CreateServerRequest {
  name: string;
  software: ServerSoftware;
  version: string;
  memoryMB: number;
  port?: number; // Opcional, se autoasigna si no se indica
}

/**
 * Eventos que emite el ProcessManager por WebSocket.
 */
export interface ServerEvents {
  /** Una nueva línea de log del servidor */
  'server:log': { serverId: string; line: string; timestamp: string };

  /** El estado del servidor ha cambiado */
  'server:status': { serverId: string; status: ServerStatus };

  /** El proceso del servidor ha terminado */
  'server:exit': { serverId: string; code: number | null; signal: string | null };
}

// ============================================================
// Tipos para Automatizaciones y Horarios Programados (Fase 9)
// ============================================================

export type ScheduleAction =
  | 'START'          // Iniciar el servidor si está offline
  | 'SAFE_STOP'      // Apagado progresivo con avisos en chat y guardado de mundo
  | 'SAFE_RESTART'   // Reinicio progresivo con avisos y guardado
  | 'BACKUP'         // Creación de copia de seguridad automática (hot backup)
  | 'COMMAND';       // Enviar un comando de consola arbitrario

export interface ScheduleCountdownWarning {
  /** Minutos antes del apagado/reinicio para emitir el aviso (ej: 10, 5, 1) */
  minutesBefore: number;
  /** Mensaje que se emitirá con /say a los jugadores */
  message: string;
}

export interface ScheduleItem {
  id: string;
  serverId: string;
  name: string;
  enabled: boolean;
  action: ScheduleAction;
  /** Hora en formato 24h "HH:mm" (ej: "12:00", "00:00", "15:30") */
  time: string;
  /** Días de la semana activos [0..6] (0 = Domingo, 1 = Lunes, ..., 6 = Sábado) */
  daysOfWeek: number[];
  /** Avisos de cuenta atrás para SAFE_STOP y SAFE_RESTART */
  warnings?: ScheduleCountdownWarning[];
  /** Comando de consola si la acción es COMMAND */
  command?: string;
  /** Nota opcional para la copia de seguridad si la acción es BACKUP */
  backupNote?: string;
  /** Última vez que se ejecutó (ISO string) */
  lastRun?: string | null;
  /** Fecha de creación (ISO string) */
  createdAt: string;
}

export interface CreateScheduleRequest {
  name: string;
  action: ScheduleAction;
  time: string;
  daysOfWeek: number[];
  warnings?: ScheduleCountdownWarning[];
  command?: string;
  backupNote?: string;
}

export interface UpdateScheduleRequest {
  name?: string;
  action?: ScheduleAction;
  time?: string;
  daysOfWeek?: number[];
  warnings?: ScheduleCountdownWarning[];
  command?: string;
  backupNote?: string;
  enabled?: boolean;
}

// ============================================================
// Tipos para Alertas, Discord Webhooks y Watchdog (Fase 11)
// ============================================================

export interface AlertsConfig {
  serverId: string;
  webhookUrl: string;
  enabled: boolean;
  notifyOnStart: boolean;
  notifyOnStop: boolean;
  notifyOnCrash: boolean;
  notifyOnPlayer: boolean;
  notifyOnBackup: boolean;
  autoRestartOnCrash: boolean;
  crashLoopThreshold: number; // Por defecto 3 caídas
  crashLoopWindowMinutes: number; // Por defecto 5 minutos
  updatedAt: string;
}

export interface CrashEvent {
  id: string;
  serverId: string;
  timestamp: string;
  exitCode: number | null;
  signal: string | null;
  lastLogLine?: string;
  autoRestartTriggered: boolean;
  crashLoopSuppressed: boolean;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  thumbnail?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}


