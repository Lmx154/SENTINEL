"""
Data Parser Module

This module provides a flexible framework for parsing different types of data strings
from serial ports and converting them into structured data for the frontend components.

The parser supports multiple string formats and can be easily extended to handle new
data types in the future.
"""

import re
import json
import logging
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime
from abc import ABC, abstractmethod

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DataParserBase(ABC):
    """Abstract base class for data parsers"""
    
    @abstractmethod
    def parse(self, raw_data: str) -> Optional[Dict[str, Any]]:
        """Parse raw string data into structured format"""
        pass
    
    @abstractmethod
    def get_format_name(self) -> str:
        """Return the name of this parser format"""
        pass
    
    @abstractmethod
    def validate_format(self, raw_data: str) -> bool:
        """Check if the raw data matches this parser's expected format"""
        pass

class ArmedStateTelemetryParser(DataParserBase):
    """
    Parser for ARMED state telemetry from Brunito Flight System
    Expected format: <MM/DD/YYYY,HH:MM:SS,altitude,accelX,accelY,accelZ,gyroX,gyroY,gyroZ,magX,magY,magZ,latitude,longitude,satellites,temperature>
    Example: <05/27/2025,11:43:46,0.95,-37,-967,-3,128,-27,204,6,-53,20,1,1,0,24>
    """
    
    def __init__(self):
        self.format_name = "ARMED_TELEMETRY"
        self.field_mapping = {
            0: "date",
            1: "time", 
            2: "altitude_m",
            3: "accel_x_mg",
            4: "accel_y_mg",
            5: "accel_z_mg",
            6: "gyro_x_centidps",
            7: "gyro_y_centidps",
            8: "gyro_z_centidps",
            9: "mag_x_decisla",
            10: "mag_y_decisla",
            11: "mag_z_decisla",
            12: "gps_lat_1e7",
            13: "gps_lon_1e7",
            14: "gps_satellites",
            15: "temperature_c"
        }
    
    def get_format_name(self) -> str:
        return self.format_name
    
    def validate_format(self, raw_data: str) -> bool:
        """Check if data looks like ARMED telemetry format"""
        if not raw_data.strip():
            return False
        
        # Must be enclosed in < > brackets
        if not (raw_data.strip().startswith('<') and raw_data.strip().endswith('>')):
            return False
        
        # Extract content between brackets
        content = raw_data.strip()[1:-1]
        parts = content.split(',')
        
        # Should have exactly 16 fields
        if len(parts) != 16:
            return False
        
        # First field should look like a date (MM/DD/YYYY)
        try:
            datetime.strptime(f"{parts[0]},{parts[1]}", "%m/%d/%Y,%H:%M:%S")
            return True
        except ValueError:
            return False
    
    def parse(self, raw_data: str) -> Optional[Dict[str, Any]]:
        """Parse ARMED state telemetry data"""
        try:
            raw_data = raw_data.strip()
            if not self.validate_format(raw_data):
                return None
            
            # Remove brackets and split
            content = raw_data[1:-1]
            parts = content.split(',')
            
            parsed_data = {}
            
            # Parse each field according to the mapping
            for index, value in enumerate(parts):
                if index in self.field_mapping:
                    field_name = self.field_mapping[index]
                    parsed_value = self._convert_value(field_name, value.strip())
                    if parsed_value is not None:
                        parsed_data[field_name] = parsed_value
            
            # Create combined datetime
            if "date" in parsed_data and "time" in parsed_data:
                try:
                    dt = datetime.strptime(f"{parsed_data['date']},{parsed_data['time']}", "%m/%d/%Y,%H:%M:%S")
                    parsed_data["datetime"] = dt.isoformat()
                    parsed_data["timestamp"] = dt.timestamp()
                except ValueError:
                    pass
            
            # Convert GPS coordinates to decimal degrees
            if "gps_lat_1e7" in parsed_data and "gps_lon_1e7" in parsed_data:
                parsed_data["gps_lat_deg"] = parsed_data["gps_lat_1e7"] / 10000000.0
                parsed_data["gps_lon_deg"] = parsed_data["gps_lon_1e7"] / 10000000.0
            
            # Convert accelerometer to g-force
            if all(f"accel_{axis}_mg" in parsed_data for axis in ['x', 'y', 'z']):
                parsed_data["accel_x_g"] = parsed_data["accel_x_mg"] / 1000.0
                parsed_data["accel_y_g"] = parsed_data["accel_y_mg"] / 1000.0
                parsed_data["accel_z_g"] = parsed_data["accel_z_mg"] / 1000.0
            
            # Convert gyroscope to degrees/sec
            if all(f"gyro_{axis}_centidps" in parsed_data for axis in ['x', 'y', 'z']):
                parsed_data["gyro_x_dps"] = parsed_data["gyro_x_centidps"] / 100.0
                parsed_data["gyro_y_dps"] = parsed_data["gyro_y_centidps"] / 100.0
                parsed_data["gyro_z_dps"] = parsed_data["gyro_z_centidps"] / 100.0
            
            # Convert magnetometer to microTesla
            if all(f"mag_{axis}_decisla" in parsed_data for axis in ['x', 'y', 'z']):
                parsed_data["mag_x_ut"] = parsed_data["mag_x_decisla"] / 10.0
                parsed_data["mag_y_ut"] = parsed_data["mag_y_decisla"] / 10.0
                parsed_data["mag_z_ut"] = parsed_data["mag_z_decisla"] / 10.0
            
            # Validate GPS data
            if "gps_lat_1e7" in parsed_data and "gps_lon_1e7" in parsed_data and "gps_satellites" in parsed_data:
                parsed_data["gps_valid"] = self._is_gps_valid(
                    parsed_data["gps_lat_1e7"], 
                    parsed_data["gps_lon_1e7"], 
                    parsed_data["gps_satellites"]
                )
            
            # Add metadata
            parsed_data["_parser"] = self.format_name
            parsed_data["_timestamp_parsed"] = datetime.now().isoformat()
            parsed_data["_raw_data"] = raw_data
            parsed_data["_state"] = "ARMED"
            
            return parsed_data
            
        except Exception as e:
            logger.error(f"Error parsing ARMED telemetry data: {e}")
            return None
    
    def _convert_value(self, field_name: str, value: str) -> Any:
        """Convert string value to appropriate type based on field name"""
        try:
            if field_name in ["date", "time"]:
                return value  # Keep as string for datetime parsing
            elif field_name in ["gps_satellites", "temperature_c"]:
                return int(value)
            elif field_name in ["accel_x_mg", "accel_y_mg", "accel_z_mg", 
                               "gyro_x_centidps", "gyro_y_centidps", "gyro_z_centidps",
                               "mag_x_decisla", "mag_y_decisla", "mag_z_decisla",
                               "gps_lat_1e7", "gps_lon_1e7"]:
                return int(value)
            elif field_name == "altitude_m":
                return float(value)
            else:
                return value
        except (ValueError, TypeError):
            logger.warning(f"Could not convert value '{value}' for field '{field_name}'")
            return None
    
    def _is_gps_valid(self, lat_1e7: int, lon_1e7: int, satellites: int) -> bool:
        """Check if GPS data is valid based on satellites and coordinate values"""
        return (satellites >= 4 and 
                abs(lat_1e7) > 100000 and  # > 0.01 degrees
                abs(lon_1e7) > 100000)

