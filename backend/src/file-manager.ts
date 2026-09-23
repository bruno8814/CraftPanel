// ============================================================
// file-manager.ts — Explorador y gestor de archivos seguro
// ============================================================
// Permite listar, leer, editar, crear, renombrar y borrar archivos
// dentro de la carpeta del servidor de forma segura contra
// Path Traversal (evita salir de la carpeta del servidor).
// ============================================================

import fs from 'fs';
import path from 'path';

export interface FileItem {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
  extension: string;
}

/**
 * Resuelve una ruta relativa dentro del directorio del servidor
 * y verifica que no intente salir mediante ../ (Path Traversal).
 */
export function safePath(serverDir: string, relativePath: string = ''): string {
  const root = path.resolve(serverDir);
  // Normalizar separadores
  const cleanRelative = relativePath.replace(/^(\/|\\)+/, '');
  const target = path.resolve(root, cleanRelative);

  if (!target.startsWith(root)) {
    throw new Error('Acceso denegado: intento de acceso fuera del directorio del servidor.');
  }

  return target;
}

/**
 * Lista los archivos y subdirectorios de una ruta relativa dentro del servidor.
 */
export function listFiles(serverDir: string, relativePath: string = ''): FileItem[] {
  const targetDir = safePath(serverDir, relativePath);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`El directorio no existe: ${relativePath}`);
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    throw new Error(`La ruta no es un directorio: ${relativePath}`);
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const items: FileItem[] = [];

  for (const entry of entries) {
    const entryFullPath = path.join(targetDir, entry.name);
    let entryStat: fs.Stats | null = null;

    try {
      entryStat = fs.statSync(entryFullPath);
    } catch {
      // Ignorar enlaces rotos o archivos inaccesibles
      continue;
    }

    const itemRelativePath = relativePath
      ? `${relativePath.replace(/\\/g, '/')}/${entry.name}`
      : entry.name;

    items.push({
      name: entry.name,
      relativePath: itemRelativePath,
      isDirectory: entry.isDirectory(),
      sizeBytes: entry.isDirectory() ? 0 : entryStat.size,
      modifiedAt: entryStat.mtime.toISOString(),
      extension: entry.isDirectory() ? '' : path.extname(entry.name).toLowerCase(),
    });
  }

  // Ordenar: primero carpetas (alfabéticamente), luego archivos (alfabéticamente)
  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return items;
}

/**
 * Lee el contenido de texto de un archivo (con límite de 2 MB para seguridad del navegador).
 */
export function getFileContent(serverDir: string, relativePath: string): string {
  const targetFile = safePath(serverDir, relativePath);

  if (!fs.existsSync(targetFile)) {
    throw new Error(`El archivo no existe: ${relativePath}`);
  }

  const stat = fs.statSync(targetFile);
  if (stat.isDirectory()) {
    throw new Error('No se puede leer una carpeta como texto.');
  }

  // Límite de 2 MB para edición en navegador
  const MAX_SIZE = 2 * 1024 * 1024;
  if (stat.size > MAX_SIZE) {
    throw new Error(`El archivo es demasiado grande para editarlo en el navegador (${(stat.size / (1024 * 1024)).toFixed(1)} MB). Límite: 2 MB.`);
  }

  return fs.readFileSync(targetFile, 'utf-8');
}

/**
 * Guarda el contenido de texto en un archivo.
 */
export function saveFileContent(serverDir: string, relativePath: string, content: string): void {
  const targetFile = safePath(serverDir, relativePath);

  // Asegurar que la carpeta padre existe
  const parentDir = path.dirname(targetFile);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(targetFile, content, 'utf-8');
}

/**
 * Crea un archivo o carpeta nueva.
 */
export function createEntry(
  serverDir: string,
  relativePath: string,
  name: string,
  isDirectory: boolean
): void {
  const parentDir = safePath(serverDir, relativePath);
  const target = path.join(parentDir, name);

  // Asegurar que el target final sigue dentro del servidor
  safePath(serverDir, relativePath ? `${relativePath}/${name}` : name);

  if (fs.existsSync(target)) {
    throw new Error(`Ya existe un elemento con el nombre "${name}".`);
  }

  if (isDirectory) {
    fs.mkdirSync(target, { recursive: true });
  } else {
    fs.writeFileSync(target, '', 'utf-8');
  }
}

/**
 * Elimina un archivo o carpeta (recursivo).
 */
export function deleteEntry(serverDir: string, relativePath: string): void {
  if (!relativePath || relativePath === '/' || relativePath === '.') {
    throw new Error('No se puede eliminar la carpeta raíz del servidor.');
  }

  const target = safePath(serverDir, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`El archivo o carpeta no existe: ${relativePath}`);
  }

  fs.rmSync(target, { recursive: true, force: true });
}

/**
 * Renombra o mueve un archivo o carpeta dentro de la misma ubicación.
 */
export function renameEntry(serverDir: string, relativePath: string, newName: string): void {
  const target = safePath(serverDir, relativePath);
  if (!fs.existsSync(target)) {
    throw new Error(`El archivo o carpeta no existe: ${relativePath}`);
  }

  const parentDir = path.dirname(target);
  const newTarget = path.join(parentDir, newName);

  // Validar seguridad de la nueva ruta
  const root = path.resolve(serverDir);
  if (!path.resolve(newTarget).startsWith(root)) {
    throw new Error('Nombre de archivo inválido.');
  }

  if (fs.existsSync(newTarget)) {
    throw new Error(`Ya existe un elemento con el nombre "${newName}".`);
  }

  fs.renameSync(target, newTarget);
}
