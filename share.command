#!/bin/bash
# Double-click to get a public link to Food Advisor running on this Mac.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if command -v brew >/dev/null 2>&1 && brew list mysql >/dev/null 2>&1; then brew services start mysql >/dev/null 2>&1; fi
if ! command -v cloudflared >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then
  echo "Installing cloudflared (one time)…"; brew install cloudflared
fi
[ -d node_modules ] || npm install --no-audit --no-fund
node scripts/share.js
read -p "Press Enter to close…"
