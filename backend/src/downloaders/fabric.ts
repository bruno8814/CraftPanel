// ============================================================
// downloaders/fabric.ts — Descargador de Fabric
// ============================================================
// Fabric es un cargador de mods ligero y moderno, ideal para
// mods de optimización (Sodium, Lithium, etc.) y mods modernos.
//
// Su API (Fabric Meta) es pública:
//   https://meta.fabricmc.net/
//
// Flujo:
//   1. GET /v2/versions/game → versiones de Minecraft soportadas
//   2. GET /v2/versions/loader → versiones del loader de Fabric
//   3. GET /v2/versions/loader/{game}/{loader}/server/jar
//      → descarga directa del .jar del servidor
//
// Lo genial de Fabric: el servidor .jar ya incluye el loader
// integrado, así que no necesitas correr un instalador aparte.
// ============================================================

import { SoftwareDownloader, VersionInfo, BuildInfo } from './base';
import { fetchJson, downloadFile } from './http-helper';

const META_BASE = 'https://meta.fabricmc.net/v2';

/** Respuesta de la API para versiones del juego */
interface FabricGameVersion {
  version: string;
  stable: boolean;
}

/** Respuesta de la API para versiones del loader */
interface FabricLoaderVersion {
  version: string;
  stable: boolean;
}

export class FabricDownloader implements SoftwareDownloader {
  software = 'fabric' as const;
  displayName = 'Fabric';

  async getVersions(): Promise<VersionInfo[]> {
    console.log('[FabricDownloader] Obteniendo versiones...');
    const versions = await fetchJson<FabricGameVersion[]>(`${META_BASE}/versions/game`);

    // La API ya devuelve las versiones de más reciente a más antigua
    return versions.map((v) => ({
      version: v.version,
      stable: v.stable,
    }));
  }

  /**
   * Obtiene la versión más reciente y estable del Fabric Loader.
   */
  private async getLatestLoader(): Promise<string> {
    const loaders = await fetchJson<FabricLoaderVersion[]>(`${META_BASE}/versions/loader`);

    // Buscar la primera versión estable
    const stable = loaders.find((l) => l.stable);
    if (stable) return stable.version;

    // Si no hay ninguna estable, usar la primera (más reciente)
    if (loaders.length > 0) return loaders[0].version;

    throw new Error('No se encontraron versiones del Fabric Loader');
  }

  async getLatestBuild(version: string): Promise<BuildInfo> {
    const loaderVersion = await this.getLatestLoader();

    console.log(`[FabricDownloader] Fabric Loader ${loaderVersion} para MC ${version}`);

    return {
      fileName: 'server.jar',
      build: loaderVersion,
      // Esta URL devuelve directamente el .jar del servidor con
      // el loader de Fabric integrado. ¡Magia!
      downloadUrl: `${META_BASE}/versions/loader/${version}/${loaderVersion}/server/jar`,
    };
  }

  async download(version: string, destDir: string): Promise<string> {
    const buildInfo = await this.getLatestBuild(version);

    console.log(`[FabricDownloader] Descargando Fabric ${version} (loader ${buildInfo.build})...`);

    await downloadFile(buildInfo.downloadUrl, destDir, 'server.jar', (percent, dlMB, totalMB) => {
      if (percent % 20 === 0) {
        console.log(`[FabricDownloader] Progreso: ${percent}% (${dlMB.toFixed(1)}/${totalMB.toFixed(1)} MB)`);
      }
    });

    console.log(`[FabricDownloader] ¡Fabric ${version} descargado correctamente!`);
    return 'server.jar';
  }
}
