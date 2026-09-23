// ============================================================
// StatusBadge.tsx — Indicador visual del estado del servidor
// ============================================================
// Un pequeño componente que muestra un punto de color + texto
// según el estado del servidor (ONLINE, STARTING, etc.).
// ============================================================

import { ServerStatus } from '../types';

interface Props {
  status: ServerStatus;
  size?: 'sm' | 'md';
}

/** Mapeo de estado → color y texto en español */
const statusConfig: Record<ServerStatus, { color: string; label: string; pulse: boolean }> = {
  ONLINE:   { color: 'bg-panel-success', label: 'Online',    pulse: false },
  STARTING: { color: 'bg-panel-warning', label: 'Iniciando', pulse: true },
  STOPPING: { color: 'bg-panel-warning', label: 'Parando',   pulse: true },
  OFFLINE:  { color: 'bg-panel-danger',  label: 'Offline',   pulse: false },
};

export default function StatusBadge({ status, size = 'md' }: Props) {
  const config = statusConfig[status];
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`${dotSize} rounded-full ${config.color} ${
          config.pulse ? 'status-pulse' : ''
        }`}
      />
      <span className={`${textSize} font-medium text-panel-muted`}>
        {config.label}
      </span>
    </span>
  );
}
