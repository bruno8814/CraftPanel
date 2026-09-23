@echo off
title CraftPanel - Minecraft Server Management
chcp 65001 >nul
echo.
echo ========================================================
echo        🎮  CraftPanel - Modo Produccion (Windows)
echo ========================================================
echo.

:: 1. Comprobar que Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se encontro Node.js instalado en el sistema.
    echo Por favor descarga e instala Node.js 20 o superior desde https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Comprobar que Java esta instalado
where java >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se encontro Java instalado en el sistema.
    echo Necesitas Java 21 para Minecraft 1.20.6 / 1.21 / NeoForge.
    pause
    exit /b 1
)

:: 3. Comprobar dependencias
if not exist "node_modules\" (
    echo [AVISO] Instalando dependencias de Node.js...
    call npm install
)

:: 4. Comprobar si existe el build de produccion
if not exist "backend\dist\index.js" (
    echo [AVISO] Compilando CraftPanel por primera vez...
    call npm run build
)

:: 5. Iniciar CraftPanel en modo produccion
echo.
echo [INFO] Iniciando CraftPanel en http://localhost:3000 ...
echo [INFO] Presiona Ctrl+C para detener el panel de forma segura.
echo.

node backend\dist\index.js

pause
