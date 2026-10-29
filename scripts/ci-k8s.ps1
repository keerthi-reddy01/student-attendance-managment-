param(
    [string]$Namespace = 'attendance',
    [string]$Image = 'student-attendance:1.0.0',
    [int]$Port = 8081,
    [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

# Tool discovery for a normal shell and for Jenkins.
foreach ($candidate in @(
    "$env:LOCALAPPDATA\Programs\Minikube",
    "$env:ProgramFiles\Kubernetes\Minikube",
    "$env:ProgramFiles\Docker\Docker\resources\bin",
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
)) {
    if (Test-Path $candidate) { $env:Path = "$candidate;" + $env:Path }
}

$docker = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source
$minikube = (Get-Command minikube.exe -ErrorAction SilentlyContinue).Source
$kubectl = (Get-Command kubectl.exe -ErrorAction SilentlyContinue).Source
if (-not $docker) { throw 'docker.exe was not found. Start Docker Desktop first.' }
if (-not $minikube) { throw 'minikube.exe was not found. Run scripts\\install-minikube.ps1 first.' }

if (-not (Get-Command kubectl.exe -ErrorAction SilentlyContinue)) {
    $script:KubectlExe = $minikube
    $script:KubectlPrefix = @('kubectl')
} else {
    $script:KubectlExe = $kubectl
    $script:KubectlPrefix = @()
}

function K {
    & $script:KubectlExe @script:KubectlPrefix @args
    if ($LASTEXITCODE -ne 0) {
        throw "Kubernetes command failed: $($args -join ' ')"
    }
}

function Wait-Health {
    param([string]$Url, [int]$Seconds = 120)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri $Url -TimeoutSec 3
            if ($response.status -eq 'ok' -and $response.database -eq $true) {
                return $response
            }
        } catch {
            Start-Sleep -Milliseconds 1000
        }
    }
    throw "Timed out waiting for $Url"
}

$reports = Join-Path $root 'reports'
New-Item -ItemType Directory -Path $reports -Force | Out-Null
$portForward = $null
$baseUrl = "http://127.0.0.1:$Port"
$rollNo = "K8S$((Get-Date).ToString('HHmmss'))"
$student = $null

function Start-PortForward {
    $stdout = Join-Path $reports "k8s-port-forward-$Port.log"
    $stderr = Join-Path $reports "k8s-port-forward-$Port-error.log"
    $arguments = @($script:KubectlPrefix) + @(
        '-n', $Namespace,
        'port-forward', 'service/attendance-service', "${Port}:80"
    )
    $process = Start-Process -FilePath $script:KubectlExe `
        -ArgumentList $arguments `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -PassThru
    Wait-Health -Url "$baseUrl/api/health" -Seconds 120 | Out-Null
    return $process
}

function Stop-PortForward {
    param($Process)
    if ($Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        $Process.WaitForExit(5000) | Out-Null
    }
}

