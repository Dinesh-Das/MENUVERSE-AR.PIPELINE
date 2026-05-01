Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function Run-Step {
    param(
        [string]$Label,
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "== $Label ==" -ForegroundColor Yellow
    & $Action
}

function Copy-IfMissing {
    param(
        [string]$SourcePath,
        [string]$TargetPath
    )

    if (-not (Test-Path $TargetPath)) {
        Copy-Item $SourcePath $TargetPath
        Write-Host "Created $TargetPath"
    }
    else {
        Write-Host "Kept existing $TargetPath"
    }
}

function Get-PythonCommand {
    foreach ($candidate in @(
        @{ Command = "python";  Args = @() },
        @{ Command = "py";      Args = @("-3") },
        @{ Command = "python3"; Args = @() }
    )) {
        $found = Get-Command $candidate.Command -ErrorAction SilentlyContinue
        if (-not $found) { continue }

        # Reject LibreOffice's sandboxed Python — it cannot install pip packages
        if ($found.Source -match "LibreOffice") {
            Write-Host "  Skipping $($found.Source) — LibreOffice Python cannot install packages." -ForegroundColor DarkYellow
            continue
        }

        return $candidate
    }
    return $null
}

Set-Location $root

Run-Step "Copy env files" {
    Copy-IfMissing ".env.example" ".env"
    Copy-IfMissing "client\.env.example" "client\.env"
    Copy-IfMissing "server\.env.example" "server\.env"
    Copy-IfMissing "worker\.env.example" "worker\.env"
}

Run-Step "Install root dependencies" {
    cmd /c npm install
}

Run-Step "Install client dependencies" {
    cmd /c npm --prefix client install
}

Run-Step "Install server dependencies" {
    cmd /c npm --prefix server install
}

Run-Step "Run Prisma migration" {
    cmd /c npm run prisma:migrate
}

$pythonCommand = Get-PythonCommand

if ($pythonCommand) {
    Run-Step "Set up worker virtual environment" {
        if (Test-Path "worker\.venv") {
            # A healthy venv always has Scripts\python.exe; if missing the venv is broken
            if (-not (Test-Path "worker\.venv\Scripts\python.exe")) {
                Write-Host "Existing worker\.venv is broken (Scripts\python.exe missing). Recreating..." -ForegroundColor Yellow
                Remove-Item -Recurse -Force "worker\.venv"
            } else {
                Write-Host "worker\.venv already exists and is healthy."
            }
        }

        if (-not (Test-Path "worker\.venv")) {
            & $pythonCommand.Command @($pythonCommand.Args) -m venv "worker\.venv"
        }

        & "worker\.venv\Scripts\python.exe" -m pip install --upgrade pip
        & "worker\.venv\Scripts\python.exe" -m pip install -r "worker\requirements.txt"
    }
}
else {
    Write-Host ""
    Write-Host "Python was not found. Skipping worker setup." -ForegroundColor Red
    Write-Host "Install Python 3.10+ from python.org, then run:"
    Write-Host "  python -m venv worker\.venv"
    Write-Host "  worker\.venv\Scripts\python -m pip install -r worker\requirements.txt"
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Testing UI: http://localhost:5184"
Write-Host "API health: http://localhost:4000/health"
Write-Host "Worker health: http://localhost:8001/health"
Write-Host ""
Write-Host "Start everything with:"
Write-Host "  cmd /c npm run dev:studio"