class SentinelTelemetryParser(DataParserBase):
    """
    Parser for SENTINEL rocket telemetry data
    Expected format: CSV-like with specific field order
    Example: "2025-06-03 14:30:15,12,1013.25,25.6,9.81,0.15,-0.32,45.123456,-75.987654,850.5,..."
    """
    
    def __init__(self):
        self.format_name = "SENTINEL_TELEMETRY"
        self.field_mapping = {
            0: "timestamp",
            1: "satellites", 
            2: "pressure",
            3: "temp",
            4: "accel_x",
            5: "accel_y", 
            6: "accel_z",
            7: "gyro_x",
            8: "gyro_y",
            9: "gyro_z",
            10: "latitude",
            11: "longitude",
            12: "alt_gps",
            13: "alt_bmp"
        }
    
    def get_format_name(self) -> str:
        return self.format_name
    
    def validate_format(self, raw_data: str) -> bool:
        """Check if data looks like SENTINEL telemetry format"""
        if not raw_data.strip():
            return False
        
        # Basic validation: should have comma-separated values
        parts = raw_data.strip().split(',')
        return len(parts) >= 10  # Minimum expected fields
    
    def parse(self, raw_data: str) -> Optional[Dict[str, Any]]:
        """Parse SENTINEL telemetry data"""
        try:
            raw_data = raw_data.strip()
            if not self.validate_format(raw_data):
                return None
            
            parts = raw_data.split(',')
            parsed_data = {}
            
            for index, value in enumerate(parts):
                if index in self.field_mapping:
                    field_name = self.field_mapping[index]
                    parsed_value = self._convert_value(field_name, value.strip())
                    if parsed_value is not None:
                        parsed_data[field_name] = parsed_value
            
            # Add metadata
            parsed_data["_parser"] = self.format_name
            parsed_data["_timestamp_parsed"] = datetime.now().isoformat()
            parsed_data["_raw_data"] = raw_data
            
            return parsed_data
            
        except Exception as e:
            logger.error(f"Error parsing SENTINEL telemetry data: {e}")
            return None
    
    def _convert_value(self, field_name: str, value: str) -> Any:
        """Convert string value to appropriate type based on field name"""
        try:
            if field_name == "timestamp":
                return value  # Keep as string for now
            elif field_name == "satellites":
                return int(value)
            elif field_name in ["pressure", "temp", "accel_x", "accel_y", "accel_z", 
                               "gyro_x", "gyro_y", "gyro_z", "latitude", "longitude", 
                               "alt_gps", "alt_bmp"]:
                return float(value)
            else:
                return value
        except (ValueError, TypeError):
            logger.warning(f"Could not convert value '{value}' for field '{field_name}'")
            return None

