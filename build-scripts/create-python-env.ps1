# Create standalone Python environment script
Write-Host "Creating standalone Python environment..." -ForegroundColor Green

$backendDir = "backend"
$outputDir = "backend-standalone"

# Create output directory
if (Test-Path $outputDir) {
    Remove-Item -Recurse -Force $outputDir
}
New-Item -ItemType Directory -Path $outputDir

# Copy backend files
Copy-Item -Recurse -Path "$backendDir\*" -Destination $outputDir -Exclude "__pycache__", "*.pyc"

# Install uv if not present
if (!(Get-Command "uv" -ErrorAction SilentlyContinue)) {
    Write-Host "Installing uv..." -ForegroundColor Yellow
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
}

# Create virtual environment and install dependencies
Set-Location $outputDir
uv venv --python 3.13
uv pip install -r requirements.txt

Write-Host "Standalone Python environment created in $outputDir" -ForegroundColor Green
