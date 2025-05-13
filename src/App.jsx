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
import { listen } from '@tauri-apps/api/event';

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
  };

  useEffect(() => {
    const unlisten = [];

    async function setupListeners() {
      unlisten.push(
        await listen('telemetry-packet', event => {
          setPackets(prev => [...prev, event.payload]);
          setLatestPacket(event.payload);
          setPacketReceived(true);
          setIsRunning(true);
        })
      );

      unlisten.push(
        await listen('serial-disconnected', () => {
          setIsRunning(false);
        })
      );
    }

    setupListeners();
    return () => unlisten.forEach(fn => fn());
  }, []);

  return (
    <main id="main" className="w-screen h-screen bg-gray-100 flex flex-col text-black">
      <StatusBar
        timestamp={latestPacket.timestamp}
        satellites={latestPacket.satellites}
      />

      <div className="flex flex-row h-full font-mono overflow-hidden">
        <div className="flex-1 flex flex-col p-2 gap-2">
          <div className="flex flex-row gap-2 w-full h-[55%] min-h-0">
            <Map
              markers={packets.map(packet => ({
                id: packet.packet_id,
                position: [packet.latitude, packet.longitude]
              }))}
            />
            <Orientation
              rotation={{
                pitch: latestPacket.gyro_x,
                yaw: latestPacket.gyro_z,
                roll: latestPacket.gyro_y,
              }}
            />
          </div>

          <div className="flex flex-row gap-2 w-full flex-1 min-h-0">
            <FlightTrajectory
              points={packets.map(packet => ({
                id: packet.packet_id,
                position: [packet.latitude, packet.longitude],
                altitude: packet.alt_bmp
              }))}
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