class NMEAParser(DataParserBase):
    """
    Parser for NMEA GPS data format
    Example: "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47"
    """
    
    def __init__(self):
        self.format_name = "NMEA_GPS"
    
    def get_format_name(self) -> str:
        return self.format_name
    
    def validate_format(self, raw_data: str) -> bool:
        """Check if data looks like NMEA format"""
        return raw_data.strip().startswith('$') and '*' in raw_data
    
    def parse(self, raw_data: str) -> Optional[Dict[str, Any]]:
        """Parse NMEA GPS data"""
        try:
            if not self.validate_format(raw_data):
                return None
            
            # Basic NMEA parsing - can be extended for specific sentence types
            parts = raw_data.strip().split(',')
            sentence_type = parts[0] if parts else ""
            
            parsed_data = {
                "sentence_type": sentence_type,
                "raw_fields": parts,
                "_parser": self.format_name,
                "_timestamp_parsed": datetime.now().isoformat(),
                "_raw_data": raw_data
            }
            
            # Add specific parsing for common NMEA sentences
            if sentence_type == "$GPGGA":
                parsed_data.update(self._parse_gpgga(parts))
            
            return parsed_data
            
        except Exception as e:
            logger.error(f"Error parsing NMEA data: {e}")
            return None
    
    def _parse_gpgga(self, parts: List[str]) -> Dict[str, Any]:
        """Parse GPGGA sentence specifically"""
        try:
            return {
                "time": parts[1] if len(parts) > 1 else None,
                "latitude": self._convert_coordinate(parts[2], parts[3]) if len(parts) > 3 else None,
                "longitude": self._convert_coordinate(parts[4], parts[5]) if len(parts) > 5 else None,
                "fix_quality": int(parts[6]) if len(parts) > 6 and parts[6] else 0,
                "satellites": int(parts[7]) if len(parts) > 7 and parts[7] else 0,
                "hdop": float(parts[8]) if len(parts) > 8 and parts[8] else None,
                "altitude": float(parts[9]) if len(parts) > 9 and parts[9] else None,
            }
        except (ValueError, IndexError):
            return {}
    
    def _convert_coordinate(self, coord_str: str, direction: str) -> Optional[float]:
        """Convert NMEA coordinate format to decimal degrees"""
        try:
            if not coord_str or not direction:
                return None
            
            # NMEA format: DDMM.MMMM or DDDMM.MMMM
            if len(coord_str) < 4:
                return None
            
            if '.' in coord_str:
                decimal_pos = coord_str.index('.')
                degrees = int(coord_str[:decimal_pos-2])
                minutes = float(coord_str[decimal_pos-2:])
            else:
                degrees = int(coord_str[:-2])
                minutes = float(coord_str[-2:])
            
            decimal = degrees + minutes / 60.0
            
            if direction in ['S', 'W']:
                decimal = -decimal
            
            return decimal
        except (ValueError, IndexError):
            return None

