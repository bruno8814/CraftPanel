# 🐧 Guía Definitiva de Despliegue en Proxmox VE — CraftPanel

Esta guía explica paso a paso cómo desplegar **CraftPanel** en un entorno **Proxmox Virtual Environment (VE)**, ya sea dentro de un **Contenedor LXC (Recomendado)** o en una **Máquina Virtual (VM)** con Debian 12.

---

## 🎯 ¿LXC o VM? ¿Cuál elegir?

| Criterio | Contenedor LXC (Recomendado) | Máquina Virtual (VM) |
|---|---|---|
| **Consumo de RAM/CPU** | ⚡ Mínimo overhead (~150MB para el SO base) | Requiere asignar RAM fija reservada |
| **Almacenamiento ZFS** | Montaje nativo directo de sub-datasets ZFS | Discos virtuales `.qcow2` o `raw` sobre ZFS |
| **Rendimiento Minecraft** | Rendimiento nativo casi idéntico al host | Ligera pérdida por virtualización KVM |
| **Backups Proxmox (PBS)** | Rápidos y ocupan muy poco espacio | Más pesados |

> [!TIP]
> **Recomendación:** Usa un **Contenedor LXC (Debian 12 Bookworm, Unprivileged)**. Es el método más eficiente en recursos para servidores de juegos en Proxmox.

---

## 📦 Paso 1: Crear el Contenedor LXC en Proxmox

1. En la interfaz web de Proxmox, pulsa **"Create CT"**.
2. **General:**
   * CT ID: `100` (o el que prefieras).
   * Hostname: `craftpanel`.
   * Unprivileged container: `Yes` (marcado).
   * Password de root seguro.
3. **Template:**
   * Selecciona la plantilla `debian-12-standard` (descárgala si no la tienes en `local:vztmpl`).
4. **Disks:**
   * Almacenamiento: `local-zfs`.
   * Disk size: `20 GB` (para el sistema base de CraftPanel).
5. **CPU:**
   * Cores: `4` o más (según la potencia de tu procesador).
6. **Memory:**
   * Memory: `8192 MB` (8 GB, según los servidores y mods que vayas a levantar).
   * Swap: `2048 MB`.
7. **Network:**
   * Bridge: `vmbr0`.
   * IPv4: `DHCP` o IP estática (ej. `192.168.1.150/24`, Gateway: `192.168.1.1`).
8. Completa el asistente e inicia el contenedor.

---

## 🗄️ Paso 2 (Opcional): Punto de Montaje ZFS para los Servidores

Si tienes un pool ZFS dedicado para datos de juegos en Proxmox (ej. `zpool-nvme/minecraft`), puedes vincularlo directamente dentro del contenedor:

En la shell del **host de Proxmox** (nodo principal):
```bash
# Crear el dataset en tu pool ZFS
zfs create zpool-nvme/servidores_mc

# Ajustar permisos para el usuario del contenedor unprivileged (ID mapping 100000)
chown -R 100000:100000 /zpool-nvme/servidores_mc

# Montar en el contenedor 100 en la ruta /mnt/servidores
pct set 100 -mp0 /zpool-nvme/servidores_mc,mp=/mnt/servidores
```

Luego, en el archivo `.env` de CraftPanel solo tendrás que poner:
```bash
SERVERS_DIR=/mnt/servidores
```
¡Así los mundos y servidores residen directamente en tu almacenamiento ZFS ultrarrápido!

---

## ⚡ Método Rápido: Instalación Automática en 1 Solo Comando

Si ya tienes el proyecto copiado o clonado en tu contenedor, o quieres hacerlo de forma desatendida:

```bash
# Dar permisos de ejecución y lanzar el instalador
chmod +x install.sh
sudo ./install.sh
```

El script `install.sh` se encargará automáticamente de:
1. Actualizar repositorios del sistema.
2. Instalar **OpenJDK 21 LTS**, Git, curl y herramientas esenciales.
3. Instalar **Node.js 20 LTS** oficial (NodeSource).
4. Preparar `/opt/craftpanel`, instalar dependencias y compilar con TypeScript y Vite.
5. Configurar `.env` e instalar y habilitar el servicio `systemd` para arranque automático.
6. Mostrarte la IP y el enlace directo para abrir el panel en tu navegador.

---

## ⚙️ Método Manual: Paso a Paso

