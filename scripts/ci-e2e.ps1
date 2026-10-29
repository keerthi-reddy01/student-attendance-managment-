param(
    [int]$Port = 3200,
    [string]$DataDir = "",
    [switch]$KeepData,
    [switch]$SeedDemo
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

# Make the script work both from Jenkins and from a plain PowerShell window.
$env:Path = "$env:ProgramFiles\nodejs;$env:ProgramFiles\Git\cmd;" + $env:Path
if (Test-Path "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin") {
    $env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;" + $env:Path
}

$reports = Join-Path $root 'reports'
New-Item -ItemType Directory -Path $reports -Force | Out-Null
if (-not $DataDir) {
    $DataDir = Join-Path $reports ("ci-e2e-data-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null

$stdout = Join-Path $reports 'ci-e2e-server.log'
$stderr = Join-Path $reports 'ci-e2e-server-error.log'
$healthUrl = "http://127.0.0.1:$Port/api/health"
$baseUrl = "http://127.0.0.1:$Port"

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $node -or -not $npm) {
    throw 'Node.js and npm must be available on PATH.'
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    throw "Port $Port is already in use by process $($listener.OwningProcess)."
}

$previous = @{
    PORT = $env:PORT
    DATA_DIR = $env:DATA_DIR
    NODE_ENV = $env:NODE_ENV
    SEED_ON_EMPTY = $env:SEED_ON_EMPTY
    SELENIUM_BASE_URL = $env:SELENIUM_BASE_URL
}

$env:PORT = "$Port"
$env:DATA_DIR = $DataDir
$env:NODE_ENV = $(if ($SeedDemo) { 'development' } else { 'test' })
$env:SEED_ON_EMPTY = $(if ($SeedDemo) { 'true' } else { 'false' })
$env:SELENIUM_BASE_URL = $baseUrl

$process = $null
$exitCode = 1

try {
    Write-Output "Starting application for E2E tests on $baseUrl"
    Write-Output "Temporary database: $DataDir"

    $process = Start-Process -FilePath $node `
        -ArgumentList 'backend/server.js' `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -PassThru

    $healthy = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        if ($process.HasExited) {
            break
        }
        try {
            $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
            if ($response.status -eq 'ok') {
                $healthy = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }

    if (-not $healthy) {
        Write-Output 'Application did not become healthy. Server log:'
        if (Test-Path $stdout) { Get-Content $stdout -Tail 60 }
        if (Test-Path $stderr) { Get-Content $stderr -Tail 60 }
        throw 'E2E application failed to start.'
    }

    Write-Output 'Application is healthy. Running Selenium WebDriver tests...'
    & $npm run test:e2e
    $exitCode = $LASTEXITCODE
    Write-Output "Selenium test process exited with code $exitCode."
}
finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        $process.WaitForExit(5000) | Out-Null
    }

    $env:PORT = $previous.PORT
    $env:DATA_DIR = $previous.DATA_DIR
    $env:NODE_ENV = $previous.NODE_ENV
    $env:SEED_ON_EMPTY = $previous.SEED_ON_EMPTY
    $env:SELENIUM_BASE_URL = $previous.SELENIUM_BASE_URL

    if ($exitCode -eq 0 -and -not $KeepData) {
        Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue
    } elseif (Test-Path $DataDir) {
        Write-Output "E2E data retained for troubleshooting: $DataDir"
    }
}

if ($exitCode -ne 0) {
    throw "Selenium E2E tests failed (exit code $exitCode). See $stdout and $stderr."
}
