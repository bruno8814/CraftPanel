// ============================================================
// crash-analyzer.ts — Analizador Heurístico de Crashes y Visor de Logs
// ============================================================
// Inspecciona reportes de crash de Minecraft (crash-reports/*.txt)
// y el archivo de log (logs/latest.log) para diagnosticar caídas
// de forma automática, explicando la causa en lenguaje humano y
// sugiriendo la solución adecuada paso a paso.
// ============================================================

import fs from 'fs';
import path from 'path';
import { CrashAnalysis, CrashCategory, CrashReportItem, ParsedLogLine } from './types';

/**
 * Lista todos los archivos de crash disponibles en `<serverDir>/crash-reports/`
 * ordenados del más reciente al más antiguo.
 */
export function listCrashReports(serverDir: string): CrashReportItem[] {
  const crashesDir = path.join(serverDir, 'crash-reports');
  if (!fs.existsSync(crashesDir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(crashesDir);
    const reports: CrashReportItem[] = [];

    for (const f of files) {
      if (!f.endsWith('.txt')) continue;
      const fullPath = path.join(crashesDir, f);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          reports.push({
            fileName: f,
            sizeBytes: stats.size,
            createdAt: stats.mtime.toISOString(),
          });
        }
      } catch {}
    }

    // Ordenar de más reciente a más antiguo
    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return reports;
  } catch (err) {
    console.error('[CrashAnalyzer] Error al listar crash-reports:', err);
    return [];
  }
}

/**
 * Lee el contenido en texto plano de un reporte de crash específico.
 */
