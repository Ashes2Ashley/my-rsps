[CmdletBinding()]
param(
  [ValidateSet('primary','jar','both')][string]$Mode = 'primary',
  [switch]$Tunnel,
  [switch]$BuildOnly,
  [switch]$SkipInstall,
  [switch]$SkipCache
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $Root 'logs'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Log = Join-Path $LogDir "bellascape-$Stamp.log"
New-Item -ItemType Directory -Force $LogDir, (Join-Path $Root 'run') | Out-Null

function Need([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Missing $Name. $Hint" }
}
function Call([string]$File, [string[]]$Args, [string]$Cwd) {
  Push-Location $Cwd
  try { & $File @Args; if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" } }
  finally { Pop-Location }
}

try {
  Start-Transcript -Path $Log -Force | Out-Null
  Write-Host '=== Bellascape deployment ===' -ForegroundColor Magenta
  if ($Mode -eq 'primary' -or $Mode -eq 'both') {
    Need 'node' 'Install Node.js 22.16+.'
    $deployArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'deploy.ps1'),'-Profile','ts')
    if ($SkipInstall) { $deployArgs += '-SkipInstall' }
    if ($SkipCache) { $deployArgs += '-SkipCache' }
    if (-not $BuildOnly) { $deployArgs += '-Start' }
    Call 'powershell' $deployArgs $Root
  }
  if ($Mode -eq 'jar' -or $Mode -eq 'both') {
    Need 'java' 'Install Java 17+.'
    Write-Host 'Building Bellascape Java Shadow fat JAR...' -ForegroundColor Cyan
    $project = Join-Path $Root 'vendor\elvarg-gradle\ElvargServer'
    Call (Join-Path $project 'gradlew.bat') @(':game:fatJar','--no-daemon') $project
    $jar = Get-ChildItem (Join-Path $project 'game\build\libs\*-all.jar') | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $jar) { throw 'Shadow fat JAR was not produced.' }
    Write-Host "Bellascape JAR: $($jar.FullName)" -ForegroundColor Green
    if (-not $BuildOnly) { Call 'java' @('-jar',$jar.FullName) (Join-Path $project 'game') }
  }
  if ($Tunnel) {
    Need 'cloudflared' 'Install cloudflared, run cloudflared tunnel login, and configure cloudflared\config.yml.'
    $config = Join-Path $Root 'cloudflared\config.yml'
    if (-not (Test-Path $config)) { throw 'Missing cloudflared\config.yml. Copy the example and replace placeholders.' }
    if ((Get-Content $config -Raw) -match 'CHANGE_ME') { throw 'cloudflared\config.yml still contains CHANGE_ME placeholders.' }
    if ($BuildOnly) { Write-Host 'Tunnel configuration validated; not started because -BuildOnly was supplied.' }
    else { Call 'cloudflared' @('tunnel','--config',$config,'run') $Root }
  }
  Write-Host "Bellascape completed. Log: $Log" -ForegroundColor Green
} catch {
  Write-Host "Bellascape failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Log: $Log" -ForegroundColor Yellow
  exit 1
} finally { try { Stop-Transcript | Out-Null } catch {} }
