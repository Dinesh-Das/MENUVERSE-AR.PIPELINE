Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Starting AR Pipeline Studio..." -ForegroundColor Yellow
Write-Host "Testing UI: http://localhost:5184"
Write-Host "API health: http://localhost:4000/health"
Write-Host "Worker health: http://localhost:8001/health"
Write-Host ""
Write-Host "If 5184 is already in use, stop the other app first." -ForegroundColor DarkYellow
Write-Host ""

cmd /c npm run dev:studio
