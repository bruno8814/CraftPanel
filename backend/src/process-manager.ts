// ============================================================
// process-manager.ts — El "titiritero" de los servidores
// ============================================================
// Este módulo es el corazón del panel. Se encarga de:
//   1. Arrancar un proceso Java con el .jar del servidor
//   2. Capturar TODO lo que el servidor escribe en la consola
//   3. Permitirte enviar comandos (como /op, /stop, /say)
//   4. Detectar automáticamente cuándo el servidor ha terminado
//      de cargar y está listo para jugadores
//   5. Manejar paradas limpias y forzadas
//
// Usa el módulo nativo de Node.js "child_process" que permite
// lanzar programas externos (en este caso java.exe) y controlar
// su entrada (stdin), salida (stdout) y errores (stderr).
// ============================================================

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { ServerStatus } from './types';

/**
 * Opciones para arrancar un servidor de Minecraft.
 */
export interface ProcessOptions {
  /** Ruta absoluta a la carpeta donde está el servidor */
  serverDir: string;

  /** Nombre del archivo .jar (ej. "server.jar") */
  jarFile: string;

  /** Memoria máxima en MB (ej. 2048) */
  memoryMB: number;

  /** Ruta al ejecutable de Java (ej. "java" o "C:/runtimes/java-21/bin/java.exe") */
  javaPath: string;

  /** Argumentos JVM extra opcionales */
  jvmArgs?: string[];
}

/**
 * ProcessManager controla UN proceso de Minecraft.
 *
 * Extiende EventEmitter, que es un patrón de Node.js para emitir
 * "eventos" que otras partes del código pueden escuchar.
 * Por ejemplo: cuando el servidor imprime una línea, este objeto
 * emite el evento 'log' y quien esté escuchando lo recibe.
 *
 * Eventos que emite:
 *   'log'    → (line: string)          — Cada línea de la consola
 *   'status' → (status: ServerStatus)  — Cambios de estado
 *   'exit'   → (code, signal)          — El proceso ha terminado
 */
export class ProcessManager extends EventEmitter {
  /** El proceso hijo de Java (null si no está corriendo) */
  private process: ChildProcess | null = null;

  /** Estado actual del servidor */
  private _status: ServerStatus = 'OFFLINE';

  /** Buffer circular con las últimas líneas de consola */
  private _consoleBuffer: string[] = [];

  /** Máximo de líneas que guardamos en memoria */
  private readonly maxBufferLines = 500;

  // ─── Getters públicos ────────────────────────────────────

  /** Devuelve el estado actual */
  get status(): ServerStatus {
    return this._status;
  }

  /** Devuelve el PID del proceso Java (o null) */
  get pid(): number | null {
    return this.process?.pid ?? null;
  }

  /** Devuelve una copia del buffer de consola */
  get consoleBuffer(): string[] {
    return [...this._consoleBuffer];
  }

  // ─── Método principal: Arrancar el servidor ──────────────

