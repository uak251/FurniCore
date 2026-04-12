# Start FurniCore Postgres (docker compose). Run from repo root or any cwd.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$dockerBin = "${env:ProgramFiles}\Docker\Docker\resources\bin"
if (Test-Path "$dockerBin\docker.exe") {
    if ($env:Path -notlike "*Docker\Docker\resources\bin*") {
        $env:Path = "$dockerBin;$env:Path"
    }
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
    Write-Host "docker: command not found. Install Docker Desktop, then restart the terminal." -ForegroundColor Red
    Write-Host "  Run as Administrator: .\scripts\install-docker-desktop.ps1" -ForegroundColor Yellow
    exit 1
}

$wslOut = & "$env:SystemRoot\System32\wsl.exe" -l -v 2>&1 | Out-String
if ($wslOut -match "Windows Subsystem for Linux is not installed|WSL.*not installed") {
    Write-Host "WSL is not installed. Docker needs WSL 2 to run Linux containers (Postgres image)." -ForegroundColor Red
    Write-Host "  Run as Administrator: .\scripts\install-wsl.ps1  (then reboot if prompted)" -ForegroundColor Yellow
    Write-Host "  Or use a cloud Postgres URL in .env (DATABASE_URL=...) and skip Docker." -ForegroundColor Gray
    exit 1
}

Write-Host "Starting postgres (docker compose up -d)..." -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker compose ps
Write-Host "Done. DATABASE_URL should match docker-compose.yml (see .env.example)." -ForegroundColor Green
