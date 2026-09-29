<#
.SYNOPSIS
  Builds, tests and publishes NEXUS OPTIMIZER into publish\NexusOptimizer (UI + engine host/CLI side by side).
.EXAMPLE
  pwsh installer\publish.ps1
  iscc installer\NexusOptimizer.iss      # optional: build the installer (Inno Setup 6)
#>
param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root "publish\NexusOptimizer"

Write-Host "== Tests" -ForegroundColor Cyan
dotnet test (Join-Path $root "src\Nexus.Tests") -c $Configuration
if ($LASTEXITCODE -ne 0) { throw "Tests failed - aborting publish." }

if (Test-Path $out) { Remove-Item $out -Recurse -Force }

Write-Host "== Engine host / CLI (nexus.exe)" -ForegroundColor Cyan
dotnet publish (Join-Path $root "src\Nexus.CLI") -c $Configuration -r $Runtime --self-contained true -o $out
Write-Host "== Desktop UI (NexusOptimizer.exe)" -ForegroundColor Cyan
dotnet publish (Join-Path $root "src\Nexus.UI") -c $Configuration -r $Runtime --self-contained true -o $out

New-Item -ItemType Directory -Force (Join-Path $out "tools") | Out-Null
Set-Content (Join-Path $out "tools\README.txt") "Place PresentMon.exe here to enable FPS / frame-time capture (https://github.com/GameTechDev/PresentMon)."
Write-Host "Published to $out" -ForegroundColor Green