try {
    cmd /c "docker info >nul 2>&1" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running.' }

    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $status = (& $minikube status 2>&1 | Out-String)
        $minikubeStatusExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($minikubeStatusExit -ne 0 -or $status -notmatch 'host:\s+Running') {
        Write-Output 'Starting Minikube (Docker driver)...'
        & $minikube start --driver=docker --cpus=2 --memory=3072 --disk-size=10g
        if ($LASTEXITCODE -ne 0) { throw 'minikube start failed.' }
    } else {
        Write-Output 'Minikube is already running.'
    }

    cmd /c "docker image inspect $Image >nul 2>&1" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Output "Image $Image not found. Building it..."
        & docker build -t $Image .
        if ($LASTEXITCODE -ne 0) { throw 'docker build failed.' }
    }

    Write-Output "Loading $Image into the Minikube image cache..."
    & $minikube image load $Image
    if ($LASTEXITCODE -ne 0) { throw 'minikube image load failed.' }

    Write-Output "Applying Kubernetes manifests in namespace $Namespace..."
    K apply -f (Join-Path $root 'k8s\namespace.yaml')
    K apply -f (Join-Path $root 'k8s\pvc.yaml')
    K apply -f (Join-Path $root 'k8s\deployment.yaml')
    K apply -f (Join-Path $root 'k8s\service.yaml')

    Write-Output 'Waiting for the deployment rollout...'
    K -n $Namespace rollout status deployment/attendance-app --timeout="${TimeoutSeconds}s"

    $nodePort = ((K -n $Namespace get service attendance-service -o 'jsonpath={.spec.ports[0].nodePort}') -join '').Trim()
    if ($nodePort -ne '30080') { throw "Unexpected NodePort: $nodePort" }
    Write-Output "Service is exposed as NodePort $nodePort (inside the cluster network)."

    $portForward = Start-PortForward
    $health = Wait-Health -Url "$baseUrl/api/health" -Seconds 120
    Write-Output "Pod is healthy (service=$($health.service), database=$($health.database))."

    $payload = @{
        rollNo = $rollNo
        name = 'Kubernetes Persistence Check'
        department = 'Computer Science'
    } | ConvertTo-Json
    $student = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/students" `
        -ContentType 'application/json' -Body $payload -TimeoutSec 15
    if ($student.student.rollNo -ne $rollNo) { throw 'Student creation through Kubernetes service failed.' }

    $before = Invoke-RestMethod -Uri "$baseUrl/api/students?search=$rollNo" -TimeoutSec 15
    if ($before.count -ne 1) { throw 'Student was not visible before the pod restart.' }

    $pod = ((K -n $Namespace get pods -l app=attendance -o 'jsonpath={.items[0].metadata.name}') -join '').Trim()
    if (-not $pod) { throw 'Could not find the attendance pod.' }
    Write-Output "Deleting pod $pod to verify the PersistentVolumeClaim survives a reschedule..."
    K -n $Namespace delete pod $pod --wait=true

    Stop-PortForward -Process $portForward

    K -n $Namespace rollout status deployment/attendance-app --timeout="${TimeoutSeconds}s"
    $portForward = Start-PortForward
    Wait-Health -Url "$baseUrl/api/health" -Seconds 120 | Out-Null

    $after = Invoke-RestMethod -Uri "$baseUrl/api/students?search=$rollNo" -TimeoutSec 15
    if ($after.count -ne 1) {
        throw 'Student record did not survive the pod reschedule (PVC persistence failed).'
    }

    $dashboard = Invoke-RestMethod -Uri "$baseUrl/api/dashboard" -TimeoutSec 15
    $pods = (K -n $Namespace get pods -l app=attendance -o 'jsonpath={.items[*].status.phase}') -join ''
    if ($pods -notmatch 'Running') { throw "Unexpected pod state: $pods" }

    Write-Output "PASS: Kubernetes Deployment, Service, probes, health, API and PVC persistence verified."
    Write-Output "Dashboard reports $($dashboard.totalStudents) students after the restart."
    Write-Output "Access locally with: kubectl -n $Namespace port-forward svc/attendance-service 8081:80"
    Write-Output "Then open http://localhost:8081"
}
catch {
    Write-Output 'Kubernetes validation failed. Diagnostic output:'
    try { K -n $Namespace get pods -o wide } catch { }
    try { K -n $Namespace describe deployment attendance-app } catch { }
    try {
        $pod = ((K -n $Namespace get pods -l app=attendance -o 'jsonpath={.items[0].metadata.name}') -join '').Trim()
        if ($pod) { K -n $Namespace logs $pod --tail=100 } 
    } catch { }
    throw
}
finally {
    if ($student -and $student.student -and $student.student.id) {
        try {
            Invoke-RestMethod -Method Delete -Uri "$baseUrl/api/students/$($student.student.id)" -TimeoutSec 10 | Out-Null
            Write-Output "Removed Kubernetes smoke-test student $rollNo."
        } catch {
            Write-Output "Could not remove Kubernetes smoke-test student $rollNo."
        }
    }
    Stop-PortForward -Process $portForward
}
