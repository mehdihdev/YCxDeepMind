#!/usr/bin/env python3
"""
Forge RDE ELEGOO Car - Device Discovery
Automatically detect Arduino serial ports and cameras.
Run this to find your device paths for robot.config.json.
"""

import os
import sys
import json
import glob
import subprocess
from pathlib import Path


def find_serial_ports():
    """Find USB serial ports (Arduino connections)."""
    ports = []

    # Linux: /dev/ttyUSB* and /dev/ttyACM*
    for pattern in ["/dev/ttyUSB*", "/dev/ttyACM*"]:
        ports.extend(glob.glob(pattern))

    # macOS: /dev/tty.usb* and /dev/cu.usb*
    for pattern in ["/dev/tty.usb*", "/dev/cu.usb*"]:
        ports.extend(glob.glob(pattern))

    results = []
    for port in sorted(set(ports)):
        info = {"device": port, "type": "serial"}

        # Try to get more info via udevadm (Linux)
        try:
            output = subprocess.check_output(
                ["udevadm", "info", "-q", "property", "-n", port],
                stderr=subprocess.DEVNULL,
                text=True
            )
            for line in output.split("\n"):
                if "=" in line:
                    key, value = line.split("=", 1)
                    if key in ["ID_VENDOR", "ID_MODEL", "ID_SERIAL_SHORT"]:
                        info[key.lower()] = value
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass

        results.append(info)

    return results


def find_cameras():
    """Find video devices (cameras)."""
    cameras = []

    # Linux: /dev/video*
    video_devices = sorted(glob.glob("/dev/video*"))

    for device in video_devices:
        info = {"device": device, "type": "camera"}

        # Try to get camera info via v4l2-ctl
        try:
            output = subprocess.check_output(
                ["v4l2-ctl", "-d", device, "--info"],
                stderr=subprocess.DEVNULL,
                text=True
            )
            for line in output.split("\n"):
                if "Card type" in line:
                    info["name"] = line.split(":", 1)[1].strip()
                elif "Bus info" in line:
                    info["bus"] = line.split(":", 1)[1].strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass

        cameras.append(info)

    return cameras


def find_esp32_cameras():
    """Scan network for ESP32-CAM devices."""
    cameras = []

    # Common ESP32-CAM ports
    import socket

    # Get local IP range
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()

        # Scan common ESP32-CAM IPs
        base_ip = ".".join(local_ip.split(".")[:-1])
        print(f"   Scanning {base_ip}.1-254 for ESP32-CAM...")

        for i in range(1, 255):
            ip = f"{base_ip}.{i}"
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.1)
                result = sock.connect_ex((ip, 81))  # ESP32-CAM stream port
                if result == 0:
                    cameras.append({
                        "type": "esp32_cam",
                        "ip": ip,
                        "stream_port": 81
                    })
                sock.close()
            except:
                pass
    except:
        pass

    return cameras


def generate_config_suggestion(serial_ports, cameras):
    """Generate a suggested robot.config.json snippet."""
    config = {
        "controller": {
            "type": "arduino_uno",
            "port": serial_ports[0]["device"] if serial_ports else "/dev/ttyUSB0",
            "baudrate": 115200,
            "note": "Arduino controlling ELEGOO car"
        },
        "cameras": []
    }

    for i, cam in enumerate(cameras[:2]):  # Max 2 cameras
        if cam.get("type") == "esp32_cam":
            config["cameras"].append({
                "id": f"esp32_{i}",
                "type": "esp32_wrover",
                "ip": cam["ip"],
                "stream_port": cam["stream_port"],
                "enabled": i == 0
            })
        else:
            config["cameras"].append({
                "id": f"cam{i}",
                "name": cam.get("name", f"Camera {i}"),
                "device": cam["device"],
                "resolution": [640, 480],
                "fps": 30,
                "enabled": i == 0
            })

    return config


def main():
    print("=" * 50)
    print("  Forge RDE ELEGOO Car - Device Discovery")
    print("=" * 50)
    print()

    # Find serial ports
    print("🔌 Scanning for Arduino serial ports...")
    serial_ports = find_serial_ports()

    if serial_ports:
        print(f"   Found {len(serial_ports)} serial port(s):")
        for port in serial_ports:
            vendor = port.get("id_vendor", "unknown")
            model = port.get("id_model", "unknown")
            print(f"   • {port['device']} ({vendor} / {model})")
    else:
        print("   No serial ports found")
        print("   Make sure Arduino is connected via USB")

    print()

    # Find USB cameras
    print("📷 Scanning for USB cameras...")
    cameras = find_cameras()

    if cameras:
        print(f"   Found {len(cameras)} camera(s):")
        for cam in cameras:
            name = cam.get("name", "Unknown")
            print(f"   • {cam['device']}: {name}")
    else:
        print("   No USB cameras found")

    print()

    # Find ESP32-CAM devices
    print("📡 Scanning for ESP32-CAM devices...")
    esp32_cameras = find_esp32_cameras()

    if esp32_cameras:
        print(f"   Found {len(esp32_cameras)} ESP32-CAM(s):")
        for cam in esp32_cameras:
            print(f"   • http://{cam['ip']}:{cam['stream_port']}")
        cameras.extend(esp32_cameras)
    else:
        print("   No ESP32-CAM devices found")

    print()

    # Generate config suggestion
    print("📝 Suggested configuration:")
    print("-" * 50)
    suggestion = generate_config_suggestion(serial_ports, cameras)
    print(json.dumps(suggestion, indent=2))
    print("-" * 50)

    # Save to file?
    print()
    if len(sys.argv) > 1 and sys.argv[1] == "--save":
        output_path = Path(__file__).parent.parent / "discovered_devices.json"
        with open(output_path, "w") as f:
            json.dump({
                "serial_ports": serial_ports,
                "cameras": cameras,
                "suggested_config": suggestion
            }, f, indent=2)
        print(f"✓ Saved to {output_path}")
    else:
        print("Tip: Run with --save to save results to discovered_devices.json")

    print()


if __name__ == "__main__":
    main()
