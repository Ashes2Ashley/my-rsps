# Bellascape

Bellascape is the branded deployment wrapper around the custom RSPS fusion.

## What is packaged

The **primary Bellascape mode** runs the browser client and TypeScript WebSocket server. The **Java Shadow mode** produces the modern Elvarg fallback as an executable fat JAR. These are separate protocol profiles; the Java JAR cannot serve the TypeScript browser client directly.

Therefore, the practical one-executable experience is:

- Windows: double-click `Bellascape.bat`.
- Ubuntu/macOS: run `./bellascape`.
- Java fallback: run the generated `*-all.jar` with Java 17+.

The launcher performs dependency setup, cache preparation, plugin synchronization, production builds, and optional Cloudflare Tunnel startup.

## Ubuntu

```bash
git clone --branch custom-fusion --single-branch https://github.com/Ashes2Ashley/my-rsps.git bellascape
cd bellascape
chmod +x bellascape scripts/*.sh
BELLA_MODE=primary ./bellascape
```

For the recommended one-click Ubuntu/WSL deployment, use the supervised AIO launcher. It installs missing dependencies, safely pulls the `custom-fusion` branch when there are no local edits, installs packages, prepares the cache, builds the client/server, starts both services, checks ports `3000` and `43594`, starts the named Cloudflare tunnel, and prints public reachability results:

```bash
chmod +x deploy-aio scripts/deploy-aio.sh
./deploy-aio
```

The AIO launcher supports restart-safe commands:

```bash
./scripts/deploy-aio.sh status
./scripts/deploy-aio.sh stop
./scripts/deploy-aio.sh --install
```

It tries tunnel-token authentication first (`CLOUDFLARED_TUNNEL_TOKEN`, then `~/.config/bellascape/cloudflared.token`, then `cloudflared tunnel token aio-tunnel`), then a local `cloudflared/config.yml` credential setup. If `ALLOW_QUICK_TEST=1` is set, it falls back to a temporary browser-only quick tunnel for diagnostics; it does not pretend that a quick tunnel is suitable for stable multiplayer WebSocket access.

If your WSL session has not authenticated Cloudflare, run `cloudflared tunnel login` once, or provide a tunnel token without placing it in Git:

```bash
mkdir -p ~/.config/bellascape
read -rsp 'Cloudflare tunnel token: ' TOKEN; echo
printf '%s' "$TOKEN" > ~/.config/bellascape/cloudflared.token
chmod 600 ~/.config/bellascape/cloudflared.token
./deploy-aio
```

Logs are written to `logs/game.log` and `logs/tunnel.log`; runtime PID and lock files are under `run/bellascape-aio/`.

Build only without starting:

```bash
BELLA_BUILD_ONLY=1 ./bellascape
```

Build the Java Shadow fat JAR:

```bash
BELLA_MODE=jar ./bellascape
```

The output is under `vendor/elvarg-gradle/ElvargServer/game/build/libs/` and has an `-all.jar` suffix.

The verified distributable artifact is also included at `dist/Bellascape-Server-all.jar` with checksum `dist/Bellascape-Server-all.jar.sha256`. It is a real executable Shadow JAR with `Main-Class: com.elvarg.Server`. Run it with Java 17:

```bash
java -jar dist/Bellascape-Server-all.jar
```

The Bellascape launcher automatically starts the JAR from `vendor/elvarg-gradle/ElvargServer/game/`, where the external `../data` definitions and clipping files are available. A direct manual launch should use that directory as its working directory:

```bash
cd vendor/elvarg-gradle/ElvargServer/game
java -jar ../../../../dist/Bellascape-Server-all.jar
```

The packaged JAR was smoke-tested through `RspsApp is now online!` with Java 17.

The Java build requires **JDK 17 exactly** because the Gradle project uses a Java 17 toolchain:

```bash
sudo apt install -y openjdk-17-jdk
java -version
```

## Cloudflare Tunnel

Copy and edit the template:

```bash
cp cloudflared/config.yml.example cloudflared/config.yml
nano cloudflared/config.yml
```

Replace the tunnel ID, credentials file, and hostnames. Authenticate once:

```bash
cloudflared tunnel login
```

Then run Bellascape with the tunnel:

```bash
BELLA_MODE=primary BELLA_TUNNEL=1 ./bellascape
```

The web hostname should point to local port `3000`; the WebSocket hostname should point to local port `43594`. Cloudflare Tunnel provides ingress; it does not replace the game server or client process.

Before pointing a domain at the tunnel, start Bellascape locally and run `./scripts/test-cloudflared.sh`. It creates temporary `trycloudflare.com` URLs for the HTTP and WebSocket listeners and changes no DNS records. After that succeeds, generate the named-tunnel config with `scripts/setup-cloudflared.sh`; DNS routing remains opt-in with `APPLY_DNS=1`.

## Windows

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Bellascape.bat
```

Build the Java fat JAR only:

```powershell
.\Bellascape.bat -Mode jar -BuildOnly
```

Start the primary client/server with Cloudflare Tunnel:

```powershell
.\Bellascape.bat -Mode primary -Tunnel
```

Build a downloadable Windows player package with portable Node.js and Java 17:

```powershell
.\scripts\package-windows.ps1 -IncludeJavaServer -GameAddress game-web.example.com:443 -SecureGame
```

This creates a staging folder, `Bellascape-Player.7z`, and—when 7-Zip with `7z.sfx` is installed—`Bellascape-Player.exe`. The SFX file extracts to a temporary directory and starts the bundled browser client. The live server remains on Ubuntu; the downloadable file is the player client package.

## Player setup and zones

Players can select persistent combat setups with commands such as `::setup main-tribrid`, `::setup nh-pure`, `::setup void-ranger`, or `::setup list`. `::safe` returns to the Edgeville safe zone, `::danger` enters the configured PvP boundary, and `::train` moves to the Rock Crab training area. The selected loadout is stored through SQLite persistence. Existing Wilderness, PvP, prayer, spellbook, food, potion, NPC, and skill plugins remain authoritative; `server/data/definitions/BellascapeGameplay.json` is the editable Bellascape configuration layer.

## Important limitation

A truly self-contained native `.exe` containing Node.js, the browser runtime, the cache, the TypeScript server, and `cloudflared` would require a separate Windows packaging/release pipeline. The supplied Bellascape launcher is the reliable one-click executable entry point, while the Java fallback is a real Shadow fat JAR.
