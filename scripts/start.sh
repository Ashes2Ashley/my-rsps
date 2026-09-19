#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${RSPS_PROFILE:-ts}"
if [[ -f "$ROOT/.env.local" ]]; then set -a; source "$ROOT/.env.local"; set +a; fi
mkdir -p "$ROOT/logs" "$ROOT/run"
case "$PROFILE" in
  ts)
    command -v node >/dev/null || { echo 'Node.js 22+ is required.' >&2; exit 1; }
    [[ -d "$ROOT/tsps-primary/node_modules" ]] || { echo 'Run scripts/setup.ps1 or npm run setup in tsps-primary first.' >&2; exit 1; }
    cd "$ROOT/tsps-primary"
    exec npm run start
    ;;
  java-modern)
    command -v java >/dev/null || { echo 'Java 17 is required.' >&2; exit 1; }
    cd "$ROOT/vendor/elvarg-gradle/ElvargServer"
    exec ./gradlew :game:run --no-daemon
    ;;
  java-legacy)
    echo 'Legacy source is preserved for manual IDE/build use; no stable wrapper is present.' >&2
    exit 2
    ;;
  *) echo "Unknown RSPS_PROFILE=$PROFILE (use ts, java-modern, or java-legacy)." >&2; exit 2;;
esac
