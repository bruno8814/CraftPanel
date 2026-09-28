// ============================================================
// player-manager.ts — Gestor Visual de Jugadores de Minecraft
// ============================================================
// Gestiona:
//   - Jugadores conectados en vivo
//   - Lista de operadores (ops.json) con niveles de permiso
//   - Lista blanca (whitelist.json)
//   - Jugadores baneados (banned-players.json) y sus motivos
//   - IPs baneadas (banned-ips.json)
//   - Acciones en vivo: Kick, Ban, Dar/Quitar OP, Cambiar Gamemode,
//     Teletransporte al spawn y mensajes privados.
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  OpPlayer,
  WhitelistPlayer,
  BannedPlayer,
  BannedIp,
  ServerPlayersData,
  ServerState,
} from './types';
import { ServerManager } from './server-manager';
import { getConnectedPlayers, queryMinecraftServer } from './minecraft-query';
import { readServerProperties } from './properties';

/**
 * Genera un UUID versión 3 (offline/cracked) idéntico al que calcula
 * el servidor de Minecraft Java cuando online-mode=false.
 */
export function getOfflinePlayerUuid(username: string): string {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + username, 'utf-8').digest();
  // Versión 3 (name-based MD5)
  hash[6] = (hash[6] & 0x0f) | 0x30;
  // Variante IETF (10xx)
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Consulta la API oficial de Mojang para obtener el UUID oficial de una cuenta premium.
 * Si falla o no existe, recurre al UUID offline.
 */
export async function getPlayerUuid(username: string): Promise<string> {
  const cleanName = username.trim();
  try {
    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(cleanName)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.id) {
        const raw = data.id;
        return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
      }
    }
  } catch {}
  return getOfflinePlayerUuid(cleanName);
}

