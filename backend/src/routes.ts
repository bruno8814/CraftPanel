// ============================================================
// routes.ts — Rutas de la API REST
// ============================================================
// Aquí definimos los "endpoints" HTTP del panel.
//
// ¿Qué es un endpoint?
// Es una URL a la que tu navegador (o la app frontend) puede
// hacer peticiones para obtener datos o ejecutar acciones.
//
// Ejemplo:
//   GET  /api/servers         → Devuelve la lista de servidores
//   POST /api/servers         → Crea un nuevo servidor
//   POST /api/servers/:id/start → Arranca un servidor
//
// Usamos Express, que es un framework de Node.js que facilita
// crear estas rutas. Cada ruta tiene:
//   - Un método HTTP (GET, POST, DELETE...)
//   - Una URL (ruta)
//   - Una función que procesa la petición y devuelve una respuesta
// ============================================================

import fs from 'fs';
import path from 'path';
import { exec, execSync } from 'child_process';
import { Router, Request, Response } from 'express';
import { ServerManager } from './server-manager';
import { CreateServerRequest } from './types';
import { getDownloader, getAvailableSoftware, hasDownloader } from './downloaders';
import { searchModrinth, getProjectVersions, getProjectDetails } from './workshop';
import { readServerProperties, saveServerProperties, saveRawServerProperties } from './properties';
import { listFiles, getFileContent, saveFileContent, createEntry, deleteEntry, renameEntry } from './file-manager';
import {
  getSystemMetrics,
  getProcessMetrics,
  getServerMetricHistory,
  recordServerMetric,
} from './metrics';
import { queryMinecraftServer } from './minecraft-query';
import {
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  toggleLockBackup,
  getSafeBackupFilePath,
  saveUploadedBackup,
} from './backup-manager';
import {
  isSystemInitialized,
  createOwner,
  authenticateUser,
  registerWithPin,
  verifyToken,
  getUserById,
  getAllUsers,
  updateUserPermissions,
  deleteUser,
  generatePin,
  getAllPins,
  revokePin,
  authMiddleware,
  requirePermission,
  AuthenticatedRequest,
  Permission,
} from './auth';
import { ScheduleManager } from './scheduler';
import { CrashWatchdog } from './watchdog';
import { sendTestNotification, sendBackupNotification } from './discord-notifier';

/**
 * Crea y devuelve un Router de Express con todas las rutas de la API.
 *
 * Recibe el ServerManager como parámetro para poder comunicarse
 * con la lógica de negocio (crear servidores, arrancarlos, etc.).
 */
