// ============================================================
// index.ts — Punto de entrada del panel
// ============================================================
// Este es el archivo que arranca todo. Cuando ejecutas:
//   npm run dev
//
// Node.js ejecuta este archivo, que:
//   1. Crea el ServerManager (gestor de servidores)
//   2. Levanta un servidor web con Express en el puerto 3000
//   3. Configura Socket.io para comunicación en tiempo real
//   4. Conecta las rutas de la API REST
//
// Después de esto, puedes abrir http://localhost:3000 en tu
// navegador y usar la API (por ahora sin interfaz gráfica,
// pero ya puedes probarla con herramientas como curl o Postman).
// ============================================================

import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';

import { ServerManager } from './server-manager';
import { createRoutes } from './routes';
import { ScheduleManager } from './scheduler';
import { CrashWatchdog } from './watchdog';
import {
  sendStartNotification,
  sendStopNotification,
  sendPlayerNotification,
} from './discord-notifier';
import {
  calculateSystemCpuUsage,
  getSystemMetrics,
  getProcessMetrics,
  recordServerMetric,
} from './metrics';
import { queryMinecraftServer, setOnPlayerEventListener } from './minecraft-query';

// ── Configuración ───────────────────────────────────────────

// Puerto donde escuchará el panel web
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Carpeta donde se guardarán los servidores de Minecraft
// Por defecto: /servidores en la raíz, o configurable mediante variable de entorno
const SERVERS_DIR = process.env.SERVERS_DIR
  ? path.resolve(process.env.SERVERS_DIR)
  : path.join(__dirname, '..', '..', 'servidores');

// ── Crear la aplicación Express ─────────────────────────────

// Express es el framework que gestiona las peticiones HTTP.
// Piensa en él como un "cartero" que recibe cartas (peticiones)
// y las entrega al buzón correcto (la ruta correcta).
const app = express();

// Middleware: son funciones que procesan TODAS las peticiones
// antes de que lleguen a las rutas.

// express.json() permite que el cuerpo de las peticiones POST
// se interprete como JSON automáticamente.
// Sin esto, req.body estaría vacío.
app.use(express.json());

// cors() permite que el frontend (que correrá en otro puerto
// durante desarrollo) pueda hacer peticiones al backend.
// Sin esto, el navegador bloquearía las peticiones por seguridad.
app.use(cors());

// ── Crear el servidor HTTP ──────────────────────────────────

// Necesitamos crear el servidor HTTP manualmente (en vez de
// usar app.listen directamente) para poder adjuntarle Socket.io.
const server = http.createServer(app);

// ── Configurar Socket.io (WebSockets) ───────────────────────

// Socket.io permite comunicación BIDIRECCIONAL en tiempo real
// entre el servidor y el navegador.
//
// HTTP normal funciona así:
//   Navegador pregunta → Servidor responde → Conexión se cierra
//
// WebSocket funciona así:
//   Navegador se conecta → La conexión queda ABIERTA →
//   Servidor puede enviar datos AL NAVEGADOR cuando quiera
//   sin que el navegador pregunte primero.
//
// Esto es perfecto para enviar los logs de la consola en
// tiempo real conforme van saliendo.
const io = new SocketIOServer(server, {
  cors: {
    origin: '*', // En producción, restringir esto a tu IP/dominio
  },
});

// ── Crear ServerManager, ScheduleManager y CrashWatchdog ───

const manager = new ServerManager(SERVERS_DIR);
const scheduler = new ScheduleManager(manager);
const watchdog = new CrashWatchdog(manager);

// ── Conectar los eventos del ServerManager con Socket.io y Discord ──

// Registro rodante del último log por servidor (para capturar causas de crash)
const lastLogByServer = new Map<string, string>();

// Cuando un servidor emite un log, lo enviamos a Socket.io
manager.onLog = (serverId: string, line: string) => {
  lastLogByServer.set(serverId, line);
  io.emit('server:log', {
    serverId,
    line,
    timestamp: new Date().toISOString(),
  });
};

// Cuando un servidor cambia de estado, notificamos a Socket.io y Discord
manager.onStatusChange = (serverId: string, status: string) => {
  io.emit('server:status', { serverId, status });

  const alerts = watchdog.getConfig(serverId);
  if (alerts.enabled && alerts.webhookUrl) {
    const server = manager.getServer(serverId);
    if (server) {
      if (status === 'ONLINE' && alerts.notifyOnStart) {
        sendStartNotification(alerts.webhookUrl, server).catch(() => {});
      } else if (status === 'OFFLINE' && alerts.notifyOnStop) {
        sendStopNotification(alerts.webhookUrl, server, 0).catch(() => {});
      }
    }
  }
};

// Notificar al watchdog si el usuario/scheduler detiene el servidor de forma intencionada
manager.onStopInitiated = (serverId: string) => {
  watchdog.markIntentionalStop(serverId);
};

// Cuando el proceso Java termina (detecta caídas y auto-recupera)
manager.onExit = (serverId: string, code: number | null, signal: string | null) => {
  const lastLog = lastLogByServer.get(serverId);
  watchdog.handleProcessExit(serverId, code, signal, lastLog);
};

