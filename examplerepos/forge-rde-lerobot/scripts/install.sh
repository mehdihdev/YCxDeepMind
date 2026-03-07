#!/bin/bash
# Forge RDE LeRobot - Installation Script
# Run this on your Jetson to set up the robot servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo "  Forge RDE LeRobot - Installation"
echo "========================================="
echo ""

# Check if running on Jetson
if [ -f /etc/nv_tegra_release ]; then
    echo "[✓] Running on NVIDIA Jetson"
else
    echo "[!] Warning: Not detected as Jetson, continuing anyway..."
fi

# Create workspace directory
WORKSPACE="${HOME}/forge-lerobot"
mkdir -p "$WORKSPACE"
echo "[✓] Created workspace: $WORKSPACE"

# Copy files to workspace
echo "[*] Copying files..."
cp -r "$REPO_DIR/jetson/"* "$WORKSPACE/"
cp "$REPO_DIR/robot.config.json" "$WORKSPACE/"
cp -r "$REPO_DIR/calibration" "$WORKSPACE/"

# Install Python dependencies
echo "[*] Installing Python dependencies..."
cd "$WORKSPACE"
pip3 install --user -r requirements.txt

# Set up udev rules for USB devices (optional)
echo "[*] Setting up udev rules for USB devices..."
sudo tee /etc/udev/rules.d/99-forge-lerobot.rules > /dev/null << 'EOF'
# LeRobot arm USB serial ports
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", MODE="0666"
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", MODE="0666"

# USB cameras
SUBSYSTEM=="video4linux", MODE="0666"
EOF

sudo udevadm control --reload-rules
sudo udevadm trigger
echo "[✓] udev rules configured"

# Create systemd services (optional)
read -p "Create systemd services for auto-start? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Arm server service
    sudo tee /etc/systemd/system/forge-arm.service > /dev/null << EOF
[Unit]
Description=Forge RDE Arm Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKSPACE
ExecStart=/usr/bin/python3 $WORKSPACE/arm_server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # Camera server service
    sudo tee /etc/systemd/system/forge-camera.service > /dev/null << EOF
[Unit]
Description=Forge RDE Camera Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKSPACE
ExecStart=/usr/bin/python3 $WORKSPACE/camera_server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    echo "[✓] Systemd services created"
    echo "    Enable with: sudo systemctl enable forge-arm forge-camera"
    echo "    Start with:  sudo systemctl start forge-arm forge-camera"
fi

echo ""
echo "========================================="
echo "  Installation Complete!"
echo "========================================="
echo ""
echo "Workspace: $WORKSPACE"
echo ""
echo "Next steps:"
echo "  1. Edit robot.config.json with your Jetson IP and device paths"
echo "  2. Run: python3 scripts/discover_devices.py to find USB devices"
echo "  3. Run: ./scripts/start-servers.sh to start the servers"
echo ""
