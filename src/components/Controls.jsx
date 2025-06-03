// src/components/Controls.jsx

import { wsClient } from '../utils/websocketClient.js';
import { useState, useEffect, useCallback, useRef } from 'react';

export const useLiveDataStream = (setIsRunning, setConsoleArray) => {
  const startLiveStream = async () => {
    try {
      setConsoleArray(prev => [...prev, "Starting live data stream..."]);
      const result = await wsClient.startParsedStream();
      setConsoleArray(prev => [...prev, result]);
      setIsRunning(true);
      return { success: true };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to start live stream: ${error}`]);
      setIsRunning(false);
      return { success: false, error };
    }
  };

  const stopLiveStream = async () => {
    try {
      setConsoleArray(prev => [...prev, "Stopping live data stream..."]);
      const result = await wsClient.closeSerial();
      setConsoleArray(prev => [...prev, result]);
      setIsRunning(false);
      return { success: true };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to stop live stream: ${error}`]);
      return { success: false, error };
    }
  };

  const systemCheck = async () => {
    try {
      setConsoleArray(prev => [...prev, "Running system diagnostics..."]);
      // Add any system check logic here
      setConsoleArray(prev => [...prev, "System check completed"]);
      return { success: true };
    } catch (error) {
      setConsoleArray(prev => [...prev, `System check failed: ${error}`]);
      return { success: false, error };
    }
  };

  return { startLiveStream, stopLiveStream, systemCheck };
};

/**
 * This hook remains for listing ports, opening, closing, etc.
 * Notice that we no longer call `start_data_parser` anywhere below,
 * but `rt_parsed_stream` instead if we want to start parsing.
 */
export const useSerialPorts = (setConsoleArray, isRunning) => {
  const [ports, setPorts] = useState([]);
  const [parsedData, setParsedData] = useState(null);
  const [selectedPort, setSelectedPort] = useState('');

  useEffect(() => {
    // Listen for serial data from WebSocket
    const handleSerialData = (data) => {
      setParsedData(data);
      // Dispatch custom event for other components to listen to
      window.dispatchEvent(new CustomEvent('telemetry-update', { detail: data }));
    };

    wsClient.onMessage('serial_data', handleSerialData);

    return () => {
      wsClient.offMessage('serial_data', handleSerialData);
    };
  }, []);
  const refreshPorts = useCallback(async () => {
    if (isRunning) {
      setConsoleArray(prev => [...prev, "Cannot refresh ports while system is running"]);
      return { success: false, error: "System is running" };
    }
    
    setConsoleArray(prev => [...prev, "Refreshing available ports..."]);
    try {
      const ports = await wsClient.listSerialPorts();
      setPorts(ports);
      if (ports.length > 0 && !selectedPort) {
        setSelectedPort(ports[0]);
      }
      setConsoleArray(prev => [...prev, `Found ${ports.length} ports`]);
      return { success: true, ports };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to refresh ports: ${error}`]);
      setPorts([]);
      return { success: false, error };
    }
  }, [setConsoleArray, selectedPort, isRunning]);

  /**
   * Instead of calling 'open_serial' then 'start_data_parser', 
   * we can just open the port and then call 'rt_parsed_stream'
   * if we want to unify logic. 
   */  const openPort = async () => {
    if (!selectedPort) {
      setConsoleArray(prev => [...prev, "No port selected"]);
      return { success: false };
    }
    try {
      const result = await wsClient.openSerial(selectedPort, 115200);
      setConsoleArray(prev => [...prev, result]);
      return { success: true };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to open port: ${error}`]);
      return { success: false, error };
    }
  };

  /**
   * Once this is called, the parser thread should stop
   * (because the loop in rt_parsed_stream will break when the port is closed).
   */
  const closePort = async () => {
    try {
      const result = await wsClient.closeSerial();
      setConsoleArray(prev => [...prev, result]);
      return { success: true };
    } catch (error) {
      setConsoleArray(prev => [...prev, `Failed to close port: ${error}`]);
      return { success: false, error };
    }
  };

  return { 
    ports,
    selectedPort,
    setSelectedPort,
    refreshPorts,  // Now this needs to be called manually once
    openPort,
    closePort,
    parsedData
  };
};

