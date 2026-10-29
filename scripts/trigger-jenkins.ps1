param(
    [string]$BaseDir = 'C:\devops\jenkins',
    [switch]$DeployK8s,
    [int]$TimeoutMinutes = 45,
    [int]$PollSeconds = 5
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$credentialsFile = Join-Path ([System.IO.Path]::GetFullPath($BaseDir)) 'credentials.txt'
if (-not (Test-Path $credentialsFile)) {
    throw "Jenkins credentials were not found at $credentialsFile. Run scripts\install-jenkins.ps1 first."
}

$config = Get-Content $credentialsFile | ConvertFrom-StringData
$url = $config.URL.TrimEnd('/')
$user = $config.USERNAME
$pass = $config.PASSWORD
$pair = "${user}:${pass}"
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{ Authorization = "Basic $auth" }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$jobName = 'Attendance-Pipeline'
$jobUrl = "$url/job/$jobName"

Write-Output "Connecting to Jenkins at $url ..."
$job = Invoke-RestMethod -Uri "$jobUrl/api/json" -Headers $headers -WebSession $session -TimeoutSec 15
Write-Output "Found job '$($job.displayName)' (last build: $($job.lastBuild.number))."

$postHeaders = $headers.Clone()
try {
    $crumb = Invoke-RestMethod -Uri "$url/crumbIssuer/api/json" -Headers $headers -WebSession $session -TimeoutSec 15
    if ($crumb.crumbRequestField -and $crumb.crumb) {
        $postHeaders[$crumb.crumbRequestField] = $crumb.crumb
    }
} catch {
    Write-Output 'CSRF crumb endpoint is not enabled; continuing without a crumb.'
}

$parameters = @{ DEPLOY_K8S = $(if ($DeployK8s) { 'true' } else { 'false' }) }
Write-Output "Queueing build with DEPLOY_K8S=$($parameters.DEPLOY_K8S) ..."
$response = Invoke-WebRequest -Method Post -Uri "$jobUrl/buildWithParameters" `
    -Headers $postHeaders -WebSession $session -Body $parameters -UseBasicParsing -TimeoutSec 30

$location = [string]$response.Headers.Location
if (-not $location) {
    throw 'Jenkins did not return a queue location for the build.'
}
$queueUrl = ([Uri]::new([Uri]$url, $location)).AbsoluteUri
Write-Output "Build queued: $queueUrl"

$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$buildNumber = $null
while ((Get-Date) -lt $deadline) {
    try {
        $queue = Invoke-RestMethod -Uri "$queueUrl/api/json" -Headers $headers -WebSession $session -TimeoutSec 15
        if ($queue.cancelled) { throw 'The queued build was cancelled.' }
        if ($queue.executable -and $queue.executable.number) {
            $buildNumber = $queue.executable.number
            break
        }
        if ($queue.why) { Write-Output "Waiting in queue: $($queue.why)" }
    } catch {
        if ($_.Exception.Message -match 'cancelled') { throw }
    }
    Start-Sleep -Seconds $PollSeconds
}
if (-not $buildNumber) { throw 'Timed out waiting for Jenkins to start the build.' }

Write-Output "Build #$buildNumber is running..."
$build = $null
while ((Get-Date) -lt $deadline) {
    $build = Invoke-RestMethod -Uri "$jobUrl/$buildNumber/api/json?tree=number,building,result,url,displayName" `
        -Headers $headers -WebSession $session -TimeoutSec 15
    if (-not $build.building) { break }
    Start-Sleep -Seconds $PollSeconds
}
if (-not $build -or $build.building) { throw "Timed out waiting for build #$buildNumber to finish." }

$console = Invoke-WebRequest -Uri "$jobUrl/$buildNumber/consoleText" -Headers $headers -WebSession $session -UseBasicParsing -TimeoutSec 30
$reports = Join-Path $root 'reports'
New-Item -ItemType Directory -Path $reports -Force | Out-Null
$consoleFile = Join-Path $reports "jenkins-build-$buildNumber.log"
Set-Content -Path $consoleFile -Value $console.Content -Encoding UTF8

Write-Output "Build result: $($build.result)"
Write-Output "Build URL   : $($build.url)"
Write-Output "Console log : $consoleFile"
Write-Output '----- console tail -----'
($console.Content -split "`r?`n" | Select-Object -Last 120) | Write-Output

if ($build.result -ne 'SUCCESS') {
    throw "Jenkins build #$buildNumber finished with result $($build.result)."
}
Write-Output "Jenkins build #$buildNumber completed successfully."
