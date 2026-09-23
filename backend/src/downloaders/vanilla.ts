// ============================================================
// downloaders/vanilla.ts — Descargador del servidor Vanilla
// ============================================================
// El servidor Vanilla es el oficial de Mojang, sin mods ni plugins.
//
// Mojang publica un "Version Manifest" en:
//   https://launchermeta.mojang.com/mc/game/version_manifest_v2.json
//
// Este manifiesto contiene la URL de los metadatos de cada versión.
// Dentro de esos metadatos está la URL de descarga del server.jar.
//
// Flujo:
//   1. GET version_manifest_v2.json → lista de todas las versiones
//   2. GET {version_url} → metadatos de esa versión específica
//   3. GET {server_download_url} → el server.jar
// ============================================================

import { SoftwareDownloader, VersionInfo, BuildInfo } from './base';
import { fetchJson, downloadFile } from './http-helper';

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';

/** Estructura del manifiesto de versiones */
interface VersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: {
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    url: string;
  }[];
}

/** Estructura de los metadatos de una versión */
interface VersionMeta {
  downloads: {
    server?: {
      sha1: string;
      size: number;
      url: string;
    };
  };
}

export class VanillaDownloader implements SoftwareDownloader {
  software = 'vanilla' as const;
  displayName = 'Vanilla';

  /** Cache del manifiesto para no descargarlo cada vez */
  private manifestCache: VersionManifest | null = null;

  private async getManifest(): Promise<VersionManifest> {
    if (!this.manifestCache) {
      console.log('[VanillaDownloader] Descargando manifiesto de versiones...');
      this.manifestCache = await fetchJson<VersionManifest>(MANIFEST_URL);
    }
    return this.manifestCache;
  }

  async getVersions(): Promise<VersionInfo[]> {
    const manifest = await this.getManifest();

    // Filtrar solo releases y snapshots recientes, ignorar old_beta y old_alpha
    return manifest.versions
      .filter((v) => v.type === 'release' || v.type === 'snapshot')
      .map((v) => ({
        version: v.id,
        stable: v.type === 'release',
      }));
  }

  async getLatestBuild(version: string): Promise<BuildInfo> {
    const manifest = await this.getManifest();

    // Buscar la versión en el manifiesto
    const versionEntry = manifest.versions.find((v) => v.id === version);
    if (!versionEntry) {
      throw new Error(`Versión ${version} no encontrada en el manifiesto de Mojang`);
    }

    // Descargar los metadatos de esa versión para obtener la URL del server.jar
    const meta = await fetchJson<VersionMeta>(versionEntry.url);

    if (!meta.downloads.server) {
      throw new Error(`La versión ${version} no tiene servidor disponible para descargar`);
    }

    return {
      fileName: 'server.jar',
      build: version,
      downloadUrl: meta.downloads.server.url,
    };
  }

  async download(version: string, destDir: string): Promise<string> {
    const buildInfo = await this.getLatestBuild(version);

    console.log(`[VanillaDownloader] Descargando Vanilla ${version}...`);

    await downloadFile(buildInfo.downloadUrl, destDir, 'server.jar', (percent, dlMB, totalMB) => {
      if (percent % 20 === 0) {
        console.log(`[VanillaDownloader] Progreso: ${percent}% (${dlMB.toFixed(1)}/${totalMB.toFixed(1)} MB)`);
      }
    });

    console.log(`[VanillaDownloader] ¡Vanilla ${version} descargado correctamente!`);
    return 'server.jar';
  }
}
