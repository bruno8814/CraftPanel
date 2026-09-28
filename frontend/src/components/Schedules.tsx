// ============================================================
// Schedules.tsx — Panel de Automatizaciones y Horarios Programados
// ============================================================
// Permite programar:
//   - Encendido automático (ej. 12:00 PM)
//   - Apagado seguro con avisos y guardado del mundo (ej. 00:00 AM)
//   - Reinicios automáticos periódicos (ej. cada madrugada o cada 6h para liberar RAM)
//   - Copias de seguridad automáticas (hot-backup diario)
//   - Comandos de consola programados (ej. save-all flush continuo)
//   - Soporta horas fijas e intervalos recurrentes (cada 4h, 6h, 12h, etc.)
//   - Edición completa de tareas existentes
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Play,
  Trash2,
  Plus,
  AlertTriangle,
  Check,
  RotateCw,
  Archive,
  Terminal,
  Zap,
  Moon,
  Sun,
  ShieldCheck,
  Calendar,
  Sparkles,
  Edit2,
  Repeat,
  Save,
  CheckCircle2,
} from 'lucide-react';
import {
  ScheduleItem,
  ScheduleAction,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  ScheduleCountdownWarning,
} from '../types';
import { api } from '../api/client';

interface SchedulesProps {
  serverId: string;
  serverName: string;
  isOnline: boolean;
}

const DAYS_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const DEFAULT_WARNINGS: ScheduleCountdownWarning[] = [
  { minutesBefore: 10, message: '[Aviso Servidor] El servidor se reiniciará/apagará en 10 minutos por mantenimiento.' },
  { minutesBefore: 5, message: '[Aviso Servidor] El servidor se reiniciará/apagará en 5 minutos. Guarda tus objetos.' },
  { minutesBefore: 1, message: '[Aviso Servidor] Acción en 60 segundos. Guardando mundo y chunks...' },
];

// Opciones de intervalos recurrentes preconfigurados
type TimeMode = 'fixed' | 'every_6h' | 'every_12h' | 'every_4h' | 'hourly' | 'custom';

const INTERVAL_PRESETS: { mode: TimeMode; label: string; times: string }[] = [
  { mode: 'fixed', label: 'Hora Fija del Día', times: '05:00' },
  { mode: 'every_6h', label: 'Cada 6 Horas', times: '00:00, 06:00, 12:00, 18:00' },
  { mode: 'every_12h', label: 'Cada 12 Horas', times: '06:00, 18:00' },
  { mode: 'every_4h', label: 'Cada 4 Horas', times: '00:00, 04:00, 08:00, 12:00, 16:00, 20:00' },
  {
    mode: 'hourly',
    label: 'Cada Hora (en punto)',
    times:
      '00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00, 07:00, 08:00, 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00, 21:00, 22:00, 23:00',
  },
  { mode: 'custom', label: 'Horas Personalizadas (Múltiples)', times: '' },
];

