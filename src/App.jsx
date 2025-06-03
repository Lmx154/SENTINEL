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

function App() {
  const [latestPacket, setLatestPacket] = useState({
    packet_id: 0,
    timestamp: "0000-00-00 00:00:00",
    accel_x: 0,
    accel_y: 0,
    accel_z: 0,
    gyro_x: 0,
    gyro_y: 0,
    gyro_z: 0,
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
  const [packets, setPackets] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [packetReceived, setPacketReceived] = useState(false);

  const handleSystemReset = () => {
    setPackets([]);
    setLatestPacket({
      packet_id: 0,
      timestamp: "0000-00-00 00:00:00",
      accel_x: 0,
      accel_y: 0,
      accel_z: 0,
      gyro_x: 0,
      gyro_y: 0,
      gyro_z: 0,
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
      setPackets(prev => [...prev, packet]);
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
            />
            <Orientation
              rotation={{
                pitch: latestPacket.gyro_x,
                yaw: latestPacket.gyro_z,
                roll: latestPacket.gyro_y,
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
            />
            <Graphs
              acceleration={packets.map(packet => ({
                name: packet.packet_id,
                accelerationX: packet.accel_x,
                accelerationY: packet.accel_y,
                accelerationZ: packet.accel_z
              }))}
              rotation={packets.map(packet => ({
                name: packet.packet_id,
                pitch: packet.gyro_x,
                yaw: packet.gyro_z,
                roll: packet.gyro_y,
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