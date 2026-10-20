#!/bin/bash
# Double-click to run Food Advisor on macOS.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org"
  open "https://nodejs.org"
  read -p "Press Enter to close…"
  exit 1
fi

# Start MySQL automatically if it was installed with Homebrew
if command -v brew >/dev/null 2>&1 && brew list mysql >/dev/null 2>&1; then
  brew services start mysql >/dev/null 2>&1
fi

node scripts/start.js
read -p "Press Enter to close…"