  /**
   * Arranca el servidor de Minecraft.
   *
   * Internamente ejecuta algo como:
   *   java -Xms512M -Xmx4096M -jar server.jar nogui
   *
   * El flag "nogui" le dice a Minecraft que no abra la ventana
   * gráfica del servidor (queremos controlarlo solo por consola).
   */
  start(options: ProcessOptions): void {
    // Seguridad: no arrancar dos veces
    if (this.process) {
      throw new Error('El servidor ya está corriendo. Para reiniciar, usa restart().');
    }

    // Comprobamos si el servidor es NeoForge (usa archivos de argumentos @args.txt)
    const neoforgeBaseDir = path.join(options.serverDir, 'libraries', 'net', 'neoforged', 'neoforge');
    let neoForgeArgsFile: string | null = null;

    if (fs.existsSync(neoforgeBaseDir)) {
      try {
        const builds = fs.readdirSync(neoforgeBaseDir);
        for (const build of builds) {
          const isWin = process.platform === 'win32';
          const targetArgs = isWin ? 'win_args.txt' : 'unix_args.txt';
          const fullArgsPath = path.join(neoforgeBaseDir, build, targetArgs);
          if (fs.existsSync(fullArgsPath)) {
            neoForgeArgsFile = path.join('libraries', 'net', 'neoforged', 'neoforge', build, targetArgs).replace(/\\/g, '/');
            break;
          }
        }
      } catch (err) {
        console.warn('[ProcessManager] Error detectando argumentos de NeoForge:', err);
      }
    }

    let args: string[] = [];

    if (neoForgeArgsFile) {
      // Para NeoForge: escribimos la memoria en user_jvm_args.txt y pasamos los archivos @args
      const userJvmArgsPath = path.join(options.serverDir, 'user_jvm_args.txt');
      const jvmContent = [
        '# Configuración de memoria JVM generada por CraftPanel',
        `-Xms${Math.min(options.memoryMB, 512)}M`,
        `-Xmx${options.memoryMB}M`,
        ...(options.jvmArgs ?? []),
        '',
      ].join('\n');
      fs.writeFileSync(userJvmArgsPath, jvmContent);

      args = [
        '@user_jvm_args.txt',
        `@${neoForgeArgsFile}`,
        'nogui',
      ];
      this.addLog(`[Panel] Modo NeoForge detectado: usando @user_jvm_args.txt y @${neoForgeArgsFile}`);
    } else {
      // Modo estándar (Paper, Fabric, Vanilla): ejecución directa del archivo .jar
      args = [
        `-Xms${Math.min(options.memoryMB, 512)}M`,
        `-Xmx${options.memoryMB}M`,
        ...(options.jvmArgs ?? []),
        '-jar',
        options.jarFile,
        'nogui',
      ];
    }

    this.setStatus('STARTING');
    this.addLog(`[Panel] Arrancando servidor: ${options.javaPath} ${args.join(' ')}`);
    this.addLog(`[Panel] Directorio: ${options.serverDir}`);

    // ── spawn() es la función clave ──
    // Lanza un proceso externo (java.exe) y nos devuelve un objeto
    // ChildProcess con acceso a stdin, stdout y stderr.
    //
    // cwd (current working directory) le dice a Java que ejecute
    // el jar DESDE la carpeta del servidor, para que server.properties,
    // la carpeta world/, logs/ etc. se creen ahí.
    this.process = spawn(options.javaPath, args, {
      cwd: options.serverDir,
      // stdio: 'pipe' significa que queremos controlar la entrada
      // y salida del proceso desde nuestro código Node.js
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // ── Escuchar la salida del servidor (stdout) ──
    // stdout es un "Stream" (flujo de datos). Cada vez que Minecraft
    // imprime algo en la consola, nos llega aquí como un trozo de bytes.
    // Lo convertimos a texto con 'utf-8' y lo procesamos línea a línea.
    this.process.stdout?.setEncoding('utf-8');
    this.process.stdout?.on('data', (data: string) => {
      // Un "chunk" de datos puede contener varias líneas juntas,
      // así que las separamos por saltos de línea
      const lines = data.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        this.handleLogLine(line);
      }
    });

    // ── Escuchar errores del servidor (stderr) ──
    // stderr es donde Java/Minecraft escribe errores y warnings.
    // Los tratamos igual que stdout para verlos en la consola web.
    this.process.stderr?.setEncoding('utf-8');
    this.process.stderr?.on('data', (data: string) => {
      const lines = data.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        this.handleLogLine(line);
      }
    });

    // ── Detectar cuando el proceso termina ──
    // El evento 'exit' se dispara cuando Java se cierra, ya sea
    // porque se ejecutó /stop, crasheó, o lo matamos nosotros.
    this.process.on('exit', (code, signal) => {
      this.addLog(
        `[Panel] Proceso terminado (código: ${code}, señal: ${signal})`
      );
      this.process = null;
      this.setStatus('OFFLINE');
      this.emit('exit', code, signal);
    });

    // ── Error al intentar lanzar el proceso ──
    // Esto pasa si, por ejemplo, la ruta a java.exe no existe
    this.process.on('error', (err) => {
      this.addLog(`[Panel] ERROR al lanzar el proceso: ${err.message}`);
      this.process = null;
      this.setStatus('OFFLINE');
      this.emit('exit', null, null);
    });
  }

  // ─── Enviar un comando al servidor ───────────────────────

