#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${WEB_PORT:-3000}"
GAME_PORT="${GAME_PORT:-43594}"
need(){ command -v "$1" >/dev/null || { echo "Missing $1" >&2; exit 1; }; }
need cloudflared
for port in "$WEB_PORT" "$GAME_PORT"; do
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || { echo "Nothing is listening on 127.0.0.1:$port" >&2; exit 1; }
done
mkdir -p "$ROOT/logs"
WEB_LOG="$ROOT/logs/cloudflared-web-test.log"
GAME_LOG="$ROOT/logs/cloudflared-game-test.log"
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$WEB_PORT" >"$WEB_LOG" 2>&1 & WEB_PID=$!
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$GAME_PORT" >"$GAME_LOG" 2>&1 & GAME_PID=$!
trap 'kill "$WEB_PID" "$GAME_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  WEB_URL=$(grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' "$WEB_LOG" | head -1 || true)
  GAME_URL=$(grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' "$GAME_LOG" | head -1 || true)
  [[ -n "$WEB_URL" && -n "$GAME_URL" ]] && break
  sleep 1
done
[[ -n "${WEB_URL:-}" ]] || { cat "$WEB_LOG"; exit 1; }
[[ -n "${GAME_URL:-}" ]] || { cat "$GAME_LOG"; exit 1; }
echo "Bellascape local HTTP test URL: $WEB_URL"
echo "Bellascape local WebSocket test URL: wss://${GAME_URL#https://}"
echo "Quick tunnels are temporary. No DNS or Cloudflare account changes were made."
