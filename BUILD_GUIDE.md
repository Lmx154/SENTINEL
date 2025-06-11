# SENTINEL Build and Deployment Guide

## Overview
SENTINEL is a Tauri-based application that combines a React frontend with a Python backend for telemetry data processing. The Python backend is automatically started when the Tauri application launches.

## Development Setup

### Prerequisites
- Node.js and pnpm
- Rust and Cargo
- Python 3.13+ with uv
- Tauri CLI

### Running in Development Mode

1. **Start the development server:**
   ```powershell
   pnpm run tauri dev
   ```

   This will:
   - Start the Vite development server for the frontend
   - Compile and run the Tauri application
   - Automatically start the Python backend using `uv run python -m websocket_server`

2. **Backend Location:**
   - In development mode, the backend runs from `./backend/` directory
   - The backend starts automatically when the Tauri app launches

## Production Build

### Building the Release Executable

1. **Using the build script:**
   ```powershell
   .\build-scripts\build-release.ps1
   ```

2. **Manual build process:**
   ```powershell
   # Install and build frontend
   pnpm install
   pnpm run build
   
   # Build Tauri release
   cd src-tauri
   cargo build --release
   ```

### Executable Locations

- **Development executable:** `src-tauri/target/debug/sentinel.exe`
- **Release executable:** `src-tauri/target/release/sentinel.exe`

## How the Backend Integration Works

### Automatic Backend Startup
The Tauri application automatically starts the Python backend when it launches:

1. **Development Mode:**
   - Backend runs from `./backend/` directory
   - Uses `uv run python -m websocket_server` command
   - Falls back to direct Python execution if uv is not available

2. **Production Mode:**
   - Backend files are bundled with the executable as resources
   - Extracted and run from the bundled resources directory

### Backend Requirements
The Python backend requires these dependencies (installed via uv):
- pyserial>=3.5
- fastapi>=0.104.0
- uvicorn[standard]>=0.24.0
- websockets>=12.0
- numpy>=1.26.0
- scipy>=1.11.0
- ahrs>=0.3.1
- pykalman>=0.9.5

## Deployment

### Single Executable Deployment
The release executable (`sentinel.exe`) is self-contained and includes:
- The React frontend (built and bundled)
- The Rust/Tauri runtime
- Python backend files (bundled as resources)

### Running the Executable
Simply double-click `sentinel.exe` or run it from the command line:
```powershell
.\sentinel.exe
```

The application will:
1. Start the Tauri window
2. Automatically launch the Python backend
3. Connect the frontend to the backend via WebSocket

## Backend Communication

### WebSocket Connection
- **Development:** Backend runs on default port (typically 8000)
- **Production:** Backend runs on the same port
- **Frontend:** Connects via WebSocket to communicate with backend

### API Endpoints
The Python backend provides WebSocket endpoints for:
- Serial port management
- Telemetry data processing
- Sensor fusion operations

## Troubleshooting

### Backend Not Starting
If you see "Failed to start Python backend":

1. **Check Python Installation:**
   ```powershell
   python --version
   uv --version
   ```

2. **Check Backend Dependencies:**
   ```powershell
   cd backend
   uv sync
   ```

3. **Manual Backend Test:**
   ```powershell
   cd backend
   uv run python -m websocket_server
   ```

### Build Issues
If the build fails:

1. **Clean and rebuild:**
   ```powershell
   cd src-tauri
   cargo clean
   cargo build --release
   ```

2. **Frontend issues:**
   ```powershell
   pnpm clean
   pnpm install
   pnpm run build
   ```

## Development Commands

```powershell
# Development mode
pnpm run tauri dev

# Build frontend only
pnpm run build

# Build Tauri only (debug)
cd src-tauri && cargo build

# Build Tauri only (release)
cd src-tauri && cargo build --release

# Clean build artifacts
cd src-tauri && cargo clean
```
