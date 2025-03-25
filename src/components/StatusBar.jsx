// src/components/StatusBar.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Satellite, BatteryFull, SignalHigh, LayoutDashboard, ChevronDown } from 'lucide-react';
import { cn } from "../utils";

function StatusBar({ missionTime, satellites, connected, RSSI, battery, visibleElements = {}, toggleElement }) {
    const [showConsoleOutput] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);

    function secondsToHHMMSS(seconds) {
        const totalSeconds = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds;
        if (isNaN(totalSeconds)) return '00:00:00';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const secs = Math.floor(totalSeconds % 60);
        return [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0')
        ].join(':');
    }

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        }
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="w-full h-14 bg-gray-200 flex flex-row items-center justify-between px-4 border-b-2 border-gray-300 text-black" data-tauri-drag-region>
            <div className="flex flex-col items-center font-mono">
                <p className="text-gray-500">Mission Clock</p>
                <p>{secondsToHHMMSS(missionTime)}</p>
            </div>

            <div className="flex flex-col items-center font-mono">
                <p className="text-gray-500">Satellites</p>
                <div className="flex flex-row items-center gap-2">
                    <p>{satellites}</p>
                    <Satellite size={18} />
                </div>
            </div>

            <div className="flex flex-col items-center font-mono">
                <p className="text-gray-500">Status</p>
                <p className={cn("font-semibold", {
                    "text-red-600": !connected,
                    "text-green-600": connected
                })}>{connected ? "CONNECTED" : "DISCONNECTED"}</p>
            </div>

            <div className="flex flex-col items-center font-mono">
                <p className="text-gray-500">Signal</p>
                <div className="flex flex-row items-center gap-2">
                    <p>{Math.round(RSSI)} dBm</p>
                    <SignalHigh size={18} />
                </div>
            </div>

            <div className="flex flex-col items-center font-mono">
                <p className="text-gray-500">Battery</p>
                <div className="flex flex-row items-center gap-2">
                    <p>{Math.floor(battery)}%</p>
                    <BatteryFull size={18} />
                </div>
            </div>

            {/* UI Elements Menu */}
            <div className="relative" ref={menuRef}>
                <button 
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex items-center gap-1 bg-gray-300 hover:bg-gray-400 px-3 py-1.5 rounded"
                >
                    <LayoutDashboard size={16} />
                    <span>Layout</span>
                    <ChevronDown size={16} className={`transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isMenuOpen && (
                    <div className="absolute right-0 mt-1 w-48 bg-white shadow-lg rounded-md py-1 z-50 border border-gray-300">
                        <div className="py-1 px-3 text-sm font-medium text-gray-700 border-b border-gray-200">
                            Toggle UI Elements
                        </div>
                        {visibleElements && Object.entries(visibleElements).map(([key, isVisible]) => (
                            <label key={key} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={isVisible} 
                                    onChange={() => toggleElement(key)}
                                    className="mr-2"
                                />
                                <span className="text-gray-700">{key}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default StatusBar;