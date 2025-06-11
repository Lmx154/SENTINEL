"""
Sensor Fusion Module

This module implements sensor fusion algorithms to convert raw IMU data
(accelerometer, gyroscope, magnetometer) into accurate orientation estimates.

Uses Madgwick filter and complementary filters for robust orientation tracking.
"""

import numpy as np
import math
from typing import Dict, Tuple, Optional, List
from dataclasses import dataclass
from datetime import datetime
import logging

# Set up logging
logger = logging.getLogger(__name__)

@dataclass
class IMUData:
    """Container for IMU sensor readings"""
    accel_x: float  # m/s²
    accel_y: float  # m/s²
    accel_z: float  # m/s²
    gyro_x: float   # degrees/sec
    gyro_y: float   # degrees/sec
    gyro_z: float   # degrees/sec
    mag_x: float    # microTesla
    mag_y: float    # microTesla
    mag_z: float    # microTesla
    timestamp: float  # seconds

@dataclass
class Orientation:
    """Container for orientation angles"""
    roll: float   # degrees (-180 to 180)
    pitch: float  # degrees (-90 to 90)
    yaw: float    # degrees (0 to 360)
    quaternion: Optional[Tuple[float, float, float, float]] = None  # w, x, y, z

class MadgwickFilter:
    """
    Implementation of Madgwick's IMU and AHRS algorithms.
    
    Based on:
    Madgwick, S. (2010). An efficient orientation filter for inertial and 
    inertial/magnetic sensor arrays.
    """
    
    def __init__(self, sample_period: float = 0.1, beta: float = 0.1):
        """
        Initialize the Madgwick filter.
        
        Args:
            sample_period: The sample period in seconds
            beta: Algorithm gain (typically 0.1 to 0.5)
        """
        self.sample_period = sample_period
        self.beta = beta
        self.quaternion = np.array([1.0, 0.0, 0.0, 0.0])  # w, x, y, z
        
    def update(self, gyro: np.ndarray, accel: np.ndarray, mag: Optional[np.ndarray] = None):
        """
        Update the filter with new sensor data.
        
        Args:
            gyro: Gyroscope data in rad/s [x, y, z]
            accel: Accelerometer data in any unit [x, y, z]
            mag: Magnetometer data in any unit [x, y, z] (optional)
        """
        q = self.quaternion
        
        # Normalize accelerometer measurement
        if np.linalg.norm(accel) == 0:
            return
        accel = accel / np.linalg.norm(accel)
        
        # Normalize magnetometer measurement if available
        if mag is not None and np.linalg.norm(mag) > 0:
            mag = mag / np.linalg.norm(mag)
            
            # Reference direction of Earth's magnetic field
            h = self._quaternion_multiply([0, mag[0], mag[1], mag[2]], self._quaternion_conjugate(q))
            h = self._quaternion_multiply(q, h)
            b = np.array([0, np.sqrt(h[1]**2 + h[2]**2), 0, h[3]])
            
            # Gradient descent algorithm corrective step
            F = np.array([
                2*(q[1]*q[3] - q[0]*q[2]) - accel[0],
                2*(q[0]*q[1] + q[2]*q[3]) - accel[1],
                2*(0.5 - q[1]**2 - q[2]**2) - accel[2],
                2*b[1]*(0.5 - q[2]**2 - q[3]**2) + 2*b[3]*(q[1]*q[3] - q[0]*q[2]) - mag[0],
                2*b[1]*(q[1]*q[2] - q[0]*q[3]) + 2*b[3]*(q[0]*q[1] + q[2]*q[3]) - mag[1],
                2*b[1]*(q[0]*q[2] + q[1]*q[3]) + 2*b[3]*(0.5 - q[1]**2 - q[2]**2) - mag[2]
            ])
            
            J = np.array([
                [-2*q[2], 2*q[3], -2*q[0], 2*q[1]],
                [2*q[1], 2*q[0], 2*q[3], 2*q[2]],
                [0, -4*q[1], -4*q[2], 0],
                [-2*b[3]*q[2], 2*b[3]*q[3], -4*b[1]*q[2]-2*b[3]*q[0], -4*b[1]*q[3]+2*b[3]*q[1]],
                [-2*b[1]*q[3]+2*b[3]*q[1], 2*b[1]*q[2]+2*b[3]*q[0], 2*b[1]*q[1]+2*b[3]*q[3], -2*b[1]*q[0]+2*b[3]*q[2]],
                [2*b[1]*q[2], 2*b[1]*q[3]-4*b[3]*q[1], 2*b[1]*q[0]-4*b[3]*q[2], 2*b[1]*q[1]]
            ])
            
            step = J.T.dot(F)
        else:
            # IMU algorithm (no magnetometer)
            # Gradient descent algorithm corrective step
            F = np.array([
                2*(q[1]*q[3] - q[0]*q[2]) - accel[0],
                2*(q[0]*q[1] + q[2]*q[3]) - accel[1],
                2*(0.5 - q[1]**2 - q[2]**2) - accel[2]
            ])
            
            J = np.array([
                [-2*q[2], 2*q[3], -2*q[0], 2*q[1]],
                [2*q[1], 2*q[0], 2*q[3], 2*q[2]],
                [0, -4*q[1], -4*q[2], 0]
            ])
            
            step = J.T.dot(F)
        
        # Normalize step magnitude
        step = step / np.linalg.norm(step)
        
        # Compute rate of change of quaternion
        qDot = 0.5 * self._quaternion_multiply(q, [0, gyro[0], gyro[1], gyro[2]]) - self.beta * step
        
        # Integrate to yield quaternion
        q = q + qDot * self.sample_period
        self.quaternion = q / np.linalg.norm(q)  # Normalize quaternion
    
    def _quaternion_multiply(self, q1, q2):
        """Multiply two quaternions."""
        w1, x1, y1, z1 = q1
        w2, x2, y2, z2 = q2
        return np.array([
            w1*w2 - x1*x2 - y1*y2 - z1*z2,
            w1*x2 + x1*w2 + y1*z2 - z1*y2,
            w1*y2 - x1*z2 + y1*w2 + z1*x2,
            w1*z2 + x1*y2 - y1*x2 + z1*w2
        ])
    
    def _quaternion_conjugate(self, q):
        """Return quaternion conjugate."""
        return np.array([q[0], -q[1], -q[2], -q[3]])
    
    def get_euler_angles(self) -> Tuple[float, float, float]:
        """
        Get Euler angles from quaternion.
        
        Returns:
            Tuple of (roll, pitch, yaw) in radians
        """
        w, x, y, z = self.quaternion
        
        # Roll (x-axis rotation)
        sinr_cosp = 2 * (w * x + y * z)
        cosr_cosp = 1 - 2 * (x * x + y * y)
        roll = np.arctan2(sinr_cosp, cosr_cosp)
        
        # Pitch (y-axis rotation)
        sinp = 2 * (w * y - z * x)
        if abs(sinp) >= 1:
            pitch = np.copysign(np.pi / 2, sinp)  # Use 90 degrees if out of range
        else:
            pitch = np.arcsin(sinp)
        
        # Yaw (z-axis rotation)
        siny_cosp = 2 * (w * z + x * y)
        cosy_cosp = 1 - 2 * (y * y + z * z)
        yaw = np.arctan2(siny_cosp, cosy_cosp)
        
        return roll, pitch, yaw

