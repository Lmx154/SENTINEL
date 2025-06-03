"""
FastAPI WebSocket Server for Serial Operations

This server exposes the serial operations functionality via WebSocket connections.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
import logging
from typing import Dict, Set
from serial_operations import serial_manager

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

def serial_data_callback(port: str, data: str):
    """Callback function for serial data - broadcasts to all connected clients"""
    message = {
        "type": "serial_data",
        "port": port,
        "data": data,
        "timestamp": asyncio.get_event_loop().time()
    }
    
    # Schedule the broadcast in the event loop
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(manager.broadcast(message))
    except Exception as e:
        logger.error(f"Error broadcasting serial data: {e}")

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
                    "error": "Port parameter is required"
                }
            
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