export function getCrashReportText(serverDir: string, fileName: string): string {
  // Protección básica de nombre de archivo
  const safeName = path.basename(fileName);
  const filePath = path.join(serverDir, 'crash-reports', safeName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Reporte de crash no encontrado: ${safeName}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Analiza un texto de crash report o log mediante heurísticas y reglas de patrones.
 */
export function analyzeCrashContent(
  rawText: string,
  fileName?: string,
  source: 'CRASH_REPORT_FILE' | 'LATEST_LOG' = 'CRASH_REPORT_FILE'
): CrashAnalysis {
  if (!rawText || rawText.trim().length === 0) {
    return {
      hasCrash: false,
      source: 'NONE',
      category: 'UNKNOWN',
      severity: 'WARNING',
      title: 'No hay información de caídas',
      summary: 'El archivo está vacío o no contiene registros de error.',
      solution: 'Inicia el servidor para generar registros actualizados.',
      culprits: [],
      rawReport: '',
    };
  }

  // Extraer detalles del sistema si están presentes
  const systemDetails = extractSystemDetails(rawText);

  // 1. Falta de dependencias en Fabric
  if (
    rawText.includes('net.fabricmc.loader.impl.FormattedException: Some of your mods are incompatible') ||
    rawText.includes('A potential solution has been determined') ||
    (rawText.includes('Fabric Loader has found') && rawText.includes('issues'))
  ) {
    const culprits: string[] = [];
    const missingMatch = rawText.match(/Requires:\s*([^\n\r]+)/gi);
    if (missingMatch) {
      for (const m of missingMatch) {
        culprits.push(m.replace(/Requires:\s*/i, '').trim());
      }
    }

    const installMatch = rawText.match(/Install\s+([a-zA-Z0-9_\-]+)/gi);
    if (installMatch) {
      for (const m of installMatch) {
        culprits.push(m.replace(/Install\s+/i, '').trim());
      }
    }

    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'DEPENDENCY_MISSING',
      severity: 'CRITICAL',
      title: 'Faltan librerías o dependencias de mods (Fabric)',
      summary:
        'Uno o más mods instalados requieren librerías obligatorias que no están presentes en la carpeta mods (por ejemplo: Fabric API, Cloth Config o Architectury).',
      solution:
        '1. Revisa las dependencias señaladas abajo.\n2. Ve a la pestaña "Mods" e instala las librerías requeridas (habitualmente "Fabric API").\n3. Vuelve a iniciar el servidor.',
      culprits: Array.from(new Set(culprits)).slice(0, 5),
      rawReport: rawText,
      systemDetails,
    };
  }

  // 2. Falta de dependencias en Forge / NeoForge
  if (
    rawText.includes('Missing or unsupported mandatory dependencies') ||
    rawText.includes('ModResolutionException') ||
    rawText.includes('requires version') && rawText.includes('which is missing')
  ) {
    const culprits: string[] = [];
    const modMatch = rawText.match(/Mod\s+([a-zA-Z0-9_\-]+)\s+requires/gi);
    if (modMatch) {
      for (const m of modMatch) {
        culprits.push(m.replace(/Mod\s+/i, '').replace(/\s+requires/i, '').trim());
      }
    }

    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'DEPENDENCY_MISSING',
      severity: 'CRITICAL',
      title: 'Faltan dependencias de mods (Forge / NeoForge)',
      summary:
        'Forge o NeoForge ha detenido el arranque porque faltan mods base necesarios para que otros mods funcionen.',
      solution:
        '1. Instala el mod o librería faltante desde la pestaña "Mods".\n2. Comprueba que las versiones de los mods coincidan con la versión exacta de Minecraft.',
      culprits: Array.from(new Set(culprits)).slice(0, 5),
      rawReport: rawText,
      systemDetails,
    };
  }

  // 3. Incompatibilidad de versión de Java
  if (
    rawText.includes('UnsupportedClassVersionError') ||
    rawText.includes('has been compiled by a more recent version of the Java Runtime')
  ) {
    let reqVersion = 'Java más reciente';
    if (rawText.includes('class file version 65.0')) reqVersion = 'Java 21 (Minecraft 1.20.5+)';
    else if (rawText.includes('class file version 61.0')) reqVersion = 'Java 17 (Minecraft 1.18 - 1.20.4)';
    else if (rawText.includes('class file version 52.0')) reqVersion = 'Java 8 (Minecraft 1.12 y 1.16 antiguo)';

    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'JAVA_VERSION',
      severity: 'CRITICAL',
      title: 'Versión de Java Incompatible',
      summary: `El servidor o uno de los mods fue compilado con una versión superior de Java que la instalada en la máquina (${reqVersion}).`,
      solution:
        `Instala ${reqVersion} en tu máquina anfitriona o actualiza el paquete openjdk correspondiente en tu sistema Proxmox/Linux.`,
      culprits: ['Java Runtime Environment'],
      rawReport: rawText,
      systemDetails,
    };
  }

  // 4. Memoria RAM insuficiente (OutOfMemory)
  if (
    rawText.includes('java.lang.OutOfMemoryError') ||
    rawText.includes('Java heap space') ||
    rawText.includes('GC overhead limit exceeded')
  ) {
    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'OUT_OF_MEMORY',
      severity: 'CRITICAL',
      title: 'Memoria RAM Insuficiente (OutOfMemory)',
      summary:
        'El servidor de Minecraft ha agotado toda la memoria RAM asignada (Java Heap Space) y la máquina virtual Java ha forzado el cierre.',
      solution:
        '1. Ve a "Ajustes" o edita la memoria máxima de este servidor aumentándola (ej. de 2GB a 4GB o 6GB si juegas con mods).\n2. Si tienes muchos jugadores o mods, reduce la distancia de renderizado (view-distance) en server.properties.',
      culprits: ['Memoria RAM / Java Heap'],
      rawReport: rawText,
      systemDetails,
    };
  }

  // 5. Puerto ya en uso (Port Binding Error)
  if (
    rawText.includes('FAILED TO BIND TO PORT') ||
    rawText.includes('java.net.BindException: Address already in use')
  ) {
    const portMatch = rawText.match(/\*{4}\s*FAILED TO BIND TO PORT.*?(\d{4,5})/s);
    const port = portMatch ? portMatch[1] : 'el puerto configurado';

    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'PORT_IN_USE',
      severity: 'CRITICAL',
      title: `Puerto en uso (${port})`,
      summary:
        `Minecraft no pudo iniciar porque otro servidor o proceso ya está escuchando en el puerto ${port}.`,
      solution:
        '1. Comprueba si tienes otro servidor de Minecraft encendido en CraftPanel usando el mismo puerto.\n2. Ve a "Ajustes" y cambia el puerto del servidor (por ejemplo, a 25566 o 25567).\n3. Si reiniciaste hace unos segundos, espera 10 segundos a que el sistema operativo libere el socket.',
      culprits: [`Puerto ${port}`],
      rawReport: rawText,
      systemDetails,
    };
  }

  // 6. EULA de Minecraft no aceptada
  if (
    rawText.includes('You need to agree to the EULA in order to run the server') ||
    rawText.includes('eula.txt')
  ) {
    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'EULA',
      severity: 'CRITICAL',
      title: 'EULA de Minecraft no aceptada',
      summary: 'El servidor requiere aceptar el acuerdo de licencia de usuario final (EULA) de Mojang.',
      solution:
        'Ve al explorador de "Archivos", abre el archivo "eula.txt" y cambia la línea "eula=false" por "eula=true", guarda y reinicia.',
      culprits: ['eula.txt'],
      rawReport: rawText,
      systemDetails,
    };
  }

  // 7. Entidad o bloque causante de tick crash (Ticking Entity / Ticking Block)
  if (
    rawText.includes('Description: Ticking entity') ||
    rawText.includes('Description: Ticking block entity')
  ) {
    const isBlock = rawText.includes('Ticking block entity');
    const entityMatch = rawText.match(/Entity Type:\s*([^\n\r]+)/i);
    const coordsMatch = rawText.match(/Block location:\s*World:\s*\(([^)]+)\)/i) ||
                        rawText.match(/Entity's Exact location:\s*([^,\n\r]+,\s*[^,\n\r]+,\s*[^,\n\r]+)/i);

    const entityName = entityMatch ? entityMatch[1].trim() : (isBlock ? 'Bloque defectuoso' : 'Entidad');
    const coords = coordsMatch ? coordsMatch[1].trim() : 'Coordenadas desconocidas';

    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'CHUNK_CORRUPTION',
      severity: 'CRITICAL',
      title: `${isBlock ? 'Bloque' : 'Entidad'} corrupta causando cuelgue (${entityName})`,
      summary: `Una entidad o bloque situado en las coordenadas ${coords} provocó una excepción irrecuperable en el bucle principal del mundo.`,
      solution:
        `1. Puedes eliminar la entidad con el comando: /kill @e[type=${entityName}] al arrancar.\n2. O restaurar la copia de seguridad más reciente desde la pestaña "Backups" para recuperar el mundo intacto.`,
      culprits: [entityName, coords],
      rawReport: rawText,
      systemDetails,
    };
  }

  // 8. Error de Mixin / Conflicto entre Mods
  if (
    rawText.includes('org.spongepowered.asm.mixin.transformer.throwables.MixinTransformerError') ||
    rawText.includes('Critical injection failure') ||
    rawText.includes('Mixin prepare failed')
  ) {
    // Intentar encontrar el nombre del mixin o mod
    const mixinMatch = rawText.match(/mixin\s*([a-zA-Z0-9_\-\.]+)/i);
    const modCandidate = mixinMatch ? mixinMatch[1] : 'Mod con Mixin';

    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'MIXIN_ERROR',
      severity: 'CRITICAL',
      title: 'Fallo de inyección Mixin (Conflicto entre mods)',
      summary:
        'Dos mods intentaron modificar la misma clase interna de Minecraft al mismo tiempo o uno de ellos no es compatible con la versión exacta de tu modloader.',
      solution:
        '1. Desactiva temporalmente el mod sospechoso desde la pestaña "Mods" usando el interruptor.\n2. Verifica si el mod tiene una actualización disponible en Modrinth para tu versión de Minecraft.',
      culprits: [modCandidate],
      rawReport: rawText,
      systemDetails,
    };
  }

  // 9. Error de Plugin en Paper / Spigot
  if (
    rawText.includes('org.bukkit.plugin.InvalidPluginException') ||
    rawText.includes('Could not load') && rawText.includes('plugins/') ||
    rawText.includes('Error occurred while enabling')
  ) {
    const pluginMatch = rawText.match(/plugins[\\\/]([a-zA-Z0-9_\-\.]+\.jar)/i) ||
                        rawText.match(/enabling\s+([a-zA-Z0-9_\-]+)\s+v/i);
    const pluginName = pluginMatch ? pluginMatch[1] : 'Plugin no identificado';

    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'PLUGIN_ERROR',
      severity: 'CRITICAL',
      title: `Error al cargar plugin (${pluginName})`,
      summary: `El plugin "${pluginName}" lanzó una excepción durante su fase de inicialización o es incompatible con la versión de Paper/Spigot.`,
      solution:
        '1. Ve a la pestaña "Plugins" y desactiva el plugin con el interruptor para verificar si el servidor enciende.\n2. Descarga una versión actualizada del plugin compatible con tu versión de Minecraft.',
      culprits: [pluginName],
      rawReport: rawText,
      systemDetails,
    };
  }

  // 10. Mods duplicados
  if (
    rawText.includes('Duplicate mods found') ||
    rawText.includes('Found duplicate mod') ||
    rawText.includes('DuplicateModFileException')
  ) {
    return {
      hasCrash: true,
      source,
      fileName,
      timestamp: extractTimestamp(rawText),
      category: 'MOD_CONFLICT',
      severity: 'CRITICAL',
      title: 'Mods Duplicados en la carpeta mods',
      summary: 'Tienes dos archivos .jar del mismo mod instalados (posiblemente dos versiones diferentes a la vez).',
      solution: 'Revisa la pestaña "Mods" o la carpeta "mods" en Archivos y elimina las versiones antiguas duplicadas.',
      culprits: ['Archivos .jar duplicados'],
      rawReport: rawText,
      systemDetails,
    };
  }

  // 11. Caso genérico si no encaja en las anteriores pero contiene excepción
  const descMatch = rawText.match(/Description:\s*([^\n\r]+)/i);
  const exceptionMatch = rawText.match(/([a-zA-Z0-9_\.]+(?:Exception|Error)):\s*([^\n\r]+)/i);

  const title = descMatch ? descMatch[1].trim() : (exceptionMatch ? exceptionMatch[1].trim() : 'Excepción no identificada');
  const details = exceptionMatch ? exceptionMatch[2].trim() : 'Revisa el informe detallado abajo para más pistas.';

  return {
    hasCrash: true,
    source,
    fileName,
    timestamp: extractTimestamp(rawText),
    category: 'UNKNOWN',
    severity: 'WARNING',
    title: `Caída del Servidor: ${title}`,
    summary: details,
    solution:
      'Revisa el StackTrace técnico que figura abajo. Habitualmente las líneas que dicen "Caused by:" o "at com..." indican qué archivo o mod generó el problema.',
    culprits: exceptionMatch ? [exceptionMatch[1]] : [],
    rawReport: rawText,
    systemDetails,
  };
}

