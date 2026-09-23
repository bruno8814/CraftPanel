// ============================================================
// auth.ts — Sistema de autenticación, permisos y PINs
// ============================================================
// Gestiona:
// 1. Usuarios con contraseñas hasheadas de forma segura (crypto nativo)
// 2. Roles y permisos granulares
// 3. Tokens de sesión seguros
// 4. Generación y validación de PINs de invitación
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// ── Tipos y Permisos ────────────────────────────────────────

export type Permission =
  | 'servers:view'     // Ver servidores y su estado
  | 'servers:control'  // Iniciar, parar, reiniciar
  | 'servers:console'  // Ver consola y enviar comandos
  | 'servers:create'   // Crear nuevos servidores
  | 'servers:delete'   // Eliminar servidores
  | 'workshop:manage'  // Instalar y desinstalar mods/plugins
  | 'files:edit'       // Ver y editar archivos
  | 'settings:edit'    // Modificar server.properties
  | 'users:manage';    // Administrar usuarios y PINs

export const ALL_PERMISSIONS: Permission[] = [
  'servers:view',
  'servers:control',
  'servers:console',
  'servers:create',
  'servers:delete',
  'workshop:manage',
  'files:edit',
  'settings:edit',
  'users:manage',
];

export const DEFAULT_FRIEND_PERMISSIONS: Permission[] = [
  'servers:view',
];

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  isOwner: boolean;
  permissions: Permission[];
  createdAt: string;
}

export interface UserPublic {
  id: string;
  email: string;
  isOwner: boolean;
  permissions: Permission[];
  createdAt: string;
}

export interface InvitationPin {
  code: string;
  createdBy: string;
  createdAt: string;
  used: boolean;
  usedBy?: string;
  usedAt?: string;
}

// ── Almacenamiento persistente en JSON ──────────────────────

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PINS_FILE = path.join(DATA_DIR, 'pins.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getSecretKey(): string {
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf-8');
  }
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, key, 'utf-8');
  return key;
}

function loadUsers(): User[] {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveUsers(users: User[]) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function loadPins(): InvitationPin[] {
  ensureDataDir();
  if (!fs.existsSync(PINS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(PINS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function savePins(pins: InvitationPin[]) {
  ensureDataDir();
  fs.writeFileSync(PINS_FILE, JSON.stringify(pins, null, 2), 'utf-8');
}

// ── Criptografía (Hashing y Tokens) ─────────────────────────

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function createToken(userId: string): string {
  const secret = getSecretKey();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 días
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt })).toString('base64');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifyToken(token: string): string | null {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;

    const secret = getSecretKey();
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));
    if (payload.expiresAt < Date.now()) return null;

    return payload.userId;
  } catch {
    return null;
  }
}

export function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    isOwner: user.isOwner,
    permissions: user.permissions,
    createdAt: user.createdAt,
  };
}

// ── Métodos de Usuario ──────────────────────────────────────

export function isSystemInitialized(): boolean {
  const users = loadUsers();
  return users.length > 0;
}

export function createOwner(email: string, password: string): UserPublic {
  const users = loadUsers();
  if (users.length > 0) {
    throw new Error('El sistema ya tiene un Administrador configurado.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);

  const owner: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    passwordHash,
    salt,
    isOwner: true,
    permissions: ALL_PERMISSIONS,
    createdAt: new Date().toISOString(),
  };

  users.push(owner);
  saveUsers(users);
  return toPublicUser(owner);
}

export function authenticateUser(email: string, password: string): { user: UserPublic; token: string } {
  const users = loadUsers();
  const user = users.find((u) => u.email === email.toLowerCase().trim());
  if (!user) {
    throw new Error('Correo o contraseña incorrectos.');
  }

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    throw new Error('Correo o contraseña incorrectos.');
  }

  const token = createToken(user.id);
  return { user: toPublicUser(user), token };
}

export function registerWithPin(email: string, password: string, pinCode: string): { user: UserPublic; token: string } {
  const users = loadUsers();
  const cleanEmail = email.toLowerCase().trim();

  if (users.some((u) => u.email === cleanEmail)) {
    throw new Error('Ya existe una cuenta registrada con este correo.');
  }

  // Validar PIN
  const pins = loadPins();
  const pin = pins.find((p) => p.code.toUpperCase() === pinCode.trim().toUpperCase() && !p.used);
  if (!pin) {
    throw new Error('El PIN de invitación es inválido o ya ha sido utilizado.');
  }

  // Marcar PIN como usado
  pin.used = true;
  pin.usedBy = cleanEmail;
  pin.usedAt = new Date().toISOString();
  savePins(pins);

  // Crear usuario con permisos iniciales de invitado
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);

  const newUser: User = {
    id: crypto.randomUUID(),
    email: cleanEmail,
    passwordHash,
    salt,
    isOwner: false,
    permissions: DEFAULT_FRIEND_PERMISSIONS,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);

  const token = createToken(newUser.id);
  return { user: toPublicUser(newUser), token };
}

export function getUserById(id: string): UserPublic | null {
  const users = loadUsers();
  const user = users.find((u) => u.id === id);
  return user ? toPublicUser(user) : null;
}

export function getAllUsers(): UserPublic[] {
  return loadUsers().map(toPublicUser);
}

export function updateUserPermissions(userId: string, permissions: Permission[]): UserPublic {
  const users = loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('Usuario no encontrado.');
  if (user.isOwner) throw new Error('No se pueden modificar los permisos del Dueño principal.');

  user.permissions = permissions;
  saveUsers(users);
  return toPublicUser(user);
}

export function deleteUser(userId: string): void {
  const users = loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('Usuario no encontrado.');
  if (user.isOwner) throw new Error('No se puede eliminar la cuenta del Dueño principal.');

  const filtered = users.filter((u) => u.id !== userId);
  saveUsers(filtered);
}

// ── Métodos de PINs de Invitación ───────────────────────────

export function generatePin(createdByEmail: string): InvitationPin {
  const pins = loadPins();
  // PIN de 6 dígitos numéricos o letras fáciles de leer
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const newPin: InvitationPin = {
    code,
    createdBy: createdByEmail,
    createdAt: new Date().toISOString(),
    used: false,
  };

  pins.push(newPin);
  savePins(pins);
  return newPin;
}

export function getAllPins(): InvitationPin[] {
  return loadPins();
}

export function revokePin(code: string): void {
  const pins = loadPins();
  const filtered = pins.filter((p) => p.code !== code);
  savePins(filtered);
}

// ── Middleware de Express para Autenticación ─────────────────

export interface AuthenticatedRequest extends Request {
  user?: UserPublic;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Si el sistema aún no ha sido inicializado (no hay owner), permitir paso para el setup
  if (!isSystemInitialized()) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'No autorizado: sesión no iniciada.' });
    return;
  }

  const token = authHeader.slice(7);
  const userId = verifyToken(token);
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Sesión expirada o inválida.' });
    return;
  }

  const user = getUserById(userId);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Usuario no encontrado.' });
    return;
  }

  req.user = user;
  next();
}

/**
 * Middleware para requerir un permiso específico.
 */
export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ ok: false, error: 'No autenticado.' });
      return;
    }

    if (req.user.isOwner || req.user.permissions.includes(permission)) {
      return next();
    }

    res.status(403).json({
      ok: false,
      error: `Permiso denegado. Se requiere: ${permission}`,
    });
  };
}
