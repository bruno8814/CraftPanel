# 🎮 CraftPanel

> Panel de administración web moderno, ligero y completo para servidores de Minecraft (NeoForge, Paper, Fabric, Vanilla). Diseñado especialmente para **Proxmox VE (LXC/VM)**, servidores Linux y entornos locales.

---

## ✨ Características Principales

- ⚡ **Soporte Nativo Multi-Software:** Compatible con **NeoForge 1.21.1**, **Paper**, **Fabric** y **Vanilla** con descarga automática y autoconfiguración de argumentos Java 21 (`@user_jvm_args.txt`).
- 🖥️ **Consola en Tiempo Real:** WebSocket interactivo, filtrado de colores ANSI/Minecraft, entrada de comandos con historial (flechas ↑/↓).
- 🧩 **Workshop de Mods y Plugins:** Búsqueda en catálogo oficial de Modrinth v2, subida directa de archivos `.jar` (Drag & Drop), instalación por URL y enlace de respaldo para CurseForge.
- 📁 **Gestor de Archivos Seguro:** Explorador visual con migas de pan, editor de código integrado para archivos de configuración (`.yml`, `.properties`, `.json`, `.toml`) y protección contra Path Traversal.
- ⚙️ **Editor Visual de `server.properties`:** Ajustes organizados por categorías con interruptores intuitivos y pestaña de edición raw.
- 💾 **Copias de Seguridad en 1-Clic:** Respaldo en caliente sin apagar el servidor (`save-off` $\rightarrow$ `save-all flush` $\rightarrow$ compresión ZIP $\rightarrow$ `save-on`), candado de seguridad y restauración atómica.
- ⏰ **Horarios y Apagado Inteligente:** Automatización con reloj interno para encendido, backups y apagado nocturno escalonado con avisos en el chat (10m, 5m, 1m) y guardado previo.
- 🔔 **Alertas Discord y Watchdog:** Notificaciones con embeds para arranque, parada, caídas y jugadores. Guardián contra caídas (auto-reinicio en 5s con protección contra crash loop).
- 👥 **Sistema Multi-Usuario con PIN:** Registro de amigos con PINs de un solo uso generados por el Dueño (Owner) y permisos granulares por servidor.
- 🔄 **Actualizaciones en 1-Clic:** Sincronización directa con GitHub desde la barra superior del panel web o vía script `./update.sh`.

---

## 🚀 Despliegue Rápido en Proxmox VE / Debian 12

### Instalación Automática (Recomendada)
En tu contenedor LXC o VM de Proxmox con Debian 12:

```bash
# 1. Clonar el repositorio
git clone <URL-DE-TU-REPOSITORIO> /opt/craftpanel
cd /opt/craftpanel

# 2. Ejecutar el instalador automático
chmod +x install.sh
sudo ./install.sh
```

El script se encargará automáticamente de:
1. Instalar **OpenJDK 21 LTS** y **Node.js 20 LTS**.
2. Instalar dependencias y compilar la aplicación.
3. Registrar e iniciar el servicio `systemd` con reinicio automático.
4. Mostrarte la IP de acceso para abrir el panel en tu navegador: `http://<TU_IP>:3000`.

Para más detalles sobre LXC vs VM y almacenamiento ZFS, consulta la [Guía de Despliegue en Proxmox](docs/GUIA_DESPLIEGUE_PROXMOX.md).

---

## 🛠️ Tecnologías Utilizadas

- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite.
- **Backend:** Node.js, Express, TypeScript, Socket.io, Archiver, Adm-Zip, pidusage.
- **Entorno:** OpenJDK 21 LTS, Systemd, Proxmox VE (LXC / Debian 12).

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
