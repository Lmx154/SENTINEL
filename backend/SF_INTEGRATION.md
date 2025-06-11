# Sensor Fusion Integration Instructions

## Backend Setup

### 1. Install Dependencies with UV

```bash
cd backend
uv pip install numpy scipy ahrs pykalman
```

### 2. Add the sensor_fusion.py file

Place the `sensor_fusion.py` file in your `backend/` directory.

### 3. Update data_parser.py

Add to the imports at the top:
```python
from sensor_fusion import process_telemetry_packet, sensor_fusion, configure_sensor_fusion
```

In the `ArmedStateTelemetryParser.parse()` method, after the "Add metadata" section (around line 140), add:
```python
# Process through sensor fusion to get orientation
parsed_data = process_telemetry_packet(parsed_data)
```

### 4. Update websocket_server.py

Add to the imports:
```python
from sensor_fusion import sensor_fusion, configure_sensor_fusion
```

Add these new WebSocket command handlers in the `handle_serial_command` function:

```python
elif command == "configure_sensor_fusion":
    use_magnetometer = message.get("use_magnetometer", True)
    madgwick_beta = message.get("madgwick_beta", 0.1)
    smoothing_window = message.get("smoothing_window", 5)
    
    try:
        configure_sensor_fusion(
            use_magnetometer=use_magnetometer,
            madgwick_beta=madgwick_beta,
            smoothing_window=smoothing_window
        )
        
        return {
            "id": request_id,
            "type": "response",
            "command": "configure_sensor_fusion",
            "success": True,
            "message": "Sensor fusion configured successfully"
        }
    except Exception as e:
        return {
            "id": request_id,
            "type": "response",
            "command": "configure_sensor_fusion",
            "success": False,
            "error": str(e)
        }

elif command == "reset_sensor_fusion":
    try:
        sensor_fusion.reset()
        
        return {
            "id": request_id,
            "type": "response",
            "command": "reset_sensor_fusion",
            "success": True,
            "message": "Sensor fusion reset successfully"
        }
    except Exception as e:
        return {
            "id": request_id,
            "type": "response",
            "command": "reset_sensor_fusion",
            "success": False,
            "error": str(e)
        }
```

## Frontend Updates

### 1. Update src/components/ControlsWebSocket.jsx

In the `handleTelemetryData` function, update the telemetryData conversion to include orientation data:

```javascript
// Use the sensor fusion orientation data if available
gyro_x: rawData.orientation_pitch !== undefined ? rawData.orientation_pitch : 
        (rawData.gyro_x_dps !== undefined ? rawData.gyro_x_dps : 0),
gyro_y: rawData.orientation_roll !== undefined ? rawData.orientation_roll : 
        (rawData.gyro_y_dps !== undefined ? rawData.gyro_y_dps : 0),
gyro_z: rawData.orientation_yaw !== undefined ? rawData.orientation_yaw : 
        (rawData.gyro_z_dps !== undefined ? rawData.gyro_z_dps : 0),

// Add new fields
orientation_roll: rawData.orientation_roll || 0,
orientation_pitch: rawData.orientation_pitch || 0,
orientation_yaw: rawData.orientation_yaw || 0,
quaternion_w: rawData.quaternion_w || 1,
quaternion_x: rawData.quaternion_x || 0,
quaternion_y: rawData.quaternion_y || 0,
quaternion_z: rawData.quaternion_z || 0,
```

### 2. Update src/App.jsx

Update the Orientation component props to pass quaternion data:

```javascript
<Orientation
  rotation={{
    pitch: latestPacket.orientation_pitch || latestPacket.gyro_x,
    roll: latestPacket.orientation_roll || latestPacket.gyro_y,
    yaw: latestPacket.orientation_yaw || latestPacket.gyro_z,
  }}
  quaternion={{
    w: latestPacket.quaternion_w || 1,
    x: latestPacket.quaternion_x || 0,
    y: latestPacket.quaternion_y || 0,
    z: latestPacket.quaternion_z || 0,
  }}
/>
```

### 3. Replace src/components/Orientation.jsx

Replace the entire Orientation.jsx file with the updated version that:
- Accepts both rotation angles and quaternion data
- Uses smooth quaternion interpolation (SLERP)
- Removes conflicting OrbitControls auto-rotation
- Shows orientation values in the UI
- Properly handles the rocket model's initial rotation

## Testing

1. Start the backend:
   ```bash
   cd backend
   uv run python -m websocket_server
   ```

2. Start the frontend:
   ```bash
   npm run tauri dev
   ```

3. Connect to your serial device and start streaming data.

4. The orientation display should now show smooth, accurate orientation based on sensor fusion rather than raw gyroscope data.

## Tuning Parameters

### Madgwick Beta (0.01 - 1.0)
- Lower values (0.01-0.1): More trust in gyroscope, less drift correction
- Higher values (0.1-1.0): More aggressive drift correction, may be less smooth

### Smoothing Window (1-10)
- Lower values (1-3): More responsive but potentially jittery
- Higher values (5-10): Smoother but less responsive

### Magnetometer Usage
- Enable for absolute heading reference (prevents yaw drift)
- Disable in magnetically noisy environments

## Troubleshooting

1. **Jittery orientation**: Increase smoothing window or decrease Madgwick beta
2. **Slow response**: Decrease smoothing window or increase Madgwick beta
3. **Drift over time**: Enable magnetometer or increase Madgwick beta
4. **Incorrect orientation**: Check sensor axis alignment and calibration

## Sensor Coordinate System

The sensor fusion assumes:
- X-axis: Forward (rocket nose direction)
- Y-axis: Right
- Z-axis: Down

Adjust the sensor data mapping if your hardware uses a different coordinate system.