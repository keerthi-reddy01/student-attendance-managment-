@echo off
setlocal
call "%~dp0env.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ci-docker-smoke.ps1" %*
exit /b %ERRORLEVEL%
