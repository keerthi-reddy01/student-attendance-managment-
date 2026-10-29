@echo off
setlocal
call "%~dp0env.cmd"
git %*
exit /b %ERRORLEVEL%
