use std::io::Read;
use std::thread;
use std::time::Duration;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{State, AppHandle, Emitter};
use serde::Serialize;

use crate::serial_operations::SerialConnection;

/// Represents the data parsed directly from a single NAVC CSV message.
#[derive(Debug, Serialize, Clone)]
pub struct TelemetryData {
    pub timestamp: String,      // YYYY-MM-DD HH:MM:SS
    pub accel_x: f32,
    pub accel_y: f32,
    pub accel_z: f32,
    pub gyro_x: f32,        // Degrees
    pub gyro_y: f32,
    pub gyro_z: f32,
    pub temp: f32,          // Celsius
    pub pressure: f32,      // hPa
    pub alt_bmp: f32,       // Meters (from BMP)
    pub mag_x: f32,
    pub mag_y: f32,
    pub mag_z: f32,
    pub latitude: f64,      // Degrees
    pub longitude: f64,     // Degrees
    pub satellites: u32,    // Count
    pub alt_gps: f32,       // Meters (from GPS)
}

/// This is what the front end ultimately receives via event emission.
/// For now, it largely mirrors TelemetryData, adding a packet ID.
#[derive(Debug, Serialize, Clone)]
pub struct TelemetryPacket {
    pub packet_id: u32,     // Sequential ID assigned by this backend
    pub timestamp: String,
    pub accel_x: f32,
    pub accel_y: f32,
    pub accel_z: f32,
    pub gyro_x: f32,
    pub gyro_y: f32,
    pub gyro_z: f32,
    pub temp: f32,
    pub pressure: f32,
    pub alt_bmp: f32,
    pub mag_x: f32,
    pub mag_y: f32,
    pub mag_z: f32,
    pub latitude: f64,
    pub longitude: f64,
    pub satellites: u32,
    pub alt_gps: f32,
}

/// Parse a single, complete telemetry message (now expecting a raw CSV line) into our `TelemetryData` struct.
fn parse_telemetry(raw_message: &str) -> Option<TelemetryData> {
    // Split into fields
    let fields: Vec<&str> = raw_message.split(',').collect();

    // Expecting 17 fields for the new format
    if fields.len() != 17 {
        eprintln!("Expected 17 fields, got {}", fields.len());
        return None;
    }

    // Helper closure for parsing, returning default on error
    let parse_or_default = |s: &str, default: f32| -> f32 {
        s.trim().parse::<f32>().unwrap_or(default)
    };
    let parse_or_default_f64 = |s: &str, default: f64| -> f64 {
        s.trim().parse::<f64>().unwrap_or(default)
    };
    let parse_or_default_u32 = |s: &str, default: u32| -> u32 {
        s.trim().parse::<u32>().unwrap_or(default)
    };

    // Parse all fields into the struct
    Some(TelemetryData {
        timestamp: fields[0].trim().to_string(),
        accel_x: parse_or_default(fields[1], 0.0),
        accel_y: parse_or_default(fields[2], 0.0),
        accel_z: parse_or_default(fields[3], 0.0),
        gyro_x: parse_or_default(fields[4], 0.0),
        gyro_y: parse_or_default(fields[5], 0.0),
        gyro_z: parse_or_default(fields[6], 0.0),
        temp: parse_or_default(fields[7], 0.0),
        pressure: parse_or_default(fields[8], 0.0),
        alt_bmp: parse_or_default(fields[9], 0.0),
        mag_x: parse_or_default(fields[10], 0.0),
        mag_y: parse_or_default(fields[11], 0.0),
        mag_z: parse_or_default(fields[12], 0.0),
        latitude: parse_or_default_f64(fields[13], 0.0),
        longitude: parse_or_default_f64(fields[14], 0.0),
        satellites: parse_or_default_u32(fields[15], 0),
        alt_gps: parse_or_default(fields[16], 0.0),
    })
}

/// Convert raw `TelemetryData` into the final `TelemetryPacket` structure.
fn convert_to_packet(data: &TelemetryData, packet_id: u32) -> TelemetryPacket {
    // Map the new fields
    TelemetryPacket {
        packet_id, // Use the provided packet_id
        timestamp: data.timestamp.clone(),
        accel_x: data.accel_x,
        accel_y: data.accel_y,
        accel_z: data.accel_z,
        gyro_x: data.gyro_x,
        gyro_y: data.gyro_y,
        gyro_z: data.gyro_z,
        temp: data.temp,
        pressure: data.pressure,
        alt_bmp: data.alt_bmp,
        mag_x: data.mag_x,
        mag_y: data.mag_y,
        mag_z: data.mag_z,
        latitude: data.latitude,
        longitude: data.longitude,
        satellites: data.satellites,
        alt_gps: data.alt_gps,
    }
}

