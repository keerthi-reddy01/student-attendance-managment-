@echo off
rem Standard tool path for this workstation. Safe to call repeatedly.
set "PATH=%SystemRoot%\System32;%SystemRoot%;%SystemRoot%\System32\WindowsPowerShell\v1.0;%SystemRoot%\System32\Wbem;%PATH%"

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;%PATH%"
if exist "%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe" set "PATH=%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"
if exist "%LOCALAPPDATA%\Programs\Minikube\minikube.exe" set "PATH=%LOCALAPPDATA%\Programs\Minikube;%PATH%"
if exist "%ProgramFiles%\Kubernetes\Minikube\minikube.exe" set "PATH=%ProgramFiles%\Kubernetes\Minikube;%PATH%"

rem Prefer an explicitly configured JDK (Jenkins needs Java 21+).
if not defined JAVA_HOME (
  for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-21*") do set "JAVA_HOME=%%~fD"
)
if not defined JAVA_HOME (
  for /d %%D in ("%ProgramFiles%\Eclipse Adoptium\jdk-17*") do set "JAVA_HOME=%%~fD"
)
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "PATH=%JAVA_HOME%\bin;%PATH%"

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
