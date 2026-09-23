// ============================================================
// AlertsSettings.tsx — Configuración de Alertas, Discord y Watchdog
// ============================================================
// Gestiona:
//   - Webhook URL de Discord y mensajes de prueba
//   - Notificaciones granulares por evento (inicio, parada, crash, jugadores, backups)
//   - Watchdog de auto-recuperación ante caídas
//   - Protección contra bucle de caídas (Crash Loop Protection)
//   - Historial visual de caídas recientes
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  Bell,
  Send,
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  Check,
  AlertTriangle,
  Play,
  Square,
  Users,
  Archive,
  Terminal,
  Activity,
  Zap,
  Info,
} from 'lucide-react';
import { AlertsConfig, CrashEvent, ServerState } from '../types';
import { api } from '../api/client';

interface AlertsSettingsProps {
  server: ServerState;
}

export const AlertsSettings: React.FC<AlertsSettingsProps> = ({ server }) => {
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [crashes, setCrashes] = useState<CrashEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [cfg, crashData] = await Promise.all([
        api.getAlertsConfig(server.config.id),
        api.getCrashHistory(server.config.id),
      ]);
      setConfig(cfg);
      setCrashes(crashData);
    } catch (err: any) {
      showToast(err.message || 'Error al cargar configuración de alertas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.config.id]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!config) return;

    try {
      setSaving(true);
      const updated = await api.saveAlertsConfig(server.config.id, config);
      setConfig(updated);
      showToast('Configuración de alertas guardada con éxito.');
    } catch (err: any) {
      showToast(err.message || 'Error al guardar configuración', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!config?.webhookUrl) {
      showToast('Introduce primero una URL de webhook de Discord válida.', 'error');
      return;
    }

    try {
      setTestingWebhook(true);
      showToast('Enviando mensaje de prueba a Discord...', 'info');
      await api.testDiscordWebhook(server.config.id, config.webhookUrl);
      showToast('¡Mensaje de prueba recibido en Discord con éxito!');
    } catch (err: any) {
      showToast(err.message || 'Error al enviar webhook de prueba', 'error');
    } finally {
      setTestingWebhook(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="p-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
        <RotateCcw className="w-6 h-6 animate-spin text-amber-500" />
        <p className="text-sm">Cargando configuración de alertas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium transition-all ${
            toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-700 text-rose-200'
              : toastMessage.type === 'info'
              ? 'bg-sky-950/90 border-sky-700 text-sky-200'
              : 'bg-emerald-950/90 border-emerald-700 text-emerald-200'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : toastMessage.type === 'info' ? (
            <RotateCcw className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 p-5 rounded-xl border border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-[#5865F2]" />
            Sistema de Alertas, Discord Webhooks y Watchdog
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Notifica a tu servidor de Discord sobre eventos clave y mantén tu servidor en marcha con auto-recuperación ante caídas.
          </p>
        </div>

        <button
          onClick={() => handleSave()}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold text-sm rounded-lg transition-colors shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
        >
          {saving ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Guardar Ajustes
        </button>
      </div>

      {/* Tarjeta 1: Webhook de Discord */}
      <div className="bg-zinc-900/60 p-6 rounded-xl border border-zinc-800 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#5865F2]/10 rounded-lg border border-[#5865F2]/20 text-[#5865F2]">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Canal de Discord (Webhook)</h3>
              <p className="text-xs text-zinc-400">Recibe embeds enriquecidos en tu canal de administración de Discord.</p>
            </div>
          </div>

          {/* Toggle Principal de Discord */}
          <button
            onClick={() => setConfig({ ...config, enabled: !config.enabled })}
            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
              config.enabled ? 'bg-[#5865F2]' : 'bg-zinc-700'
            }`}
            title={config.enabled ? 'Desactivar Discord' : 'Activar Discord'}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                config.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* URL del Webhook */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            URL del Webhook de Discord
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              value={config.webhookUrl}
              onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
              className="flex-1 px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#5865F2] font-mono text-xs"
            />
            <button
              type="button"
              onClick={handleTestWebhook}
              disabled={testingWebhook || !config.webhookUrl}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            >
              {testingWebhook ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-[#5865F2]" />}
              Probar Webhook
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            En Discord: Ve a <em>Ajustes del Canal → Integraciones → Crear Webhook → Copiar URL del Webhook</em>.
          </p>
        </div>

        {/* Eventos a Notificar */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Eventos a Retransmitir
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Arranque */}
            <label className="flex items-center justify-between p-3.5 bg-zinc-800/40 rounded-lg border border-zinc-700/60 cursor-pointer hover:bg-zinc-800/60 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded border border-emerald-500/20 text-emerald-400">
                  <Play className="w-4 h-4 fill-emerald-400/20" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-zinc-200 block">Servidor Iniciado</span>
                  <span className="text-xs text-zinc-400 block">Notifica cuando el servidor termine de cargar el mundo.</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.notifyOnStart}
                onChange={(e) => setConfig({ ...config, notifyOnStart: e.target.checked })}
                className="w-4 h-4 rounded text-[#5865F2] focus:ring-0 bg-zinc-700 border-zinc-600"
              />
            </label>

            {/* Parada */}
            <label className="flex items-center justify-between p-3.5 bg-zinc-800/40 rounded-lg border border-zinc-700/60 cursor-pointer hover:bg-zinc-800/60 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-500/10 rounded border border-rose-500/20 text-rose-400">
                  <Square className="w-4 h-4 fill-rose-400/20" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-zinc-200 block">Servidor Detenido</span>
                  <span className="text-xs text-zinc-400 block">Notifica apagados limpios y tiempo activo (uptime).</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.notifyOnStop}
                onChange={(e) => setConfig({ ...config, notifyOnStop: e.target.checked })}
                className="w-4 h-4 rounded text-[#5865F2] focus:ring-0 bg-zinc-700 border-zinc-600"
              />
            </label>

            {/* Caídas (Crashes) */}
            <label className="flex items-center justify-between p-3.5 bg-zinc-800/40 rounded-lg border border-zinc-700/60 cursor-pointer hover:bg-zinc-800/60 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/10 rounded border border-red-500/20 text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-zinc-200 block">Caídas Inesperadas (Crashes)</span>
                  <span className="text-xs text-zinc-400 block">Alerta urgente con código de salida y último log.</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.notifyOnCrash}
                onChange={(e) => setConfig({ ...config, notifyOnCrash: e.target.checked })}
                className="w-4 h-4 rounded text-[#5865F2] focus:ring-0 bg-zinc-700 border-zinc-600"
              />
            </label>

            {/* Jugadores */}
            <label className="flex items-center justify-between p-3.5 bg-zinc-800/40 rounded-lg border border-zinc-700/60 cursor-pointer hover:bg-zinc-800/60 transition-colors">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded border border-purple-500/20 text-purple-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-zinc-200 block">Entradas / Salidas de Jugadores</span>
                  <span className="text-xs text-zinc-400 block">Aviso con avatar del jugador cuando entra o sale.</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.notifyOnPlayer}
                onChange={(e) => setConfig({ ...config, notifyOnPlayer: e.target.checked })}
                className="w-4 h-4 rounded text-[#5865F2] focus:ring-0 bg-zinc-700 border-zinc-600"
              />
            </label>

            {/* Backups */}
            <label className="flex items-center justify-between p-3.5 bg-zinc-800/40 rounded-lg border border-zinc-700/60 cursor-pointer hover:bg-zinc-800/60 transition-colors md:col-span-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded border border-blue-500/20 text-blue-400">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-zinc-200 block">Copias de Seguridad (Backups)</span>
                  <span className="text-xs text-zinc-400 block">Notifica cuando se cree un respaldo exitoso con su tamaño y notas.</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.notifyOnBackup}
                onChange={(e) => setConfig({ ...config, notifyOnBackup: e.target.checked })}
                className="w-4 h-4 rounded text-[#5865F2] focus:ring-0 bg-zinc-700 border-zinc-600"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Tarjeta 2: Watchdog de Auto-recuperación (Crash Watchdog) */}
      <div className="bg-zinc-900/60 p-6 rounded-xl border border-zinc-800 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Watchdog de Auto-recuperación (Crash Watchdog)</h3>
              <p className="text-xs text-zinc-400">Vuelve a levantar el servidor de Minecraft automáticamente si el proceso Java se cierra por error.</p>
            </div>
          </div>

          {/* Toggle Auto-restart */}
          <button
            onClick={() => setConfig({ ...config, autoRestartOnCrash: !config.autoRestartOnCrash })}
            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
              config.autoRestartOnCrash ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
            title={config.autoRestartOnCrash ? 'Desactivar Auto-reinicio' : 'Activar Auto-reinicio'}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                config.autoRestartOnCrash ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Protección contra Bucle de Reinicios */}
        <div className="p-4 bg-zinc-800/40 rounded-xl border border-zinc-700/60 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
            <Zap className="w-4 h-4" />
            Protección contra Bucle de Caídas (Crash Loop Protection)
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Si el servidor falla repetidamente (ejemplo: incompatibilidad de mods, falta de RAM o archivo de mundo dañado),
            el Watchdog detendrá el auto-reinicio para no colapsar la CPU y enviará una alerta crítica a Discord.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Límite de Caídas Consecutivas
              </label>
              <input
                type="number"
                min={2}
                max={10}
                value={config.crashLoopThreshold}
                onChange={(e) => setConfig({ ...config, crashLoopThreshold: parseInt(e.target.value) || 3 })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 font-mono"
              />
              <span className="text-[11px] text-zinc-500 mt-1 block">Por defecto: 3 caídas.</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Ventana de Tiempo (Minutos)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={config.crashLoopWindowMinutes}
                onChange={(e) => setConfig({ ...config, crashLoopWindowMinutes: parseInt(e.target.value) || 5 })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 font-mono"
              />
              <span className="text-[11px] text-zinc-500 mt-1 block">Por defecto: 5 minutos.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjeta 3: Historial de Caídas Detectadas */}
      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-zinc-400" />
            Registro de Caídas del Watchdog ({crashes.length})
          </span>
          <button
            onClick={loadData}
            disabled={loading}
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {crashes.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
            <ShieldCheck className="w-8 h-8 text-emerald-500/70" />
            <p className="text-sm font-medium text-zinc-300">¡Servidor Estable!</p>
            <p className="text-xs text-zinc-500">No se han registrado caídas inesperadas en este servidor.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {crashes.map((crash) => (
              <div key={crash.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/40">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Código {crash.exitCode ?? 'Desconocido'}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      {new Date(crash.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {crash.lastLogLine && (
                    <p className="text-xs font-mono text-zinc-400 bg-zinc-800/80 px-2 py-1 rounded max-w-xl truncate">
                      {crash.lastLogLine}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  {crash.crashLoopSuppressed ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Crash Loop (Auto-reinicio Detenido)
                    </span>
                  ) : crash.autoRestartTriggered ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Check className="w-3.5 h-3.5" />
                      Auto-reiniciado con éxito
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Auto-reinicio no activado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
