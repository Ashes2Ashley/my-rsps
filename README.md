# Custom RSPS Fusion

This workspace combines three upstream codebases without pretending that their wire protocols are interchangeable:

| Profile | Source | Role |
|---|---|---|
| `ts` | `tsps-primary/` from `my-rsps` | **Primary browser client + TypeScript server**; current successor stack |
| `java-modern` | `vendor/elvarg-gradle/` from `myrspss` | Java/Kotlin Elvarg fallback for the classic/native client |
| `java-legacy` | `vendor/elvarg-legacy/` from `myrsps` | Original Java #317 fallback and reference implementation |

The launcher defaults to `ts`. The Java profiles are deliberately explicit because they use a different client/protocol and cannot safely be mixed with the browser client.

## Windows quick start

1. Install **Node.js 22.16+**, Git, and optionally Java 17.
2. Open PowerShell in this directory.
3. Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup.ps1
.\scripts\start.ps1 -Profile ts
```

Open `http://localhost:3000`. The first setup downloads/builds the game cache and may take several minutes. Use `Ctrl+C` to stop.

For a one-click Windows launch, double-click `Open-Game.bat`. It syncs the local plugin hub, installs dependencies if needed, and starts the browser client and game server together. A native `.exe` is not required: Windows launches the signed-by-you batch/PowerShell entry point without an extra installer. For the Java fallback, run `scripts\\build-fat-jar.ps1`; it produces `vendor\\elvarg-gradle\\ElvargServer\\game\\build\\libs\\*-all.jar` when the upstream Gradle build is compatible.

For a complete deployment from a clean Windows machine, double-click `Deploy-All.bat`, or run:

```powershell
.\\scripts\\deploy.ps1 -Profile ts -Start
```

The all-in-one deployment checks Node.js, creates `.env.local`, installs dependencies, reconciles the upstream lockfile if necessary, syncs plugins, downloads and validates the cache, builds the server and browser client, writes a timestamped deployment log, and optionally starts the game. Useful options are `-SkipInstall`, `-SkipCache`, `-SkipBuild`, `-BuildFatJar`, and `-Tunnel`. For both primary and Java fallback artifacts, use `-Profile both -BuildFatJar`. Linux/macOS users can run `./scripts/deploy.sh ts` with `START=1` or `TUNNEL=1`.

The primary root scripts bootstrap Yarn through `npm exec`, so Ubuntu does **not** need a globally installed `yarn` command. Do not install Yarn with `pip3`; Yarn is a Node package manager, not a Python package. If an older clone still reports `yarn: not found`, pull the latest `custom-fusion` branch and rerun the deployment.

If PowerShell is unavailable, run `scripts\\start.bat` from Command Prompt. It calls the same PowerShell launcher.

## Profiles and recovery

```powershell
.\scripts\start.ps1 -Profile ts             # browser client + TS server
.\scripts\start.ps1 -Profile java-modern   # Gradle Elvarg server only
.\scripts\start.ps1 -Profile java-legacy   # legacy source; manual IDE/build may be required
.\scripts\health.ps1                       # local port/process checks
```

The scripts validate prerequisites, create local directories, preserve logs, avoid duplicate launches, and print recovery commands instead of silently changing protocol or data. Set `RSPS_PROFILE`, `RSPS_SERVER_PORT`, or `RSPS_CLIENT_PORT` in `.env.local` to customize ports. Never commit real server tokens.

## Custom plugin hub

`plugin-hub/` is a relative extension point for the TypeScript server. Add a file ending in `.plugin.js`, export `register(api)`, and run `scripts\\sync-plugins.ps1`. The upstream manager discovers the copied plugin automatically, orders declared dependencies, and isolates hook errors. Restart the server after syncing. The included `Welcome.plugin.js` is a harmless startup/shutdown smoke plugin.

## Optional Cloudflare Tunnel

Cloudflare Tunnel is optional. It is not required for a laptop-only LAN/local test. Install `cloudflared`, authenticate with `cloudflared tunnel login`, create a named tunnel, then copy `cloudflared/config.yml.example` to `cloudflared/config.yml`, replace the tunnel ID/credentials path/hostnames, and run:

```powershell
.\scripts\tunnel.ps1
```

The sample exposes the web client and WebSocket game server on separate hostnames. Your DNS records must point to the tunnel. Do not put tunnel credentials in Git.

## Source provenance and safe merge boundary

The current `tsps-primary` tree is the executable primary because the old Java sources have different packet formats, build systems, and runtime assumptions. The two Java repositories are still included intact under `vendor/` and are used by the launcher as explicit fallback profiles and by `config/source-manifest.json` for asset/list provenance. This makes the combination inspectable and reversible instead of producing a fragile half-Java/half-TypeScript protocol.

## License and assets

Review each upstream repository's license and asset terms before distributing or opening the server publicly. This project is an integration wrapper, not an endorsement of commercial game assets or trademarks.
