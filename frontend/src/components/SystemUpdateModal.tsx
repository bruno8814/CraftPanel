// ============================================================
// SystemUpdateModal.tsx — Modal para comprobar y aplicar actualizaciones
// ============================================================

import React, { useState } from 'react';
import { 
  X, 
  RefreshCw, 
  GitBranch, 
  ArrowUpCircle, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  Terminal,
  ShieldAlert
} from 'lucide-react';
import { api } from '../api/client';
import { SystemVersionInfo } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  versionInfo: SystemVersionInfo | null;
  isLoading: boolean;
  onRefresh: () => void;
  isOwner: boolean;
}

export default function SystemUpdateModal({
  isOpen,
  onClose,
  versionInfo,
  isLoading,
  onRefresh,
  isOwner,
}: Props) {
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleApplyUpdate = async () => {
    if (!isOwner) return;
    setUpdating(true);
    setUpdateError(null);

    try {
      await api.triggerSystemUpdate();
      // El backend ha terminado git pull + npm run build y programó el reinicio
      let count = 5;
      setCountdown(count);
      const timer = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(timer);
          window.location.reload();
        }
      }, 1000);
    } catch (err: any) {
      setUpdateError(err.message || 'Error al ejecutar la actualización.');
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-panel-border bg-panel-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-panel-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-panel-accent/10 p-2 text-panel-accent">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-white">Actualizaciones de CraftPanel</h3>
              <p className="text-xs text-panel-muted">Sincronización con GitHub y versión del sistema</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={updating}
            className="rounded-lg p-1 text-panel-muted hover:bg-panel-hover hover:text-white transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido principal */}
        <div className="mt-5 space-y-4">
          {/* Tarjeta de estado actual */}
          <div className="rounded-lg border border-panel-border bg-panel-bg/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-panel-muted uppercase tracking-wider">Versión del Sistema</span>
              <button
                onClick={onRefresh}
                disabled={isLoading || updating}
                className="flex items-center gap-1.5 text-xs text-panel-accent hover:text-panel-accent/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                Comprobar
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">
                  v{versionInfo?.version || '1.0.0'}
                </span>
                {versionInfo?.updateAvailable ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
                    <ArrowUpCircle size={12} />
                    Actualización pendiente ({versionInfo.behindCount} {versionInfo.behindCount === 1 ? 'commit' : 'commits'})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 size={12} />
                    Al día
                  </span>
                )}
              </div>
            </div>

            {/* Metadatos de Git */}
            {versionInfo?.hasGit ? (
              <div className="space-y-1.5 border-t border-panel-border/50 pt-2.5 text-xs text-panel-muted">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <GitBranch size={13} className="text-panel-accent" />
                    Rama activa:
                  </span>
                  <span className="font-mono text-white">{versionInfo.branch || 'main'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Commit local:</span>
                  <span className="font-mono text-panel-muted">{versionInfo.currentCommit || 'n/a'}</span>
                </div>
                {versionInfo.lastCommitMessage && (
                  <div className="pt-1 text-[11px] text-panel-muted italic truncate">
                    &ldquo;{versionInfo.lastCommitMessage}&rdquo;
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-panel-hover/50 p-2.5 text-xs text-panel-muted border border-panel-border/50">
                <Terminal size={14} className="mt-0.5 text-panel-accent shrink-0" />
                <span>
                  Modo standalone sin repositorio <code className="text-white">.git</code> detectado.
                  Al instalar en Proxmox/Linux con <code className="text-white">install.sh</code> vía Git, las actualizaciones automáticas se sincronizan en 1 clic.
                </span>
              </div>
            )}
          </div>

          {/* Banner de actualización disponible */}
          {versionInfo?.updateAvailable && !countdown && (
            <div className="rounded-lg border border-panel-accent/30 bg-panel-accent/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-panel-accent font-medium text-sm">
                <ArrowUpCircle size={16} />
                <span>Hay mejoras y parches listos en GitHub</span>
              </div>
              <p className="text-xs text-panel-muted leading-relaxed">
                Al hacer clic, el servidor ejecutará automáticamente <code className="text-white">git pull</code>,
                compilará el frontend y reiniciará el servicio con cero pérdida de datos ni configuración.
              </p>
            </div>
          )}

          {/* Estado de Actualización en Progreso */}
          {updating && !countdown && (
            <div className="flex flex-col items-center justify-center p-6 space-y-3 rounded-lg border border-panel-accent/40 bg-panel-accent/10">
              <Loader2 size={32} className="animate-spin text-panel-accent" />
              <p className="text-sm font-medium text-white">Aplicando actualización en el servidor...</p>
              <p className="text-xs text-panel-muted text-center max-w-xs">
                Descargando cambios de GitHub, instalando dependencias y compilando la interfaz. Esto puede tardar unos 20-30 segundos.
              </p>
            </div>
          )}

          {/* Cuenta atrás de reinicio */}
          {countdown !== null && (
            <div className="flex flex-col items-center justify-center p-6 space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10">
              <CheckCircle2 size={32} className="text-emerald-400" />
              <p className="text-sm font-semibold text-white">¡Actualización completada con éxito!</p>
              <p className="text-xs text-emerald-300">
                Reiniciando panel y recargando en <span className="font-bold text-white text-sm">{countdown}s</span>...
              </p>
            </div>
          )}

          {/* Error si ocurre */}
          {updateError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-panel-danger/30 bg-panel-danger/10 p-3 text-xs text-panel-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold block">Error durante la actualización</span>
                <span>{updateError}</span>
              </div>
            </div>
          )}

          {/* Permiso insuficiente para usuarios no Dueño */}
          {!isOwner && versionInfo?.updateAvailable && (
            <div className="flex items-center gap-2 rounded-lg bg-panel-hover/50 p-3 text-xs text-amber-400 border border-amber-500/20">
              <ShieldAlert size={14} className="shrink-0" />
              <span>Solo el Dueño (Owner) del panel puede aplicar actualizaciones del sistema.</span>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-panel-border pt-4">
          <button
            onClick={onClose}
            disabled={updating}
            className="rounded-lg px-4 py-2 text-xs font-medium text-panel-muted hover:bg-panel-hover hover:text-white transition-colors disabled:opacity-50"
          >
            Cerrar
          </button>

          {isOwner && versionInfo?.hasGit && versionInfo?.updateAvailable && !countdown && (
            <button
              onClick={handleApplyUpdate}
              disabled={updating}
              className="flex items-center gap-2 rounded-lg bg-panel-accent px-4 py-2 text-xs font-medium text-white hover:bg-panel-accent/90 transition-colors shadow-lg shadow-panel-accent/20 disabled:opacity-50"
            >
              {updating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Actualizando...
                </>
              ) : (
                <>
                  <ArrowUpCircle size={14} />
                  Actualizar Panel Ahora
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
