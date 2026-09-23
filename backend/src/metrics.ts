// ============================================================
// metrics.ts — Motor de Telemetría y Rendimiento
// ============================================================
// Este módulo se encarga de recopilar datos de rendimiento:
//   1. Recursos globales de la máquina anfitriona (CPU, RAM de 192 GB)
//   2. Consumo exacto del proceso Java de cada servidor de Minecraft
//   3. Buffer histórico de métricas en memoria para gráficas en vivo
// ============================================================

import os from 'os';
import pidusage from 'pidusage';

/** Información de recursos del sistema anfitrión (Host) */
export interface SystemMetrics {
  cpuUsage: number;         // Porcentaje de CPU total (0 - 100)
  cpuModel: string;         // Nombre del procesador (Intel Xeon / AMD / etc.)
  cpuCores: number;         // Número de núcleos lógicos
  totalMemMB: number;       // Memoria RAM total en MB
  usedMemMB: number;        // Memoria RAM ocupada en MB
  freeMemMB: number;        // Memoria RAM libre en MB
  memUsagePercent: number;  // Porcentaje de memoria RAM ocupada
  uptimeSeconds: number;    // Tiempo que lleva encendido el sistema anfitrión
  platform: string;         // 'win32', 'linux', etc.
}

/** Punto de datos histórico para las gráficas */
export interface MetricDataPoint {
  timestamp: string;        // Hora en formato HH:MM:SS o ISO
  cpu: number;              // Porcentaje de CPU
  memoryMB: number;         // Memoria usada en MB
  playersOnline: number;    // Cantidad de jugadores en ese instante
}

/** Métricas en tiempo real de un servidor de Minecraft específico */
export interface ServerProcessMetrics {
  serverId: string;
  online: boolean;
  pid: number | null;
  cpu: number;              // Porcentaje de uso de CPU del proceso
  memoryMB: number;         // Memoria RAM RSS en MB que está usando Java
  memoryMaxMB: number;      // Memoria máxima configurada (-Xmx)
  memoryPercent: number;    // Porcentaje respecto a la memoria máxima asignada
  tps: number;              // Ticks por segundo (20.0 es el valor perfecto)
  pingMs: number | null;    // Latencia de respuesta local
  uptimeSeconds: number;    // Segundos que lleva corriendo este servidor
  history: MetricDataPoint[];// Puntos para pintar las gráficas
}

// ── Medición de CPU del Sistema ─────────────────────────────

interface CpuSample {
  idle: number;
  total: number;
}

function getCpuSample(): CpuSample {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }

  return { idle, total };
}

let lastCpuSample: CpuSample = getCpuSample();
let currentSystemCpuPercent = 0;

/**
 * Actualiza y calcula el porcentaje de uso de CPU del sistema
 * comparando los ciclos de reloj entre dos tomas de muestra.
 */
export function calculateSystemCpuUsage(): number {
  const sample = getCpuSample();
  const idleDelta = sample.idle - lastCpuSample.idle;
  const totalDelta = sample.total - lastCpuSample.total;

  lastCpuSample = sample;

  if (totalDelta <= 0) return currentSystemCpuPercent;

  const usage = 100 - (100 * idleDelta) / totalDelta;
  currentSystemCpuPercent = Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
  return currentSystemCpuPercent;
}

/**
 * Obtiene las métricas completas del hardware del sistema anfitrión.
 */
export function getSystemMetrics(): SystemMetrics {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();

  return {
    cpuUsage: currentSystemCpuPercent,
    cpuModel: cpus[0]?.model || 'Desconocido',
    cpuCores: cpus.length,
    totalMemMB: Math.round(totalMem / (1024 * 1024)),
    usedMemMB: Math.round(usedMem / (1024 * 1024)),
    freeMemMB: Math.round(freeMem / (1024 * 1024)),
    memUsagePercent: Math.round((usedMem / totalMem) * 1000) / 10,
    uptimeSeconds: Math.floor(os.uptime()),
    platform: os.platform(),
  };
}

// ── Historial de Métricas por Servidor ──────────────────────

/** Almacén de puntos de datos históricos (máximo 40 puntos por servidor) */
const serverMetricsHistory = new Map<string, MetricDataPoint[]>();
const MAX_HISTORY_POINTS = 40;

/**
 * Añade un nuevo punto al buffer histórico de un servidor.
 */
export function recordServerMetric(
  serverId: string,
  cpu: number,
  memoryMB: number,
  playersOnline: number
): MetricDataPoint[] {
  let history = serverMetricsHistory.get(serverId);
  if (!history) {
    history = [];
    serverMetricsHistory.set(serverId, history);
  }

  const now = new Date();
  const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  history.push({
    timestamp,
    cpu,
    memoryMB,
    playersOnline,
  });

  if (history.length > MAX_HISTORY_POINTS) {
    history.shift();
  }

  return [...history];
}

/**
 * Obtiene el historial actual de un servidor.
 */
export function getServerMetricHistory(serverId: string): MetricDataPoint[] {
  return [...(serverMetricsHistory.get(serverId) || [])];
}

/**
 * Limpia el historial cuando un servidor se elimina o se detiene.
 */
export function clearServerMetricHistory(serverId: string): void {
  serverMetricsHistory.delete(serverId);
}

// ── Medición de Proceso Java con pidusage ───────────────────

/**
 * Obtiene el consumo real de CPU y memoria RAM de un proceso por su PID.
 */
export async function getProcessMetrics(pid: number): Promise<{ cpu: number; memoryMB: number } | null> {
  try {
    const stats = await pidusage(pid);
    const memoryMB = Math.round(stats.memory / (1024 * 1024));
    const cpu = Math.round(stats.cpu * 10) / 10;
    return { cpu, memoryMB };
  } catch (err) {
    // Si el proceso acaba de cerrarse o no se encuentra
    return null;
  }
}