class ComplementaryFilter:
    """
    Simple complementary filter for sensor fusion.
    Combines accelerometer and gyroscope data.
    """
    
    def __init__(self, alpha: float = 0.98):
        """
        Initialize the complementary filter.
        
        Args:
            alpha: Filter coefficient (0.9 to 0.99 typical)
        """
        self.alpha = alpha
        self.roll = 0.0
        self.pitch = 0.0
        self.last_update = None
        
    def update(self, accel: np.ndarray, gyro: np.ndarray, dt: float):
        """
        Update the filter with new sensor data.
        
        Args:
            accel: Accelerometer data in m/s² [x, y, z]
            gyro: Gyroscope data in rad/s [x, y, z]
            dt: Time delta in seconds
        """
        # Calculate angles from accelerometer
        accel_roll = np.arctan2(accel[1], accel[2])
        accel_pitch = np.arctan2(-accel[0], np.sqrt(accel[1]**2 + accel[2]**2))
        
        # Integrate gyroscope data
        self.roll += gyro[0] * dt
        self.pitch += gyro[1] * dt
        
        # Apply complementary filter
        self.roll = self.alpha * self.roll + (1 - self.alpha) * accel_roll
        self.pitch = self.alpha * self.pitch + (1 - self.alpha) * accel_pitch
        
        # Keep angles in range
        self.roll = np.fmod(self.roll + np.pi, 2 * np.pi) - np.pi
        self.pitch = np.clip(self.pitch, -np.pi/2, np.pi/2)