/**
 * Analiza el último crash report disponible. Si no hay ninguno, revisa `logs/latest.log`
 * por si ocurrió un fallo temprano antes de escribir el archivo de crash.
 */
export function analyzeLatestCrash(serverDir: string): CrashAnalysis {
  const crashes = listCrashReports(serverDir);

  if (crashes.length > 0) {
    const latestFile = crashes[0].fileName;
    try {
      const text = getCrashReportText(serverDir, latestFile);
      return analyzeCrashContent(text, latestFile, 'CRASH_REPORT_FILE');
    } catch (err: any) {
      console.warn('[CrashAnalyzer] No se pudo leer el último crash report:', err);
    }
  }

  // Intentar analizar latest.log si no hay crash-report generado
  const latestLogPath = path.join(serverDir, 'logs', 'latest.log');
  if (fs.existsSync(latestLogPath)) {
    try {
      const logContent = fs.readFileSync(latestLogPath, 'utf-8');
      // Buscar si el final del log contiene errores fatales
      if (
        logContent.includes('Exception') ||
        logContent.includes('FAILED TO BIND TO PORT') ||
        logContent.includes('OutOfMemoryError') ||
        logContent.includes('Error:')
      ) {
        // Tomar las últimas 250 líneas
        const lines = logContent.split(/\r?\n/);
        const tail = lines.slice(-250).join('\n');
        const analyzed = analyzeCrashContent(tail, 'latest.log', 'LATEST_LOG');
        if (analyzed.hasCrash) {
          return analyzed;
        }
      }
    } catch {}
  }

  return {
    hasCrash: false,
    source: 'NONE',
    category: 'UNKNOWN',
    severity: 'WARNING',
    title: 'Servidor Estable — Sin caídas registradas',
    summary: 'No se han detectado reportes de crash recientes ni excepciones críticas en los logs.',
    solution: 'Todo funciona con normalidad.',
    culprits: [],
    rawReport: '',
  };
}

