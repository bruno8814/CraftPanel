// ============================================================
// scheduler.ts — Gestor de Automatizaciones y Horarios Programados
// ============================================================
// Diseñado para ser 100% agnóstico al sistema operativo:
//   - Compatible con Linux, Windows, Proxmox VE y Contenedores LXC
//   - Soporta process.env.DATA_DIR para persistencia segura
//   - Ticker de evaluación cada 30 segundos
//   - Cuenta atrás inteligente para apagados/reinicios con avisos en el chat
//   - Guardado seguro forzado de mundos (save-all flush) antes de apagar
// ============================================================

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ScheduleItem,
  ScheduleAction,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  ScheduleCountdownWarning,
} from './types';
import { ServerManager } from './server-manager';
import { createBackup } from './backup-manager';

// ── Directorio base de datos ────────────────────────────────
const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
export const BASE_DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : DEFAULT_DATA_DIR;

const SCHEDULES_FILE = path.join(BASE_DATA_DIR, 'schedules.json');

// Asegurar que la carpeta data exista
if (!fs.existsSync(BASE_DATA_DIR)) {
  fs.mkdirSync(BASE_DATA_DIR, { recursive: true });
}

export class ScheduleManager {
  private schedules: Map<string, ScheduleItem> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private serverManager: ServerManager;
  /** Registro de ejecuciones en el minuto actual para evitar duplicados: "id-accion-YYYYMMDDHHmm" */
  private executedTicks: Set<string> = new Set();

  constructor(serverManager: ServerManager) {
    this.serverManager = serverManager;
    this.loadFromDisk();
    this.startLoop();
  }

  // ─── Persistencia ──────────────────────────────────────────

  private loadFromDisk(): void {
    if (!fs.existsSync(SCHEDULES_FILE)) {
      // Si no existe, creamos un archivo vacío
      this.saveToDisk();
      return;
    }

    try {
      const raw = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
      const items: ScheduleItem[] = JSON.parse(raw);
      this.schedules.clear();
      for (const item of items) {
        this.schedules.set(item.id, item);
      }
      console.log(`[Scheduler] Cargadas ${this.schedules.size} regla(s) programada(s) de disco.`);
    } catch (err) {
      console.error('[Scheduler] Error al cargar horarios de disco:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const items = Array.from(this.schedules.values());
      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(items, null, 2));
    } catch (err) {
      console.error('[Scheduler] Error al guardar horarios en disco:', err);
    }
  }

  // ─── CRUD de Reglas ────────────────────────────────────────

  /**
   * Obtiene todas las reglas programadas de un servidor.
   */
  getSchedules(serverId: string): ScheduleItem[] {
    return Array.from(this.schedules.values())
      .filter((s) => s.serverId === serverId)
      .sort((a, b) => a.time.localeCompare(b.time));
  }

  /**
   * Obtiene una regla por su ID.
   */
  getSchedule(id: string): ScheduleItem | null {
    return this.schedules.get(id) ?? null;
  }

  /**
   * Crea una nueva regla de automatización.
   */
  createSchedule(serverId: string, req: CreateScheduleRequest): ScheduleItem {
    const server = this.serverManager.getServer(serverId);
    if (!server) throw new Error(`Servidor no encontrado: ${serverId}`);

    // Normalizar formato de hora "HH:mm"
    const timeMatch = req.time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!timeMatch) {
      throw new Error('El formato de hora debe ser HH:mm (24 horas, ej. 12:00 o 00:00).');
    }

    const id = uuidv4();
    const item: ScheduleItem = {
      id,
      serverId,
      name: req.name.trim(),
      enabled: true,
      action: req.action,
      time: req.time,
      daysOfWeek: req.daysOfWeek && req.daysOfWeek.length > 0 ? req.daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
      warnings: req.warnings || [],
      command: req.command?.trim(),
      backupNote: req.backupNote?.trim(),
      lastRun: null,
      createdAt: new Date().toISOString(),
    };

