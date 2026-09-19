@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\sync-plugins.ps1"
if not exist "tsps-primary\node_modules" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\setup.ps1"
  if errorlevel 1 pause & exit /b %errorlevel%
)
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start.ps1" -Profile ts
pause
