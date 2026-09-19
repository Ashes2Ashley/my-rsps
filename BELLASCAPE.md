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

## Important limitation

A truly self-contained native `.exe` containing Node.js, the browser runtime, the cache, the TypeScript server, and `cloudflared` would require a separate Windows packaging/release pipeline. The supplied Bellascape launcher is the reliable one-click executable entry point, while the Java fallback is a real Shadow fat JAR.
