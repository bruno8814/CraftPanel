// ============================================================
// Workshop.tsx — La Workshop integrada (Mods y Plugins)
// ============================================================
// Permite:
// 1. Explorar el catálogo oficial de Modrinth con filtros de versión
// 2. Instalar mods o plugins en 1 clic directamente al servidor
// 3. Gestionar los mods/plugins instalados (activar/desactivar/eliminar)
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Download,
  Check,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Sparkles,
  Layers,
  FolderDown,
  ExternalLink,
  Package,
  Upload,
  Link as LinkIcon,
  X,
  FileArchive,
  Globe,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ServerState,
  InstalledAddon,
  ModrinthSearchResult,
} from '../types';
import { api } from '../api/client';

interface Props {
  server: ServerState;
  addonType: 'mods' | 'plugins';
}

export default function Workshop({ server, addonType }: Props) {
  const { config } = server;

  // Pestaña activa: 'catalog' (explorar) o 'installed' (instalados)
  const [activeTab, setActiveTab] = useState<'catalog' | 'installed'>('catalog');

  // Filtros dinámicos de búsqueda
  const [selectedLoader, setSelectedLoader] = useState<string>('auto');
  const [selectedVersion, setSelectedVersion] = useState<string>('server');

  // Estado del catálogo
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [catalogItems, setCatalogItems] = useState<ModrinthSearchResult[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  // Modales de subida y URL
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlDownloading, setUrlDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado de instalados
  const [installedItems, setInstalledItems] = useState<InstalledAddon[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState(false);
  const [togglingFile, setTogglingFile] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  // Mensaje temporal de éxito o error
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // ── Cargar addons instalados ──
  const fetchInstalled = useCallback(async () => {
    setLoadingInstalled(true);
    try {
      const data = await api.getInstalledAddons(config.id, addonType);
      setInstalledItems(data);
    } catch (err: any) {
      console.error('Error al cargar instalados:', err);
    } finally {
      setLoadingInstalled(false);
    }
  }, [config.id, addonType]);

  useEffect(() => {
    fetchInstalled();
  }, [fetchInstalled]);

  // ── Buscar en el catálogo de Modrinth ──
  const searchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      // Determinar el loader adecuado para la búsqueda según el selector dinámico
      let loader = selectedLoader === 'auto' ? config.software.toLowerCase() : selectedLoader;
      if (loader === 'paper') loader = 'paper';
      if (loader === 'vanilla' || loader === 'all') loader = '';

      const versionParam = selectedVersion === 'server' ? config.version : undefined;
      const projectType = addonType === 'plugins' ? 'plugin' : 'mod';

      const res = await api.searchWorkshop({
        query: query.trim() ? (categoryFilter ? `${query} ${categoryFilter}` : query) : categoryFilter || '',
        type: projectType,
        version: versionParam,
        loader: loader || undefined,
        limit: 24,
      });

      setCatalogItems(res.hits || []);
    } catch (err: any) {
      console.error('Error al buscar en catálogo:', err);
      showNotification('error', `Error al consultar la Workshop: ${err.message}`);
    } finally {
      setLoadingCatalog(false);
    }
  }, [query, categoryFilter, config.software, config.version, addonType, selectedLoader, selectedVersion]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchCatalog();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchCatalog]);

  // ── Comprobar si un mod ya está instalado ──
  const isInstalled = (item: ModrinthSearchResult) => {
    const cleanSlug = item.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    return installedItems.some((inst) => {
      const instClean = inst.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return instClean.includes(cleanSlug) || cleanSlug.includes(instClean);
    });
  };

  // ── Instalar un mod o plugin con 1 clic ──
  const handleInstall = async (item: ModrinthSearchResult) => {
    setInstallingSlug(item.slug);
    try {
      let loader = selectedLoader === 'auto' ? config.software.toLowerCase() : selectedLoader;
      if (loader === 'vanilla' || loader === 'all') loader = '';

      const versionParam = selectedVersion === 'server' ? config.version : undefined;

      // Obtener las versiones compatibles del mod
      const versions = await api.getProjectVersions(item.slug, {
        version: versionParam,
        loader: loader || undefined,
      });

      if (!versions || versions.length === 0) {
        throw new Error(
          `No se encontró ninguna versión compatible de ${item.title} para ${loader || config.software} ${versionParam || ''}. Prueba a cambiar el filtro de loader a Forge/Todos o subir el .jar manualmente.`
        );
      }

      // Tomar el primer build compatible (el más reciente)
      const latestVersion = versions[0];
      const primaryFile = latestVersion.files.find((f) => f.primary) || latestVersion.files[0];

      if (!primaryFile) {
        throw new Error(`El archivo de descarga no está disponible para ${item.title}.`);
      }

      // Descargar e instalar en la carpeta del servidor
      await api.installAddon(config.id, addonType, {
        downloadUrl: primaryFile.url,
        filename: primaryFile.filename,
      });

      showNotification('success', `¡${item.title} se instaló correctamente!`);
      await fetchInstalled();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setInstallingSlug(null);
    }
  };

  // ── Subir archivo .jar o .zip directamente (Drag & Drop o explorador) ──
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.jar') && !file.name.endsWith('.zip')) {
      showNotification('error', 'Solo se permiten archivos de extensión .jar o .zip');
      return;
    }

    setUploading(true);
    try {
      const res = await api.uploadAddon(config.id, addonType, file);
      showNotification('success', res.message || `¡${file.name} subido e instalado!`);
      setShowUploadModal(false);
      await fetchInstalled();
      setActiveTab('installed');
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Instalar desde URL directa (CurseForge CDN, GitHub, etc.) ──
  const handleUrlInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setUrlDownloading(true);
    try {
      const res = await api.installAddonByUrl(config.id, addonType, { url: urlInput.trim() });
      showNotification('success', res.message || 'Addon descargado e instalado correctamente.');
      setShowUrlModal(false);
      setUrlInput('');
      await fetchInstalled();
      setActiveTab('installed');
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setUrlDownloading(false);
    }
  };

  // ── Activar o desactivar un addon instalado ──
  const handleToggle = async (filename: string) => {
    setTogglingFile(filename);
    try {
      await api.toggleAddon(config.id, addonType, filename);
      await fetchInstalled();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setTogglingFile(null);
    }
  };

  // ── Desinstalar / eliminar un addon ──
  const handleDelete = async (filename: string) => {
    if (!confirm(`¿Eliminar definitivamente "${filename}"?`)) return;
    setDeletingFile(filename);
    try {
      await api.uninstallAddon(config.id, addonType, filename);
      showNotification('success', `"${filename}" ha sido eliminado.`);
      await fetchInstalled();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setDeletingFile(null);
    }
  };

  // Filtros rápidos de categorías populares
  const quickCategories = addonType === 'mods'
    ? [
        { label: 'Todos', value: '' },
        { label: '⚡ Optimización', value: 'optimization' },
        { label: '🛠️ Utilidad', value: 'utility' },
        { label: '🏰 Aventura', value: 'adventure' },
        { label: '🪄 Magia', value: 'magic' },
        { label: '⚙️ Tecnología', value: 'technology' },
        { label: '🪑 Decoración', value: 'decoration' },
      ]
    : [
        { label: 'Todos', value: '' },
        { label: '🛡️ Administración', value: 'management' },
        { label: '🔒 Seguridad', value: 'security' },
        { label: '💰 Economía', value: 'economy' },
        { label: '🌍 Mundos', value: 'world' },
        { label: '⚡ Utilidad', value: 'utility' },
      ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-panel-bg">
      {/* ── Barra superior: Título, tabs y contexto ── */}
      <div className="border-b border-panel-border bg-panel-surface/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {addonType === 'mods' ? <Sparkles size={20} className="text-panel-accent" /> : <Layers size={20} className="text-panel-accent" />}
              {addonType === 'mods' ? 'Workshop de Mods' : 'Gestor de Plugins'}
            </h2>
            <span className="rounded-full bg-panel-accent/10 text-panel-accent border border-panel-accent/20 px-2.5 py-0.5 text-xs font-semibold">
              {config.software.toUpperCase()} {config.version}
            </span>
          </div>
          <p className="text-xs text-panel-muted mt-0.5">
            Explora e instala directamente en la carpeta <code className="text-zinc-400">/{addonType}</code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Pestañas */}
          <div className="flex items-center gap-1 rounded-lg border border-panel-border bg-panel-bg p-1 text-sm">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                activeTab === 'catalog'
                  ? 'bg-panel-accent text-white shadow'
                  : 'text-panel-muted hover:text-white'
              }`}
            >
              <Search size={14} /> Explorar Catálogo
            </button>
            <button
              onClick={() => setActiveTab('installed')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                activeTab === 'installed'
                  ? 'bg-panel-accent text-white shadow'
                  : 'text-panel-muted hover:text-white'
              }`}
            >
              <FolderDown size={14} /> Instalados ({installedItems.length})
            </button>
          </div>

          {/* Botones de acción manual / CurseForge */}
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-panel-border bg-panel-surface px-3 py-1.5 text-xs font-medium text-panel-muted hover:text-white hover:border-panel-accent/40 transition-colors"
            title="Subir archivo .jar descargado de CurseForge u otra fuente"
          >
            <Upload size={13} className="text-panel-accent" /> Subir .jar
          </button>
          <button
            onClick={() => setShowUrlModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-panel-border bg-panel-surface px-3 py-1.5 text-xs font-medium text-panel-muted hover:text-white hover:border-panel-accent/40 transition-colors"
            title="Descargar directamente pegando un enlace URL"
          >
            <LinkIcon size={13} className="text-panel-accent" /> Instalar por URL
          </button>
        </div>
      </div>

      {/* ── Banner de Notificación ── */}
      {notification && (
        <div
          className={`px-6 py-2.5 text-sm font-medium transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border-b border-red-500/20'
          }`}
        >
          {notification.text}
        </div>
      )}

      {/* ── Contenido de la pestaña "Explorar Catálogo" ── */}
      {activeTab === 'catalog' && (
        <div className="flex-1 flex flex-col overflow-hidden p-6">
          {/* Barra de búsqueda y filtros dinámicos */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 mb-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-panel-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar ${addonType === 'mods' ? 'mods (ej: Create, JEI, Waystones, Sodium)...' : 'plugins (ej: LuckPerms, Essentials)...'}`}
                className="w-full rounded-xl border border-panel-border bg-panel-surface pl-10 pr-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-panel-accent/60 transition-colors"
              />
            </div>

            {/* Selector dinámico de Loader */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedLoader}
                onChange={(e) => setSelectedLoader(e.target.value)}
                className="rounded-xl border border-panel-border bg-panel-surface px-3 py-2.5 text-xs text-white outline-none focus:border-panel-accent/60 transition-colors"
                title="Filtrar por loader de mod"
              >
                <option value="auto">Loader: Auto ({config.software})</option>
                <option value="neoforge">⚡ NeoForge</option>
                <option value="forge">🔨 Forge</option>
                <option value="fabric">🧵 Fabric</option>
                <option value="paper">📄 Paper / Spigot</option>
                <option value="all">🌐 Todos (Sin filtro)</option>
              </select>

              {/* Selector dinámico de Versión */}
              <select
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                className="rounded-xl border border-panel-border bg-panel-surface px-3 py-2.5 text-xs text-white outline-none focus:border-panel-accent/60 transition-colors"
                title="Filtrar por versión de Minecraft"
              >
                <option value="server">Versión: MC {config.version}</option>
                <option value="all">Todas las versiones</option>
              </select>

              <button
                onClick={searchCatalog}
                disabled={loadingCatalog}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-panel-border bg-panel-surface px-4 py-2.5 text-sm font-medium text-panel-muted hover:text-white hover:border-panel-accent/40 transition-colors"
              >
                <RefreshCw size={14} className={loadingCatalog ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Aviso / Sugerencia CurseForge */}
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 truncate">
              <span className="text-amber-400 font-semibold flex-shrink-0">💡 Respaldo CurseForge:</span>
              <span className="truncate">Si buscas un mod exclusivo de CurseForge, descárgalo y usa <b>«Subir .jar»</b> o pega el enlace con <b>«Instalar por URL»</b>.</span>
            </div>
            <a
              href={`https://www.curseforge.com/minecraft/mc-mods/search?search=${encodeURIComponent(query || 'create')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline flex-shrink-0"
            >
              Buscar en CurseForge <ExternalLink size={11} />
            </a>
          </div>

          {/* Categorías rápidas */}
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
            {quickCategories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(cat.value)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  categoryFilter === cat.value
                    ? 'bg-panel-accent/20 text-panel-accent border border-panel-accent/40'
                    : 'bg-panel-surface text-panel-muted hover:bg-panel-hover hover:text-white border border-panel-border'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Grid de resultados */}
          <div className="flex-1 overflow-y-auto pr-1">
            {loadingCatalog ? (
              <div className="flex h-64 flex-col items-center justify-center text-panel-muted">
                <RefreshCw size={32} className="animate-spin text-panel-accent mb-3" />
                <p className="text-sm">Buscando en Modrinth para {config.software} {config.version}...</p>
              </div>
            ) : catalogItems.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-panel-muted">
                <Package size={40} className="mb-2 opacity-50" />
                <p className="text-base font-medium text-white">No se encontraron resultados</p>
                <p className="text-xs mt-1">Prueba con otro término de búsqueda o limpia los filtros.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {catalogItems.map((item) => {
                  const installed = isInstalled(item);
                  const isInstallingThis = installingSlug === item.slug;

                  return (
                    <div
                      key={item.slug}
                      className="flex flex-col justify-between rounded-xl border border-panel-border bg-panel-surface p-4 hover:border-panel-accent/30 transition-all group"
                    >
                      <div>
                        {/* Cabecera de la tarjeta: Icono + Título + Autor */}
                        <div className="flex items-start gap-3">
                          {item.icon_url ? (
                            <img
                              src={item.icon_url}
                              alt={item.title}
                              className="w-12 h-12 rounded-lg object-cover bg-panel-bg flex-shrink-0 border border-panel-border"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-panel-bg flex items-center justify-center flex-shrink-0 border border-panel-border text-panel-muted">
                              <Package size={24} />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <h4 className="text-base font-semibold text-white truncate group-hover:text-panel-accent transition-colors">
                              {item.title}
                            </h4>
                            <p className="text-xs text-panel-muted truncate">
                              por <span className="text-zinc-400">{item.author}</span>
                            </p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              {item.downloads.toLocaleString()} descargas
                            </p>
                          </div>
                        </div>

                        {/* Descripción corta */}
                        <p className="mt-3 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                          {item.description || 'Sin descripción disponible.'}
                        </p>
                      </div>

                      {/* Pie de tarjeta: Categorías + Botón Instalar */}
                      <div className="mt-4 pt-3 border-t border-panel-border/80 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 overflow-hidden">
                          {item.categories.slice(0, 2).map((cat) => (
                            <span
                              key={cat}
                              className="rounded bg-panel-bg px-2 py-0.5 text-[10px] text-panel-muted border border-panel-border truncate"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>

                        {installed ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400">
                            <Check size={12} /> Instalado
                          </span>
                        ) : (
                          <button
                            onClick={() => handleInstall(item)}
                            disabled={isInstallingThis}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-panel-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors shadow-sm"
                          >
                            {isInstallingThis ? (
                              <>
                                <RefreshCw size={12} className="animate-spin" /> Instalando...
                              </>
                            ) : (
                              <>
                                <Download size={12} /> Instalar
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Contenido de la pestaña "Instalados" ── */}
      {activeTab === 'installed' && (
        <div className="flex-1 flex flex-col overflow-hidden p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              Archivos en <code className="text-panel-accent">/{addonType}</code> ({installedItems.length})
            </h3>
            <button
              onClick={fetchInstalled}
              disabled={loadingInstalled}
              className="inline-flex items-center gap-1 text-xs text-panel-muted hover:text-white transition-colors"
            >
              <RefreshCw size={12} className={loadingInstalled ? 'animate-spin' : ''} /> Recargar lista
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingInstalled ? (
              <div className="flex h-64 items-center justify-center text-panel-muted">
                <RefreshCw size={24} className="animate-spin text-panel-accent" />
              </div>
            ) : installedItems.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-panel-muted border border-dashed border-panel-border rounded-xl">
                <FolderDown size={36} className="mb-2 opacity-40" />
                <p className="text-base font-medium text-white">No tienes {addonType} instalados todavía</p>
                <p className="text-xs mt-1">Explora la pestaña Catálogo para añadir con 1 clic.</p>
                <button
                  onClick={() => setActiveTab('catalog')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-panel-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                >
                  <Search size={12} /> Explorar Catálogo
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {installedItems.map((addon) => {
                  const sizeMB = (addon.sizeBytes / (1024 * 1024)).toFixed(2);
                  const isToggling = togglingFile === addon.filename;
                  const isDeleting = deletingFile === addon.filename;

                  return (
                    <div
                      key={addon.filename}
                      className={`flex items-center justify-between rounded-xl border p-3.5 transition-colors ${
                        addon.enabled
                          ? 'border-panel-border bg-panel-surface'
                          : 'border-panel-border/50 bg-panel-surface/40 opacity-70'
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            addon.enabled ? 'bg-panel-accent/10 text-panel-accent' : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          <Package size={18} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white truncate">
                              {addon.name}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.2 text-[10px] font-medium ${
                                addon.enabled
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                              }`}
                            >
                              {addon.enabled ? 'Activo' : 'Desactivado'}
                            </span>
                          </div>
                          <p className="text-xs text-panel-muted truncate mt-0.5">
                            {addon.filename} · {sizeMB} MB
                          </p>
                        </div>
                      </div>

                      {/* Botones de acción */}
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleToggle(addon.filename)}
                          disabled={isToggling}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            addon.enabled
                              ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                          }`}
                          title={addon.enabled ? 'Desactivar sin borrar' : 'Activar mod'}
                        >
                          {isToggling ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : addon.enabled ? (
                            <>
                              <PowerOff size={12} /> Desactivar
                            </>
                          ) : (
                            <>
                              <Power size={12} /> Activar
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleDelete(addon.filename)}
                          disabled={isDeleting}
                          className="rounded-lg p-1.5 text-panel-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Eliminar archivo"
                        >
                          {isDeleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal de Subida de Archivo .jar (Drag & Drop) ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-panel-border bg-panel-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-panel-border">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Upload size={18} className="text-panel-accent" /> Subir archivo .{addonType === 'mods' ? 'jar (Mod)' : 'jar (Plugin)'}
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-panel-muted hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs text-panel-muted mb-4">
                Arrastra aquí el archivo descargado de <b>CurseForge</b>, GitHub o tu ordenador, o haz clic para seleccionarlo.
              </p>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-panel-border hover:border-panel-accent/60 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-panel-bg/50 group"
              >
                <FileArchive size={40} className="text-panel-muted group-hover:text-panel-accent mb-2 transition-colors" />
                <p className="text-sm font-medium text-white">Haz clic o arrastra tu archivo .jar</p>
                <p className="text-xs text-panel-muted mt-1">Archivos soportados: .jar, .zip</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jar,.zip"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </div>

              {uploading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-panel-accent">
                  <RefreshCw size={14} className="animate-spin" /> Subiendo e instalando en el servidor...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Descarga por URL ── */}
      {showUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-panel-border bg-panel-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-panel-border">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <LinkIcon size={18} className="text-panel-accent" /> Instalar desde Enlace Directo
              </h3>
              <button
                onClick={() => setShowUrlModal(false)}
                className="text-panel-muted hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUrlInstall} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-panel-muted mb-1.5">
                  URL directa del archivo .jar
                </label>
                <input
                  type="url"
                  required
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://ejemplo.com/descargas/mod-1.21.1.jar"
                  className="w-full rounded-xl border border-panel-border bg-panel-bg px-3.5 py-2.5 text-sm text-white outline-none focus:border-panel-accent/60 placeholder:text-zinc-600 transition-colors"
                />
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  Introduce el enlace directo de descarga del archivo .jar (de CurseForge CDN, GitHub Releases, Spigot, etc.).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUrlModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-panel-muted hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={urlDownloading || !urlInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-panel-accent px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {urlDownloading ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" /> Descargando...
                    </>
                  ) : (
                    <>
                      <Download size={13} /> Descargar e Instalar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
