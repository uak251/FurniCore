# Install Docker Desktop (Windows) so `docker compose` works for local Postgres.
# Run in an elevated PowerShell: Right-click → "Run as administrator"
#   cd D:\GitHub\FurniCore
#   .\scripts\install-docker-desktop.ps1

$ErrorActionPreference = "Stop"

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "This script must run as Administrator (winget installs system-wide)." -ForegroundColor Yellow
    Write-Host "Right-click PowerShell → Run as administrator, then:" -ForegroundColor Yellow
    Write-Host '  Set-Location "' (Get-Location) '"' -ForegroundColor Cyan
    Write-Host '  .\scripts\install-docker-desktop.ps1' -ForegroundColor Cyan
    exit 1
}

Write-Host "Installing Docker Desktop via winget (large download)..." -ForegroundColor Cyan
winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "  1. Open Docker Desktop from the Start menu." -ForegroundColor White
Write-Host "  2. Accept the license; if prompted, install/enable WSL 2 and restart if asked." -ForegroundColor White
Write-Host "  3. Wait until Docker shows the engine is running (whale icon steady)." -ForegroundColor White
Write-Host "  4. Close and reopen your terminal so PATH includes docker." -ForegroundColor White
Write-Host "  5. From the repo root run: pnpm run db:up && pnpm run db:setup" -ForegroundColor Cyan
Write-Host ""
