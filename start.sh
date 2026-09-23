#!/usr/bin/env bash
# ============================================================
# start.sh — Script de arranque de CraftPanel para Linux / Proxmox
# ============================================================

set -e

# Cambiar al directorio donde reside el script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo "       🎮  CraftPanel - Modo Producción (Linux/Debian)"
echo "========================================================"

# 1. Comprobar Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js no está instalado."
    echo "Instala Node.js 20 LTS: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "[AVISO] Se recomienda Node.js 20 LTS o superior (versión actual: $(node -v))"
fi

# 2. Comprobar Java
if ! command -v java >/dev/null 2>&1; then
    echo "[ERROR] Java no está instalado en el sistema."
    echo "Instala OpenJDK 21: apt-get update && apt-get install -y openjdk-21-jre-headless"
    exit 1
fi

# 3. Comprobar dependencias si no existen
if [ ! -d "node_modules" ]; then
    echo "[INFO] Instalando dependencias de Node.js..."
    npm install --production=false
fi

# 4. Compilar si no existe backend/dist
if [ ! -f "backend/dist/index.js" ] || [ ! -d "frontend/dist" ]; then
    echo "[INFO] Compilando frontend y backend para producción..."
    npm run build
fi

# 5. Cargar variables de entorno si existe .env
if [ -f ".env" ]; then
    echo "[INFO] Cargando configuración desde .env"
    export $(grep -v '^#' .env | xargs)
fi

PORT="${PORT:-3000}"
export NODE_ENV="production"

echo ""
echo "[INFO] Arrancando CraftPanel en el puerto $PORT..."
echo "[INFO] Acceso web: http://$(hostname -I | awk '{print $1}'):$PORT"
echo "[INFO] Presiona Ctrl+C para detener."
echo ""

exec node backend/dist/index.js
