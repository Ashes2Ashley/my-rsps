#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-ts}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"
SKIP_CACHE="${SKIP_CACHE:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
START="${START:-0}"
TUNNEL="${TUNNEL:-0}"
LOG_DIR="$ROOT/logs"; mkdir -p "$LOG_DIR" "$ROOT/run"
LOG="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1
say(){ echo "[deploy] $*"; }
need(){ command -v "$1" >/dev/null || { echo "Missing $1: $2" >&2; exit 1; }; }
run(){ (cd "$2" && "$1" "${@:3}"); }
need node 'install Node.js 22.16+'; need npm 'install Node.js/npm'
(( $(node -p 'process.versions.node.split(".")[0]') >= 22 )) || { echo 'Node.js 22+ required'; exit 1; }
[[ -f "$ROOT/.env.local" ]] || cp "$ROOT/.env.example" "$ROOT/.env.local"
TS="$ROOT/tsps-primary"
if [[ "$PROFILE" == ts || "$PROFILE" == both ]]; then
  if [[ "$SKIP_INSTALL" != 1 ]]; then
    say 'Installing dependencies'; run npm "$TS" run setup || {
      say 'Immutable lockfile rejected; reconciling lockfiles'; run npm "$TS" exec --yes --package @yarnpkg/cli-dist@4.12.0 -- yarn install
      run npm "$TS" exec --yes --package @yarnpkg/cli-dist@4.12.0 -- yarn --cwd server install
      run npm "$TS" exec --yes --package @yarnpkg/cli-dist@4.12.0 -- yarn --cwd client install
    }
  fi
  say 'Syncing plugins'; cp "$ROOT"/plugin-hub/*.plugin.js "$TS/server/plugins/custom-hub/" 2>/dev/null || true
  [[ "$SKIP_CACHE" == 1 ]] || run npm "$TS/server" run ensure-cache
  if [[ "$SKIP_BUILD" != 1 ]]; then run npm "$TS/server" run build; run npm "$TS/client" run build; fi
fi
if [[ "$PROFILE" == java-modern || "$PROFILE" == both ]]; then
  need java 'install Java 17+'; (cd "$ROOT/vendor/elvarg-gradle/ElvargServer" && ./gradlew :game:fatJar --no-daemon)
fi
say 'Deployment completed'; say "Client: http://localhost:3000"; say "WebSocket: ws://localhost:43594"; say "Log: $LOG"
if [[ "$START" == 1 && ( "$PROFILE" == ts || "$PROFILE" == both ) ]]; then "$ROOT/scripts/start.sh"; fi
if [[ "$TUNNEL" == 1 ]]; then need cloudflared 'install/authenticate cloudflared'; exec cloudflared tunnel --config "$ROOT/cloudflared/config.yml" run; fi
