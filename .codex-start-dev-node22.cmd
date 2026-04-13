@echo off
setlocal
cd /d "%~dp0"

set "NODE22=%~dp0.tools\node-v22.22.2-win-x64"

if exist ".next" rmdir /s /q ".next"

call "%NODE22%\npm.cmd" run dev -- --hostname 0.0.0.0 --port 3000 1>.codex-dev-node22.out.log 2>.codex-dev-node22.err.log
