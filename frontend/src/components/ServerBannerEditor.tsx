// ============================================================
// ServerBannerEditor.tsx — Editor de Banner / MOTD e Icono del Servidor
// ============================================================
// Permite personalizar la apariencia del servidor en la lista multijugador
// de Minecraft:
// 1. Vista previa en vivo idéntica a la lista de servidores de Minecraft Java.
// 2. Editor interactivo de MOTD (2 líneas) con paleta de colores (§0-§f) y estilos (§l, §o, etc.).
// 3. Plantillas prediseñadas (Survival, Hardcore, Minijuegos, Mods, RPG).
// 4. Subida y gestión de server-icon.png con auto-escalado a 64x64 píxeles vía Canvas.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Sparkles,
  Palette,
  Wand2,
  RotateCcw,
  Check,
  AlertCircle,
  HelpCircle,
  Wifi,
  AlignHorizontalDistributeCenter,
  Layers,
} from 'lucide-react';
import { ServerState } from '../types';
import { api } from '../api/client';

interface ServerBannerEditorProps {
  server: ServerState;
  motd: string;
  onChangeMotd: (newMotd: string) => void;
  maxPlayers?: number;
}

// ── Paleta oficial de colores de Minecraft ──
interface MinecraftColor {
  code: string;
  name: string;
  hex: string;
  textHex?: string;
}

const MINECRAFT_COLORS: MinecraftColor[] = [
  { code: '0', name: 'Negro', hex: '#000000', textHex: '#ffffff' },
  { code: '1', name: 'Azul Oscuro', hex: '#0000AA', textHex: '#ffffff' },
  { code: '2', name: 'Verde Oscuro', hex: '#00AA00', textHex: '#ffffff' },
  { code: '3', name: 'Aqua Oscuro', hex: '#00AAAA', textHex: '#ffffff' },
  { code: '4', name: 'Rojo Oscuro', hex: '#AA0000', textHex: '#ffffff' },
  { code: '5', name: 'Morado Oscuro', hex: '#AA00AA', textHex: '#ffffff' },
  { code: '6', name: 'Oro / Naranja', hex: '#FFAA00', textHex: '#000000' },
  { code: '7', name: 'Gris Claro', hex: '#AAAAAA', textHex: '#000000' },
  { code: '8', name: 'Gris Oscuro', hex: '#555555', textHex: '#ffffff' },
  { code: '9', name: 'Azul Claro', hex: '#5555FF', textHex: '#ffffff' },
  { code: 'a', name: 'Verde Lima', hex: '#55FF55', textHex: '#000000' },
  { code: 'b', name: 'Celeste / Aqua', hex: '#55FFFF', textHex: '#000000' },
  { code: 'c', name: 'Rojo Claro', hex: '#FF5555', textHex: '#ffffff' },
  { code: 'd', name: 'Rosa / Magenta', hex: '#FF55FF', textHex: '#000000' },
  { code: 'e', name: 'Amarillo', hex: '#FFFF55', textHex: '#000000' },
  { code: 'f', name: 'Blanco', hex: '#FFFFFF', textHex: '#000000' },
];

const MINECRAFT_STYLES = [
  { code: 'l', name: 'Negrita', label: 'B', className: 'font-bold' },
  { code: 'o', name: 'Cursiva', label: 'I', className: 'italic' },
  { code: 'n', name: 'Subrayado', label: 'U', className: 'underline' },
  { code: 'm', name: 'Tachado', label: 'S', className: 'line-through' },
  { code: 'k', name: 'Glitch / Mágico', label: '§k', className: 'tracking-widest' },
  { code: 'r', name: 'Resetear formato', label: 'Reset', className: 'normal' },
];

const SPECIAL_SYMBOLS = [
  '★', '✪', '✦', '⚡', '⚔', '⛏', '♦', '❤', '✔', '✖', '➤', '»', '«', '▶', '◀', '•', '●', '|',
];

