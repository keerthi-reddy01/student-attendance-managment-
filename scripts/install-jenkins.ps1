param(
    [string]$BaseDir = 'C:\devops\jenkins',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$BaseDir = [System.IO.Path]::GetFullPath($BaseDir)
$homeDir = Join-Path $BaseDir 'home'
$pluginsDir = Join-Path $homeDir 'plugins'
$initDir = Join-Path $homeDir 'init.groovy.d'
$war = Join-Path $BaseDir 'jenkins.war'
$jdkDir = Join-Path $BaseDir 'jdk21'
$jdkZip = Join-Path $BaseDir 'jdk21.zip'
$pluginManager = Join-Path $BaseDir 'jenkins-plugin-manager-2.15.0.jar'
$credentialsFile = Join-Path $BaseDir 'credentials.txt'
$password = 'AttendX@Jenkins2026'
$jenkinsUrl = 'http://localhost:8080'

New-Item -ItemType Directory -Path $BaseDir, $homeDir, $pluginsDir, $initDir -Force | Out-Null

function Download-File {
    param([string]$Url, [string]$Destination, [long]$MinimumBytes = 1)
    if ((Test-Path $Destination) -and ((Get-Item $Destination).Length -ge $MinimumBytes)) {
        Write-Output "Using existing $(Split-Path $Destination -Leaf)."
        return
    }
    Write-Output "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing -TimeoutSec 900
    if ((Get-Item $Destination).Length -lt $MinimumBytes) {
        throw "Downloaded file is unexpectedly small: $Destination"
    }
}

# Jenkins 2.580.x requires Java 21 or 25. Install a portable Temurin JDK in the Jenkins directory.
if (-not (Test-Path (Join-Path $jdkDir 'bin\java.exe'))) {
    Download-File -Url 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse' `
        -Destination $jdkZip -MinimumBytes 50000000
    Write-Output 'Extracting JDK 21...'
    if (Test-Path $jdkDir) { Remove-Item -Recurse -Force $jdkDir }
    Expand-Archive -Path $jdkZip -DestinationPath $BaseDir -Force
    $extracted = Get-ChildItem -Path $BaseDir -Directory -Filter 'jdk-21*' | Select-Object -First 1
    if (-not $extracted) { throw 'Could not find the extracted JDK 21 directory.' }
    Move-Item -Path $extracted.FullName -Destination $jdkDir -Force
}
$java = Join-Path $jdkDir 'bin\java.exe'
$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    $javaVersion = (& $java -version 2>&1 | Out-String).Trim()
    $javaExitCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorAction
}
if ($javaExitCode -ne 0) { throw 'The portable Java runtime did not start.' }
Write-Output $javaVersion

Download-File -Url 'https://get.jenkins.io/war-stable/latest/jenkins.war' `
    -Destination $war -MinimumBytes 50000000
Download-File -Url 'https://github.com/jenkinsci/plugin-installation-manager-tool/releases/download/2.15.0/jenkins-plugin-manager-2.15.0.jar' `
    -Destination $pluginManager -MinimumBytes 1000000

$pluginList = @(
    'workflow-aggregator',
    'git',
    'junit',
    'timestamper',
    'pipeline-stage-view',
    'ansicolor'
)

Write-Output 'Resolving and downloading Jenkins plugins...'
& $java -jar $pluginManager `
    --war $war `
    --plugin-download-directory $pluginsDir `
    --plugins $pluginList `
    --view-security-warnings
if ($LASTEXITCODE -ne 0) {
    throw 'Jenkins plugin installation failed.'
}

$securityScript = @'
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.security.HudsonPrivateSecurityRealm
import jenkins.install.InstallState
import jenkins.model.Jenkins

def instance = Jenkins.get()
if (!(instance.getSecurityRealm() instanceof HudsonPrivateSecurityRealm)) {
    def realm = new HudsonPrivateSecurityRealm(false)
    realm.createAccount('admin', '__PASSWORD__')
    instance.setSecurityRealm(realm)
    def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
    strategy.setAllowAnonymousRead(false)
    instance.setAuthorizationStrategy(strategy)
    try {
        instance.setInstallState(InstallState.INITIAL_SETUP_COMPLETED)
    } catch (Throwable ignored) {
        // The -Djenkins.install.runSetupWizard=false flag also covers this on modern Jenkins.
    }
    instance.save()
}
'@
$securityScript = $securityScript.Replace('__PASSWORD__', $password)
Set-Content -Path (Join-Path $initDir '01-security.groovy') -Value $securityScript -Encoding ASCII

$locationXml = @'
<?xml version='1.1' encoding='UTF-8'?>
<jenkins.model.JenkinsLocationConfiguration>
  <adminAddress>devops@example.com</adminAddress>
  <jenkinsUrl>http://localhost:8080/</jenkinsUrl>
</jenkins.model.JenkinsLocationConfiguration>
'@
Set-Content -Path (Join-Path $homeDir 'jenkins.model.JenkinsLocationConfiguration.xml') -Value $locationXml -Encoding UTF8

$jobDir = Join-Path $homeDir 'jobs\Attendance-Pipeline'
New-Item -ItemType Directory -Path $jobDir -Force | Out-Null
$jobConfig = @'
<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <actions/>
  <description>Student Attendance Management System - CI/CD, Docker, Selenium and optional Kubernetes deployment.</description>
  <keepDependencies>false</keepDependencies>
  <properties>
    <hudson.model.ParametersDefinitionProperty>
      <parameterDefinitions>
        <hudson.model.BooleanParameterDefinition>
          <name>DEPLOY_K8S</name>
          <description>Deploy the built image to the local Kubernetes cluster and verify PVC persistence.</description>
          <defaultValue>false</defaultValue>
        </hudson.model.BooleanParameterDefinition>
      </parameterDefinitions>
    </hudson.model.ParametersDefinitionProperty>
  </properties>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
    <scm class="hudson.plugins.git.GitSCM" plugin="git">
      <configVersion>2</configVersion>
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>file:///C:/devops/student%20attendance%20managment</url>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/main</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
      <submoduleCfg class="empty-list"/>
      <extensions/>
    </scm>
    <scriptPath>Jenkinsfile</scriptPath>
    <lightweight>true</lightweight>
  </definition>
  <triggers/>
  <disabled>false</disabled>
</flow-definition>
'@
Set-Content -Path (Join-Path $jobDir 'config.xml') -Value $jobConfig -Encoding UTF8

$credentials = @"
URL=$jenkinsUrl
USERNAME=admin
PASSWORD=$password
"@
Set-Content -Path $credentialsFile -Value $credentials -Encoding ASCII

$versionInfo = @"
Jenkins WAR : $war
Java        : $jdkDir
JENKINS_HOME: $homeDir
URL         : $jenkinsUrl
Username    : admin
Password    : $password
"@
Set-Content -Path (Join-Path $BaseDir 'version.txt') -Value $versionInfo -Encoding ASCII

Write-Output ''
Write-Output 'Jenkins installation prepared successfully.'
Write-Output "JENKINS_HOME : $homeDir"
Write-Output "Jenkins URL  : $jenkinsUrl"
Write-Output "Credentials  : $credentialsFile"
Write-Output ''
Write-Output 'Start it with: powershell -ExecutionPolicy Bypass -File scripts\start-jenkins.ps1'
