[CmdletBinding()]
param([switch]$WhatIf)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root 'plugin-hub'
$Target = Join-Path $Root 'tsps-primary\server\plugins\custom-hub'
if (-not (Test-Path $Source)) { throw "Missing plugin hub: $Source" }
New-Item -ItemType Directory -Force $Target | Out-Null
$plugins = Get-ChildItem $Source -File -Filter '*.plugin.js'
foreach ($plugin in $plugins) {
  $destination = Join-Path $Target $plugin.Name
  if ($WhatIf) { Write-Host "Would copy $($plugin.Name)" }
  else { Copy-Item $plugin.FullName $destination -Force; Write-Host "Synced $($plugin.Name)" -ForegroundColor Green }
}
Write-Host "Plugin hub: $($plugins.Count) plugin(s) found. Restart the server to reload." 
