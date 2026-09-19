[CmdletBinding()]
param([switch]$SkipCache)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$TsRoot = Join-Path $Root 'tsps-primary'

function Require-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing '$Name'. $InstallHint"
  }
}

Require-Command node 'Install Node.js 22.16+ from https://nodejs.org/'
Require-Command npm 'npm should be installed with Node.js.'
$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]") -as [string])
if ($nodeMajor -lt 22) { throw "Node.js 22+ is required. Detected: $(node --version)" }

New-Item -ItemType Directory -Force (Join-Path $Root 'logs'), (Join-Path $Root 'run') | Out-Null
if (-not (Test-Path (Join-Path $Root '.env.local'))) {
  Copy-Item (Join-Path $Root '.env.example') (Join-Path $Root '.env.local')
  Write-Host 'Created .env.local; review it before public deployment.' -ForegroundColor Yellow
}

Push-Location $TsRoot
try {
  Write-Host 'Installing root, server, and client dependencies...' -ForegroundColor Cyan
  npm run setup
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'The upstream immutable lockfile check failed; retrying with lockfile reconciliation.' -ForegroundColor Yellow
    npm exec --yes --package @yarnpkg/cli-dist@4.12.0 -- yarn install
    if ($LASTEXITCODE -ne 0) { throw 'Root dependency installation failed.' }
    npm exec --yes --package @yarnpkg/cli-dist@4.12.0 -- yarn --cwd server install
    if ($LASTEXITCODE -ne 0) { throw 'Server dependency installation failed.' }
    npm exec --yes --package @yarnpkg/cli-dist@4.12.0 -- yarn --cwd client install
    if ($LASTEXITCODE -ne 0) { throw 'Client dependency installation failed.' }
  }
  if (-not $SkipCache) { Write-Host 'Cache setup is included above; rerun with -SkipCache only for dependency repair.' -ForegroundColor DarkGray }
} finally { Pop-Location }
Write-Host 'Setup complete. Start with: .\scripts\start.ps1 -Profile ts' -ForegroundColor Green
