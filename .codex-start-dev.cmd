@echo off
setlocal
cd /d "%~dp0"

rem Clear stale dev output first. Dev now uses its own dist dir so build artifacts stay isolated.
if exist ".next-dev" rmdir /s /q ".next-dev"

rem Stable launcher for Codex: run Next dev outside the sandbox and bind for localhost + 127.0.0.1.
call npm.cmd run dev -- --hostname 0.0.0.0 --port 3000 1>.codex-dev.out.log 2>.codex-dev.err.log
