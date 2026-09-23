// ============================================================
// minecraft-query.ts — Consulta de Estado y Jugadores de Minecraft
// ============================================================
// Implementa:
//   1. Cliente nativo de Server List Ping (SLP) con sockets TCP puros
//   2. Detección instantánea de jugadores conectados mediante logs
//   3. Medición de latencia (ping) y cálculo de salud de TPS
// ============================================================

import net from 'net';

/** Información de un jugador conectado */
export interface ConnectedPlayer {
  name: string;
  uuid?: string;
  avatarUrl: string;
  joinedAt?: string;
  pingMs?: number;
}

/** Resultado de una consulta de estado a Minecraft */
export interface MinecraftQueryResult {
  online: boolean;
  versionName?: string;
  motd?: string;
  playersOnline: number;
  playersMax: number;
  players: ConnectedPlayer[];
  pingMs: number | null;
  tps: number;
  favicon?: string;
}

// ── Helpers para el protocolo binario de Minecraft (VarInt) ──

/**
 * Codifica un entero en el formato VarInt de Minecraft.
 */
function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let temp = value;
  while (true) {
    if ((temp & 0xffffff80) === 0) {
      bytes.push(temp);
      return Buffer.from(bytes);
    }
    bytes.push((temp & 0x7f) | 0x80);
    temp >>>= 7;
  }
}

/**
 * Lee un VarInt de un buffer binario.
 */
function readVarInt(buffer: Buffer, offset: number): { value: number; bytesRead: number } {
  let result = 0;
  let numRead = 0;
  let byte = 0;
  do {
    if (offset + numRead >= buffer.length) {
      throw new Error('Buffer incompleto al leer VarInt');
    }
    byte = buffer[offset + numRead];
    result |= (byte & 0x7f) << (7 * numRead);
    numRead++;
    if (numRead > 5) throw new Error('VarInt demasiado grande');
  } while ((byte & 0x80) !== 0);
  return { value: result, bytesRead: numRead };
}

// ── Rastreador de Jugadores por Logs de Consola ──────────────

/** Mapa en memoria de jugadores activos rastreados por consola */
const serverPlayersFromLogs = new Map<string, Map<string, ConnectedPlayer>>();

/** Callback para eventos de jugador (Discord notifier) */
let playerEventListener: ((serverId: string, playerName: string, event: 'joined' | 'left') => void) | undefined;

export function setOnPlayerEventListener(fn: (serverId: string, playerName: string, event: 'joined' | 'left') => void): void {
  playerEventListener = fn;
}

/**
 * Procesa una línea de log del servidor para detectar uniones y salidas de jugadores.
 */
export function handlePlayerLogLine(serverId: string, line: string): void {
  let playersMap = serverPlayersFromLogs.get(serverId);
  if (!playersMap) {
    playersMap = new Map();
    serverPlayersFromLogs.set(serverId, playersMap);
  }

  // Ejemplo: [14:22:10 INFO]: Notch joined the game
  // Ejemplo: [14:22:10 INFO]: Notch left the game
  // Ejemplo: [14:22:10 INFO]: UUID of player Notch is 069a79f4-44e9-4726-a5be-fca90e38aaf5
  
  // Detección de entrada
  const joinMatch = line.match(/:\s+([a-zA-Z0-9_]{2,16})\s+joined the game/);
  if (joinMatch) {
    const name = joinMatch[1];
    playersMap.set(name, {
      name,
      avatarUrl: `https://mc-heads.net/avatar/${name}/64`,
      joinedAt: new Date().toISOString(),
    });
    playerEventListener?.(serverId, name, 'joined');
    return;
  }

  // Detección de salida
  const leaveMatch = line.match(/:\s+([a-zA-Z0-9_]{2,16})\s+left the game/);
  if (leaveMatch) {
    const name = leaveMatch[1];
    playersMap.delete(name);
    playerEventListener?.(serverId, name, 'left');
    return;
  }

  // Detección de UUID oficial
  const uuidMatch = line.match(/UUID of player ([a-zA-Z0-9_]{2,16}) is ([a-f0-9-]+)/i);
  if (uuidMatch) {
    const name = uuidMatch[1];
    const uuid = uuidMatch[2];
    const existing = playersMap.get(name);
    if (existing) {
      existing.uuid = uuid;
      existing.avatarUrl = `https://mc-heads.net/avatar/${uuid}/64`;
    } else {
      playersMap.set(name, {
        name,
        uuid,
        avatarUrl: `https://mc-heads.net/avatar/${uuid}/64`,
        joinedAt: new Date().toISOString(),
      });
    }
  }
}

/**
 * Limpia la lista de jugadores de un servidor cuando se apaga.
 */
export function clearPlayersForServer(serverId: string): void {
  serverPlayersFromLogs.delete(serverId);
}

// ── Cliente nativo de Server List Ping (SLP) ─────────────────

/**
 * Realiza un Server List Ping al puerto local del servidor de Minecraft.
 * Devuelve la lista de jugadores, ping, versión y estimación de TPS.
 */
