#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$ROOT/tsps-primary"
LOG_DIR="$ROOT/logs"
RUN_DIR="$ROOT/run/bellascape-aio"
WEB_PORT="${WEB_PORT:-3000}"
GAME_PORT="${GAME_PORT:-43594}"
WEB_HOST="${WEB_HOST:-play.kodakgp.com}"
GAME_HOST="${GAME_HOST:-game.kodakgp.com}"
TUNNEL_NAME="${TUNNEL_NAME:-aio-tunnel}"
MODE="${1:-start}"
PULL="${PULL:-1}"
ALLOW_QUICK_TEST="${ALLOW_QUICK_TEST:-0}"
TOKEN_FILE="${CLOUDFLARED_TOKEN_FILE:-$HOME/.config/bellascape/cloudflared.token}"
LOCK_FILE="$ROOT/run/bellascape-aio.lock"
mkdir -p "$LOG_DIR" "$RUN_DIR" "$ROOT/run"

say(){ printf '[bellascape-aio] %s\n' "$*"; }
warn(){ printf '[bellascape-aio][warning] %s\n' "$*" >&2; }
die(){ printf '[bellascape-aio][error] %s\n' "$*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Missing $1. Re-run with --install or install dependencies manually."; }
root_run(){ if [[ "$EUID" -eq 0 ]]; then "$@"; else sudo "$@"; fi; }

pid_file(){ echo "$RUN_DIR/$1.pid"; }
log_file(){ echo "$LOG_DIR/$1.log"; }
read_pid(){ local f; f=$(pid_file "$1"); [[ -s "$f" ]] && cat "$f" || true; }
active_pid(){ local p; p=$(read_pid "$1"); [[ -n "$p" ]] && kill -0 "$p" 2>/dev/null && echo "$p" || true; }
stop_one(){ local name="$1" p; p=$(active_pid "$name"); if [[ -n "$p" ]]; then say "stopping $name ($p)"; kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; for _ in {1..20}; do kill -0 "$p" 2>/dev/null || break; sleep .25; done; kill -9 -- "-$p" 2>/dev/null || kill -9 "$p" 2>/dev/null || true; fi; rm -f "$(pid_file "$name")"; }
stop_all(){ stop_one tunnel; stop_one game; }

install_dependencies(){
  say 'checking dependencies'
  if ! command -v curl >/dev/null 2>&1; then root_run apt-get update -y; root_run apt-get install -y curl ca-certificates; fi
  if ! command -v git >/dev/null 2>&1; then root_run apt-get update -y; root_run apt-get install -y git; fi
  if ! command -v python3 >/dev/null 2>&1; then root_run apt-get update -y; root_run apt-get install -y python3; fi
  if ! command -v flock >/dev/null 2>&1 || ! command -v setsid >/dev/null 2>&1; then root_run apt-get update -y; root_run apt-get install -y util-linux; fi
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 22 ]]; then
    say 'installing Node.js 22'
    curl -fsSL https://deb.nodesource.com/setup_22.x | root_run bash -
    root_run apt-get install -y nodejs
  fi
  if ! command -v java >/dev/null 2>&1; then
    say 'installing Java 17 runtime'
    root_run apt-get update -y
    root_run apt-get install -y openjdk-17-jre-headless
  fi
  if ! command -v cloudflared >/dev/null 2>&1; then
    say 'installing cloudflared'
    curl -fL --retry 5 https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o "$RUN_DIR/cloudflared"
    root_run install -m 0755 "$RUN_DIR/cloudflared" /usr/local/bin/cloudflared
  fi
  need node; need npm; need curl; need git; need python3; need cloudflared
  say "Node $(node --version), npm $(npm --version), Java $(java -version 2>&1 | head -1), cloudflared $(cloudflared --version | head -1)"
}

safe_pull(){
  [[ "$PULL" == 1 ]] || return 0
  git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
    warn 'local changes detected; skipping git pull to avoid overwriting them'
  else
    say 'updating custom-fusion branch'
    git -C "$ROOT" pull --ff-only origin custom-fusion || warn 'git pull failed; continuing with the checked-out version'
  fi
}

