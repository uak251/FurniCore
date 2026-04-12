# Install WSL 2 (required before Docker can run Linux images like postgres on Windows).
# Run in an elevated PowerShell: Right-click → "Run as administrator"
#   cd D:\GitHub\FurniCore
#   .\scripts\install-wsl.ps1
# Then reboot if Windows asks, open Docker Desktop, wait for "Engine running", and:
#   pnpm run db:up && pnpm run db:setup

$ErrorActionPreference = "Stop"

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "Run PowerShell as Administrator, then: .\scripts\install-wsl.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "Installing WSL (this can take several minutes). You may be prompted to reboot." -ForegroundColor Cyan
& "$env:SystemRoot\System32\wsl.exe" --install
if ($LASTEXITCODE -ne 0) {
    Write-Host "If install failed, enable features manually then reboot:" -ForegroundColor Yellow
    Write-Host "  dism /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart" -ForegroundColor Gray
    Write-Host "  dism /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart" -ForegroundColor Gray
    exit $LASTEXITCODE
}

Write-Host "Installing Ubuntu 24.04 (Docker Linux engine needs a WSL2 distro)..." -ForegroundColor Cyan
& "$env:SystemRoot\System32\wsl.exe" --install -d Ubuntu-24.04 --no-launch
if ($LASTEXITCODE -ne 0) {
    Write-Host "Ubuntu install will finish after reboot. Run: wsl --install -d Ubuntu-24.04" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "REBOOT Windows if you see 'Changes will not be effective until the system is rebooted'." -ForegroundColor Yellow
Write-Host "After reboot:" -ForegroundColor Green
Write-Host "  1. Start Docker Desktop; wait for 'Engine running'." -ForegroundColor White
Write-Host "  2. Repo root: copy .env.example to .env and set DATABASE_URL (see docker-compose.yml)." -ForegroundColor White
Write-Host "  3. pnpm run db:up && pnpm run db:setup" -ForegroundColor Cyan
