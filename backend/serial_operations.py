"""
Serial Operations Module

This module provides functions for managing serial port operations including:
- Listing available serial ports
- Opening and maintaining serial connections
- Closing serial connections
- Writing/sending commands to serial ports
- Reading from serial ports
"""

import serial
import serial.tools.list_ports
import threading
import time
from typing import List, Dict, Optional, Callable
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SerialManager:
    """
    A class to manage serial port operations with support for multiple connections
    """
    
    def __init__(self):
        self.connections: Dict[str, serial.Serial] = {}
        self.read_threads: Dict[str, threading.Thread] = {}
        self.stop_reading: Dict[str, threading.Event] = {}
        self.data_callbacks: Dict[str, Callable] = {}
    
    def list_serial_ports(self) -> List[Dict[str, str]]:
        """
        List all available serial ports on the system
        
        Returns:
            List[Dict[str, str]]: List of dictionaries containing port information
                Each dict contains: 'port', 'description', 'hwid'
        """
        try:
            ports = serial.tools.list_ports.comports()
            port_list = []
            
            for port in ports:
                port_info = {
                    'port': port.device,
                    'description': port.description or 'N/A',
                    'hwid': port.hwid or 'N/A',
                    'manufacturer': getattr(port, 'manufacturer', 'N/A') or 'N/A',
                    'product': getattr(port, 'product', 'N/A') or 'N/A',
                    'vid': getattr(port, 'vid', 'N/A') or 'N/A',
                    'pid': getattr(port, 'pid', 'N/A') or 'N/A'
                }
                port_list.append(port_info)
            
            logger.info(f"Found {len(port_list)} serial ports")
            return port_list
            
        except Exception as e:
            logger.error(f"Error listing serial ports: {e}")
            return []
    
    def open_serial_port(self, 
                        port: str, 
                        baudrate: int = 9600,
                        bytesize: int = serial.EIGHTBITS,
                        parity: str = serial.PARITY_NONE,
                        stopbits: int = serial.STOPBITS_ONE,
                        timeout: float = 1.0,
                        data_callback: Optional[Callable] = None) -> bool:
        """
        Open a serial port and keep it open until explicitly closed
        
        Args:
            port (str): Serial port name (e.g., 'COM3' on Windows, '/dev/ttyUSB0' on Linux)
            baudrate (int): Baud rate for communication (default: 9600)
            bytesize (int): Number of data bits (default: 8)
            parity (str): Parity setting (default: None)
            stopbits (int): Number of stop bits (default: 1)
            timeout (float): Read timeout in seconds (default: 1.0)
            data_callback (Callable): Optional callback function for incoming data
        
        Returns:
            bool: True if port opened successfully, False otherwise
        """
        try:
            # Close existing connection if it exists
            if port in self.connections:
                self.close_serial_port(port)
            
            # Create new serial connection
            ser = serial.Serial(
                port=port,
                baudrate=baudrate,
                bytesize=bytesize,
                parity=parity,
                stopbits=stopbits,
                timeout=timeout
            )
            
            if ser.is_open:
                self.connections[port] = ser
                logger.info(f"Successfully opened serial port: {port} at {baudrate} baud")
                
                # Set up data callback if provided
                if data_callback:
                    self.data_callbacks[port] = data_callback
                    self._start_reading_thread(port)
                
                return True
            else:
                logger.error(f"Failed to open serial port: {port}")
                return False
                
        except serial.SerialException as e:
            logger.error(f"Serial exception opening port {port}: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error opening port {port}: {e}")
            return False
    
    def close_serial_port(self, port: str) -> bool:
        """
        Close a specific serial port
        
        Args:
            port (str): Serial port name to close
        
        Returns:
            bool: True if port closed successfully, False otherwise
        """
        try:
            # Stop reading thread if it exists
            if port in self.stop_reading:
                self.stop_reading[port].set()
                if port in self.read_threads:
                    self.read_threads[port].join(timeout=2.0)
                    del self.read_threads[port]
                del self.stop_reading[port]
            
            # Remove callback
            if port in self.data_callbacks:
                del self.data_callbacks[port]
            
            # Close the serial connection
            if port in self.connections:
                if self.connections[port].is_open:
                    self.connections[port].close()
                del self.connections[port]
                logger.info(f"Successfully closed serial port: {port}")
                return True
            else:
                logger.warning(f"Port {port} was not open")
                return False
                
        except Exception as e:
            logger.error(f"Error closing port {port}: {e}")
            return False
    
    def close_all_ports(self) -> bool:
        """
        Close all open serial ports
        
        Returns:
            bool: True if all ports closed successfully, False otherwise
        """
        success = True
        ports_to_close = list(self.connections.keys())
        
        for port in ports_to_close:
            if not self.close_serial_port(port):
                success = False
        
        return success
    
    def write_serial_port(self, port: str, data: str, encoding: str = 'utf-8') -> bool:
        """
        Write/send data to a serial port (like Arduino Serial.print())
        
        Args:
            port (str): Serial port name
            data (str): Data to send
            encoding (str): Text encoding (default: 'utf-8')
        
        Returns:
            bool: True if data sent successfully, False otherwise
        """
        try:
            if port not in self.connections:
                logger.error(f"Port {port} is not open")
                return False
            
            ser = self.connections[port]
            if not ser.is_open:
                logger.error(f"Port {port} is not open")
                return False
            
            # Convert string to bytes and send
            if isinstance(data, str):
                data_bytes = data.encode(encoding)
            else:
                data_bytes = data
            
            bytes_written = ser.write(data_bytes)
            ser.flush()  # Ensure data is sent immediately
            
            logger.info(f"Sent {bytes_written} bytes to {port}: {data}")
            return True
            
        except Exception as e:
            logger.error(f"Error writing to port {port}: {e}")
            return False
    
    def write_serial_port_line(self, port: str, data: str, encoding: str = 'utf-8') -> bool:
        """
        Write/send data to a serial port with newline (like Arduino Serial.println())
        
        Args:
            port (str): Serial port name
            data (str): Data to send
            encoding (str): Text encoding (default: 'utf-8')
        
        Returns:
            bool: True if data sent successfully, False otherwise
        """
        return self.write_serial_port(port, data + '\n', encoding)
    
    def read_serial_port(self, port: str, num_bytes: int = None, encoding: str = 'utf-8') -> Optional[str]:
        """
        Read data from a serial port
        
        Args:
            port (str): Serial port name
            num_bytes (int): Number of bytes to read (None for all available)
            encoding (str): Text encoding (default: 'utf-8')
        
        Returns:
            Optional[str]: Data read from port, None if error
        """
        try:
            if port not in self.connections:
                logger.error(f"Port {port} is not open")
                return None
            
            ser = self.connections[port]
            if not ser.is_open:
                logger.error(f"Port {port} is not open")
                return None
            
            if num_bytes:
                data = ser.read(num_bytes)
            else:
                data = ser.read_all()
            
            if data:
                decoded_data = data.decode(encoding, errors='ignore')
                logger.info(f"Read from {port}: {decoded_data}")
                return decoded_data
            
            return ""
            
        except Exception as e:
            logger.error(f"Error reading from port {port}: {e}")
            return None
    
    def read_serial_port_line(self, port: str, encoding: str = 'utf-8') -> Optional[str]:
        """
        Read a line from a serial port (until newline character)
        
        Args:
            port (str): Serial port name
            encoding (str): Text encoding (default: 'utf-8')
        
        Returns:
            Optional[str]: Line read from port, None if error
        """
        try:
            if port not in self.connections:
                logger.error(f"Port {port} is not open")
                return None
            
            ser = self.connections[port]
            if not ser.is_open:
                logger.error(f"Port {port} is not open")
                return None
            
            line = ser.readline()
            if line:
                decoded_line = line.decode(encoding, errors='ignore').strip()
                logger.info(f"Read line from {port}: {decoded_line}")
                return decoded_line
            
            return ""
            
        except Exception as e:
            logger.error(f"Error reading line from port {port}: {e}")
            return None
    
    def is_port_open(self, port: str) -> bool:
        """
        Check if a serial port is open
        
        Args:
            port (str): Serial port name
        
        Returns:
            bool: True if port is open, False otherwise
        """
        return port in self.connections and self.connections[port].is_open
    
    def get_port_info(self, port: str) -> Optional[Dict]:
        """
        Get information about an open serial port
        
        Args:
            port (str): Serial port name
        
        Returns:
            Optional[Dict]: Port information, None if port not open
        """
        if port not in self.connections:
            return None
        
        ser = self.connections[port]
        return {
            'port': ser.port,
            'baudrate': ser.baudrate,
            'bytesize': ser.bytesize,
            'parity': ser.parity,
            'stopbits': ser.stopbits,
            'timeout': ser.timeout,
            'is_open': ser.is_open
        }
    
    def _start_reading_thread(self, port: str):
        """
        Start a background thread to continuously read from a serial port
        
        Args:
            port (str): Serial port name
        """
        if port in self.read_threads:
            return  # Thread already running
        
        self.stop_reading[port] = threading.Event()
        self.read_threads[port] = threading.Thread(
            target=self._read_continuously,
            args=(port,),
            daemon=True
        )
        self.read_threads[port].start()
    
    def _read_continuously(self, port: str):
        """
        Continuously read from a serial port in a background thread
        
        Args:
            port (str): Serial port name
        """
        while not self.stop_reading[port].is_set():
            try:
                if port in self.connections and self.connections[port].is_open:
                    if self.connections[port].in_waiting > 0:
                        data = self.read_serial_port_line(port)
                        if data and port in self.data_callbacks:
                            self.data_callbacks[port](port, data)
                time.sleep(0.01)  # Small delay to prevent excessive CPU usage
            except Exception as e:
                logger.error(f"Error in continuous reading for {port}: {e}")
                break