export function createRoutes(
  manager: ServerManager,
  schedulerManager?: ScheduleManager,
  watchdogInstance?: CrashWatchdog
): Router {
  const scheduler = schedulerManager || new ScheduleManager(manager);
  const watchdog = watchdogInstance || new CrashWatchdog(manager);
  // Router es un "mini-app" de Express que agrupa rutas relacionadas
  const router = Router();

  // ─────────────────────────────────────────────────────────
  // GET /api/servers — Listar todos los servidores
  // ─────────────────────────────────────────────────────────
  // El frontend llama a esto al cargar la página para obtener
  // la lista de servidores con su estado actual.
  router.get('/servers', (_req: Request, res: Response) => {
    try {
      const servers = manager.getAllServers();
      res.json({ ok: true, data: servers });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id — Obtener un servidor específico
  // ─────────────────────────────────────────────────────────
  // :id es un "parámetro de ruta". Express lo extrae automáticamente.
  // Por ejemplo, GET /api/servers/abc-123 → req.params.id = "abc-123"
  router.get('/servers/:id', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }
      res.json({ ok: true, data: server });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers — Crear un nuevo servidor
  // ─────────────────────────────────────────────────────────
  // El frontend envía los datos del formulario como JSON en
  // el cuerpo (body) de la petición.
  router.post('/servers', (req: Request, res: Response) => {
    try {
      const body = req.body as CreateServerRequest;

      // Validaciones básicas
      if (!body.name || body.name.trim().length === 0) {
        res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
        return;
      }
      if (!body.software) {
        res.status(400).json({ ok: false, error: 'Debes seleccionar un tipo de servidor.' });
        return;
      }
      if (!body.version) {
        res.status(400).json({ ok: false, error: 'Debes indicar la versión de Minecraft.' });
        return;
      }
      if (!body.memoryMB || body.memoryMB < 512) {
        res.status(400).json({ ok: false, error: 'La memoria mínima es 512 MB.' });
        return;
      }

      const config = manager.createServer(body);
      res.status(201).json({ ok: true, data: config });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/start — Arrancar un servidor
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/start', (req: Request, res: Response) => {
    try {
      manager.startServer(req.params.id);
      res.json({ ok: true, message: 'Servidor arrancando...' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/stop — Detener un servidor
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/stop', async (req: Request, res: Response) => {
    try {
      await manager.stopServer(req.params.id);
      res.json({ ok: true, message: 'Servidor detenido.' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/kill — Matar un servidor
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/kill', (req: Request, res: Response) => {
    try {
      manager.killServer(req.params.id);
      res.json({ ok: true, message: 'Servidor terminado forzosamente.' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/command — Enviar comando a la consola
  // ─────────────────────────────────────────────────────────
  // El body debe contener: { "command": "say Hola mundo" }
  router.post('/servers/:id/command', (req: Request, res: Response) => {
    try {
      const { command } = req.body;
      if (!command || typeof command !== 'string') {
        res.status(400).json({ ok: false, error: 'Debes enviar un comando.' });
        return;
      }
      manager.sendCommand(req.params.id, command);
      res.json({ ok: true, message: `Comando enviado: ${command}` });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // DELETE /api/servers/:id — Eliminar un servidor
  // ─────────────────────────────────────────────────────────
  router.delete('/servers/:id', (req: Request, res: Response) => {
    try {
      manager.deleteServer(req.params.id);
      res.json({ ok: true, message: 'Servidor eliminado.' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ═════════════════════════════════════════════════════════
  // ENDPOINTS DE TELEMETRÍA, RENDIMIENTO Y JUGADORES (Fase 7)
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // GET /api/system/stats — Recursos globales de la máquina anfitriona
  // ─────────────────────────────────────────────────────────
  router.get('/system/stats', (_req: Request, res: Response) => {
    try {
      const stats = getSystemMetrics();
      res.json({ ok: true, data: stats });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/stats — Rendimiento en vivo y gráfica histórica
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/stats', async (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      if (server.status !== 'ONLINE' && server.status !== 'STARTING') {
        res.json({
          ok: true,
          data: {
            serverId: server.config.id,
            online: false,
            pid: null,
            cpu: 0,
            memoryMB: 0,
            memoryMaxMB: server.config.memoryMB,
            memoryPercent: 0,
            tps: 20.0,
            pingMs: null,
            uptimeSeconds: 0,
            history: getServerMetricHistory(server.config.id),
          },
        });
        return;
      }

      let cpu = 0;
      let memoryMB = 0;
      if (server.pid) {
        const proc = await getProcessMetrics(server.pid);
        if (proc) {
          cpu = proc.cpu;
          memoryMB = proc.memoryMB;
        }
      }

      const query = await queryMinecraftServer(server.config.port || 25565, server.config.id);
      const memoryPercent = Math.min(100, Math.round((memoryMB / server.config.memoryMB) * 1000) / 10);
      const history = recordServerMetric(server.config.id, cpu, memoryMB, query.playersOnline);

      let uptimeSeconds = 0;
      if (server.startedAt) {
        uptimeSeconds = Math.max(0, Math.floor((Date.now() - new Date(server.startedAt).getTime()) / 1000));
      }

      res.json({
        ok: true,
        data: {
          serverId: server.config.id,
          online: server.status === 'ONLINE',
          pid: server.pid,
          cpu,
          memoryMB,
          memoryMaxMB: server.config.memoryMB,
          memoryPercent,
          tps: query.tps,
          pingMs: query.pingMs,
          uptimeSeconds,
          history,
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/players — Lista de jugadores conectados en vivo
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/players', async (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      if (server.status !== 'ONLINE') {
        res.json({
          ok: true,
          data: {
            online: 0,
            max: 20,
            players: [],
          },
        });
        return;
      }

      const query = await queryMinecraftServer(server.config.port || 25565, server.config.id);
      res.json({
        ok: true,
        data: {
          online: query.playersOnline,
          max: query.playersMax,
          players: query.players,
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/players/:name/action — Acciones rápidas (kick, ban, op, deop)
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/players/:name/action', (req: Request, res: Response) => {
    try {
      const { id, name } = req.params;
      const { action, reason } = req.body || {};
      const server = manager.getServer(id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }
      if (server.status !== 'ONLINE') {
        res.status(400).json({ ok: false, error: 'El servidor no está online.' });
        return;
      }

      if (action === 'kick') {
        manager.sendCommand(id, reason ? `kick ${name} ${reason}` : `kick ${name}`);
      } else if (action === 'ban') {
        manager.sendCommand(id, reason ? `ban ${name} ${reason}` : `ban ${name}`);
      } else if (action === 'op') {
        manager.sendCommand(id, `op ${name}`);
      } else if (action === 'deop') {
        manager.sendCommand(id, `deop ${name}`);
      } else {
        res.status(400).json({ ok: false, error: `Acción no válida: "${action}"` });
        return;
      }

      res.json({ ok: true, message: `Acción "${action}" ejecutada para ${name}.` });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ═════════════════════════════════════════════════════════
  // ENDPOINTS DE COPIAS DE SEGURIDAD (BACKUPS) (Fase 8)
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/backups — Listar backups
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/backups', async (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }
      const data = await listBackups(req.params.id);
      res.json({ ok: true, data });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/backups — Crear un nuevo backup
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/backups', async (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const isOnline = server.status === 'ONLINE';

      // Secuencia de guardado seguro en caliente si el servidor está ONLINE
      if (isOnline) {
        try {
          manager.sendCommand(req.params.id, 'save-off');
          manager.sendCommand(req.params.id, 'save-all flush');
          // Pausa breve para permitir que Minecraft vuelque datos a disco
          await new Promise((r) => setTimeout(r, 800));
        } catch (e) {
          console.warn('[Backups] No se pudo enviar save-off antes de comprimir:', e);
        }
      }

      let metadata;
      try {
        metadata = await createBackup(server, req.body || {});
      } finally {
        // Reactivar siempre el guardado normal si el servidor sigue ONLINE
        if (isOnline) {
          try {
            manager.sendCommand(req.params.id, 'save-on');
          } catch {}
        }
      }

      // Notificar a Discord si las alertas están activas
      const alertsCfg = watchdog.getConfig(req.params.id);
      if (alertsCfg.enabled && alertsCfg.notifyOnBackup && alertsCfg.webhookUrl) {
        sendBackupNotification(
          alertsCfg.webhookUrl,
          server.config.name,
          metadata.filename,
          metadata.sizeBytes / (1024 * 1024),
          metadata.note
        ).catch(() => {});
      }

      res.status(201).json({ ok: true, data: metadata });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/backups/:filename/download — Descargar backup
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/backups/:filename/download', (req: Request, res: Response) => {
    try {
      const filePath = getSafeBackupFilePath(req.params.id, req.params.filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ ok: false, error: 'Archivo de backup no encontrado.' });
        return;
      }
      res.download(filePath, req.params.filename);
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/backups/:filename/restore — Restaurar backup en 1-clic
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/backups/:filename/restore', async (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      // Parada segura previa si el servidor está en marcha
      if (server.status === 'ONLINE' || server.status === 'STARTING') {
        try {
          await manager.stopServer(req.params.id);
          // Esperar brevemente a que el SO libere los bloqueos de archivo
          await new Promise((r) => setTimeout(r, 1000));
        } catch {
          manager.killServer(req.params.id);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      await restoreBackup(server.config.directory, req.params.id, req.params.filename);
      res.json({ ok: true, message: 'Copia de seguridad restaurada correctamente.' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // DELETE /api/servers/:id/backups/:filename — Eliminar backup
  // ─────────────────────────────────────────────────────────
  router.delete('/servers/:id/backups/:filename', async (req: Request, res: Response) => {
    try {
      await deleteBackup(req.params.id, req.params.filename);
      res.json({ ok: true, message: 'Copia de seguridad eliminada.' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/servers/:id/backups/:filename/lock — Bloquear/Desbloquear con candado
  // ─────────────────────────────────────────────────────────
  router.patch('/servers/:id/backups/:filename/lock', async (req: Request, res: Response) => {
    try {
      const updated = await toggleLockBackup(req.params.id, req.params.filename);
      res.json({ ok: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/backups/upload — Subir / Importar un backup (.zip)
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/backups/upload', async (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const originalFilename = (req.query.filename as string) || 'uploaded_backup.zip';
      const metadata = await saveUploadedBackup(req.params.id, originalFilename, req, server);
      res.status(201).json({ ok: true, data: metadata });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ═════════════════════════════════════════════════════════
  // ENDPOINTS DE HORARIOS Y AUTOMATIZACIONES (Fase 9)
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/schedules — Listar tareas programadas
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/schedules', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }
      const data = scheduler.getSchedules(req.params.id);
      res.json({ ok: true, data });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/schedules — Crear tarea programada
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/schedules', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }
      const created = scheduler.createSchedule(req.params.id, req.body);
      res.status(201).json({ ok: true, data: created });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // PUT /api/servers/:id/schedules/:scheduleId — Actualizar tarea
  // ─────────────────────────────────────────────────────────
  router.put('/servers/:id/schedules/:scheduleId', (req: Request, res: Response) => {
    try {
      const updated = scheduler.updateSchedule(req.params.scheduleId, req.body);
      res.json({ ok: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/servers/:id/schedules/:scheduleId/toggle — Alternar estado
  // ─────────────────────────────────────────────────────────
  router.patch('/servers/:id/schedules/:scheduleId/toggle', (req: Request, res: Response) => {
    try {
      const updated = scheduler.toggleSchedule(req.params.scheduleId);
      res.json({ ok: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // DELETE /api/servers/:id/schedules/:scheduleId — Eliminar tarea
  // ─────────────────────────────────────────────────────────
  router.delete('/servers/:id/schedules/:scheduleId', (req: Request, res: Response) => {
    try {
      scheduler.deleteSchedule(req.params.scheduleId);
      res.json({ ok: true, message: 'Regla programada eliminada.' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/schedules/:scheduleId/run — Probar/Ejecutar de inmediato
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/schedules/:scheduleId/run', async (req: Request, res: Response) => {
    try {
      const isPreview = req.query.preview === 'true';
      const result = await scheduler.runScheduleNow(req.params.scheduleId, isPreview);
      res.json({ ok: true, data: result });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ═════════════════════════════════════════════════════════
  // ENDPOINTS DE ALERTAS, DISCORD Y WATCHDOG (Fase 11)
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/alerts — Obtener configuración
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/alerts', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }
      const data = watchdog.getConfig(req.params.id);
      res.json({ ok: true, data });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // PUT /api/servers/:id/alerts — Guardar configuración
  // ─────────────────────────────────────────────────────────
  router.put('/servers/:id/alerts', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }
      const updated = watchdog.saveConfig(req.params.id, req.body);
      res.json({ ok: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/alerts/test — Enviar notificación de prueba a Discord
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/alerts/test', async (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const { webhookUrl } = req.body;
      if (!webhookUrl) {
        res.status(400).json({ ok: false, error: 'webhookUrl es obligatorio.' });
        return;
      }

      const result = await sendTestNotification(webhookUrl, server.config.name);
      if (!result.ok) {
        res.status(400).json({ ok: false, error: result.error });
        return;
      }

      res.json({ ok: true, message: 'Mensaje de prueba enviado a Discord correctamente.' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/alerts/crashes — Historial de caídas del Watchdog
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/alerts/crashes', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }
      const data = watchdog.getCrashHistory(req.params.id);
      res.json({ ok: true, data });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ═════════════════════════════════════════════════════════
  // ENDPOINTS DE SOFTWARE Y VERSIONES (Fase 3)
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // GET /api/software — Listar tipos de software disponibles
  // ─────────────────────────────────────────────────────────
  router.get('/software', (_req: Request, res: Response) => {
    try {
      const software = getAvailableSoftware();
      res.json({ ok: true, data: software });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/software/:type/versions — Versiones disponibles
  // ─────────────────────────────────────────────────────────
  // Ejemplo: GET /api/software/paper/versions
  // Devuelve: [{ version: "1.21", stable: true }, ...]
  router.get('/software/:type/versions', async (req: Request, res: Response) => {
    try {
      const software = req.params.type as any;
      const downloader = getDownloader(software);
      const versions = await downloader.getVersions();
      res.json({ ok: true, data: versions });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/download — Descargar software
  // ─────────────────────────────────────────────────────────
  // Descarga el .jar del servidor en la carpeta correspondiente.
  // Se usa después de crear el servidor para instalar el software.
  router.post('/servers/:id/download', async (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const { software, version } = server.config;

      if (!hasDownloader(software)) {
        res.status(400).json({
          ok: false,
          error: `El descargador para "${software}" aún no está implementado. ` +
                 `Descarga el .jar manualmente y colócalo en la carpeta del servidor.`,
        });
        return;
      }

      const downloader = getDownloader(software);
      const jarFile = await downloader.download(version, server.config.directory);

      // Actualizar la config del servidor con el nombre del jar
      manager.updateJarFile(req.params.id, jarFile);

      res.json({ ok: true, message: `${software} ${version} descargado correctamente.`, jarFile });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ═════════════════════════════════════════════════════════
  // ENDPOINTS DE LA WORKSHOP Y MODS/PLUGINS (Fase 4)
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // GET /api/workshop/search — Buscar en Modrinth
  // ─────────────────────────────────────────────────────────
  router.get('/workshop/search', async (req: Request, res: Response) => {
    try {
      const { query, type, version, loader, limit, offset } = req.query;

      const result = await searchModrinth({
        query: query ? String(query) : undefined,
        projectType: (type as any) || 'mod',
        gameVersion: version ? String(version) : undefined,
        loader: loader ? String(loader) : undefined,
        limit: limit ? Number(limit) : 20,
        offset: offset ? Number(offset) : 0,
      });

      res.json({ ok: true, data: result });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/workshop/project/:id/versions — Versiones del mod
  // ─────────────────────────────────────────────────────────
  router.get('/workshop/project/:id/versions', async (req: Request, res: Response) => {
    try {
      const { version, loader } = req.query;
      const versions = await getProjectVersions(
        req.params.id,
        version ? String(version) : undefined,
        loader ? String(loader) : undefined
      );
      res.json({ ok: true, data: versions });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/workshop/project/:id — Detalle del proyecto
  // ─────────────────────────────────────────────────────────
  router.get('/workshop/project/:id', async (req: Request, res: Response) => {
    try {
      const details = await getProjectDetails(req.params.id);
      res.json({ ok: true, data: details });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/addons/:type — Listar mods o plugins instalados
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/addons/:type', (req: Request, res: Response) => {
    try {
      const type = req.params.type === 'plugins' ? 'plugins' : 'mods';
      const addons = manager.getInstalledAddons(req.params.id, type);
      res.json({ ok: true, data: addons });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/addons/:type/install — Instalar mod/plugin
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/addons/:type/install', async (req: Request, res: Response) => {
    try {
      const type = req.params.type === 'plugins' ? 'plugins' : 'mods';
      const { downloadUrl, filename } = req.body;

      if (!downloadUrl || !filename) {
        res.status(400).json({ ok: false, error: 'downloadUrl y filename son requeridos.' });
        return;
      }

      const installedFilename = await manager.installAddon(req.params.id, type, downloadUrl, filename);
      res.json({ ok: true, message: `${installedFilename} instalado correctamente.`, filename: installedFilename });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/addons/:type/upload — Subir mod/plugin .jar directamente
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/addons/:type/upload', async (req: Request, res: Response) => {
    try {
      const type = req.params.type === 'plugins' ? 'plugins' : 'mods';
      const originalFilename = (req.query.filename as string) || 'addon.jar';

      const installedFilename = await manager.saveUploadedAddon(
        req.params.id,
        type,
        originalFilename,
        req
      );
      res.status(201).json({
        ok: true,
        message: `${installedFilename} subido e instalado correctamente.`,
        filename: installedFilename,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/addons/:type/install-url — Instalar mod/plugin desde URL directa
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/addons/:type/install-url', async (req: Request, res: Response) => {
    try {
      const type = req.params.type === 'plugins' ? 'plugins' : 'mods';
      const { url, filename } = req.body;

      if (!url) {
        res.status(400).json({ ok: false, error: 'La URL de descarga es obligatoria.' });
        return;
      }

      // Derivar nombre de archivo si no se proporcionó
      let targetName = filename;
      if (!targetName) {
        try {
          const parsed = new URL(url);
          targetName = path.basename(parsed.pathname);
        } catch {
          targetName = 'downloaded_addon.jar';
        }
      }
      if (!targetName.endsWith('.jar') && !targetName.endsWith('.zip')) {
        targetName += '.jar';
      }

      const installedFilename = await manager.installAddon(req.params.id, type, url, targetName);
      res.status(201).json({
        ok: true,
        message: `${installedFilename} descargado e instalado correctamente.`,
        filename: installedFilename,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // DELETE /api/servers/:id/addons/:type/:filename — Desinstalar
  // ─────────────────────────────────────────────────────────
  router.delete('/servers/:id/addons/:type/:filename', (req: Request, res: Response) => {
    try {
      const type = req.params.type === 'plugins' ? 'plugins' : 'mods';
      manager.uninstallAddon(req.params.id, type, req.params.filename);
      res.json({ ok: true, message: `${req.params.filename} eliminado.` });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/addons/:type/:filename/toggle — Activar/desactivar
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/addons/:type/:filename/toggle', (req: Request, res: Response) => {
    try {
      const type = req.params.type === 'plugins' ? 'plugins' : 'mods';
      const result = manager.toggleAddon(req.params.id, type, req.params.filename);
      res.json({ ok: true, data: result });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ═════════════════════════════════════════════════════════
  // ENDPOINTS DE AJUSTES (server.properties) (Fase 5)
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/properties — Leer server.properties
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/properties', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const data = readServerProperties(server.config.directory);
      res.json({ ok: true, data });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/properties — Guardar server.properties
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/properties', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const { properties, raw } = req.body;

      if (raw !== undefined) {
        saveRawServerProperties(server.config.directory, raw);
      } else if (properties !== undefined) {
        saveServerProperties(server.config.directory, properties);
      } else {
        res.status(400).json({ ok: false, error: 'Se requiere properties o raw en el cuerpo.' });
        return;
      }

      res.json({ ok: true, message: 'Ajustes guardados correctamente.' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ═════════════════════════════════════════════════════════
  // ENDPOINTS DEL EXPLORADOR DE ARCHIVOS (Fase 5)
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/files — Listar directorio
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/files', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const relPath = req.query.path ? String(req.query.path) : '';
      const items = listFiles(server.config.directory, relPath);
      res.json({ ok: true, data: items });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/servers/:id/files/content — Leer archivo de texto
  // ─────────────────────────────────────────────────────────
  router.get('/servers/:id/files/content', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const relPath = req.query.path ? String(req.query.path) : '';
      if (!relPath) {
        res.status(400).json({ ok: false, error: 'El parámetro path es obligatorio.' });
        return;
      }

      const content = getFileContent(server.config.directory, relPath);
      res.json({ ok: true, data: { content } });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/files/content — Guardar archivo de texto
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/files/content', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const { path: relPath, content } = req.body;
      if (!relPath || content === undefined) {
        res.status(400).json({ ok: false, error: 'path y content son obligatorios.' });
        return;
      }

      saveFileContent(server.config.directory, relPath, content);
      res.json({ ok: true, message: 'Archivo guardado correctamente.' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/files/create — Crear archivo o carpeta
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/files/create', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const { path: relPath, name, isDirectory } = req.body;
      if (!name) {
        res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });
        return;
      }

      createEntry(server.config.directory, relPath || '', name, Boolean(isDirectory));
      res.json({ ok: true, message: `${isDirectory ? 'Carpeta' : 'Archivo'} creado.` });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // DELETE /api/servers/:id/files — Eliminar archivo o carpeta
  // ─────────────────────────────────────────────────────────
  router.delete('/servers/:id/files', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const relPath = req.query.path ? String(req.query.path) : '';
      if (!relPath) {
        res.status(400).json({ ok: false, error: 'El parámetro path es obligatorio.' });
        return;
      }

      deleteEntry(server.config.directory, relPath);
      res.json({ ok: true, message: 'Elemento eliminado.' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/servers/:id/files/rename — Renombrar elemento
  // ─────────────────────────────────────────────────────────
  router.post('/servers/:id/files/rename', (req: Request, res: Response) => {
    try {
      const server = manager.getServer(req.params.id);
      if (!server) {
        res.status(404).json({ ok: false, error: 'Servidor no encontrado.' });
        return;
      }

      const { path: relPath, newName } = req.body;
      if (!relPath || !newName) {
        res.status(400).json({ ok: false, error: 'path y newName son obligatorios.' });
        return;
      }

      renameEntry(server.config.directory, relPath, newName);
      res.json({ ok: true, message: 'Elemento renombrado.' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ═════════════════════════════════════════════════════════
  // ENDPOINTS DE AUTENTICACIÓN Y USUARIOS (Fase 6)
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // GET /api/auth/status — Estado del sistema (¿está inicializado?)
  // ─────────────────────────────────────────────────────────
  router.get('/auth/status', (req: Request, res: Response) => {
    try {
      const initialized = isSystemInitialized();
      res.json({ ok: true, data: { initialized } });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/auth/setup — Crear cuenta del Dueño (Owner inicial)
  // ─────────────────────────────────────────────────────────
  router.post('/auth/setup', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ ok: false, error: 'Email y contraseña son obligatorios.' });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
        return;
      }

      const user = createOwner(email, password);
      const auth = authenticateUser(email, password);
      res.json({ ok: true, data: auth });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/auth/login — Iniciar sesión
  // ─────────────────────────────────────────────────────────
  router.post('/auth/login', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ ok: false, error: 'Email y contraseña son obligatorios.' });
        return;
      }

      const auth = authenticateUser(email, password);
      res.json({ ok: true, data: auth });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/auth/register — Registro de amigo mediante PIN
  // ─────────────────────────────────────────────────────────
  router.post('/auth/register', (req: Request, res: Response) => {
    try {
      const { email, password, pin } = req.body;
      if (!email || !password || !pin) {
        res.status(400).json({ ok: false, error: 'Email, contraseña y PIN de invitación son obligatorios.' });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
        return;
      }

      const auth = registerWithPin(email, password, pin);
      res.json({ ok: true, data: auth });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/auth/me — Obtener perfil actual
  // ─────────────────────────────────────────────────────────
  router.get('/auth/me', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ ok: false, error: 'No autenticado.' });
        return;
      }
      const token = authHeader.slice(7);
      const userId = verifyToken(token);
      if (!userId) {
        res.status(401).json({ ok: false, error: 'Token inválido o expirado.' });
        return;
      }
      const user = getUserById(userId);
      if (!user) {
        res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
        return;
      }
      res.json({ ok: true, data: user });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // ENDPOINTS DE ADMINISTRACIÓN DE USUARIOS Y PINS (Solo Owner / users:manage)
  // ─────────────────────────────────────────────────────────

  // Helper local para comprobar permisos de admin
  const checkAdmin = (req: Request, res: Response): boolean => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ ok: false, error: 'No autenticado.' });
      return false;
    }
    const token = authHeader.slice(7);
    const userId = verifyToken(token);
    if (!userId) {
      res.status(401).json({ ok: false, error: 'Token inválido.' });
      return false;
    }
    const user = getUserById(userId);
    if (!user || (!user.isOwner && !user.permissions.includes('users:manage'))) {
      res.status(403).json({ ok: false, error: 'Acceso denegado: solo administradores.' });
      return false;
    }
    return true;
  };

  // GET /api/admin/users — Listar usuarios
  router.get('/admin/users', (req: Request, res: Response) => {
    if (!checkAdmin(req, res)) return;
    try {
      const users = getAllUsers();
      res.json({ ok: true, data: users });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // PUT /api/admin/users/:id/permissions — Actualizar permisos
  router.put('/admin/users/:id/permissions', (req: Request, res: Response) => {
    if (!checkAdmin(req, res)) return;
    try {
      const { permissions } = req.body;
      if (!Array.isArray(permissions)) {
        res.status(400).json({ ok: false, error: 'permissions debe ser un array.' });
        return;
      }
      const updated = updateUserPermissions(req.params.id, permissions);
      res.json({ ok: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // DELETE /api/admin/users/:id — Eliminar usuario
  router.delete('/admin/users/:id', (req: Request, res: Response) => {
    if (!checkAdmin(req, res)) return;
    try {
      deleteUser(req.params.id);
      res.json({ ok: true, message: 'Usuario eliminado.' });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // GET /api/admin/pins — Listar PINs
  router.get('/admin/pins', (req: Request, res: Response) => {
    if (!checkAdmin(req, res)) return;
    try {
      const pins = getAllPins();
      res.json({ ok: true, data: pins });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /api/admin/pins — Generar nuevo PIN
  router.post('/admin/pins', (req: Request, res: Response) => {
    if (!checkAdmin(req, res)) return;
    try {
      const authHeader = req.headers.authorization!;
      const token = authHeader.slice(7);
      const userId = verifyToken(token)!;
      const user = getUserById(userId)!;

      const newPin = generatePin(user.email);
      res.json({ ok: true, data: newPin });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/system/version — Información de versión y GitHub
  // ─────────────────────────────────────────────────────────
  router.get('/system/version', (_req: Request, res: Response) => {
    try {
      const rootDir = path.join(__dirname, '..', '..');
      const gitDir = path.join(rootDir, '.git');
      const hasGit = fs.existsSync(gitDir);

      let currentCommit = 'local';
      let branch = 'main';
      let updateAvailable = false;
      let remoteCommit = '';
      let lastCommitMessage = '';
      let behindCount = 0;

      if (hasGit) {
        try {
          currentCommit = execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim();
          branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim();
          lastCommitMessage = execSync('git log -1 --pretty=%B', { cwd: rootDir, encoding: 'utf-8' }).trim();

          // Comprobar si hay remoto configurado y buscar actualizaciones (con timeout de 4s)
          const remotes = execSync('git remote', { cwd: rootDir, encoding: 'utf-8' }).trim();
          if (remotes) {
            try {
              execSync('git fetch --quiet', { cwd: rootDir, timeout: 4000 });
              const behind = execSync('git rev-list HEAD..@{u} --count', { cwd: rootDir, encoding: 'utf-8' }).trim();
              behindCount = parseInt(behind, 10) || 0;
              if (behindCount > 0) {
                updateAvailable = true;
                remoteCommit = execSync('git rev-parse --short @{u}', { cwd: rootDir, encoding: 'utf-8' }).trim();
              }
            } catch {
              // Puede ocurrir si no hay conexión a internet o sin rama upstream
            }
          }
        } catch (gitErr) {
          console.warn('[System] Error al consultar git:', gitErr);
        }
      }

      res.json({
        ok: true,
        data: {
          version: '0.1.0',
          hasGit,
          branch,
          currentCommit,
          remoteCommit,
          updateAvailable,
          behindCount,
          lastCommitMessage,
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/system/update — Ejecutar actualización desatendida (git pull + build)
  // ─────────────────────────────────────────────────────────
  router.post('/system/update', async (req: Request, res: Response) => {
    if (!checkAdmin(req, res)) return;

    const rootDir = path.join(__dirname, '..', '..');
    const gitDir = path.join(rootDir, '.git');

    if (!fs.existsSync(gitDir)) {
      res.status(400).json({
        ok: false,
        error: 'Esta instalación no está vinculada a un repositorio Git clonado. Clona el proyecto desde GitHub en tu servidor para activar auto-actualizaciones.',
      });
      return;
    }

    try {
      console.log('[System] Iniciando actualización automática desde GitHub...');

      // 1. git pull
      execSync('git pull', { cwd: rootDir, timeout: 30000, stdio: 'inherit' });

      // 2. npm install
      execSync('npm install --silent', { cwd: rootDir, timeout: 60000, stdio: 'inherit' });
      execSync('npm install --prefix frontend --silent', { cwd: rootDir, timeout: 60000, stdio: 'inherit' });

      // 3. npm run build
      execSync('npm run build', { cwd: rootDir, timeout: 60000, stdio: 'inherit' });

      console.log('[System] ¡Actualización completada con éxito! Reiniciando panel...');

      res.json({
        ok: true,
        message: 'CraftPanel se ha actualizado correctamente. El panel se reiniciará en 2 segundos.',
      });

      // Reiniciar proceso de Node.js (systemd con Restart=always lo relanza al segundo)
      setTimeout(() => {
        process.exit(0);
      }, 1500);
    } catch (err: any) {
      console.error('[System] Error durante la actualización:', err);
      res.status(500).json({
        ok: false,
        error: `Fallo durante la actualización: ${err.message}`,
      });
    }
  });

  return router;
}



