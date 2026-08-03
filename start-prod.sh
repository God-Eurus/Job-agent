#!/usr/bin/env bash
# Production server + public Cloudflare tunnel, from your Mac.
# Usage: ./start-prod.sh
set -euo pipefail
cd "$(dirname "$0")"

# Load env (.env.local) into the process
set -a; [ -f .env.local ] && source .env.local; set +a

if [ -z "${DASHBOARD_PASSWORD:-}" ]; then
  echo "Refusing to expose publicly without DASHBOARD_PASSWORD in .env.local" >&2
  exit 1
fi

# Build if standalone output missing or stale
if [ ! -f .next/standalone/server.js ]; then
  npm run build
fi
# Standalone needs static assets alongside it
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static

# Standalone runs with cwd=.next/standalone — pin the data dir to the project root
export DATA_DIR="$PWD/data"

PORT=3040 HOSTNAME=127.0.0.1 node .next/standalone/server.js &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

sleep 2
echo ""
echo "Dashboard user: admin  password: $DASHBOARD_PASSWORD"
echo "Starting tunnel (URL appears below, changes each restart)…"
echo ""
cloudflared tunnel --url http://127.0.0.1:3040
