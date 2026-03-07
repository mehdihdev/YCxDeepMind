#!/usr/bin/env python3
"""
Forge RDE LeRobot - Device Discovery
Automatically detect USB serial ports (arms) and cameras.
Run this to find your device paths for robot.config.json.
"""

import os
import sys
import json
import glob
import subprocess
from pathlib import Path


def find_serial_ports():
    """Find USB serial ports (potential arm connections)."""
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

        # Try to get capabilities
        try:
            output = subprocess.check_output(
                ["v4l2-ctl", "-d", device, "--list-formats-ext"],
                stderr=subprocess.DEVNULL,
                text=True
            )
            if "MJPG" in output or "Motion-JPEG" in output:
                info["supports_mjpeg"] = True
            else:
                info["supports_mjpeg"] = False

            # Extract resolutions
            resolutions = []
            for line in output.split("\n"):
                if "Size:" in line:
                    parts = line.split("Size:")[1].strip().split()
                    if parts and "x" in parts[1]:
                        resolutions.append(parts[1])
            if resolutions:
                info["resolutions"] = list(set(resolutions))[:5]  # Top 5
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass

        cameras.append(info)

    return cameras


def generate_config_suggestion(serial_ports, cameras):
    """Generate a suggested robot.config.json snippet."""
    config = {
        "arms": {
            "leader": {
                "enabled": len(serial_ports) >= 1,
                "device": serial_ports[0]["device"] if serial_ports else "/dev/ttyACM0",
                "note": "First detected serial port"
            },
            "follower": {
                "enabled": len(serial_ports) >= 2,
                "device": serial_ports[1]["device"] if len(serial_ports) >= 2 else "/dev/ttyACM1",
                "note": "Second detected serial port"
            }
        },
        "cameras": []
    }

    for i, cam in enumerate(cameras[:3]):  # Max 3 cameras
        config["cameras"].append({
            "id": f"cam{i}",
            "name": cam.get("name", f"Camera {i}"),
            "device": cam["device"],
            "resolution": [640, 480],
            "fps": 30,
            "enabled": i == 0  # Only enable first camera by default
        })

    return config


def main():
    print("=" * 50)
    print("  Forge RDE LeRobot - Device Discovery")
    print("=" * 50)
    print()

    # Find serial ports
    print("🔌 Scanning for USB serial ports (arms)...")
    serial_ports = find_serial_ports()

    if serial_ports:
        print(f"   Found {len(serial_ports)} serial port(s):")
        for port in serial_ports:
            vendor = port.get("id_vendor", "unknown")
            model = port.get("id_model", "unknown")
            print(f"   • {port['device']} ({vendor} / {model})")
    else:
        print("   No serial ports found")

    print()

    # Find cameras
    print("📷 Scanning for cameras...")
    cameras = find_cameras()

    if cameras:
        print(f"   Found {len(cameras)} camera(s):")
        for cam in cameras:
            name = cam.get("name", "Unknown")
            mjpeg = "✓ MJPEG" if cam.get("supports_mjpeg") else "✗ MJPEG"
            resolutions = ", ".join(cam.get("resolutions", [])[:3])
            print(f"   • {cam['device']}: {name}")
            print(f"     {mjpeg} | Resolutions: {resolutions or 'unknown'}")
    else:
        print("   No cameras found")

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
