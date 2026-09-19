# Verification and checkpoints

## Canonical base

The canonical game base is `Ashes2Ashley/my-rsps` on branch `custom-fusion`. It is the maintained TypeScript successor with a browser client, WebSocket server, cache pipeline, and plugin manager. The other two repositories remain available under `vendor/` as explicit Java fallback profiles because their classic protocols are not wire-compatible with the browser client.

## Completed checks

| Check | Result |
|---|---|
| Root/server/client dependency install | Passed with controlled lockfile reconciliation; upstream immutable lockfile was inconsistent |
| TypeScript server `npx tsc --noEmit -p tsconfig.json` | Passed |
| TypeScript server `npm run build` | Passed |
| Browser client `npx tsc --noEmit -p tsconfig.json` | Passed after three compatibility fixes |
| Browser client `npm run build` | Passed; production bundle emitted to `client/build/` |
| Java Gradle task graph | Passed; `fatJar`, `shadowJar`, `runShadow`, and `startShadowScripts` are available |
| Plugin hub syntax and sync smoke | Passed for `Welcome.plugin.js` |
| Source manifest JSON and shell launcher syntax | Passed |

The client build still prints upstream lint warnings, but they do not block output. Build artifacts are intentionally ignored; users regenerate them with the provided setup/launch commands.

## Checkpoints

- `d2fe5a1` — `checkpoint 1: select TSPS primary and vendor Java fallbacks`
- `2d0df31` — `checkpoint 2: add one-click launch, plugin hub, and client build fixes`

The branch has been pushed to GitHub at `custom-fusion`:
https://github.com/Ashes2Ashley/my-rsps/tree/custom-fusion

## Runtime note

The first live server startup calls `server/scripts/ensure-cache.ts` and downloads the required game cache. That step requires network access and can take several minutes. Once complete, `Open-Game.bat` starts the server and client together; the browser game is served at `http://localhost:3000` and the game WebSocket defaults to `0.0.0.0:43594`.
