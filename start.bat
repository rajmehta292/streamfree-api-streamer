@echo off
title StreamFree API Streamer
echo ===================================================
echo   StreamFree API Streamer - High Performance Engine
echo ===================================================
echo.
cd /d "%~dp0"

echo [1/2] Verifying dependencies...
if not exist node_modules (
    echo Installing npm dependencies...
    call npm.cmd install
)

echo [2/2] Starting StreamFree API Streamer on http://localhost:3000 ...
start "" http://localhost:3000

call npm.cmd run start:tsx
pause

