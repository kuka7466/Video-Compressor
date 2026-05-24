@echo off
title AeroCompress Server Launcher
echo ==============================================
echo  AEROCOMPRESS SERVER PIPELINE LAUNCHER
echo ==============================================
echo.
echo Starting Express server and initializing bindings...
cd /d "%~dp0app"
node server.js
pause
