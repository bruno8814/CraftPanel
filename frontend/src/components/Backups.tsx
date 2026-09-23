// ============================================================
// Backups.tsx — Gestor de Copias de Seguridad y Restauración
// ============================================================
// Proporciona:
//   1. Listado de backups con fecha, tamaño y notas
//   2. Creación en caliente con guardado seguro de Minecraft (save-all)
//   3. Restauración en 1-clic con parada segura previa
//   4. Candado de seguridad para proteger copias clave contra borrado
//   5. Importación / Subida directa de archivos .zip mediante Drag & Drop
//   6. Descarga directa en el navegador
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  HardDrive,
  Download,
  RotateCcw,
  Trash2,
  Lock,
  Unlock,
  Plus,
  Upload,
  RefreshCw,
  Archive,
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { ServerState, BackupItem } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface BackupsProps {
  server: ServerState;
  onRefresh?: () => void;
}

export default function Backups({ server, onRefresh }: BackupsProps) {
  const { hasPermission } = useAuth();
  const canManageBackups = hasPermission('files:edit') || hasPermission('servers:control');

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [totalSize, setTotalSize] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Estados de modales y operaciones
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createNote, setCreateNote] = useState('');
  const [excludeLogs, setExcludeLogs] = useState(true);

  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupItem | null>(null);

  // Estados de proceso en curso
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Cargar backups del servidor ──
  const fetchBackups = async () => {
    try {
      const data = await api.getBackups(server.config.id);
      setBackups(data.backups);
      setTotalSize(data.totalSizeBytes);
    } catch (err) {
      console.error('Error al cargar backups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, [server.config.id]);

  // ── Formatear tamaño de archivo ──
  const formatSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  // ── Formatear tiempo relativo ──
  const formatRelativeTime = (isoString: string): string => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Hace un momento';
      if (diffMins < 60) return `Hace ${diffMins} min`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `Hace ${diffHours} h`;
      const diffDays = Math.floor(diffHours / 24);
      return `Hace ${diffDays} d`;
    } catch {
      return isoString;
    }
  };

  // ── Crear nuevo backup ──
  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await api.createBackup(server.config.id, {
        note: createNote.trim() || undefined,
        excludeLogs,
      });
      setShowCreateModal(false);
      setCreateNote('');
      await fetchBackups();
    } catch (err: any) {
      alert(`Error al crear la copia de seguridad: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // ── Restaurar backup ──
  const handleRestore = async () => {
    if (!restoreTarget) return;
    setIsRestoring(true);
    try {
      await api.restoreBackup(server.config.id, restoreTarget.filename);
      setRestoreTarget(null);
      alert('¡Copia de seguridad restaurada correctamente!');
      onRefresh?.();
      await fetchBackups();
    } catch (err: any) {
      alert(`Error al restaurar: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // ── Eliminar backup ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteBackup(server.config.id, deleteTarget.filename);
      setDeleteTarget(null);
      await fetchBackups();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  // ── Alternar candado (bloqueo) ──
  const handleToggleLock = async (backup: BackupItem) => {
    try {
      const updated = await api.toggleLockBackup(server.config.id, backup.filename);
      setBackups((prev) =>
        prev.map((b) => (b.filename === backup.filename ? { ...b, locked: updated.locked } : b))
      );
    } catch (err: any) {
      alert(`Error al cambiar bloqueo: ${err.message}`);
    }
  };

  // ── Subir archivo de backup (.zip) ──
  const handleUploadFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      alert('Por favor selecciona un archivo comprimido .zip válido.');
      return;
    }

    setIsUploading(true);
    try {
      await api.uploadBackup(server.config.id, file);
      await fetchBackups();
    } catch (err: any) {
      alert(`Error al subir el backup: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // ── Drag & Drop Handlers ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className="space-y-6 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Overlay al arrastrar archivo */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-[#0d1117]/85 border-2 border-dashed border-[#58a6ff] rounded-2xl flex flex-col items-center justify-center pointer-events-none">
          <Upload size={48} className="text-[#58a6ff] animate-bounce mb-3" />
          <p className="text-base font-semibold text-white">Suelta aquí tu archivo .zip</p>
          <p className="text-xs text-gray-400 mt-1">Se importará como nueva copia de seguridad</p>
        </div>
      )}

      {/* Input oculto para subir archivo */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleUploadFile(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      {/* Cabecera con estadísticas y acciones */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Archive size={22} className="text-[#58a6ff]" />
            <h2 className="text-lg font-bold text-white">Copias de Seguridad (Backups)</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Instantáneas completas del mundo, configuración y addons con restauración atómica en 1-clic.
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5 font-mono">
              <FileArchive size={14} className="text-emerald-400" />
              <strong className="text-white">{backups.length}</strong> copias creadas
            </span>
            <span className="flex items-center gap-1.5 font-mono">
              <HardDrive size={14} className="text-cyan-400" />
              <strong className="text-white">{formatSize(totalSize)}</strong> en disco
            </span>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto">
          <button
            onClick={fetchBackups}
            className="p-2.5 bg-[#21262d] hover:bg-[#30363d] text-gray-300 hover:text-white rounded-xl border border-[#30363d] transition-colors"
            title="Refrescar lista"
          >
            <RefreshCw size={16} />
          </button>

          {canManageBackups && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#21262d] hover:bg-[#30363d] text-white text-xs font-semibold rounded-xl border border-[#30363d] transition-colors disabled:opacity-50"
              >
                {isUploading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                {isUploading ? 'Subiendo...' : 'Subir Backup (.zip)'}
              </button>

              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1f6feb] hover:bg-blue-600 text-white text-xs font-semibold rounded-xl shadow-lg transition-colors"
              >
                <Plus size={16} />
                Crear Copia Ahora
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lista de copias de seguridad */}
      {loading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-12 text-center text-gray-400">
          <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-panel-accent" />
          <p className="text-sm">Cargando copias de seguridad...</p>
        </div>
      ) : backups.length === 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-12 text-center">
          <Archive size={40} className="mx-auto text-gray-600 mb-3" />
          <h3 className="text-base font-semibold text-white">No hay copias de seguridad todavía</h3>
          <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
            Crea tu primer backup para guardar un punto de restauración seguro o arrastra un archivo .zip para importar un mundo existente.
          </p>
          {canManageBackups && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#1f6feb] hover:bg-blue-600 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              <Plus size={14} /> Crear primer backup
            </button>
          )}
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#21262d] text-gray-400 text-xs uppercase font-mono tracking-wider border-b border-[#30363d]">
                <tr>
                  <th className="px-5 py-3.5">Archivo / Descripción</th>
                  <th className="px-5 py-3.5">Versión</th>
                  <th className="px-5 py-3.5">Fecha</th>
                  <th className="px-5 py-3.5">Tamaño</th>
                  <th className="px-5 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]">
                {backups.map((b) => (
                  <tr key={b.filename} className="hover:bg-[#1f242c] transition-colors group">
                    {/* Nombre y nota */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 text-[#58a6ff] rounded-lg shrink-0">
                          <FileArchive size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white font-mono text-xs truncate max-w-xs md:max-w-md">
                              {b.filename}
                            </span>
                            {b.locked && (
                              <span
                                title="Bloqueado contra borrado accidental"
                                className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono"
                              >
                                <Lock size={10} /> Protegido
                              </span>
                            )}
                          </div>
                          {b.note && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">
                              {b.note}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Versión y Software */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="text-xs font-mono bg-[#21262d] text-gray-300 px-2 py-0.5 rounded border border-[#30363d]">
                        {b.software} {b.serverVersion}
                      </span>
                    </td>

                    {/* Fecha */}
                    <td className="px-5 py-4 whitespace-nowrap text-xs text-gray-300">
                      <div>{formatRelativeTime(b.createdAt)}</div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        {new Date(b.createdAt).toLocaleDateString()} {new Date(b.createdAt).toLocaleTimeString()}
                      </div>
                    </td>

                    {/* Tamaño */}
                    <td className="px-5 py-4 whitespace-nowrap text-xs font-mono font-medium text-white">
                      {formatSize(b.sizeBytes)}
                    </td>

                    {/* Acciones */}
                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Bloquear / Desbloquear */}
                        {canManageBackups && (
                          <button
                            onClick={() => handleToggleLock(b)}
                            title={b.locked ? 'Desbloquear copia' : 'Bloquear con candado'}
                            className={`p-2 rounded-lg transition-colors ${
                              b.locked
                                ? 'text-amber-400 hover:bg-amber-500/10'
                                : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
                            }`}
                          >
                            {b.locked ? <Lock size={15} /> : <Unlock size={15} />}
                          </button>
                        )}

                        {/* Descargar */}
                        <a
                          href={api.getBackupDownloadUrl(server.config.id, b.filename)}
                          download={b.filename}
                          title="Descargar copia (.zip)"
                          className="p-2 text-gray-400 hover:text-[#58a6ff] hover:bg-blue-500/10 rounded-lg transition-colors inline-block"
                        >
                          <Download size={15} />
                        </a>

                        {/* Restaurar */}
                        {canManageBackups && (
                          <button
                            onClick={() => setRestoreTarget(b)}
                            title="Restaurar en 1-clic"
                            className="p-2 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}

                        {/* Eliminar */}
                        {canManageBackups && (
                          <button
                            disabled={b.locked}
                            onClick={() => setDeleteTarget(b)}
                            title={b.locked ? 'No se puede eliminar: está bloqueado' : 'Eliminar copia'}
                            className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ══ MODAL DE CREACIÓN DE BACKUP               ══ */}
      {/* ══════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Archive size={20} className="text-[#58a6ff]" />
              Crear Copia de Seguridad
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Se creará una instantánea comprimida de tu servidor en formato .zip.
            </p>

            {/* Aviso de servidor online */}
            {server.status === 'ONLINE' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-4 flex items-center gap-2.5 text-emerald-300 text-xs">
                <CheckCircle2 size={16} className="shrink-0" />
                <span>
                  El servidor está <strong>ONLINE</strong>: Se ejecutará <code>save-off</code> y <code>save-all flush</code> para congelar el estado y guardar el mundo sin desconectar a nadie.
                </span>
              </div>
            )}

            {/* Nota opcional */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Nota o etiqueta (opcional):
                </label>
                <input
                  type="text"
                  value={createNote}
                  onChange={(e) => setCreateNote(e.target.value)}
                  placeholder="Ej: Antes de instalar mods, Fin de semana..."
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#58a6ff]"
                />
              </div>

              {/* Casilla excluir logs */}
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-gray-300 select-none pt-1">
                <input
                  type="checkbox"
                  checked={excludeLogs}
                  onChange={(e) => setExcludeLogs(e.target.checked)}
                  className="w-4 h-4 rounded bg-[#0d1117] border-[#30363d] text-[#1f6feb] focus:ring-0"
                />
                <span>Excluir registros antiguos (carpeta <code>logs/</code>) para ahorrar espacio</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                disabled={isCreating}
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isCreating}
                onClick={handleCreate}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-[#1f6feb] hover:bg-blue-600 text-white transition-colors disabled:opacity-50"
              >
                {isCreating ? <RefreshCw size={14} className="animate-spin" /> : <Archive size={14} />}
                {isCreating ? 'Comprimiendo...' : 'Iniciar Backup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ══ MODAL DE CONFIRMACIÓN DE RESTAURACIÓN     ══ */}
      {/* ══════════════════════════════════════════════ */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-amber-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <ShieldAlert size={20} className="text-amber-400" />
              Restaurar Copia de Seguridad
            </h3>
            <p className="text-xs text-gray-300 mb-3">
              ¿Estás seguro de que quieres restaurar la copia{' '}
              <strong className="text-white font-mono">{restoreTarget.filename}</strong>?
            </p>

            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl mb-4 text-xs text-rose-300 space-y-1">
              <p className="font-semibold">⚠️ Advertencia de sobrescritura:</p>
              <p>
                Los mundos, configuraciones y datos actuales del servidor se reemplazarán por los contenidos en este backup.
              </p>
              {server.status === 'ONLINE' && (
                <p className="font-medium text-amber-300 pt-1">
                  El servidor se detendrá automáticamente de forma segura antes de extraer los archivos.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => setRestoreTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isRestoring}
                onClick={handleRestore}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
              >
                {isRestoring ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                {isRestoring ? 'Restaurando...' : 'Confirmar Restauración'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ══ MODAL DE CONFIRMACIÓN DE ELIMINACIÓN      ══ */}
      {/* ══════════════════════════════════════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Trash2 size={20} className="text-rose-400" />
              Eliminar Copia de Seguridad
            </h3>
            <p className="text-xs text-gray-300 mb-4">
              ¿Estás seguro de que deseas eliminar permanentemente el archivo{' '}
              <strong className="text-white font-mono">{deleteTarget.filename}</strong>? Esta acción no se puede deshacer.
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
