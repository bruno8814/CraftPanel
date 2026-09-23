// ============================================================
// types.ts — Tipos compartidos con el backend
// ============================================================
// Copiamos aquí los tipos que necesita el frontend para
// entender los datos que recibe de la API.
// ============================================================

export type ServerStatus = 'OFFLINE' | 'STARTING' | 'ONLINE' | 'STOPPING';
export type ServerSoftware = 'vanilla' | 'paper' | 'fabric' | 'forge' | 'mohist' | 'neoforge';

export interface ServerConfig {
  id: string;
  name: string;
  software: ServerSoftware;
  version: string;
  memoryMB: number;
  port: number;
  directory: string;
  jarFile: string;
  createdAt: string;
}

export interface ServerState {
  config: ServerConfig;
  status: ServerStatus;
  pid: number | null;
  consoleBuffer: string[];
  startedAt: string | null;
  jarExists: boolean;
}

export interface CreateServerRequest {
  name: string;
  software: ServerSoftware;
  version: string;
  memoryMB: number;
  port?: number;
}

// ── Fase 4: Workshop y Addons ────────────────────────────────

export interface InstalledAddon {
  filename: string;
  name: string;
  sizeBytes: number;
  enabled: boolean;
  modifiedAt: string;
}

export interface ModrinthSearchResult {
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: string;
  server_side: string;
  project_type: 'mod' | 'plugin' | 'modpack';
  downloads: number;
  icon_url: string | null;
  author: string;
  versions: string[];
  follows: number;
  date_modified: string;
}

export interface ModrinthSearchResponse {
  hits: ModrinthSearchResult[];
  offset: number;
  limit: number;
  total_hits: number;
}

export interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface ModrinthVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  version_type: 'release' | 'beta' | 'alpha';
  date_published: string;
  downloads: number;
  files: ModrinthVersionFile[];
}

// ── Fase 5: Ajustes y Archivos ───────────────────────────────

export interface ServerPropertiesData {
  raw: string;
  properties: Record<string, string>;
}

export interface FileItem {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
  extension: string;
}

// ── Fase 6: Autenticación y Permisos ─────────────────────────

export type Permission =
  | 'servers:view'
  | 'servers:control'
  | 'servers:console'
  | 'servers:create'
  | 'servers:delete'
  | 'workshop:manage'
  | 'files:edit'
  | 'settings:edit'
  | 'users:manage';

export interface UserPublic {
  id: string;
  email: string;
  isOwner: boolean;
  permissions: Permission[];
  createdAt: string;
}

export interface InvitationPin {
  code: string;
  createdBy: string;
  createdAt: string;
  used: boolean;
  usedBy?: string;
  usedAt?: string;
}

// ── Fase 7: Telemetría, Rendimiento y Jugadores ──────────────

export interface SystemStats {
  cpuUsage: number;
  cpuModel: string;
  cpuCores: number;
  totalMemMB: number;
  usedMemMB: number;
  freeMemMB: number;
  memUsagePercent: number;
  uptimeSeconds: number;
  platform: string;
}

export interface MetricPoint {
  timestamp: string;
  cpu: number;
  memoryMB: number;
  playersOnline: number;
}

export interface ConnectedPlayer {
  name: string;
  uuid?: string;
  avatarUrl: string;
  joinedAt?: string;
  pingMs?: number;
}

export interface ServerStats {
  serverId: string;
  online: boolean;
  pid: number | null;
  cpu: number;
  memoryMB: number;
  memoryMaxMB: number;
  memoryPercent: number;
  tps: number;
  pingMs: number | null;
  uptimeSeconds: number;
  players?: ConnectedPlayer[];
  playersOnline?: number;
  playersMax?: number;
  history?: MetricPoint[];
}

// ── Fase 8: Copias de Seguridad (Backups) ────────────────────

export interface BackupItem {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  serverName: string;
  serverVersion: string;
  software: string;
  note?: string;
  locked: boolean;
}

export interface BackupsResponse {
  backups: BackupItem[];
  totalSizeBytes: number;
}

// ── Fase 9: Automatizaciones y Horarios Programados ─────────

export type ScheduleAction =
  | 'START'
  | 'SAFE_STOP'
  | 'SAFE_RESTART'
  | 'BACKUP'
  | 'COMMAND';

export interface ScheduleCountdownWarning {
  minutesBefore: number;
  message: string;
}

export interface ScheduleItem {
  id: string;
  serverId: string;
  name: string;
  enabled: boolean;
  action: ScheduleAction;
  time: string; // "HH:mm" 24h
  daysOfWeek: number[]; // [0..6]
  warnings?: ScheduleCountdownWarning[];
  command?: string;
  backupNote?: string;
  lastRun?: string | null;
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

// ── Fase 11: Alertas, Discord y Watchdog ────────────────────

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
  crashLoopThreshold: number;
  crashLoopWindowMinutes: number;
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

export interface SystemVersionInfo {
  version: string;
  hasGit: boolean;
  branch: string;
  currentCommit: string;
  remoteCommit?: string;
  updateAvailable: boolean;
  behindCount: number;
  lastCommitMessage?: string;
}



