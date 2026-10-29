param(
    [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $root 'logs\server.pid'

$stopped = $false
if (Test-Path $pidFile) {
    $processId = (Get-Content $pidFile | Select-Object -First 1).Trim()
    if ($processId -match '^\d+$') {
        $process = Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -eq 'node') {
            Stop-Process -Id $process.Id -Force
            Write-Output "Stopped AttendX server (PID $processId)."
            $stopped = $true
        }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

if (-not $stopped) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -eq 'node') {
            Stop-Process -Id $process.Id -Force
            Write-Output "Stopped Node process on port $Port (PID $($process.Id))."
            $stopped = $true
        }
    }
}

if (-not $stopped) {
    Write-Output 'No running AttendX server was found.'
}
