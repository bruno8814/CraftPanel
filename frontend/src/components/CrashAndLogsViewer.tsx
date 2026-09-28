// ============================================================
// CrashAndLogsViewer.tsx — Analizador de Crashes y Visor de Logs
// ============================================================
// 1. Analizador inteligente de caídas: diagnostica en lenguaje
//    humano por qué crasheó el servidor (mods incompatibles, falta
//    de RAM, versión de Java, puertos en uso, EULA, etc.) y ofrece
//    la solución paso a paso.
// 2. Visor interactivo de logs: filtra por severidad (INFO, WARN, ERROR),
//    buscador por palabras clave, auto-scroll y descarga.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  FileText,
  Search,
  RefreshCw,
  Download,
  Copy,
  Check,
  CheckCircle2,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  History,
  Info,
  Bug,
  Cpu,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { ServerState, CrashAnalysis, CrashReportItem, ParsedLogLine } from '../types';
import { api } from '../api/client';

interface Props {
  server: ServerState;
}

export default function CrashAndLogsViewer({ server }: Props) {
  const { config } = server;

  const [activeTab, setActiveTab] = useState<'analyzer' | 'logs'>('analyzer');

  // Estado del Analizador de Crashes
  const [analysis, setAnalysis] = useState<CrashAnalysis | null>(null);
  const [crashReports, setCrashReports] = useState<CrashReportItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('latest');
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);
  const [showStackTrace, setShowStackTrace] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  // Estado del Visor de Logs
  const [logs, setLogs] = useState<ParsedLogLine[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);

  // ── Cargar análisis de crash ──
  const fetchCrashAnalysis = async (fileToLoad: string = selectedFile) => {
    setLoadingAnalysis(true);
    try {
      // 1. Obtener lista de todos los crash reports
      const files = await api.getServerCrashes(config.id);
      setCrashReports(files);

      // 2. Obtener análisis del seleccionado o del más reciente
      if (fileToLoad === 'latest') {
        const data = await api.getLatestCrashAnalysis(config.id);
        setAnalysis(data);
      } else {
        const data = await api.getCrashAnalysis(config.id, fileToLoad);
        setAnalysis(data);
      }
    } catch (err) {
      console.error('Error al cargar análisis de crash:', err);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  // ── Cargar logs estructurados ──
  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const data = await api.getParsedLogs(config.id, 1200);
      setLogs(data);
    } catch (err) {
      console.error('Error al cargar logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchCrashAnalysis(selectedFile);
  }, [config.id, selectedFile]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [config.id, activeTab]);

  // Auto-scroll al final al cargar logs
  useEffect(() => {
    if (autoScroll && activeTab === 'logs' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, activeTab]);

  // ── Copiar reporte de crash ──
  const handleCopyCrashReport = () => {
    if (!analysis?.rawReport) return;
    navigator.clipboard.writeText(analysis.rawReport);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 3000);
  };

  // ── Copiar texto de logs filtrados ──
  const handleCopyFilteredLogs = () => {
    const text = filteredLogs.map((l) => l.raw).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 3000);
  };

  // ── Filtrado de logs ──
  const filteredLogs = logs.filter((line) => {
    if (levelFilter !== 'ALL' && line.level !== levelFilter) {
      return false;
    }
    if (searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase();
      return (
        line.message.toLowerCase().includes(query) ||
        line.raw.toLowerCase().includes(query) ||
        (line.thread && line.thread.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const getCategoryBadge = (cat: CrashAnalysis['category']) => {
    switch (cat) {
      case 'DEPENDENCY_MISSING':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Faltan Dependencias</span>;
      case 'JAVA_VERSION':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Versión de Java</span>;
      case 'OUT_OF_MEMORY':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Falta de Memoria (RAM)</span>;
      case 'PORT_IN_USE':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">Puerto Ocupado</span>;
      case 'CHUNK_CORRUPTION':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">Entidad / Chunk Corrupto</span>;
      case 'PLUGIN_ERROR':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Error de Plugin</span>;
      case 'MIXIN_ERROR':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">Conflicto de Mixin</span>;
      case 'EULA':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">EULA no aceptada</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">General</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117] overflow-hidden">
      {/* ── Barra Superior con Selector de Pestañas ── */}
      <div className="border-b border-panel-border bg-panel-surface/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Stethoscope size={22} className="text-panel-accent" />
            Diagnóstico de Crashes y Visor de Logs
          </h2>
          <p className="text-xs text-panel-muted mt-0.5">
            Analizador inteligente de caídas con soluciones paso a paso e historial de <code className="text-zinc-400">latest.log</code>.
          </p>
        </div>

        {/* Pestañas (Analizador / Logs) */}
        <div className="flex items-center gap-1 rounded-lg border border-panel-border bg-panel-bg p-1 text-xs">
          <button
            onClick={() => setActiveTab('analyzer')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 font-medium transition-colors cursor-pointer ${
              activeTab === 'analyzer'
                ? 'bg-panel-accent text-white shadow'
                : 'text-panel-muted hover:text-white'
            }`}
          >
            <Bug size={14} /> Analizador de Crashes
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 font-medium transition-colors cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-panel-accent text-white shadow'
                : 'text-panel-muted hover:text-white'
            }`}
          >
            <FileText size={14} /> Visor de Logs
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── PESTAÑA 1: ANALIZADOR DE CRASHES ─────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'analyzer' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Selector de Historial de Crashes */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-panel-surface p-4 rounded-xl border border-panel-border">
            <div className="flex items-center gap-2.5">
              <History size={16} className="text-panel-muted" />
              <span className="text-xs font-semibold text-zinc-300">Reporte a inspeccionar:</span>
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                className="bg-panel-bg border border-panel-border rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-panel-accent"
              >
                <option value="latest">⭐ Última caída detectada (Automático)</option>
                {crashReports.map((c) => (
                  <option key={c.fileName} value={c.fileName}>
                    {c.fileName} ({(c.sizeBytes / 1024).toFixed(1)} KB — {new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => fetchCrashAnalysis(selectedFile)}
              disabled={loadingAnalysis}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-panel-border bg-panel-bg text-xs font-medium text-zinc-300 hover:text-white hover:border-panel-accent/40 transition-colors cursor-pointer"
            >
              <RefreshCw size={13} className={loadingAnalysis ? 'animate-spin' : ''} />
              Reanalizar
            </button>
          </div>

          {loadingAnalysis ? (
            <div className="p-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-panel-accent" />
              <p className="text-sm font-medium">Analizando reporte con el motor de diagnóstico...</p>
            </div>
          ) : !analysis || !analysis.hasCrash ? (
            /* Estado Sin Caídas */
            <div className="p-12 text-center rounded-xl border border-emerald-500/20 bg-emerald-950/10 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 size={28} />
              </div>
              <h3 className="text-lg font-bold text-white">Servidor Estable — Sin caídas registradas</h3>
              <p className="text-xs text-emerald-300/80 max-w-md">
                No se han encontrado archivos de crash recientes ni excepciones críticas en el log de inicio. Todo está en orden.
              </p>
            </div>
          ) : (
            /* Tarjeta de Diagnóstico Inteligente */
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Encabezado del Diagnóstico */}
              <div className="rounded-xl border border-red-500/30 bg-red-950/15 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-red-500/20 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                      <h3 className="text-lg font-bold text-white">{analysis.title}</h3>
                    </div>
                    {analysis.timestamp && (
                      <span className="text-xs text-zinc-400 block pl-7">
                        Fecha del incidente: <strong>{analysis.timestamp}</strong> {analysis.fileName ? `(${analysis.fileName})` : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {getCategoryBadge(analysis.category)}
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 uppercase">
                      {analysis.severity}
                    </span>
                  </div>
                </div>

                {/* Explicación en lenguaje humano */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-300 flex items-center gap-1.5">
                    <Info size={14} /> ¿Qué ha ocurrido?
                  </span>
                  <p className="text-sm text-zinc-200 leading-relaxed font-sans bg-zinc-900/60 p-3.5 rounded-lg border border-red-500/10">
                    {analysis.summary}
                  </p>
                </div>

                {/* Culpables sospechosos identificados */}
                {analysis.culprits && analysis.culprits.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      Elemento(s) o mod(s) sospechoso(s):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {analysis.culprits.map((culprit, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 rounded-md text-xs font-mono font-bold bg-red-500/20 text-red-200 border border-red-500/30"
                        >
                          {culprit}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Solución recomendada paso a paso */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> Solución recomendada:
                  </span>
                  <div className="text-sm text-emerald-200 font-sans leading-relaxed whitespace-pre-line">
                    {analysis.solution}
                  </div>
                </div>
              </div>

              {/* Detalles del Sistema */}
              {analysis.systemDetails && Object.keys(analysis.systemDetails).length > 0 && (
                <div className="rounded-xl border border-panel-border bg-panel-surface p-5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                    <Cpu size={15} className="text-panel-accent" /> Información del Entorno y Sistema
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                    {Object.entries(analysis.systemDetails).map(([key, val]) => (
                      <div key={key} className="bg-panel-bg p-2.5 rounded-lg border border-panel-border/60">
                        <span className="text-panel-muted block text-[11px] truncate">{key}</span>
                        <span className="text-zinc-200 font-medium font-mono truncate block mt-0.5">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* StackTrace Crudo (Acordeón) */}
              <div className="rounded-xl border border-panel-border bg-panel-surface overflow-hidden">
                <div
                  onClick={() => setShowStackTrace(!showStackTrace)}
                  className="px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-panel-hover transition-colors"
                >
                  <span className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                    <FileText size={15} className="text-panel-muted" />
                    Informe Técnico Crudo ({analysis.fileName || 'latest.log'})
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyCrashReport();
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-panel-muted hover:text-white transition-colors"
                      title="Copiar informe completo"
                    >
                      {copiedReport ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      {copiedReport ? 'Copiado' : 'Copiar'}
                    </button>
                    {showStackTrace ? <ChevronUp size={16} className="text-panel-muted" /> : <ChevronDown size={16} className="text-panel-muted" />}
                  </div>
                </div>

                {showStackTrace && (
                  <div className="p-4 border-t border-panel-border bg-[#090b10]">
                    <pre className="font-mono text-xs text-zinc-400 leading-relaxed overflow-x-auto max-h-96 whitespace-pre">
                      {analysis.rawReport}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── PESTAÑA 2: VISOR DE LOGS FILTRABLE ───────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'logs' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Barra de Filtros y Herramientas */}
          <div className="bg-panel-surface border-b border-panel-border px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Filtros de Nivel */}
            <div className="flex items-center gap-1.5">
              <span className="text-panel-muted font-medium mr-1 flex items-center gap-1">
                <SlidersHorizontal size={13} /> Nivel:
              </span>
              <button
                onClick={() => setLevelFilter('ALL')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  levelFilter === 'ALL'
                    ? 'bg-panel-accent text-white'
                    : 'bg-panel-bg text-panel-muted hover:text-white border border-panel-border'
                }`}
              >
                Todos ({logs.length})
              </button>
              <button
                onClick={() => setLevelFilter('INFO')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  levelFilter === 'INFO'
                    ? 'bg-blue-600 text-white'
                    : 'bg-panel-bg text-blue-400/80 hover:text-blue-300 border border-panel-border'
                }`}
              >
                INFO
              </button>
              <button
                onClick={() => setLevelFilter('WARN')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  levelFilter === 'WARN'
                    ? 'bg-amber-600 text-white'
                    : 'bg-panel-bg text-amber-400/80 hover:text-amber-300 border border-panel-border'
                }`}
              >
                WARN ({logs.filter((l) => l.level === 'WARN').length})
              </button>
              <button
                onClick={() => setLevelFilter('ERROR')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  levelFilter === 'ERROR'
                    ? 'bg-red-600 text-white'
                    : 'bg-panel-bg text-red-400/80 hover:text-red-300 border border-panel-border'
                }`}
              >
                ERROR ({logs.filter((l) => l.level === 'ERROR' || l.level === 'FATAL').length})
              </button>
            </div>

            {/* Buscador de Texto */}
            <div className="relative flex-1 max-w-xs min-w-[200px]">
              <Search size={14} className="absolute left-3 top-2.5 text-panel-muted" />
              <input
                type="text"
                placeholder="Buscar por jugador, mod, excepción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-panel-border bg-panel-bg text-xs text-white placeholder-panel-muted outline-none focus:border-panel-accent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-panel-muted hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Acciones Rápidas */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  autoScroll
                    ? 'bg-panel-accent/20 border-panel-accent/40 text-panel-accent'
                    : 'bg-panel-bg border-panel-border text-panel-muted'
                }`}
                title="Bajar automáticamente con cada línea nueva"
              >
                Auto-scroll {autoScroll ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={handleCopyFilteredLogs}
                className="p-1.5 rounded-lg border border-panel-border bg-panel-bg text-panel-muted hover:text-white transition-colors cursor-pointer"
                title="Copiar líneas visibles"
              >
                {copiedLogs ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>

              <a
                href={api.getRawLogUrl(config.id)}
                download={`${config.name}-latest.log`}
                className="p-1.5 rounded-lg border border-panel-border bg-panel-bg text-panel-muted hover:text-white transition-colors cursor-pointer inline-flex"
                title="Descargar archivo latest.log completo"
              >
                <Download size={14} />
              </a>

              <button
                onClick={fetchLogs}
                disabled={loadingLogs}
                className="p-1.5 rounded-lg border border-panel-border bg-panel-bg text-panel-muted hover:text-white transition-colors cursor-pointer"
                title="Refrescar logs"
              >
                <RefreshCw size={14} className={loadingLogs ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Consola / Visor de Líneas */}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-[#0a0c10] select-text">
            {loadingLogs ? (
              <div className="p-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
                <RefreshCw size={24} className="animate-spin text-panel-accent" />
                <span>Cargando registros...</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-zinc-500">
                <span>No se encontraron líneas que coincidan con los filtros aplicados.</span>
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredLogs.map((log) => {
                  let levelColor = 'text-zinc-400';
                  let levelBg = 'bg-zinc-800/40';

                  if (log.level === 'WARN') {
                    levelColor = 'text-amber-400';
                    levelBg = 'bg-amber-950/20 text-amber-300';
                  } else if (log.level === 'ERROR' || log.level === 'FATAL') {
                    levelColor = 'text-red-400';
                    levelBg = 'bg-red-950/30 text-red-300 font-semibold';
                  } else if (log.level === 'INFO') {
                    levelColor = 'text-blue-400';
                  }

                  return (
                    <div
                      key={log.id}
                      className={`flex items-start gap-2.5 py-0.5 px-2 rounded hover:bg-zinc-900/60 ${levelBg}`}
                    >
                      {/* Timestamp */}
                      <span className="text-zinc-600 shrink-0 select-none">
                        [{log.timestamp}]
                      </span>

                      {/* Badge de Nivel */}
                      <span className={`w-12 shrink-0 font-bold text-[11px] ${levelColor}`}>
                        [{log.level}]
                      </span>

                      {/* Mensaje */}
                      <span className="text-zinc-200 break-all whitespace-pre-wrap flex-1">
                        {log.message}
                      </span>
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