class SensorFusion:
    """
    Main sensor fusion class that processes IMU data and provides orientation estimates.
    """
    
    def __init__(self, 
                 use_magnetometer: bool = True,
                 sample_rate: float = 10.0,
                 madgwick_beta: float = 0.1,
                 complementary_alpha: float = 0.98):
        """
        Initialize the sensor fusion system.
        
        Args:
            use_magnetometer: Whether to use magnetometer data for heading
            sample_rate: Expected sample rate in Hz
            madgwick_beta: Madgwick filter gain
            complementary_alpha: Complementary filter coefficient
        """
        self.use_magnetometer = use_magnetometer
        self.sample_period = 1.0 / sample_rate
        
        # Initialize filters
        self.madgwick = MadgwickFilter(self.sample_period, madgwick_beta)
        self.complementary = ComplementaryFilter(complementary_alpha)
        
        # Calibration offsets
        self.accel_offset = np.zeros(3)
        self.gyro_offset = np.zeros(3)
        self.mag_offset = np.zeros(3)
        self.mag_scale = np.ones(3)
        
        # Moving average for smoothing
        self.orientation_history: List[Orientation] = []
        self.history_size = 5
        
        self.last_update_time = None
        self.is_calibrated = False
        
    def calibrate(self, imu_samples: List[IMUData], stationary: bool = True):
        """
        Calibrate sensors using provided samples.
        
        Args:
            imu_samples: List of IMU data samples
            stationary: Whether the device is stationary during calibration
        """
        if len(imu_samples) < 10:
            logger.warning("Not enough samples for calibration")
            return
        
        # Convert samples to numpy arrays
        accel_data = np.array([[s.accel_x, s.accel_y, s.accel_z] for s in imu_samples])
        gyro_data = np.array([[s.gyro_x, s.gyro_y, s.gyro_z] for s in imu_samples])
        mag_data = np.array([[s.mag_x, s.mag_y, s.mag_z] for s in imu_samples])
        
        if stationary:
            # For stationary calibration, gyroscope should read zero
            self.gyro_offset = np.mean(gyro_data, axis=0)
            
            # Accelerometer should read gravity (9.81 m/s²)
            accel_magnitude = np.mean(np.linalg.norm(accel_data, axis=1))
            self.accel_offset = np.mean(accel_data, axis=0)
            # Adjust Z-axis to account for gravity
            self.accel_offset[2] -= accel_magnitude
        
        # Simple magnetometer calibration (hard iron correction)
        if self.use_magnetometer and not np.all(mag_data == 0):
            self.mag_offset = (np.max(mag_data, axis=0) + np.min(mag_data, axis=0)) / 2
            self.mag_scale = (np.max(mag_data, axis=0) - np.min(mag_data, axis=0)) / 2
            # Avoid division by zero
            self.mag_scale[self.mag_scale == 0] = 1
        
        self.is_calibrated = True
        logger.info("Sensor calibration completed")
    
    def process_imu_data(self, imu_data: IMUData) -> Orientation:
        """
        Process raw IMU data and return orientation estimate.
        
        Args:
            imu_data: Raw IMU sensor readings
            
        Returns:
            Orientation object with roll, pitch, yaw, and quaternion
        """
        # Apply calibration offsets
        accel = np.array([
            imu_data.accel_x - self.accel_offset[0],
            imu_data.accel_y - self.accel_offset[1],
            imu_data.accel_z - self.accel_offset[2]
        ])
        
        gyro = np.array([
            math.radians(imu_data.gyro_x - self.gyro_offset[0]),
            math.radians(imu_data.gyro_y - self.gyro_offset[1]),
            math.radians(imu_data.gyro_z - self.gyro_offset[2])
        ])
        
        mag = None
        if self.use_magnetometer and (imu_data.mag_x != 0 or imu_data.mag_y != 0 or imu_data.mag_z != 0):
            mag = np.array([
                (imu_data.mag_x - self.mag_offset[0]) / self.mag_scale[0],
                (imu_data.mag_y - self.mag_offset[1]) / self.mag_scale[1],
                (imu_data.mag_z - self.mag_offset[2]) / self.mag_scale[2]
            ])
        
        # Calculate time delta
        current_time = imu_data.timestamp
        if self.last_update_time is None:
            dt = self.sample_period
        else:
            dt = current_time - self.last_update_time
            dt = max(dt, 0.001)  # Minimum 1ms to avoid division issues
        
        self.last_update_time = current_time
        
        # Update Madgwick filter
        self.madgwick.update(gyro, accel, mag)
        roll_mad, pitch_mad, yaw_mad = self.madgwick.get_euler_angles()
        
        # Update complementary filter (for comparison/backup)
        self.complementary.update(accel, gyro, dt)
        
        # Convert to degrees
        roll_deg = math.degrees(roll_mad)
        pitch_deg = math.degrees(pitch_mad)
        yaw_deg = math.degrees(yaw_mad)
        
        # Ensure yaw is 0-360
        if yaw_deg < 0:
            yaw_deg += 360
        
        # Create orientation object
        orientation = Orientation(
            roll=roll_deg,
            pitch=pitch_deg,
            yaw=yaw_deg,
            quaternion=tuple(self.madgwick.quaternion)
        )
        
        # Apply smoothing
        orientation = self._smooth_orientation(orientation)
        
        return orientation
    
    def _smooth_orientation(self, orientation: Orientation) -> Orientation:
        """Apply moving average smoothing to orientation."""
        self.orientation_history.append(orientation)
        
        # Keep only recent history
        if len(self.orientation_history) > self.history_size:
            self.orientation_history.pop(0)
        
        # If not enough history, return current value
        if len(self.orientation_history) < 3:
            return orientation
        
        # Calculate weighted average (more recent = higher weight)
        weights = np.linspace(0.5, 1.0, len(self.orientation_history))
        weights = weights / weights.sum()
        
        # Average angles (handling wrap-around for yaw)
        roll_avg = sum(o.roll * w for o, w in zip(self.orientation_history, weights))
        pitch_avg = sum(o.pitch * w for o, w in zip(self.orientation_history, weights))
        
        # Handle yaw wrap-around
        yaw_sin = sum(math.sin(math.radians(o.yaw)) * w for o, w in zip(self.orientation_history, weights))
        yaw_cos = sum(math.cos(math.radians(o.yaw)) * w for o, w in zip(self.orientation_history, weights))
        yaw_avg = math.degrees(math.atan2(yaw_sin, yaw_cos))
        if yaw_avg < 0:
            yaw_avg += 360
        
        return Orientation(
            roll=roll_avg,
            pitch=pitch_avg,
            yaw=yaw_avg,
            quaternion=orientation.quaternion  # Keep latest quaternion
        )
    
    def reset(self):
        """Reset the fusion filters to initial state."""
        self.madgwick.quaternion = np.array([1.0, 0.0, 0.0, 0.0])
        self.complementary.roll = 0.0
        self.complementary.pitch = 0.0
        self.orientation_history.clear()
        self.last_update_time = None
        logger.info("Sensor fusion reset")

