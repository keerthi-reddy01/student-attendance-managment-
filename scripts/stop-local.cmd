@echo off
call "%~dp0env.cmd"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-local.ps1" %*
