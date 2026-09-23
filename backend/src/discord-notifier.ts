// ============================================================
// discord-notifier.ts — Notificador a Webhooks de Discord
// ============================================================
// Envía mensajes enriquecidos (Embeds) con formato moderno para:
//   - Servidor iniciado / detenido
//   - Caídas (crashes) y auto-recuperación
//   - Jugadores conectados / desconectados
//   - Copias de seguridad completadas
// ============================================================

import { DiscordEmbed, ServerState } from './types';

// Colores hexadecimales para los embeds de Discord
export const DISCORD_COLORS = {
  SUCCESS: 0x2ecc71, // Verde esmeralda
  DANGER: 0xe74c3c,  // Rojo
  WARNING: 0xf39c12, // Ámbar
  INFO: 0x3498db,    // Azul
  PURPLE: 0x9b59b6,  // Púrpura
  BLURPLE: 0x5865F2, // Discord Blurple
};

const CRAFTPANEL_ICON = 'https://raw.githubusercontent.com/feathericons/feather/master/icons/server.png';

/**
 * Envía un payload a un webhook de Discord mediante HTTP POST.
 */
export async function sendDiscordWebhook(
  webhookUrl: string,
  embed: DiscordEmbed
): Promise<{ ok: boolean; error?: string }> {
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    return { ok: false, error: 'URL de webhook de Discord no válida.' };
  }

  try {
    const payload = {
      username: 'CraftPanel',
      avatar_url: CRAFTPANEL_ICON,
      embeds: [
        {
          ...embed,
          timestamp: embed.timestamp || new Date().toISOString(),
          footer: embed.footer || {
            text: 'CraftPanel • Minecraft Server Management',
            icon_url: CRAFTPANEL_ICON,
          },
        },
      ],
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Discord respondió con estado ${res.status}: ${text}` };
    }

    return { ok: true };
  } catch (err: any) {
    console.error('[DiscordNotifier] Error al enviar webhook:', err);
    return { ok: false, error: err.message };
  }
}

// ── Notificaciones preformateadas ───────────────────────────

/**
 * Mensaje de prueba interactivo.
 */
export async function sendTestNotification(
  webhookUrl: string,
  serverName: string
): Promise<{ ok: boolean; error?: string }> {
  const embed: DiscordEmbed = {
    title: '🔔 Notificación de Prueba — CraftPanel',
    description: `¡El webhook de Discord está conectado y funcionando correctamente con el servidor **${serverName}**!`,
    color: DISCORD_COLORS.BLURPLE,
    fields: [
      { name: '🌐 Estado', value: 'Conexión verificada', inline: true },
      { name: '🛡️ Seguridad', value: 'Monitorización activa', inline: true },
    ],
  };

  return sendDiscordWebhook(webhookUrl, embed);
}

/**
 * Notificación de arranque de servidor.
 */
export async function sendStartNotification(
  webhookUrl: string,
  server: ServerState
): Promise<{ ok: boolean; error?: string }> {
  const { config } = server;
  const embed: DiscordEmbed = {
    title: `🟢 Servidor Iniciado: ${config.name}`,
    description: `El servidor de Minecraft se ha iniciado y está listo para recibir jugadores.`,
    color: DISCORD_COLORS.SUCCESS,
    fields: [
      { name: '⚙️ Software', value: `${config.software} ${config.version}`, inline: true },
      { name: '🔌 Puerto', value: `${config.port}`, inline: true },
      { name: '🧠 RAM Asignada', value: `${(config.memoryMB / 1024).toFixed(1)} GB`, inline: true },
    ],
  };

  return sendDiscordWebhook(webhookUrl, embed);
}

/**
 * Notificación de parada de servidor.
 */
export async function sendStopNotification(
  webhookUrl: string,
  server: ServerState,
  uptimeSeconds: number
): Promise<{ ok: boolean; error?: string }> {
  const formatUptime = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const embed: DiscordEmbed = {
    title: `🔴 Servidor Detenido: ${server.config.name}`,
    description: `El servidor de Minecraft se ha apagado limpiamente.`,
    color: DISCORD_COLORS.DANGER,
    fields: [
      { name: '⏱️ Tiempo Activo (Uptime)', value: formatUptime(uptimeSeconds), inline: true },
      { name: '💾 Guardado de Mundo', value: 'Completado sin errores', inline: true },
    ],
  };

  return sendDiscordWebhook(webhookUrl, embed);
}

/**
 * Notificación de caída inesperada (Crash) y acción del Watchdog.
 */
export async function sendCrashNotification(
  webhookUrl: string,
  server: ServerState,
  exitCode: number | null,
  signal: string | null,
  lastLogLine: string | undefined,
  autoRestartTriggered: boolean,
  crashLoopSuppressed: boolean
): Promise<{ ok: boolean; error?: string }> {
  let title = `🚨 Caída Inesperada (Crash): ${server.config.name}`;
  let desc = `El proceso de Minecraft se ha cerrado de forma inesperada.`;
  let color = DISCORD_COLORS.DANGER;

  if (crashLoopSuppressed) {
    title = `⚠️ Bucle de Caídas Detectado (Crash Loop): ${server.config.name}`;
    desc = `Se han detectado **3 o más caídas sucesivas** en menos de 5 minutos. El Watchdog ha **detenido el auto-reinicio** para proteger el servidor de sobrecarga. Revisa los logs.`;
    color = DISCORD_COLORS.WARNING;
  } else if (autoRestartTriggered) {
    desc += ` El **Watchdog** está reiniciando el servidor automáticamente en 5 segundos...`;
  }

  const fields = [
    { name: '🛑 Código de Salida', value: `\`${exitCode ?? 'Desconocido'}\` (Señal: \`${signal ?? 'Ninguna'}\`)`, inline: true },
    {
      name: '🔄 Auto-recuperación',
      value: crashLoopSuppressed
        ? '🛑 Detenida (Bucle de fallos)'
        : autoRestartTriggered
        ? '✅ Reiniciando servidor...'
        : '❌ Desactivada',
      inline: true,
    },
  ];

  if (lastLogLine) {
    const cleanLog = lastLogLine.slice(0, 500);
    fields.push({
      name: '📋 Último log registrado',
      value: `\`\`\`${cleanLog}\`\`\``,
      inline: false,
    });
  }

  const embed: DiscordEmbed = {
    title,
    description: desc,
    color,
    fields,
  };

  return sendDiscordWebhook(webhookUrl, embed);
}