/**
 * Parsea el archivo `logs/latest.log` línea por línea generando una estructura limpia
 * para el visor interactivo de logs.
 */
export function parseLogFile(serverDir: string, maxLines: number = 800): ParsedLogLine[] {
  const logPath = path.join(serverDir, 'logs', 'latest.log');
  if (!fs.existsSync(logPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const rawLines = content.split(/\r?\n/).filter((l) => l.length > 0);

    // Limitar al final del archivo si supera maxLines
    const slice = rawLines.length > maxLines ? rawLines.slice(-maxLines) : rawLines;
    const parsed: ParsedLogLine[] = [];

    // Expresión regular estándar de log de Minecraft Java:
    // [14:23:05] [Server thread/INFO]: Done (2.453s)! For help, type "help"
    const logPattern = /^\[(\d{2}:\d{2}:\d{2})\]\s+\[([^/]+)\/([A-Z]+)\]:\s*(.*)$/;

    let lastLevel: ParsedLogLine['level'] = 'INFO';
    let lastTime = '';

    for (let i = 0; i < slice.length; i++) {
      const line = slice[i];
      const match = line.match(logPattern);

      if (match) {
        const time = match[1];
        const thread = match[2];
        const rawLevel = match[3].toUpperCase();
        const msg = match[4];

        let level: ParsedLogLine['level'] = 'INFO';
        if (rawLevel === 'WARN' || rawLevel === 'WARNING') level = 'WARN';
        else if (rawLevel === 'ERROR') level = 'ERROR';
        else if (rawLevel === 'FATAL') level = 'FATAL';
        else if (rawLevel === 'DEBUG') level = 'DEBUG';

        lastLevel = level;
        lastTime = time;

        parsed.push({
          id: i,
          timestamp: time,
          level,
          thread,
          message: msg,
          raw: line,
        });
      } else {
        // Línea de continuación (habitual en StackTraces: "    at net.minecraft...")
        let level = lastLevel;
        if (line.includes('Exception') || line.includes('Error:') || line.startsWith('\tat ')) {
          level = 'ERROR';
        }

        parsed.push({
          id: i,
          timestamp: lastTime || '--:--:--',
          level,
          message: line,
          raw: line,
        });
      }
    }

    return parsed;
  } catch (err) {
    console.error('[CrashAnalyzer] Error al parsear logs:', err);
    return [];
  }
}

// ── Helpers internos ──────────────────────────────────────────

function extractTimestamp(text: string): string | undefined {
  const match = text.match(/Time:\s*([^\n\r]+)/i);
  return match ? match[1].trim() : undefined;
}

function extractSystemDetails(text: string): Record<string, string> {
  const details: Record<string, string> = {};
  const sysSection = text.match(/-- System Details --([\s\S]*?)(?:-- Mod List --|$)/i);
  if (!sysSection) return details;

  const lines = sysSection[1].split(/\r?\n/);
  for (const l of lines) {
    const trimmed = l.trim();
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      if (key && val && key.length < 40) {
        details[key] = val;
      }
    }
  }

  return details;
}
