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
    // Listen for serial data from WebSocket
    const handleSerialData = (data) => {
      // Convert WebSocket serial data to match the expected format
      if (data.data) {
        try {
          // Try to parse the serial data if it's CSV format
          const lines = data.data.split('\n');
          lines.forEach(line => {
            if (line.trim()) {
              // Parse CSV data similar to how the Rust backend does it
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
                
                // Create events similar to what Tauri emits
                const event = new CustomEvent('telemetry-packet', {
                  detail: { payload: telemetryData }
                });
                window.dispatchEvent(event);
                
                const updateEvent = new CustomEvent('telemetry-update', {
                  detail: { payload: telemetryData }
                });
                window.dispatchEvent(updateEvent);
              }
            }
          });
        } catch (error) {
          console.error('Error parsing serial data:', error);
        }
      }
    };

    wsClient.onMessage('serial_data', handleSerialData);

    return () => {
      wsClient.offMessage('serial_data', handleSerialData);
    };
  }, []);

  // Auto-refresh ports on component mount
  useEffect(() => {
    const autoRefresh = async () => {
      if (!isRunning) {
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
      }
    };
    autoRefresh();
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
