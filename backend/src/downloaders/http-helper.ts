// ============================================================
// downloaders/http-helper.ts — Utilidades HTTP para descargas
// ============================================================
// Funciones auxiliares para hacer peticiones HTTP y descargar
// archivos grandes con barra de progreso.
//
// Usamos el módulo nativo 'https' de Node.js en vez de librerías
// externas para no añadir dependencias innecesarias.
// ============================================================

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

/**
 * Hace una petición GET a una URL y devuelve el JSON parseado.
 *
 * Es el equivalente a fetch() pero usando módulos nativos de Node.
 * Lo hacemos así porque fetch() nativo solo está disponible en
 * Node 18+ y queremos máxima compatibilidad.
 */
export function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { headers: { 'User-Agent': 'CraftPanel/0.1.0 (craftpanel@localhost)' } }, (res) => {
      // Seguir redirecciones (301, 302, 307, 308)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson<T>(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} al acceder a ${url}`));
        return;
      }

      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Error al parsear JSON de ${url}: ${err}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Timeout al conectar con ${url}`));
    });
  });
}

/**
 * Descarga un archivo de una URL y lo guarda en disco.
 *
 * Muestra el progreso en la consola del panel.
 * Devuelve la ruta completa del archivo descargado.
 */
export function downloadFile(
  url: string,
  destDir: string,
  fileName: string,
  onProgress?: (percent: number, downloadedMB: number, totalMB: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const filePath = path.join(destDir, fileName);
    const client = url.startsWith('https') ? https : http;

    const req = client.get(url, { headers: { 'User-Agent': 'CraftPanel/0.1.0 (craftpanel@localhost)' } }, (res) => {
      // Seguir redirecciones
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destDir, fileName, onProgress)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} al descargar ${url}`));
        return;
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;

      // Crear un WriteStream: escribe los datos directamente en disco
      // conforme van llegando, sin cargar todo el archivo en memoria
      const fileStream = fs.createWriteStream(filePath);

      res.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0 && onProgress) {
          const percent = Math.round((downloadedBytes / totalBytes) * 100);
          const downloadedMB = downloadedBytes / (1024 * 1024);
          const totalMB = totalBytes / (1024 * 1024);
          onProgress(percent, downloadedMB, totalMB);
        }
      });

      // pipe() conecta el flujo de datos HTTP directamente al archivo
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve(filePath);
      });

      fileStream.on('error', (err) => {
        // Si hay error, borrar el archivo parcial
        fs.unlink(filePath, () => {});
        reject(err);
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error(`Timeout al descargar ${url}`));
    });
  });
}
