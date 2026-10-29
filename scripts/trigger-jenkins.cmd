@echo off
setlocal
call "%~dp0env.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0trigger-jenkins.ps1" %*
exit /b %ERRORLEVEL%
