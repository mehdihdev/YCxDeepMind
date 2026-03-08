# ELEGOO Smart Robot Car V4.0 Notes

This example repo is the Forge RDE starter for the ELEGOO Smart Robot Car V4.0 with camera.

What is included:

- Arduino firmware with Forge RDE serial commands and official V4 TB6612 pin mapping
- Jetson/Raspberry Pi car control server
- Camera streaming server for USB cameras or ESP32-CAM style streams
- MuJoCo model for Live Bench sim
- Robot graph metadata for the `My Robot` workflow

What is intentionally simplified:

- No full vendor app protocol mirror
- No complete CAD export of every bracket and fastener
- No autonomous stack beyond a simple obstacle-avoidance stub in `jetson/car_server.py`
