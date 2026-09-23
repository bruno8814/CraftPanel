// ============================================================
// properties.ts — Gestor del archivo server.properties
// ============================================================
// Parsea y serializa el archivo de configuración estándar de
// Minecraft preservando comentarios y formato.
// ============================================================

import fs from 'fs';
import path from 'path';

/**
 * Parsea el contenido de un server.properties a un diccionario clave-valor.
 */
export function parseProperties(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    // Ignorar líneas vacías o comentarios
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();

    result[key] = value;
  }

  return result;
}

/**
 * Serializa un diccionario clave-valor de vuelta a formato server.properties.
 * Si se pasa originalContent, preserva los comentarios y actualiza los valores existentes.
 */
export function serializeProperties(
  newProps: Record<string, string>,
  originalContent?: string
): string {
  if (!originalContent) {
    const lines = [
      '# Archivo generado por CraftPanel',
      `# ${new Date().toISOString()}`,
      '',
    ];

    for (const [key, value] of Object.entries(newProps)) {
      lines.push(`${key}=${value}`);
    }

    return lines.join('\n') + '\n';
  }

  const existingLines = originalContent.split(/\r?\n/);
  const updatedKeys = new Set<string>();
  const outputLines: string[] = [];

  for (const line of existingLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      outputLines.push(line);
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      outputLines.push(line);
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    if (key in newProps) {
      outputLines.push(`${key}=${newProps[key]}`);
      updatedKeys.add(key);
    } else {
      outputLines.push(line);
    }
  }

  // Añadir cualquier clave nueva que no estuviera en el original
  for (const [key, value] of Object.entries(newProps)) {
    if (!updatedKeys.has(key)) {
      outputLines.push(`${key}=${value}`);
    }
  }

  return outputLines.join('\n') + '\n';
}

/**
 * Lee y parsea el archivo server.properties de un servidor.
 */
export function readServerProperties(serverDir: string): {
  raw: string;
  properties: Record<string, string>;
} {
  const filePath = path.join(serverDir, 'server.properties');
  if (!fs.existsSync(filePath)) {
    return { raw: '', properties: {} };
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const properties = parseProperties(raw);
  return { raw, properties };
}

/**
 * Guarda las propiedades en server.properties.
 */
export function saveServerProperties(
  serverDir: string,
  newProps: Record<string, string>
): void {
  const filePath = path.join(serverDir, 'server.properties');
  let original = '';

  if (fs.existsSync(filePath)) {
    original = fs.readFileSync(filePath, 'utf-8');
  }

  const serialized = serializeProperties(newProps, original);
  fs.writeFileSync(filePath, serialized, 'utf-8');
}

/**
 * Guarda el archivo server.properties en formato texto crudo (raw).
 */
export function saveRawServerProperties(serverDir: string, rawContent: string): void {
  const filePath = path.join(serverDir, 'server.properties');
  fs.writeFileSync(filePath, rawContent, 'utf-8');
}
