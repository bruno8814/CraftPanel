// ============================================================
// watchdog.ts — Watchdog de Caídas y Auto-recuperación
// ============================================================
// Supervisa el ciclo de vida de los procesos Java de Minecraft:
//   - Detecta caídas inesperadas (crashes)
//   - Reinicia el servidor automáticamente tras 5 segundos
//   - Protección contra bucles de reinicio (Crash Loop Protection)
//   - Registra historial de caídas y despacha notificaciones a Discord
// ============================================================

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AlertsConfig, CrashEvent, ServerState } from './types';
import { ServerManager } from './server-manager';
import { sendCrashNotification } from './discord-notifier';

const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
export const BASE_DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : DEFAULT_DATA_DIR;

const ALERTS_FILE = path.join(BASE_DATA_DIR, 'alerts.json');

// Asegurar existencia de carpeta data
if (!fs.existsSync(BASE_DATA_DIR)) {
  fs.mkdirSync(BASE_DATA_DIR, { recursive: true });
}

export class CrashWatchdog {
  private serverManager: ServerManager;
  /** Configuración por serverId */
  private configs: Map<string, AlertsConfig> = new Map();
  /** Marcas de tiempo de caídas recientes: serverId → [timestampMs, ...] */
  private crashTimestamps: Map<string, number[]> = new Map();
  /** Historial de caídas para el panel web: serverId → CrashEvent[] */
  private crashHistory: Map<string, CrashEvent[]> = new Map();
  /** Servidores en los que el usuario o el scheduler solicitó una parada manual */
  private intentionalStops: Set<string> = new Set();

  constructor(serverManager: ServerManager) {
    this.serverManager = serverManager;
    this.loadFromDisk();
  }

  // ─── Persistencia ──────────────────────────────────────────

