param(
    [int]$Port = 8080,
    [string]$BaseDir = 'C:\devops\jenkins'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BaseDir = [System.IO.Path]::GetFullPath($BaseDir)
$homeDir = Join-Path $BaseDir 'home'
$war = Join-Path $BaseDir 'jenkins.war'
$jdkDir = Join-Path $BaseDir 'jdk21'
$java = Join-Path $jdkDir 'bin\java.exe'
$logs = Join-Path $BaseDir 'logs'
$stdout = Join-Path $logs 'jenkins.log'
$stderr = Join-Path $logs 'jenkins-error.log'
$pidFile = Join-Path $logs 'jenkins.pid'
$url = "http://127.0.0.1:$Port"

foreach ($candidate in @(
    "$env:ProgramFiles\nodejs",
    "$env:ProgramFiles\Git\cmd",
    "$env:ProgramFiles\Docker\Docker\resources\bin",
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin",
    "$env:LOCALAPPDATA\Programs\Minikube"
)) {
    if (Test-Path $candidate) { $env:Path = "$candidate;" + $env:Path }
}

if (-not (Test-Path $java)) { throw "Java 21 was not found at $java. Run scripts\install-jenkins.ps1 first." }
if (-not (Test-Path $war)) { throw "jenkins.war was not found at $war. Run scripts\install-jenkins.ps1 first." }
if (-not (Test-Path (Join-Path $homeDir 'plugins'))) { throw 'Jenkins plugins are missing. Run scripts\install-jenkins.ps1 first.' }
New-Item -ItemType Directory -Path $logs -Force | Out-Null

function Test-Jenkins {
    try {
        $response = Invoke-WebRequest -Uri "$url/login" -UseBasicParsing -TimeoutSec 3 -MaximumRedirection 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (Test-Jenkins) {
    Write-Output "Jenkins is already running at $url"
    exit 0
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    throw "Port $Port is already in use by process $($listener.OwningProcess)."
}

$env:JAVA_HOME = $jdkDir
$env:JENKINS_HOME = $homeDir
$env:PATH = "$jdkDir\bin;$env:PATH"

$arguments = @(
    '-Xms256m',
    '-Xmx1024m',
    '-Dfile.encoding=UTF-8',
    '-Djenkins.install.runSetupWizard=false',
    '-jar', $war,
    "--httpPort=$Port"
)

Write-Output "Starting Jenkins from $war ..."
$process = Start-Process -FilePath $java `
    -ArgumentList $arguments `
    -WorkingDirectory $BaseDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

$process.Id | Set-Content -Path $pidFile -Encoding ASCII

for ($attempt = 0; $attempt -lt 360; $attempt++) {
    if ($process.HasExited) {
        Write-Output 'Jenkins exited unexpectedly. Log tail:'
        if (Test-Path $stdout) { Get-Content $stdout -Tail 80 }
        if (Test-Path $stderr) { Get-Content $stderr -Tail 80 }
        throw 'Jenkins failed to start.'
    }
    if (Test-Jenkins) {
        Write-Output "Jenkins started successfully (PID $($process.Id))."
        Write-Output "URL      : $url"
        Write-Output "Job      : $url/job/Attendance-Pipeline"
        Write-Output "Log      : $stdout"
        Write-Output "PID file : $pidFile"
        exit 0
    }
    Start-Sleep -Seconds 1
}

Write-Error "Timed out waiting for Jenkins at $url"
if (Test-Path $stdout) { Get-Content $stdout -Tail 80 }
exit 1
