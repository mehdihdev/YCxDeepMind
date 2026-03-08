#!/bin/bash
# Full installation script for ELEGOO Car on Jetson/Raspberry Pi

set -e

echo "========================================="
echo "  ELEGOO Smart Car - Full Installation"
echo "========================================="
echo ""

# Update system
echo "[*] Updating system packages..."
sudo apt-get update

# Install Python dependencies in a local virtual environment
echo "[*] Installing Python packages into .venv..."
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r jetson/requirements.txt

# Add user to dialout group for serial access
echo "[*] Adding user to dialout group..."
sudo usermod -a -G dialout $USER

# Add user to video group for camera access
echo "[*] Adding user to video group..."
sudo usermod -a -G video $USER

# Install Arduino CLI (optional)
echo "[*] Installing Arduino CLI..."
if ! command -v arduino-cli &> /dev/null; then
    curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
    echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
fi

echo ""
echo "========================================="
echo "  Installation Complete!"
echo "========================================="
echo ""
echo "IMPORTANT: Log out and back in for group changes to take effect."
echo ""
echo "Next steps:"
echo "  1. Upload Arduino firmware to your ELEGOO car"
echo "  2. Connect Arduino via USB"
echo "  3. Run: ./scripts/start-servers.sh"
echo ""