Si prefieres realizar la instalación paso a paso de forma manual, sigue los siguientes pasos:

### 1. Instalar Dependencias (Java 21 y Node.js 20)

Entra a la consola del contenedor LXC y ejecuta:

```bash
# 1. Actualizar repositorios
apt-get update && apt-get upgrade -y

# 2. Instalar herramientas básicas y OpenJDK 21 (Requerido para MC 1.20.6 / 1.21 / NeoForge)
apt-get install -y curl wget git unzip openjdk-21-jre-headless

# Comprobar versión de Java
java -version
# Debe responder: openjdk version "21.x.x"

# 3. Instalar Node.js 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Comprobar versión de Node y npm
node -v   # Debe ser v20.x.x
npm -v    # Debe ser 10.x.x
```

---

## 🚀 Paso 4: Desplegar CraftPanel

1. Clona o copia tu carpeta del proyecto a `/opt/craftpanel`:
```bash
# Opción A: Copiar vía rsync / scp desde tu PC
# scp -r ./E-mail/* root@192.168.1.150:/opt/craftpanel/

# Opción B: Crear la carpeta y clonar repositorio
mkdir -p /opt/craftpanel
cd /opt/craftpanel
```

2. Instalar dependencias y compilar para producción:
```bash
cd /opt/craftpanel

# Instalar dependencias raíz y del frontend
npm install
npm install --prefix frontend

# Compilar frontend y backend en un solo paso
npm run build
```

3. Crear tu archivo de configuración `.env`:
```bash
cp .env.example .env
nano .env
```
Ajusta el puerto (`PORT=3000`) y las rutas (`SERVERS_DIR` y `DATA_DIR`) si usas montajes ZFS.

---

## 🔄 Paso 5: Configurar el Servicio Systemd (Auto-arranque)

Para que CraftPanel se inicie automáticamente cuando arranque el contenedor LXC y se reinicie solo si ocurre un fallo:

```bash
# 1. Copiar el archivo de servicio
cp /opt/craftpanel/deploy/craftpanel.service /etc/systemd/system/

# 2. Recargar systemd
systemctl daemon-reload

# 3. Habilitar y arrancar el servicio
systemctl enable --now craftpanel

# 4. Comprobar que está corriendo
systemctl status craftpanel
```

### Comandos útiles de mantenimiento:
* **Ver logs en tiempo real:**
  ```bash
  journalctl -u craftpanel -f
  ```
* **Reiniciar el panel:**
  ```bash
  systemctl restart craftpanel
  ```
* **Detener el panel de forma segura:**
  ```bash
  systemctl stop craftpanel
  ```
  *(El servicio enviará automáticamente la señal `SIGTERM`, guardando los mundos de Minecraft con `save-all` antes de apagarse).*

---

## 🌐 Paso 6: Puertos a Abrir / Reenviar en el Router

Para acceder desde tu red local o desde Internet:

| Puerto | Protocolo | Servicio |
|---|---|---|
| `3000` | TCP | Panel Web de CraftPanel |
| `25565` | TCP/UDP | Servidor Minecraft 1 (puerto por defecto) |
| `25566+` | TCP/UDP | Servidores adicionales de Minecraft creados en el panel |

> Si usas **Nginx Proxy Manager** o **Cloudflare Tunnels**, puedes apuntar un dominio (ej. `panel.tudominio.com`) al puerto `3000` con SSL automático.

---

## 🔄 Actualizaciones Futuras del Sistema

CraftPanel incluye dos métodos para actualizarse sin perder tus servidores ni configuraciones:

### Opción 1: Directamente desde el Panel Web (Recomendado)
1. Inicia sesión como **Dueño (Owner)**.
2. Si has subido cambios o parches a tu repositorio de GitHub, aparecerá un indicador dorado en la barra superior: **"Actualizar"**.
3. Haz clic en el botón, revisa los commits pendientes y pulsa **"Actualizar Panel Ahora"**.
4. El servidor ejecutará `git pull`, compilará la nueva versión y se reiniciará automáticamente con una cuenta regresiva de 5 segundos.

### Opción 2: Desde la Terminal Linux
Entra a la carpeta de CraftPanel y ejecuta:
```bash
./update.sh
```
El script descargará los cambios de GitHub, actualizará dependencias, recompilará y reiniciará el servicio systemd en un solo paso.