prepare_game(){
  [[ -d "$TS" ]] || die "Missing $TS. Clone the custom-fusion branch first."
  [[ -f "$TS/.env.local" ]] || cp "$TS/.env.example" "$TS/.env.local"
  mkdir -p "$TS/server/plugins/custom-hub"
  cp "$ROOT"/plugin-hub/*.plugin.js "$TS/server/plugins/custom-hub/" 2>/dev/null || true
  say 'installing/updating game dependencies'
  (cd "$TS" && npm run setup) || {
    warn 'immutable dependency install failed; reconciling with Yarn 4'
    (cd "$TS" && npm exec --yes --package @yarnpkg/cli-dist@4.12.0 -- yarn install)
  }
  say 'preparing cache and production builds'
  (cd "$TS/server" && npm run ensure-cache && npm run build)
  (cd "$TS/client" && npm run build)
}

port_ready(){ local host="$1" port="$2"; (exec 3<>"/dev/tcp/$host/$port") >/dev/null 2>&1; }
wait_for_port(){ local name="$1" host="$2" port="$3"; for _ in {1..90}; do port_ready "$host" "$port" && { say "$name is listening on $host:$port"; return 0; }; sleep 1; done; return 1; }

start_game(){
  stop_one game
  say 'starting Bellascape client and TypeScript server'
  setsid bash -c "cd '$TS' && exec npm run start" >>"$(log_file game)" 2>&1 &
  echo $! >"$(pid_file game)"
  wait_for_port game 127.0.0.1 "$GAME_PORT" || { tail -80 "$(log_file game)"; die 'game WebSocket did not start'; }
  wait_for_port client 127.0.0.1 "$WEB_PORT" || { tail -80 "$(log_file game)"; die 'browser client did not start'; }
  curl -fsS --max-time 10 "http://127.0.0.1:$WEB_PORT" >/dev/null || die 'browser health check failed'
}

setup_named_config(){
  [[ -f "$ROOT/cloudflared/config.yml" ]] && return 0
  say 'generating named-tunnel config when local credentials are available'
  WEB_HOST="$WEB_HOST" GAME_HOST="$GAME_HOST" TUNNEL_NAME="$TUNNEL_NAME" "$ROOT/scripts/setup-cloudflared.sh" || return 1
}

start_named_tunnel(){
  stop_one tunnel
  local token="${CLOUDFLARED_TUNNEL_TOKEN:-}"
  [[ -n "$token" ]] || [[ ! -f "$TOKEN_FILE" ]] || token="$(tr -d '\r\n' < "$TOKEN_FILE")"
  if [[ -z "$token" ]] && cloudflared tunnel token "$TUNNEL_NAME" >/dev/null 2>&1; then
    token="$(cloudflared tunnel token "$TUNNEL_NAME" 2>/dev/null | tail -1 | tr -d '\r\n')"
  fi
  if [[ -n "$token" ]]; then
    say "starting named tunnel $TUNNEL_NAME using token authentication"
    nohup cloudflared tunnel run --token "$token" >"$(log_file tunnel)" 2>&1 &
  elif [[ -f "$ROOT/cloudflared/config.yml" ]]; then
    say "starting named tunnel $TUNNEL_NAME using local credentials"
    nohup cloudflared tunnel --config "$ROOT/cloudflared/config.yml" run "$TUNNEL_NAME" >"$(log_file tunnel)" 2>&1 &
  else
    return 1
  fi
  echo $! >"$(pid_file tunnel)"
  sleep 5
  local p; p=$(active_pid tunnel)
  [[ -n "$p" ]] || { tail -80 "$(log_file tunnel)"; return 1; }
  say "tunnel process is running as PID $p"
  return 0
}

quick_test_fallback(){
  warn 'named tunnel is unavailable; starting temporary HTTP quick tunnel for diagnostics only'
  stop_one tunnel
  nohup cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$WEB_PORT" >"$(log_file tunnel)" 2>&1 &
  echo $! >"$(pid_file tunnel)"
  sleep 8
  local url; url=$(grep -o 'https://[-a-z0-9]*\.trycloudflare\.com' "$(log_file tunnel)" | head -1 || true)
  [[ -n "$url" ]] && { say "temporary browser URL: $url"; warn 'quick tunnels do not provide a stable game WebSocket hostname; use the named tunnel for multiplayer access'; return 0; }
  tail -80 "$(log_file tunnel)"; return 1
}

public_check(){
  say 'checking public endpoints'
  local ok=0
  for _ in {1..30}; do
    if curl -fsS --max-time 5 "https://$WEB_HOST" >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
  done
  if [[ "$ok" == 1 ]]; then say "public browser URL is reachable: https://$WEB_HOST"; else warn "https://$WEB_HOST is not reachable yet; inspect $(log_file tunnel) and DNS propagation"; fi
  if getent hosts "$GAME_HOST" >/dev/null 2>&1; then say "game hostname resolves: $GAME_HOST"; else warn "$GAME_HOST does not resolve yet"; fi
}

status(){
  echo "Bellascape AIO root: $ROOT"
  for n in game tunnel; do local p; p=$(active_pid "$n"); printf '%-8s %s\n' "$n" "${p:-stopped}"; done
  port_ready 127.0.0.1 "$WEB_PORT" && echo "client    http://127.0.0.1:$WEB_PORT reachable" || echo "client    stopped/unreachable"
  port_ready 127.0.0.1 "$GAME_PORT" && echo "game      ws://127.0.0.1:$GAME_PORT reachable" || echo "game      stopped/unreachable"
  echo "logs      $LOG_DIR"
}

case "$MODE" in
  --install|install)
    install_dependencies; exit 0;;
  --status|status)
    status; exit 0;;
  --stop|stop)
    stop_all; say 'Bellascape services stopped'; exit 0;;
  --quick-test)
    install_dependencies; start_game; quick_test_fallback; status; exit 0;;
  start|--start)
    exec 9>"$LOCK_FILE"
    flock -n 9 || die 'another Bellascape AIO process is already running'
    install_dependencies
    safe_pull
    prepare_game
    start_game
    if ! setup_named_config || ! start_named_tunnel; then
      if [[ "$ALLOW_QUICK_TEST" == 1 ]]; then quick_test_fallback || die 'both named and quick tunnels failed';
      else
        warn 'game/client are running locally, but no named tunnel credentials/config were found'
        warn "Run: cloudflared tunnel login, then rerun $0"
        warn "Or use --quick-test for a temporary browser-only diagnostic tunnel"
        exit 4
      fi
    fi
    public_check
    say "Bellascape is running. Browser: https://$WEB_HOST | Game: wss://$GAME_HOST"
    say "Use '$0 status' for health and '$0 stop' to stop it"
    ;;
  *) echo "Usage: $0 [start|--install|--status|--stop|--quick-test]"; exit 2;;
esac
