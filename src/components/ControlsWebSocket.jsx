// src/components/ControlsWebSocket.jsx
import { useState, useEffect, useCallback } from 'react';
import { wsClient } from '../utils/websocketClient.js';

export const useLiveDataStream = (setIsRunning, setConsoleArray) => {
  const startLiveStream = async () => {
    try {
      setConsoleArray(prev => [...prev, "Starting live data stream..."]);
      await wsClient.startParsedStream();
      setConsoleArray(prev => [...prev, "Live data stream started successfully"]);
      setIsRunning(true);
      return { success: true };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to start live stream: ${error.message}`]);
      setIsRunning(false);
      return { success: false, error };
    }
  };

  const stopLiveStream = async () => {
    try {
      setConsoleArray(prev => [...prev, "Stopping live data stream..."]);
      await wsClient.closeSerial();
      setConsoleArray(prev => [...prev, "Live data stream stopped"]);
      setIsRunning(false);
      return { success: true };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to stop live stream: ${error.message}`]);
      return { success: false, error };
    }
  };

  const systemCheck = async () => {
    try {
      setConsoleArray(prev => [...prev, "Running system diagnostics..."]);
      // Check WebSocket connection
      if (wsClient.isConnected) {
        setConsoleArray(prev => [...prev, "✓ WebSocket connection healthy"]);
        setConsoleArray(prev => [...prev, "✓ Python backend accessible"]);
        setConsoleArray(prev => [...prev, "System check completed successfully"]);
        return { success: true };
      } else {
        setConsoleArray(prev => [...prev, "✗ WebSocket connection failed"]);
        return { success: false, error: "WebSocket not connected" };
      }
    } catch (error) {
      setConsoleArray(prev => [...prev, `System check failed: ${error.message}`]);
      return { success: false, error };
    }
  };

  return { startLiveStream, stopLiveStream, systemCheck };
};

