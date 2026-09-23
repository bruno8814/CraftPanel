// ============================================================
// downloaders/index.ts — Registro central de descargadores
// ============================================================
// Este archivo exporta un "registro" que mapea cada tipo de
// software a su descargador correspondiente.
//
// Así, cuando alguien pide crear un servidor de tipo "paper",
// simplemente hacemos:
//   const downloader = getDownloader('paper');
//   await downloader.download('1.20.4', '/ruta/destino');
// ============================================================

import { ServerSoftware } from '../types';
import { SoftwareDownloader } from './base';
import { PaperDownloader } from './paper';
import { FabricDownloader } from './fabric';
import { VanillaDownloader } from './vanilla';
import { NeoForgeDownloader } from './neoforge';

// Exportar las interfaces y tipos para uso externo
export { SoftwareDownloader, VersionInfo, BuildInfo } from './base';

/** Instancias singleton de cada descargador */
const downloaders: Map<ServerSoftware, SoftwareDownloader> = new Map();

// Registrar los descargadores disponibles
downloaders.set('paper', new PaperDownloader());
downloaders.set('fabric', new FabricDownloader());
downloaders.set('vanilla', new VanillaDownloader());
downloaders.set('neoforge', new NeoForgeDownloader());

// TODO: Añadir Forge y Mohist en fases futuras
// downloaders.set('forge', new ForgeDownloader());
// downloaders.set('mohist', new MohistDownloader());

/**
 * Obtiene el descargador para un tipo de software.
 * Lanza un error si el software no tiene descargador registrado.
 */
export function getDownloader(software: ServerSoftware): SoftwareDownloader {
  const downloader = downloaders.get(software);
  if (!downloader) {
    throw new Error(
      `No hay descargador disponible para "${software}". ` +
      `Tipos soportados: ${[...downloaders.keys()].join(', ')}`
    );
  }
  return downloader;
}

/**
 * Devuelve la lista de software que tiene descargador disponible.
 */
export function getAvailableSoftware(): { software: ServerSoftware; displayName: string }[] {
  return [...downloaders.values()].map((d) => ({
    software: d.software,
    displayName: d.displayName,
  }));
}

/**
 * Comprueba si un tipo de software tiene descargador disponible.
 */
export function hasDownloader(software: ServerSoftware): boolean {
  return downloaders.has(software);
}
