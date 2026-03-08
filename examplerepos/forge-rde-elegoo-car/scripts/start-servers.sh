#!/bin/bash
# Forge RDE ELEGOO V4 - Start car + camera servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE="${FORGE_WORKSPACE:-$REPO_DIR}"

echo "========================================="
echo "  Forge RDE ELEGOO V4 - Starting Servers"
echo "========================================="
echo ""
echo "Workspace: $WORKSPACE"
echo "Config: $WORKSPACE/robot.config.json"
echo ""

if [ ! -f "$WORKSPACE/robot.config.json" ]; then
    echo "[!] Error: robot.config.json not found in $WORKSPACE"
    exit 1
fi

CAR_PORT=$(python3 -c "import json; print(json.load(open('$WORKSPACE/robot.config.json'))['servers']['car']['port'])" 2>/dev/null || echo "8765")
CAM_PORT=$(python3 -c "import json; print(json.load(open('$WORKSPACE/robot.config.json'))['servers']['camera']['port'])" 2>/dev/null || echo "8766")
ARDUINO_PORT=$(python3 -c "import json; print(json.load(open('$WORKSPACE/robot.config.json'))['controller']['port'])" 2>/dev/null || echo "/dev/ttyUSB0")

stop_port_listener() {
    local port="$1"
    local pids
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "[*] Releasing port $port from existing listener(s): $pids"
        kill $pids 2>/dev/null || true
        sleep 1
    fi
}

stop_port_listener "$CAR_PORT"
stop_port_listener "$CAM_PORT"

if [ -e "$ARDUINO_PORT" ]; then
    echo "[✓] Arduino found at $ARDUINO_PORT"
else
    echo "[!] Arduino not found at $ARDUINO_PORT"
    echo "    Car server will run in simulation mode until the controller is connected."
fi

cleanup() {
    echo ""
    echo "Stopping servers..."
    kill ${CAR_PID:-} ${CAM_PID:-} 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

cd "$WORKSPACE"

PROJECT_ROOT="$(cd "$REPO_DIR/../.." && pwd)"
PYTHON_BIN=""
for candidate in \
    "$WORKSPACE/.venv/bin/python" \
    "$REPO_DIR/.venv/bin/python" \
    "$PROJECT_ROOT/.venv/bin/python"
do
    if [ -x "$candidate" ]; then
        PYTHON_BIN="$candidate"
        break
    fi
done

if [ -z "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

"$PYTHON_BIN" jetson/car_server.py robot.config.json &
CAR_PID=$!
echo "[✓] Car server started (PID: $CAR_PID)"

sleep 1

"$PYTHON_BIN" jetson/camera_server.py robot.config.json &
CAM_PID=$!
echo "[✓] Camera server started (PID: $CAM_PID)"

echo ""
echo "Connect from Forge RDE:"
echo "  Control: ws://127.0.0.1:$CAR_PORT"
echo "  Camera:  ws://127.0.0.1:$CAM_PORT"
echo ""
echo "Press Ctrl+C to stop"
echo ""

wait $CAR_PID $CAM_PID
