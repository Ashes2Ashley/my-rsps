[CmdletBinding()]
param([switch]$Clean)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Project = Join-Path $Root 'vendor\elvarg-gradle\ElvargServer'
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Java 17 is required. Install a JDK 17 distribution.' }
$javaVersion = (& java -version 2>&1 | Out-String)
if ($javaVersion -notmatch 'version "17\.') { throw "Java 17 is required by the Gradle toolchain. Detected: $javaVersion" }
$gradle = Join-Path $Project 'gradlew.bat'
if ($Clean) { & $gradle clean --no-daemon }
& $gradle ':game:fatJar' '--no-daemon'
if ($LASTEXITCODE -ne 0) { throw 'Fat jar build failed.' }
Write-Host 'Fat jar output:' -ForegroundColor Green
Get-ChildItem (Join-Path $Project 'game\build\libs\*.jar') | Select-Object FullName,Length,LastWriteTime