  /**
   * Envía un comando a la consola del servidor de Minecraft.
   *
   * Funciona escribiendo texto en la entrada estándar (stdin)
   * del proceso Java. Es como si escribieras en la consola
   * del servidor y pulsaras Enter.
   *
   * @param command — El comando sin la barra (ej. "say Hola", "op Jugador1")
   */
  sendCommand(command: string): void {
    if (!this.process || !this.process.stdin) {
      throw new Error('No se puede enviar un comando: el servidor no está corriendo.');
    }

    this.addLog(`> ${command}`);
    // Escribimos el comando + un salto de línea (el "Enter")
    this.process.stdin.write(command + '\n');
  }

  // ─── Parar el servidor limpiamente ───────────────────────

  /**
   * Envía el comando "stop" al servidor de Minecraft.
   *
   * Este es el método "educado" de parar el servidor: le dice a
   * Minecraft que guarde el mundo, desconecte a los jugadores
   * y cierre el proceso de forma segura.
   */
  async stop(): Promise<void> {
    if (!this.process) {
      throw new Error('El servidor ya está detenido.');
    }

    this.setStatus('STOPPING');
    this.sendCommand('stop');

    // Esperamos a que el proceso termine por su cuenta
    // Si tarda más de 30 segundos, lo matamos forzosamente
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.addLog('[Panel] El servidor no respondió en 30s. Forzando cierre...');
        this.kill();
        resolve();
      }, 30_000);

      this.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  // ─── Matar el proceso forzosamente ───────────────────────

  /**
   * Mata el proceso de Java inmediatamente.
   *
   * Equivalente a hacer Ctrl+C o "Finalizar tarea" en el
   * Administrador de Tareas. ¡Cuidado! El mundo podría no
   * guardarse correctamente si se usa esto.
   */
  kill(): void {
    if (this.process) {
      this.addLog('[Panel] Matando proceso forzosamente (SIGKILL)...');
      this.process.kill('SIGKILL');
      this.process = null;
      this.setStatus('OFFLINE');
    }
  }

  // ─── Reiniciar el servidor ───────────────────────────────

  /**
   * Para y vuelve a arrancar el servidor.
   * Útil después de instalar mods o cambiar configuraciones.
   */
  async restart(options: ProcessOptions): Promise<void> {
    if (this.process) {
      await this.stop();
    }
    this.start(options);
  }

  // ─── Métodos internos ────────────────────────────────────

  /**
   * Procesa cada línea que el servidor imprime en la consola.
   *
   * Aquí es donde detectamos eventos importantes. Minecraft
   * imprime una línea específica cuando ha terminado de cargar:
   *   [Server thread/INFO]: Done (12.345s)! For help, type "help"
   *
   * Cuando la vemos, sabemos que el servidor está ONLINE.
   */
  private handleLogLine(line: string): void {
    this.addLog(line);

    // ── Detección de "servidor listo" ──
    // El servidor de Minecraft (vanilla, Paper, Fabric, Forge...)
    // SIEMPRE imprime un mensaje que contiene "Done (" cuando
    // ha terminado de cargar. Es el estándar desde hace años.
    if (this._status === 'STARTING' && line.includes('Done (')) {
      this.setStatus('ONLINE');
    }

    // ── Detección de parada ──
    // Cuando el servidor se está cerrando, imprime "Stopping server"
    if (
      this._status === 'ONLINE' &&
      line.includes('Stopping the server') ||
      line.includes('Stopping server')
    ) {
      this.setStatus('STOPPING');
    }
  }

  /**
   * Añade una línea al buffer circular de la consola.
   * Si el buffer supera el máximo, elimina las líneas más antiguas.
   */
  private addLog(line: string): void {
    this._consoleBuffer.push(line);
    if (this._consoleBuffer.length > this.maxBufferLines) {
      // shift() elimina el primer elemento del array (el más antiguo)
      this._consoleBuffer.shift();
    }
    // Emitimos el evento 'log' para que quien escuche (el WebSocket)
    // pueda enviar esta línea al navegador en tiempo real
    this.emit('log', line);
  }

  /**
   * Cambia el estado del servidor y emite un evento.
   */
  private setStatus(status: ServerStatus): void {
    const previous = this._status;
    this._status = status;
    this.addLog(`[Panel] Estado: ${previous} → ${status}`);
    this.emit('status', status);
  }
}
