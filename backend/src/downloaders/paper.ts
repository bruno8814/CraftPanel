// ============================================================
// downloaders/paper.ts — Descargador de PaperMC (API Fill v3)
// ============================================================
// PaperMC utiliza la nueva API Fill v3 en:
//   https://fill.papermc.io/v3/projects/paper
//
// Flujo:
//   1. GET /v3/projects/paper → versiones agrupadas por versión mayor
//   2. GET /v3/projects/paper/versions/{ver} → lista de builds disponibles
//   3. GET /v3/projects/paper/versions/{ver}/builds/{build}
//      → metadatos del build y URL directa en fill-data.papermc.io
// ============================================================

import { SoftwareDownloader, VersionInfo, BuildInfo } from './base';
import { fetchJson, downloadFile } from './http-helper';

const API_BASE = 'https://fill.papermc.io/v3/projects/paper';

/** Respuesta del proyecto en la API Fill v3 */
interface PaperProjectV3 {
  project: {
    id: string;
    name: string;
  };
  versions: Record<string, string[]>;
}

/** Respuesta de la versión en la API Fill v3 */
interface PaperVersionV3 {
  version: {
    id: string;
  };
  builds: number[];
}

/** Respuesta de un build específico en la API Fill v3 */
interface PaperBuildV3 {
  id: number;
  channel: string;
  downloads: Record<
    string,
    {
      name: string;
      size: number;
      url: string;
    }
  >;
}

export class PaperDownloader implements SoftwareDownloader {
  software = 'paper' as const;
  displayName = 'PaperMC';

  async getVersions(): Promise<VersionInfo[]> {
    console.log('[PaperDownloader] Obteniendo versiones (Fill v3)...');
    const data = await fetchJson<PaperProjectV3>(API_BASE);

    // En la API v3, `versions` es un objeto cuyas claves son las versiones mayores ("1.21", "1.20", etc.)
    // ordenadas de más reciente a más antigua. Dentro de cada array, los valores van de más nuevo a más viejo.
    const allVersions: VersionInfo[] = [];

    for (const group of Object.values(data.versions)) {
      for (const ver of group) {
        const isStable = !ver.includes('-rc') && !ver.includes('-pre') && !ver.includes('alpha') && !ver.includes('beta');
        allVersions.push({
          version: ver,
          stable: isStable,
        });
      }
    }

    return allVersions;
  }

  async getLatestBuild(version: string): Promise<BuildInfo> {
    console.log(`[PaperDownloader] Obteniendo lista de builds para ${version}...`);
    const versionData = await fetchJson<PaperVersionV3>(`${API_BASE}/versions/${version}`);

    if (!versionData.builds || versionData.builds.length === 0) {
      throw new Error(`No hay builds disponibles para Paper ${version}`);
    }

    // El primer build del array es el más reciente en la API Fill v3
    const latestBuildNumber = versionData.builds[0];

    console.log(`[PaperDownloader] Obteniendo build #${latestBuildNumber} para ${version}...`);
    const buildData = await fetchJson<PaperBuildV3>(
      `${API_BASE}/versions/${version}/builds/${latestBuildNumber}`
    );

    // Preferimos el jar por defecto ("server:default")
    const download =
      buildData.downloads['server:default'] ||
      buildData.downloads['server:mojang'] ||
      Object.values(buildData.downloads)[0];

    if (!download) {
      throw new Error(`No se encontró un artefacto descargable para Paper ${version} build #${latestBuildNumber}`);
    }

    return {
      fileName: download.name,
      build: latestBuildNumber,
      downloadUrl: download.url,
    };
  }

  async download(version: string, destDir: string): Promise<string> {
    const buildInfo = await this.getLatestBuild(version);

    console.log(`[PaperDownloader] Descargando Paper ${version} build #${buildInfo.build}...`);

    await downloadFile(buildInfo.downloadUrl, destDir, 'server.jar', (percent, dlMB, totalMB) => {
      if (percent % 20 === 0) {
        console.log(`[PaperDownloader] Progreso: ${percent}% (${dlMB.toFixed(1)}/${totalMB.toFixed(1)} MB)`);
      }
    });

    console.log(`[PaperDownloader] ¡Paper ${version} descargado correctamente!`);
    return 'server.jar';
  }
}
