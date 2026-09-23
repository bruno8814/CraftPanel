// ============================================================
// server-manager.ts — Gestor de múltiples servidores
// ============================================================
// Este módulo se encarga de:
//   1. Crear nuevos servidores (carpeta + configuración)
//   2. Mantener un registro de todos los servidores existentes
//   3. Asociar cada servidor con su ProcessManager
//   4. Guardar/cargar la configuración de disco
//
// Piensa en ServerManager como el "director" que gestiona
// un listado de servidores, y ProcessManager como el "operario"
// que controla cada servidor individualmente.
// ============================================================

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ServerConfig, ServerState, ServerStatus, CreateServerRequest } from './types';
import { ProcessManager, ProcessOptions } from './process-manager';
import { downloadFile } from './downloaders/http-helper';
import { handlePlayerLogLine, clearPlayersForServer } from './minecraft-query';
import { clearServerMetricHistory } from './metrics';

export interface InstalledAddon {
  filename: string;
  name: string;
  sizeBytes: number;
  enabled: boolean;
  modifiedAt: string;
}

/**
 * ServerManager es la clase principal que coordina todo.
 *
 * Mantiene:
 * - Un Map (diccionario) de configuraciones por ID
 * - Un Map de ProcessManagers por ID
 * - La ruta base donde viven las carpetas de los servidores
 */
export class ServerManager {
  /** Ruta base donde se guardan las carpetas de todos los servidores */
  private readonly baseDir: string;

  /** Diccionario de configuraciones: id → ServerConfig */
  private configs: Map<string, ServerConfig> = new Map();

  /** Diccionario de ProcessManagers: id → ProcessManager */
  private processes: Map<string, ProcessManager> = new Map();

  /** Registro de timestamps de arranque: id → ISO string */
  private startedTimes: Map<string, string> = new Map();

  /** Listener externo para eventos de log (lo usará el WebSocket) */
  public onLog?: (serverId: string, line: string) => void;

  /** Listener externo para cambios de estado */
  public onStatusChange?: (serverId: string, status: ServerStatus) => void;

  /** Listener externo para salida de procesos Java */
  public onExit?: (serverId: string, code: number | null, signal: string | null) => void;

  /** Listener externo cuando se inicia una parada manual/intencionada */
  public onStopInitiated?: (serverId: string) => void;

  constructor(baseDir: string) {
    this.baseDir = baseDir;

    // Crear la carpeta base si no existe
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
      console.log(`[ServerManager] Carpeta base creada: ${baseDir}`);
    }

