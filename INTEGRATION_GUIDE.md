# SENTINEL - Python Backend + Tauri Frontend Integration

This guide explains how the Python backend is now automatically packaged and started with the Tauri frontend.

## What Changed

### 1. Tauri Configuration (`src-tauri/tauri.conf.json`)
- Added `resources` configuration to bundle the entire `backend/` folder with the application
- The backend files are now included in the built application

### 2. Rust Code (`src-tauri/src/lib.rs`)
- Added automatic Python backend startup in the `setup` function
- The backend starts automatically when the Tauri app launches
- Tries to use `uv run python -m websocket_server` first, then falls back to `python -m websocket_server`
- Includes a 2-second delay to allow the frontend to initialize first

### 3. Dependencies (`src-tauri/Cargo.toml`) 
- Added `tokio` for async runtime support
- Backend process management using standard `std::process::Command`

## How It Works

1. **When you run the Tauri application:**
   - The frontend starts up first
   - After 2 seconds, the Rust code automatically launches the Python backend
   - The backend runs in the background as a child process

2. **Backend Process:**
   - Runs `uv run python -m websocket_server` from the bundled backend directory
   - If `uv` is not available, falls back to `python -m websocket_server`
   - Runs on port 8000 (as configured in your websocket_server.py)

3. **Resource Bundling:**
   - All backend files are copied into the application bundle
   - Located at: `{app-resources-dir}/backend/`
   - Includes all Python files, dependencies, and configuration

## Building and Running

### Development Mode
```powershell
# From the root directory
pnpm run tauri dev
```
This will:
- Start the frontend development server
- Launch the Tauri app
- Automatically start the Python backend

### Production Build
```powershell
# Build the frontend
pnpm build

# Build the Tauri app
cd src-tauri
cargo build --release

# Or build installer
pnpm run tauri build
```

## Requirements

### For Development
- Node.js and pnpm (for frontend)
- Rust and Cargo (for Tauri)
- Python 3.13 (for backend)
- uv (recommended) or pip (for Python dependencies)

### For End Users
- **Only the executable** - everything is bundled!
- Python must be installed on the system
- uv is recommended but not required

## Backend Dependencies
The Python backend dependencies are defined in `backend/pyproject.toml`:
- pyserial (for serial communication)
- fastapi (web framework)
- uvicorn (ASGI server)
- websockets (WebSocket support)
- numpy, scipy (for calculations)
- ahrs, pykalman (for sensor fusion)

## Troubleshooting

### Backend Not Starting
1. Check if Python is in the system PATH
2. Ensure the backend dependencies are installed
3. Check the console output for error messages

### Port Conflicts
- The backend runs on port 8000 by default
- If port 8000 is busy, modify `websocket_server.py` to use a different port
- Update your frontend WebSocket connection URL accordingly

### Bundle Issues
- Ensure the `backend/` folder exists in the project root
- Check that `tauri.conf.json` resources path is correct: `"../backend/**/*"`

## File Structure After Build
```
Application/
├── frontend files (HTML, JS, CSS)
├── resources/
│   └── backend/
│       ├── websocket_server.py
│       ├── serial_operations.py
│       ├── data_parser.py
│       ├── sensor_fusion.py
│       ├── pyproject.toml
│       └── requirements.txt
└── sentinel.exe (main executable)
```

## Next Steps
1. Test the application by running `pnpm run tauri dev`
2. Verify that both frontend and backend start automatically
3. Test WebSocket communication between frontend and backend
4. Build the production version with `pnpm run tauri build`
