param(
    [int]$Port = 3000,
    [string]$DataDir = ""
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $DataDir) { $DataDir = Join-Path $root 'data' }
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stdout = Join-Path $logDir 'server.log'
$stderr = Join-Path $logDir 'server-error.log'
$pidFile = Join-Path $logDir 'server.pid'
$healthUrl = "http://127.0.0.1:$Port/api/health"

function Test-Health {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
        return $response.status -eq 'ok'
    } catch {
        return $false
    }
}

if (Test-Health) {
    Write-Output "AttendX is already running at http://localhost:$Port"
    exit 0
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Write-Error "Port $Port is already in use by process ID $($listener.OwningProcess). Stop it or choose another port."
    exit 1
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
    $candidate = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path $candidate) { $node = $candidate }
}
if (-not $node) { throw 'Node.js was not found. Install Node.js 22+ and try again.' }

$env:PORT = "$Port"
$env:DATA_DIR = $DataDir
$env:SEED_ON_EMPTY = 'true'
$env:NODE_ENV = 'development'

$process = Start-Process -FilePath $node `
    -ArgumentList 'backend/server.js' `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

$process.Id | Set-Content -Path $pidFile -Encoding ASCII

for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($process.HasExited) {
        Write-Output 'Server process exited unexpectedly.'
        if (Test-Path $stdout) { Get-Content $stdout -Tail 40 }
        if (Test-Path $stderr) { Get-Content $stderr -Tail 40 }
        exit 1
    }
    if (Test-Health) {
        Write-Output "AttendX started successfully (PID $($process.Id))."
        Write-Output "Application : http://localhost:$Port"
        Write-Output "Health      : $healthUrl"
        Write-Output "Logs        : $stdout"
        exit 0
    }
    Start-Sleep -Milliseconds 500
}

Write-Error 'Timed out waiting for the application to become healthy.'
if (Test-Path $stdout) { Get-Content $stdout -Tail 40 }
exit 1
