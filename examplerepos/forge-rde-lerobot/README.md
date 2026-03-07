# Forge RDE LeRobot

A generalizable robot configuration and deployment system for LeRobot arms with Forge RDE integration.

## Overview

This repo provides a **config-driven** setup for:
- **Leader-Follower teleoperation** (SO-100 arms)
- **Multi-camera streaming**
- **Jetson deployment** with one command
- **Forge RDE integration** via Robot Graph

Instead of hardcoding IPs, device paths, and calibration values, everything is defined in `robot.config.json`.

## Quick Start

### 1. Configure Your Robot

Edit `robot.config.json`:

```json
{
  "jetson": {
    "ip": "192.168.1.100",      // Your Jetson's IP
    "ssh_user": "jetson"
  },
  "arms": {
    "leader": {
      "device": "/dev/ttyACM0"   // Leader arm USB port
    },
    "follower": {
      "device": "/dev/ttyACM1"   // Follower arm USB port
    }
  },
  "cameras": [
    { "id": "top", "device": "/dev/video0" }
  ]
}
```

### 2. Deploy to Jetson

```bash
./deploy.sh
```

This copies everything to your Jetson and installs dependencies.

### 3. Start Servers

On the Jetson:

```bash
./scripts/start-servers.sh
```

Or remotely:

```bash
ssh jetson@192.168.1.100 'cd ~/forge-lerobot && ./scripts/start-servers.sh'
```

### 4. Connect from Forge RDE

In the Forge RDE app, connect to:
- Arm server: `ws://192.168.1.100:8765`
- Camera server: `ws://192.168.1.100:8766`

## Directory Structure

```
forge-rde-lerobot/
├── robot.config.json          # Main config (edit this!)
├── deploy.sh                  # One-command deploy to Jetson
│
├── calibration/               # Arm calibration data
│   ├── leader.json
│   └── follower.json
│
├── jetson/                    # Server code (runs on Jetson)
│   ├── arm_server.py          # WebSocket arm control
│   ├── camera_server.py       # WebSocket camera streaming
│   └── requirements.txt
│
├── scripts/
│   ├── install.sh             # Full installation on Jetson
│   ├── start-servers.sh       # Start all servers
│   └── discover_devices.py    # Find USB ports & cameras
│
├── forge-integration/
│   └── robot-graph-schema.json
│
└── docs/                      # Datasheets & manuals (add yours)
    ├── lerobot-arm/
    ├── cad/
    └── elegoo-car/
```

## Device Discovery

Run on the Jetson to auto-detect connected devices:

```bash
python3 scripts/discover_devices.py
```

Output:
```
🔌 Scanning for USB serial ports (arms)...
   Found 2 serial port(s):
   • /dev/ttyACM0 (FTDI / FT232R)
   • /dev/ttyACM1 (FTDI / FT232R)

📷 Scanning for cameras...
   Found 1 camera(s):
   • /dev/video0: USB Camera
     ✓ MJPEG | Resolutions: 640x480, 1280x720

📝 Suggested configuration:
{
  "arms": {
    "leader": { "device": "/dev/ttyACM0" },
    "follower": { "device": "/dev/ttyACM1" }
  },
  "cameras": [
    { "id": "cam0", "device": "/dev/video0" }
  ]
}
```

## Calibration

Calibration maps raw motor values (0-4095) to degrees.

### Calibration File Format

```json
{
  "arm": "leader",
  "joints": [
    {
      "id": 1,
      "name": "base",
      "min_raw": 1024,
      "max_raw": 3072,
      "min_deg": -90,
      "max_deg": 90,
      "home_raw": 2048,
      "direction": 1
    }
  ]
}
```

### Calibration via Forge RDE

1. Open Live Bench in Forge RDE
2. Switch to Calibration mode
3. Follow the wizard for each joint
4. Calibration is saved and synced to Jetson

## WebSocket API

### Arm Server (port 8765)

**Get State:**
```json
{ "type": "get_state" }
```

**Response:**
```json
{
  "type": "state",
  "leader": {
    "arm": "leader",
    "raw_positions": [2048, 2048, 2048, 2048, 2048, 2500],
    "positions": [0, 0, 0, 0, 0, 50],
    "joint_names": ["base", "shoulder", "elbow", "wrist_pitch", "wrist_roll", "gripper"]
  },
  "follower": { ... },
  "teleop_enabled": false
}
```

**Enable Teleoperation:**
```json
{ "type": "set_teleop", "enabled": true }
```

**Set Positions (when teleop disabled):**
```json
{ "type": "set_positions", "positions": [0, 0, 0, 0, 0, 50] }
```

**Upload Calibration:**
```json
{ "type": "upload_calibration", "arm": "leader", "calibration": { ... } }
```

### Camera Server (port 8766)

**Subscribe to Camera:**
```json
{ "type": "subscribe", "cameras": ["top"] }
```

**Frame Response (continuous):**
```json
{ "type": "frame", "camera": "top", "data": "<base64 JPEG>" }
```

## Adding Your Robot

1. **Copy this repo** for your robot
2. **Add datasheets** to `docs/`
3. **Run device discovery** to find ports
4. **Update robot.config.json**
5. **Calibrate** each arm
6. **Deploy** to Jetson

## Forge RDE Integration

The `forge-integration/robot-graph-schema.json` defines how this robot appears in Forge RDE's Robot Graph.

When connected, Forge RDE can:
- View live arm positions
- Control teleoperation
- Stream camera feeds
- Record episodes
- Run diagnostics

## Troubleshooting

### "Permission denied" on USB ports

```bash
sudo usermod -a -G dialout $USER
sudo usermod -a -G video $USER
# Log out and back in
```

### Can't find cameras

```bash
v4l2-ctl --list-devices
```

### Motors not responding

1. Check USB connections
2. Verify motor IDs match config
3. Check power supply
4. Try: `python3 -c "from lerobot.common.robot_devices.motors.feetech import *"`

## License

MIT