# Global instance for easy use
serial_manager = SerialManager()

# Convenience functions for direct use
def list_serial_ports() -> List[Dict[str, str]]:
    """List all available serial ports"""
    return serial_manager.list_serial_ports()

def open_serial_port(port: str, baudrate: int = 9600, **kwargs) -> bool:
    """Open a serial port"""
    return serial_manager.open_serial_port(port, baudrate, **kwargs)

def close_serial_port(port: str) -> bool:
    """Close a serial port"""
    return serial_manager.close_serial_port(port)

def write_serial_port(port: str, data: str) -> bool:
    """Write data to a serial port"""
    return serial_manager.write_serial_port(port, data)

def write_serial_port_line(port: str, data: str) -> bool:
    """Write data with newline to a serial port"""
    return serial_manager.write_serial_port_line(port, data)

def read_serial_port(port: str, num_bytes: int = None) -> Optional[str]:
    """Read data from a serial port"""
    return serial_manager.read_serial_port(port, num_bytes)

def read_serial_port_line(port: str) -> Optional[str]:
    """Read a line from a serial port"""
    return serial_manager.read_serial_port_line(port)

def is_port_open(port: str) -> bool:
    """Check if a serial port is open"""
    return serial_manager.is_port_open(port)


# Example usage and testing
if __name__ == "__main__":
    # Example usage
    print("Available serial ports:")
    ports = list_serial_ports()
    for port in ports:
        print(f"  {port['port']}: {port['description']}")
    
    # Example of opening a port (uncomment to test with actual hardware)
    # if ports:
    #     test_port = ports[0]['port']
    #     if open_serial_port(test_port, 9600):
    #         print(f"Successfully opened {test_port}")
    #         
    #         # Send a test command
    #         write_serial_port_line(test_port, "Hello Arduino!")
    #         
    #         # Read response
    #         time.sleep(1)
    #         response = read_serial_port_line(test_port)
    #         if response:
    #             print(f"Received: {response}")
    #         
    #         # Close the port
    #         close_serial_port(test_port)
    #         print(f"Closed {test_port}")
