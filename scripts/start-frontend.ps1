Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Starting AR Pipeline Studio frontend only..." -ForegroundColor Yellow
Write-Host "Testing UI: http://localhost:5184"
Write-Host ""

cmd /c npm run dev:frontend
