// src/App.jsx
import "./App.css";
import StatusBar from "./components/StatusBar";
import Sidebar from "./components/Sidebar";
import 'leaflet/dist/leaflet.css';
import FlightTrajectory from "./components/FlightTrajectory";
import Graphs from "./components/Graphs";
import Orientation from "./components/Orientation";
import Map from "./components/Map";
import { useState, useEffect } from 'react';

function App() {  const [latestPacket, setLatestPacket] = useState({
    packet_id: 0,
    timestamp: "0000-00-00 00:00:00",
    accel_x: 0,
    accel_y: 0,
    accel_z: 0,
    gyro_x: 0,
    gyro_y: 0,
    gyro_z: 0,
    gyro_raw_x: 0,
    gyro_raw_y: 0,
    gyro_raw_z: 0,
    orientation_roll: 0,
    orientation_pitch: 0,
    orientation_yaw: 0,
    quaternion_w: 1,
    quaternion_x: 0,
    quaternion_y: 0,
    quaternion_z: 0,
    temp: 0,
    pressure: 0,
    alt_bmp: 0,
    mag_x: 0,
    mag_y: 0,
    mag_z: 0,
    latitude: 0,
    longitude: 0,
    satellites: 0,
    alt_gps: 0,
  });const [packets, setPackets] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [packetReceived, setPacketReceived] = useState(false);

  // Helper function to format timestamp for charts
  const formatChartTimestamp = (timestamp) => {
    if (!timestamp) return new Date().toLocaleTimeString();
    
    try {
      // Try to parse the timestamp
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        // If parsing fails, try to extract time from string format like "2023-05-27 11:43:46"
        const timeMatch = timestamp.match(/(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
          return `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`;
        }
        return new Date().toLocaleTimeString();
      }
      return date.toLocaleTimeString();
    } catch {
      return new Date().toLocaleTimeString();
    }
  };

  const handleSystemReset = () => {
    setPackets([]);    setLatestPacket({
      packet_id: 0,
      timestamp: "0000-00-00 00:00:00",
      accel_x: 0,
      accel_y: 0,
      accel_z: 0,
      gyro_x: 0,
      gyro_y: 0,
      gyro_z: 0,
      gyro_raw_x: 0,
      gyro_raw_y: 0,
      gyro_raw_z: 0,
      orientation_roll: 0,
      orientation_pitch: 0,
      orientation_yaw: 0,
      quaternion_w: 1,
      quaternion_x: 0,
      quaternion_y: 0,
      quaternion_z: 0,
      temp: 0,
      pressure: 0,
      alt_bmp: 0,
      mag_x: 0,
      mag_y: 0,
      mag_z: 0,
      latitude: 0,
      longitude: 0,
      satellites: 0,
      alt_gps: 0,
    });
  };  useEffect(() => {
    // Listen for telemetry data from WebSocket client
    const handleTelemetryPacket = (event) => {
      console.log('App.jsx received telemetry-packet event:', event);
      const packet = event.detail.payload;
      console.log('Packet payload:', packet);
      
      // Limit the packets array to the last 100 packets to prevent performance issues
      setPackets(prev => {
        const newPackets = [...prev, packet];
        return newPackets.length > 100 ? newPackets.slice(-100) : newPackets;
      });
      
      setLatestPacket(packet);
      setPacketReceived(true);
      setIsRunning(true);
    };

    const handleSerialDisconnected = (event) => {
      setIsRunning(false);
    };

    // Add event listeners for custom events
    window.addEventListener('telemetry-packet', handleTelemetryPacket);
    window.addEventListener('serial-disconnected', handleSerialDisconnected);

    return () => {
      window.removeEventListener('telemetry-packet', handleTelemetryPacket);
      window.removeEventListener('serial-disconnected', handleSerialDisconnected);
    };
  }, []);

  return (
    <main id="main" className="w-screen h-screen bg-gray-100 flex flex-col text-black">
      <StatusBar
        timestamp={latestPacket.timestamp}
        satellites={latestPacket.satellites}
      />

      <div className="flex flex-row h-full font-mono overflow-hidden">
        <div className="flex-1 flex flex-col p-2 gap-2">
          <div className="flex flex-row gap-2 w-full h-[55%] min-h-0">            <Map
              markers={packets
                .filter(packet => {
                  // Filter out invalid GPS coordinates (1,1 means no GPS lock)
                  const lat = packet.latitude || packet.gps_lat_deg;
                  const lon = packet.longitude || packet.gps_lon_deg;
                  return lat && lon && 
                         Math.abs(lat) > 0.0001 && Math.abs(lon) > 0.0001 && // Not essentially 0,0
                         lat !== 1 && lon !== 1; // Not the no-lock indicator
                })
                .map(packet => ({
                  id: packet.packet_id,
                  position: [packet.latitude || packet.gps_lat_deg, packet.longitude || packet.gps_lon_deg]
                }))
              }
            />            <Orientation
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
          </div>

          <div className="flex flex-row gap-2 w-full flex-1 min-h-0">            <FlightTrajectory
              points={packets
                .filter(packet => {
                  // Filter out invalid GPS coordinates
                  const lat = packet.latitude || packet.gps_lat_deg;
                  const lon = packet.longitude || packet.gps_lon_deg;
                  return lat && lon && 
                         Math.abs(lat) > 0.0001 && Math.abs(lon) > 0.0001 &&
                         lat !== 1 && lon !== 1;
                })
                .map(packet => ({
                  id: packet.packet_id,
                  position: [packet.latitude || packet.gps_lat_deg, packet.longitude || packet.gps_lon_deg],
                  altitude: packet.alt_bmp || packet.altitude_m
                }))
              }
              packetRecieved={packetReceived}
              setPacketRecieved={setPacketReceived}
            />            <Graphs
              velocity={packets.map(packet => ({
                name: formatChartTimestamp(packet.timestamp),
                velocityX: 0, // Velocity data not available in current packet structure
                velocityY: 0,
                velocityZ: 0
              }))}
              acceleration={packets.map(packet => ({
                name: formatChartTimestamp(packet.timestamp),
                accelerationX: packet.accel_x,
                accelerationY: packet.accel_y,
                accelerationZ: packet.accel_z
              }))}              rotation={packets.map(packet => ({
                name: formatChartTimestamp(packet.timestamp),
                pitch: packet.orientation_pitch || packet.gyro_x,
                roll: packet.orientation_roll || packet.gyro_y,
                yaw: packet.orientation_yaw || packet.gyro_z,
              }))}
            />
          </div>
        </div>

        <Sidebar 
          isRunning={isRunning} 
          latestPacket={latestPacket}
          setIsRunning={setIsRunning}
          onSystemReset={handleSystemReset}
        />
      </div>
    </main>
  );
}

export default App;