    // Cargar servidores existentes del disco
    this.loadFromDisk();
  }

  // ─── Obtener información ──────────────────────────────────

  /**
   * Comprueba si el software del servidor está instalado.
   * Para Paper/Fabric/Vanilla busca el .jar; para NeoForge comprueba las librerías/args.
   */
  private checkServerSoftwareInstalled(config: ServerConfig): boolean {
    const jarPath = path.join(config.directory, config.jarFile);
    if (fs.existsSync(jarPath)) return true;
    if (config.software === 'neoforge') {
      const neoforgeDir = path.join(config.directory, 'libraries', 'net', 'neoforged', 'neoforge');
      return fs.existsSync(neoforgeDir);
    }
    return false;
  }

  /**
   * Devuelve el estado completo de todos los servidores.
   * Esto es lo que el frontend recibirá para pintar la lista.
   */
  getAllServers(): ServerState[] {
    const states: ServerState[] = [];

    for (const [id, config] of this.configs) {
      const pm = this.processes.get(id);
      states.push({
        config,
        status: pm?.status ?? 'OFFLINE',
        pid: pm?.pid ?? null,
        consoleBuffer: pm?.consoleBuffer ?? [],
        startedAt: this.startedTimes.get(id) ?? null,
        jarExists: this.checkServerSoftwareInstalled(config),
      });
    }

    return states;
  }

  /**
   * Devuelve el estado de un servidor específico.
   */
  getServer(id: string): ServerState | null {
    const config = this.configs.get(id);
    if (!config) return null;

    const pm = this.processes.get(id);
    return {
      config,
      status: pm?.status ?? 'OFFLINE',
      pid: pm?.pid ?? null,
      consoleBuffer: pm?.consoleBuffer ?? [],
      startedAt: this.startedTimes.get(id) ?? null,
      jarExists: this.checkServerSoftwareInstalled(config),
    };
  }

  // ─── Crear un nuevo servidor ──────────────────────────────

  /**
   * Crea un nuevo servidor de Minecraft.
   *
   * Lo que hace paso a paso:
   *   1. Genera un ID único (UUID)
   *   2. Crea la carpeta del servidor en disco
   *   3. Crea el archivo eula.txt con eula=true
   *      (Minecraft se niega a arrancar si no aceptas la EULA)
   *   4. Guarda la configuración en un archivo JSON
   *   5. Crea su ProcessManager asociado
   */
  createServer(request: CreateServerRequest): ServerConfig {
    const id = uuidv4();
    // Limpiamos el nombre para usarlo como nombre de carpeta seguro
    const safeName = request.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'server';
    const serverDir = path.join(this.baseDir, `${safeName}-${id.slice(0, 8)}`);

    // Crear la carpeta del servidor
    fs.mkdirSync(serverDir, { recursive: true });
    console.log(`[ServerManager] Carpeta creada: ${serverDir}`);

    // Crear subcarpetas útiles
    fs.mkdirSync(path.join(serverDir, 'mods'), { recursive: true });
    fs.mkdirSync(path.join(serverDir, 'plugins'), { recursive: true });

    // Aceptar la EULA automáticamente
    // Minecraft muestra la EULA la primera vez y se niega a arrancar
    // hasta que el archivo eula.txt contenga "eula=true"
    fs.writeFileSync(
      path.join(serverDir, 'eula.txt'),
      '# Aceptada automáticamente por MC Panel\neula=true\n'
    );

    // Crear un server.properties básico con el puerto configurado
    const port = request.port ?? this.findAvailablePort();
    const serverProperties = [
      `# Generado por MC Panel`,
      `server-port=${port}`,
      `motd=\\u00A7b${request.name} \\u00A77- Gestionado por MC Panel`,
      `max-players=20`,
      `online-mode=true`,
      `difficulty=normal`,
      `gamemode=survival`,
      ``,
    ].join('\n');
    fs.writeFileSync(path.join(serverDir, 'server.properties'), serverProperties);

    // Crear la configuración del servidor
    const config: ServerConfig = {
      id,
      name: request.name,
      software: request.software,
      version: request.version,
      memoryMB: request.memoryMB,
      port,
      directory: serverDir,
      jarFile: 'server.jar', // Nombre por defecto, se actualiza al descargar
      createdAt: new Date().toISOString(),
    };

    // Guardar la configuración en un archivo JSON dentro de la carpeta
    this.saveConfig(config);

    // Registrar en memoria
    this.configs.set(id, config);
    this.setupProcessManager(id);

    console.log(`[ServerManager] Servidor creado: "${config.name}" (${id})`);
    return config;
  }

  // ─── Actualizar configuración ──────────────────────────────

  /**
   * Actualiza el nombre del archivo .jar en la configuración
   * del servidor. Se usa después de descargar el software.
   */
  updateJarFile(id: string, jarFile: string): void {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Servidor no encontrado: ${id}`);

    config.jarFile = jarFile;
    this.saveConfig(config);
    console.log(`[ServerManager] JarFile actualizado para "${config.name}": ${jarFile}`);
  }

  // ─── Control de servidores ────────────────────────────────


  /**
   * Arranca un servidor por su ID.
   *
   * Antes de arrancar, verifica que el archivo .jar exista
   * en la carpeta del servidor.
   */
  startServer(id: string): void {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Servidor no encontrado: ${id}`);

    const pm = this.processes.get(id);
    if (!pm) throw new Error(`ProcessManager no encontrado para: ${id}`);

    if (pm.status !== 'OFFLINE') {
      throw new Error(`El servidor ya está ${pm.status.toLowerCase()}.`);
    }

    // Verificar que el software del servidor está instalado
    if (!this.checkServerSoftwareInstalled(config)) {
      throw new Error(
        `No se encontró el software instalado en ${config.directory}. ` +
        `Necesitas descargar el software del servidor primero.`
      );
    }

    const options: ProcessOptions = {
      serverDir: config.directory,
      jarFile: config.jarFile,
      memoryMB: config.memoryMB,
      javaPath: 'java', // TODO: usar JavaRuntime para resolver la ruta correcta
      jvmArgs: [
        // Flags de optimización de Aikar, usados por la mayoría de
        // servidores de Minecraft en producción para mejorar el
        // rendimiento del recolector de basura de Java
        '-XX:+UseG1GC',
        '-XX:+ParallelRefProcEnabled',
        '-XX:MaxGCPauseMillis=200',
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+DisableExplicitGC',
        '-XX:G1NewSizePercent=30',
        '-XX:G1MaxNewSizePercent=40',
        '-XX:G1HeapRegionSize=8M',
        '-XX:G1ReservePercent=20',
        '-XX:G1MixedGCCountTarget=4',
        '-XX:InitiatingHeapOccupancyPercent=15',
        '-XX:G1MixedGCLiveThresholdPercent=90',
        '-XX:G1RSetUpdatingPauseTimePercent=5',
        '-XX:SurvivorRatio=32',
        '-XX:+PerfDisableSharedMem',
        '-XX:MaxTenuringThreshold=1',
      ],
    };

    pm.start(options);
    this.startedTimes.set(id, new Date().toISOString());
  }

  /**
   * Detiene un servidor limpiamente (envía /stop).
   */
  async stopServer(id: string): Promise<void> {
    const pm = this.processes.get(id);
    if (!pm) throw new Error(`Servidor no encontrado: ${id}`);
    this.onStopInitiated?.(id);
    await pm.stop();
  }

  /**
   * Mata un servidor forzosamente.
   */
  killServer(id: string): void {
    const pm = this.processes.get(id);
    if (!pm) throw new Error(`Servidor no encontrado: ${id}`);
    this.onStopInitiated?.(id);
    pm.kill();
  }

  /**
   * Envía un comando a la consola de un servidor.
   */
  sendCommand(id: string, command: string): void {
    const pm = this.processes.get(id);
    if (!pm) throw new Error(`Servidor no encontrado: ${id}`);
    pm.sendCommand(command);
  }

  /**
   * Elimina un servidor (solo si está apagado).
   * Borra la carpeta y la configuración de la memoria.
   */
  deleteServer(id: string): void {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Servidor no encontrado: ${id}`);

    const pm = this.processes.get(id);
    if (pm && pm.status !== 'OFFLINE') {
      throw new Error('No puedes eliminar un servidor que está corriendo. Páralo primero.');
    }

    // Eliminar la carpeta del disco
    fs.rmSync(config.directory, { recursive: true, force: true });

    // Eliminar de memoria
    this.configs.delete(id);
    this.processes.delete(id);

    console.log(`[ServerManager] Servidor eliminado: "${config.name}" (${id})`);
  }

  // ─── Gestión de Mods y Plugins (Fase 4) ────────────────────

  /**
   * Obtiene la lista de mods o plugins instalados en el servidor.
   */
  getInstalledAddons(id: string, subfolder: 'mods' | 'plugins'): InstalledAddon[] {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Servidor no encontrado: ${id}`);

    const targetDir = path.join(config.directory, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(targetDir);
    const addons: InstalledAddon[] = [];

    for (const file of files) {
      if (!file.endsWith('.jar') && !file.endsWith('.jar.disabled')) continue;

      const fullPath = path.join(targetDir, file);
      const stat = fs.statSync(fullPath);
      const enabled = !file.endsWith('.disabled');
      const cleanName = file.replace(/\.jar(\.disabled)?$/, '');

      addons.push({
        filename: file,
        name: cleanName,
        sizeBytes: stat.size,
        enabled,
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    return addons;
  }

  /**
   * Instala un mod o plugin descargando el archivo .jar en la carpeta correspondiente.
   */
  async installAddon(
    id: string,
    subfolder: 'mods' | 'plugins',
    downloadUrl: string,
    filename: string
  ): Promise<string> {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Servidor no encontrado: ${id}`);

    const targetDir = path.join(config.directory, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Sanitizar el nombre del archivo
    const safeFilename = filename.replace(/[^a-zA-Z0-9_\-\.\+]/g, '_');
    console.log(`[ServerManager] Instalando ${safeFilename} en ${config.name}/${subfolder}...`);

    await downloadFile(downloadUrl, targetDir, safeFilename);
    console.log(`[ServerManager] ${safeFilename} instalado correctamente.`);
    return safeFilename;
  }

  /**
   * Guarda un archivo de mod o plugin subido por streaming HTTP directo (.jar o .zip).
   */
  async saveUploadedAddon(
    id: string,
    subfolder: 'mods' | 'plugins',
    originalFilename: string,
    reqStream: NodeJS.ReadableStream
  ): Promise<string> {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Servidor no encontrado: ${id}`);

    const targetDir = path.join(config.directory, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const safeFilename = path.basename(originalFilename).replace(/[^a-zA-Z0-9_\-\.\+]/g, '_');
    if (!safeFilename.endsWith('.jar') && !safeFilename.endsWith('.zip')) {
      throw new Error('Solo se permiten archivos con extensión .jar o .zip');
    }

    const destPath = path.join(targetDir, safeFilename);
    const writeStream = fs.createWriteStream(destPath);
    await new Promise<void>((resolve, reject) => {
      reqStream.pipe(writeStream);
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    console.log(`[ServerManager] Addon subido: ${safeFilename} en ${config.name}/${subfolder}`);
    return safeFilename;
  }

  /**
   * Desinstala (elimina) un mod o plugin.
   */
  uninstallAddon(id: string, subfolder: 'mods' | 'plugins', filename: string): void {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Servidor no encontrado: ${id}`);

    const filePath = path.join(config.directory, subfolder, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[ServerManager] Eliminado ${filename} de ${config.name}/${subfolder}`);
    } else {
      throw new Error(`Archivo no encontrado: ${filename}`);
    }
  }

  /**
   * Activa o desactiva un mod o plugin renombrándolo con .disabled.
   */
  toggleAddon(id: string, subfolder: 'mods' | 'plugins', filename: string): { enabled: boolean; newFilename: string } {
    const config = this.configs.get(id);
    if (!config) throw new Error(`Servidor no encontrado: ${id}`);

    const targetDir = path.join(config.directory, subfolder);
    const oldPath = path.join(targetDir, filename);

    if (!fs.existsSync(oldPath)) {
      throw new Error(`Archivo no encontrado: ${filename}`);
    }

    let newFilename: string;
    let enabled: boolean;

    if (filename.endsWith('.disabled')) {
      newFilename = filename.replace(/\.disabled$/, '');
      enabled = true;
    } else {
      newFilename = `${filename}.disabled`;
      enabled = false;
    }

    const newPath = path.join(targetDir, newFilename);
    fs.renameSync(oldPath, newPath);

    console.log(`[ServerManager] ${filename} → ${newFilename} (${enabled ? 'activado' : 'desactivado'})`);
    return { enabled, newFilename };
  }

  // ─── Métodos internos ─────────────────────────────────────

  /**
   * Crea un ProcessManager para un servidor y conecta sus eventos.
   */
  private setupProcessManager(id: string): void {
    const pm = new ProcessManager();

    // Cuando el proceso emite un log, lo reenviamos al listener externo
    // y rastreamos entradas/salidas de jugadores en tiempo real
    pm.on('log', (line: string) => {
      handlePlayerLogLine(id, line);
      this.onLog?.(id, line);
    });

    // Cuando cambia el estado, lo reenviamos también y limpiamos métricas si se apaga
    pm.on('status', (status: ServerStatus) => {
      if (status === 'OFFLINE') {
        this.startedTimes.delete(id);
        clearPlayersForServer(id);
        clearServerMetricHistory(id);
      }
      this.onStatusChange?.(id, status);
    });

    // Cuando el proceso termina (código o señal)
    pm.on('exit', (code: number | null, signal: string | null) => {
      this.onExit?.(id, code, signal);
    });

    this.processes.set(id, pm);
  }

  /**
   * Guarda la configuración de un servidor en un archivo JSON
   * dentro de su carpeta (mc-panel.json).
   */
  private saveConfig(config: ServerConfig): void {
    const configPath = path.join(config.directory, 'mc-panel.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Escanea la carpeta base buscando servidores existentes.
   *
   * Busca subcarpetas que contengan un archivo "mc-panel.json"
   * y las carga en memoria. Así, si reinicias el panel,
   * tus servidores siguen ahí.
   */
  private loadFromDisk(): void {
    if (!fs.existsSync(this.baseDir)) return;

    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const configPath = path.join(this.baseDir, entry.name, 'mc-panel.json');
      if (!fs.existsSync(configPath)) continue;

      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const config: ServerConfig = JSON.parse(raw);

        // Actualizar la ruta del directorio por si se movió la carpeta
        config.directory = path.join(this.baseDir, entry.name);

        this.configs.set(config.id, config);
        this.setupProcessManager(config.id);

        console.log(`[ServerManager] Servidor cargado: "${config.name}" (${config.id})`);
      } catch (err) {
        console.error(`[ServerManager] Error al cargar ${configPath}:`, err);
      }
    }

    console.log(`[ServerManager] ${this.configs.size} servidor(es) cargado(s) del disco.`);
  }

  /**
   * Busca un puerto disponible empezando por 25565.
   * Revisa los puertos ya usados por otros servidores y devuelve
   * el primero que esté libre.
   */
  private findAvailablePort(): number {
    const usedPorts = new Set<number>();
    for (const config of this.configs.values()) {
      usedPorts.add(config.port);
    }

    let port = 25565;
    while (usedPorts.has(port)) {
      port++;
    }
    return port;
  }
}
