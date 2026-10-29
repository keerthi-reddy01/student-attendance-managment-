@echo off
setlocal
call "%~dp0env.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ci-k8s.ps1" %*
exit /b %ERRORLEVEL%
