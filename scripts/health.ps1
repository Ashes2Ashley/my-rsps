[CmdletBinding()]
param([int]$ClientPort = 3000, [int]$ServerPort = 43594)
$Root = Split-Path -Parent $PSScriptRoot
function Port([int]$P) {
  try { $r = Test-NetConnection 127.0.0.1 -Port $P -WarningAction SilentlyContinue; return $r.TcpTestSucceeded } catch { return $false }
}
Write-Host "Custom RSPS health check: $Root"
Write-Host ("Node: " + [bool](Get-Command node -ErrorAction SilentlyContinue))
Write-Host ("Java: " + [bool](Get-Command java -ErrorAction SilentlyContinue))
Write-Host ("cloudflared: " + [bool](Get-Command cloudflared -ErrorAction SilentlyContinue))
Write-Host ("Client 127.0.0.1:$ClientPort: " + $(Port $ClientPort))
Write-Host ("Server 127.0.0.1:$ServerPort: " + $(Port $ServerPort))
