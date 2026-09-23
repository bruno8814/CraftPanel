// ============================================================
// backup-manager.ts — Gestor de Copias de Seguridad y Restauración
// ============================================================
// Diseñado para ser 100% agnóstico al sistema operativo:
//   - Compatible con Linux, Windows, Proxmox VE y Contenedores LXC
//   - Soporta process.env.BACKUPS_DIR para puntos de montaje externos / ZFS
//   - Compresión eficiente por streaming con archiver (bajo uso de RAM)
//   - Extracción y restauración en 1-clic con AdmZip
//   - Soporte para bloqueo de seguridad (candado) e importación de zips
// ============================================================

import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';
import AdmZip from 'adm-zip';
import { ServerState } from './types';

export interface BackupMetadata {
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

export interface BackupsListResult {
  backups: BackupMetadata[];
  totalSizeBytes: number;
}

// ── Directorio base de backups (agnóstico al sistema operativo) ──
const DEFAULT_BACKUPS_DIR = path.resolve(__dirname, '..', '..', 'backups');
export const BASE_BACKUPS_DIR = process.env.BACKUPS_DIR
  ? path.resolve(process.env.BACKUPS_DIR)
  : DEFAULT_BACKUPS_DIR;

// Asegurar que el directorio base de backups exista
if (!fs.existsSync(BASE_BACKUPS_DIR)) {
  fs.mkdirSync(BASE_BACKUPS_DIR, { recursive: true });
}

/**
 * Obtiene la ruta al directorio de backups de un servidor concreto.
 * Crea la carpeta si no existe.
 */
export function getServerBackupsDir(serverId: string): string {
  // Evitar cualquier intento de path traversal en el serverId
  const safeId = serverId.replace(/[^a-zA-Z0-9_\-]/g, '');
  const dir = path.join(BASE_BACKUPS_DIR, safeId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Valida y obtiene la ruta absoluta segura a un archivo de backup.
 */
export function getSafeBackupFilePath(serverId: string, filename: string): string {
  const safeFilename = path.basename(filename);
  if (!safeFilename.endsWith('.zip')) {
    throw new Error('Solo se permiten archivos con extensión .zip');
  }
  const dir = getServerBackupsDir(serverId);
  const fullPath = path.join(dir, safeFilename);

  // Verificación estricta de Path Traversal
  if (!fullPath.startsWith(dir)) {
    throw new Error('Acceso no permitido fuera del directorio de backups.');
  }

  return fullPath;
}

/**
 * Formatea una fecha para usarla de forma segura en nombres de archivo (ISO amigable para Windows y Linux).
 */
function formatDateForFilename(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d}_${h}-${min}-${s}`;
}

// ── Listar backups ──────────────────────────────────────────

/**
 * Lista todas las copias de seguridad de un servidor.
 */
export async function listBackups(serverId: string): Promise<BackupsListResult> {
  const dir = getServerBackupsDir(serverId);
  const files = fs.readdirSync(dir);
  const zipFiles = files.filter((f) => f.endsWith('.zip'));

  const backups: BackupMetadata[] = [];
  let totalSizeBytes = 0;

  for (const zipFile of zipFiles) {
    const zipPath = path.join(dir, zipFile);
    const metaPath = path.join(dir, `${zipFile}.json`);

    try {
      const stat = fs.statSync(zipPath);
      totalSizeBytes += stat.size;

      if (fs.existsSync(metaPath)) {
        const metaContent = fs.readFileSync(metaPath, 'utf-8');
        const meta = JSON.parse(metaContent) as BackupMetadata;
        // Asegurar que el tamaño coincida con el fichero real
        meta.sizeBytes = stat.size;
        backups.push(meta);
      } else {
        // Si no tiene archivo .json (ej: subido manualmente), generar metadatos automáticos
        const fallbackMeta: BackupMetadata = {
          id: zipFile.replace(/\.zip$/, ''),
          filename: zipFile,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
          serverName: 'Minecraft Server',
          serverVersion: 'Desconocida',
          software: 'minecraft',
          note: 'Backup importado',
          locked: false,
        };
        // Guardar el metadata para futuras consultas
        fs.writeFileSync(metaPath, JSON.stringify(fallbackMeta, null, 2));
        backups.push(fallbackMeta);
      }
    } catch (err) {
      console.error(`[BackupManager] Error al leer metadatos de ${zipFile}:`, err);
    }
  }

  // Ordenar los backups del más reciente al más antiguo
  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { backups, totalSizeBytes };
}

// ── Crear backup ────────────────────────────────────────────

export interface CreateBackupOptions {
  note?: string;
  excludeLogs?: boolean;
}

/**
 * Crea una copia de seguridad comprimida en formato .zip mediante streams.
 */
export function createBackup(
  server: ServerState,
  options: CreateBackupOptions = {}
): Promise<BackupMetadata> {
  return new Promise((resolve, reject) => {
    const dir = getServerBackupsDir(server.config.id);
    const safeServerName = server.config.name
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .trim() || 'server';
    const timestampStr = formatDateForFilename(new Date());
    const filename = `${safeServerName}_${timestampStr}.zip`;
    const targetZipPath = path.join(dir, filename);
    const targetMetaPath = path.join(dir, `${filename}.json`);

    const output = fs.createWriteStream(targetZipPath);
    const archive = new ZipArchive({
      zlib: { level: 6 }, // Nivel de compresión óptimo (balance entre velocidad y tamaño)
    });

    output.on('close', () => {
      const stat = fs.statSync(targetZipPath);
      const metadata: BackupMetadata = {
        id: filename.replace(/\.zip$/, ''),
        filename,
        sizeBytes: stat.size,
        createdAt: new Date().toISOString(),
        serverName: server.config.name,
        serverVersion: server.config.version,
        software: server.config.software,
        note: options.note || undefined,
        locked: false,
      };

      fs.writeFileSync(targetMetaPath, JSON.stringify(metadata, null, 2));
      console.log(`[BackupManager] Backup creado con éxito: ${filename} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
      resolve(metadata);
    });

