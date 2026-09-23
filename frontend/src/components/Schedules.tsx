// ============================================================
// Schedules.tsx — Panel de Automatizaciones y Horarios
// ============================================================
// Permite programar:
//   - Encendido automático (ej. 12:00 PM)
//   - Apagado seguro con avisos y guardado del mundo (ej. 00:00 AM)
//   - Reinicios automáticos
//   - Copias de seguridad automáticas
//   - Comandos personalizados
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
} from 'lucide-react';
import {
  ScheduleItem,
  ScheduleAction,
  CreateScheduleRequest,
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
  { minutesBefore: 10, message: '[Aviso Servidor] El servidor se apagará en 10 minutos por horario nocturno.' },
  { minutesBefore: 5, message: '[Aviso Servidor] El servidor se apagará en 5 minutos. Guarda tus objetos en un cofre.' },
  { minutesBefore: 1, message: '[Aviso Servidor] Apagando en 60 segundos. Guardando el mundo...' },
];

export const Schedules: React.FC<SchedulesProps> = ({ serverId, isOnline }) => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal de Crear / Editar
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [action, setAction] = useState<ScheduleAction>('SAFE_STOP');
  const [time, setTime] = useState('00:00');
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

  const handleApplyPreset12h00h = async () => {
    try {
      setActionLoading('preset-schedule');
      // 1. Crear encendido 12:00
      await api.createSchedule(serverId, {
        name: 'Apertura Diaria (12:00 PM)',
        action: 'START',
        time: '12:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      });

      // 2. Crear apagado seguro 00:00
      await api.createSchedule(serverId, {
        name: 'Apagado Seguro Nocturno (00:00 AM)',
        action: 'SAFE_STOP',
        time: '00:00',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        warnings: DEFAULT_WARNINGS,
      });

      showToast('¡Horario de 12:00 PM a 00:00 AM aplicado con éxito con avisos de seguridad!');
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

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return showToast('El nombre es obligatorio', 'error');
    if (selectedDays.length === 0) return showToast('Selecciona al menos un día', 'error');

    const reqData: CreateScheduleRequest = {
      name: name.trim(),
      action,
      time,
      daysOfWeek: selectedDays,
      warnings: action === 'SAFE_STOP' || action === 'SAFE_RESTART' ? warnings : undefined,
      command: action === 'COMMAND' ? command : undefined,
      backupNote: action === 'BACKUP' ? backupNote : undefined,
    };

    try {
      setActionLoading('modal-save');
      await api.createSchedule(serverId, reqData);
      showToast('Tarea programada creada con éxito.');
      setShowModal(false);
      resetModal();
      loadSchedules();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar tarea', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const resetModal = () => {
    setName('');
    setAction('SAFE_STOP');
    setTime('00:00');
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    setCommand('');
    setBackupNote('');
    setWarnings(DEFAULT_WARNINGS);
  };

  const toggleDay = (dayIndex: number) => {
    if (selectedDays.includes(dayIndex)) {
      setSelectedDays(selectedDays.filter((d) => d !== dayIndex));
    } else {
      setSelectedDays([...selectedDays, dayIndex].sort());
    }
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
            Automatizaciones y Horarios Programados
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Configura el encendido automático diario, apagado nocturno con avisos en el chat y copias de seguridad sin intervención.
          </p>
        </div>

        <button
          onClick={() => {
            resetModal();
            setShowModal(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nueva Tarea
        </button>
      </div>

      {/* Presets Rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Preset 12h - 00h */}
        <div className="bg-gradient-to-br from-zinc-900/90 to-zinc-900/50 p-5 rounded-xl border border-amber-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Configuración Recomendada
              </div>
              <h3 className="text-base font-bold text-zinc-100">
                Horario Completo: 12:00 PM – 00:00 AM
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Enciende el servidor automáticamente a las 12:00 PM y realiza un apagado seguro a las 00:00 AM con avisos en el chat (10 min, 5 min y 1 min) y guardado forzado del mundo.
              </p>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-amber-400 shrink-0">
              <Sun className="w-5 h-5" />
            </div>
          </div>

          <button
            onClick={handleApplyPreset12h00h}
            disabled={actionLoading === 'preset-schedule'}
            className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {actionLoading === 'preset-schedule' ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Aplicar Horario 12:00 PM – 00:00 AM
          </button>
        </div>

        {/* Preset Backup Diario */}
        <div className="bg-gradient-to-br from-zinc-900/90 to-zinc-900/50 p-5 rounded-xl border border-blue-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                Seguridad Automática
              </div>
              <h3 className="text-base font-bold text-zinc-100">
                Backup Diario Nocturno (04:00 AM)
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Genera una copia de seguridad en caliente todos los días a las 04:00 AM sin expulsar a los jugadores ni interrumpir el juego.
              </p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 text-blue-400 shrink-0">
              <Archive className="w-5 h-5" />
            </div>
          </div>

          <button
            onClick={handleApplyPresetBackup}
            disabled={actionLoading === 'preset-backup'}
            className="mt-4 flex items-center justify-center gap-2 w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {actionLoading === 'preset-backup' ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Activar Backup Diario a las 04:00 AM
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
              Puedes hacer clic en los presets superiores o pulsar en "Nueva Tarea" para programar el encendido a las 12:00 o el apagado a las 00:00.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className={`p-5 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  schedule.enabled ? 'bg-zinc-900/40 hover:bg-zinc-800/30' : 'bg-zinc-950/40 opacity-60'
                }`}
              >
                {/* Lado izquierdo: Hora y Detalles */}
                <div className="flex items-start gap-4">
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

                  {/* Hora badge */}
                  <div className="flex flex-col items-center justify-center px-3 py-1.5 bg-zinc-800/80 border border-zinc-700 rounded-lg shrink-0">
                    <span className="text-lg font-mono font-bold text-zinc-100">{schedule.time}</span>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">24h</span>
                  </div>

                  {/* Info principal */}
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-zinc-100 text-base">{schedule.name}</h4>
                      {getActionBadge(schedule.action)}
                    </div>

                    {/* Días de la semana */}
                    <div className="flex items-center gap-1 pt-1">
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

                    {/* Descripción de acción */}
                    <div className="text-xs text-zinc-400 pt-1">
                      {(schedule.action === 'SAFE_STOP' || schedule.action === 'SAFE_RESTART') && (
                        <p className="flex items-center gap-1.5 text-zinc-400">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>
                            Avisos configurados:{' '}
                            <strong className="text-zinc-300 font-medium">
                              {schedule.warnings && schedule.warnings.length > 0
                                ? schedule.warnings.map((w) => `${w.minutesBefore}m`).join(', ')
                                : 'Sin avisos'}
                            </strong>{' '}
                            + guardado forzado de mundo (<code className="text-amber-300 text-[11px]">save-all flush</code>).
                          </span>
                        </p>
                      )}
                      {schedule.action === 'BACKUP' && (
                        <p className="text-zinc-400">
                          Copia comprimida zlib (.zip) con nota: <em>"{schedule.backupNote || 'Backup programado'}"</em>
                        </p>
                      )}
                      {schedule.action === 'COMMAND' && (
                        <p className="font-mono text-zinc-300 bg-zinc-800/60 px-2 py-0.5 rounded inline-block text-[11px]">
                          /{schedule.command}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lado derecho: Acciones */}
                <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                  {/* Botón Probar Ahora */}
                  <button
                    onClick={() => handleRunNow(schedule)}
                    disabled={actionLoading === schedule.id}
                    title="Ejecutar prueba de la secuencia ahora"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-medium rounded-lg border border-zinc-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {actionLoading === schedule.id ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20" />
                    )}
                    <span>Probar Ahora</span>
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
            ))}
          </div>
        )}
      </div>

      {/* Modal Crear / Configurar Tarea */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Nueva Tarea Programada
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
                  placeholder="Ej. Apagado Nocturno, Encendido Diario..."
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
                  <option value="START">☀️ Encendido Automático (Inicia si está offline)</option>
                  <option value="SAFE_STOP">🌙 Apagado Seguro con Avisos y Guardado de Mundo</option>
                  <option value="SAFE_RESTART">🔄 Reinicio Seguro con Avisos y Guardado</option>
                  <option value="BACKUP">💾 Copia de Seguridad Automática (Hot-backup)</option>
                  <option value="COMMAND">⚡ Enviar Comando de Consola Personalizado</option>
                </select>
              </div>

              {/* Hora (HH:mm) */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Hora de Ejecución (Formato 24 Horas)
                </label>
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                />
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  Para el mediodía usa <strong>12:00</strong>. Para medianoche usa <strong>00:00</strong>.
                </span>
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
                    Antes del apagado/reinicio, CraftPanel enviará avisos por el chat de Minecraft a los jugadores para que no pierdan objetos:
                  </p>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2 bg-zinc-900 rounded border border-zinc-800 text-zinc-300">
                      <span className="text-amber-400 font-bold">10 min antes:</span> [Aviso Servidor] El servidor se apagará en 10 minutos...
                    </div>
                    <div className="p-2 bg-zinc-900 rounded border border-zinc-800 text-zinc-300">
                      <span className="text-amber-400 font-bold">5 min antes:</span> [Aviso Servidor] El servidor se apagará en 5 minutos...
                    </div>
                    <div className="p-2 bg-zinc-900 rounded border border-zinc-800 text-zinc-300">
                      <span className="text-amber-400 font-bold">1 min antes:</span> [Aviso Servidor] Apagando en 60 segundos. Guardando el mundo...
                    </div>
                  </div>

                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs flex items-start gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    <span>
                      Al cumplirse la hora, se ejecutará automáticamente <code className="font-mono text-emerald-200 font-bold">save-all flush</code> para volcar chunks e inventarios a disco sin corrupción antes de detener el proceso.
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
                    placeholder="Ej. say ¡Bienvenidos al servidor de Minecraft!"
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
                  Guardar Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
