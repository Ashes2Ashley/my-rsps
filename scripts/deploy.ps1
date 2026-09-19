[CmdletBinding()]
param(
  [ValidateSet('ts','java-modern','both')][string]$Profile = 'ts',
  [switch]$SkipInstall,
  [switch]$SkipCache,
  [switch]$SkipBuild,
  [switch]$BuildFatJar,
  [switch]$Start,
  [switch]$Tunnel,
  [switch]$Production
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TsRoot = Join-Path $Root 'tsps-primary'
$LogDir = Join-Path $Root 'logs'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Log = Join-Path $LogDir "deploy-$Stamp.log"
New-Item -ItemType Directory -Force $LogDir, (Join-Path $Root 'run') | Out-Null

function Say([string]$Message) { Write-Host "[deploy] $Message" -ForegroundColor Cyan }
function Require([string]$Command, [string]$Hint) {
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { throw "Missing $Command. $Hint" }
}
function Run([string]$File, [string[]]$Args, [string]$WorkingDirectory, [switch]$AllowFailure) {
  Push-Location $WorkingDirectory
  try {
    & $File @Args
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFailure) { throw "$File failed with exit code $code" }
    return $code
  } finally { Pop-Location }
}

try {
  Start-Transcript -Path $Log -Force | Out-Null
  Require 'node' 'Install Node.js 22.16+ from https://nodejs.org/'
  Require 'npm' 'npm is included with Node.js.'
  $nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
  if ($nodeMajor -lt 22) { throw "Node.js 22+ is required; detected $(node --version)." }

  if (-not (Test-Path (Join-Path $Root '.env.local'))) {
    Copy-Item (Join-Path $Root '.env.example') (Join-Path $Root '.env.local')
    Say 'Created .env.local. Review it before exposing the server publicly.'
  }

  if (-not $SkipInstall -and ($Profile -eq 'ts' -or $Profile -eq 'both')) {
    Say 'Installing TypeScript primary dependencies with immutable-lock fallback.'
    $setupCode = Run 'npm' @('run','setup') $TsRoot -AllowFailure
    if ($setupCode -ne 0) {
      Say 'Immutable install rejected upstream lockfile drift; reconciling lockfiles.'
      Run 'npm' @('exec','--yes','--package','@yarnpkg/cli-dist@4.12.0','--','yarn','install') $TsRoot
      Run 'npm' @('exec','--yes','--package','@yarnpkg/cli-dist@4.12.0','--','yarn','--cwd','server','install') $TsRoot
      Run 'npm' @('exec','--yes','--package','@yarnpkg/cli-dist@4.12.0','--','yarn','--cwd','client','install') $TsRoot
    }
  }

  Run 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'sync-plugins.ps1')) $Root

  if (-not $SkipCache -and ($Profile -eq 'ts' -or $Profile -eq 'both')) {
    Say 'Downloading and validating the game cache.'
    Run 'npm' @('run','ensure-cache') (Join-Path $TsRoot 'server')
  }

  if (-not $SkipBuild -and ($Profile -eq 'ts' -or $Profile -eq 'both')) {
    Say 'Building TypeScript server.'
    Run 'npm' @('run','build') (Join-Path $TsRoot 'server')
    Say 'Building browser client.'
    Run 'npm' @('run','build') (Join-Path $TsRoot 'client')
  }

  if ($Profile -eq 'java-modern' -or $Profile -eq 'both' -or $BuildFatJar) {
    Require 'java' 'Install Java 17+ for the modern Elvarg fallback.'
    Say 'Building Java fallback fat JAR.'
    $fatScript = Join-Path $PSScriptRoot 'build-fat-jar.ps1'
    Run 'powershell' @('-NoProfile','-ExecutionPolicy','Bypass','-File',$fatScript) $Root
  }

  if ($Tunnel) {
    Require 'cloudflared' 'Install cloudflared and authenticate with cloudflared tunnel login.'
    $tunnelScript = Join-Path $PSScriptRoot 'tunnel.ps1'
    if (-not (Test-Path (Join-Path $Root 'cloudflared\config.yml'))) {
      throw 'Tunnel requested but cloudflared\config.yml is missing or still needs configuration.'
    }
  }

  Say 'Deployment completed successfully.'
  Say "Log: $Log"
  Say 'Client URL: http://localhost:3000'
  Say 'Game server: ws://localhost:43594'

  if ($Start -and ($Profile -eq 'ts' -or $Profile -eq 'both')) {
    Say 'Starting TypeScript client/server.'
    $startArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'start.ps1'),'-Profile','ts')
    if ($Production) { $env:NODE_ENV = 'production' }
    Start-Process powershell -ArgumentList $startArgs -WorkingDirectory $Root
  }
  if ($Tunnel) {
    Say 'Starting Cloudflare Tunnel.'
    Start-Process powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'tunnel.ps1')) -WorkingDirectory $Root
  }
} catch {
  Write-Host "[deploy] FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "[deploy] Review $Log for the full transcript." -ForegroundColor Yellow
  exit 1
} finally {
  try { Stop-Transcript | Out-Null } catch { }
}