    archive.on('error', (err: any) => {
      // Si falla la compresión, limpiar el archivo incompleto
      if (fs.existsSync(targetZipPath)) {
        try { fs.unlinkSync(targetZipPath); } catch {}
      }
      reject(err);
    });

    archive.pipe(output);

    // Patrones de exclusión para ahorrar espacio y evitar bloqueos de archivos en caliente (ej: session.lock en Windows)
    const ignorePatterns = [
      'backups/**',
      'cache/**',
      '.tmp/**',
      'crash-reports/**',
      '**/*.lock',
      '**/*.lck',
      '**/session.lock',
    ];

    if (options.excludeLogs) {
      ignorePatterns.push('logs/**');
    }

    // Añadir el contenido completo de la carpeta del servidor
    archive.glob('**/*', {
      cwd: server.config.directory,
      ignore: ignorePatterns,
      dot: true, // Incluir archivos ocultos como .fabric
    });

    archive.finalize();
  });
}

// ── Restaurar backup ────────────────────────────────────────

/**
 * Restaura una copia de seguridad descomprimiendo el archivo .zip
 * sobre la carpeta del servidor.
 */
export async function restoreBackup(
  serverDir: string,
  serverId: string,
  filename: string
): Promise<void> {
  const zipPath = getSafeBackupFilePath(serverId, filename);
  if (!fs.existsSync(zipPath)) {
    throw new Error(`El archivo de backup no existe: ${filename}`);
  }

  return new Promise((resolve, reject) => {
    try {
      console.log(`[BackupManager] Iniciando restauración de ${filename} en ${serverDir}...`);
      const zip = new AdmZip(zipPath);

      // Descomprimir sobrescribiendo archivos existentes
      zip.extractAllToAsync(serverDir, true, false, (err) => {
        if (err) {
          console.error('[BackupManager] Error al extraer backup:', err);
          return reject(err);
        }
        console.log(`[BackupManager] Restauración de ${filename} completada correctamente.`);
        resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ── Eliminar backup ─────────────────────────────────────────

/**
 * Elimina una copia de seguridad y su metadata si no está bloqueada.
 */
export async function deleteBackup(serverId: string, filename: string): Promise<void> {
  const zipPath = getSafeBackupFilePath(serverId, filename);
  const metaPath = `${zipPath}.json`;

  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as BackupMetadata;
      if (meta.locked) {
        throw new Error('Esta copia de seguridad está bloqueada con candado. Desbloquéala antes de eliminar.');
      }
    } catch (err: any) {
      if (err.message.includes('bloqueada')) throw err;
    }
  }

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  if (fs.existsSync(metaPath)) {
    fs.unlinkSync(metaPath);
  }

  console.log(`[BackupManager] Backup eliminado: ${filename}`);
}

// ── Bloquear / Desbloquear (Candado de Seguridad) ───────────

/**
 * Alterna el estado de bloqueo de un backup para protegerlo contra borrado accidental.
 */
export async function toggleLockBackup(serverId: string, filename: string): Promise<BackupMetadata> {
  const zipPath = getSafeBackupFilePath(serverId, filename);
  const metaPath = `${zipPath}.json`;

  if (!fs.existsSync(zipPath)) {
    throw new Error('El archivo de backup no existe.');
  }

  let metadata: BackupMetadata;
  if (fs.existsSync(metaPath)) {
    metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    metadata.locked = !metadata.locked;
  } else {
    const stat = fs.statSync(zipPath);
    metadata = {
      id: filename.replace(/\.zip$/, ''),
      filename,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
      serverName: 'Minecraft Server',
      serverVersion: '1.20.4',
      software: 'minecraft',
      locked: true,
    };
  }

  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  return metadata;
}

// ── Subir / Importar Backup Externo ─────────────────────────

/**
 * Guarda un stream de archivo .zip subido desde el navegador como nuevo backup.
 */
export function saveUploadedBackup(
  serverId: string,
  originalFilename: string,
  stream: NodeJS.ReadableStream,
  server: ServerState
): Promise<BackupMetadata> {
  return new Promise((resolve, reject) => {
    const dir = getServerBackupsDir(serverId);
    const cleanBase = path.basename(originalFilename).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const safeFilename = cleanBase.endsWith('.zip') ? cleanBase : `${cleanBase}.zip`;

    // Evitar colisión de nombres
    const timestamp = formatDateForFilename(new Date());
    const finalFilename = `import_${timestamp}_${safeFilename}`;
    const targetZipPath = path.join(dir, finalFilename);
    const targetMetaPath = path.join(dir, `${finalFilename}.json`);

    const writeStream = fs.createWriteStream(targetZipPath);

    stream.pipe(writeStream);

    writeStream.on('finish', () => {
      try {
        const stat = fs.statSync(targetZipPath);
        const metadata: BackupMetadata = {
          id: finalFilename.replace(/\.zip$/, ''),
          filename: finalFilename,
          sizeBytes: stat.size,
          createdAt: new Date().toISOString(),
          serverName: server.config.name,
          serverVersion: server.config.version,
          software: server.config.software,
          note: 'Copia importada externamente',
          locked: false,
        };

        fs.writeFileSync(targetMetaPath, JSON.stringify(metadata, null, 2));
        console.log(`[BackupManager] Backup importado con éxito: ${finalFilename}`);
        resolve(metadata);
      } catch (err) {
        reject(err);
      }
    });

    writeStream.on('error', (err) => {
      if (fs.existsSync(targetZipPath)) {
        try { fs.unlinkSync(targetZipPath); } catch {}
      }
      reject(err);
    });
  });
}
