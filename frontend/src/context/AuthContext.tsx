// ============================================================
// AuthContext.tsx — Contexto global de autenticación y permisos
// ============================================================
// Gestiona el estado del usuario conectado, verificación de tokens
// y funciones auxiliares para validar permisos en la UI.
// ============================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserPublic, Permission } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  user: UserPublic | null;
  loading: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  setupOwner: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, pin: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: Permission) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(true);

  // ── Verificar sesión al cargar ──
  const checkAuth = async () => {
    setLoading(true);
    try {
      // 1. Comprobar si el sistema está inicializado (si existe un Owner)
      const status = await api.getAuthStatus();
      setInitialized(status.initialized);

      if (!status.initialized) {
        setUser(null);
        setLoading(false);
        return;
      }

      // 2. Si hay token en localStorage, obtener perfil
      const token = localStorage.getItem('craftpanel_token');
      if (token) {
        try {
          const me = await api.getMe();
          setUser(me);
        } catch {
          // Token inválido o expirado
          localStorage.removeItem('craftpanel_token');
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Error al comprobar autenticación:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    localStorage.setItem('craftpanel_token', res.token);
    setUser(res.user);
  };

  const setupOwner = async (email: string, password: string) => {
    const res = await api.setupOwner({ email, password });
    localStorage.setItem('craftpanel_token', res.token);
    setUser(res.user);
    setInitialized(true);
  };

  const register = async (email: string, password: string, pin: string) => {
    const res = await api.register({ email, password, pin });
    localStorage.setItem('craftpanel_token', res.token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem('craftpanel_token');
    setUser(null);
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    if (user.isOwner) return true;
    return user.permissions.includes(permission);
  };

  const refreshUser = async () => {
    try {
      const me = await api.getMe();
      setUser(me);
    } catch {
      logout();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        initialized,
        login,
        setupOwner,
        register,
        logout,
        hasPermission,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
}
