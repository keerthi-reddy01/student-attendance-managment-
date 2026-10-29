param(
    [int]$Port = 8080,
    [string]$BaseDir = 'C:\devops\jenkins'
)

$ErrorActionPreference = 'Stop'
$BaseDir = [System.IO.Path]::GetFullPath($BaseDir)
$logs = Join-Path $BaseDir 'logs'
$pidFile = Join-Path $logs 'jenkins.pid'
$stopped = $false

if (Test-Path $pidFile) {
    $processId = (Get-Content $pidFile | Select-Object -First 1).Trim()
    if ($processId -match '^\d+$') {
        $process = Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -match 'java') {
            Stop-Process -Id $process.Id -Force
            Write-Output "Stopped Jenkins (PID $processId)."
            $stopped = $true
        }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

if (-not $stopped) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -match 'java') {
            Stop-Process -Id $process.Id -Force
            Write-Output "Stopped Java process listening on port $Port (PID $($process.Id))."
            $stopped = $true
        }
    }
}

if (-not $stopped) {
    Write-Output 'No running Jenkins process was found.'
}
