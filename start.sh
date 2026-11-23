#!/usr/bin/env sh
# Runs InCommon on this computer and opens it in your browser (macOS / Linux).
# Needs Node.js (https://nodejs.org). Press Ctrl+C to stop.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org and run this again."
  exit 1
fi
[ -d node_modules ] || npm install --no-audit --no-fund || exit 1
exec npm run local
