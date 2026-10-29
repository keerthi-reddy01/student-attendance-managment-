@echo off
setlocal
call "%~dp0env.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-jenkins.ps1" %*
exit /b %ERRORLEVEL%