class JSONParser(DataParserBase):
    """
    Parser for JSON formatted data
    Example: {"temp": 25.6, "pressure": 1013.25, "timestamp": "2025-06-03T14:30:15"}
    """
    
    def __init__(self):
        self.format_name = "JSON"
    
    def get_format_name(self) -> str:
        return self.format_name
    
    def validate_format(self, raw_data: str) -> bool:
        """Check if data looks like JSON"""
        try:
            json.loads(raw_data.strip())
            return True
        except json.JSONDecodeError:
            return False
    
    def parse(self, raw_data: str) -> Optional[Dict[str, Any]]:
        """Parse JSON data"""
        try:
            if not self.validate_format(raw_data):
                return None
            
            parsed_data = json.loads(raw_data.strip())
            
            # Add metadata
            parsed_data["_parser"] = self.format_name
            parsed_data["_timestamp_parsed"] = datetime.now().isoformat()
            parsed_data["_raw_data"] = raw_data
            
            return parsed_data
            
        except Exception as e:
            logger.error(f"Error parsing JSON data: {e}")
            return None

class CustomDelimitedParser(DataParserBase):
    """
    Configurable parser for custom delimited data
    Allows specification of delimiter and field mapping
    """
    
    def __init__(self, delimiter: str = '|', field_names: List[str] = None):
        self.format_name = f"CUSTOM_DELIMITED_{delimiter}"
        self.delimiter = delimiter
        self.field_names = field_names or []
    
    def get_format_name(self) -> str:
        return self.format_name
    
    def validate_format(self, raw_data: str) -> bool:
        """Check if data contains the expected delimiter"""
        return self.delimiter in raw_data
    
    def parse(self, raw_data: str) -> Optional[Dict[str, Any]]:
        """Parse custom delimited data"""
        try:
            if not self.validate_format(raw_data):
                return None
            
            parts = raw_data.strip().split(self.delimiter)
            parsed_data = {}
            
            for i, value in enumerate(parts):
                field_name = self.field_names[i] if i < len(self.field_names) else f"field_{i}"
                parsed_data[field_name] = value.strip()
            
            # Add metadata
            parsed_data["_parser"] = self.format_name
            parsed_data["_timestamp_parsed"] = datetime.now().isoformat()
            parsed_data["_raw_data"] = raw_data
            
            return parsed_data
            
        except Exception as e:
            logger.error(f"Error parsing custom delimited data: {e}")
            return None

