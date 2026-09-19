@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bellascape.ps1" %*
set CODE=%ERRORLEVEL%
if not "%CODE%"=="0" pause
exit /b %CODE%