    this.schedules.set(id, item);
    this.saveToDisk();
    console.log(`[Scheduler] Creada regla "${item.name}" [${item.action}] para las ${item.time} (${serverId})`);
    return item;
  }

  /**
   * Actualiza una regla existente.
   */
  updateSchedule(id: string, req: UpdateScheduleRequest): ScheduleItem {
    const item = this.schedules.get(id);
    if (!item) throw new Error(`Regla programada no encontrada: ${id}`);

    if (req.time) {
      const timeMatch = req.time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
      if (!timeMatch) {
        throw new Error('El formato de hora debe ser HH:mm (24 horas, ej. 12:00 o 00:00).');
      }
      item.time = req.time;
    }

    if (req.name !== undefined) item.name = req.name.trim();
    if (req.action !== undefined) item.action = req.action;
    if (req.daysOfWeek !== undefined) item.daysOfWeek = req.daysOfWeek;
    if (req.warnings !== undefined) item.warnings = req.warnings;
    if (req.command !== undefined) item.command = req.command.trim();
    if (req.backupNote !== undefined) item.backupNote = req.backupNote.trim();
    if (req.enabled !== undefined) item.enabled = req.enabled;

    this.saveToDisk();
    console.log(`[Scheduler] Regla "${item.name}" (${id}) actualizada.`);
    return item;
  }

  /**
   * Alterna el estado activo/inactivo de una regla.
   */
  toggleSchedule(id: string): ScheduleItem {
    const item = this.schedules.get(id);
    if (!item) throw new Error(`Regla programada no encontrada: ${id}`);

    item.enabled = !item.enabled;
    this.saveToDisk();
    console.log(`[Scheduler] Regla "${item.name}" ${item.enabled ? 'activada' : 'pausada'}.`);
    return item;
  }

  /**
   * Elimina una regla programada.
   */
  deleteSchedule(id: string): void {
    if (!this.schedules.has(id)) {
      throw new Error(`Regla programada no encontrada: ${id}`);
    }
    const name = this.schedules.get(id)?.name;
    this.schedules.delete(id);
    this.saveToDisk();
    console.log(`[Scheduler] Regla "${name}" (${id}) eliminada.`);
  }

  // ─── Ejecución Manual / Prueba en Vivo ─────────────────────

  /**
   * Ejecuta inmediatamente una regla programada para probar su funcionamiento.
   * Si es de tipo SAFE_STOP o SAFE_RESTART, ejecuta una secuencia rápida de prueba con avisos visibles.
   */
  async runScheduleNow(id: string, isPreview: boolean = false): Promise<{ message: string }> {
    const item = this.schedules.get(id);
    if (!item) throw new Error(`Regla programada no encontrada: ${id}`);

    console.log(`[Scheduler] Ejecución manual disparada para "${item.name}" (Preview: ${isPreview})`);
    await this.executeAction(item, isPreview);

    item.lastRun = new Date().toISOString();
    this.saveToDisk();

    return { message: `Regla "${item.name}" ejecutada con éxito.` };
  }

  // ─── Bucle de Evaluación (Reloj Interno) ───────────────────

  /**
   * Inicia el bucle que evalúa cada 30 segundos si coincide alguna regla.
   */
  private startLoop(): void {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      this.evaluateSchedules();
    }, 30 * 1000);

    // Primera evaluación inmediata
    this.evaluateSchedules();
  }

  /**
   * Detiene el bucle (útil para tests o shutdown limpio de Node).
   */
  public stopLoop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Evalúa todas las reglas activas contra la hora y día actuales.
   */
  private async evaluateSchedules(): Promise<void> {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTotalMinutes = currentHours * 60 + currentMinutes;

    // Formatear clave de minuto actual para deduplicación: "YYYYMMDDHHmm"
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(currentHours).padStart(2, '0')}${String(currentMinutes).padStart(2, '0')}`;

    // Limpiar claves antiguas de executedTicks cada medianoche
    if (this.executedTicks.size > 1000) {
      this.executedTicks.clear();
    }

    for (const item of this.schedules.values()) {
      if (!item.enabled) continue;
      if (!item.daysOfWeek.includes(currentDay)) continue;

      const [targetH, targetM] = item.time.split(':').map(Number);
      const targetTotalMinutes = targetH * 60 + targetM;

      // Calcular diferencia en minutos (manejando cambio de día circular 1440 min)
      const diffMinutes = (targetTotalMinutes - currentTotalMinutes + 1440) % 1440;

      // ── Caso 1: Es el minuto exacto del evento principal (diff == 0) ──
      if (diffMinutes === 0) {
        const tickKey = `${item.id}-main-${dateStr}`;
        if (!this.executedTicks.has(tickKey)) {
          this.executedTicks.add(tickKey);
          item.lastRun = now.toISOString();
          this.saveToDisk();

          console.log(`[Scheduler] ⏰ Hora exacta alcanzada (${item.time}): ejecutando "${item.name}"`);
          this.executeAction(item, false).catch((err) => {
            console.error(`[Scheduler] Error ejecutando acción de "${item.name}":`, err);
          });
        }
        continue;
      }

      // ── Caso 2: Avisos de cuenta atrás para SAFE_STOP y SAFE_RESTART ──
      if (
        (item.action === 'SAFE_STOP' || item.action === 'SAFE_RESTART') &&
        item.warnings &&
        item.warnings.length > 0 &&
        diffMinutes > 0 &&
        diffMinutes <= 60
      ) {
        // Comprobar si hay un aviso configurado para este diff exacto (ej. 10m, 5m, 1m)
        const matchingWarning = item.warnings.find((w) => w.minutesBefore === diffMinutes);
        if (matchingWarning) {
          const warnKey = `${item.id}-warn-${diffMinutes}-${dateStr}`;
          if (!this.executedTicks.has(warnKey)) {
            this.executedTicks.add(warnKey);
            console.log(`[Scheduler] 📢 Emitiendo aviso de ${diffMinutes} min para "${item.name}"`);
            this.broadcastWarning(item.serverId, matchingWarning.message);
          }
        }
      }
    }
  }

  // ─── Ejecución de Acciones ─────────────────────────────────

  private async executeAction(item: ScheduleItem, isPreview: boolean): Promise<void> {
    const server = this.serverManager.getServer(item.serverId);
    if (!server) {
      console.warn(`[Scheduler] Servidor ${item.serverId} no encontrado para la regla "${item.name}".`);
      return;
    }

    switch (item.action) {
      case 'START': {
        if (server.status === 'OFFLINE') {
          console.log(`[Scheduler] Encendido programado: Iniciando ${server.config.name}...`);
          this.serverManager.startServer(item.serverId);
        } else {
          console.log(`[Scheduler] Encendido programado omitido: ${server.config.name} ya está ${server.status}.`);
        }
        break;
      }

      case 'SAFE_STOP': {
        await this.runSafeStopSequence(item, isPreview);
        break;
      }

      case 'SAFE_RESTART': {
        await this.runSafeStopSequence(item, isPreview);
        console.log(`[Scheduler] Esperando 4 segundos tras el apagado para reiniciar ${server.config.name}...`);
        await new Promise((r) => setTimeout(r, 4000));
        console.log(`[Scheduler] Reinicio programado: Volviendo a iniciar ${server.config.name}...`);
        this.serverManager.startServer(item.serverId);
        break;
      }

      case 'BACKUP': {
        console.log(`[Scheduler] Ejecutando backup programado para ${server.config.name}...`);
        const isOnline = server.status === 'ONLINE';
        if (isOnline) {
          try {
            this.serverManager.sendCommand(item.serverId, 'save-off');
            this.serverManager.sendCommand(item.serverId, 'save-all flush');
            await new Promise((r) => setTimeout(r, 800));
          } catch {}
        }

        try {
          await createBackup(server, {
            note: item.backupNote || `Backup programado (${item.name})`,
            excludeLogs: false,
          });
        } finally {
          if (isOnline) {
            try {
              this.serverManager.sendCommand(item.serverId, 'save-on');
            } catch {}
          }
        }
        break;
      }

      case 'COMMAND': {
        if (!item.command) {
          console.warn(`[Scheduler] La regla de comando "${item.name}" no tiene comando asignado.`);
          return;
        }
        console.log(`[Scheduler] Enviando comando programado: /${item.command}`);
        this.serverManager.sendCommand(item.serverId, item.command);
        break;
      }
    }
  }

  /**
   * Ejecuta la secuencia segura de apagado:
   * 1. Si es modo preview (prueba en panel), emite los avisos con una pequeña pausa (ej. 2.5s entre avisos).
   * 2. Si el servidor está ONLINE, fuerza `save-all flush` para asegurar que el mundo no se corrompa.
   * 3. Ejecuta `stopServer` para una salida limpia del proceso Java.
   */
  private async runSafeStopSequence(item: ScheduleItem, isPreview: boolean): Promise<void> {
    const server = this.serverManager.getServer(item.serverId);
    if (!server || server.status === 'OFFLINE') {
      console.log(`[Scheduler] Apagado omitido: ${server?.config.name || item.serverId} ya está OFFLINE.`);
      return;
    }

    if (isPreview && item.warnings && item.warnings.length > 0) {
      // Ordenar avisos de mayor a menor minutos
      const sortedWarnings = [...item.warnings].sort((a, b) => b.minutesBefore - a.minutesBefore);
      for (const warn of sortedWarnings) {
        this.broadcastWarning(item.serverId, `[PRUEBA] ${warn.message}`);
        await new Promise((r) => setTimeout(r, 2500)); // Pausa de 2.5s para la demo
      }
    }

    // Guardado forzado del mundo a disco
    console.log(`[Scheduler] Forzando guardado seguro del mundo (save-all flush) en ${server.config.name}...`);
    try {
      this.serverManager.sendCommand(item.serverId, 'say [Aviso Servidor] Guardando mundo y chunks...');
      this.serverManager.sendCommand(item.serverId, 'save-all flush');
      // Breve pausa para que Java vuelque búferes a disco
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      console.warn('[Scheduler] Advertencia al forzar guardado:', e);
    }

    // Parada limpia
    console.log(`[Scheduler] Enviando orden de parada limpia a ${server.config.name}...`);
    try {
      await this.serverManager.stopServer(item.serverId);
      console.log(`[Scheduler] Servidor ${server.config.name} apagado limpiamente.`);
    } catch (err) {
      console.error(`[Scheduler] Error al detener ${server.config.name}, forzando kill:`, err);
      this.serverManager.killServer(item.serverId);
    }
  }

  /**
   * Envía un mensaje a todos los jugadores mediante el comando /say de Minecraft.
   */
  private broadcastWarning(serverId: string, message: string): void {
    try {
      const server = this.serverManager.getServer(serverId);
      if (server && server.status === 'ONLINE') {
        // Enviar /say para que aparezca en el chat de todos los jugadores conectados
        this.serverManager.sendCommand(serverId, `say ${message}`);
      }
    } catch (err) {
      console.error(`[Scheduler] Error al emitir aviso en el servidor ${serverId}:`, err);
    }
  }
}
