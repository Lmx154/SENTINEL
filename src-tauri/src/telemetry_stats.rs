use std::error::Error;
use std::fs::File;
use std::path::Path;
use serde::{Deserialize, Serialize};
use chrono::NaiveDateTime;
use std::collections::HashMap;
use csv::ReaderBuilder;

#[derive(Debug, Deserialize, Clone)]
pub struct FeatherweightRecord {
    // Core time fields
    Year: i32,
    Month: i32,
    Day: i32,
    Time: String,
    Flight_Time_s: f64,
    
    // Key metrics
    Temperature_F: f64,
    Baro_Press_atm: f64,
    Baro_Altitude_ASL_feet: f64,
    Baro_Altitude_AGL_feet: f64,
    Velocity_Up: f64,
    Velocity_DR: f64,
    Velocity_CR: f64,
    Inertial_Altitude: f64,
}

#[derive(Debug, Serialize)]
pub struct FlightStats {
    // Speed stats
    average_speed: f64,
    top_speed: f64,
    top_speed_time: String,
    
    // Altitude stats
    apogee: f64,
    apogee_time: String,
    
    // Temperature stats
    max_temperature: f64,
    max_temp_time: String,
    min_temperature: f64,
    min_temp_time: String,
    
    // Data rate
    data_frequency_hz: f64,
    total_records: usize,
    flight_duration_s: f64,
}

/// Parse a Featherweight GPS CSV file and return the records
pub fn parse_featherweight_csv(file_path: &str) -> Result<Vec<FeatherweightRecord>, Box<dyn Error>> {
    let file_path = Path::new(file_path);
    let file = File::open(file_path)?;
    
    let mut reader = ReaderBuilder::new()
        .flexible(true)
        .has_headers(true)
        .from_reader(file);
    
    let mut records = Vec::new();
    for result in reader.deserialize() {
        let record: FeatherweightRecord = result?;
        records.push(record);
    }
    
    Ok(records)
}

/// Calculate the total velocity from 3D components
fn calculate_total_velocity(record: &FeatherweightRecord) -> f64 {
    (record.Velocity_Up.powi(2) + 
     record.Velocity_DR.powi(2) + 
     record.Velocity_CR.powi(2)).sqrt()
}

/// Format timestamp from record
fn format_timestamp(record: &FeatherweightRecord) -> String {
    format!("{}-{:02}-{:02} {}", 
            record.Year, record.Month, record.Day, record.Time)
}

/// Calculate comprehensive flight statistics from Featherweight data
pub fn analyze_featherweight_data(records: &[FeatherweightRecord]) -> Result<FlightStats, Box<dyn Error>> {
    if records.is_empty() {
        return Err("No records found in data".into());
    }
    
    // Initialize tracking variables
    let mut total_speed = 0.0;
    let mut top_speed = 0.0;
    let mut top_speed_record = &records[0];
    
    let mut apogee = f64::MIN;
    let mut apogee_record = &records[0];
    
    let mut max_temp = f64::MIN;
    let mut max_temp_record = &records[0];
    let mut min_temp = f64::MAX;
    let mut min_temp_record = &records[0];
    
    // Calculate time differences for data frequency
    let first_time = records[0].Flight_Time_s;
    let last_time = records[records.len() - 1].Flight_Time_s;
    let flight_duration = last_time - first_time;
    
    // Process each record
    for record in records {
        // Calculate speed from velocity components
        let speed = calculate_total_velocity(record);
        total_speed += speed;
        
        // Track top speed
        if speed > top_speed {
            top_speed = speed;
            top_speed_record = record;
        }
        
        // Track apogee (max altitude)
        if record.Baro_Altitude_AGL_feet > apogee {
            apogee = record.Baro_Altitude_AGL_feet;
            apogee_record = record;
        }
        
        // Track temperature extremes
        if record.Temperature_F > max_temp {
            max_temp = record.Temperature_F;
            max_temp_record = record;
        }
        
        if record.Temperature_F < min_temp {
            min_temp = record.Temperature_F;
            min_temp_record = record;
        }
    }
    
    // Calculate average speed and data frequency
    let average_speed = total_speed / records.len() as f64;
    let data_frequency = if flight_duration > 0.0 {
        records.len() as f64 / flight_duration
    } else {
        0.0
    };
    
    Ok(FlightStats {
        average_speed,
        top_speed,
        top_speed_time: format_timestamp(top_speed_record),
        apogee,
        apogee_time: format_timestamp(apogee_record),
        max_temperature: max_temp,
        max_temp_time: format_timestamp(max_temp_record),
        min_temperature: min_temp,
        min_temp_time: format_timestamp(min_temp_record),
        data_frequency_hz: data_frequency,
        total_records: records.len(),
        flight_duration_s: flight_duration,
    })
}

/// Identify temperature spikes in the data
pub fn analyze_temperature_spikes(records: &[FeatherweightRecord], threshold: f64) -> Vec<(String, f64)> {
    if records.len() < 3 {
        return Vec::new();
    }
    
    let mut spikes = Vec::new();
    
    for i in 1..records.len() - 1 {
        let prev = records[i-1].Temperature_F;
        let current = records[i].Temperature_F;
        let next = records[i+1].Temperature_F;
        
        // Check if current value is significantly higher than neighbors
        if current > prev + threshold && current > next + threshold {
            spikes.push((format_timestamp(&records[i]), current));
        }
    }
    
    spikes
}

/// Calculate data rate over time to identify transmission interruptions
pub fn analyze_data_rate(records: &[FeatherweightRecord]) -> HashMap<String, f64> {
    let mut time_segments = HashMap::new();
    
    if records.len() < 2 {
        return time_segments;
    }
    
    // Group records into 10-second intervals
    for i in 1..records.len() {
        let time_diff = records[i].Flight_Time_s - records[i-1].Flight_Time_s;
        if time_diff > 0.0 {
            let segment_key = format!("{:.0}", (records[i].Flight_Time_s / 10.0).floor() * 10.0);
            let entry = time_segments.entry(segment_key).or_insert(0.0);
            *entry += 1.0 / time_diff; // Add frequency for this sample
        }
    }
    
    // Average the frequencies within each segment
    for (_, freq) in time_segments.iter_mut() {
        *freq /= 10.0; // Divide by time segment length to get average Hz
    }
    
    time_segments
}

#[tauri::command]
pub fn analyze_featherweight_file(file_path: &str) -> Result<FlightStats, String> {
    match parse_featherweight_csv(file_path) {
        Ok(records) => {
            analyze_featherweight_data(&records)
                .map_err(|e| format!("Analysis error: {}", e))
        },
        Err(e) => Err(format!("Failed to parse CSV: {}", e)),
    }
}

#[tauri::command]
pub fn get_temperature_spikes(file_path: &str, threshold: f64) -> Result<Vec<(String, f64)>, String> {
    match parse_featherweight_csv(file_path) {
        Ok(records) => Ok(analyze_temperature_spikes(&records, threshold)),
        Err(e) => Err(format!("Failed to parse CSV: {}", e)),
    }
}

#[tauri::command]
pub fn get_data_frequency_analysis(file_path: &str) -> Result<HashMap<String, f64>, String> {
    match parse_featherweight_csv(file_path) {
        Ok(records) => Ok(analyze_data_rate(&records)),
        Err(e) => Err(format!("Failed to parse CSV: {}", e)),
    }
}