const COLOR_MAP: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  'a': '#55FF55',
  'b': '#55FFFF',
  'c': '#FF5555',
  'd': '#FF55FF',
  'e': '#FFFF55',
  'f': '#FFFFFF',
};

// ── Plantillas de banner prediseñadas ──
interface BannerTemplate {
  name: string;
  category: string;
  motd: string;
  desc: string;
}

const PRESET_TEMPLATES: BannerTemplate[] = [
  {
    name: '⚔ Survival Vanilla 1.21',
    category: 'Survival',
    motd: '§a§lMI SERVIDOR §8» §fSurvival Vanilla [1.21]\\n§e✦ ¡Únete a la aventura con amigos! ✦',
    desc: 'Verde lima, blanco y oro clásico.',
  },
  {
    name: '🔥 Hardcore & PvP Extremo',
    category: 'PvP',
    motd: '§c§lHARDCORE PVP §8[§41 Vida§8] §7- §6Temporada 1\\n§f⚔ ¿Serás capaz de sobrevivir a la noche? ⚔',
    desc: 'Rojos intensos y dorados para supervivencia hostil.',
  },
  {
    name: '⚡ Red de Minijuegos',
    category: 'Minijuegos',
    motd: '§6§lMINIGAMES NETWORK §8[§a1.20 - 1.21§8]\\n§b✦ BedWars §7| §aSkyWars §7| §eDuels §7| §dParkour',
    desc: 'Llamativo y colorido para servidores con varios modos.',
  },
  {
    name: '🔮 Aventura Modpack',
    category: 'Modded',
    motd: '§d§lMODDED ADVENTURE §8| §fForge & Fabric\\n§5★ ¡Cientos de mods, magia, tecnología y jefes! ★',
    desc: 'Místico y violeta para servidores con mods.',
  },
  {
    name: '🏰 Reinos & Factions',
    category: 'RPG',
    motd: '§9§lREINOS & IMPERIOS §8» §3¡Forja tu dinastía!\\n§e⚔ Conquistas §7| §6Economía §7| §2Mazmorras',
    desc: 'Tonos medievales, zafiro y oro.',
  },
  {
    name: '✨ Comunidad & Amigos',
    category: 'Casual',
    motd: '§b§lCOMUNIDAD AMIGOS §7- §a¡Servidor Activo!\\n§fPasa un buen rato, construye sin límites :D',
    desc: 'Amistoso, claro y acogedor.',
  },
];

