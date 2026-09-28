// ============================================================
// downloaders/neoforge.ts — Descargador oficial de NeoForge
// ============================================================
// NeoForge publica sus artefactos e instaladores en su Maven oficial:
//   https://maven.neoforged.net/releases/net/neoforged/neoforge/
//   API: https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge
//
// Flujo:
//   1. Obtener versiones disponibles (con fallback entre API JSON y XML de Maven)
//   2. Mapear versión de Minecraft (ej. 1.21.1) a build de NeoForge (ej. 21.1.252)
//   3. Descargar el installer oficial (neoforge-<build>-installer.jar)
//   4. Ejecutar "java -jar installer.jar --installServer" en segundo plano
//   5. Limpiar temporales y dejar listo el servidor para arranque nativo
// ============================================================

import { SoftwareDownloader, VersionInfo, BuildInfo } from './base';
import { downloadFile } from './http-helper';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Builds estables de respaldo conocidos si Maven tiene problemas de conexión o bloqueo
const KNOWN_STABLE_BUILDS: Record<string, { build: string; artifact: string; jarPrefix: string }> = {
  '1.21.1': { build: '21.1.252', artifact: 'neoforge', jarPrefix: 'neoforge' },
  '1.21':   { build: '21.0.167', artifact: 'neoforge', jarPrefix: 'neoforge' },
  '1.20.6': { build: '20.6.119', artifact: 'neoforge', jarPrefix: 'neoforge' },
  '1.20.4': { build: '20.4.237', artifact: 'neoforge', jarPrefix: 'neoforge' },
  '1.20.2': { build: '20.2.88',  artifact: 'neoforge', jarPrefix: 'neoforge' },
  '1.20.1': { build: '1.20.1-47.1.106', artifact: 'forge', jarPrefix: 'forge' },
};

/**
 * Consulta las versiones de NeoForge probando múltiples endpoints con headers adecuados
 */
async function fetchNeoForgeVersionList(artifact: 'neoforge' | 'forge' = 'neoforge'): Promise<string[]> {
  const endpoints = [
    // 1. API oficial JSON de NeoForge
    `https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/${artifact}`,
    // 2. Maven metadata XML estándar
    `https://maven.neoforged.net/releases/net/neoforged/${artifact}/maven-metadata.xml`,
    // 3. Ruta alternativa sin 'releases'
    `https://maven.neoforged.net/net/neoforged/${artifact}/maven-metadata.xml`,
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CraftPanel/1.0',
    'Accept': 'application/json, application/xml, text/xml, */*',
  };

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;

      if (url.includes('/api/')) {
        const data = await res.json() as { versions?: string[] };
        if (data && Array.isArray(data.versions) && data.versions.length > 0) {
          return data.versions;
        }
      } else {
        const xml = await res.text();
        const matches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
        if (matches.length > 0) {
          return matches;
        }
      }
    } catch (err: any) {
      console.warn(`[NeoForgeDownloader] Aviso al consultar ${url}: ${err.message}`);
    }
  }

  // Si todos los endpoints de red fallaron, devolver builds conocidos
  console.warn(`[NeoForgeDownloader] Usando lista de builds estables de respaldo para ${artifact}`);
  return Object.values(KNOWN_STABLE_BUILDS)
    .filter((k) => k.artifact === artifact)
    .map((k) => k.build);
}

export class NeoForgeDownloader implements SoftwareDownloader {
  software = 'neoforge' as const;
  displayName = 'NeoForge';

  /**
   * Consulta el repositorio Maven y devuelve las versiones de Minecraft soportadas.
   */
  async getVersions(): Promise<VersionInfo[]> {
    console.log('[NeoForgeDownloader] Obteniendo versiones de NeoForge...');
    
    let versionMatches: string[] = [];
    try {
      versionMatches = await fetchNeoForgeVersionList('neoforge');
    } catch {
      versionMatches = [];
    }

    // Mapeo: versión de Minecraft -> último build
    const mcToLatestBuild = new Map<string, { build: string; stable: boolean }>();

    for (const build of versionMatches) {
      // Formato NeoForge: 21.1.251 -> MC 1.21.1; 20.4.251 -> MC 1.20.4; 21.0.167 -> MC 1.21
      const m = build.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-(.*))?$/);
      if (!m) continue;

      const major = parseInt(m[1], 10);
      const minor = parseInt(m[2], 10);
      const isBeta = Boolean(m[4]);

      let mcVer = '';
      if (major === 21) {
        mcVer = minor === 0 ? '1.21' : `1.21.${minor}`;
      } else if (major === 20) {
        mcVer = minor === 0 ? '1.20' : `1.20.${minor}`;
      } else {
        continue;
      }