class DataParserManager:
    """
    Manager class that handles multiple parser types and automatically
    detects the appropriate parser for incoming data
    """
    
    def __init__(self):
        self.parsers: List[DataParserBase] = []
        self.active_parser: Optional[DataParserBase] = None
        self.auto_detect = True
        self.data_callbacks: List[Callable[[Dict[str, Any]], None]] = []
        
        # Register default parsers
        self.register_parser(ArmedStateTelemetryParser())
        self.register_parser(SentinelTelemetryParser())
        self.register_parser(NMEAParser())
        self.register_parser(JSONParser())
    
    def register_parser(self, parser: DataParserBase):
        """Register a new parser"""
        self.parsers.append(parser)
        logger.info(f"Registered parser: {parser.get_format_name()}")
    
    def set_active_parser(self, parser_name: str):
        """Set a specific parser as active (disables auto-detection)"""
        for parser in self.parsers:
            if parser.get_format_name() == parser_name:
                self.active_parser = parser
                self.auto_detect = False
                logger.info(f"Set active parser: {parser_name}")
                return True
        
        logger.warning(f"Parser not found: {parser_name}")
        return False
    
    def enable_auto_detection(self):
        """Enable automatic parser detection"""
        self.auto_detect = True
        self.active_parser = None
        logger.info("Enabled automatic parser detection")
    
    def add_data_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """Add a callback function to be called when data is parsed"""
        self.data_callbacks.append(callback)
    
    def parse_data(self, raw_data: str) -> Optional[Dict[str, Any]]:
        """Parse raw data using the appropriate parser"""
        if not raw_data.strip():
            return None
        
        parsed_data = None
        
        if self.auto_detect:
            # Try each parser until one succeeds
            for parser in self.parsers:
                if parser.validate_format(raw_data):
                    parsed_data = parser.parse(raw_data)
                    if parsed_data:
                        logger.debug(f"Data parsed using: {parser.get_format_name()}")
                        break
        else:
            # Use the active parser
            if self.active_parser:
                parsed_data = self.active_parser.parse(raw_data)
        
        # Call registered callbacks if parsing was successful
        if parsed_data:
            for callback in self.data_callbacks:
                try:
                    callback(parsed_data)
                except Exception as e:
                    logger.error(f"Error in data callback: {e}")
        
        return parsed_data
    
    def get_available_parsers(self) -> List[str]:
        """Get list of available parser names"""
        return [parser.get_format_name() for parser in self.parsers]
    
    def get_parser_info(self) -> Dict[str, Any]:
        """Get information about the current parser configuration"""
        return {
            "available_parsers": self.get_available_parsers(),
            "active_parser": self.active_parser.get_format_name() if self.active_parser else None,
            "auto_detect": self.auto_detect,
            "callback_count": len(self.data_callbacks)
        }

# Global parser manager instance
parser_manager = DataParserManager()

def process_serial_data(port: str, raw_data: str) -> Optional[Dict[str, Any]]:
    """
    Main function to process incoming serial data
    This function should be called from the serial operations module
    """
    try:
        # Parse the data
        parsed_data = parser_manager.parse_data(raw_data)
        
        if parsed_data:
            # Add port information
            parsed_data["_source_port"] = port
            logger.debug(f"Processed data from port {port}: {len(str(parsed_data))} chars")
        
        return parsed_data
        
    except Exception as e:
        logger.error(f"Error processing serial data from port {port}: {e}")
        return None

# Configuration functions for easy modification
def configure_sentinel_parser(field_mapping: Dict[int, str] = None):
    """Configure the SENTINEL telemetry parser with custom field mapping"""
    if field_mapping:
        for parser in parser_manager.parsers:
            if isinstance(parser, SentinelTelemetryParser):
                parser.field_mapping.update(field_mapping)
                logger.info("Updated SENTINEL parser field mapping")
                break

def add_custom_parser(delimiter: str, field_names: List[str], parser_name: str = None):
    """Add a custom delimited parser"""
    custom_parser = CustomDelimitedParser(delimiter, field_names)
    if parser_name:
        custom_parser.format_name = parser_name
    parser_manager.register_parser(custom_parser)
    logger.info(f"Added custom parser: {custom_parser.get_format_name()}")

# Example usage and configuration
if __name__ == "__main__":
    pass