  private loadFromDisk(): void {
    if (!fs.existsSync(ALERTS_FILE)) {
      this.saveToDisk();
      return;
    }

    try {
      const raw = fs.readFileSync(ALERTS_FILE, 'utf-8');
      const items: AlertsConfig[] = JSON.parse(raw);
      this.configs.clear();
      for (const item of items) {
        this.configs.set(item.serverId, item);
      }
      console.log(`[Watchdog] Cargadas configuraciones de alertas de disco.`);
    } catch (err) {
      console.error('[Watchdog] Error al cargar alertas de disco:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const items = Array.from(this.configs.values());
      fs.writeFileSync(ALERTS_FILE, JSON.stringify(items, null, 2));
    } catch (err) {
      console.error('[Watchdog] Error al guardar alertas en disco:', err);
    }
  }

  // ─── Configuración de Alertas por Servidor ──────────────────

  /**
   * Obtiene la configuración de alertas de un servidor (con valores por defecto si no existía).
   */
  getConfig(serverId: string): AlertsConfig {
    let cfg = this.configs.get(serverId);
    if (!cfg) {
      cfg = {
        serverId,
        webhookUrl: '',
        enabled: false,
        notifyOnStart: true,
        notifyOnStop: true,
        notifyOnCrash: true,
        notifyOnPlayer: true,
        notifyOnBackup: true,
        autoRestartOnCrash: true,
        crashLoopThreshold: 3,
        crashLoopWindowMinutes: 5,
        updatedAt: new Date().toISOString(),
      };
      this.configs.set(serverId, cfg);
      this.saveToDisk();
    }
    return cfg;
  }

  /**
   * Actualiza la configuración de alertas de un servidor.
   */
  saveConfig(serverId: string, partial: Partial<AlertsConfig>): AlertsConfig {
    const current = this.getConfig(serverId);
    const updated: AlertsConfig = {
      ...current,
      ...partial,
      serverId,
      updatedAt: new Date().toISOString(),
    };
    this.configs.set(serverId, updated);
    this.saveToDisk();
    return updated;
  }

  /**
   * Obtiene el historial reciente de caídas de un servidor.
   */
  getCrashHistory(serverId: string): CrashEvent[] {
    return this.crashHistory.get(serverId) || [];
  }

  /**
   * Marca que una parada fue iniciada de forma manual/intencionada.
   */
  markIntentionalStop(serverId: string): void {
    this.intentionalStops.add(serverId);
    // Limpiar tras 30 segundos
    setTimeout(() => {
      this.intentionalStops.delete(serverId);
    }, 30000);
  }

  // ─── Manejador de Salida del Proceso ────────────────────────

  /**
   * Se invoca automáticamente cuando el proceso Java de un servidor termina.
   */
  async handleProcessExit(
    serverId: string,
    code: number | null,
    signal: string | null,
    lastLogLine?: string
  ): Promise<void> {
    const server = this.serverManager.getServer(serverId);
    if (!server) return;

    const wasIntentional = this.intentionalStops.has(serverId);
    this.intentionalStops.delete(serverId);

    // Si fue una parada normal iniciada por el usuario o scheduler con /stop (código 0 y manual), no es crash
    if (wasIntentional && code === 0) {
      console.log(`[Watchdog] Servidor ${server.config.name} se detuvo de forma ordenada.`);
      return;
    }

    // ── Es una caída inesperada (Crash) ──
    const now = Date.now();
    const config = this.getConfig(serverId);

    console.warn(
      `[Watchdog] 🚨 Caída inesperada detectada en "${server.config.name}" (Código: ${code}, Señal: ${signal})`
    );

    // Registrar marca de tiempo para el análisis de Crash Loop
    const timestamps = this.crashTimestamps.get(serverId) || [];
    timestamps.push(now);

    // Filtrar caídas dentro de la ventana de tiempo configurada (ej. últimos 5 minutos)
    const windowMs = (config.crashLoopWindowMinutes || 5) * 60 * 1000;
    const recentCrashes = timestamps.filter((t) => now - t <= windowMs);
    this.crashTimestamps.set(serverId, recentCrashes);

    let crashLoopSuppressed = false;
    let autoRestartTriggered = false;

    // Verificar si se ha superado el umbral de protección contra bucle de caídas
    const threshold = config.crashLoopThreshold || 3;
    if (recentCrashes.length >= threshold) {
      crashLoopSuppressed = true;
      console.error(
        `[Watchdog] ⚠️ CRASH LOOP DETECTADO en "${server.config.name}": ${recentCrashes.length} caídas en ${config.crashLoopWindowMinutes} min. Auto-reinicio pausado.`
      );
    } else if (config.autoRestartOnCrash) {
      autoRestartTriggered = true;
      console.log(`[Watchdog] Auto-reinicio programado para "${server.config.name}" en 5 segundos...`);
      setTimeout(() => {
        try {
          const freshState = this.serverManager.getServer(serverId);
          if (freshState && freshState.status === 'OFFLINE') {
            console.log(`[Watchdog] 🚀 Reiniciando servidor "${server.config.name}" tras caída...`);
            this.serverManager.startServer(serverId);
          }
        } catch (err) {
          console.error(`[Watchdog] Error al reiniciar servidor "${server.config.name}":`, err);
        }
      }, 5000);
    }

    // Guardar evento en el historial
    const crashEvent: CrashEvent = {
      id: uuidv4(),
      serverId,
      timestamp: new Date().toISOString(),
      exitCode: code,
      signal,
      lastLogLine,
      autoRestartTriggered,
      crashLoopSuppressed,
    };

    const history = this.crashHistory.get(serverId) || [];
    history.unshift(crashEvent);
    if (history.length > 20) history.pop();
    this.crashHistory.set(serverId, history);

    // Enviar notificación a Discord si está habilitado
    if (config.enabled && config.notifyOnCrash && config.webhookUrl) {
      sendCrashNotification(
        config.webhookUrl,
        server,
        code,
        signal,
        lastLogLine,
        autoRestartTriggered,
        crashLoopSuppressed
      ).catch((err) => console.error('[Watchdog] Error al enviar notificación de crash:', err));
    }
  }
}
