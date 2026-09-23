// ============================================================
// workshop.ts — Integración con la API de Modrinth
// ============================================================
// Modrinth es el repositorio de mods, plugins y modpacks más
// moderno, rápido y abierto para Minecraft.
//
// Documentación oficial: https://docs.modrinth.com/
// ============================================================

import { fetchJson, downloadFile } from './downloaders/http-helper';
import path from 'path';
import fs from 'fs';

const MODRINTH_API = 'https://api.modrinth.com/v2';

export interface ModrinthSearchResult {
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: string;
  server_side: string;
  project_type: 'mod' | 'plugin' | 'modpack';
  downloads: number;
  icon_url: string | null;
  author: string;
  versions: string[];
  follows: number;
  date_modified: string;
}

export interface ModrinthSearchResponse {
  hits: ModrinthSearchResult[];
  offset: number;
  limit: number;
  total_hits: number;
}

export interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface ModrinthVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  version_type: 'release' | 'beta' | 'alpha';
  date_published: string;
  downloads: number;
  files: ModrinthVersionFile[];
}

/**
 * Busca mods, plugins o modpacks en Modrinth con filtros de versión y loader.
 */
export async function searchModrinth(options: {
  query?: string;
  projectType?: 'mod' | 'plugin' | 'modpack';
  gameVersion?: string;
  loader?: string;
  limit?: number;
  offset?: number;
}): Promise<ModrinthSearchResponse> {
  const {
    query = '',
    projectType = 'mod',
    gameVersion,
    loader,
    limit = 20,
    offset = 0,
  } = options;

  // Modrinth usa un formato de "facets" para filtrar:
  // [["project_type:mod"], ["versions:1.20.4"], ["categories:fabric"]]
  const facetsArray: string[][] = [
    [`project_type:${projectType}`],
  ];

  if (gameVersion && gameVersion !== 'all') {
    facetsArray.push([`versions:${gameVersion}`]);
  }

  if (loader && loader !== 'all') {
    // En Modrinth, los loaders como fabric, forge, paper, purpur, etc. van en "categories"
    facetsArray.push([`categories:${loader.toLowerCase()}`]);
  }

  const encodedFacets = encodeURIComponent(JSON.stringify(facetsArray));
  const encodedQuery = encodeURIComponent(query);

  const url = `${MODRINTH_API}/search?query=${encodedQuery}&facets=${encodedFacets}&limit=${limit}&offset=${offset}&index=downloads`;

  console.log(`[Workshop] Buscando en Modrinth: ${url}`);
  return fetchJson<ModrinthSearchResponse>(url);
}

/**
 * Obtiene las versiones de un proyecto compatibles con el servidor.
 */
export async function getProjectVersions(
  slugOrId: string,
  gameVersion?: string,
  loader?: string
): Promise<ModrinthVersion[]> {
  let url = `${MODRINTH_API}/project/${encodeURIComponent(slugOrId)}/version`;
  const params: string[] = [];

  if (loader && loader !== 'all') {
    params.push(`loaders=${encodeURIComponent(JSON.stringify([loader.toLowerCase()]))}`);
  }
  if (gameVersion && gameVersion !== 'all') {
    params.push(`game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}`);
  }

  if (params.length > 0) {
    url += `?${params.join('&')}`;
  }

  console.log(`[Workshop] Obteniendo versiones de ${slugOrId}: ${url}`);
  return fetchJson<ModrinthVersion[]>(url);
}

/**
 * Obtiene la información detallada de un proyecto en Modrinth.
 */
export async function getProjectDetails(slugOrId: string): Promise<any> {
  const url = `${MODRINTH_API}/project/${encodeURIComponent(slugOrId)}`;
  return fetchJson<any>(url);
}