// Notificar a Discord cuando un jugador entra o sale
setOnPlayerEventListener((serverId: string, playerName: string, event: 'joined' | 'left') => {
  const alerts = watchdog.getConfig(serverId);
  if (alerts.enabled && alerts.notifyOnPlayer && alerts.webhookUrl) {
    const server = manager.getServer(serverId);
    sendPlayerNotification(
      alerts.webhookUrl,
      server?.config.name || 'Minecraft Server',
      playerName,
      event
    ).catch(() => {});
  }
});

// ── Manejar conexiones WebSocket ────────────────────────────

io.on('connection', (socket) => {
  console.log(`[WebSocket] Cliente conectado: ${socket.id}`);

  // Cuando un navegador se conecta, le enviamos el estado actual
  // de todos los servidores para que pinte la interfaz correctamente
  socket.emit('servers:init', manager.getAllServers());

  // El frontend puede enviar comandos directamente por WebSocket
  // (más rápido que hacer una petición HTTP para cada comando)
  socket.on('server:command', ({ serverId, command }: { serverId: string; command: string }) => {
    try {
      manager.sendCommand(serverId, command);
    } catch (err: any) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[WebSocket] Cliente desconectado: ${socket.id}`);
  });
});

// ── Telemetría periódica en segundo plano (cada 2 segundos) ──

setInterval(async () => {
  try {
    // 1. Recursos globales de la máquina anfitriona (Host)
    calculateSystemCpuUsage();
    const systemMetrics = getSystemMetrics();
    io.emit('system:stats', systemMetrics);

    // 2. Recursos de cada servidor de Minecraft en ejecución
    const servers = manager.getAllServers();
    for (const server of servers) {
      if (server.status === 'ONLINE' && server.pid) {
        let cpu = 0;
        let memoryMB = 0;
        const proc = await getProcessMetrics(server.pid);
        if (proc) {
          cpu = proc.cpu;
          memoryMB = proc.memoryMB;
        }

        const query = await queryMinecraftServer(server.config.port || 25565, server.config.id, 1000);
        const memoryPercent = Math.min(100, Math.round((memoryMB / server.config.memoryMB) * 1000) / 10);
        recordServerMetric(server.config.id, cpu, memoryMB, query.playersOnline);

        let uptimeSeconds = 0;
        if (server.startedAt) {
          uptimeSeconds = Math.max(0, Math.floor((Date.now() - new Date(server.startedAt).getTime()) / 1000));
        }

        io.emit('server:stats', {
          serverId: server.config.id,
          online: true,
          pid: server.pid,
          cpu,
          memoryMB,
          memoryMaxMB: server.config.memoryMB,
          memoryPercent,
          tps: query.tps,
          pingMs: query.pingMs,
          uptimeSeconds,
          players: query.players,
          playersOnline: query.playersOnline,
          playersMax: query.playersMax,
        });
      }
    }
  } catch (err) {
    // Evitar caídas por errores transitorios en la medición
  }
}, 2000);

// ── Registrar las rutas de la API ───────────────────────────

// Todas las rutas de routes.ts se montan bajo /api
// Ejemplo: router.get('/servers') → accesible en /api/servers
app.use('/api', createRoutes(manager, scheduler, watchdog));

// ── Servir archivos estáticos del frontend (Modo Producción) ─
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');

if (fs.existsSync(FRONTEND_DIST)) {
  console.log(`[Panel] Sirviendo frontend de producción desde: ${FRONTEND_DIST}`);
  app.use(express.static(FRONTEND_DIST));

  // SPA fallback para rutas de React Router (excluyendo /api y /socket.io)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  // Ruta de bienvenida si se ejecuta el backend sin compilar el frontend
  app.get('/', (_req, res) => {
    res.json({
      name: 'CraftPanel',
      version: '0.1.0',
      status: 'running',
      mode: 'api-only (frontend/dist no encontrado)',
      endpoints: {
        servers: '/api/servers',
      },
    });
  });
}

// ── Arrancar el servidor web ────────────────────────────────

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║                                              ║');
  console.log('  ║   🎮  CraftPanel v0.1.0                      ║');
  console.log('  ║                                              ║');
  console.log(`  ║   🌐  http://localhost:${PORT}                  ║`);
  console.log(`  ║   📁  Servidores: ${SERVERS_DIR}  `);
  console.log('  ║                                              ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});

// ── Manejo de cierre limpio (SIGINT y SIGTERM) ──────────────

// Cuando el sistema o el usuario pide parar el panel (Ctrl+C o systemctl stop),
// guardamos y paramos todos los servidores de Minecraft para evitar corrupción de mundos.
const handleGracefulShutdown = async (signal: string) => {
  console.log(`\n[Panel] Señal ${signal} recibida. Cerrando panel y deteniendo servidores activos...`);
  scheduler.stopLoop();

  const servers = manager.getAllServers();
  const running = servers.filter((s) => s.status === 'ONLINE' || s.status === 'STARTING');

  for (const server of running) {
    console.log(`[Panel] Guardando y deteniendo "${server.config.name}"...`);
    try {
      await manager.stopServer(server.config.id);
    } catch {
      manager.killServer(server.config.id);
    }
  }

  console.log('[Panel] Todos los servidores detenidos de forma segura. ¡Hasta luego!');
  process.exit(0);
};

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
