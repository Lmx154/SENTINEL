"""
FastAPI WebSocket Server for Serial Operations

This server exposes the serial operations functionality via WebSocket connections.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
import logging
import time
from typing import Dict, Set
from serial_operations import serial_manager
from data_parser import parser_manager, process_serial_data
from sensor_fusion import process_telemetry_packet, sensor_fusion, configure_sensor_fusion

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Serial Operations WebSocket API", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active WebSocket connections
active_connections: Set[WebSocket] = set()

# Store the main event loop for thread-safe access
main_loop = None

class WebSocketManager:
    def __init__(self):
        self.connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.add(websocket)
        logger.info(f"New WebSocket connection. Total: {len(self.connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.connections)}")
    
    async def send_to_client(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Error sending message to client: {e}")
            self.disconnect(websocket)
    
    async def broadcast(self, message: dict):
        if self.connections:
            disconnected = set()
            for connection in self.connections:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception:
                    disconnected.add(connection)
            
            # Remove disconnected clients
            for connection in disconnected:
                self.disconnect(connection)

manager = WebSocketManager()

@app.on_event("startup")
async def startup_event():
    """Initialize the main event loop reference for thread-safe access"""
    global main_loop
    main_loop = asyncio.get_event_loop()
    
    # Register the callback with the parser manager
    parser_manager.add_data_callback(data_callback_for_broadcast)
    
    logger.info("Server startup complete - main event loop initialized and data callback registered")

def data_callback_for_broadcast(parsed_data: dict):
    """Callback function for parsed data from the parser manager"""
    if parsed_data and main_loop:
        # The parsed_data now includes orientation data from sensor fusion
        telemetry_message = {
            "type": "telemetry_data",
            "port": parsed_data.get("_source_port", "unknown"),
            "data": parsed_data,
            "timestamp": time.time()
        }
        
        try:
            asyncio.run_coroutine_threadsafe(manager.broadcast(telemetry_message), main_loop)
        except Exception as e:
            logger.error(f"Error broadcasting parsed telemetry data: {e}")

def serial_data_callback(port: str, data: str):
    """Callback function for serial data - sends raw data for console and processes through parser"""
    # Send raw data for console display
    console_message = {
        "type": "console_data",
        "port": port,
        "data": data,
        "timestamp": time.time()
    }
    
    try:
        # Use asyncio.run_coroutine_threadsafe to safely call from thread
        asyncio.run_coroutine_threadsafe(manager.broadcast(console_message), main_loop)
    except Exception as e:
        logger.error(f"Error broadcasting console data: {e}")
    
    # Process through the parser manager (which will call our data_callback_for_broadcast)
    process_serial_data(port, data)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Process the message
            response = await handle_serial_command(message)
            
            # Send response back to client
            await manager.send_to_client(websocket, response)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

async def handle_serial_command(message: dict) -> dict:
    """Handle serial commands from WebSocket clients"""
    
    command = message.get("command")
    request_id = message.get("id", "unknown")
    
    try:
        if command == "list_ports":
            ports = serial_manager.list_serial_ports()
            return {
                "id": request_id,
                "type": "response",
                "command": "list_ports",
                "success": True,
                "data": ports
            }
        
        elif command == "open_port":
            port = message.get("port")
            baudrate = message.get("baudrate", 9600)
            
            if not port:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "open_port",
                    "success": False,
                    "error": "Port parameter is required"
                }
            
            # Set up callback for this port to broadcast data
            success = serial_manager.open_serial_port(
                port=port,
                baudrate=baudrate,
                data_callback=serial_data_callback
            )
            
            return {
                "id": request_id,
                "type": "response",
                "command": "open_port",
                "success": success,
                "port": port,
                "baudrate": baudrate
            }
        
        elif command == "close_port":
            port = message.get("port")
            
            if not port:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "close_port",
                    "success": False,
                    "error": "Port parameter is required"
                }
            
            success = serial_manager.close_serial_port(port)
            
            return {
                "id": request_id,
                "type": "response",
                "command": "close_port",
                "success": success,
                "port": port
            }
        
        elif command == "write_port":
            port = message.get("port")
            data = message.get("data")
            
            if not port or data is None:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "write_port",
                    "success": False,
                    "error": "Port and data parameters are required"
                }
            
            success = serial_manager.write_serial_port(port, data)
            
            return {
                "id": request_id,
                "type": "response",
                "command": "write_port",
                "success": success,
                "port": port,
                "data": data
            }
        
        elif command == "write_port_line":
            port = message.get("port")
            data = message.get("data")
            
            if not port or data is None:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "write_port_line",
                    "success": False,
                    "error": "Port and data parameters are required"
                }
            
            success = serial_manager.write_serial_port_line(port, data)
            
            return {
                "id": request_id,
                "type": "response",
                "command": "write_port_line",
                "success": success,
                "port": port,
                "data": data
            }
        
        elif command == "read_port":
            port = message.get("port")
            num_bytes = message.get("num_bytes")
            
            if not port:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "read_port",
                    "success": False,
                    "error": "Port parameter is required"
                }
            
            data = serial_manager.read_serial_port(port, num_bytes)
            
            return {
                "id": request_id,
                "type": "response",
                "command": "read_port",
                "success": data is not None,
                "port": port,
                "data": data
            }
        
        elif command == "read_port_line":
            port = message.get("port")
            
            if not port:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "read_port_line",
                    "success": False,
                    "error": "Port parameter is required"
                }
            
            data = serial_manager.read_serial_port_line(port)
            
            return {
                "id": request_id,
                "type": "response",
                "command": "read_port_line",
                "success": data is not None,
                "port": port,
                "data": data
            }
        
        elif command == "is_port_open":
            port = message.get("port")
            
            if not port:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "is_port_open",
                    "success": False,
                    "error": "Port parameter is required"
                }
            
            is_open = serial_manager.is_port_open(port)
            
            return {
                "id": request_id,
                "type": "response",
                "command": "is_port_open",
                "success": True,
                "port": port,
                "is_open": is_open
            }
        
        elif command == "get_port_info":
            port = message.get("port")
            
            if not port:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "get_port_info",
                    "success": False,
                    "error": "Port parameter is required"            }
            
            info = serial_manager.get_port_info(port)
            
            return {
                "id": request_id,
                "type": "response",
                "command": "get_port_info",
                "success": info is not None,
                "port": port,
                "info": info
            }
        
        elif command == "close_all_ports":
            success = serial_manager.close_all_ports()
            
            return {
                "id": request_id,
                "type": "response",
                "command": "close_all_ports",
                "success": success
            }
        
        # Data Parser Management Commands
        elif command == "get_parser_info":
            info = parser_manager.get_parser_info()
            
            return {
                "id": request_id,
                "type": "response",
                "command": "get_parser_info",
                "success": True,
                "data": info
            }
        
        elif command == "set_active_parser":
            parser_name = message.get("parser_name")
            
            if not parser_name:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "set_active_parser",
                    "success": False,
                    "error": "parser_name parameter is required"
                }
            
            success = parser_manager.set_active_parser(parser_name)
            
            return {
                "id": request_id,
                "type": "response",
                "command": "set_active_parser",
                "success": success,
                "parser_name": parser_name
            }
        
        elif command == "enable_auto_detection":
            parser_manager.enable_auto_detection()
            
            return {
                "id": request_id,
                "type": "response",
                "command": "enable_auto_detection",
                "success": True
            }
        
        elif command == "add_custom_parser":
            delimiter = message.get("delimiter")
            field_names = message.get("field_names", [])
            parser_name = message.get("parser_name")
            
            if not delimiter:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "add_custom_parser",
                    "success": False,
                    "error": "delimiter parameter is required"
                }
            
            try:
                from data_parser import add_custom_parser
                add_custom_parser(delimiter, field_names, parser_name)
                
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "add_custom_parser",
                    "success": True,
                    "delimiter": delimiter,
                    "field_names": field_names,
                    "parser_name": parser_name                }
            except Exception as e:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "add_custom_parser",
                    "success": False,
                    "error": str(e)
                }
        
        elif command == "configure_sentinel_parser":
            field_mapping = message.get("field_mapping", {})
            
            try:
                from data_parser import configure_sentinel_parser
                # Convert string keys to integers
                int_field_mapping = {int(k): v for k, v in field_mapping.items()}
                configure_sentinel_parser(int_field_mapping)
                
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "configure_sentinel_parser",
                    "success": True,
                    "field_mapping": int_field_mapping
                }
            except Exception as e:
                return {
                    "id": request_id,
                    "type": "response",
                    "command": "configure_sentinel_parser",
                    "success": False,
                    "error": str(e)
                }
        
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
        
        else:
            return {
                "id": request_id,
                "type": "response",
                "command": command,
                "success": False,
                "error": f"Unknown command: {command}"
            }
    
    except Exception as e:
        logger.error(f"Error handling command {command}: {e}")
        return {
            "id": request_id,
            "type": "response",
            "command": command,
            "success": False,
            "error": str(e)
        }

@app.get("/")
async def root():
    return {"message": "Serial Operations WebSocket API", "websocket_url": "/ws"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "active_connections": len(manager.connections)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
