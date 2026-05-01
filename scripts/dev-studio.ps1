param(
    [switch]$BackendOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-ListeningPids {
    param([int]$Port)

    try {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
    }
    catch {
        return @()
    }
}

function Assert-PortAvailable {
    param(
        [int]$Port,
        [string]$Name
    )

    $pids = @(Get-ListeningPids -Port $Port)
    if ($pids.Count -gt 0) {
        throw "$Name port $Port is already in use by PID(s): $($pids -join ', '). Stop the existing process and try again."
    }
}

function Remove-IfExists {
    param([string]$Path)

    if (Test-Path $Path) {
        Remove-Item -LiteralPath $Path -Force
    }
}

function Start-ServiceProcess {
    param(
        [string]$Name,
        [int]$Port,
        [string]$Command,
        [string]$WorkingDirectory,
        [string]$HealthUrl
    )

    $stdoutLog = Join-Path $root "$Name-start.log"
    $stderrLog = Join-Path $root "$Name-start.err.log"

    Remove-IfExists -Path $stdoutLog
    Remove-IfExists -Path $stderrLog

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = "cmd.exe"
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.Arguments = "/d /s /c ""$Command 1>""$stdoutLog"" 2>""$stderrLog"""""

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo

    if (-not $process.Start()) {
        throw "Failed to start $Name."
    }

    return [pscustomobject]@{
        Name = $Name
        Port = $Port
        HealthUrl = $HealthUrl
        Process = $process
        StdoutLog = $stdoutLog
        StderrLog = $stderrLog
    }
}

function Get-LogTail {
    param(
        [string]$Path,
        [int]$Tail = 10
    )

    if (-not (Test-Path $Path)) {
        return ""
    }

    $lines = @(Get-Content -LiteralPath $Path -Tail $Tail -ErrorAction SilentlyContinue)
    if ($lines.Count -eq 0) {
        return ""
    }

    return ($lines -join " | ").Trim()
}

function Get-ServiceFailureDetails {
    param($Service)

    $stderrTail = Get-LogTail -Path $Service.StderrLog -Tail 8
    if ($stderrTail) {
        return "$($Service.Name)=Exited($($Service.Process.ExitCode)) stderr: $stderrTail"
    }

    $stdoutTail = Get-LogTail -Path $Service.StdoutLog -Tail 8
    if ($stdoutTail) {
        return "$($Service.Name)=Exited($($Service.Process.ExitCode)) stdout: $stdoutTail"
    }

    return "$($Service.Name)=Exited($($Service.Process.ExitCode))"
}

function Assert-ProcessesHealthy {
    param($Services)

    $stopped = @()

    foreach ($service in $Services) {
        $service.Process.Refresh()

        if ($service.Process.HasExited) {
            $stopped += $service
        }
    }

    if ($stopped.Count -gt 0) {
        $details = $stopped | ForEach-Object { Get-ServiceFailureDetails -Service $_ }
        throw "Studio stopped unexpectedly. " + ($details -join "; ")
    }
}

function Wait-ForEndpoint {
    param(
        [string]$Name,
        [string]$Url,
        $Services,
        [int]$TimeoutSeconds = 45
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        Assert-ProcessesHealthy -Services $Services

        try {
            $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 3 -UseBasicParsing
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                Write-Host "$Name ready at $Url" -ForegroundColor Green
                return
            }
        }
        catch {
        }

        Start-Sleep -Milliseconds 750
    }

    throw "$Name did not become ready at $Url within $TimeoutSeconds seconds."
}

function Stop-ServiceProcess {
    param($Service)

    if (-not $Service) {
        return
    }

    $Service.Process.Refresh()
    if ($Service.Process.HasExited) {
        return
    }

    & cmd.exe /d /s /c "taskkill /PID $($Service.Process.Id) /T /F >nul 2>&1"
}

$services = @(
    @{
        Name = "server"
        Port = 4000
        Command = "node src/index.js"
        WorkingDirectory = (Join-Path $root "server")
        HealthUrl = "http://localhost:4000/health"
    },
    @{
        Name = "worker"
        Port = 8001
        Command = "node worker/dev-runner.mjs"
        WorkingDirectory = $root
        HealthUrl = "http://localhost:8001/health"
    }
)

if (-not $BackendOnly) {
    $services = @(
        @{
            Name = "client"
            Port = 5184
            Command = "node scripts/serve-client.mjs"
            WorkingDirectory = $root
            HealthUrl = "http://localhost:5184"
        }
    ) + $services
}

foreach ($service in $services) {
    Assert-PortAvailable -Port $service.Port -Name $service.Name
}

$processes = @()

try {
    foreach ($service in $services) {
        $processes += Start-ServiceProcess `
            -Name $service.Name `
            -Port $service.Port `
            -Command $service.Command `
            -WorkingDirectory $service.WorkingDirectory `
            -HealthUrl $service.HealthUrl
    }

    Write-Host ""
    if (-not $BackendOnly) {
        Write-Host "Testing UI: http://localhost:5184"
    }
    Write-Host "API health: http://localhost:4000/health"
    Write-Host "Worker health: http://localhost:8001/health"
    Write-Host ""
    Write-Host "Logs:" -ForegroundColor DarkYellow
    foreach ($service in $processes) {
        Write-Host "  $($service.Name): $($service.StdoutLog)"
        Write-Host "  $($service.Name) errors: $($service.StderrLog)"
    }
    Write-Host ""
    Write-Host "Press Ctrl+C to stop the studio." -ForegroundColor DarkYellow
    Write-Host ""

    if (-not $BackendOnly) {
        Wait-ForEndpoint -Name "Client" -Url "http://localhost:5184" -Services $processes
    }
    Wait-ForEndpoint -Name "Server" -Url "http://localhost:4000/health" -Services $processes
    Wait-ForEndpoint -Name "Worker" -Url "http://localhost:8001/health" -Services $processes -TimeoutSeconds 120

    while ($true) {
        Assert-ProcessesHealthy -Services $processes
        Start-Sleep -Milliseconds 750
    }
}
finally {
    foreach ($service in $processes) {
        Stop-ServiceProcess -Service $service
    }
}