/// Spawns a background thread that reads from the currently open serial port,
/// parses each chunk of data, and emits it to the front end.
/// 
/// **Important**: The thread automatically stops when `close_serial` is invoked,
/// because that sets the shared `stop_flag`, and we check it each loop iteration.
#[tauri::command]
pub fn rt_parsed_stream(app_handle: AppHandle, serial_connection: State<'_, SerialConnection>) -> Result<(), String> {
    let connection = serial_connection.port.lock().unwrap();
    let mut port = match connection.as_ref() {
        Some(port) => port.try_clone().map_err(|e| e.to_string())?,
        None => return Err("No active serial connection".to_string()),
    };

    let stop_flag = serial_connection.stop_flag.clone();
    let packet_counter = Arc::new(AtomicU32::new(0));

    thread::spawn(move || {
        let mut serial_buf = vec![0u8; 1024];
        let mut accumulated_data = String::new();

        loop {
            if stop_flag.load(std::sync::atomic::Ordering::Relaxed) {
                eprintln!("rt_parsed_stream: stop_flag detected, exiting thread.");
                break;
            }

            // Add log before attempting read
            // eprintln!("rt_parsed_stream: Attempting port.read()...");
            match port.read(&mut serial_buf) {
                Ok(n) if n > 0 => {
                    let received_slice = &serial_buf[..n];
                    let received_string = String::from_utf8_lossy(received_slice);
                    // eprintln!("rt_parsed_stream: Received raw: {:?}", received_string);
                    accumulated_data.push_str(&received_string);

                    // Process complete lines separated by newline
                    while let Some(newline_idx) = accumulated_data.find('\n') {
                        // Extract the line, handling potential \r at the end
                        let line_end_idx = if newline_idx > 0 && accumulated_data.as_bytes()[newline_idx - 1] == b'\r' {
                            newline_idx - 1
                        } else {
                            newline_idx
                        };
                        let line = &accumulated_data[..line_end_idx];
                        
                        // Skip empty lines
                        if !line.is_empty() {
                             // eprintln!("rt_parsed_stream: Potential line: {:?}", line);
                            if let Some(parsed) = parse_telemetry(line) {
                                let current_count = packet_counter.fetch_add(1, Ordering::Relaxed);
                                let packet = convert_to_packet(&parsed, current_count + 1);
                                let _ = app_handle.emit("telemetry-packet", packet.clone());
                                let _ = app_handle.emit("telemetry-update", packet);
                            } else {
                                eprintln!("rt_parsed_stream: Failed to parse line: {:?}", line);
                            }
                        }
                        
                        // Remove the processed line (including \n) from the buffer
                        accumulated_data = accumulated_data[newline_idx + 1..].to_string();
                    }
                    
                    // Optional: Limit buffer size even if no newline is found, 
                    // though less critical now as we're not waiting for '>'
                    const MAX_BUFFER_WITHOUT_NEWLINE: usize = 4096;
                    if accumulated_data.len() > MAX_BUFFER_WITHOUT_NEWLINE {
                         eprintln!("rt_parsed_stream: Clearing buffer ({}) due to excessive size without newline.", accumulated_data.len());
                         accumulated_data.clear();
                    }

                }
                Ok(_) => { // 0 bytes read, not an error, just no data currently.
                    thread::sleep(Duration::from_millis(50)); 
                }
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::TimedOut {
                        // This case should ideally not be hit frequently if timeout is 0ms
                        // eprintln!("rt_parsed_stream: TimedOut, sleeping."); 
                        thread::sleep(Duration::from_millis(50)); // Reduced sleep slightly
                        continue;
                    }
                    // Log the specific error before breaking
                    eprintln!("rt_parsed_stream: Critical serial read error. Terminating thread. Error: {:?}", e);
                    break;
                }
            }
        }
        eprintln!("rt_parsed_stream: Thread finished.");
    });

    Ok(())
}