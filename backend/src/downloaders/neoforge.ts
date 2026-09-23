// ============================================================
// downloaders/neoforge.ts — Descargador oficial de NeoForge
// ============================================================
// NeoForge publica sus artefactos e instaladores en su Maven oficial:
//   https://maven.neoforged.net/releases/net/neoforged/neoforge/
//
// Flujo:
//   1. Obtener versiones disponibles desde maven-metadata.xml
//   2. Mapear versión de Minecraft (ej. 1.21.1) a build de NeoForge (ej. 21.1.251)
//   3. Descargar el installer oficial (neoforge-<build>-installer.jar)
//   4. Ejecutar "java -jar installer.jar --installServer" en segundo plano
//   5. Limpiar temporales y dejar listo el servidor para arranque nativo
// ============================================================

import { SoftwareDownloader, VersionInfo, BuildInfo } from './base';
import { downloadFile } from './http-helper';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const MAVEN_METADATA_URL =
  'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
const MAVEN_BASE_DOWNLOAD =
  'https://maven.neoforged.net/releases/net/neoforged/neoforge';

export class NeoForgeDownloader implements SoftwareDownloader {
  software = 'neoforge' as const;
  displayName = 'NeoForge';

  /**
   * Consulta el repositorio Maven y devuelve las versiones de Minecraft soportadas.
   */
  async getVersions(): Promise<VersionInfo[]> {
    console.log('[NeoForgeDownloader] Obteniendo versiones de NeoForge...');
    const res = await fetch(MAVEN_METADATA_URL);
    if (!res.ok) {
      throw new Error(`Error al consultar Maven de NeoForge: HTTP ${res.status}`);
    }
    const xml = await res.text();

    const versionMatches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(
      (m) => m[1]
    );

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

      // Guardamos el build más reciente (el XML lista en orden cronológico)
      mcToLatestBuild.set(mcVer, {
        build,
        stable: !isBeta,
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

    // Añadir cualquier otra versión detectada que no esté en preferredOrder
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
    const res = await fetch(MAVEN_METADATA_URL);
    if (!res.ok) {
      throw new Error(`Error al consultar Maven de NeoForge: HTTP ${res.status}`);
    }
    const xml = await res.text();
    const versionMatches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(
      (m) => m[1]
    );

    // Mapear versión de MC a prefijo de NeoForge (ej: 1.21.1 -> 21.1.; 1.21 -> 21.0.; 1.20.4 -> 20.4.)
    const parts = version.split('.');
    let prefix = '';
    if (parts[0] === '1') {
      const maj = parts[1]; // '21' o '20'
      const min = parts[2] || '0'; // '1', '4', o '0'
      prefix = `${maj}.${min}.`;
    }

    // Filtrar builds que coincidan con el prefijo
    const matchingBuilds = versionMatches.filter((v) => v.startsWith(prefix));
    if (matchingBuilds.length === 0) {
      throw new Error(
        `No se encontraron builds de NeoForge para Minecraft ${version}`
      );
    }

    // Elegir el último build estable si es posible, o el último en la lista
    const stableBuilds = matchingBuilds.filter((v) => !v.includes('beta') && !v.includes('alpha'));
    const chosenBuild = stableBuilds.length > 0
      ? stableBuilds[stableBuilds.length - 1]
      : matchingBuilds[matchingBuilds.length - 1];

    const fileName = `neoforge-${chosenBuild}-installer.jar`;
    const downloadUrl = `${MAVEN_BASE_DOWNLOAD}/${chosenBuild}/${fileName}`;

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
      `[NeoForgeDownloader] Descargando instalador de NeoForge build ${buildInfo.build}...`
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

    // Limpieza de archivos temporales
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
    return 'run.bat';
  }
}
