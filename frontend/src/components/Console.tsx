// ============================================================
// Console.tsx — Consola en tiempo real del servidor
// ============================================================
// Este componente muestra los logs del servidor de Minecraft
// como una terminal oscura, y permite enviar comandos.
//
// Utiliza Socket.io para recibir cada línea en tiempo real
// conforme el servidor las va imprimiendo.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { Send, Trash2, ArrowDownToLine } from 'lucide-react';
import { getSocket } from '../api/client';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface Props {
  serverId: string;
  initialBuffer: string[];
}

export default function Console({ serverId, initialBuffer }: Props) {
  const { hasPermission } = useAuth();
  // Estado: array de líneas de la consola
  const [lines, setLines] = useState<string[]>(initialBuffer);
  // Estado: lo que el usuario está escribiendo en el input
  const [command, setCommand] = useState('');
  // Estado: auto-scroll activado o no
  const [autoScroll, setAutoScroll] = useState(true);
  // Historial de comandos (flechas arriba/abajo)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Referencia al final de la consola (para hacer scroll automático)
  const bottomRef = useRef<HTMLDivElement>(null);
  // Referencia al contenedor de la consola
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Escuchar logs en tiempo real via WebSocket ──
  useEffect(() => {
    const socket = getSocket();

    const handleLog = (data: { serverId: string; line: string }) => {
      if (data.serverId === serverId) {
        setLines((prev) => {
          const next = [...prev, data.line];
          // Limitar a 1000 líneas en el navegador para no consumir RAM
          if (next.length > 1000) next.splice(0, next.length - 1000);
          return next;
        });
      }
    };

    socket.on('server:log', handleLog);

    // Cleanup: dejar de escuchar cuando el componente se desmonta
    return () => {
      socket.off('server:log', handleLog);
    };
  }, [serverId]);

  // ── Auto-scroll al final cuando llegan nuevas líneas ──
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, autoScroll]);

  // ── Detectar si el usuario ha hecho scroll manual ──
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Si está cerca del final (menos de 50px), reactivar auto-scroll
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isNearBottom);
  };

  // ── Enviar un comando ──
  const handleSend = async () => {
    const trimmed = command.trim();
    if (!trimmed) return;

    try {
      await api.sendCommand(serverId, trimmed);
      // Añadir al historial
      setHistory((prev) => [trimmed, ...prev.slice(0, 49)]);
      setHistoryIndex(-1);
      setCommand('');
    } catch (err: any) {
      setLines((prev) => [...prev, `[CraftPanel] Error: ${err.message}`]);
    }
  };

  // ── Navegación por historial con flechas ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setCommand(history[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(history[newIndex]);
      } else {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  // ── Colorear líneas según su contenido ──
  const getLineColor = (line: string): string => {
    if (line.startsWith('[Panel]') || line.startsWith('[CraftPanel]'))
      return 'text-panel-accent';
    if (line.startsWith('>')) return 'text-emerald-400';
    if (line.includes('WARN')) return 'text-yellow-400';
    if (line.includes('ERROR') || line.includes('Exception'))
      return 'text-red-400';
    if (line.includes('INFO')) return 'text-zinc-400';
    return 'text-zinc-300';
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Barra de herramientas ── */}
      <div className="flex items-center justify-between border-b border-panel-border px-4 py-2">
        <span className="text-sm font-medium text-panel-muted">
          Consola — {lines.length} líneas
        </span>
        <div className="flex items-center gap-2">
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-1 rounded-md bg-panel-accent/10 px-2 py-1
                         text-xs text-panel-accent hover:bg-panel-accent/20 transition-colors"
            >
              <ArrowDownToLine size={12} /> Auto-scroll
            </button>
          )}
          <button
            onClick={() => setLines([])}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1
                       text-xs text-panel-muted hover:text-panel-danger transition-colors"
            title="Limpiar consola"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* ── Área de logs ── */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed"
      >
        {lines.length === 0 ? (
          <p className="text-panel-muted italic">
            La consola está vacía. Inicia el servidor para ver los logs.
          </p>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`${getLineColor(line)} whitespace-pre-wrap break-all`}>
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input de comandos ── */}
      <div className="border-t border-panel-border px-4 py-3">
        {hasPermission('servers:console') ? (
          <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-panel-bg px-3 py-2
                          focus-within:border-panel-accent/50 transition-colors">
            <span className="text-panel-accent font-mono text-sm select-none">&gt;</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un comando... (ej: say Hola, op Jugador)"
              className="flex-1 bg-transparent font-mono text-sm text-white outline-none
                         placeholder:text-zinc-600"
            />
            <button
              onClick={handleSend}
              disabled={!command.trim()}
              className="rounded-md p-1.5 text-panel-muted transition-colors
                         hover:text-panel-accent disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          </div>
        ) : (
          <p className="text-xs text-panel-muted text-center py-1 italic">
            Consola en modo de solo lectura (no tienes permiso para enviar comandos).
          </p>
        )}
      </div>
    </div>
  );
}