export const useSerialPorts = (setConsoleArray, isRunning) => {
  const [ports, setPorts] = useState([]);
  const [parsedData, setParsedData] = useState(null);
  const [selectedPort, setSelectedPort] = useState('');
  useEffect(() => {
    // Listen for telemetry data from WebSocket (parsed by backend)
    const handleTelemetryData = (data) => {
      if (data.data) {
        const rawData = data.data;
        
        // Debug: Log the raw data structure to understand what fields are available
        console.log('Raw telemetry data received:', rawData);
        console.log('Available fields:', Object.keys(rawData));        // Convert the parsed data to the format expected by the frontend
        const telemetryData = {
          packet_id: Date.now(),
          timestamp: rawData.timestamp ? 
            (typeof rawData.timestamp === 'number' ? 
              new Date(rawData.timestamp * 1000).toISOString().replace('T', ' ').split('.')[0] : 
              rawData.timestamp) : 
            (rawData.date && rawData.time ? rawData.date + ' ' + rawData.time : 
              new Date().toISOString().replace('T', ' ').split('.')[0]),
          
          // Acceleration - backend already converts to g-force, then convert to m/s²
          accel_x: (rawData.accel_x_g !== undefined ? rawData.accel_x_g * 9.81 : 0),
          accel_y: (rawData.accel_y_g !== undefined ? rawData.accel_y_g * 9.81 : 0),
          accel_z: (rawData.accel_z_g !== undefined ? rawData.accel_z_g * 9.81 : 0),
          
          // Use the sensor fusion orientation data if available, otherwise fall back to raw gyro
          gyro_x: rawData.orientation_pitch !== undefined ? rawData.orientation_pitch : 
                  (rawData.gyro_x_dps !== undefined ? rawData.gyro_x_dps : 0),
          gyro_y: rawData.orientation_roll !== undefined ? rawData.orientation_roll : 
                  (rawData.gyro_y_dps !== undefined ? rawData.gyro_y_dps : 0),
          gyro_z: rawData.orientation_yaw !== undefined ? rawData.orientation_yaw : 
                  (rawData.gyro_z_dps !== undefined ? rawData.gyro_z_dps : 0),
          
          // Store both raw gyro and orientation data
          gyro_raw_x: rawData.gyro_x_dps !== undefined ? rawData.gyro_x_dps : 0,
          gyro_raw_y: rawData.gyro_y_dps !== undefined ? rawData.gyro_y_dps : 0,
          gyro_raw_z: rawData.gyro_z_dps !== undefined ? rawData.gyro_z_dps : 0,
          
          // Orientation angles from sensor fusion
          orientation_roll: rawData.orientation_roll || 0,
          orientation_pitch: rawData.orientation_pitch || 0,
          orientation_yaw: rawData.orientation_yaw || 0,
          
          // Quaternion data if available
          quaternion_w: rawData.quaternion_w || 1,
          quaternion_x: rawData.quaternion_x || 0,
          quaternion_y: rawData.quaternion_y || 0,
          quaternion_z: rawData.quaternion_z || 0,
          
          // Magnetometer - backend converts to microTesla
          mag_x: rawData.mag_x_ut !== undefined ? rawData.mag_x_ut : 0,
          mag_y: rawData.mag_y_ut !== undefined ? rawData.mag_y_ut : 0,
          mag_z: rawData.mag_z_ut !== undefined ? rawData.mag_z_ut : 0,
          
          // GPS coordinates - backend already converts to degrees
          latitude: rawData.gps_lat_deg !== undefined ? rawData.gps_lat_deg : 0,
          longitude: rawData.gps_lon_deg !== undefined ? rawData.gps_lon_deg : 0,
          
          // Other fields
          satellites: rawData.gps_satellites || 0,
          temp: rawData.temperature_c !== undefined ? rawData.temperature_c : 0,
          pressure: rawData.pressure !== undefined ? rawData.pressure : 1013.25,
          alt_bmp: rawData.altitude_m !== undefined ? rawData.altitude_m : 0,
          alt_gps: rawData.altitude_m !== undefined ? rawData.altitude_m : 0,
        };
        
        // Debug: Log the final telemetry data being sent
        console.log('Final telemetry data being sent:', telemetryData);
        
        setParsedData(telemetryData);
        
        // Create events for App.jsx to listen to
        const event = new CustomEvent('telemetry-packet', {
          detail: { payload: telemetryData }
        });
        console.log('Dispatching telemetry-packet event:', event);
        window.dispatchEvent(event);
      }
    };

    // Listen for console data from WebSocket
    const handleConsoleData = (data) => {
      if (data.data && setConsoleArray) {
        setConsoleArray(prev => [...prev, data.data]);
      }
    };

    // Listen for legacy serial data (for backward compatibility)
    const handleSerialData = (data) => {
      // Handle raw serial data if needed for console display
      if (data.data && setConsoleArray) {
        setConsoleArray(prev => [...prev, data.data]);
      }
      
      // Try to parse legacy format if no structured data is available
      if (data.data) {
        try {
          const lines = data.data.split('\n');
          lines.forEach(line => {
            if (line.trim()) {
              const fields = line.trim().split(',');
              if (fields.length >= 17) {
                const telemetryData = {
                  timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
                  accel_x: parseFloat(fields[0]) || 0,
                  accel_y: parseFloat(fields[1]) || 0,
                  accel_z: parseFloat(fields[2]) || 0,
                  gyro_x: parseFloat(fields[3]) || 0,
                  gyro_y: parseFloat(fields[4]) || 0,
                  gyro_z: parseFloat(fields[5]) || 0,
                  temp: parseFloat(fields[6]) || 0,
                  pressure: parseFloat(fields[7]) || 0,
                  alt_bmp: parseFloat(fields[8]) || 0,
                  mag_x: parseFloat(fields[9]) || 0,
                  mag_y: parseFloat(fields[10]) || 0,
                  mag_z: parseFloat(fields[11]) || 0,
                  latitude: parseFloat(fields[12]) || 0,
                  longitude: parseFloat(fields[13]) || 0,
                  satellites: parseInt(fields[14]) || 0,
                  alt_gps: parseFloat(fields[15]) || 0,
                };
                setParsedData(telemetryData);
                
                const event = new CustomEvent('telemetry-packet', {
                  detail: { payload: telemetryData }
                });
                window.dispatchEvent(event);
              }
            }
          });
        } catch (error) {
          console.error('Error parsing legacy serial data:', error);
        }
      }
    };

    // Register message handlers
    wsClient.onMessage('telemetry_data', handleTelemetryData);
    wsClient.onMessage('console_data', handleConsoleData);
    wsClient.onMessage('serial_data', handleSerialData);

    return () => {
      wsClient.offMessage('telemetry_data', handleTelemetryData);
      wsClient.offMessage('console_data', handleConsoleData);
      wsClient.offMessage('serial_data', handleSerialData);
    };
  }, []);
  // Auto-refresh ports on component mount with WebSocket connection check
  useEffect(() => {
    const autoRefresh = async () => {
      if (!isRunning) {
        // Wait for WebSocket connection before trying to list ports
        if (!wsClient.isConnected) {
          console.log('Waiting for WebSocket connection...');
          // Wait up to 5 seconds for connection
          for (let i = 0; i < 50; i++) {
            if (wsClient.isConnected) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        if (wsClient.isConnected) {
          try {
            const portList = await wsClient.listSerialPorts();
            setPorts(portList);
            if (portList.length > 0 && !selectedPort) {
              const firstPortName = portList[0].port || portList[0];
              setSelectedPort(firstPortName);
            }
          } catch (error) {
            console.error('Failed to auto-refresh ports:', error);
          }
        } else {
          console.warn('WebSocket not connected, skipping auto-refresh');
        }
      }
    };
    
    // Delay the auto-refresh to allow WebSocket to connect
    const timeoutId = setTimeout(autoRefresh, 1000);
    return () => clearTimeout(timeoutId);
  }, []); // Only run once on mount
  const refreshPorts = useCallback(async () => {
    if (isRunning) {
      setConsoleArray(prev => [...prev, "Cannot refresh ports while system is running"]);
      return { success: false, error: "System is running" };
    }
    
    setConsoleArray(prev => [...prev, "Refreshing available ports..."]);
    try {
      const portList = await wsClient.listSerialPorts();
      setPorts(portList);
      if (portList.length > 0 && !selectedPort) {
        // Set the port name, not the entire port object
        const firstPortName = portList[0].port || portList[0];
        setSelectedPort(firstPortName);
      }
      setConsoleArray(prev => [...prev, `Found ${portList.length} ports`]);
      return { success: true, ports: portList };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to refresh ports: ${error.message}`]);
      setPorts([]);
      return { success: false, error };
    }
  }, [setConsoleArray, selectedPort, isRunning]);

  const openPort = async () => {
    if (!selectedPort) {
      setConsoleArray(prev => [...prev, "No port selected"]);
      return { success: false };
    }
    try {
      const result = await wsClient.openSerial(selectedPort, 115200);
      setConsoleArray(prev => [...prev, result]);
      return { success: true };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to open port: ${error.message}`]);
      return { success: false, error };
    }
  };

  const closePort = async () => {
    try {
      const result = await wsClient.closeSerial();
      setConsoleArray(prev => [...prev, result]);
      return { success: true };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to close port: ${error.message}`]);
      return { success: false, error };
    }
  };

  return { 
    ports,
    selectedPort,
    setSelectedPort,
    refreshPorts,
    openPort,
    closePort,
    parsedData
  };
};
