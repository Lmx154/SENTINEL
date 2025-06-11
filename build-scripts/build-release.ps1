# Build script for SENTINEL - Creates a release executable with bundled Python backend

Write-Host "Building SENTINEL Release..." -ForegroundColor Green

# Change to project root
Set-Location $PSScriptRoot\..

# Install frontend dependencies
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
pnpm install

# Build frontend
Write-Host "Building frontend..." -ForegroundColor Yellow
pnpm run build

# Build Tauri application
Write-Host "Building Tauri application..." -ForegroundColor Yellow
Set-Location src-tauri
cargo build --release

Write-Host "Build complete!" -ForegroundColor Green
Write-Host "Executable location: src-tauri\target\release\sentinel.exe" -ForegroundColor Cyan

# Return to project root
Set-Location ..