export default function ServerBannerEditor({
  server,
  motd,
  onChangeMotd,
  maxPlayers = 20,
}: ServerBannerEditorProps) {
  // Separamos el MOTD en 2 líneas
  const normalized = (motd || '').replace(/\\n/g, '\n');
  const lines = normalized.split('\n');
  const initialLine1 = lines[0] ?? '';
  const initialLine2 = lines.slice(1).join(' ') ?? '';

  const [line1, setLine1] = useState(initialLine1);
  const [line2, setLine2] = useState(initialLine2);
  const [activeLine, setActiveLine] = useState<1 | 2>(1);

  // Icono del servidor
  const [iconTimestamp, setIconTimestamp] = useState<number>(Date.now());
  const [iconError, setIconError] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputLine1Ref = useRef<HTMLInputElement>(null);
  const inputLine2Ref = useRef<HTMLInputElement>(null);

  // Sincronizar si cambia el prop motd externamente
  useEffect(() => {
    const curNorm = (motd || '').replace(/\\n/g, '\n');
    const curParts = curNorm.split('\n');
    setLine1(curParts[0] ?? '');
    setLine2(curParts.slice(1).join(' ') ?? '');
  }, [motd]);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // Actualizar MOTD padre
  const updateLines = (newLine1: string, newLine2: string) => {
    setLine1(newLine1);
    setLine2(newLine2);
    const combined = newLine2 ? `${newLine1}\\n${newLine2}` : newLine1;
    onChangeMotd(combined);
  };

  // ── Inserción de códigos y símbolos en el cursor ──
  const insertTextAtCursor = (textToInsert: string) => {
    const targetInput = activeLine === 1 ? inputLine1Ref.current : inputLine2Ref.current;
    const currentVal = activeLine === 1 ? line1 : line2;

    if (!targetInput) {
      if (activeLine === 1) updateLines(currentVal + textToInsert, line2);
      else updateLines(line1, currentVal + textToInsert);
      return;
    }

    const start = targetInput.selectionStart ?? currentVal.length;
    const end = targetInput.selectionEnd ?? currentVal.length;
    const nextVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);

    if (activeLine === 1) {
      updateLines(nextVal, line2);
    } else {
      updateLines(line1, nextVal);
    }

    // Restaurar foco y cursor
    setTimeout(() => {
      targetInput.focus();
      targetInput.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    }, 10);
  };

  // ── Herramientas de texto ──
  const handleConvertAmpersandToSection = () => {
    const convert = (str: string) => str.replace(/&([0-9a-fk-or])/gi, '§$1');
    updateLines(convert(line1), convert(line2));
    showStatus('success', 'Códigos & convertidos a § correctamente.');
  };

  const handleStripFormatting = () => {
    const strip = (str: string) => str.replace(/[§&][0-9a-fk-or]/gi, '');
    updateLines(strip(line1), strip(line2));
    showStatus('success', 'Formato eliminado.');
  };

  const handleCenterLine = () => {
    const target = activeLine === 1 ? line1 : line2;
    // Ancho aproximado estándar de la lista de servidores de Minecraft: 55 caracteres
    const plainLength = target.replace(/[§&][0-9a-fk-or]/gi, '').length;
    const spacesNeeded = Math.max(0, Math.floor((52 - plainLength) / 2));
    const padded = ' '.repeat(spacesNeeded) + target.trimStart();
    if (activeLine === 1) updateLines(padded, line2);
    else updateLines(line1, padded);
  };

  // ── Gestión del icono server-icon.png ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingIcon(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Crear canvas 64x64
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsUploadingIcon(false);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Recorte centrado manteniendo relación de aspecto cuadrada (cover)
        const size = Math.min(img.width, img.height);
        const srcX = (img.width - size) / 2;
        const srcY = (img.height - size) / 2;

        ctx.drawImage(img, srcX, srcY, size, size, 0, 0, 64, 64);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            setIsUploadingIcon(false);
            return;
          }
          try {
            await api.uploadServerIcon(server.config.id, blob);
            setIconTimestamp(Date.now());
            setIconError(false);
            showStatus('success', '¡Icono 64x64 subido y aplicado al servidor!');
          } catch (err: any) {
            showStatus('error', `Error al subir el icono: ${err.message}`);
          } finally {
            setIsUploadingIcon(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }, 'image/png');
      };

      img.onerror = () => {
        setIsUploadingIcon(false);
        showStatus('error', 'El archivo seleccionado no es una imagen válida.');
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  };

  const handleDeleteIcon = async () => {
    if (!confirm('¿Eliminar el icono personalizado del servidor? Se usará el icono predeterminado.')) return;
    try {
      setIsUploadingIcon(true);
      await api.deleteServerIcon(server.config.id);
      setIconTimestamp(Date.now());
      setIconError(true);
      showStatus('success', 'Icono eliminado.');
    } catch (err: any) {
      showStatus('error', `Error al eliminar el icono: ${err.message}`);
    } finally {
      setIsUploadingIcon(false);
    }
  };

  // ── Renderizado del texto formateado al estilo Minecraft ──
  const renderMinecraftLine = (rawText: string) => {
    if (!rawText) {
      return <span>&nbsp;</span>;
    }

    const clean = rawText.replace(/\\u00a7/gi, '§');
    const nodes: React.ReactNode[] = [];
    let currentColor = '#AAAAAA'; // Gris por defecto en Minecraft
    let isBold = false;
    let isItalic = false;
    let isUnderline = false;
    let isStrikethrough = false;
    let isObfuscated = false;
    let buffer = '';

    const pushBuffer = () => {
      if (!buffer) return;
      const key = `${nodes.length}-${buffer}`;
      nodes.push(
        <span
          key={key}
          style={{
            color: currentColor,
            fontWeight: isBold ? 'bold' : 'normal',
            fontStyle: isItalic ? 'italic' : 'normal',
            textDecoration: [
              isUnderline ? 'underline' : '',
              isStrikethrough ? 'line-through' : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined,
            textShadow: '1.5px 1.5px 0px rgba(0,0,0,0.85)',
          }}
          className={isObfuscated ? 'animate-pulse font-mono tracking-widest' : ''}
        >
          {buffer}
        </span>
      );
      buffer = '';
    };

    let i = 0;
    while (i < clean.length) {
      const char = clean[i];
      if (char === '§' && i + 1 < clean.length) {
        const code = clean[i + 1].toLowerCase();
        pushBuffer();

        if (code in COLOR_MAP) {
          currentColor = COLOR_MAP[code];
          isBold = false;
          isItalic = false;
          isUnderline = false;
          isStrikethrough = false;
          isObfuscated = false;
        } else if (code === 'l') {
          isBold = true;
        } else if (code === 'o') {
          isItalic = true;
        } else if (code === 'n') {
          isUnderline = true;
        } else if (code === 'm') {
          isStrikethrough = true;
        } else if (code === 'k') {
          isObfuscated = true;
        } else if (code === 'r') {
          currentColor = '#AAAAAA';
          isBold = false;
          isItalic = false;
          isUnderline = false;
          isStrikethrough = false;
          isObfuscated = false;
        } else {
          buffer += char + clean[i + 1];
        }
        i += 2;
      } else {
        buffer += char;
        i++;
      }
    }

    pushBuffer();
    return nodes.length > 0 ? nodes : <span>&nbsp;</span>;
  };

  return (
    <div className="space-y-6">
      {/* ── NOTIFICACIÓN LOCAL ── */}
      {statusMessage && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-xs font-medium border transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-red-500/10 text-red-300 border-red-500/30'
          }`}
        >
          {statusMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* ── 1. VISTA PREVIA MULTIJUGADOR DE MINECRAFT (ESTILO OFICIAL JAVA) ── */}
      <div className="rounded-xl border border-panel-border bg-panel-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-panel-accent" />
            <span className="text-sm font-semibold text-white">Vista Previa en Lista Multijugador</span>
            <span className="rounded bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-400">
              Minecraft Java Edition
            </span>
          </div>
          <span className="text-xs text-panel-muted flex items-center gap-1">
            <HelpCircle size={13} /> Así lo verán los jugadores antes de unirse
          </span>
        </div>

        {/* Tarjeta simulada de lista multijugador */}
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-zinc-800 bg-[#0d0e11] p-4 shadow-2xl transition-all">
          <div className="flex items-center gap-4">
            {/* Slot de Icono 64x64 */}
            <div className="relative group shrink-0 w-16 h-16 rounded-md bg-[#18191f] border border-zinc-700/80 overflow-hidden shadow-md flex items-center justify-center">
              {!iconError ? (
                <img
                  src={`${api.getServerIconUrl(server.config.id)}?t=${iconTimestamp}`}
                  alt="Server Icon"
                  className="w-16 h-16 object-cover"
                  style={{ imageRendering: 'pixelated' }}
                  onError={() => setIconError(true)}
                />
              ) : (
                /* Fallback Icon estilo Bloque de Hierba pixelado */
                <div
                  className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-emerald-600 to-amber-800 text-white font-mono text-[9px] font-bold select-none"
                  title="Icono por defecto"
                >
                  <span className="drop-shadow">MC</span>
                </div>
              )}

              {/* Botón flotante para cambiar icono rápido al pasar el cursor */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingIcon}
                className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-medium cursor-pointer"
                title="Cambiar icono del servidor"
              >
                <Upload size={14} className="mb-0.5 text-blue-400" />
                Cambiar
              </button>
            </div>

            {/* Contenido derecho de la entrada del servidor */}
            <div className="flex-1 min-w-0 font-mono text-sm leading-5">
              {/* Fila superior: Nombre del servidor + Ping y Jugadores */}
              <div className="flex items-center justify-between mb-1 pb-0.5 border-b border-zinc-800/60">
                <span
                  className="font-bold text-white text-base tracking-wide truncate"
                  style={{ textShadow: '1.5px 1.5px 0px rgba(0,0,0,0.85)' }}
                >
                  {server.config.name}
                </span>

                <div className="flex items-center gap-3 shrink-0 text-xs">
                  {/* Jugadores online */}
                  <span
                    className="text-[#AAAAAA] font-bold"
                    style={{ textShadow: '1px 1px 0px rgba(0,0,0,0.8)' }}
                  >
                    0 / {maxPlayers}
                  </span>

                  {/* Barras de Ping verdes clásicas de Minecraft */}
                  <div className="flex items-end gap-0.5 h-3.5 px-0.5" title="Ping: Excelente (< 20ms)">
                    <div className="w-[3px] h-1.5 bg-emerald-400 rounded-[0.5px]" />
                    <div className="w-[3px] h-2 bg-emerald-400 rounded-[0.5px]" />
                    <div className="w-[3px] h-2.5 bg-emerald-400 rounded-[0.5px]" />
                    <div className="w-[3px] h-3 bg-emerald-400 rounded-[0.5px]" />
                    <div className="w-[3px] h-3.5 bg-emerald-400 rounded-[0.5px]" />
                  </div>
                </div>
              </div>

              {/* Fila de Línea 1 de MOTD */}
              <div
                className="truncate whitespace-pre leading-snug min-h-[20px] text-[13.5px]"
                style={{ fontFamily: "'Courier New', Courier, monospace" }}
              >
                {renderMinecraftLine(line1)}
              </div>

              {/* Fila de Línea 2 de MOTD */}
              <div
                className="truncate whitespace-pre leading-snug min-h-[20px] text-[13.5px]"
                style={{ fontFamily: "'Courier New', Courier, monospace" }}
              >
                {renderMinecraftLine(line2)}
              </div>
            </div>
          </div>
        </div>

        {/* Controles de Icono bajo la vista previa */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-panel-muted border-t border-panel-border/60">
          <div className="flex items-center gap-2">
            <ImageIcon size={14} className="text-panel-accent" />
            <span>
              <strong>server-icon.png:</strong> Sube cualquier imagen JPG/PNG/WebP. Se recortará y convertirá automáticamente a <strong>64x64 PNG</strong>.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png, image/jpeg, image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingIcon}
              className="inline-flex items-center gap-1.5 rounded-lg border border-panel-border bg-panel-bg px-3 py-1.5 text-xs font-medium text-white hover:border-panel-accent/50 hover:bg-panel-hover transition-colors disabled:opacity-50"
            >
              <Upload size={13} className="text-panel-accent" />
              {isUploadingIcon ? 'Procesando...' : 'Subir Icono (64x64)'}
            </button>

            {!iconError && (
              <button
                type="button"
                onClick={handleDeleteIcon}
                disabled={isUploadingIcon}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-950/20 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50"
                title="Quitar icono personalizado"
              >
                <Trash2 size={13} /> Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. EDITOR DE TEXTO DEL MOTD (LÍNEA 1 Y LÍNEA 2) ── */}
      <div className="rounded-xl border border-panel-border bg-panel-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <Palette size={16} className="text-panel-accent" /> Editor de Banner / MOTD
          </h4>

          {/* Botones de acción rápida */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTemplates(!showTemplates)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-panel-accent/40 bg-panel-accent/10 px-2.5 py-1 text-xs font-medium text-panel-accent hover:bg-panel-accent/20 transition-colors"
            >
              <Sparkles size={13} /> Plantillas
            </button>

            <button
              type="button"
              onClick={handleConvertAmpersandToSection}
              className="inline-flex items-center gap-1 rounded-lg border border-panel-border bg-panel-bg px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white hover:border-panel-accent/40 transition-colors"
              title="Convierte códigos como &a o &l al símbolo nativo §"
            >
              <Wand2 size={13} /> & a §
            </button>

            <button
              type="button"
              onClick={handleCenterLine}
              className="inline-flex items-center gap-1 rounded-lg border border-panel-border bg-panel-bg px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white hover:border-panel-accent/40 transition-colors"
              title="Añade espacios al inicio para centrar la línea activa"
            >
              <AlignHorizontalDistributeCenter size={13} /> Centrar Línea {activeLine}
            </button>

            <button
              type="button"
              onClick={handleStripFormatting}
              className="inline-flex items-center gap-1 rounded-lg border border-panel-border bg-panel-bg px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-red-400 transition-colors"
              title="Elimina todos los códigos § o &"
            >
              <RotateCcw size={13} /> Limpiar formato
            </button>
          </div>
        </div>

        {/* Desplegable de Plantillas */}
        {showTemplates && (
          <div className="rounded-xl border border-panel-border/80 bg-panel-bg p-4 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Sparkles size={14} className="text-yellow-400" /> Elige un estilo predeterminado para tu servidor:
              </span>
              <button
                type="button"
                onClick={() => setShowTemplates(false)}
                className="text-xs text-panel-muted hover:text-white"
              >
                Cerrar ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {PRESET_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => {
                    const norm = tpl.motd.replace(/\\n/g, '\n');
                    const parts = norm.split('\n');
                    updateLines(parts[0] || '', parts.slice(1).join(' ') || '');
                    setShowTemplates(false);
                    showStatus('success', `Plantilla "${tpl.name}" aplicada.`);
                  }}
                  className="text-left rounded-lg border border-panel-border/60 bg-panel-surface/60 p-3 hover:border-panel-accent/50 hover:bg-panel-surface transition-all group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white group-hover:text-panel-accent transition-colors">
                      {tpl.name}
                    </span>
                    <span className="rounded bg-panel-border px-1.5 py-0.5 text-[9px] text-zinc-400">
                      {tpl.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-panel-muted line-clamp-1">{tpl.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Inputs de Línea 1 y Línea 2 */}
        <div className="grid grid-cols-1 gap-3">
          {/* Línea 1 */}
          <div
            className={`rounded-lg border p-3 transition-colors ${
              activeLine === 1
                ? 'border-panel-accent/60 bg-panel-bg/90'
                : 'border-panel-border bg-panel-bg/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                Línea 1 del Servidor
              </label>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-mono ${
                    line1.replace(/[§&][0-9a-fk-or]/gi, '').length > 50
                      ? 'text-amber-400'
                      : 'text-panel-muted'
                  }`}
                >
                  {line1.replace(/[§&][0-9a-fk-or]/gi, '').length} / ~55 caracteres
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLine(1);
                    inputLine1Ref.current?.focus();
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded ${
                    activeLine === 1
                      ? 'bg-panel-accent text-white font-medium'
                      : 'text-panel-muted hover:text-white'
                  }`}
                >
                  Activa
                </button>
              </div>
            </div>
            <input
              ref={inputLine1Ref}
              type="text"
              value={line1}
              onFocus={() => setActiveLine(1)}
              onChange={(e) => updateLines(e.target.value, line2)}
              placeholder="Ej: §a§lMI SERVIDOR §8» §fSurvival 1.21"
              className="w-full rounded-md border border-panel-border bg-panel-surface px-3 py-2 text-sm font-mono text-zinc-100 outline-none focus:border-panel-accent/60"
            />
          </div>

          {/* Línea 2 */}
          <div
            className={`rounded-lg border p-3 transition-colors ${
              activeLine === 2
                ? 'border-panel-accent/60 bg-panel-bg/90'
                : 'border-panel-border bg-panel-bg/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Línea 2 del Servidor (Subtítulo / Info)
              </label>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-mono ${
                    line2.replace(/[§&][0-9a-fk-or]/gi, '').length > 50
                      ? 'text-amber-400'
                      : 'text-panel-muted'
                  }`}
                >
                  {line2.replace(/[§&][0-9a-fk-or]/gi, '').length} / ~55 caracteres
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveLine(2);
                    inputLine2Ref.current?.focus();
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded ${
                    activeLine === 2
                      ? 'bg-panel-accent text-white font-medium'
                      : 'text-panel-muted hover:text-white'
                  }`}
                >
                  Activa
                </button>
              </div>
            </div>
            <input
              ref={inputLine2Ref}
              type="text"
              value={line2}
              onFocus={() => setActiveLine(2)}
              onChange={(e) => updateLines(line1, e.target.value)}
              placeholder="Ej: §e✦ ¡Únete a la aventura con amigos! ✦"
              className="w-full rounded-md border border-panel-border bg-panel-surface px-3 py-2 text-sm font-mono text-zinc-100 outline-none focus:border-panel-accent/60"
            />
          </div>
        </div>

        {/* ── BARRA DE COLORES MINECRAFT ── */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              Paleta de Colores (Insertar en Línea {activeLine}):
            </span>
            <span className="text-[11px] text-panel-muted">Haz clic en un color para insertarlo</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MINECRAFT_COLORS.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => insertTextAtCursor(`§${c.code}`)}
                className="group relative flex items-center justify-center w-8 h-8 rounded-md border border-zinc-700/80 shadow-sm transition-transform active:scale-95 hover:scale-110"
                style={{ backgroundColor: c.hex }}
                title={`§${c.code} - ${c.name}`}
              >
                <span
                  className="font-mono text-xs font-bold drop-shadow-md select-none opacity-80 group-hover:opacity-100"
                  style={{ color: c.textHex }}
                >
                  §{c.code}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── BARRA DE FORMATOS Y ESTILOS ── */}
        <div className="space-y-2 pt-2">
          <span className="text-xs font-semibold text-zinc-300 block">
            Estilos y Formatos de Texto:
          </span>

          <div className="flex flex-wrap gap-2">
            {MINECRAFT_STYLES.map((st) => (
              <button
                key={st.code}
                type="button"
                onClick={() => insertTextAtCursor(`§${st.code}`)}
                className="inline-flex items-center gap-1.5 rounded-md border border-panel-border bg-panel-bg px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:border-panel-accent/50 hover:text-white transition-colors"
                title={`§${st.code} - ${st.name}`}
              >
                <span className={`text-panel-accent font-mono font-bold ${st.className}`}>
                  {st.label}
                </span>
                <span>{st.name}</span>
                <span className="text-[10px] text-panel-muted font-mono">§{st.code}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── BARRA DE SÍMBOLOS ESPECIALES ── */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              Símbolos Populares para Servidores:
            </span>
            <span className="text-[11px] text-panel-muted">Haz clic para añadir</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SPECIAL_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => insertTextAtCursor(` ${sym} `)}
                className="w-8 h-8 rounded-md border border-panel-border bg-panel-bg flex items-center justify-center text-sm font-semibold text-zinc-200 hover:border-panel-accent/50 hover:bg-panel-hover hover:text-white transition-all active:scale-95"
                title={`Insertar ${sym}`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
