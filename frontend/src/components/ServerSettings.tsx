// ============================================================
// ServerSettings.tsx — Editor visual y raw de server.properties
// ============================================================
// Permite modificar todos los parámetros de Minecraft con controles
// visuales intuitivos (switches, selects, sliders) o editar
// el archivo crudo en texto para usuarios avanzados.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  Save,
  RotateCcw,
  Sliders,
  Code,
  Shield,
  Swords,
  Globe,
  Cpu,
  Check,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ServerState } from '../types';
import { api } from '../api/client';

interface Props {
  server: ServerState;
}

export default function ServerSettings({ server }: Props) {
  const { config, status } = server;

  const [mode, setMode] = useState<'visual' | 'raw'>('visual');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [rawContent, setRawContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  // ── Cargar server.properties del servidor ──
  const fetchProperties = async () => {
    setLoading(true);
    try {
      const data = await api.getServerProperties(config.id);
      setProperties(data.properties || {});
      setRawContent(data.raw || '');
      setHasChanges(false);
    } catch (err: any) {
      showNotification('error', `Error al cargar ajustes: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, [config.id]);

  // ── Helpers para actualizar valores ──
  const updateProp = (key: string, value: string) => {
    setProperties((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const getBool = (key: string, defaultValue = false): boolean => {
    if (!(key in properties)) return defaultValue;
    return properties[key]?.toLowerCase() === 'true';
  };

  const setBool = (key: string, value: boolean) => {
    updateProp(key, value ? 'true' : 'false');
  };

  const getStr = (key: string, defaultValue = ''): string => {
    return properties[key] ?? defaultValue;
  };

  const getNum = (key: string, defaultValue = 0): number => {
    const val = parseInt(properties[key], 10);
    return isNaN(val) ? defaultValue : val;
  };

  // ── Guardar cambios ──
  const handleSave = async () => {
    setSaving(true);
    try {
      if (mode === 'raw') {
        await api.saveServerProperties(config.id, { raw: rawContent });
        // Recargar para sincronizar el modo visual
        const data = await api.getServerProperties(config.id);
        setProperties(data.properties);
      } else {
        await api.saveServerProperties(config.id, { properties });
        // Recargar para sincronizar el modo raw
        const data = await api.getServerProperties(config.id);
        setRawContent(data.raw);
      }

      setHasChanges(false);
      showNotification(
        'success',
        `Ajustes guardados correctamente.${
          status === 'ONLINE' ? ' Recuerda reiniciar el servidor para aplicar los cambios.' : ''
        }`
      );
    } catch (err: any) {
      showNotification('error', `Error al guardar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-panel-muted">
        <RefreshCw size={32} className="animate-spin text-panel-accent mb-2" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-panel-bg">
      {/* ── Barra superior ── */}
      <div className="border-b border-panel-border bg-panel-surface/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders size={20} className="text-panel-accent" /> Ajustes del Servidor
          </h2>
          <p className="text-xs text-panel-muted mt-0.5">
            Configuración de <code className="text-zinc-400">server.properties</code>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de Modo (Visual / Raw) */}
          <div className="flex items-center gap-1 rounded-lg border border-panel-border bg-panel-bg p-1 text-xs">
            <button
              onClick={() => setMode('visual')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                mode === 'visual'
                  ? 'bg-panel-accent text-white shadow'
                  : 'text-panel-muted hover:text-white'
              }`}
            >
              <Sliders size={13} /> Visual
            </button>
            <button
              onClick={() => setMode('raw')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                mode === 'raw'
                  ? 'bg-panel-accent text-white shadow'
                  : 'text-panel-muted hover:text-white'
              }`}
            >
              <Code size={13} /> Editor Raw
            </button>
          </div>

          {/* Botón Descartar / Recargar */}
          <button
            onClick={fetchProperties}
            disabled={saving}
            className="rounded-lg border border-panel-border bg-panel-surface p-2 text-panel-muted hover:text-white hover:border-panel-accent/40 transition-colors"
            title="Recargar ajustes"
          >
            <RotateCcw size={16} />
          </button>

          {/* Botón Guardar */}
          <button
            onClick={handleSave}
            disabled={saving || (!hasChanges && mode === 'visual')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors shadow-sm ${
              hasChanges || mode === 'raw'
                ? 'bg-panel-accent hover:bg-blue-600'
                : 'bg-panel-surface border border-panel-border text-panel-muted opacity-60 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" /> Guardando...
              </>
            ) : (
              <>
                <Save size={14} /> Guardar Cambios
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Banner de Notificación ── */}
      {notification && (
        <div
          className={`px-6 py-2.5 text-sm font-medium flex items-center justify-between transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-b border-red-500/20'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{notification.text}</span>
          </div>
        </div>
      )}

      {/* ── MODO VISUAL ── */}
      {mode === 'visual' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Sección 1: General & Conexión */}
          <div className="rounded-xl border border-panel-border bg-panel-surface p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <Shield size={16} className="text-panel-accent" /> General y Conexión
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* MOTD */}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Mensaje del Servidor (MOTD)
                </label>
                <input
                  type="text"
                  value={getStr('motd', 'Un servidor de Minecraft')}
                  onChange={(e) => updateProp('motd', e.target.value)}
                  placeholder="A Minecraft Server"
                  className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
                />
                <span className="text-[11px] text-panel-muted mt-1 block">
                  El texto que verán los jugadores en la lista multijugador.
                </span>
              </div>

              {/* Puerto */}
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Puerto del Servidor (server-port)
                </label>
                <input
                  type="number"
                  value={getNum('server-port', 25565)}
                  onChange={(e) => updateProp('server-port', e.target.value)}
                  className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
                />
              </div>

              {/* Jugadores Máximos */}
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Jugadores Máximos (max-players)
                </label>
                <input
                  type="number"
                  value={getNum('max-players', 20)}
                  onChange={(e) => updateProp('max-players', e.target.value)}
                  className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
                />
              </div>

              {/* Modo Online */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Modo Online (online-mode)</span>
                  <span className="text-xs text-panel-muted block">
                    {getBool('online-mode', true)
                      ? 'Solo cuentas de Minecraft oficiales / premium'
                      : 'Permite cuentas no oficiales (modo no-premium / cracked)'}
                  </span>
                </div>
                <ToggleSwitch
                  checked={getBool('online-mode', true)}
                  onChange={(val) => setBool('online-mode', val)}
                />
              </div>

              {/* Lista Blanca */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Lista Blanca (white-list)</span>
                  <span className="text-xs text-panel-muted block">
                    Solo los jugadores en whitelist.json podrán entrar
                  </span>
                </div>
                <ToggleSwitch
                  checked={getBool('white-list', false)}
                  onChange={(val) => setBool('white-list', val)}
                />
              </div>
            </div>
          </div>

          {/* Sección 2: Jugabilidad y Combate */}
          <div className="rounded-xl border border-panel-border bg-panel-surface p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <Swords size={16} className="text-panel-accent" /> Jugabilidad y Reglas de Juego
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Modo de juego */}
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Modo de Juego Predeterminado
                </label>
                <select
                  value={getStr('gamemode', 'survival')}
                  onChange={(e) => updateProp('gamemode', e.target.value)}
                  className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
                >
                  <option value="survival">Supervivencia (Survival)</option>
                  <option value="creative">Creativo (Creative)</option>
                  <option value="adventure">Aventura (Adventure)</option>
                  <option value="spectator">Espectador (Spectator)</option>
                </select>
              </div>

              {/* Dificultad */}
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Dificultad
                </label>
                <select
                  value={getStr('difficulty', 'easy')}
                  onChange={(e) => updateProp('difficulty', e.target.value)}
                  className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
                >
                  <option value="peaceful">Pacífico (Peaceful)</option>
                  <option value="easy">Fácil (Easy)</option>
                  <option value="normal">Normal (Normal)</option>
                  <option value="hard">Difícil (Hard)</option>
                </select>
              </div>

              {/* PVP */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Combate PvP (pvp)</span>
                  <span className="text-xs text-panel-muted block">Permitir daño entre jugadores</span>
                </div>
                <ToggleSwitch
                  checked={getBool('pvp', true)}
                  onChange={(val) => setBool('pvp', val)}
                />
              </div>

              {/* Hardcore */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Modo Extremo (hardcore)</span>
                  <span className="text-xs text-panel-muted block">
                    Al morir, los jugadores quedan bloqueados en modo espectador
                  </span>
                </div>
                <ToggleSwitch
                  checked={getBool('hardcore', false)}
                  onChange={(val) => setBool('hardcore', val)}
                />
              </div>

              {/* Forzar Gamemode */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Forzar Gamemode (force-gamemode)</span>
                  <span className="text-xs text-panel-muted block">
                    Devuelve a los jugadores al modo por defecto al conectarse
                  </span>
                </div>
                <ToggleSwitch
                  checked={getBool('force-gamemode', false)}
                  onChange={(val) => setBool('force-gamemode', val)}
                />
              </div>

              {/* Permitir Vuelo */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Permitir Vuelo (allow-flight)</span>
                  <span className="text-xs text-panel-muted block">
                    Evita que el servidor expulse por volar (útil con mods y jetpacks)
                  </span>
                </div>
                <ToggleSwitch
                  checked={getBool('allow-flight', false)}
                  onChange={(val) => setBool('allow-flight', val)}
                />
              </div>
            </div>
          </div>

          {/* Sección 3: Mundo y Criaturas */}
          <div className="rounded-xl border border-panel-border bg-panel-surface p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <Globe size={16} className="text-panel-accent" /> Mundo y Generación
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nombre del mundo */}
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Nombre de la Carpeta del Mundo (level-name)
                </label>
                <input
                  type="text"
                  value={getStr('level-name', 'world')}
                  onChange={(e) => updateProp('level-name', e.target.value)}
                  className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
                />
              </div>

              {/* Semilla del mundo */}
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Semilla del Mundo (level-seed)
                </label>
                <input
                  type="text"
                  value={getStr('level-seed', '')}
                  onChange={(e) => updateProp('level-seed', e.target.value)}
                  placeholder="Dejar vacío para aleatoria"
                  className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
                />
              </div>

              {/* Monstruos */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Generar Monstruos (spawn-monsters)</span>
                  <span className="text-xs text-panel-muted block">Zombis, esqueletos, creepers...</span>
                </div>
                <ToggleSwitch
                  checked={getBool('spawn-monsters', true)}
                  onChange={(val) => setBool('spawn-monsters', val)}
                />
              </div>

              {/* Animales */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Generar Animales (spawn-animals)</span>
                  <span className="text-xs text-panel-muted block">Vacas, cerdos, ovejas...</span>
                </div>
                <ToggleSwitch
                  checked={getBool('spawn-animals', true)}
                  onChange={(val) => setBool('spawn-animals', val)}
                />
              </div>

              {/* Estructuras */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Generar Estructuras</span>
                  <span className="text-xs text-panel-muted block">Aldeas, fortalezas, templos...</span>
                </div>
                <ToggleSwitch
                  checked={getBool('generate-structures', true)}
                  onChange={(val) => setBool('generate-structures', val)}
                />
              </div>

              {/* Permitir Nether */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Permitir el Nether (allow-nether)</span>
                  <span className="text-xs text-panel-muted block">Habilitar portales y dimensión del Nether</span>
                </div>
                <ToggleSwitch
                  checked={getBool('allow-nether', true)}
                  onChange={(val) => setBool('allow-nether', val)}
                />
              </div>
            </div>
          </div>

          {/* Sección 4: Rendimiento y Avanzado */}
          <div className="rounded-xl border border-panel-border bg-panel-surface p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <Cpu size={16} className="text-panel-accent" /> Rendimiento y Bloques de Comandos
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Distancia de visión */}
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Distancia de Visión (view-distance: {getNum('view-distance', 10)} chunks)
                </label>
                <input
                  type="range"
                  min="4"
                  max="32"
                  value={getNum('view-distance', 10)}
                  onChange={(e) => updateProp('view-distance', e.target.value)}
                  className="w-full accent-panel-accent cursor-pointer"
                />
                <span className="text-[11px] text-panel-muted">Recomendado: 8-12 para mejor rendimiento.</span>
              </div>

              {/* Distancia de simulación */}
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Distancia de Simulación (simulation-distance: {getNum('simulation-distance', 10)} chunks)
                </label>
                <input
                  type="range"
                  min="4"
                  max="32"
                  value={getNum('simulation-distance', 10)}
                  onChange={(e) => updateProp('simulation-distance', e.target.value)}
                  className="w-full accent-panel-accent cursor-pointer"
                />
                <span className="text-[11px] text-panel-muted">Distancia a la que se calculan las entidades.</span>
              </div>

              {/* Bloques de comandos */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-panel-border bg-panel-bg/60">
                <div>
                  <span className="text-sm font-medium text-white block">Bloques de Comandos</span>
                  <span className="text-xs text-panel-muted block">Habilitar ejecución de Command Blocks</span>
                </div>
                <ToggleSwitch
                  checked={getBool('enable-command-block', false)}
                  onChange={(val) => setBool('enable-command-block', val)}
                />
              </div>

              {/* Radio de protección del spawn */}
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1">
                  Protección del Spawn (spawn-protection)
                </label>
                <input
                  type="number"
                  value={getNum('spawn-protection', 16)}
                  onChange={(e) => updateProp('spawn-protection', e.target.value)}
                  className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
                />
                <span className="text-[11px] text-panel-muted">Radio en bloques protegido de no-ops (0 para desactivar).</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── MODO RAW / TEXTO ── */
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-panel-muted">
              Editor directo de texto — Cualquier cambio aquí sobreescribirá el archivo completo.
            </span>
          </div>
          <textarea
            value={rawContent}
            onChange={(e) => {
              setRawContent(e.target.value);
              setHasChanges(true);
            }}
            spellCheck={false}
            className="flex-1 w-full rounded-xl border border-panel-border bg-panel-surface p-4 font-mono text-sm leading-relaxed text-zinc-200 outline-none resize-none focus:border-panel-accent/50"
          />
        </div>
      )}
    </div>
  );
}

// ── Componente Toggle Switch ──
function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-panel-accent' : 'bg-zinc-800'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
