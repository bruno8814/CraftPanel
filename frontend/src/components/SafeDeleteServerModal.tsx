// ============================================================
// SafeDeleteServerModal.tsx — Modal de Borrado Seguro de Servidor
// ============================================================
// Permite eliminar un servidor de forma completamente segura:
// 1. Exige que el servidor esté apagado (OFFLINE) para evitar bloqueos.
// 2. Advierte claramente sobre la pérdida definitiva de mundos y archivos.
// 3. Exige escribir el nombre exacto del servidor y marcar confirmación.
// 4. Permite elegir si conservar o eliminar también las copias de seguridad.
// ============================================================

import React, { useState } from 'react';
import {
  AlertTriangle,
  Trash2,
  X,
  Loader2,
  Square,
  ShieldAlert,
  FolderX,
  Archive,
} from 'lucide-react';
import { ServerState } from '../types';
import { api } from '../api/client';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  server: ServerState;
  onDeleted: () => void;
}

export default function SafeDeleteServerModal({
  isOpen,
  onClose,
  server,
  onDeleted,
}: Props) {
  const { config, status } = server;

  const [confirmName, setConfirmName] = useState('');
  const [understandLoss, setUnderstandLoss] = useState(false);
  const [deleteBackups, setDeleteBackups] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isServerRunning = status !== 'OFFLINE';
  const nameMatches = confirmName.trim() === config.name.trim();
  const canDelete = nameMatches && understandLoss && !isServerRunning && !isDeleting;

  // ── Detener servidor si está encendido ──
  const handleStopServer = async () => {
    setIsStopping(true);
    setError(null);
    try {
      await api.stopServer(config.id);
    } catch (err: any) {
      setError(`Error al detener el servidor: ${err.message}`);
    } finally {
      setIsStopping(false);
    }
  };

  // ── Ejecutar eliminación ──
  const handleDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);
    setError(null);

    try {
      await api.deleteServer(config.id, { deleteBackups });
      onClose();
      onDeleted();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar el servidor.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-[#12161f] p-6 shadow-2xl shadow-red-950/40 animate-in zoom-in-95 duration-200">
        
        {/* Cabecera con alerta */}
        <div className="flex items-start justify-between border-b border-panel-border/70 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-500/10 p-2.5 text-red-400 border border-red-500/20">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Eliminar Servidor
                <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-400 border border-red-500/20">
                  Acción Permanente
                </span>
              </h3>
              <p className="text-xs text-panel-muted mt-0.5">
                Borrado seguro y limpieza de almacenamiento
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg p-1.5 text-panel-muted hover:bg-panel-hover hover:text-white transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido */}
        <div className="mt-5 space-y-4 text-xs">
          
          {/* Advertencia destructiva */}
          <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
              <AlertTriangle size={17} className="shrink-0" />
              <span>Estás a punto de borrar definitivamente este servidor</span>
            </div>
            <p className="text-zinc-300 leading-relaxed text-xs">
              Se eliminarán de forma irreversible todos los datos del servidor <strong className="text-white font-mono">{config.name}</strong>:
            </p>
            <ul className="list-disc list-inside space-y-1 text-zinc-400 pl-1 text-[11px]">
              <li>Mundo completo (Overworld, Nether, End y construcciones).</li>
              <li>Inventarios, experiencia y estadísticas de todos los jugadores.</li>
              <li>Mods, plugins, archivos de configuración y registros de consola.</li>
            </ul>
          </div>

          {/* Estado de ejecución: si está online, exigir apagar */}
          {isServerRunning && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-semibold text-amber-300 text-xs block">
                  El servidor no está apagado (Estado: {status})
                </span>
                <span className="text-[11px] text-amber-200/80">
                  Para no corromper datos del sistema, primero debes detener el proceso.
                </span>
              </div>
              <button
                type="button"
                onClick={handleStopServer}
                disabled={isStopping}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 font-medium text-amber-200 hover:bg-amber-500/30 transition-colors disabled:opacity-50 shrink-0 text-xs"
              >
                {isStopping ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Deteniendo...
                  </>
                ) : (
                  <>
                    <Square size={13} /> Detener Ahora
                  </>
                )}
              </button>
            </div>
          )}

          {/* Ruta del servidor en disco */}
          <div className="rounded-lg bg-panel-bg/70 border border-panel-border p-3 space-y-1">
            <span className="text-panel-muted text-[11px] flex items-center gap-1.5 font-medium">
              <FolderX size={13} className="text-red-400" /> Directorio que será eliminado en el disco:
            </span>
            <p className="font-mono text-xs text-zinc-300 break-all bg-black/40 px-2 py-1 rounded">
              {config.directory}
            </p>
          </div>

          {/* Opciones adicionales */}
          <div className="space-y-2.5 pt-1">
            {/* Checkbox de comprensión */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={understandLoss}
                onChange={(e) => setUnderstandLoss(e.target.checked)}
                className="mt-0.5 rounded border-panel-border bg-panel-surface text-red-500 focus:ring-red-500 focus:ring-offset-0"
              />
              <span className="text-zinc-300 leading-tight">
                Entiendo que esta acción es permanente y que perderé todo el progreso del servidor sin posibilidad de recuperación.
              </span>
            </label>

            {/* Checkbox de copias de seguridad */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteBackups}
                onChange={(e) => setDeleteBackups(e.target.checked)}
                className="mt-0.5 rounded border-panel-border bg-panel-surface text-red-500 focus:ring-red-500 focus:ring-offset-0"
              />
              <span className="text-zinc-400 leading-tight flex items-center gap-1">
                <Archive size={13} className="shrink-0 text-amber-400" />
                Eliminar también las copias de seguridad (.zip) archivadas de este servidor.
              </span>
            </label>
          </div>

          {/* Verificación por texto */}
          <div className="space-y-1.5 pt-2">
            <label className="block text-zinc-300 font-medium">
              Para confirmar, escribe exactamente el nombre del servidor:{' '}
              <strong className="text-white font-mono bg-panel-surface px-1.5 py-0.5 rounded border border-panel-border select-all">
                {config.name}
              </strong>
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={config.name}
              disabled={isDeleting}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-white outline-none transition-colors ${
                nameMatches
                  ? 'border-emerald-500/50 bg-emerald-950/10 focus:border-emerald-500'
                  : 'border-panel-border bg-panel-bg focus:border-red-500/50'
              }`}
            />
          </div>

          {/* Error si ocurre */}
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-red-300 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-panel-border/70 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg px-4 py-2 text-xs font-medium text-panel-muted hover:bg-panel-hover hover:text-white transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-red-900/40 transition-all hover:bg-red-500 disabled:opacity-40 disabled:pointer-events-none"
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Eliminando servidor...
              </>
            ) : (
              <>
                <Trash2 size={14} />
                Eliminar Servidor Definitivamente
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
