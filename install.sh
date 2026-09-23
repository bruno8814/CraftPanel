#!/usr/bin/env bash
# ============================================================
# install.sh — Instalador Automático de CraftPanel para Proxmox VE / Debian
# ============================================================
# Este script realiza la instalación completa y desatendida:
#   1. Comprueba permisos de root
#   2. Instala OpenJDK 21 LTS y Node.js 20 LTS
#   3. Prepara el directorio /opt/craftpanel
#   4. Instala dependencias y compila frontend y backend
#   5. Registra y arranca el servicio systemd
#   6. Muestra la URL de acceso lista para usar
# ============================================================

set -e

# Colores de salida
VERDE='\033[0;32m'
AZUL='\033[0;34m'
AMARILLO='\033[1;33m'
ROJO='\033[0;31m'
NC='\033[0m' # Sin color

echo -e "${AZUL}"
echo "  ╔═══════════════════════════════════════════════════╗"
echo "  ║                                                   ║"
echo "  ║     🎮  Instalador Automático de CraftPanel       ║"
echo "  ║         Para Proxmox VE (LXC/VM) y Debian 12      ║"
echo "  ║                                                   ║"
echo "  ╚═══════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. Comprobar permisos de root
if [ "$EUID" -ne 0 ]; then
    echo -e "${ROJO}[ERROR] Por favor ejecuta este instalador como root o con sudo.${NC}"
    exit 1
fi

INSTALL_DIR="/opt/craftpanel"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 2. Actualizar paquetes del sistema
echo -e "${AZUL}[1/6] Actualizando repositorios del sistema...${NC}"
apt-get update -y

# 3. Instalar herramientas base y Java 21
echo -e "${AZUL}[2/6] Instalando OpenJDK 21 LTS, Git y utilidades del sistema...${NC}"
apt-get install -y curl wget git unzip ca-certificates gnupg openjdk-21-jre-headless

# 4. Instalar Node.js 20 LTS si no está presente o es antiguo
echo -e "${AZUL}[3/6] Verificando entorno de Node.js...${NC}"
NEED_NODE=0
if ! command -v node >/dev/null 2>&1; then
    NEED_NODE=1
else
    NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -lt 20 ]; then
        NEED_NODE=1
    fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
    echo -e "${AMARILLO}[INFO] Instalando Node.js 20 LTS oficial (NodeSource)...${NC}"
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y nodejs
fi

echo -e "${VERDE}  ✓ Java: $(java -version 2>&1 | head -n 1)${NC}"
echo -e "${VERDE}  ✓ Node: $(node -v) (npm $(npm -v))${NC}"

# 5. Configurar directorio del proyecto
echo -e "${AZUL}[4/6] Configurando CraftPanel en ${INSTALL_DIR}...${NC}"
mkdir -p "$INSTALL_DIR"

if [ "$CURRENT_DIR" != "$INSTALL_DIR" ]; then
    if [ -f "$CURRENT_DIR/package.json" ]; then
        echo -e "${AMARILLO}[INFO] Copiando archivos del proyecto (incluyendo .git si existe) a ${INSTALL_DIR}...${NC}"
        cp -a "$CURRENT_DIR"/. "$INSTALL_DIR"/ 2>/dev/null || cp -r "$CURRENT_DIR"/* "$INSTALL_DIR"/
    elif [ ! -f "$INSTALL_DIR/package.json" ]; then
        echo -e "${AMARILLO}[INFO] No se encontraron archivos locales. Introduce la URL de tu repositorio Git de GitHub:${NC}"
        read -r -p "URL del repositorio GitHub (ej: https://github.com/tu-usuario/craftpanel.git): " REPO_URL
        if [ -n "$REPO_URL" ]; then
            git clone "$REPO_URL" "$INSTALL_DIR"
        else
            echo -e "${ROJO}[ERROR] No se pudo encontrar el proyecto para instalar.${NC}"
            exit 1
        fi
    fi
fi

cd "$INSTALL_DIR"
chmod +x update.sh start.sh 2>/dev/null || true

# 6. Instalar dependencias y compilar
echo -e "${AZUL}[5/6] Instalando dependencias de Node.js y compilando producción...${NC}"
npm install --silent
npm install --prefix frontend --silent

echo -e "${AMARILLO}[INFO] Compilando frontend y backend con TypeScript...${NC}"
npm run build

# Configurar .env si no existe
if [ ! -f ".env" ]; then
    echo -e "${AMARILLO}[INFO] Creando archivo de configuración inicial .env...${NC}"
    cp .env.example .env
fi

# 7. Registrar e iniciar servicio systemd
echo -e "${AZUL}[6/6] Configurando servicio systemd de arranque automático...${NC}"
cp deploy/craftpanel.service /etc/systemd/system/craftpanel.service

systemctl daemon-reload
systemctl enable craftpanel
systemctl restart craftpanel

# Obtener IP del servidor
PRIMARY_IP=$(hostname -I | awk '{print $1}')
if [ -z "$PRIMARY_IP" ]; then
    PRIMARY_IP="localhost"
fi

echo ""
echo -e "${VERDE}  ╔═══════════════════════════════════════════════════╗"
echo "  ║                                                   ║"
echo "  ║   🎉  ¡CraftPanel se ha instalado con ÉXITO!      ║"
echo "  ║                                                   ║"
echo "  ║   🌐  Panel Web: http://${PRIMARY_IP}:3000          ║"
echo "  ║   📁  Directorio: ${INSTALL_DIR}                 ║"
echo "  ║   ⚙️   Servicio: systemctl status craftpanel       ║"
echo "  ║                                                   ║"
echo "  ╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${AMARILLO}Comandos útiles:${NC}"
echo "  • Ver logs en vivo:     journalctl -u craftpanel -f"
echo "  • Reiniciar panel:      systemctl restart craftpanel"
echo "  • Detener panel:        systemctl stop craftpanel"
echo ""
