# 📖 Manual de Administración y Operaciones — CraftPanel

Guía práctica de referencia para administrar servidores de Minecraft, automatizaciones, copias de seguridad y usuarios en **CraftPanel**.

---

## 👑 1. Primer Inicio y Cuenta de Dueño (Owner)

Al acceder por primera vez a `http://localhost:3000` (o a la IP de tu servidor):
1. Verás la pantalla de **Configuración Inicial del Dueño**.
2. Introduce tu correo electrónico y una contraseña segura (mínimo 6 caracteres).
3. Esta cuenta tendrá el rango de **Dueño (Owner)** permanente con todos los privilegios administrativos desbloqueados.

---

## ⚡ 2. Creación de Servidores (NeoForge, Paper, Fabric, Vanilla)

Para crear un nuevo servidor:
1. En el Dashboard principal, pulsa el botón **"+ Nuevo Servidor"**.
2. **Nombre:** Asigna un nombre descriptivo (ej: *Mi Aventura NeoForge*, *Survival Técnico*).
3. **Software:**
   * **⚡ NeoForge:** Para modpacks modernos (Minecraft 1.21.1 / Create / Java 21). Descarga e instala automáticamente el servidor con un clic.
   * **📄 Paper:** Para servidores ligeros optimizados con plugins Bukkit/Spigot.
   * **🧵 Fabric:** Para mods modernos con enfoque ligero.
   * **🟫 Vanilla:** El servidor puro oficial de Mojang.
4. **Memoria RAM:** Asigna la memoria máxima deseada (ej. 4 GB, 6 GB, 8 GB). CraftPanel configurará automáticamente los flags de optimización Aikar GC y memoria mínima.
5. Pulsa **"Crear y Descargar"**. El panel se encargará de bajar el instalador oficial, ejecutarlo y preparar el servidor para arrancar.

---

## 🛠️ 3. Workshop de Mods y Respaldo CurseForge

En la pestaña **Mods** de tu servidor NeoForge o Fabric:

### Explorar Catálogo (Modrinth)
* Usa la barra de búsqueda para encontrar mods populares (*Create, JEI, Waystones, JourneyMap, Sophisticated Backpacks*).
* **Filtros dinámicos:** Si buscas un mod que esté listado para Forge o una versión anterior compatible, cambia el selector de **Loader** (*Forge*, *NeoForge*, *Todos*) y el de **Versión** (*Todas las versiones*).
* Pulsa **"Instalar"** para descargarlo con 1 clic en la carpeta `mods/`.

### Respaldo con Mods de CurseForge u otras fuentes
Si un mod o modpack exclusivo no está en Modrinth:
1. **Subir archivo .jar (Drag & Drop):**
   * Pulsa el botón **"Subir .jar"** en la cabecera.
   * Arrastra el archivo descargado desde CurseForge a la ventana emergente.
   * Se instalará inmediatamente en el servidor.
2. **Instalar por URL Directa:**
   * Pulsa el botón **"Instalar por URL"**.
   * Pega el enlace directo de descarga del archivo `.jar` (CurseForge CDN, GitHub Releases, etc.).
   * CraftPanel lo descargará directamente al servidor sin necesidad de descargarlo a tu ordenador.

### Activar / Desactivar Mods
* En la pestaña **"Instalados"**, puedes desactivar cualquier mod sin borrarlo pulsando el botón **"Desactivar"** (lo renombra a `.disabled` al instante).

---

## 💾 4. Copias de Seguridad (Backups)

En la pestaña **Backups**:
* **Crear Backup:** Pulsa **"Crear Copia"**. Si el servidor está encendido, CraftPanel ejecuta de forma transparente una secuencia de guardado seguro (`save-off` $\rightarrow$ `save-all flush` $\rightarrow$ compresión $\rightarrow$ `save-on`) para evitar corrupción sin necesidad de apagar el juego.
* **Restauración en 1 Clic:** Pulsa el botón de restaurar en cualquier backup para volver atrás en el tiempo. El panel detendrá el proceso de forma segura si está corriendo, reemplazará los archivos y dejará el mundo listo.
* **Bloqueo con Candado:** Bloquea backups importantes para evitar que se borren accidentalmente.
* **Descarga / Subida Externa:** Puedes descargar cualquier copia en formato `.zip` a tu PC o subir backups externos arrastrándolos a la zona de subida.

---

## ⏰ 5. Automatizaciones y Horarios (Scheduler)

En la pestaña **Horarios**:
* Puedes programar tareas periódicas por hora y días de la semana:
  * **SAFE_RESTART:** Reinicio seguro diario con avisos por cuenta atrás en el chat del juego (ej: aviso 10 min antes, 5 min antes, 1 min antes).
  * **BACKUP:** Generación automática de copias de seguridad de madrugada.
  * **COMMAND:** Ejecución de comandos periódicos de consola (ej: `/weather clear`, `/time set day`, anuncios).
  * **START / SAFE_STOP:** Encendido o apagado programado del servidor.
* **Botón Probar / Vista Previa:** Permite probar las alertas o ejecutar la tarea de inmediato para verificar que funciona.

---

## 🚨 6. Watchdog y Alertas de Discord

En la pestaña **Alertas & Discord**:
* **Discord Webhook:** Pega la URL del Webhook de tu canal de Discord para recibir notificaciones con tarjetas enriquecidas (Embeds) con colores y avatares para:
  * Servidor iniciado / detenido
  * Caídas y crashes
  * Entradas y salidas de jugadores
  * Creación de copias de seguridad
* **Crash Watchdog:** Detecta caídas inesperadas del proceso Java y reinicia el servidor automáticamente en 5 segundos.
* **Protección Anti-Bucle:** Si ocurren más de 3 caídas en menos de 5 minutos, el Watchdog suspende los auto-reinicios para proteger el mundo y registra el error detallado en el historial.

---

## 👥 7. Gestión de Usuarios y Permisos

En la sección **Usuarios** (barra superior):
* Puedes invitar a amigos generando **PINs de 6 dígitos**.
* Tu amigo se registra con su email, contraseña y el PIN.
* Puedes editar los permisos individuales de cada amigo:
  * Ver servidores
  * Arrancar / Detener servidores
  * Consola y envío de comandos
  * Administrar mods y plugins
  * Editor de archivos
  * Crear o eliminar servidores