/**
 * Notificación de evento de jugador (Unión o Salida).
 */
export async function sendPlayerNotification(
  webhookUrl: string,
  serverName: string,
  playerName: string,
  event: 'joined' | 'left'
): Promise<{ ok: boolean; error?: string }> {
  const isJoin = event === 'joined';
  const embed: DiscordEmbed = {
    title: isJoin ? `👤 Jugador Conectado` : `👋 Jugador Desconectado`,
    description: isJoin
      ? `**${playerName}** ha entrado a **${serverName}**.`
      : `**${playerName}** ha salido de **${serverName}**`,
    color: isJoin ? DISCORD_COLORS.PURPLE : 0x7f8c8d,
    thumbnail: {
      url: `https://mc-heads.net/avatar/${encodeURIComponent(playerName)}/100`,
    },
  };

  return sendDiscordWebhook(webhookUrl, embed);
}

/**
 * Notificación de backup completado.
 */
export async function sendBackupNotification(
  webhookUrl: string,
  serverName: string,
  filename: string,
  sizeMB: number,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const embed: DiscordEmbed = {
    title: `💾 Copia de Seguridad Creada`,
    description: `Se ha generado un nuevo respaldo de **${serverName}**.`,
    color: DISCORD_COLORS.INFO,
    fields: [
      { name: '📦 Archivo', value: `\`${filename}\``, inline: false },
      { name: '📊 Tamaño', value: `${sizeMB.toFixed(2)} MB`, inline: true },
      { name: '📝 Nota', value: note || 'Copia automática', inline: true },
    ],
  };

  return sendDiscordWebhook(webhookUrl, embed);
}
