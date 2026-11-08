# StreamFree API Streamer PowerShell Launcher
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $scriptDir

Write-Host "===================================================" -ForegroundColor Magenta
Write-Host "  StreamFree API Streamer - High Performance Engine" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Magenta
Write-Host ""

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    & npm.cmd install
}

Write-Host "Launching web browser at http://localhost:3000..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host "Starting server..." -ForegroundColor Cyan
& npm.cmd run start:tsx

