@echo off
title AeroCompress Server Launcher
echo ==============================================
echo  AEROCOMPRESS SERVER PIPELINE LAUNCHER
echo ==============================================
echo.
cd /d "%~dp0app"

if not exist "node_modules" (
    echo [AeroCompress] Dependencies not found. Installing automatically...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies. Please verify Node.js and npm are installed on your system.
        pause
        exit /b 1
    )
)

echo Starting Express server and initializing bindings...
node server.js
pause
