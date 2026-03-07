#!/bin/bash
# Forge RDE ELEGOO Car - One-Command Deploy to Jetson/Raspberry Pi
# Copies this repo to your device and runs installation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config
CONFIG_FILE="$SCRIPT_DIR/robot.config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: robot.config.json not found"
    exit 1
fi

# Extract connection info from config
JETSON_IP=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['jetson']['ip'])")
JETSON_USER=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['jetson']['ssh_user'])")
JETSON_WORKSPACE=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['jetson']['workspace'])")

echo "========================================="
echo "  Forge RDE ELEGOO Car - Deploy"
echo "========================================="
echo ""
echo "Target: ${JETSON_USER}@${JETSON_IP}"
echo "Workspace: ${JETSON_WORKSPACE}"
echo ""

# Test SSH connection
echo "[*] Testing SSH connection..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "${JETSON_USER}@${JETSON_IP}" "echo 'SSH OK'" 2>/dev/null; then
    echo "[!] Cannot connect. Please ensure:"
    echo "    1. Device is powered on and connected to network"
    echo "    2. SSH is enabled"
    echo "    3. Your SSH key is set up (ssh-copy-id ${JETSON_USER}@${JETSON_IP})"
    echo "    4. robot.config.json has correct IP address"
    exit 1
fi
echo "[✓] SSH connection OK"

# Create remote workspace
echo "[*] Creating remote workspace..."
ssh "${JETSON_USER}@${JETSON_IP}" "mkdir -p ${JETSON_WORKSPACE}"

# Sync files
echo "[*] Syncing files..."
rsync -avz --progress \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude 'node_modules' \
    --exclude 'docs/*.pdf' \
    --exclude '*.zip' \
    "$SCRIPT_DIR/" "${JETSON_USER}@${JETSON_IP}:${JETSON_WORKSPACE}/"

echo "[✓] Files synced"

# Run installation
echo "[*] Installing dependencies..."
ssh -t "${JETSON_USER}@${JETSON_IP}" "cd ${JETSON_WORKSPACE} && pip3 install --user -r jetson/requirements.txt"

# Make scripts executable
ssh "${JETSON_USER}@${JETSON_IP}" "chmod +x ${JETSON_WORKSPACE}/scripts/*.sh"

echo ""
echo "========================================="
echo "  Deploy Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Connect Arduino to ${JETSON_USER}@${JETSON_IP} via USB"
echo ""
echo "  2. SSH into device:"
echo "     ssh ${JETSON_USER}@${JETSON_IP}"
echo ""
echo "  3. Start server:"
echo "     cd ${JETSON_WORKSPACE}"
echo "     ./scripts/start-servers.sh"
echo ""
echo "  Or start remotely:"
echo "     ssh ${JETSON_USER}@${JETSON_IP} 'cd ${JETSON_WORKSPACE} && ./scripts/start-servers.sh'"
echo ""
