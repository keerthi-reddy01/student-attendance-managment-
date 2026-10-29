@echo off
setlocal
call "%~dp0env.cmd"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0ci-e2e.ps1" %*
exit /b %ERRORLEVEL%
