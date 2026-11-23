@echo off
cd /d "%~dp0"
rem Arranca el CRM de este ordenador (4331) con su copia existente y lo abre. La app de equipos (4334) se aparco el 22/11/2026.
node scripts\start-full-workspace.cjs
if errorlevel 1 (
  pause
  exit /b 1
)
start "Plan B" "http://127.0.0.1:4331/"