// ── Lectura y escritura segura de archivos JSON de Minecraft ──

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[PlayerManager] Error al guardar archivo JSON ${filePath}:`, err);
  }
}

// ── Obtener todos los datos de jugadores de un servidor ───────

export async function getServerPlayers(serverDir: string, serverId: string, port?: number): Promise<ServerPlayersData> {
  const ops = readJsonFile<OpPlayer[]>(path.join(serverDir, 'ops.json'), []);
  const whitelist = readJsonFile<WhitelistPlayer[]>(path.join(serverDir, 'whitelist.json'), []);
  const bannedPlayers = readJsonFile<BannedPlayer[]>(path.join(serverDir, 'banned-players.json'), []);
  const bannedIps = readJsonFile<BannedIp[]>(path.join(serverDir, 'banned-ips.json'), []);

  const props = readServerProperties(serverDir).properties;
  const whitelistEnabled = (props['white-list'] || 'false').toLowerCase() === 'true';

  let onlinePlayers = getConnectedPlayers(serverId);
  if (port) {
    try {
      const q = await queryMinecraftServer(port, serverId, 1000);
      if (q.players && q.players.length >= onlinePlayers.length) {
        onlinePlayers = q.players;
      }
    } catch {}
  }

  return {
    onlinePlayers,
    ops,
    whitelist,
    bannedPlayers,
    bannedIps,
    whitelistEnabled,
  };
}

// ── Acciones de Operadores (OPs) ─────────────────────────────

export async function addOpPlayer(
  server: ServerState,
  name: string,
  level: number = 4,
  manager: ServerManager
): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('El nombre de jugador no es válido.');

  if (server.status === 'ONLINE') {
    manager.sendCommand(server.config.id, `op ${cleanName}`);
  } else {
    const opsPath = path.join(server.config.directory, 'ops.json');
    const ops = readJsonFile<OpPlayer[]>(opsPath, []);
    const existingIdx = ops.findIndex((o) => o.name.toLowerCase() === cleanName.toLowerCase());
    const uuid = await getPlayerUuid(cleanName);

    const opEntry: OpPlayer = {
      uuid,
      name: cleanName,
      level,
      bypassesPlayerLimit: false,
    };

    if (existingIdx >= 0) {
      ops[existingIdx] = opEntry;
    } else {
      ops.push(opEntry);
    }
    writeJsonFile(opsPath, ops);
  }
}

export function removeOpPlayer(
  server: ServerState,
  name: string,
  manager: ServerManager
): void {
  const cleanName = name.trim();
  if (server.status === 'ONLINE') {
    manager.sendCommand(server.config.id, `deop ${cleanName}`);
  } else {
    const opsPath = path.join(server.config.directory, 'ops.json');
    const ops = readJsonFile<OpPlayer[]>(opsPath, []);
    const filtered = ops.filter((o) => o.name.toLowerCase() !== cleanName.toLowerCase());
    writeJsonFile(opsPath, filtered);
  }
}

// ── Acciones de Whitelist ────────────────────────────────────

export async function addWhitelistPlayer(
  server: ServerState,
  name: string,
  manager: ServerManager
): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('El nombre de jugador no es válido.');

  if (server.status === 'ONLINE') {
    manager.sendCommand(server.config.id, `whitelist add ${cleanName}`);
  } else {
    const wlPath = path.join(server.config.directory, 'whitelist.json');
    const list = readJsonFile<WhitelistPlayer[]>(wlPath, []);
    if (!list.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
      const uuid = await getPlayerUuid(cleanName);
      list.push({ uuid, name: cleanName });
      writeJsonFile(wlPath, list);
    }
  }
}

export function removeWhitelistPlayer(
  server: ServerState,
  name: string,
  manager: ServerManager
): void {
  const cleanName = name.trim();
  if (server.status === 'ONLINE') {
    manager.sendCommand(server.config.id, `whitelist remove ${cleanName}`);
  } else {
    const wlPath = path.join(server.config.directory, 'whitelist.json');
    const list = readJsonFile<WhitelistPlayer[]>(wlPath, []);
    const filtered = list.filter((p) => p.name.toLowerCase() !== cleanName.toLowerCase());
    writeJsonFile(wlPath, filtered);
  }
}

// ── Acciones de Baneos (Jugadores e IPs) ──────────────────────

export async function banPlayer(
  server: ServerState,
  name: string,
  reason: string = 'Baneado por el administrador',
  manager: ServerManager
): Promise<void> {
  const cleanName = name.trim();
  const cleanReason = reason.trim() || 'Baneado por el administrador';

  if (server.status === 'ONLINE') {
    manager.sendCommand(server.config.id, `ban ${cleanName} ${cleanReason}`);
  } else {
    const banPath = path.join(server.config.directory, 'banned-players.json');
    const list = readJsonFile<BannedPlayer[]>(banPath, []);
    const uuid = await getPlayerUuid(cleanName);
    const existingIdx = list.findIndex((p) => p.name.toLowerCase() === cleanName.toLowerCase());

    const banEntry: BannedPlayer = {
      uuid,
      name: cleanName,
      created: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' +0000',
      source: 'CraftPanel',
      expires: 'forever',
      reason: cleanReason,
    };

    if (existingIdx >= 0) {
      list[existingIdx] = banEntry;
    } else {
      list.push(banEntry);
    }
    writeJsonFile(banPath, list);
  }
}

export function unbanPlayer(
  server: ServerState,
  name: string,
  manager: ServerManager
): void {
  const cleanName = name.trim();
  if (server.status === 'ONLINE') {
    manager.sendCommand(server.config.id, `pardon ${cleanName}`);
  } else {
    const banPath = path.join(server.config.directory, 'banned-players.json');
    const list = readJsonFile<BannedPlayer[]>(banPath, []);
    const filtered = list.filter((p) => p.name.toLowerCase() !== cleanName.toLowerCase());
    writeJsonFile(banPath, filtered);
  }
}

export function banIp(
  server: ServerState,
  ip: string,
  reason: string = 'IP Bloqueada',
  manager: ServerManager
): void {
  const cleanIp = ip.trim();
  if (server.status === 'ONLINE') {
    manager.sendCommand(server.config.id, `ban-ip ${cleanIp} ${reason}`);
  } else {
    const banPath = path.join(server.config.directory, 'banned-ips.json');
    const list = readJsonFile<BannedIp[]>(banPath, []);
    list.push({
      ip: cleanIp,
      created: new Date().toISOString(),
      source: 'CraftPanel',
      expires: 'forever',
      reason,
    });
    writeJsonFile(banPath, list);
  }
}

export function unbanIp(
  server: ServerState,
  ip: string,
  manager: ServerManager
): void {
  const cleanIp = ip.trim();
  if (server.status === 'ONLINE') {
    manager.sendCommand(server.config.id, `pardon-ip ${cleanIp}`);
  } else {
    const banPath = path.join(server.config.directory, 'banned-ips.json');
    const list = readJsonFile<BannedIp[]>(banPath, []);
    const filtered = list.filter((p) => p.ip !== cleanIp);
    writeJsonFile(banPath, filtered);
  }
}

// ── Acciones en Vivo sobre Jugadores Conectados ───────────────

export function kickPlayer(
  server: ServerState,
  name: string,
  reason: string = 'Expulsado por el administrador',
  manager: ServerManager
): void {
  if (server.status !== 'ONLINE') {
    throw new Error('El servidor debe estar ONLINE para expulsar jugadores.');
  }
  manager.sendCommand(server.config.id, `kick ${name.trim()} ${reason.trim()}`);
}

export function setPlayerGamemode(
  server: ServerState,
  name: string,
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator',
  manager: ServerManager
): void {
  if (server.status !== 'ONLINE') {
    throw new Error('El servidor debe estar ONLINE para cambiar el modo de juego.');
  }
  manager.sendCommand(server.config.id, `gamemode ${gamemode} ${name.trim()}`);
}

export function teleportPlayerToSpawn(
  server: ServerState,
  name: string,
  manager: ServerManager
): void {
  if (server.status !== 'ONLINE') {
    throw new Error('El servidor debe estar ONLINE para teletransportar jugadores.');
  }
  manager.sendCommand(server.config.id, `execute in minecraft:overworld run tp ${name.trim()} 0 100 0`);
}

export function sendWhisperToPlayer(
  server: ServerState,
  name: string,
  message: string,
  manager: ServerManager
): void {
  if (server.status !== 'ONLINE') {
    throw new Error('El servidor debe estar ONLINE para enviar mensajes.');
  }
  manager.sendCommand(server.config.id, `tellraw ${name.trim()} {"text":"[Admin]: ${message.trim()}","color":"gold","bold":true}`);
}
