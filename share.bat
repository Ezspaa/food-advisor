@echo off
rem Double-click to get a public link to Food Advisor running on this PC.
cd /d "%~dp0"
title Food Advisor - public link
where cloudflared >nul 2>nul || (echo Installing cloudflared... & winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements)
if not exist node_modules call npm install --no-audit --no-fund
node scripts\share.js
pause
