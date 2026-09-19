[CmdletBinding()]
param(
  [ValidateSet('auto','ts','java-modern','java-legacy')][string]$Profile = 'auto',
  [switch]$NoClient
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TsRoot = Join-Path $Root 'tsps-primary'
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null

function Read-LocalEnv {
  $envFile = Join-Path $Root '.env.local'
  if (-not (Test-Path $envFile)) { return }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $line -notmatch '^\s*#') {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
  }
}
function Has([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }
function Fail([string]$Message) { Write-Host "ERROR: $Message" -ForegroundColor Red; exit 1 }
Read-LocalEnv
if ($Profile -eq 'auto') { $Profile = if (Has 'node') { 'ts' } elseif (Has 'java') { 'java-modern' } else { 'ts' } }

switch ($Profile) {
  'ts' {
    if (-not (Has 'node')) { Fail 'Node.js 22+ is required. Run .\scripts\setup.ps1 after installing Node.js.' }
    if (-not (Test-Path (Join-Path $TsRoot 'node_modules'))) { Fail 'Dependencies are not installed. Run .\scripts\setup.ps1 first.' }
    Push-Location $TsRoot
    try {
      Write-Host 'Starting primary TypeScript server and browser client. Press Ctrl+C to stop.' -ForegroundColor Green
      if ($NoClient) { npm run server } else { npm run start }
    } finally { Pop-Location }
  }
  'java-modern' {
    if (-not (Has 'java')) { Fail 'Java 17 is required for the modern Elvarg fallback.' }
    $gradlew = Join-Path $Root 'vendor\elvarg-gradle\ElvargServer\gradlew.bat'
    if (-not (Test-Path $gradlew)) { Fail 'Modern Elvarg Gradle wrapper is missing.' }
    Push-Location (Split-Path $gradlew)
    try { & $gradlew ':game:run' '--no-daemon' } finally { Pop-Location }
  }
  'java-legacy' {
    Write-Host 'The original legacy repository has no reproducible Gradle/Maven launcher.' -ForegroundColor Yellow
    Write-Host 'Use an IDE or add your own Java 8/17 build command under vendor\elvarg-legacy.'
    Write-Host 'This profile is kept as source/reference and is not mixed with the TS protocol.'
    exit 2
  }
}