      mcToLatestBuild.set(mcVer, {
        build,
        stable: !isBeta,
      });
    }

    // Añadir 1.20.1 como versión soportada (NeoForge 1.20.1 legacy)
    if (!mcToLatestBuild.has('1.20.1')) {
      mcToLatestBuild.set('1.20.1', {
        build: KNOWN_STABLE_BUILDS['1.20.1'].build,
        stable: true,
      });
    }

    // Ordenamos de más reciente a más antigua
    const sortedVersions: VersionInfo[] = [];
    const preferredOrder = [
      '1.21.1',
      '1.21',
      '1.20.6',
      '1.20.4',
      '1.20.2',
      '1.20.1',
    ];

    for (const ver of preferredOrder) {
      if (mcToLatestBuild.has(ver)) {
        sortedVersions.push({
          version: ver,
          stable: mcToLatestBuild.get(ver)!.stable,
        });
      }
    }

    for (const [ver, info] of mcToLatestBuild) {
      if (!preferredOrder.includes(ver)) {
        sortedVersions.push({
          version: ver,
          stable: info.stable,
        });
      }
    }

    return sortedVersions;
  }

  /**
   * Obtiene el build más reciente para una versión de Minecraft.
   */
  async getLatestBuild(version: string): Promise<BuildInfo> {
    // Si es 1.20.1, NeoForge está bajo el artefacto 'forge'
    const isLegacy1201 = version === '1.20.1';
    const artifact = isLegacy1201 ? 'forge' : 'neoforge';
    const jarPrefix = isLegacy1201 ? 'forge' : 'neoforge';

    // Verificar si tenemos un build conocido directamente
    const known = KNOWN_STABLE_BUILDS[version];

    let chosenBuild = '';
    try {
      const versionMatches = await fetchNeoForgeVersionList(artifact);

      if (isLegacy1201) {
        const matchingBuilds = versionMatches.filter((v) => v.includes('1.20.1'));
        if (matchingBuilds.length > 0) {
          chosenBuild = matchingBuilds[matchingBuilds.length - 1];
        }
      } else {
        const parts = version.split('.');
        let prefix = '';
        if (parts[0] === '1') {
          const maj = parts[1];
          const min = parts[2] || '0';
          prefix = `${maj}.${min}.`;
        }

        const matchingBuilds = versionMatches.filter((v) => v.startsWith(prefix));
        if (matchingBuilds.length > 0) {
          const stableBuilds = matchingBuilds.filter((v) => !v.includes('beta') && !v.includes('alpha'));
          chosenBuild = stableBuilds.length > 0
            ? stableBuilds[stableBuilds.length - 1]
            : matchingBuilds[matchingBuilds.length - 1];
        }
      }
    } catch (err: any) {
      console.warn(`[NeoForgeDownloader] Error buscando build dinámico: ${err.message}`);
    }

    // Fallback garantizado si la búsqueda en Maven no devolvió coincidencia
    if (!chosenBuild) {
      if (known) {
        chosenBuild = known.build;
      } else {
        throw new Error(`No se encontraron builds de NeoForge para Minecraft ${version}`);
      }
    }

    const fileName = `${jarPrefix}-${chosenBuild}-installer.jar`;
    const downloadUrl = `https://maven.neoforged.net/releases/net/neoforged/${artifact}/${chosenBuild}/${fileName}`;

    return {
      fileName,
      build: chosenBuild,
      downloadUrl,
    };
  }

  /**
   * Descarga el instalador oficial y ejecuta --installServer en la carpeta de destino.
   */
  async download(version: string, destDir: string): Promise<string> {
    const buildInfo = await this.getLatestBuild(version);
    const installerFile = 'neoforge-installer.jar';

    console.log(
      `[NeoForgeDownloader] Descargando instalador de NeoForge (${buildInfo.build}) desde: ${buildInfo.downloadUrl}`
    );

    await downloadFile(
      buildInfo.downloadUrl,
      destDir,
      installerFile,
      (percent, dlMB, totalMB) => {
        if (percent % 25 === 0) {
          console.log(
            `[NeoForgeDownloader] Descarga del instalador: ${percent}% (${dlMB.toFixed(1)}/${totalMB.toFixed(1)} MB)`
          );
        }
      }
    );

    console.log(
      `[NeoForgeDownloader] Instalador descargado. Ejecutando --installServer en ${destDir}...`
    );

    // Ejecutar el instalador headless de forma limpia
    await new Promise<void>((resolve, reject) => {
      const installerPath = path.join(destDir, installerFile);
      const child = spawn('java', ['-jar', installerPath, '--installServer'], {
        cwd: destDir,
        stdio: 'inherit',
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`El instalador de NeoForge finalizó con error (código ${code})`));
        }
      });

      child.on('error', (err) => {
        reject(new Error(`No se pudo ejecutar Java para instalar NeoForge: ${err.message}`));
      });
    });

    // Limpieza de archivos temporales del instalador
    try {
      const installerPath = path.join(destDir, installerFile);
      if (fs.existsSync(installerPath)) {
        fs.unlinkSync(installerPath);
      }
      const logPath = path.join(destDir, `${installerFile}.log`);
      if (fs.existsSync(logPath)) {
        fs.unlinkSync(logPath);
      }
    } catch (e) {
      console.warn('[NeoForgeDownloader] Aviso al limpiar instalador temporal:', e);
    }

    // Asegurar que user_jvm_args.txt existe
    const jvmArgsPath = path.join(destDir, 'user_jvm_args.txt');
    if (!fs.existsSync(jvmArgsPath)) {
      fs.writeFileSync(
        jvmArgsPath,
        '# Configuración de memoria JVM generada por CraftPanel\n'
      );
    }

    console.log(`[NeoForgeDownloader] ¡Servidor NeoForge ${version} instalado con éxito!`);
    return process.platform === 'win32' ? 'run.bat' : 'run.sh';
  }
}
