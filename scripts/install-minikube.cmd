@echo off
setlocal
call "%~dp0env.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-minikube.ps1" %*
exit /b %ERRORLEVEL%