# Global sensor fusion instance
sensor_fusion = SensorFusion()

def process_telemetry_packet(parsed_data: Dict) -> Dict:
    """
    Process a telemetry packet and add orientation data.
    
    This function should be called from the data parser callback.
    """
    try:
        # Check if we have the required IMU data
        required_fields = ['accel_x_g', 'accel_y_g', 'accel_z_g', 
                          'gyro_x_dps', 'gyro_y_dps', 'gyro_z_dps']
        
        if not all(field in parsed_data for field in required_fields):
            return parsed_data
        
        # Create IMU data object
        imu_data = IMUData(
            accel_x=parsed_data['accel_x_g'] * 9.81,  # Convert g to m/s²
            accel_y=parsed_data['accel_y_g'] * 9.81,
            accel_z=parsed_data['accel_z_g'] * 9.81,
            gyro_x=parsed_data['gyro_x_dps'],
            gyro_y=parsed_data['gyro_y_dps'],
            gyro_z=parsed_data['gyro_z_dps'],
            mag_x=parsed_data.get('mag_x_ut', 0),
            mag_y=parsed_data.get('mag_y_ut', 0),
            mag_z=parsed_data.get('mag_z_ut', 0),
            timestamp=parsed_data.get('timestamp', datetime.now().timestamp())
        )
        
        # Process through sensor fusion
        orientation = sensor_fusion.process_imu_data(imu_data)
        
        # Add orientation data to packet
        parsed_data['orientation_roll'] = orientation.roll
        parsed_data['orientation_pitch'] = orientation.pitch
        parsed_data['orientation_yaw'] = orientation.yaw
        
        if orientation.quaternion:
            parsed_data['quaternion_w'] = orientation.quaternion[0]
            parsed_data['quaternion_x'] = orientation.quaternion[1]
            parsed_data['quaternion_y'] = orientation.quaternion[2]
            parsed_data['quaternion_z'] = orientation.quaternion[3]
        
        # Add fusion metadata
        parsed_data['_sensor_fusion'] = True
        parsed_data['_fusion_algorithm'] = 'Madgwick'
        
    except Exception as e:
        logger.error(f"Error in sensor fusion processing: {e}")
    
    return parsed_data

