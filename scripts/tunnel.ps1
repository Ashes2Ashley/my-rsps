[CmdletBinding()]
param([string]$Config = '')
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) { throw 'cloudflared is not installed or not on PATH.' }
if ([string]::IsNullOrWhiteSpace($Config)) { $Config = Join-Path $Root 'cloudflared\config.yml' }
if (-not (Test-Path $Config)) { throw "Missing $Config. Copy cloudflared\config.yml.example, then replace tunnel ID, credentials path, and hostnames." }
$content = Get-Content $Config -Raw
if ($content -match 'CHANGE_ME') { throw 'Tunnel config still contains CHANGE_ME placeholders.' }
Write-Host "Starting Cloudflare Tunnel with $Config. Press Ctrl+C to stop." -ForegroundColor Green
& cloudflared tunnel --config $Config run
