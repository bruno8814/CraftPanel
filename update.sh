#!/usr/bin/env bash
# ============================================================
# update.sh — Actualizador automático de CraftPanel vía GitHub
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo "       🔄  Actualizando CraftPanel desde GitHub"
echo "========================================================"

# 1. Comprobar que es un repositorio git
if [ ! -d ".git" ]; then
    echo "[AVISO] Esta carpeta no parece ser un repositorio git clonado."
    echo "Si descargaste un zip, descomprime la versión nueva sobre esta carpeta."
fi

# 2. Descargar últimos cambios de GitHub
echo "[1/4] Descargando últimos cambios (git pull)..."
if command -v git >/dev/null 2>&1 && [ -d ".git" ]; then
    git stash --quiet 2>/dev/null || true
    git pull || echo "[AVISO] git pull devolvió una advertencia, continuando..."
fi

# 3. Actualizar dependencias si hubo cambios en package.json
echo "[2/4] Verificando dependencias de Node.js..."
npm install --silent
npm install --prefix frontend --silent

# 4. Recompilar frontend y backend
echo "[3/4] Recompilando frontend y backend..."
npm run build

# 5. Reiniciar el servicio
echo "[4/4] Reiniciando servicio CraftPanel..."
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet craftpanel 2>/dev/null; then
    systemctl restart craftpanel
    echo "¡Servicio craftpanel reiniciado con éxito!"
else
    echo "Para aplicar los cambios, reinicia el panel con start.sh o start.bat"
fi

echo ""
echo "========================================================"
echo "  🎉  CraftPanel actualizado correctamente."
echo "========================================================"