# Configuration functions
def configure_sensor_fusion(use_magnetometer: bool = True, 
                          madgwick_beta: float = 0.1,
                          smoothing_window: int = 5):
    """Configure sensor fusion parameters."""
    global sensor_fusion
    sensor_fusion.use_magnetometer = use_magnetometer
    sensor_fusion.madgwick.beta = madgwick_beta
    sensor_fusion.history_size = smoothing_window
    logger.info(f"Sensor fusion configured: mag={use_magnetometer}, beta={madgwick_beta}, window={smoothing_window}")

def calibrate_sensors(stationary_samples: List[Dict]):
    """Calibrate sensors using stationary data."""
    if not stationary_samples:
        logger.warning("No samples provided for calibration")
        return
    
    # Convert dict samples to IMUData objects
    imu_samples = []
    for sample in stationary_samples:
        try:
            imu_data = IMUData(
                accel_x=sample.get('accel_x_g', 0) * 9.81,
                accel_y=sample.get('accel_y_g', 0) * 9.81,
                accel_z=sample.get('accel_z_g', 0) * 9.81,
                gyro_x=sample.get('gyro_x_dps', 0),
                gyro_y=sample.get('gyro_y_dps', 0),
                gyro_z=sample.get('gyro_z_dps', 0),
                mag_x=sample.get('mag_x_ut', 0),
                mag_y=sample.get('mag_y_ut', 0),
                mag_z=sample.get('mag_z_ut', 0),
                timestamp=sample.get('timestamp', 0)
            )
            imu_samples.append(imu_data)
        except KeyError:
            continue
    
    if imu_samples:
        sensor_fusion.calibrate(imu_samples, stationary=True)

# Example usage
if __name__ == "__main__":
    # Test with sample data
    test_data = {
        'accel_x_g': 0.02,
        'accel_y_g': -0.01,
        'accel_z_g': 0.99,
        'gyro_x_dps': 0.5,
        'gyro_y_dps': -0.3,
        'gyro_z_dps': 0.1,
        'mag_x_ut': 22.5,
        'mag_y_ut': -5.3,
        'mag_z_ut': 43.2,
        'timestamp': 1234567890.123
    }
    
    result = process_telemetry_packet(test_data)
    print(f"Orientation: Roll={result.get('orientation_roll', 0):.1f}°, "
          f"Pitch={result.get('orientation_pitch', 0):.1f}°, "
          f"Yaw={result.get('orientation_yaw', 0):.1f}°")