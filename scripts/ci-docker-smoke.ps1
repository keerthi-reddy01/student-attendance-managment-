param(
    [string]$Image = 'student-attendance:1.0.0',
    [int]$Port = 3100,
    [string]$ContainerName = 'attendance-ci-smoke',
    [string]$VolumeName = 'attendance-ci-smoke-data'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

# Docker Desktop's CLI location is not always on a fresh shell's PATH.
foreach ($candidate in @(
    "$env:ProgramFiles\Docker\Docker\resources\bin",
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
)) {
    if (Test-Path (Join-Path $candidate 'docker.exe')) {
        $env:Path = "$candidate;" + $env:Path
    }
}
if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
    throw 'The docker CLI was not found. Start Docker Desktop and try again.'
}

function Wait-Health {
    param([string]$Url, [int]$Seconds = 90)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri $Url -TimeoutSec 2
            if ($response.status -eq 'ok' -and $response.database -eq $true) {
                return $response
            }
        } catch {
            Start-Sleep -Milliseconds 750
        }
    }
    throw "Health check timed out: $Url"
}

$baseUrl = "http://127.0.0.1:$Port"
$rollNo = "DOCKER$((Get-Date).ToString('HHmmss'))"
$studentCreated = $false

try {
    Write-Output 'Cleaning up any previous smoke-test resources...'
    cmd /c "docker rm -f $ContainerName >nul 2>&1" | Out-Null
    cmd /c "docker volume rm $VolumeName >nul 2>&1" | Out-Null

    cmd /c "docker image inspect $Image >nul 2>&1" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Output "Image $Image not found. Building it..."
        & docker build -t $Image .
        if ($LASTEXITCODE -ne 0) { throw 'docker build failed.' }
    }

    Write-Output "Starting $Image as $ContainerName on port $Port..."
    & docker run -d --name $ContainerName `
        -p "${Port}:3000" `
        -e NODE_ENV=production `
        -e PORT=3000 `
        -e DATA_DIR=/app/data `
        -e SEED_ON_EMPTY=false `
        -v "${VolumeName}:/app/data" `
        $Image | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'docker run failed.' }

    $health = Wait-Health -Url "$baseUrl/api/health"
    Write-Output "Container is healthy (service=$($health.service), database=$($health.database))."

    $page = Invoke-WebRequest -Uri "$baseUrl/" -UseBasicParsing -TimeoutSec 10
    if ($page.StatusCode -ne 200) { throw "Frontend returned HTTP $($page.StatusCode)." }

    $payload = @{
        rollNo = $rollNo
        name = 'Docker Persistence Check'
        department = 'Computer Science'
    } | ConvertTo-Json
    $created = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/students" `
        -ContentType 'application/json' -Body $payload -TimeoutSec 10
    if ($created.student.rollNo -ne $rollNo) { throw 'Student was not created through the API.' }
    $studentCreated = $true

    $beforeRestart = Invoke-RestMethod -Uri "$baseUrl/api/students?search=$rollNo" -TimeoutSec 10
    if ($beforeRestart.count -ne 1) { throw 'Created student was not found before restart.' }

    Write-Output 'Restarting the container to verify SQLite persistence...'
    & docker restart $ContainerName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'docker restart failed.' }
    Wait-Health -Url "$baseUrl/api/health" | Out-Null

    $afterRestart = Invoke-RestMethod -Uri "$baseUrl/api/students?search=$rollNo" -TimeoutSec 10
    if ($afterRestart.count -ne 1) {
        throw 'Student record did not survive the container restart (volume persistence failed).'
    }

    $dashboard = Invoke-RestMethod -Uri "$baseUrl/api/dashboard" -TimeoutSec 10
    if ($null -eq $dashboard.totalStudents) { throw 'Dashboard API did not return metrics after restart.' }

    Write-Output "PASS: container health, frontend, API write and SQLite volume persistence verified (student $rollNo)."
    Write-Output "Docker smoke test completed successfully on $baseUrl."
}
catch {
    Write-Output 'Docker smoke test failed. Container logs:'
    cmd /c "docker logs --tail 80 $ContainerName 2>&1"
    throw
}
finally {
    Write-Output 'Removing smoke-test container and volume...'
    cmd /c "docker rm -f $ContainerName >nul 2>&1" | Out-Null
    cmd /c "docker volume rm $VolumeName >nul 2>&1" | Out-Null
    if ($studentCreated) {
        Write-Output 'Smoke-test database volume was disposable and has been removed.'
    }
}
