// ============================================================
// AuthPage.tsx — Pantalla de autenticación y setup inicial
// ============================================================
// Gestiona:
// - Setup inicial del Dueño (Owner)
// - Inicio de sesión
// - Registro de amigos con PIN de invitación
// ============================================================

import React, { useState } from 'react';
import { Shield, KeyRound, Mail, Lock, UserPlus, LogIn, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { initialized, setupOwner, login, register } = useAuth();

  // Si está inicializado, puede alternar entre 'login' y 'register'
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Por favor, completa todos los campos.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      if (!initialized) {
        // Setup del Owner inicial
        if (password !== confirmPassword) {
          throw new Error('Las contraseñas no coinciden.');
        }
        await setupOwner(email, password);
      } else if (authMode === 'register') {
        // Registro con PIN
        if (!pin.trim()) {
          throw new Error('Debes introducir un PIN de invitación.');
        }
        await register(email, password, pin.trim());
      } else {
        // Login normal
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-panel-bg flex flex-col items-center justify-center p-4">
      {/* ── Logo y Título ── */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-panel-accent/10 border border-panel-accent/20 mb-3 shadow-lg shadow-panel-accent/5">
          <Shield size={28} className="text-panel-accent" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
          CraftPanel <span className="text-panel-accent text-xs px-2 py-0.5 rounded-full bg-panel-accent/10 border border-panel-accent/20 font-mono">v0.1.0</span>
        </h1>
        <p className="text-sm text-panel-muted mt-1">
          Panel de Control Premium para Servidores de Minecraft
        </p>
      </div>

      {/* ── Tarjeta de Formulario ── */}
      <div className="w-full max-w-md rounded-2xl border border-panel-border bg-panel-surface p-7 shadow-2xl">
        {!initialized ? (
          /* Caso 1: Setup Inicial del Dueño */
          <div>
            <div className="flex items-center gap-2.5 mb-2 text-amber-400">
              <Sparkles size={18} />
              <h2 className="text-lg font-bold text-white">Configuración Inicial</h2>
            </div>
            <p className="text-xs text-panel-muted mb-6 leading-relaxed">
              Eres el primer usuario en acceder al panel. Esta cuenta se configurará como el 
              <strong className="text-white"> Dueño (Owner)</strong> con acceso total y control de permisos.
            </p>
          </div>
        ) : (
          /* Caso 2: Sistema ya inicializado (Tabs Login / Registro con PIN) */
          <div className="flex items-center gap-1 rounded-xl border border-panel-border bg-panel-bg p-1 text-xs mb-6">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-colors ${
                authMode === 'login'
                  ? 'bg-panel-accent text-white shadow'
                  : 'text-panel-muted hover:text-white'
              }`}
            >
              <LogIn size={14} /> Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setError('');
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-colors ${
                authMode === 'register'
                  ? 'bg-panel-accent text-white shadow'
                  : 'text-panel-muted hover:text-white'
              }`}
            >
              <KeyRound size={14} /> Unirse con PIN
            </button>
          </div>
        )}

        {/* ── Mensaje de Error ── */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 flex items-start gap-2">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PIN de Invitación (Solo en modo registro) */}
          {initialized && authMode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-panel-muted mb-1.5">
                PIN de Invitación
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-panel-muted" />
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.toUpperCase())}
                  placeholder="Ej: ABC789"
                  maxLength={10}
                  className="w-full rounded-xl border border-panel-border bg-panel-bg pl-10 pr-4 py-2.5 text-sm font-mono tracking-widest uppercase text-white outline-none focus:border-panel-accent/60 transition-colors placeholder:normal-case placeholder:font-sans placeholder:tracking-normal placeholder:text-zinc-600"
                  required
                />
              </div>
              <span className="text-[11px] text-panel-muted mt-1 block">
                Pídele un PIN al dueño del servidor para unirte.
              </span>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-panel-muted mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-panel-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full rounded-xl border border-panel-border bg-panel-bg pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-panel-accent/60 transition-colors placeholder:text-zinc-600"
                required
              />
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-xs font-medium text-panel-muted mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-panel-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-panel-border bg-panel-bg pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-panel-accent/60 transition-colors placeholder:text-zinc-600"
                required
              />
            </div>
          </div>

          {/* Confirmar Contraseña (Solo en setup inicial) */}
          {!initialized && (
            <div>
              <label className="block text-xs font-medium text-panel-muted mb-1.5">
                Confirmar Contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-panel-muted" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-panel-border bg-panel-bg pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-panel-accent/60 transition-colors placeholder:text-zinc-600"
                  required
                />
              </div>
            </div>
          )}

          {/* Botón Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 rounded-xl bg-panel-accent py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50 shadow-md shadow-panel-accent/10"
          >
            {submitting ? (
              'Procesando...'
            ) : !initialized ? (
              'Crear Cuenta de Dueño'
            ) : authMode === 'register' ? (
              'Completar Registro'
            ) : (
              'Entrar al Panel'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
