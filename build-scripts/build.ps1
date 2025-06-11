# Build script for SENTINEL
# This script builds the Python backend and Tauri frontend

Write-Host "Building SENTINEL Application..." -ForegroundColor Green

# Build frontend
Write-Host "Building frontend..." -ForegroundColor Yellow
pnpm build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

# Build Tauri app
Write-Host "Building Tauri application..." -ForegroundColor Yellow
Set-Location src-tauri
cargo build --release
if ($LASTEXITCODE -ne 0) {
    Write-Host "Tauri build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build completed successfully!" -ForegroundColor Green
