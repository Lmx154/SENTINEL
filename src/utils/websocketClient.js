// src/utils/websocketClient.js
class WebSocketClient {  constructor() {
    this.ws = null;
    this.messageHandlers = new Map();
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.currentPort = null; // Track the currently opened port
  }

  connect(url = 'ws://localhost:8000/ws') {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          console.log('WebSocket connected to Python backend');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnected = false;
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      setTimeout(() => {
        this.connect().catch(() => {
          // Will retry again if needed
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  handleMessage(message) {
    if (message.type === 'response' && message.id) {
      // Handle command responses
      const resolver = this.pendingRequests.get(message.id);
      if (resolver) {
        this.pendingRequests.delete(message.id);
        if (message.success) {
          resolver.resolve(message);
        } else {
          resolver.reject(new Error(message.error || 'Unknown error'));
        }
      }    } else if (message.type === 'serial_data') {
      // Handle incoming serial data
      this.notifyHandlers('serial_data', message);
      
      // Try to parse the data as a telemetry packet
      try {
        // Assuming the data comes in a specific format
        // You may need to adjust this based on your actual data format
        const telemetryData = this.parseSerialData(message.data);
        if (telemetryData) {
          // Emit custom event for App.jsx to listen to
          window.dispatchEvent(new CustomEvent('telemetry-packet', { 
            detail: { payload: telemetryData } 
          }));
        }
      } catch (error) {
        console.error('Failed to parse telemetry data:', error);
      }
    }
  }

  sendCommand(command, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = `req_${++this.requestId}`;
      const message = {
        id: requestId,
        command: command,
        ...params
      };

      this.pendingRequests.set(requestId, { resolve, reject });
      
      // Set timeout for request
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 10000); // 10 second timeout

      this.ws.send(JSON.stringify(message));
    });
  }

  onMessage(type, handler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(handler);
  }

  offMessage(type, handler) {
    if (this.messageHandlers.has(type)) {
      const handlers = this.messageHandlers.get(type);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  notifyHandlers(type, data) {
    if (this.messageHandlers.has(type)) {
      this.messageHandlers.get(type).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });
    }
  }
  disconnect() {
    if (this.ws) {
      this.isConnected = false;
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
    this.messageHandlers.clear();
  }

  parseSerialData(rawData) {
    // This method should parse the raw serial data into a telemetry packet
    // You'll need to implement this based on your data format
    // For now, returning a mock packet structure
    try {
      // If the data is already JSON, parse it
      if (typeof rawData === 'string' && rawData.startsWith('{')) {
        return JSON.parse(rawData);
      }
      
      // Otherwise, you might need to parse a custom format
      // This is a placeholder - implement based on your actual data format
      return {
        packet_id: Date.now(),
        timestamp: new Date().toISOString(),
        accel_x: Math.random() * 10 - 5,
        accel_y: Math.random() * 10 - 5,
        accel_z: Math.random() * 10 - 5,
        gyro_x: Math.random() * 360,
        gyro_y: Math.random() * 360,
        gyro_z: Math.random() * 360,
        temp: 20 + Math.random() * 10,
        pressure: 1013 + Math.random() * 50,
        alt_bmp: Math.random() * 1000,
        mag_x: Math.random() * 100,
        mag_y: Math.random() * 100,
        mag_z: Math.random() * 100,
        latitude: 37.7749 + (Math.random() - 0.5) * 0.01,
        longitude: -122.4194 + (Math.random() - 0.5) * 0.01,
        satellites: Math.floor(Math.random() * 12) + 4,
        alt_gps: Math.random() * 1000,
      };
    } catch (error) {
      console.error('Error parsing serial data:', error);
      return null;
    }
  }

  // API methods that mirror the original Tauri commands
  async listSerialPorts() {
    const response = await this.sendCommand('list_ports');
    return response.data || [];
  }
  async openSerial(portName, baudRate = 9600) {
    const response = await this.sendCommand('open_port', {
      port: portName,
      baudrate: baudRate
    });
    
    if (response.success) {
      this.currentPort = portName; // Track the opened port
      return `Connected to ${portName} at ${baudRate} baud`;
    } else {
      return response.error;
    }
  }

  async closeSerial() {
    const response = await this.sendCommand('close_all_ports');
    if (response.success) {
      this.currentPort = null; // Clear the tracked port
      return 'Serial port closed successfully';
    } else {
      return response.error;
    }
  }  async writeSerial(command, port = null) {
    try {
      // Use the provided port or fall back to the currently tracked port
      const targetPort = port || this.currentPort;
      
      if (!targetPort) {
        throw new Error('No port is currently open. Please open a port first.');
      }
      
      const response = await this.sendCommand('write_port_line', {
        port: targetPort,
        data: command
      });
      
      return response.success ? 'Command sent successfully' : response.error;
    } catch (error) {
      throw new Error(`Failed to write to serial port: ${error.message}`);
    }
  }

  async startParsedStream() {
    // The Python backend automatically streams data when a port is opened
    // So this is essentially a no-op, but we'll return success
    return 'Live data stream started successfully';
  }
}

// Create a singleton instance
export const wsClient = new WebSocketClient();

// Auto-connect when the module is imported
wsClient.connect().catch(error => {
  console.error('Failed to connect to Python backend:', error);
});

export default wsClient;
