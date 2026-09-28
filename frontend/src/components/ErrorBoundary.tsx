// ============================================================
// ErrorBoundary.tsx — Capturador de Errores de Renderizado
// ============================================================
// Evita que cualquier excepción de renderizado en un subcomponente
// desmonte toda la aplicación o deje la pantalla en blanco.
// ============================================================

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Error no capturado en componente:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0d1117] text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4 shadow-lg shadow-red-500/5">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">
            {this.props.fallbackTitle || 'Ha ocurrido un error al cargar esta sección'}
          </h2>
          <p className="text-xs text-panel-muted max-w-md mb-6 leading-relaxed">
            {this.state.error?.message || 'Error inesperado al renderizar la interfaz.'}
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-panel-accent hover:bg-panel-accent-hover text-white text-xs font-semibold shadow transition-colors"
          >
            <RefreshCw size={14} />
            <span>Reintentar</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