export function queryMinecraftServer(
  port: number,
  serverId: string,
  timeoutMs: number = 1500
): Promise<MinecraftQueryResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let receivedData = Buffer.alloc(0);
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);

    socket.on('timeout', () => {
      cleanup();
      // Si falla o no responde por timeout, usamos los jugadores detectados por logs
      const logPlayers = Array.from(serverPlayersFromLogs.get(serverId)?.values() || []);
      resolve({
        online: false,
        playersOnline: logPlayers.length,
        playersMax: 20,
        players: logPlayers,
        pingMs: null,
        tps: 20.0,
      });
    });

    socket.on('error', () => {
      cleanup();
      const logPlayers = Array.from(serverPlayersFromLogs.get(serverId)?.values() || []);
      resolve({
        online: false,
        playersOnline: logPlayers.length,
        playersMax: 20,
        players: logPlayers,
        pingMs: null,
        tps: 20.0,
      });
    });

    socket.connect(port, '127.0.0.1', () => {
      // 1. Enviar paquete Handshake
      // ID: 0x00, Proto: 765 (1.20.4+), Host: "127.0.0.1", Port, NextState: 1 (status)
      const host = '127.0.0.1';
      const hostBuf = Buffer.from(host, 'utf-8');
      const handshakePayload = Buffer.concat([
        writeVarInt(0x00),                     // Packet ID
        writeVarInt(765),                      // Protocol Version
        writeVarInt(hostBuf.length),           // Host string length
        hostBuf,                               // Host
        Buffer.from([(port >> 8) & 0xff, port & 0xff]), // Port (unsigned short BE)
        writeVarInt(1),                        // Next state: status
      ]);

      const handshakePacket = Buffer.concat([
        writeVarInt(handshakePayload.length),
        handshakePayload,
      ]);

      // 2. Enviar paquete Status Request (ID 0x00, sin payload)
      const requestPacket = Buffer.concat([
        writeVarInt(1),
        writeVarInt(0x00),
      ]);

      socket.write(Buffer.concat([handshakePacket, requestPacket]));
    });

    socket.on('data', (chunk) => {
      receivedData = Buffer.concat([receivedData, chunk]);

      try {
        // Intentamos leer el paquete completo
        let offset = 0;
        const { value: packetLength, bytesRead: lenBytes } = readVarInt(receivedData, offset);
        offset += lenBytes;

        if (receivedData.length < offset + packetLength) {
          // Aún no han llegado todos los bytes del paquete
          return;
        }

        const { value: packetId, bytesRead: idBytes } = readVarInt(receivedData, offset);
        offset += idBytes;

        if (packetId !== 0x00) {
          cleanup();
          return;
        }

        const { value: stringLength, bytesRead: strLenBytes } = readVarInt(receivedData, offset);
        offset += strLenBytes;

        const jsonString = receivedData.slice(offset, offset + stringLength).toString('utf-8');
        const pingMs = Date.now() - startTime;
        cleanup();

        const json = JSON.parse(jsonString);

        // Extraer motd limpio
        let motd = '';
        if (typeof json.description === 'string') {
          motd = json.description;
        } else if (json.description?.text) {
          motd = json.description.text;
        }

        // Extraer jugadores de la muestra SLP
        const samplePlayers: ConnectedPlayer[] = (json.players?.sample || []).map((p: any) => ({
          name: p.name,
          uuid: p.id,
          avatarUrl: `https://mc-heads.net/avatar/${p.id || p.name}/64`,
        }));

        // Combinar con los jugadores registrados por logs (por si alguno no viene en sample)
        const logMap = serverPlayersFromLogs.get(serverId) || new Map<string, ConnectedPlayer>();
        const mergedPlayersMap = new Map<string, ConnectedPlayer>();

        for (const p of samplePlayers) {
          mergedPlayersMap.set(p.name, p);
        }
        for (const [name, p] of logMap.entries()) {
          if (!mergedPlayersMap.has(name)) {
            mergedPlayersMap.set(name, p);
          }
        }

        const finalPlayers = Array.from(mergedPlayersMap.values());
        const onlineCount = json.players?.online ?? finalPlayers.length;

        // Estimar TPS: Si la latencia interna en 127.0.0.1 es < 50ms, el bucle de ticks está al 100% (20.0 TPS)
        let estimatedTps = 20.0;
        if (pingMs > 100) {
          // Si tarda más de 100ms en responder localmente, el servidor está ocupado
          estimatedTps = Math.max(5.0, Math.round((20.0 - (pingMs - 100) / 100) * 10) / 10);
        }

        resolve({
          online: true,
          versionName: json.version?.name,
          motd,
          playersOnline: onlineCount,
          playersMax: json.players?.max ?? 20,
          players: finalPlayers,
          pingMs,
          tps: estimatedTps,
          favicon: json.favicon,
        });
      } catch (err) {
        // En caso de fragmentación de paquetes, continuamos esperando el siguiente chunk
      }
    });
  });
}
