# Forge RDE ELEGOO Smart Car V4.0

A config-driven robot deployment system for the ELEGOO Smart Robot Car Kit V4.0 with Forge RDE integration.

## Overview

This repo provides a **config-driven** setup for:
- **Differential drive control** (4-wheel skid steer)
- **Sensor integration** (ultrasonic, IR line, IR obstacle)
- **MuJoCo simulation** with official ELEGOO CAD meshes
- **Recording & playback** for imitation learning
- **Jetson/Raspberry Pi deployment** with one command
- **Forge RDE integration** via Robot Graph

## Quick Start

### 1. Upload Arduino Firmware

Open `arduino/elegoo_car_firmware/elegoo_car_firmware.ino` in Arduino IDE and upload to your ELEGOO car's Arduino UNO.

### 2. Configure Your Robot

Edit `robot.config.json`:

```json
{
  "controller": {
    "port": "/dev/ttyUSB0",    // Arduino USB port
    "baudrate": 115200
  },
  "jetson": {
    "ip": "192.168.1.100",     // Your Jetson/Pi IP
    "ssh_user": "jetson"
  }
}
```

### 3. Deploy to Jetson/Pi

```bash
./deploy.sh
```

### 4. Start Server

On the Jetson/Pi:

```bash
./scripts/start-servers.sh
```

### 5. Connect from Forge RDE

Connect to: `ws://192.168.1.100:8765`

## Directory Structure

```
forge-rde-elegoo-car/
├── robot.config.json          # Main config (edit this!)
├── deploy.sh                  # One-command deploy
│
├── arduino/                   # Arduino firmware
│   └── elegoo_car_firmware/
│       └── elegoo_car_firmware.ino
│
├── calibration/               # Motor & sensor calibration
│   └── motors.json
│
├── jetson/                    # Server code (runs on Jetson/Pi)
│   ├── car_server.py          # WebSocket car control
│   └── requirements.txt
│
├── scripts/
│   ├── install.sh             # Full installation
│   ├── start-servers.sh       # Start all servers
│   └── discover_devices.py    # Find USB ports & cameras
│
├── mujoco/                    # MuJoCo simulation model
│   ├── elegoo_car.xml         # Car model
│   ├── elegoo_car_scene.xml   # Test environment
│   └── assets/                # STL meshes
│
├── forge-integration/
│   └── robot-graph-schema.json
│
└── docs/                      # Datasheets & manuals
```

## Hardware Setup

### Pin Mapping (Arduino UNO)

| Component | Pin(s) | Notes |
|-----------|--------|-------|
| Left Motors Enable | D5 (PWM) | L298N ENA |
| Right Motors Enable | D6 (PWM) | L298N ENB |
| Left Motors Dir | D7, D8 | L298N IN1, IN2 |
| Right Motors Dir | D9, D10 | L298N IN3, IN4 |
| Ultrasonic Trig | D12 | HC-SR04 |
| Ultrasonic Echo | D13 | HC-SR04 |
| Ultrasonic Servo | D3 (PWM) | SG90 |
| IR Line Left | A0 | TCRT5000 |
| IR Line Center | A1 | TCRT5000 |
| IR Line Right | A2 | TCRT5000 |
| IR Obstacle Left | D2 | Digital |
| IR Obstacle Right | D4 | Digital |

## WebSocket API

### Car Server (port 8765)

**Get State:**
```json
{ "type": "get_state" }
```

**Response:**
```json
{
  "type": "state",
  "left_speed": 0,
  "right_speed": 0,
  "servo_angle": 90,
  "ultrasonic_distance": 45.2,
  "ir_line": [450, 520, 480],
  "ir_obstacle": [false, false],
  "autonomous_mode": false
}
```

**Set Velocity (direct wheel control):**
```json
{ "type": "set_velocity", "left": 150, "right": 150 }
```

**Arcade Drive (forward + turn):**
```json
{ "type": "drive", "forward": 200, "turn": 50 }
```

**Emergency Stop:**
```json
{ "type": "stop" }
```

**Set Servo Angle:**
```json
{ "type": "set_servo", "angle": 45 }
```

**Ultrasonic Scan:**
```json
{ "type": "scan", "angles": [0, 45, 90, 135, 180] }
```

**Enable Autonomous Mode:**
```json
{ "type": "set_autonomous", "enabled": true }
```

**Start Recording:**
```json
{ "type": "start_recording", "name": "my_episode" }
```

**Stop Recording:**
```json
{ "type": "stop_recording" }
```

**Playback Recording:**
```json
{ "type": "start_playback", "name": "my_episode", "loop": true }
```

## MuJoCo Simulation

The `mujoco/` folder contains a complete simulation model:

- **elegoo_car.xml** - Car model with wheels, sensors, actuators
- **elegoo_car_scene.xml** - Test environment with line track, obstacles
- **assets/** - STL meshes from official ELEGOO CAD

### Loading in MuJoCo

```python
import mujoco

model = mujoco.MjModel.from_xml_path("mujoco/elegoo_car_scene.xml")
data = mujoco.MjData(model)

# Control motors (velocity)
data.ctrl[0] = 10  # motor_fl
data.ctrl[1] = 10  # motor_fr
data.ctrl[2] = 10  # motor_bl
data.ctrl[3] = 10  # motor_br
data.ctrl[4] = 0   # ultrasonic_servo

mujoco.mj_step(model, data)
```

### Actuators

| Index | Name | Type | Range |
|-------|------|------|-------|
| 0 | motor_fl | velocity | unlimited |
| 1 | motor_fr | velocity | unlimited |
| 2 | motor_bl | velocity | unlimited |
| 3 | motor_br | velocity | unlimited |
| 4 | ultrasonic_servo | position | -1.57 to 1.57 rad |

### Sensors

| Name | Type | Description |
|------|------|-------------|
| encoder_fl/fr/bl/br | jointvel | Wheel velocities |
| imu_accel | accelerometer | Chassis acceleration |
| imu_gyro | gyro | Chassis angular velocity |
| servo_pos | jointpos | Servo angle |

## Recording Format

Recordings are saved in LeRobot-compatible format:

```json
{
  "name": "recording_1234567890",
  "robot_type": "elegoo_car",
  "frame_count": 500,
  "duration": 10.0,
  "frames": [
    {
      "t": 1234567890.123,
      "left": 150,
      "right": 150,
      "ultrasonic": 45.2,
      "servo": 90,
      "ir_line": [450, 520, 480],
      "ir_obstacle": [false, false]
    }
  ]
}
```

## ESP32-CAM Integration (Optional)

If using the ESP32-WROVER camera module:

1. Flash the ESP32-CAM with the firmware in `ELEGOO-Smart-Robot-Car-Kit-V4.0/ESP32-WROVER-Camera/`
2. Update `robot.config.json` with the ESP32-CAM IP
3. Enable the camera in config

## Troubleshooting

### Arduino not found

```bash
# List serial ports
ls /dev/tty*

# Add user to dialout group
sudo usermod -a -G dialout $USER
# Log out and back in
```

### Motors not responding

1. Check battery power (needs 6V+ for motors)
2. Verify L298N connections
3. Test with Arduino Serial Monitor

### Simulation issues

Make sure STL files are in `mujoco/assets/` and paths match in XML.

## License

MIT
