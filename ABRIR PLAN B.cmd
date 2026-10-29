@echo off
cd /d "%~dp0"
node scripts\start-google-pilot.cjs
if errorlevel 1 (
  pause
  exit /b 1
)
start "Plan B" "http://localhost:4334/team"
