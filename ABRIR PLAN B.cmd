@echo off
cd /d "%~dp0"
rem Arranca la instalacion local y abre su portada disponible.
node scripts\start-full-workspace.cjs
if errorlevel 1 (
  pause
  exit /b 1
)
for /f "delims=" %%U in ('node scripts\select-full-workspace-home.cjs') do start "Plan B" "%%U"