export const Schedules: React.FC<SchedulesProps> = ({ serverId }) => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal de Crear / Editar
  const [showModal, setShowModal] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [action, setAction] = useState<ScheduleAction>('SAFE_RESTART');
  const [timeMode, setTimeMode] = useState<TimeMode>('fixed');
  const [timeInput, setTimeInput] = useState('05:00');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [command, setCommand] = useState('');
  const [backupNote, setBackupNote] = useState('');
  const [warnings, setWarnings] = useState<ScheduleCountdownWarning[]>(DEFAULT_WARNINGS);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const data = await api.getSchedules(serverId);
      setSchedules(data);
    } catch (err: any) {
      showToast(err.message || 'Error al cargar tareas programadas', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, [serverId]);

  const handleToggle = async (schedule: ScheduleItem) => {
    try {
      const updated = await api.toggleSchedule(serverId, schedule.id);
      setSchedules((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast(`Regla "${schedule.name}" ${updated.enabled ? 'activada' : 'pausada'}.`);
    } catch (err: any) {
      showToast(err.message || 'Error al alternar regla', 'error');
    }
  };

  const handleDelete = async (schedule: ScheduleItem) => {
    if (!confirm(`¿Eliminar la tarea programada "${schedule.name}"?`)) return;
    try {
      await api.deleteSchedule(serverId, schedule.id);
      setSchedules((prev) => prev.filter((s) => s.id !== schedule.id));
      showToast('Tarea eliminada correctamente.');
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar tarea', 'error');
    }
  };

  const handleRunNow = async (schedule: ScheduleItem) => {
    try {
      setActionLoading(schedule.id);
      showToast(`Iniciando prueba de "${schedule.name}"... Revisa la consola para ver los avisos y el guardado.`, 'info');
      await api.runSchedule(serverId, schedule.id, true);
      showToast(`Secuencia de prueba de "${schedule.name}" completada con éxito.`);
      loadSchedules();
    } catch (err: any) {
      showToast(err.message || 'Error al ejecutar tarea', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Presets Rápidos ──
  const handleApplyPreset12h00h = async () => {
    try {
      setActionLoading('preset-12h00h');
      await api.createSchedule(serverId, {
        name: 'Apertura Diaria (12:00 PM)',
        action: 'START',
        time: '12:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      });
      await api.createSchedule(serverId, {
        name: 'Apagado Nocturno (00:00 AM)',
        action: 'SAFE_STOP',
        time: '00:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        warnings: DEFAULT_WARNINGS,
      });
      showToast('¡Horario de 12:00 PM a 00:00 AM aplicado con éxito!');
      loadSchedules();
    } catch (err: any) {
      showToast(err.message || 'Error al aplicar preset', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApplyPresetBackup = async () => {
    try {
      setActionLoading('preset-backup');
      await api.createSchedule(serverId, {
        name: 'Copia de Seguridad Diaria (04:00 AM)',
        action: 'BACKUP',
        time: '04:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        backupNote: 'Backup nocturno programado automático',
      });
      showToast('Copia automática diaria a las 04:00 AM configurada.');
      loadSchedules();
    } catch (err: any) {
      showToast(err.message || 'Error al aplicar preset', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApplyPresetRamRestart = async () => {
    try {
      setActionLoading('preset-ram-restart');
      await api.createSchedule(serverId, {
        name: 'Reinicio Diario de RAM (05:00 AM)',
        action: 'SAFE_RESTART',
        time: '05:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        warnings: [
          { minutesBefore: 5, message: '[Servidor] Reinicio preventivo en 5 minutos para limpiar memoria RAM.' },
          { minutesBefore: 1, message: '[Servidor] Reiniciando en 60s. Guardando mundo...' },
        ],
      });
      showToast('Reinicio preventivo de RAM a las 05:00 AM configurado.');
      loadSchedules();
    } catch (err: any) {
      showToast(err.message || 'Error al aplicar preset', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApplyPresetHourlySave = async () => {
    try {
      setActionLoading('preset-hourly-save');
      await api.createSchedule(serverId, {
        name: 'Guardado de Mundo Continuo (Cada Hora)',
        action: 'COMMAND',
        time: '00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00, 07:00, 08:00, 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00, 21:00, 22:00, 23:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        command: 'save-all flush',
      });
      showToast('Guardado automático cada hora configurado.');
      loadSchedules();
    } catch (err: any) {
      showToast(err.message || 'Error al aplicar preset', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Abrir Modal en Modo Crear ──
  const openCreateModal = () => {
    setEditingScheduleId(null);
    setName('');
    setAction('SAFE_RESTART');
    setTimeMode('fixed');
    setTimeInput('05:00');
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    setCommand('');
    setBackupNote('');
    setWarnings(DEFAULT_WARNINGS);
    setShowModal(true);
  };

  // ── Abrir Modal en Modo Editar ──
  const openEditModal = (schedule: ScheduleItem) => {
    setEditingScheduleId(schedule.id);
    setName(schedule.name);
    setAction(schedule.action);

    // Detectar si coincide con un preset de intervalo
    const matchedPreset = INTERVAL_PRESETS.find(
      (p) => p.mode !== 'custom' && p.mode !== 'fixed' && p.times === schedule.time
    );

    if (matchedPreset) {
      setTimeMode(matchedPreset.mode);
      setTimeInput(schedule.time);
    } else if (schedule.time.includes(',')) {
      setTimeMode('custom');
      setTimeInput(schedule.time);
    } else {
      setTimeMode('fixed');
      setTimeInput(schedule.time);
    }

    setSelectedDays(schedule.daysOfWeek);
    setCommand(schedule.command || '');
    setBackupNote(schedule.backupNote || '');
    setWarnings(schedule.warnings && schedule.warnings.length > 0 ? schedule.warnings : DEFAULT_WARNINGS);
    setShowModal(true);
  };

  const handleTimeModeChange = (newMode: TimeMode) => {
    setTimeMode(newMode);
    const found = INTERVAL_PRESETS.find((p) => p.mode === newMode);
    if (found && found.times) {
      setTimeInput(found.times);
    } else if (newMode === 'fixed' && timeInput.includes(',')) {
      setTimeInput('05:00');
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return showToast('El nombre es obligatorio', 'error');
    if (selectedDays.length === 0) return showToast('Selecciona al menos un día', 'error');
    if (!timeInput.trim()) return showToast('Debes indicar la hora o intervalo', 'error');

    const reqData: CreateScheduleRequest = {
      name: name.trim(),
      action,
      time: timeInput.trim(),
      daysOfWeek: selectedDays,
      warnings: action === 'SAFE_STOP' || action === 'SAFE_RESTART' ? warnings : undefined,
      command: action === 'COMMAND' ? command : undefined,
      backupNote: action === 'BACKUP' ? backupNote : undefined,
    };

    try {
      setActionLoading('modal-save');
      if (editingScheduleId) {
        await api.updateSchedule(serverId, editingScheduleId, reqData as UpdateScheduleRequest);
        showToast(`Tarea "${name}" actualizada con éxito.`);
      } else {
        await api.createSchedule(serverId, reqData);
        showToast(`Tarea "${name}" creada con éxito.`);
      }
      setShowModal(false);
      loadSchedules();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar tarea', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleDay = (dayIndex: number) => {
    if (selectedDays.includes(dayIndex)) {
      setSelectedDays(selectedDays.filter((d) => d !== dayIndex));
    } else {
      setSelectedDays([...selectedDays, dayIndex].sort());
    }
  };

  // ── Próxima Ejecución en Vivo ──
  const calculateNextRun = (schedule: ScheduleItem): string => {
    if (!schedule.enabled) return 'Pausada';

    const now = new Date();
    const currentDay = now.getDay();
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

    const targetTimes = schedule.time.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (targetTimes.length === 0) return '--';

    let minDiffMinutes = Infinity;
    let nextTargetDay = currentDay;
    let nextTargetTime = '';

    // Buscar en los próximos 7 días
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDay = (currentDay + dayOffset) % 7;
      if (!schedule.daysOfWeek.includes(checkDay)) continue;

      for (const t of targetTimes) {
        const [h, m] = t.split(':').map(Number);
        const targetMin = h * 60 + m;

        if (dayOffset === 0 && targetMin <= currentTotalMinutes) {
          // Ya pasó hoy, saltar
          continue;
        }

        const totalDiff = dayOffset * 1440 + (targetMin - currentTotalMinutes);
        if (totalDiff < minDiffMinutes) {
          minDiffMinutes = totalDiff;
          nextTargetDay = checkDay;
          nextTargetTime = t;
        }
      }

      if (minDiffMinutes !== Infinity && dayOffset > 0) {
        break;
      }
    }

    if (minDiffMinutes === Infinity) return 'Sin días activos';

    const hours = Math.floor(minDiffMinutes / 60);
    const mins = minDiffMinutes % 60;

    let timeUntil = '';
    if (hours > 0) timeUntil = `${hours}h ${mins}m`;
    else timeUntil = `${mins}m`;

    if (minDiffMinutes < 1440 && nextTargetDay === currentDay) {
      return `Hoy a las ${nextTargetTime} (en ${timeUntil})`;
    } else if (minDiffMinutes < 2880 && nextTargetDay === (currentDay + 1) % 7) {
      return `Mañana a las ${nextTargetTime} (en ${timeUntil})`;
    } else {
      return `El ${DAYS_NAMES[nextTargetDay]} a las ${nextTargetTime} (en ${timeUntil})`;
    }
  };

  // ── Formatear Última Ejecución ──
  const formatLastRun = (isoString?: string | null): string => {
    if (!isoString) return 'Nunca';
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Hace unos segundos';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getActionBadge = (act: ScheduleAction) => {
    switch (act) {
      case 'START':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sun className="w-3.5 h-3.5" />
            Encendido Automático
          </span>
        );
      case 'SAFE_STOP':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Moon className="w-3.5 h-3.5" />
            Apagado Seguro con Avisos
          </span>
        );
      case 'SAFE_RESTART':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <RotateCw className="w-3.5 h-3.5" />
            Reinicio Seguro con Avisos
          </span>
        );
      case 'BACKUP':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Archive className="w-3.5 h-3.5" />
            Backup Automático
          </span>
        );
      case 'COMMAND':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Terminal className="w-3.5 h-3.5" />
            Comando de Consola
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium transition-all ${
            toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-700 text-rose-200'
              : toastMessage.type === 'info'
              ? 'bg-sky-950/90 border-sky-700 text-sky-200'
              : 'bg-emerald-950/90 border-emerald-700 text-emerald-200'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : toastMessage.type === 'info' ? (
            <RotateCw className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 p-5 rounded-xl border border-zinc-800">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2.5">
            <Clock className="w-6 h-6 text-amber-400" />
            Automatizaciones y Tareas Programadas
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Programa reinicios periódicos para liberar memoria RAM, backups automáticos de madrugada y comandos sin tocar la consola.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nueva Tarea
        </button>
      </div>

      {/* Presets Rápidos (4 tarjetas) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Preset 1: Reinicio de RAM */}
        <div className="bg-zinc-900/80 p-4 rounded-xl border border-amber-500/20 flex flex-col justify-between hover:border-amber-500/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Rendimiento
              </span>
              <RotateCw className="w-4 h-4 text-amber-400" />
            </div>
            <h4 className="text-sm font-bold text-zinc-100">Reinicio Diario RAM (05:00 AM)</h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Limpia la memoria Java a las 05:00 AM con avisos previos en el chat.
            </p>
          </div>
          <button
            onClick={handleApplyPresetRamRestart}
            disabled={actionLoading === 'preset-ram-restart'}
            className="mt-3 w-full py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {actionLoading === 'preset-ram-restart' ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Activar
          </button>
        </div>

        {/* Preset 2: Backup Nocturno */}
        <div className="bg-zinc-900/80 p-4 rounded-xl border border-blue-500/20 flex flex-col justify-between hover:border-blue-500/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                Seguridad
              </span>
              <Archive className="w-4 h-4 text-blue-400" />
            </div>
            <h4 className="text-sm font-bold text-zinc-100">Backup Diario (04:00 AM)</h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Copia completa en caliente cada noche sin desconectar a los jugadores.
            </p>
          </div>
          <button
            onClick={handleApplyPresetBackup}
            disabled={actionLoading === 'preset-backup'}
            className="mt-3 w-full py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {actionLoading === 'preset-backup' ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Activar
          </button>
        </div>

        {/* Preset 3: Auto-guardado cada hora */}
        <div className="bg-zinc-900/80 p-4 rounded-xl border border-purple-500/20 flex flex-col justify-between hover:border-purple-500/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                Persistencia
              </span>
              <Save className="w-4 h-4 text-purple-400" />
            </div>
            <h4 className="text-sm font-bold text-zinc-100">Auto-Guardado (Cada 1h)</h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Ejecuta <code className="text-[11px] text-purple-300">save-all flush</code> cada hora para evitar rollbacks.
            </p>
          </div>
          <button
            onClick={handleApplyPresetHourlySave}
            disabled={actionLoading === 'preset-hourly-save'}
            className="mt-3 w-full py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {actionLoading === 'preset-hourly-save' ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Repeat className="w-3.5 h-3.5" />}
            Activar
          </button>
        </div>

        {/* Preset 4: Horario 12:00 a 00:00 */}
        <div className="bg-zinc-900/80 p-4 rounded-xl border border-emerald-500/20 flex flex-col justify-between hover:border-emerald-500/40 transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Ahorro / Energía
              </span>
              <Sun className="w-4 h-4 text-emerald-400" />
            </div>
            <h4 className="text-sm font-bold text-zinc-100">Horario 12:00 - 00:00</h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Enciende a las 12:00 PM y apaga a medianoche automáticamente.
            </p>
          </div>
          <button
            onClick={handleApplyPreset12h00h}
            disabled={actionLoading === 'preset-12h00h'}
            className="mt-3 w-full py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {actionLoading === 'preset-12h00h' ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Moon className="w-3.5 h-3.5" />}
            Activar
          </button>
        </div>
      </div>

      {/* Lista de Tareas Programadas */}
      <div className="bg-zinc-900/60 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-400" />
            Tareas Activas ({schedules.length})
          </span>
          <button
            onClick={loadSchedules}
            disabled={loading}
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
            <RotateCw className="w-6 h-6 animate-spin text-amber-500" />
            <p className="text-sm">Cargando tareas programadas...</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
            <Clock className="w-10 h-10 text-zinc-600 stroke-1" />
            <p className="text-base font-medium text-zinc-400">No hay tareas programadas configuradas.</p>
            <p className="text-xs text-zinc-500 max-w-md">
              Puedes activar cualquiera de los presets recomendados o hacer clic en "Nueva Tarea" para configurar tus propios horarios.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {schedules.map((schedule) => {
              const timesList = schedule.time.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
              const isMultiTime = timesList.length > 1;

              return (
                <div
                  key={schedule.id}
                  className={`p-5 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    schedule.enabled ? 'bg-zinc-900/40 hover:bg-zinc-800/30' : 'bg-zinc-950/40 opacity-60'
                  }`}
                >
                  {/* Lado izquierdo: Hora e Info */}
                  <div className="flex items-start gap-4 flex-1">
                    {/* Interruptor on/off */}
                    <button
                      onClick={() => handleToggle(schedule)}
                      className={`mt-1 w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out shrink-0 ${
                        schedule.enabled ? 'bg-amber-500' : 'bg-zinc-700'
                      }`}
                      title={schedule.enabled ? 'Pausar regla' : 'Activar regla'}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                          schedule.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    {/* Badge de Horas */}
                    <div className="flex flex-col items-center justify-center px-3 py-1.5 bg-zinc-800/80 border border-zinc-700 rounded-lg shrink-0 min-w-[70px]">
                      {isMultiTime ? (
                        <>
                          <div className="flex items-center gap-1 text-amber-400 font-mono font-bold text-xs">
                            <Repeat className="w-3 h-3" />
                            <span>{timesList.length}x día</span>
                          </div>
                          <span className="text-[10px] text-zinc-400 font-mono mt-0.5">
                            {timesList[0]}...
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-lg font-mono font-bold text-zinc-100">{schedule.time}</span>
                          <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">24h</span>
                        </>
                      )}
                    </div>

                    {/* Info principal */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-zinc-100 text-base">{schedule.name}</h4>
                        {getActionBadge(schedule.action)}
                      </div>

                      {/* Chips de horas si son múltiples */}
                      {isMultiTime && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {timesList.map((t, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-zinc-800 text-[11px] font-mono text-zinc-300 border border-zinc-700"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Días de la semana */}
                      <div className="flex items-center gap-1 pt-0.5">
                        {DAYS_NAMES.map((dName, idx) => {
                          const active = schedule.daysOfWeek.includes(idx);
                          return (
                            <span
                              key={idx}
                              className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                active
                                  ? 'bg-zinc-700 text-zinc-200 border border-zinc-600'
                                  : 'bg-zinc-800/30 text-zinc-600'
                              }`}
                            >
                              {dName}
                            </span>
                          );
                        })}
                      </div>

                      {/* Detalles & Countdown de Próxima Ejecución */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 pt-1">
                        <span className="flex items-center gap-1 font-medium text-amber-300/90">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          Próxima: {calculateNextRun(schedule)}
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span>Última ejecución: {formatLastRun(schedule.lastRun)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Lado derecho: Acciones */}
                  <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                    {/* Botón Editar */}
                    <button
                      onClick={() => openEditModal(schedule)}
                      title="Editar parámetros de la tarea"
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium rounded-lg border border-zinc-700 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Editar</span>
                    </button>

                    {/* Botón Probar Ahora */}
                    <button
                      onClick={() => handleRunNow(schedule)}
                      disabled={actionLoading === schedule.id}
                      title="Ejecutar prueba de la secuencia de inmediato"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-medium rounded-lg border border-zinc-700 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {actionLoading === schedule.id ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                      )}
                      <span>Probar</span>
                    </button>

                    {/* Botón Eliminar */}
                    <button
                      onClick={() => handleDelete(schedule)}
                      title="Eliminar tarea"
                      className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Tarea */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                {editingScheduleId ? <Edit2 className="w-5 h-5 text-amber-400" /> : <Clock className="w-5 h-5 text-amber-400" />}
                {editingScheduleId ? 'Editar Tarea Programada' : 'Nueva Tarea Programada'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Nombre */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Nombre de la Tarea
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Reinicio Preventivo, Backup Nocturno..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Tipo de Acción */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Tipo de Acción
                </label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value as ScheduleAction)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="SAFE_RESTART">🔄 Reinicio Seguro con Avisos y Guardado de Mundo</option>
                  <option value="BACKUP">💾 Copia de Seguridad Automática (Hot-backup sin lag)</option>
                  <option value="SAFE_STOP">🌙 Apagado Seguro con Avisos y Guardado</option>
                  <option value="START">☀️ Encendido Automático (Inicia si está offline)</option>
                  <option value="COMMAND">⚡ Enviar Comando de Consola Personalizado</option>
                </select>
              </div>

              {/* Selector de Frecuencia / Horario */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Frecuencia de Ejecución
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {INTERVAL_PRESETS.map((preset) => (
                    <button
                      key={preset.mode}
                      type="button"
                      onClick={() => handleTimeModeChange(preset.mode)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                        timeMode === preset.mode
                          ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Input de Hora según el modo seleccionado */}
                {timeMode === 'fixed' ? (
                  <div className="pt-2">
                    <input
                      type="time"
                      required
                      value={timeInput}
                      onChange={(e) => setTimeInput(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                    <span className="text-[11px] text-zinc-500 mt-1 block">
                      Formato 24 horas (ej. 05:00 para la madrugada, 18:00 para la tarde).
                    </span>
                  </div>
                ) : (
                  <div className="pt-2 space-y-1.5">
                    <input
                      type="text"
                      required
                      placeholder="00:00, 06:00, 12:00, 18:00"
                      value={timeInput}
                      onChange={(e) => setTimeInput(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                    <span className="text-[11px] text-zinc-500 block">
                      Horas separadas por comas en formato 24h.
                    </span>
                  </div>
                )}
              </div>

              {/* Días de la Semana */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Días Activos
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                      className="text-amber-400 hover:underline cursor-pointer"
                    >
                      Todos
                    </button>
                    <span className="text-zinc-600">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                      className="text-zinc-400 hover:text-zinc-200 hover:underline cursor-pointer"
                    >
                      L-V
                    </button>
                    <span className="text-zinc-600">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDays([0, 6])}
                      className="text-zinc-400 hover:text-zinc-200 hover:underline cursor-pointer"
                    >
                      Fines de semana
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {DAYS_NAMES.map((dName, idx) => {
                    const isSelected = selectedDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        className={`py-2 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-zinc-950 border-amber-400'
                            : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                        }`}
                      >
                        {dName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Opciones específicas según Acción */}
              {(action === 'SAFE_STOP' || action === 'SAFE_RESTART') && (
                <div className="bg-zinc-800/40 p-4 rounded-xl border border-zinc-700/60 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-200 uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Cuenta Atrás y Avisos al Chat
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Antes del apagado/reinicio, CraftPanel enviará avisos mediante /say a los jugadores para que guarden sus cofres:
                  </p>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2 bg-zinc-900 rounded border border-zinc-800 text-zinc-300">
                      <span className="text-amber-400 font-bold">10 min antes:</span> [Aviso Servidor] Se ejecutará en 10 minutos...
                    </div>
                    <div className="p-2 bg-zinc-900 rounded border border-zinc-800 text-zinc-300">
                      <span className="text-amber-400 font-bold">5 min antes:</span> [Aviso Servidor] Se ejecutará en 5 minutos...
                    </div>
                    <div className="p-2 bg-zinc-900 rounded border border-zinc-800 text-zinc-300">
                      <span className="text-amber-400 font-bold">1 min antes:</span> [Aviso Servidor] Acción en 60 segundos. Guardando mundo...
                    </div>
                  </div>

                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs flex items-start gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    <span>
                      Al cumplirse la hora, se ejecuta automáticamente <code className="font-mono text-emerald-200 font-bold">save-all flush</code> para volcar chunks e inventarios a disco sin corrupción antes de detener el proceso.
                    </span>
                  </div>
                </div>
              )}

              {action === 'BACKUP' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Nota Descriptiva del Backup
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Backup diario nocturno"
                    value={backupNote}
                    onChange={(e) => setBackupNote(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {action === 'COMMAND' && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Comando de Consola (sin barra /)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. save-all flush o say ¡Hola a todos!"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              )}

              {/* Botones Modal */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'modal-save'}
                  className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {actionLoading === 'modal-save' && <RotateCw className="w-4 h-4 animate-spin" />}
                  {editingScheduleId ? 'Actualizar Tarea' : 'Guardar Tarea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
