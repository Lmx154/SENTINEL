// src/components/Sidebar.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from "../utils";
import { motion, useMotionValue, AnimatePresence } from "framer-motion";
import Logo from "../assets/Logo.png";
import { useSerialPorts, useLiveDataStream } from './ControlsWebSocket';
import { wsClient } from '../utils/websocketClient.js';

function Sidebar({ isRunning, latestPacket, setIsRunning, onSystemReset }) {
    const [activeTab, setActiveTab] = useState("console");
    const mWidth = useMotionValue(window.innerWidth / 4.5);
    const [consoleArray, setConsoleArray] = useState([]);
    const initialized = useRef(false);
    const { ports, selectedPort, setSelectedPort, refreshPorts, openPort, closePort } = useSerialPorts(setConsoleArray, isRunning);
    const { startLiveStream, stopLiveStream, systemCheck } = useLiveDataStream(setIsRunning, setConsoleArray);
    
    // Command interface state
    const [selectedState, setSelectedState] = useState("IDLE");
    const [selectedCommand, setSelectedCommand] = useState("");
    const [commandParameters, setCommandParameters] = useState({
        threshold: "200" // Default threshold for altitude tests
    });const [loraSettings, setLoraSettings] = useState({
        frequency: "915.0",
        spreadingFactor: "7",
        bandwidth: "250.0",
        codingRate: "5",
        outputPower: "17",
        syncWord: "0xAB",
        fcAddress: "0xA2",
        gsAddress: "0xA1",
        preambleLength: "8"
    });    const [parserSettings, setParserSettings] = useState({
        availableParsers: [],
        activeParser: null,
        autoDetect: true,
        customDelimiter: "|",
        customFields: "field1,field2,field3"
    });

    // Flight controller states and available commands
    const flightControllerStates = {
        IDLE: ["ARM", "ENTER_TEST", "DISARM", "QUERY", "NAVC_RESET_STATS"],
        TEST: ["ARM", "DISARM", "QUERY", "TEST", "SERVO_TEST", "ALTITUDE_TEST", "ENABLE_ALTITUDE_TEST", "DISABLE_ALTITUDE_TEST", "NAVC_RESET_STATS"],
        ARMED: ["DISARM", "ENTER_RECOVERY", "QUERY", "NAVC_RESET_STATS"],
        RECOVERY: ["DISARM", "QUERY", "NAVC_RESET_STATS"]
    };

    // Commands that require parameters
    const commandsWithParameters = ["ALTITUDE_TEST", "ENABLE_ALTITUDE_TEST"];

    const handleSettingChange = (setting, value) => {
        setLoraSettings(prev => ({ ...prev, [setting]: value }));
        setConsoleArray(prev => [...prev, `Setting ${setting} changed to ${value}`]);
    };

    const loadParserInfo = async () => {
        try {
            const info = await wsClient.getParserInfo();
            if (info) {
                setParserSettings(prev => ({
                    ...prev,
                    availableParsers: info.available_parsers || [],
                    activeParser: info.active_parser,
                    autoDetect: info.auto_detect
                }));
                setConsoleArray(prev => [...prev, `Parser info loaded: ${info.available_parsers?.length || 0} parsers available`]);
            }
        } catch (error) {
            setConsoleArray(prev => [...prev, `Failed to load parser info: ${error.message}`]);
        }
    };

    const handleParserChange = async (parserName) => {
        try {
            const result = await wsClient.setActiveParser(parserName);
            setParserSettings(prev => ({ ...prev, activeParser: parserName, autoDetect: false }));
            setConsoleArray(prev => [...prev, `Parser changed to: ${parserName}`]);
        } catch (error) {
            setConsoleArray(prev => [...prev, `Failed to change parser: ${error.message}`]);
        }
    };

    const handleEnableAutoDetection = async () => {
        try {
            await wsClient.enableAutoDetection();
            setParserSettings(prev => ({ ...prev, autoDetect: true, activeParser: null }));
            setConsoleArray(prev => [...prev, "Auto-detection enabled"]);
        } catch (error) {
            setConsoleArray(prev => [...prev, `Failed to enable auto-detection: ${error.message}`]);
        }
    };

    const handleAddCustomParser = async () => {
        try {
            const fieldNames = parserSettings.customFields.split(',').map(f => f.trim());
            const result = await wsClient.addCustomParser(
                parserSettings.customDelimiter, 
                fieldNames, 
                `CUSTOM_${parserSettings.customDelimiter}`
            );
            setConsoleArray(prev => [...prev, `Custom parser added: ${result}`]);
            await loadParserInfo(); // Refresh parser list
        } catch (error) {
            setConsoleArray(prev => [...prev, `Failed to add custom parser: ${error.message}`]);
        }
    };

    const tabContentVariants = {
        enter: { x: 20, opacity: 0 },
        center: { x: 0, opacity: 1 },
        exit: { x: -20, opacity: 0 },
    };    useEffect(() => {
        if (!initialized.current) {
            setConsoleArray((prev) => [...prev, `Initializing system...`]);
            loadParserInfo(); // Load parser info on component mount
            initialized.current = true;
        }
    }, []);

    function updateWidthAndHeight() {
        mWidth.set(window.innerWidth / 4.5);
    }

    const handleDrag = useCallback((event, info) => {
        const newWidth = mWidth.get() - info.delta.x;
        if (newWidth >= window.innerWidth / 4.5) {
            mWidth.set(newWidth);
        } else {
            mWidth.set(window.innerWidth / 4.5);
        }
    }, []);

    useEffect(() => {
        window.addEventListener("resize", updateWidthAndHeight);
        return () => window.removeEventListener("resize", updateWidthAndHeight);
    }, []);

    const handleStartStream = async () => {
        if (isRunning) {
            setConsoleArray(prev => [...prev, "Stream already running..."]);
            return;
        }
        const openResult = await openPort();
        if (openResult.success) {
            await startLiveStream();
        }
    };

    const handleStopStream = async () => {
        await stopLiveStream();
        await closePort();
    };

    const handleBuzzer = () => {
        setConsoleArray(prev => [...prev, "Activating buzzer..."]);
    };

    const handlePressureValve = () => {
        setConsoleArray(prev => [...prev, "Activating pressure valve..."]);
    };    const handleApplySettings = () => {
        setConsoleArray(prev => [...prev, "Applying LoRa settings..."]);
    };

    // Command execution handlers
    const handleStateChange = (newState) => {
        setSelectedState(newState);
        setSelectedCommand(""); // Reset command when state changes
    };

    const buildCommandString = (command) => {
        let commandStr = `<CMD:${command}`;
        
        // Add parameters for commands that require them
        if (commandsWithParameters.includes(command)) {
            if (command === "ALTITUDE_TEST" || command === "ENABLE_ALTITUDE_TEST") {
                commandStr += `:threshold=${commandParameters.threshold}`;
            }
        }
        
        commandStr += '>';
        return commandStr;
    };

    const handleExecuteCommand = async () => {
        if (!selectedCommand) {
            setConsoleArray(prev => [...prev, "No command selected"]);
            return;
        }

        if (!selectedPort) {
            setConsoleArray(prev => [...prev, "No serial port selected. Please select a port in the Controls tab."]);
            return;
        }

        try {
            const commandString = buildCommandString(selectedCommand);
            setConsoleArray(prev => [...prev, `Executing command: ${commandString}`]);
            
            const result = await wsClient.writeSerial(commandString);
            setConsoleArray(prev => [...prev, `Command result: ${result}`]);
        } catch (error) {
            setConsoleArray(prev => [...prev, `Command failed: ${error.message}`]);
        }
    };

    return (
        <motion.div
            className="h-full bg-gray-100 border-l-2 border-gray-300 flex flex-col font-mono relative text-black"
            style={{ width: mWidth }}
        >
            <motion.div
                className="absolute h-full w-3 cursor-col-resize bg-gray-200"
                drag="x"
                dragElastic={0}
                dragMomentum={false}
                dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                onDrag={handleDrag}
                onDoubleClick={() => mWidth.set(window.innerWidth / 4.5)}
            />            <ul className="w-full h-10 border-b-2 border-gray-300 flex flex-row items-center text-gray-500 relative">
                {["console", "controls", "command", "settings"].map((tab) => (
                    <li key={tab} className="h-full">
                        <button
                            onClick={() => setActiveTab(tab)}
                            className={cn("px-3 h-full flex justify-center items-center uppercase relative", {
                                "text-black": activeTab === tab
                            })}
                        >
                            <p className='z-10'>{tab}</p>
                            {activeTab === tab && (
                                <motion.div
                                    className="absolute bottom-0 left-0 right-0 h-full bg-gray-200"
                                    layoutId="activeTab"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                />
                            )}
                        </button>
                    </li>
                ))}
            </ul>

            <div className="relative flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                    {activeTab === "console" && (
                        <motion.div
                            key="console"
                            variants={tabContentVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0"
                        >
                            <textarea 
                                readOnly 
                                value={consoleArray.map((line) => "> " + line).join("\n")} 
                                className="bg-gray-200 resize-none max-h-full h-full p-3 text-green-500 overflow-y-scroll overflow-x-hidden no-scrollbar focus:outline-none w-full" 
                            />
                        </motion.div>
                    )}

                    {activeTab === "controls" && (
                        <motion.div
                            key="controls"
                            variants={tabContentVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0"
                        >
                            <div className="flex flex-col gap-2 p-4">
                                <div className="flex flex-row gap-2">                                    <select 
                                        className="flex-1 bg-gray-200 text-gray-700 py-2 px-4"
                                        value={selectedPort}
                                        onChange={(e) => setSelectedPort(e.target.value)}
                                    >
                                        <option value="" disabled>Select a port</option>
                                        {ports.map(port => (
                                            <option key={port.port || port} value={port.port || port}>
                                                {port.port || port} {port.description ? `- ${port.description}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <button 
                                        onClick={refreshPorts}
                                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4"
                                    >
                                        ⟳
                                    </button>
                                </div>

                                <div className="flex flex-row gap-2">
                                    <button 
                                        onClick={handleStartStream}
                                        disabled={!selectedPort || isRunning}
                                        className={cn(
                                            "flex-1 py-2 px-4",
                                            selectedPort && !isRunning
                                                ? "bg-gray-200 hover:bg-gray-300 text-gray-700" 
                                                : "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        )}
                                    >
                                        Start Stream
                                    </button>
                                    <button 
                                        onClick={handleStopStream}
                                        disabled={!isRunning}
                                        className={cn(
                                            "flex-1 py-2 px-4",
                                            isRunning
                                                ? "bg-gray-200 hover:bg-gray-300 text-gray-700" 
                                                : "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        )}
                                    >
                                        Stop Stream
                                    </button>
                                </div>

                                <button 
                                    onClick={onSystemReset}
                                    disabled={isRunning}
                                    className={cn(
                                        "w-full py-2 px-4",
                                        isRunning
                                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                            : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                                    )}
                                >
                                    System Reset
                                </button>
                            </div>                        </motion.div>
                    )}

                    {activeTab === "command" && (
                        <motion.div
                            key="command"
                            variants={tabContentVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0 overflow-y-auto"
                        >
                            <div className="flex flex-col gap-3 p-4 text-gray-700">
                                <h2 className="text-lg font-semibold text-black">Flight Controller Commands</h2>
                                
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-sm">Flight Controller State</label>
                                        <select 
                                            className="bg-gray-200 py-2 px-3 text-gray-700"
                                            value={selectedState}
                                            onChange={(e) => {
                                                setSelectedState(e.target.value);
                                                setSelectedCommand(""); // Reset command when state changes
                                            }}
                                        >
                                            {Object.keys(flightControllerStates).map(state => (
                                                <option key={state} value={state}>
                                                    {state}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-gray-500">
                                            Current state determines available commands
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-1">
                                        <label className="text-sm">Available Commands</label>
                                        <select 
                                            className="bg-gray-200 py-2 px-3 text-gray-700"
                                            value={selectedCommand}
                                            onChange={(e) => setSelectedCommand(e.target.value)}
                                        >
                                            <option value="" disabled>Select a command</option>
                                            {flightControllerStates[selectedState].map(command => (
                                                <option key={command} value={command}>
                                                    {command}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-gray-500">
                                            Commands available in {selectedState} state
                                        </p>
                                    </div>

                                    {/* Parameter input for commands that need them */}
                                    {selectedCommand && commandsWithParameters.includes(selectedCommand) && (
                                        <div className="flex flex-col gap-1">
                                            <label className="text-sm">Threshold (cm)</label>
                                            <input 
                                                type="number" 
                                                min="1"
                                                max="30000"
                                                value={commandParameters.threshold}
                                                onChange={(e) => setCommandParameters(prev => ({ 
                                                    ...prev, 
                                                    threshold: e.target.value 
                                                }))}
                                                className="bg-gray-200 py-2 px-3 text-gray-700"
                                                placeholder="200"
                                            />
                                            <p className="text-xs text-gray-500">
                                                Altitude threshold for {selectedCommand} (1-30000 cm)
                                            </p>
                                        </div>
                                    )}

                                    {/* Command preview */}
                                    {selectedCommand && (
                                        <div className="bg-gray-300 p-3 rounded">
                                            <h3 className="text-sm font-semibold text-black mb-1">Command Preview:</h3>
                                            <code className="text-xs font-mono text-gray-800">
                                                {commandsWithParameters.includes(selectedCommand) 
                                                    ? `<CMD:${selectedCommand}:threshold=${commandParameters.threshold}>`
                                                    : `<CMD:${selectedCommand}>`
                                                }
                                            </code>
                                        </div>
                                    )}

                                    {/* Execute button */}
                                    <button
                                        onClick={handleExecuteCommand}
                                        disabled={!selectedCommand || !selectedPort || !isRunning}
                                        className={cn(
                                            "w-full py-3 px-4 mt-2 font-semibold",
                                            selectedCommand && selectedPort && isRunning
                                                ? "bg-red-500 hover:bg-red-600 text-white"
                                                : "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        )}
                                    >
                                        {!selectedCommand ? "Select a command" : 
                                         !selectedPort ? "No port selected" : 
                                         !isRunning ? "Start stream first" : 
                                         "Execute Command"}
                                    </button>

                                    {/* Command descriptions */}
                                    <div className="border-t border-gray-300 pt-3">
                                        <h3 className="text-sm font-semibold text-black mb-2">Command Descriptions</h3>
                                        <div className="text-xs text-gray-600 space-y-2">
                                            <div>
                                                <strong>ARM:</strong> Transition to ARMED state (full sensors active)
                                            </div>
                                            <div>
                                                <strong>DISARM:</strong> Transition to IDLE state (sensors inactive)
                                            </div>
                                            <div>
                                                <strong>ENTER_TEST:</strong> Transition to TEST state (diagnostics)
                                            </div>
                                            <div>
                                                <strong>ENTER_RECOVERY:</strong> Transition to RECOVERY state (GPS only)
                                            </div>
                                            <div>
                                                <strong>QUERY:</strong> Query current flight controller state
                                            </div>
                                            <div>
                                                <strong>TEST:</strong> Send buzzer test signal to NAVC
                                            </div>
                                            <div>
                                                <strong>SERVO_TEST:</strong> Test servo movement (0° → 90° → 0°)
                                            </div>
                                            <div>
                                                <strong>ALTITUDE_TEST:</strong> One-time altitude threshold test
                                            </div>
                                            <div>
                                                <strong>ENABLE_ALTITUDE_TEST:</strong> Enable background altitude monitoring
                                            </div>
                                            <div>
                                                <strong>DISABLE_ALTITUDE_TEST:</strong> Disable background altitude monitoring
                                            </div>
                                            <div>
                                                <strong>NAVC_RESET_STATS:</strong> Reset navigation computer statistics
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "settings" && (
                        <motion.div
                            key="settings"
                            variants={tabContentVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0 overflow-y-auto"
                        >
                            <div className="flex flex-col gap-3 p-4 text-gray-700">
                                <h2 className="text-lg font-semibold text-black">LoRa Settings</h2>
                                
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm">Frequency (MHz)</label>
                                    <select 
                                        className="bg-gray-200 py-2 px-3 text-gray-700"
                                        value={loraSettings.frequency}
                                        onChange={(e) => handleSettingChange('frequency', e.target.value)}
                                        disabled={isRunning}
                                    >
                                        <option value="868.0">868.0 MHz (Europe)</option>
                                        <option value="915.0">915.0 MHz (North America)</option>
                                        <option value="433.0">433.0 MHz (Asia)</option>
                                    </select>
                                    <p className="text-xs text-gray-500">Range: 862.0–928.0 MHz (region specific)</p>
                                </div>
                                
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm">Spreading Factor</label>
                                    <select 
                                        className="bg-gray-200 py-2 px-3 text-gray-700"
                                        value={loraSettings.spreadingFactor}
                                        onChange={(e) => handleSettingChange('spreadingFactor', e.target.value)}
                                        disabled={isRunning}
                                    >
                                        {[6, 7, 8, 9, 10, 11, 12].map(sf => (
                                            <option key={sf} value={sf.toString()}>SF{sf} {sf === 7 ? '(Default - Fast)' : sf === 12 ? '(Slow, Long Range)' : ''}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500">Lower = faster, Higher = longer range</p>
                                </div>
                                
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm">Bandwidth (kHz)</label>
                                    <select 
                                        className="bg-gray-200 py-2 px-3 text-gray-700"
                                        value={loraSettings.bandwidth}
                                        onChange={(e) => handleSettingChange('bandwidth', e.target.value)}
                                        disabled={isRunning}
                                    >
                                        <option value="125.0">125 kHz (Long Range)</option>
                                        <option value="250.0">250 kHz (Default - Balanced)</option>
                                        <option value="500.0">500 kHz (High Speed)</option>
                                    </select>
                                    <p className="text-xs text-gray-500">Wider = faster, Narrower = better sensitivity</p>
                                </div>
                                
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm">Coding Rate</label>
                                    <select 
                                        className="bg-gray-200 py-2 px-3 text-gray-700"
                                        value={loraSettings.codingRate}
                                        onChange={(e) => handleSettingChange('codingRate', e.target.value)}
                                        disabled={isRunning}
                                    >
                                        <option value="5">4/5 (Default - Less Robust)</option>
                                        <option value="6">4/6</option>
                                        <option value="7">4/7</option>
                                        <option value="8">4/8 (Most Robust)</option>
                                    </select>
                                    <p className="text-xs text-gray-500">Higher = more error correction</p>
                                </div>
                                
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm">Output Power (dBm): {loraSettings.outputPower}</label>
                                    <input 
                                        type="range" 
                                        min="2" 
                                        max="20" 
                                        value={loraSettings.outputPower}
                                        onChange={(e) => handleSettingChange('outputPower', e.target.value)}
                                        className="bg-gray-200"
                                        disabled={isRunning}
                                    />
                                    <p className="text-xs text-gray-500">Range: 2–20 dBm (higher = longer range)</p>
                                </div>
                                
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm">Sync Word (hex)</label>
                                    <input 
                                        type="text" 
                                        value={loraSettings.syncWord}
                                        onChange={(e) => handleSettingChange('syncWord', e.target.value)}
                                        className="bg-gray-200 py-2 px-3 text-gray-700"
                                        placeholder="0xAB"
                                        disabled={isRunning}
                                    />
                                    <p className="text-xs text-gray-500">Must match between devices</p>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-sm">FC Address (hex)</label>
                                        <input 
                                            type="text" 
                                            value={loraSettings.fcAddress}
                                            onChange={(e) => handleSettingChange('fcAddress', e.target.value)}
                                            className="bg-gray-200 py-2 px-3 text-gray-700"
                                            placeholder="0xA2"
                                            disabled={isRunning}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-sm">GS Address (hex)</label>
                                        <input 
                                            type="text" 
                                            value={loraSettings.gsAddress}
                                            onChange={(e) => handleSettingChange('gsAddress', e.target.value)}
                                            className="bg-gray-200 py-2 px-3 text-gray-700"
                                            placeholder="0xA1"
                                            disabled={isRunning}
                                        />
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-1">
                                    <label className="text-sm">Preamble Length</label>
                                    <input 
                                        type="number" 
                                        min="6"
                                        max="65535"
                                        value={loraSettings.preambleLength}
                                        onChange={(e) => handleSettingChange('preambleLength', e.target.value)}
                                        className="bg-gray-200 py-2 px-3 text-gray-700"
                                        disabled={isRunning}
                                    />
                                    <p className="text-xs text-gray-500">Range: 6–65535 symbols</p>
                                </div>
                                
                                <button
                                    onClick={handleApplySettings}
                                    disabled={isRunning}
                                    className={cn(
                                        "w-full py-2 px-4 mt-2",
                                        isRunning
                                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                            : "bg-gray-400 hover:bg-gray-500 text-black"
                                    )}
                                >
                                    Apply Settings
                                </button>
                                  <div className="border-t border-gray-300 my-2 pt-4">
                                    <h2 className="text-lg font-semibold text-black mb-3">Control Systems</h2>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={handleBuzzer}
                                            className="bg-yellow-600 hover:bg-yellow-700 text-white py-3 px-4"
                                        >
                                            Activate Buzzer
                                        </button>
                                        <button
                                            onClick={handlePressureValve}
                                            className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-4"
                                        >
                                            Pressure Valve
                                        </button>
                                    </div>
                                </div>

                                <div className="border-t border-gray-300 my-2 pt-4">
                                    <h2 className="text-lg font-semibold text-black mb-3">Data Parser Settings</h2>
                                    
                                    <div className="flex flex-col gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-sm">Parser Mode</label>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleEnableAutoDetection}
                                                    className={cn(
                                                        "flex-1 py-2 px-3 text-sm",
                                                        parserSettings.autoDetect
                                                            ? "bg-green-500 text-white"
                                                            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                                    )}
                                                >
                                                    Auto-Detect
                                                </button>
                                                <button
                                                    onClick={loadParserInfo}
                                                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3"
                                                    title="Refresh parser info"
                                                >
                                                    ⟳
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                {parserSettings.autoDetect ? "Automatically detects data format" : "Using fixed parser"}
                                            </p>
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <label className="text-sm">Active Parser</label>
                                            <select 
                                                className="bg-gray-200 py-2 px-3 text-gray-700"
                                                value={parserSettings.activeParser || ""}
                                                onChange={(e) => handleParserChange(e.target.value)}
                                                disabled={parserSettings.autoDetect}
                                            >
                                                <option value="" disabled>Select a parser</option>
                                                {parserSettings.availableParsers.map(parser => (
                                                    <option key={parser} value={parser}>
                                                        {parser.replace('_', ' ')}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-gray-500">
                                                Current: {parserSettings.activeParser || "Auto-Detection"}
                                            </p>
                                        </div>

                                        <div className="border-t border-gray-300 pt-3">
                                            <h3 className="text-sm font-semibold text-black mb-2">Add Custom Parser</h3>
                                            
                                            <div className="flex flex-col gap-2">
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs">Delimiter</label>
                                                    <input 
                                                        type="text" 
                                                        value={parserSettings.customDelimiter}
                                                        onChange={(e) => setParserSettings(prev => ({ ...prev, customDelimiter: e.target.value }))}
                                                        className="bg-gray-200 py-1 px-2 text-gray-700 text-sm"
                                                        placeholder="|"
                                                        maxLength={5}
                                                    />
                                                </div>
                                                
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-xs">Field Names (comma-separated)</label>
                                                    <input 
                                                        type="text" 
                                                        value={parserSettings.customFields}
                                                        onChange={(e) => setParserSettings(prev => ({ ...prev, customFields: e.target.value }))}
                                                        className="bg-gray-200 py-1 px-2 text-gray-700 text-sm"
                                                        placeholder="field1,field2,field3"
                                                    />
                                                </div>
                                                
                                                <button
                                                    onClick={handleAddCustomParser}
                                                    className="bg-gray-400 hover:bg-gray-500 text-black py-1 px-2 text-sm"
                                                >
                                                    Add Custom Parser
                                                </button>
                                            </div>
                                        </div>

                                        <div className="text-xs text-gray-500 mt-2">
                                            <p><strong>Available Formats:</strong></p>
                                            <ul className="list-disc list-inside text-xs space-y-1">
                                                <li>SENTINEL_TELEMETRY: CSV format for rocket data</li>
                                                <li>NMEA_GPS: Standard GPS data format</li>
                                                <li>JSON: JavaScript Object Notation</li>
                                                <li>CUSTOM: User-defined delimited format</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex flex-col px-4 py-2 gap-1 flex-1">
                <h2 className="uppercase text-lg text-gray-500">Live Data</h2>
                <div className="flex flex-row justify-between">
                    <p>Timestamp</p>
                    <p>{latestPacket.timestamp || "0000-00-00 00:00:00"}</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Satellites</p>
                    <p>{latestPacket.satellites || 0}</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Altitude (BMP)</p>
                    <p>{latestPacket.alt_bmp?.toFixed(2) || "0.00"} m</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Pressure</p>
                    <p>{latestPacket.pressure?.toFixed(2) || "0.00"} hPa</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Temperature</p>
                    <p>{latestPacket.temp?.toFixed(2) || "0.00"} °C</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Acceleration (X Axis)</p>
                    <p>{latestPacket.accel_x?.toFixed(2) || "0.00"} m/s<sup>2</sup></p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Acceleration (Y Axis)</p>
                    <p>{latestPacket.accel_y?.toFixed(2) || "0.00"} m/s<sup>2</sup></p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Acceleration (Z Axis)</p>
                    <p>{latestPacket.accel_z?.toFixed(2) || "0.00"} m/s<sup>2</sup></p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Gyro (X Axis)</p>
                    <p>{latestPacket.gyro_x?.toFixed(2) || "0.00"} °</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Gyro (Y Axis)</p>
                    <p>{latestPacket.gyro_y?.toFixed(2) || "0.00"} °</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Gyro (Z Axis)</p>
                    <p>{latestPacket.gyro_z?.toFixed(2) || "0.00"} °</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Longitude</p>
                    <p>{latestPacket.longitude?.toFixed(7) || "0.00"}</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Latitude</p>
                    <p>{latestPacket.latitude?.toFixed(7) || "0.00"}</p>
                </div>
                <div className="flex flex-row justify-between">
                    <p>Altitude (GPS)</p>
                    <p>{latestPacket.alt_gps?.toFixed(2) || "0.00"} m</p>
                </div>
            </div>

            <img src={Logo} width={64} height={64} className="absolute bottom-[10px] right-[10px]" />
        </motion.div>
    );
}

export default Sidebar;