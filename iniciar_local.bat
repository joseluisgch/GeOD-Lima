@echo off
title GeoFlow-Lima - Servidor Local
echo =======================================================
echo     Iniciando servidor local de GeoFlow-Lima...
echo =======================================================
echo.

:: Verificar si Node.js esta instalado
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js o npm no se encuentra instalado o no esta en el PATH.
    echo Por favor, descargue e instale Node.js desde: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Verificar si node_modules existe. Si no, instalar dependencias.
if not exist node_modules (
    echo [INFO] No se encontro la carpeta node_modules. Instalando dependencias...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Hubo un problema al instalar las dependencias con 'npm install'.
        pause
        exit /b %errorlevel%
    )
    echo [INFO] Dependencias instaladas con exito.
    echo.
)

:: Lanzar un subproceso que abrira el navegador por defecto despues de 3 segundos
:: Usamos ping en lugar de timeout por compatibilidad de redireccionamiento de entrada
start /b cmd /c "ping -n 4 127.0.0.1 >nul && start http://localhost:5173/GeOD-Lima/"

:: Iniciar el servidor de desarrollo local de Vite
echo [INFO] Iniciando el servidor local de desarrollo de Vite...
echo [INFO] La aplicacion estara disponible en: http://localhost:5173/GeOD-Lima/
echo.
echo Presione Ctrl+C en esta ventana de consola para detener el servidor.
echo.

call npm run dev
if %errorlevel% neq 0 (
    echo [ERROR] El servidor finalizo con un error (codigo %errorlevel%).
    pause
)
