// ============================================================
// modpack-manager.ts — Gestor e instalador de Modpacks (.mrpack)
// ============================================================
// Implementa soporte nativo para el formato estándar de Modrinth
// (.mrpack). Permite:
// 1. Descargar e instalar modpacks completos en 1 clic
// 2. Extraer overrides de configuración y scripts del servidor
// 3. Descargar mods compatibles con el lado servidor (excluye client-only)
// 4. Subida directa de archivos .mrpack
// ============================================================

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import AdmZip from 'adm-zip';

export interface InstalledModpackInfo {
  id: string;
  name: string;
  version: string;
  installedAt: string;
  filesCount: number;
  summary?: string;
  iconUrl?: string;
}

export interface MrpackFileEntry {
  path: string;
  hashes: {
    sha1?: string;
    sha512?: string;
  };
  env?: {
    client?: 'required' | 'optional' | 'unsupported';
    server?: 'required' | 'optional' | 'unsupported';
  };
  downloads: string[];
  fileSize?: number;
}

export interface MrpackIndex {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  summary?: string;
  files: MrpackFileEntry[];
  dependencies?: Record<string, string>;
}

/**
 * Descarga una URL en memoria y devuelve el Buffer completo.
 */
function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'CraftPanel/0.1.0 (craftpanel@localhost)' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} al descargar ${url}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.setTimeout(180000, () => {
      req.destroy();
      reject(new Error(`Timeout al descargar archivo del modpack: ${url}`));
    });
  });
}

/**
 * Obtiene la información del modpack actualmente instalado en el servidor.
 */
export function getInstalledModpack(serverDir: string): InstalledModpackInfo | null {
  const infoPath = path.join(serverDir, 'modpack-info.json');
  if (!fs.existsSync(infoPath)) return null;

  try {
    const raw = fs.readFileSync(infoPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[Modpack] Error al leer modpack-info.json en ${serverDir}:`, err);
    return null;
  }
}

/**
 * Desinstala / elimina el registro del modpack actual.
 */
export function uninstallModpack(serverDir: string): void {
  const infoPath = path.join(serverDir, 'modpack-info.json');
  if (fs.existsSync(infoPath)) {
    fs.unlinkSync(infoPath);
    console.log(`[Modpack] Eliminado registro de modpack en ${serverDir}`);
  }
}

/**
 * Instala un modpack a partir de un Buffer de archivo .mrpack (formato ZIP de Modrinth).
 */
export async function installModpackFromBuffer(
  serverDir: string,
  buffer: Buffer,
  meta?: { id?: string; name?: string; version?: string; iconUrl?: string; summary?: string },
  onProgress?: (message: string, current: number, total: number) => void
): Promise<{ name: string; filesInstalled: number }> {
  console.log(`[Modpack] Abriendo archivo .mrpack (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)...`);
  const zip = new AdmZip(buffer);

  // 1. Leer el índice de Modrinth
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) {
    throw new Error('El archivo proporcionado no es un paquete .mrpack válido de Modrinth (falta modrinth.index.json).');
  }

  const indexRaw = zip.readAsText(indexEntry);
  const index: MrpackIndex = JSON.parse(indexRaw);

  if (index.game && index.game !== 'minecraft') {
    throw new Error(`El modpack es para el juego "${index.game}", pero se esperaba "minecraft".`);
  }

  const modpackName = meta?.name || index.name || 'Modpack';
  console.log(`[Modpack] Instalando "${modpackName}" (v${index.versionId || meta?.version || '1.0'})...`);

  // 2. Extraer overrides y server-overrides (archivos de configuración, scripts, etc.)
  const entries = zip.getEntries();
  let overridesCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    let relativePath: string | null = null;
    if (entry.entryName.startsWith('overrides/')) {
      relativePath = entry.entryName.replace(/^overrides\//, '');
    } else if (entry.entryName.startsWith('server-overrides/')) {
      relativePath = entry.entryName.replace(/^server-overrides\//, '');
    }

    if (relativePath) {
      const dest = path.join(serverDir, relativePath);
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.writeFileSync(dest, entry.getData());
      overridesCount++;
    }
  }

  console.log(`[Modpack] Extraídos ${overridesCount} archivos de configuración/scripts.`);

  // 3. Filtrar archivos compatibles con el lado servidor
  // Excluir mods que sean explícitamente unsupported en el servidor (ej: mods exclusivos de cliente)
  const filesToDownload = index.files.filter((f) => {
    if (!f.downloads || f.downloads.length === 0) return false;
    if (f.env && f.env.server === 'unsupported') {
      return false;
    }
    return true;
  });

  const totalFiles = filesToDownload.length;
  console.log(`[Modpack] Descargando ${totalFiles} archivos de mods y librerías...`);

  // 4. Descargar archivos en lotes concurrentes (concurrencia = 4 para balancear velocidad y estabilidad)
  const CONCURRENCY = 4;
  let completed = 0;

  for (let i = 0; i < filesToDownload.length; i += CONCURRENCY) {
    const chunk = filesToDownload.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (file) => {
        const destPath = path.join(serverDir, file.path);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        const downloadUrl = file.downloads[0];
        try {
          const fileBuf = await downloadBuffer(downloadUrl);
          fs.writeFileSync(destPath, fileBuf);
        } catch (err: any) {
          console.warn(`[Modpack] Advertencia: Fallo al descargar ${file.path}: ${err.message}`);
        }

        completed++;
        if (onProgress) {
          onProgress(`Descargando mods (${completed}/${totalFiles})`, completed, totalFiles);
        }
      })
    );
  }

  // 5. Guardar registro del modpack instalado
  const info: InstalledModpackInfo = {
    id: meta?.id || index.versionId || 'custom-modpack',
    name: modpackName,
    version: meta?.version || index.versionId || '1.0.0',
    installedAt: new Date().toISOString(),
    filesCount: totalFiles + overridesCount,
    summary: meta?.summary || index.summary,
    iconUrl: meta?.iconUrl,
  };

  fs.writeFileSync(path.join(serverDir, 'modpack-info.json'), JSON.stringify(info, null, 2), 'utf-8');
  console.log(`[Modpack] ¡"${modpackName}" se ha instalado con éxito! (${totalFiles} mods + ${overridesCount} overrides).`);

  return {
    name: modpackName,
    filesInstalled: totalFiles + overridesCount,
  };
}

/**
 * Descarga e instala un modpack a partir de una URL directa (.mrpack).
 */
export async function installModpackFromUrl(
  serverDir: string,
  downloadUrl: string,
  meta?: { id?: string; name?: string; version?: string; iconUrl?: string; summary?: string },
  onProgress?: (message: string, current: number, total: number) => void
): Promise<{ name: string; filesInstalled: number }> {
  console.log(`[Modpack] Descargando paquete .mrpack desde ${downloadUrl}...`);
  if (onProgress) onProgress('Descargando archivo .mrpack...', 0, 100);

  const buffer = await downloadBuffer(downloadUrl);
  return installModpackFromBuffer(serverDir, buffer, meta, onProgress);
}
