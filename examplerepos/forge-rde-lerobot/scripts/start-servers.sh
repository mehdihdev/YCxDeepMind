#!/bin/bash
# Forge RDE LeRobot - Start All Servers
# Run this on your Jetson to start arm and camera servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE="${FORGE_WORKSPACE:-$REPO_DIR}"

echo "========================================="
echo "  Forge RDE LeRobot - Starting Servers"
echo "========================================="
echo ""
echo "Workspace: $WORKSPACE"
echo "Config: $WORKSPACE/robot.config.json"
echo ""

# Check config exists
if [ ! -f "$WORKSPACE/robot.config.json" ]; then
    echo "[!] Error: robot.config.json not found in $WORKSPACE"
    exit 1
fi

# Extract ports from config
ARM_PORT=$(python3 -c "import json; print(json.load(open('$WORKSPACE/robot.config.json'))['servers']['arm']['port'])" 2>/dev/null || echo "8765")
CAM_PORT=$(python3 -c "import json; print(json.load(open('$WORKSPACE/robot.config.json'))['servers']['camera']['port'])" 2>/dev/null || echo "8766")

echo "Starting servers..."
echo "  Arm server:    ws://0.0.0.0:$ARM_PORT"
echo "  Camera server: ws://0.0.0.0:$CAM_PORT"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $ARM_PID $CAM_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start arm server in background
cd "$WORKSPACE"
python3 arm_server.py &
ARM_PID=$!
echo "[✓] Arm server started (PID: $ARM_PID)"

# Small delay to avoid port conflicts
sleep 1

# Start camera server in background
python3 camera_server.py &
CAM_PID=$!
echo "[✓] Camera server started (PID: $CAM_PID)"

echo ""
echo "========================================="
echo "  Servers Running"
echo "========================================="
echo ""
echo "Connect from Forge RDE:"
echo "  Arm:    ws://<JETSON_IP>:$ARM_PORT"
echo "  Camera: ws://<JETSON_IP>:$CAM_PORT"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Wait for both processes
wait $ARM_PID $CAM_PID
