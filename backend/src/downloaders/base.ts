// ============================================================
// downloaders/base.ts — Interfaz base para descargadores
// ============================================================
// Define el "contrato" que todos los descargadores deben cumplir.
// Cada tipo de servidor (Paper, Fabric, Vanilla...) implementará
// esta interfaz para que el panel los trate de forma uniforme.
// ============================================================

import { ServerSoftware } from '../types';

/**
 * Información sobre una versión de Minecraft disponible.
 */
export interface VersionInfo {
  /** Versión de Minecraft (ej. "1.20.4") */
  version: string;
  /** Si es una versión estable (release) o snapshot */
  stable: boolean;
}

/**
 * Información sobre un build específico de un software.
 */
export interface BuildInfo {
  /** Nombre del archivo que se descargará */
  fileName: string;
  /** URL directa de descarga */
  downloadUrl: string;
  /** Número o identificador del build */
  build: string | number;
}

/**
 * Interfaz que todo descargador de software debe implementar.
 *
 * Cada descargador sabe:
 * 1. Qué versiones de Minecraft soporta
 * 2. Cómo descargar el .jar correcto para una versión dada
 */
export interface SoftwareDownloader {
  /** Tipo de software que maneja */
  software: ServerSoftware;

  /** Nombre legible del software */
  displayName: string;

  /**
   * Obtiene la lista de versiones de Minecraft soportadas.
   * Devuelve las más recientes primero.
   */
  getVersions(): Promise<VersionInfo[]>;

  /**
   * Obtiene la información del build más reciente para una versión.
   */
  getLatestBuild(version: string): Promise<BuildInfo>;

  /**
   * Descarga el archivo .jar y lo guarda en la ruta indicada.
   * Devuelve el nombre del archivo descargado.
   */
  download(version: string, destDir: string): Promise<string>;
}
