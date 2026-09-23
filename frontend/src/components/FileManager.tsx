// ============================================================
// FileManager.tsx — Explorador de archivos del servidor
// ============================================================
// Permite navegar por las carpetas del servidor, abrir y editar
// archivos de configuración (yml, json, txt, properties, logs),
// crear nuevos archivos/carpetas, renombrar y eliminar.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileArchive,
  CornerLeftUp,
  Plus,
  FolderPlus,
  Trash2,
  Edit3,
  RefreshCw,
  Save,
  X,
  Check,
  AlertCircle,
  Home,
  ChevronRight,
} from 'lucide-react';
import { ServerState, FileItem } from '../types';
import { api } from '../api/client';

interface Props {
  server: ServerState;
}

// Extensiones editables directamente en el navegador
const EDITABLE_EXTENSIONS = new Set([
  '.txt',
  '.json',
  '.yml',
  '.yaml',
  '.properties',
  '.log',
  '.toml',
  '.cfg',
  '.conf',
  '.md',
]);

export default function FileManager({ server }: Props) {
  const { config } = server;

  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado del editor de archivos
  const [editingFile, setEditingFile] = useState<{ path: string; name: string } | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [savingContent, setSavingContent] = useState(false);

  // Modales de Crear y Renombrar
  const [createModal, setCreateModal] = useState<{ isDirectory: boolean } | null>(null);
  const [createName, setCreateName] = useState('');
  const [renameModal, setRenameModal] = useState<FileItem | null>(null);
  const [renameNewName, setRenameNewName] = useState('');

  // Notificaciones
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // ── Cargar archivos de la ruta actual ──
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listFiles(config.id, currentPath);
      setItems(data);
    } catch (err: any) {
      showNotification('error', `Error al listar archivos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [config.id, currentPath]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // ── Navegación ──
  const navigateTo = (path: string) => {
    setCurrentPath(path.replace(/\\/g, '/'));
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  // ── Abrir archivo para edición ──
  const handleOpenFile = async (item: FileItem) => {
    if (item.isDirectory) {
      navigateTo(item.relativePath);
      return;
    }

    if (!EDITABLE_EXTENSIONS.has(item.extension)) {
      showNotification('error', `Este tipo de archivo (${item.extension || 'binario'}) no se puede editar como texto.`);
      return;
    }

    setEditingFile({ path: item.relativePath, name: item.name });
    setLoadingContent(true);
    try {
      const res = await api.getFileContent(config.id, item.relativePath);
      setFileContent(res.content);
    } catch (err: any) {
      showNotification('error', `Error al abrir archivo: ${err.message}`);
      setEditingFile(null);
    } finally {
      setLoadingContent(false);
    }
  };

  // ── Guardar archivo editado ──
  const handleSaveFile = async () => {
    if (!editingFile) return;
    setSavingContent(true);
    try {
      await api.saveFileContent(config.id, {
        path: editingFile.path,
        content: fileContent,
      });
      showNotification('success', `Archivo "${editingFile.name}" guardado.`);
      setEditingFile(null);
      await fetchFiles();
    } catch (err: any) {
      showNotification('error', `Error al guardar: ${err.message}`);
    } finally {
      setSavingContent(false);
    }
  };

  // ── Crear nuevo elemento ──
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createModal || !createName.trim()) return;

    try {
      await api.createFileEntry(config.id, {
        path: currentPath,
        name: createName.trim(),
        isDirectory: createModal.isDirectory,
      });
      showNotification('success', `${createModal.isDirectory ? 'Carpeta' : 'Archivo'} creado con éxito.`);
      setCreateModal(null);
      setCreateName('');
      await fetchFiles();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // ── Renombrar elemento ──
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameModal || !renameNewName.trim()) return;

    try {
      await api.renameFileEntry(config.id, {
        path: renameModal.relativePath,
        newName: renameNewName.trim(),
      });
      showNotification('success', 'Elemento renombrado.');
      setRenameModal(null);
      setRenameNewName('');
      await fetchFiles();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // ── Eliminar elemento ──
  const handleDelete = async (item: FileItem) => {
    if (!confirm(`¿Estás seguro de eliminar ${item.isDirectory ? 'la carpeta y su contenido' : 'el archivo'} "${item.name}"?`)) {
      return;
    }

    try {
      await api.deleteFileEntry(config.id, item.relativePath);
      showNotification('success', `"${item.name}" ha sido eliminado.`);
      await fetchFiles();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // ── Helper de iconos según extensión ──
  const getFileIcon = (item: FileItem) => {
    if (item.isDirectory) {
      return <Folder size={18} className="text-amber-400" />;
    }
    const ext = item.extension;
    if (ext === '.json' || ext === '.yml' || ext === '.yaml' || ext === '.toml') {
      return <FileCode size={18} className="text-blue-400" />;
    }
    if (ext === '.log' || ext === '.txt' || ext === '.properties' || ext === '.md') {
      return <FileText size={18} className="text-emerald-400" />;
    }
    if (ext === '.jar' || ext === '.zip' || ext === '.tar' || ext === '.gz') {
      return <FileArchive size={18} className="text-purple-400" />;
    }
    return <File size={18} className="text-panel-muted" />;
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Generar migas de pan (breadcrumbs)
  const pathParts = currentPath ? currentPath.split('/') : [];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-panel-bg">
      {/* ── Barra superior y herramientas ── */}
      <div className="border-b border-panel-border bg-panel-surface/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        {/* Migas de pan (Breadcrumbs) */}
        <div className="flex items-center gap-1.5 text-sm overflow-x-auto">
          <button
            onClick={() => navigateTo('')}
            className="flex items-center gap-1 text-panel-muted hover:text-white transition-colors"
          >
            <Home size={15} />
            <span className="font-semibold">{config.name}</span>
          </button>

          {pathParts.map((part, index) => {
            const partPath = pathParts.slice(0, index + 1).join('/');
            const isLast = index === pathParts.length - 1;

            return (
              <React.Fragment key={partPath}>
                <ChevronRight size={14} className="text-zinc-600 flex-shrink-0" />
                {isLast ? (
                  <span className="text-white font-medium truncate max-w-[150px]">{part}</span>
                ) : (
                  <button
                    onClick={() => navigateTo(partPath)}
                    className="text-panel-muted hover:text-white transition-colors truncate max-w-[120px]"
                  >
                    {part}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Botones de acción */}
        <div className="flex items-center gap-2">
          {currentPath && (
            <button
              onClick={navigateUp}
              className="inline-flex items-center gap-1 rounded-lg border border-panel-border bg-panel-surface px-3 py-1.5 text-xs font-medium text-panel-muted hover:text-white hover:border-panel-accent/40 transition-colors"
              title="Subir un nivel"
            >
              <CornerLeftUp size={14} /> Subir
            </button>
          )}

          <button
            onClick={() => setCreateModal({ isDirectory: false })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-panel-border bg-panel-surface px-3 py-1.5 text-xs font-medium text-panel-muted hover:text-white hover:border-panel-accent/40 transition-colors"
          >
            <Plus size={14} /> Nuevo Archivo
          </button>

          <button
            onClick={() => setCreateModal({ isDirectory: true })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-panel-border bg-panel-surface px-3 py-1.5 text-xs font-medium text-panel-muted hover:text-white hover:border-panel-accent/40 transition-colors"
          >
            <FolderPlus size={14} /> Nueva Carpeta
          </button>

          <button
            onClick={fetchFiles}
            disabled={loading}
            className="rounded-lg border border-panel-border bg-panel-surface p-2 text-panel-muted hover:text-white hover:border-panel-accent/40 transition-colors"
            title="Refrescar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Banner de Notificación ── */}
      {notification && (
        <div
          className={`px-6 py-2.5 text-sm font-medium flex items-center gap-2 transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-b border-red-500/20'
          }`}
        >
          {notification.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* ── Lista de Archivos ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-panel-muted">
            <RefreshCw size={28} className="animate-spin text-panel-accent mb-2" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-center text-panel-muted border border-dashed border-panel-border rounded-xl">
            <Folder size={36} className="mb-2 opacity-40 text-amber-400" />
            <p className="text-sm font-medium text-white">Esta carpeta está vacía</p>
            <p className="text-xs mt-1">Crea un archivo o sube carpetas para empezar.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-panel-border bg-panel-surface overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-panel-border bg-panel-bg/40 text-xs text-panel-muted font-medium">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3 w-32">Tamaño</th>
                  <th className="px-4 py-3 w-44 hidden md:table-cell">Modificado</th>
                  <th className="px-4 py-3 w-28 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-panel-border">
                {items.map((item) => {
                  const isEditable = !item.isDirectory && EDITABLE_EXTENSIONS.has(item.extension);

                  return (
                    <tr
                      key={item.relativePath}
                      className="hover:bg-panel-hover/60 transition-colors group cursor-pointer"
                      onClick={() => handleOpenFile(item)}
                    >
                      {/* Nombre con icono */}
                      <td className="px-4 py-3 flex items-center gap-3">
                        {getFileIcon(item)}
                        <span className={`font-medium truncate ${item.isDirectory ? 'text-white' : 'text-zinc-300'}`}>
                          {item.name}
                        </span>
                      </td>

                      {/* Tamaño */}
                      <td className="px-4 py-3 text-xs text-panel-muted whitespace-nowrap">
                        {formatSize(item.sizeBytes)}
                      </td>

                      {/* Modificado */}
                      <td className="px-4 py-3 text-xs text-panel-muted whitespace-nowrap hidden md:table-cell">
                        {new Date(item.modifiedAt).toLocaleString()}
                      </td>

                      {/* Botones de acción */}
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {isEditable && (
                            <button
                              onClick={() => handleOpenFile(item)}
                              className="rounded p-1 text-panel-muted hover:text-panel-accent transition-colors"
                              title="Editar archivo"
                            >
                              <Edit3 size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setRenameModal(item);
                              setRenameNewName(item.name);
                            }}
                            className="rounded p-1 text-panel-muted hover:text-white transition-colors"
                            title="Renombrar"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="rounded p-1 text-panel-muted hover:text-red-400 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal de Edición de Archivo ── */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl h-[85vh] flex flex-col rounded-xl border border-panel-border bg-panel-surface shadow-2xl overflow-hidden">
            {/* Cabecera del editor */}
            <div className="flex items-center justify-between border-b border-panel-border px-5 py-3.5 bg-panel-bg/60">
              <div className="flex items-center gap-2">
                <FileCode size={18} className="text-panel-accent" />
                <span className="text-sm font-semibold text-white">
                  Editando: <code className="text-panel-accent">{editingFile.path}</code>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingFile(null)}
                  className="rounded-lg border border-panel-border px-3 py-1.5 text-xs text-panel-muted hover:text-white transition-colors"
                >
                  Cerrar
                </button>
                <button
                  onClick={handleSaveFile}
                  disabled={savingContent}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-panel-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {savingContent ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" /> Guardando...
                    </>
                  ) : (
                    <>
                      <Save size={13} /> Guardar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Contenido del editor */}
            <div className="flex-1 p-4 overflow-hidden">
              {loadingContent ? (
                <div className="flex h-full items-center justify-center text-panel-muted">
                  <RefreshCw size={32} className="animate-spin text-panel-accent" />
                </div>
              ) : (
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full rounded-lg border border-panel-border bg-panel-bg p-4 font-mono text-sm leading-relaxed text-zinc-200 outline-none resize-none focus:border-panel-accent/50"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Crear Archivo / Carpeta ── */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-panel-border bg-panel-surface p-5 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              {createModal.isDirectory ? <FolderPlus size={18} /> : <Plus size={18} />}
              {createModal.isDirectory ? 'Nueva Carpeta' : 'Nuevo Archivo'}
            </h3>
            <p className="text-xs text-panel-muted mt-1">
              En: <code className="text-zinc-400">/{currentPath || 'raíz'}</code>
            </p>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={createModal.isDirectory ? 'ej: scripts' : 'ej: motd.txt'}
                autoFocus
                className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModal(null);
                    setCreateName('');
                  }}
                  className="rounded-lg border border-panel-border px-3 py-1.5 text-xs text-panel-muted hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!createName.trim()}
                  className="rounded-lg bg-panel-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal de Renombrar ── */}
      {renameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-panel-border bg-panel-surface p-5 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit3 size={18} /> Renombrar
            </h3>
            <p className="text-xs text-panel-muted mt-1 truncate">
              {renameModal.name}
            </p>

            <form onSubmit={handleRename} className="mt-4 space-y-4">
              <input
                type="text"
                value={renameNewName}
                onChange={(e) => setRenameNewName(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-panel-border bg-panel-bg px-3 py-2 text-sm text-white outline-none focus:border-panel-accent/50"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRenameModal(null);
                    setRenameNewName('');
                  }}
                  className="rounded-lg border border-panel-border px-3 py-1.5 text-xs text-panel-muted hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!renameNewName.trim() || renameNewName === renameModal.name}
                  className="rounded-lg bg-panel-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
