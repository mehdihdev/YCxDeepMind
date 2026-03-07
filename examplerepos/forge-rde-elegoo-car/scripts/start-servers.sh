#!/bin/bash
# Start ELEGOO Car servers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "Starting ELEGOO Car Server..."
echo "Config: $REPO_DIR/robot.config.json"
echo ""

# Check if Arduino is connected
ARDUINO_PORT=$(python3 -c "import json; print(json.load(open('$REPO_DIR/robot.config.json'))['controller']['port'])" 2>/dev/null)

if [ -e "$ARDUINO_PORT" ]; then
    echo "[✓] Arduino found at $ARDUINO_PORT"
else
    echo "[!] Arduino not found at $ARDUINO_PORT"
    echo "    Running in simulation mode..."
fi

# Start car server
cd "$REPO_DIR"
python3 jetson/car_server.py robot.config.json
