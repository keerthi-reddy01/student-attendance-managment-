param(
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\Minikube"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$exe = Join-Path $InstallDir 'minikube.exe'

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

if (-not (Test-Path $exe)) {
    $url = 'https://storage.googleapis.com/minikube/releases/latest/minikube-windows-amd64.exe'
    Write-Output "Downloading Minikube from $url"
    Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing -TimeoutSec 900
}

$version = (& $exe version --short 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'Minikube did not start correctly after installation.'
}

Write-Output "Minikube installed: $exe"
Write-Output "Version: $version"
Write-Output ''
Write-Output 'Start it and deploy the application with:'
Write-Output '  powershell -ExecutionPolicy Bypass -File scripts\ci-k8s.ps1'
