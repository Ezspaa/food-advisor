@echo off
rem Double-click to run Food Advisor on Windows.
cd /d "%~dp0"
title Food Advisor

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org
  start "" "https://nodejs.org"
  pause
  exit /b 1
)

node scripts\start.js
pause
