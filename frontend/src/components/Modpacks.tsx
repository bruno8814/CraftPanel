// ============================================================
// Modpacks.tsx — Gestor y Catálogo de Modpacks (.mrpack / Modrinth)
// ============================================================
// Permite:
// 1. Explorar el catálogo oficial de modpacks en Modrinth
// 2. Instalar modpacks completos con 1 clic (.mrpack oficial)
// 3. Subir archivos .mrpack manualmente desde el PC o vía URL
// 4. Ver y gestionar el modpack actualmente instalado en el servidor
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Download,
  Check,
  RefreshCw,
  Package,
  Layers,
  Upload,
  Link as LinkIcon,
  X,
  ExternalLink,
  Trash2,
  AlertTriangle,
  SlidersHorizontal,
  FolderDown,
  Sparkles,
} from 'lucide-react';
import {
  ServerState,
  InstalledModpackInfo,
  ModrinthSearchResult,
  ModrinthVersion,
} from '../types';
import { api } from '../api/client';

interface Props {
  server: ServerState;
  onRefresh?: () => void;
}

export default function Modpacks({ server }: Props) {
  const { config } = server;

  // Pestaña activa: 'catalog' o 'installed'
  const [activeTab, setActiveTab] = useState<'catalog' | 'installed'>('catalog');

  // Filtros de búsqueda
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedLoader, setSelectedLoader] = useState<string>('auto');
  const [selectedVersion, setSelectedVersion] = useState<string>('server');

  // Estado del catálogo
  const [catalogItems, setCatalogItems] = useState<ModrinthSearchResult[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Modpack instalado
  const [installedModpack, setInstalledModpack] = useState<InstalledModpackInfo | null>(null);
  const [loadingInstalled, setLoadingInstalled] = useState(false);
  const [deletingInstalled, setDeletingInstalled] = useState(false);

  // Modal de instalación con selección de versión
  const [installModalItem, setInstallModalItem] = useState<ModrinthSearchResult | null>(null);
  const [itemVersions, setItemVersions] = useState<ModrinthVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState<string>('');

  // Modales de subida y URL
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlDownloading, setUrlDownloading] = useState(false);

  // Notificaciones
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  // ── Cargar modpack actualmente instalado ──
  const fetchInstalledModpack = useCallback(async () => {
    setLoadingInstalled(true);
    try {
      const data = await api.getInstalledModpack(config.id);
      setInstalledModpack(data);
    } catch (err) {
      console.error('Error al cargar modpack instalado:', err);
    } finally {
      setLoadingInstalled(false);
    }
  }, [config.id]);

  useEffect(() => {
    fetchInstalledModpack();
  }, [fetchInstalledModpack]);

  // ── Buscar modpacks en el catálogo de Modrinth ──
  const searchModpacks = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      let loader = selectedLoader === 'auto' ? config.software.toLowerCase() : selectedLoader;
      if (loader === 'vanilla' || loader === 'all' || loader === 'paper') loader = '';

      const versionParam = selectedVersion === 'server' ? config.version : undefined;

      const res = await api.searchWorkshop({
        query: query.trim() ? (selectedCategory ? `${query} ${selectedCategory}` : query) : selectedCategory || '',
        type: 'modpack',
        version: versionParam,
        loader: loader || undefined,
        limit: 24,
      });

      setCatalogItems(res.hits || []);
    } catch (err: any) {
      console.error('Error al consultar modpacks en Modrinth:', err);
      showNotification('error', `Error al consultar Modrinth: ${err.message}`);
    } finally {
      setLoadingCatalog(false);
    }
  }, [query, selectedCategory, selectedLoader, selectedVersion, config.software, config.version]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchModpacks();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchModpacks]);

  // ── Abrir modal de instalación de un modpack ──
  const handleOpenInstallModal = async (item: ModrinthSearchResult) => {
    setInstallModalItem(item);
    setLoadingVersions(true);
    setItemVersions([]);
    setSelectedVersionId('');
    setInstallStatus('');

    try {
      let loader = selectedLoader === 'auto' ? config.software.toLowerCase() : selectedLoader;
      if (loader === 'vanilla' || loader === 'all' || loader === 'paper') loader = '';
      const versionParam = selectedVersion === 'server' ? config.version : undefined;

      const versions = await api.getProjectVersions(item.slug, {
        version: versionParam,
        loader: loader || undefined,
      });

      setItemVersions(versions || []);
      if (versions && versions.length > 0) {
        setSelectedVersionId(versions[0].id);
      }
    } catch (err: any) {
      showNotification('error', `Error al obtener versiones del modpack: ${err.message}`);
    } finally {
      setLoadingVersions(false);
    }
  };

  // ── Ejecutar instalación desde Modrinth ──
  const handleConfirmInstall = async () => {
    if (!installModalItem || !selectedVersionId) return;

    const chosenVersion = itemVersions.find((v) => v.id === selectedVersionId) || itemVersions[0];
    if (!chosenVersion) return;

    const mrpackFile = chosenVersion.files.find((f) => f.filename.endsWith('.mrpack')) || chosenVersion.files[0];
    if (!mrpackFile) {
      showNotification('error', 'Esta versión no incluye archivo .mrpack compatible.');
      return;
    }

    setIsInstalling(true);
    setInstallStatus('Descargando archivo .mrpack e instalando mods del servidor...');

    try {
      await api.installModpack(config.id, {
        downloadUrl: mrpackFile.url,
        name: installModalItem.title,
        version: chosenVersion.version_number,
        iconUrl: installModalItem.icon_url || undefined,
        summary: installModalItem.description,
      });

      showNotification('success', `¡Modpack "${installModalItem.title}" instalado con éxito!`);
      setInstallModalItem(null);
      await fetchInstalledModpack();
      setActiveTab('installed');
    } catch (err: any) {
      showNotification('error', `Fallo al instalar modpack: ${err.message}`);
    } finally {
      setIsInstalling(false);
      setInstallStatus('');
    }
  };

  // ── Subir archivo .mrpack manualmente ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.mrpack') && !file.name.endsWith('.zip')) {
      showNotification('error', 'Por favor selecciona un archivo con extensión .mrpack');
      return;
    }

    setUploading(true);
    try {
      const res = await api.uploadModpack(config.id, file);
      showNotification('success', `¡Modpack "${res.name}" subido e instalado correctamente!`);
      setShowUploadModal(false);
      await fetchInstalledModpack();
      setActiveTab('installed');
    } catch (err: any) {
      showNotification('error', `Error al subir modpack: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Instalar desde URL directa ──
  const handleUrlInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setUrlDownloading(true);
    try {
      const urlParsed = new URL(urlInput.trim());
      const rawName = urlParsed.pathname.split('/').pop() || 'modpack.mrpack';
      const cleanName = rawName.replace(/\.mrpack$/i, '');

      await api.installModpack(config.id, {
        downloadUrl: urlInput.trim(),
        name: cleanName,
        version: 'Manual URL',
      });

      showNotification('success', `¡Modpack instalado correctamente desde la URL!`);
      setUrlInput('');
      setShowUrlModal(false);
      await fetchInstalledModpack();
      setActiveTab('installed');
    } catch (err: any) {
      showNotification('error', `Error al instalar desde URL: ${err.message}`);
    } finally {
      setUrlDownloading(false);
    }
  };

  // ── Desinstalar / borrar registro del modpack ──
  const handleUninstall = async () => {
    if (!confirm('¿Deseas desvincular el modpack actual? Esto eliminará la información del modpack registrado (los mods existentes en la carpeta mods/ permanecerán a menos que los borres en el Gestor de Archivos).')) {
      return;
    }

    setDeletingInstalled(true);
    try {
      await api.uninstallModpack(config.id);
      showNotification('success', 'Registro del modpack eliminado con éxito.');
      setInstalledModpack(null);
    } catch (err: any) {
      showNotification('error', `Error al desinstalar modpack: ${err.message}`);
    } finally {
      setDeletingInstalled(false);
    }
  };

  const categories = [
    { id: '', label: 'Todas las categorías' },
    { id: 'adventure', label: '⚔️ Aventura' },
    { id: 'technology', label: '⚙️ Tecnología' },
    { id: 'magic', label: '✨ Magia' },
    { id: 'optimization', label: '🚀 Optimización' },
    { id: 'rpg', label: '🛡️ RPG' },
    { id: 'quests', label: '📜 Misiones' },
    { id: 'kitchen-sink', label: '🍲 Variados (Kitchen Sink)' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0d1117]">
      {/* ── Banner de Notificación ── */}
      {notification && (
        <div
          className={`px-4 py-2.5 text-xs font-medium flex items-center justify-between transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 border-b border-emerald-500/30 text-emerald-200'
              : 'bg-red-950/80 border-b border-red-500/30 text-red-200'
          }`}
        >
          <span>{notification.text}</span>
          <button onClick={() => setNotification(null)} className="hover:opacity-75">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Cabecera y Barra de Pestañas ── */}
      <div className="border-b border-[#30363d] bg-[#161b22] px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Package size={20} className="text-emerald-400" />
              <h2 className="text-lg font-bold text-white tracking-wide">
                Catálogo de Modpacks
              </h2>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Modrinth .mrpack
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Explora, descarga e instala modpacks completos en tu servidor con configuraciones optimizadas.
            </p>
          </div>

          {/* Acciones manuales de modpack */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#30363d] bg-[#21262d] text-xs font-medium text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            >
              <Upload size={14} />
              <span>Subir .mrpack</span>
            </button>
            <button
              onClick={() => setShowUrlModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#30363d] bg-[#21262d] text-xs font-medium text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            >
              <LinkIcon size={14} />
              <span>Instalar por URL</span>
            </button>
          </div>
        </div>

        {/* Pestañas de navegación */}
        <div className="flex items-center gap-4 mt-4 border-t border-[#30363d]/60 pt-3">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`inline-flex items-center gap-2 text-xs font-semibold pb-1 border-b-2 transition-colors ${
              activeTab === 'catalog'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers size={14} />
            <span>Explorar Catálogo</span>
          </button>

          <button
            onClick={() => setActiveTab('installed')}
            className={`inline-flex items-center gap-2 text-xs font-semibold pb-1 border-b-2 transition-colors ${
              activeTab === 'installed'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Package size={14} />
            <span>Modpack Instalado</span>
            {installedModpack && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>
        </div>
      </div>

      {/* ── CONTENIDO PRINCIPAL: CATÁLOGO ── */}
      {activeTab === 'catalog' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filtros de Catálogo */}
          <div className="px-6 py-3 border-b border-[#30363d] bg-[#161b22]/50 flex flex-wrap items-center gap-3">
            {/* Buscador */}
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar modpack (ej: Cobblemon, All the Mods, Better MC)..."
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Categoría */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            {/* Loader */}
            <select
              value={selectedLoader}
              onChange={(e) => setSelectedLoader(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="auto">Loader: {config.software} (Auto)</option>
              <option value="fabric">Fabric</option>
              <option value="forge">Forge</option>
              <option value="neoforge">NeoForge</option>
              <option value="all">Todos los loaders</option>
            </select>

            {/* Versión de Minecraft */}
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="server">Minecraft: {config.version} (Servidor)</option>
              <option value="all">Cualquier versión</option>
            </select>

            {/* Botón refrescar */}
            <button
              onClick={() => searchModpacks()}
              disabled={loadingCatalog}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg border border-[#30363d] bg-[#0d1117] transition-colors disabled:opacity-50"
              title="Actualizar catálogo"
            >
              <RefreshCw size={14} className={loadingCatalog ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Grilla de Modpacks */}
          <div className="flex-1 overflow-y-auto p-6">
            {loadingCatalog ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <RefreshCw size={28} className="animate-spin text-emerald-400 mb-3" />
                <p className="text-xs">Consultando modpacks en Modrinth...</p>
              </div>
            ) : catalogItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Package size={36} className="text-gray-600 mb-3" />
                <h3 className="text-sm font-semibold text-gray-300">No se encontraron modpacks</h3>
                <p className="text-xs text-gray-500 max-w-sm mt-1">
                  Intenta cambiar los filtros de loader, versión de Minecraft o simplificar los términos de búsqueda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalogItems.map((item) => (
                  <div
                    key={item.slug}
                    className="flex flex-col justify-between rounded-xl border border-[#30363d] bg-[#161b22] p-4 hover:border-emerald-500/40 transition-all shadow-sm"
                  >
                    <div>
                      {/* Cabecera de la tarjeta: Icono y Nombre */}
                      <div className="flex items-start gap-3">
                        {item.icon_url ? (
                          <img
                            src={item.icon_url}
                            alt={item.title}
                            className="w-12 h-12 rounded-lg object-cover bg-black/40 border border-[#30363d] shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                            <Package size={22} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-white truncate hover:text-emerald-400 transition-colors">
                            {item.title}
                          </h3>
                          <p className="text-[11px] text-gray-400">por {item.author}</p>
                        </div>
                      </div>

                      {/* Descripción */}
                      <p className="text-xs text-gray-300 line-clamp-2 mt-3 leading-relaxed">
                        {item.description}
                      </p>

                      {/* Categorías */}
                      <div className="flex flex-wrap gap-1 mt-3">
                        {item.categories.slice(0, 3).map((cat) => (
                          <span
                            key={cat}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-[#21262d] text-gray-400 border border-[#30363d]"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Pie de la tarjeta: Métricas y Botón de Instalación */}
                    <div className="mt-4 pt-3 border-t border-[#30363d]/60 flex items-center justify-between">
                      <div className="text-[11px] text-gray-400 flex items-center gap-1.5 font-mono">
                        <FolderDown size={13} className="text-gray-500" />
                        <span>{item.downloads.toLocaleString()} descargas</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`https://modrinth.com/modpack/${item.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#21262d] transition-colors"
                          title="Ver en Modrinth"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          onClick={() => handleOpenInstallModal(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm"
                        >
                          <Download size={13} />
                          <span>Instalar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CONTENIDO PRINCIPAL: MODPACK INSTALADO ── */}
      {activeTab === 'installed' && (
        <div className="flex-1 overflow-y-auto p-6">
          {loadingInstalled ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <RefreshCw size={28} className="animate-spin text-emerald-400 mb-3" />
              <p className="text-xs">Consultando modpack del servidor...</p>
            </div>
          ) : installedModpack ? (
            <div className="max-w-2xl mx-auto rounded-xl border border-emerald-500/30 bg-[#161b22] p-6 shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  {installedModpack.iconUrl ? (
                    <img
                      src={installedModpack.iconUrl}
                      alt={installedModpack.name}
                      className="w-16 h-16 rounded-xl object-cover border border-[#30363d]"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Package size={32} />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                        Modpack Activo
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white mt-1">
                      {installedModpack.name}
                    </h3>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">
                      Versión: {installedModpack.version} &bull; Instalado:{' '}
                      {new Date(installedModpack.installedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleUninstall}
                  disabled={deletingInstalled}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-950/30 text-red-300 hover:bg-red-900/40 text-xs font-medium transition-colors disabled:opacity-50"
                  title="Desvincular modpack"
                >
                  <Trash2 size={14} />
                  <span>Desvincular</span>
                </button>
              </div>

              {installedModpack.summary && (
                <p className="text-xs text-gray-300 mt-4 leading-relaxed bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
                  {installedModpack.summary}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[#30363d]">
                <div className="bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
                  <span className="text-[11px] text-gray-400 block">Archivos instalados</span>
                  <span className="text-base font-bold text-white font-mono mt-0.5 block">
                    {installedModpack.filesCount} elementos
                  </span>
                </div>
                <div className="bg-[#0d1117] p-3 rounded-lg border border-[#30363d]">
                  <span className="text-[11px] text-gray-400 block">Software compatible</span>
                  <span className="text-base font-bold text-emerald-400 font-mono mt-0.5 block">
                    {config.software} {config.version}
                  </span>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-[#21262d]/50 border border-[#30363d] flex items-center justify-between text-xs text-gray-300">
                <span>¿Deseas cambiar de modpack o actualizarlo?</span>
                <button
                  onClick={() => setActiveTab('catalog')}
                  className="text-emerald-400 hover:underline font-semibold"
                >
                  Explorar otras versiones &rarr;
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center max-w-md mx-auto">
              <Package size={40} className="text-gray-600 mb-3" />
              <h3 className="text-base font-bold text-white">No hay ningún modpack instalado</h3>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Tu servidor actualmente no tiene un modpack registrado. Puedes elegir uno del catálogo oficial o subir tu archivo .mrpack.
              </p>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => setActiveTab('catalog')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                >
                  <Search size={14} />
                  <span>Explorar Catálogo</span>
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#30363d] bg-[#21262d] text-white text-xs font-semibold hover:border-gray-500 transition-colors"
                >
                  <Upload size={14} />
                  <span>Subir .mrpack</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: Confirmar instalación de Modpack ── */}
      {installModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#30363d] bg-[#161b22] p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {installModalItem.icon_url ? (
                  <img
                    src={installModalItem.icon_url}
                    alt={installModalItem.title}
                    className="w-12 h-12 rounded-xl object-cover border border-[#30363d]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Package size={24} />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-white">
                    Instalar {installModalItem.title}
                  </h3>
                  <p className="text-xs text-gray-400">Selecciona la versión compatible para tu servidor</p>
                </div>
              </div>
              <button
                onClick={() => !isInstalling && setInstallModalItem(null)}
                disabled={isInstalling}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Aviso de advertencia */}
            <div className="mt-4 p-3 rounded-lg bg-amber-950/40 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <span>
                Instalar un modpack descargará los mods y configuraciones del creador. Se sugiere generar un backup antes de proceder.
              </span>
            </div>

            {/* Selector de versión */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-gray-300 block mb-1.5">
                Versión del modpack:
              </label>
              {loadingVersions ? (
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] flex items-center gap-2 text-xs text-gray-400">
                  <RefreshCw size={14} className="animate-spin text-emerald-400" />
                  <span>Buscando versiones compatibles...</span>
                </div>
              ) : itemVersions.length === 0 ? (
                <div className="p-3 bg-red-950/30 rounded-lg border border-red-500/30 text-xs text-red-300">
                  No se encontraron versiones de este modpack con archivo .mrpack para {config.software} {config.version}.
                </div>
              ) : (
                <select
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  disabled={isInstalling}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {itemVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_number} ({v.version_type}) &bull; MC: {v.game_versions.join(', ')}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Estado en vivo durante la instalación */}
            {isInstalling && (
              <div className="mt-4 p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-lg flex items-center gap-3">
                <RefreshCw size={18} className="animate-spin text-emerald-400 shrink-0" />
                <div className="text-xs text-emerald-200 min-w-0">
                  <span className="font-semibold block">Procesando instalación...</span>
                  <span className="text-emerald-400/80 truncate block">{installStatus}</span>
                </div>
              </div>
            )}

            {/* Botones de acción */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setInstallModalItem(null)}
                disabled={isInstalling}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmInstall}
                disabled={isInstalling || itemVersions.length === 0 || !selectedVersionId}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 shadow-md"
              >
                {isInstalling ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Instalando...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Confirmar e Instalar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Subir archivo .mrpack ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#30363d] bg-[#161b22] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363d]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Upload size={16} className="text-emerald-400" />
                <span>Subir archivo de Modpack (.mrpack)</span>
              </h3>
              <button
                onClick={() => !uploading && setShowUploadModal(false)}
                disabled={uploading}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4">
              <input
                type="file"
                ref={fileInputRef}
                accept=".mrpack,.zip"
                onChange={handleFileUpload}
                className="hidden"
                id="mrpackFileInput"
              />
              <label
                htmlFor="mrpackFileInput"
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
                  uploading
                    ? 'border-emerald-500/50 bg-emerald-950/20'
                    : 'border-[#30363d] hover:border-emerald-500/50 bg-[#0d1117]'
                }`}
              >
                {uploading ? (
                  <RefreshCw size={32} className="text-emerald-400 animate-spin mb-2" />
                ) : (
                  <FolderDown size={32} className="text-gray-400 mb-2" />
                )}
                <span className="text-xs font-semibold text-white">
                  {uploading ? 'Instalando modpack...' : 'Haz clic para seleccionar o arrastra un archivo .mrpack'}
                </span>
                <span className="text-[11px] text-gray-400 mt-1">
                  Formatos soportados: Modrinth Modpack (.mrpack)
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Instalar desde URL directa ── */}
      {showUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#30363d] bg-[#161b22] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#30363d]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <LinkIcon size={16} className="text-emerald-400" />
                <span>Instalar Modpack desde URL directa</span>
              </h3>
              <button
                onClick={() => !urlDownloading && setShowUrlModal(false)}
                disabled={urlDownloading}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUrlInstall} className="mt-4">
              <label className="text-xs font-semibold text-gray-300 block mb-1">
                URL del archivo .mrpack:
              </label>
              <input
                type="url"
                required
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://cdn.modrinth.com/data/.../modpack.mrpack"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowUrlModal(false)}
                  disabled={urlDownloading}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={urlDownloading || !urlInput.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {urlDownloading ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Instalando...</span>
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      <span>Descargar e Instalar</span>
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
