[CmdletBinding()]
param(
  [string]$GameAddress = '127.0.0.1:43594',
  [switch]$SecureGame,
  [switch]$IncludeJavaServer,
  [string]$OutputDirectory = '',
  [string]$SevenZip = '',
  [string]$SfxModule = '',
  [switch]$NoDownload
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ClientBuild = Join-Path $Root 'tsps-primary\client\build'
$Jar = Join-Path $Root 'dist\Bellascape-Server-all.jar'
if (-not (Test-Path (Join-Path $ClientBuild 'index.html'))) { throw 'Client build is missing. Run .\scripts\deploy.ps1 -Profile ts first.' }
if ($IncludeJavaServer -and -not (Test-Path $Jar)) { throw 'Bellascape fat JAR is missing. Run .\scripts\bellascape.ps1 -Mode jar -BuildOnly first.' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $Root 'dist\windows' }
$Stage = Join-Path $OutputDirectory 'Bellascape'
$Runtime = Join-Path $Stage 'runtime'
$NodeDir = Join-Path $Runtime 'node'
$JavaDir = Join-Path $Runtime 'java'
$NodeZip = Join-Path $env:TEMP 'bellascape-node-win-x64.zip'
$JavaZip = Join-Path $env:TEMP 'bellascape-java17-win-x64.zip'
$NodeUrl = 'https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip'
$JavaUrl = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse'
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force $Stage, $NodeDir | Out-Null

function Download([string]$Url, [string]$Path) {
  if ($NoDownload -and -not (Test-Path $Path)) { throw "Missing cached download $Path and -NoDownload was specified." }
  if (-not (Test-Path $Path)) { Write-Host "Downloading $Url" -ForegroundColor Cyan; Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing }
}
function Resolve7z() {
  if ($SevenZip -and (Test-Path $SevenZip)) { return (Resolve-Path $SevenZip).Path }
  $cmd = Get-Command 7z.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $known = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") | Where-Object { $_ -and (Test-Path $_) }
  if ($known) { return $known[0] }
  return $null
}

Download $NodeUrl $NodeZip
$extract = Join-Path $env:TEMP "bellascape-node-$([guid]::NewGuid())"
Expand-Archive -Path $NodeZip -DestinationPath $extract -Force
$nodeRoot = Get-ChildItem $extract -Directory | Select-Object -First 1
Copy-Item (Join-Path $nodeRoot.FullName '*') $NodeDir -Recurse -Force
Remove-Item -Recurse -Force $extract

if ($IncludeJavaServer) {
  Download $JavaUrl $JavaZip
  $extract = Join-Path $env:TEMP "bellascape-java-$([guid]::NewGuid())"
  Expand-Archive -Path $JavaZip -DestinationPath $extract -Force
  $javaRoot = Get-ChildItem $extract -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Force $JavaDir | Out-Null
  Copy-Item (Join-Path $javaRoot.FullName '*') $JavaDir -Recurse -Force
  Copy-Item $Jar (Join-Path $Stage 'Bellascape-Server-all.jar') -Force
  Remove-Item -Recurse -Force $extract
}

Copy-Item $ClientBuild (Join-Path $Stage 'client') -Recurse -Force
$secureValue = if ($SecureGame) { 'true' } else { 'false' }
@"
[
  {
    "name": "Bellascape",
    "address": "$GameAddress",
    "secure": $secureValue,
    "maxPlayers": 2047
  }
]
"@ | Set-Content (Join-Path $Stage 'client\servers.json') -Encoding UTF8

@'
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "client");
const port = Number(process.env.BELLASCAPE_CLIENT_PORT || 3000);
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".wasm":"application/wasm" };
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    let requestPath = decodeURIComponent(url.pathname);
    if (requestPath === "/" || requestPath === "/play" || requestPath === "/play/") requestPath = "/index.html";
    else if (requestPath.startsWith("/play/")) requestPath = requestPath.slice(5);
    const safe = path.normalize(requestPath).replace(/^([.][.][\\/])+/, "").replace(/^[/\\]+/, "");
    let file = path.join(root, safe);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end("Forbidden"); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
server.listen(port, "127.0.0.1", () => console.log(`Bellascape client: http://127.0.0.1:${port}/play/`));
'@ | Set-Content (Join-Path $Stage 'bellascape-client-server.mjs') -Encoding UTF8

$jarLine = if ($IncludeJavaServer) { "echo Start the bundled server separately from this folder when needed.&echo." } else { "" }
@"
@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0runtime\node;%~dp0runtime\java\bin;%PATH%"
$jarLine
start "Bellascape" http://127.0.0.1:3000/play/
node bellascape-client-server.mjs
"@ | Set-Content (Join-Path $Stage 'Bellascape-Player.cmd') -Encoding ASCII

$archive = Join-Path $OutputDirectory 'Bellascape-Player.7z'
$archiveTool = Resolve7z
if ($archiveTool) {
  & $archiveTool a -t7z -mx=9 $archive (Join-Path $Stage '*') | Out-Host
  if ($LASTEXITCODE -ne 0) { throw '7-Zip archive creation failed.' }
  if ($SfxModule) { $Sfx = $SfxModule } else { $Sfx = Join-Path (Split-Path $archiveTool) '7z.sfx' }
  if (Test-Path $Sfx) {
    $cfg = Join-Path $env:TEMP 'bellascape-sfx-config.txt'
    @'
    ;!@Install@!UTF-8!
    RunProgram="Bellascape-Player.cmd"
    GUIMode="2"
    ;!@InstallEnd@!
"@ | Set-Content $cfg -Encoding UTF8
    $exe = Join-Path $OutputDirectory 'Bellascape-Player.exe'
    cmd /c "copy /b `"$Sfx`"+`"$cfg`"+`"$archive`" `"$exe`"" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'SFX executable creation failed.' }
    Write-Host "Created $exe" -ForegroundColor Green
  } else { Write-Warning '7z.sfx was not found; ZIP was created but single-file EXE was not.' }
} else { Write-Warning '7z.exe was not found; staging folder was created. Install 7-Zip and rerun to create ZIP/EXE.' }
Write-Host "Staging: $Stage" -ForegroundColor Green
Write-Host "Game address baked into client: $GameAddress" -ForegroundColor Green
