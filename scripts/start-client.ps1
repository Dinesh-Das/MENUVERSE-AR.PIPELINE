$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

cmd /c npm --prefix client run build

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

node scripts/serve-client.mjs
