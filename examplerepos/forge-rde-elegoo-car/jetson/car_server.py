#!/usr/bin/env python3
"""
Forge RDE - ELEGOO Smart Car Server
Config-driven WebSocket server for differential drive car control.
Reads from robot.config.json for pin mappings, ports, and sensor config.

Supports:
- Velocity control (left/right wheel speeds)
- Ultrasonic distance sensing with servo pan
- IR line tracking sensors
- IR obstacle detection
- Recording trajectories for imitation learning
"""

import asyncio
import json
import logging
import os
import sys
import time
import glob
import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple

import websockets

# Optional: Serial communication with Arduino
try:
    import serial
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False
    print("Warning: pyserial not available, running in simulation mode")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def discover_serial_port() -> Optional[str]:
    """Best-effort serial auto-discovery for Arduino-style controllers."""
    patterns = [
        "/dev/ttyUSB*",
        "/dev/ttyACM*",
        "/dev/tty.usb*",
        "/dev/cu.usb*",
    ]
    candidates: List[str] = []
    for pattern in patterns:
        candidates.extend(glob.glob(pattern))
    return sorted(set(candidates))[0] if candidates else None


@dataclass
class RecordedFrame:
    timestamp: float
    left_speed: int
    right_speed: int
    ultrasonic_distance: float
    ultrasonic_angle: int
    ir_line: List[int]
    ir_obstacle: List[bool]


@dataclass
class Recording:
    frames: List[RecordedFrame] = field(default_factory=list)
    start_time: float = 0.0
    name: str = "recording"


class ArduinoInterface:
    """Serial communication with Arduino running ELEGOO car firmware."""

    def __init__(self, port: str, baudrate: int = 115200, simulate: bool = False):
        self.port = port
        self.baudrate = baudrate
        self.simulate = simulate
        self.serial: Optional[serial.Serial] = None
        self.protocol = "simulate" if simulate else "unknown"
        self.command_counter = 0

        # Simulated state
        self.sim_left_speed = 0
        self.sim_right_speed = 0
        self.sim_servo_angle = 90
        self.sim_ultrasonic = 100.0

    def connect(self) -> bool:
        if self.simulate or not HAS_SERIAL:
            logger.info(f"[Arduino] Running in simulation mode")
            return True

        if self._connect_forge_protocol():
            return True

        if self._connect_elegoo_protocol():
            return True

        logger.error("[Arduino] Failed to detect a supported serial protocol on %s", self.port)
        return False

    def _open_serial(self, baudrate: int) -> bool:
        self.disconnect()
        try:
            self.serial = serial.Serial(self.port, baudrate, timeout=0.25)
            self.baudrate = baudrate
            time.sleep(2)
            self.serial.reset_input_buffer()
            self.serial.reset_output_buffer()
            return True
        except Exception as error:
            logger.error("[Arduino] Failed to open %s at %s baud: %s", self.port, baudrate, error)
            self.serial = None
            return False

    def _connect_forge_protocol(self) -> bool:
        if not self._open_serial(self.baudrate):
            return False

        response = self._send_forge_command("PING")
        if response == "PONG":
            self.protocol = "forge"
            logger.info("[Arduino] Connected to %s using Forge serial protocol @ %s", self.port, self.baudrate)
            return True
        return False

    def _connect_elegoo_protocol(self) -> bool:
        if not self._open_serial(9600):
            return False

        response = self._send_elegoo_payload({"N": 21, "D1": 2}, timeout=0.6)
        if response and re.match(r"^\{f\d+_[^}]+\}$", response):
            self.protocol = "elegoo_json"
            logger.info("[Arduino] Connected to %s using stock ELEGOO JSON protocol @ 9600", self.port)
            self._send_elegoo_payload({"N": 100}, timeout=0.2)
            return True
        return False

    def disconnect(self):
        if self.serial:
            self.serial.close()
            logger.info("[Arduino] Disconnected")
            self.serial = None

    def _readline(self) -> str:
        if not self.serial:
            return ""
        return self.serial.readline().decode(errors="ignore").strip()

    def _read_until_brace(self, timeout: float = 0.5) -> str:
        if not self.serial:
            return ""

        deadline = time.time() + timeout
        buffer = b""
        while time.time() < deadline:
            chunk = self.serial.read_until(b"}")
            if chunk:
                buffer += chunk
                if b"}" in buffer:
                    break
        return buffer.decode(errors="ignore").strip()

    def _send_forge_command(self, cmd: str) -> Optional[str]:
        if not self.serial:
            return None
        self.serial.write(f"{cmd}\n".encode())
        return self._readline()

    def _send_elegoo_payload(self, payload: Dict, timeout: float = 0.35) -> Optional[str]:
        if not self.serial:
            return None
        self.command_counter += 1
        frame = {"H": f"f{self.command_counter}", **payload}
        self.serial.write(json.dumps(frame, separators=(",", ":")).encode())
        return self._read_until_brace(timeout=timeout)

    def _parse_elegoo_value(self, response: Optional[str]) -> Optional[str]:
        if not response:
            return None
        if response == "{ok}":
            return "ok"
        match = re.match(r"^\{[^_]+_(.+)\}$", response)
        return match.group(1) if match else None

    def send_command(self, cmd: str) -> Optional[str]:
        """Send command to Arduino and get response."""
        if self.simulate or not self.serial:
            return self._simulate_command(cmd)

        try:
            if self.protocol == "forge":
                return self._send_forge_command(cmd)
            if self.protocol == "elegoo_json":
                return self._send_elegoo_command(cmd)
            logger.warning("[Arduino] Unknown protocol, falling back to simulation for command: %s", cmd)
            return self._simulate_command(cmd)
        except Exception as e:
            logger.error(f"[Arduino] Command error: {e}")
            return None

    def _send_elegoo_command(self, cmd: str) -> Optional[str]:
        parts = cmd.split()
        if not parts:
            return "OK"

        command = parts[0].upper()

        if command == "PING":
            return "PONG"

        if command == "STOP":
            self._send_elegoo_payload({"N": 100}, timeout=0.2)
            self.sim_left_speed = 0
            self.sim_right_speed = 0
            return "OK"

        if command == "MOTOR" and len(parts) >= 3:
            left = int(parts[1])
            right = int(parts[2])
            self.sim_left_speed = left
            self.sim_right_speed = right
            direction, speed = self._map_left_right_to_elegoo(left, right)
            if speed == 0:
                self._send_elegoo_payload({"N": 100}, timeout=0.2)
            else:
                self._send_elegoo_payload({"N": 3, "D1": direction, "D2": speed}, timeout=0.2)
            return "OK"

        if command == "SERVO" and len(parts) >= 2:
            angle = max(0, min(180, int(parts[1])))
            self.sim_servo_angle = angle
            self._send_elegoo_payload({"N": 5, "D1": 1, "D2": angle * 10}, timeout=0.2)
            return "OK"

        if command == "ULTRASONIC":
            response = self._send_elegoo_payload({"N": 21, "D1": 2}, timeout=0.5)
            value = self._parse_elegoo_value(response)
            return value or "150"

        if command == "IR_LINE":
            readings: List[str] = []
            for index in (0, 1, 2):
                response = self._send_elegoo_payload({"N": 22, "D1": index}, timeout=0.4)
                value = self._parse_elegoo_value(response)
                readings.append(value or "0")
            return ",".join(readings)

        if command == "IR_OBSTACLE":
            return "0,0"

        if command == "STATE":
            ultrasonic = self.send_command("ULTRASONIC") or "150"
            ir_line = self.send_command("IR_LINE") or "0,0,0"
            return json.dumps({
                "left_speed": self.sim_left_speed,
                "right_speed": self.sim_right_speed,
                "servo_angle": self.sim_servo_angle,
                "ultrasonic": float(ultrasonic),
                "line": [int(x) for x in ir_line.split(",")],
            })

        return "OK"

    def _map_left_right_to_elegoo(self, left: int, right: int) -> Tuple[int, int]:
        speed = max(abs(left), abs(right))
        if speed < 10:
            return 0, 0

        if left >= 0 and right >= 0:
            return 3, speed
        if left <= 0 and right <= 0:
            return 4, speed
        if left < 0 < right:
            return 1, speed
        return 2, speed

    def _simulate_command(self, cmd: str) -> str:
        """Simulate Arduino responses."""
        parts = cmd.split()
        if not parts:
            return "OK"

        command = parts[0].upper()

        if command == "MOTOR":
            # MOTOR <left> <right>
            if len(parts) >= 3:
                self.sim_left_speed = int(parts[1])
                self.sim_right_speed = int(parts[2])
            return "OK"

        elif command == "SERVO":
            # SERVO <angle>
            if len(parts) >= 2:
                self.sim_servo_angle = int(parts[1])
            return "OK"

        elif command == "ULTRASONIC":
            # Return simulated distance
            # Simulate obstacle based on servo angle
            import random
            base_dist = 100 + 50 * abs(self.sim_servo_angle - 90) / 90
            self.sim_ultrasonic = base_dist + random.uniform(-5, 5)
            return f"{self.sim_ultrasonic:.1f}"

        elif command == "IR_LINE":
            # Return simulated line sensor values
            import random
            values = [random.randint(200, 800) for _ in range(3)]
            return ",".join(map(str, values))

        elif command == "IR_OBSTACLE":
            # Return simulated obstacle detection
            import random
            left = 1 if random.random() < 0.1 else 0
            right = 1 if random.random() < 0.1 else 0
            return f"{left},{right}"

        elif command == "STATE":
            # Return full state
            return json.dumps({
                "left_speed": self.sim_left_speed,
                "right_speed": self.sim_right_speed,
                "servo_angle": self.sim_servo_angle,
                "ultrasonic": self.sim_ultrasonic
            })

        return "OK"

    def set_motor_speeds(self, left: int, right: int):
        """Set left and right motor speeds (-255 to 255)."""
        left = max(-255, min(255, left))
        right = max(-255, min(255, right))
        self.send_command(f"MOTOR {left} {right}")

    def set_servo_angle(self, angle: int):
        """Set ultrasonic servo angle (0-180)."""
        angle = max(0, min(180, angle))
        self.send_command(f"SERVO {angle}")

    def get_ultrasonic_distance(self) -> float:
        """Get ultrasonic sensor distance in cm."""
        response = self.send_command("ULTRASONIC")
        try:
            return float(response) if response else 400.0
        except ValueError:
            return 400.0

    def get_ir_line_sensors(self) -> List[int]:
        """Get IR line sensor values (left, center, right)."""
        response = self.send_command("IR_LINE")
        try:
            return [int(x) for x in response.split(",")] if response else [0, 0, 0]
        except ValueError:
            return [0, 0, 0]

    def get_ir_obstacle_sensors(self) -> List[bool]:
        """Get IR obstacle sensor values (left, right)."""
        response = self.send_command("IR_OBSTACLE")
        try:
            values = [int(x) for x in response.split(",")] if response else [0, 0]
            return [v == 1 for v in values]
        except ValueError:
            return [False, False]

    def stop(self):
        """Emergency stop - stop all motors."""
        self.set_motor_speeds(0, 0)


class CarServer:
    """WebSocket server for ELEGOO Smart Car control."""

    def __init__(self, config_path: str):
        self.config_path = Path(config_path)
        self.config = self.load_config()
        self.arduino: Optional[ArduinoInterface] = None
        self.clients = set()
        self.running = False

        # Control state
        self.left_speed = 0
        self.right_speed = 0
        self.servo_angle = 90
        self.autonomous_mode = False

        # Sensor state
        self.ultrasonic_distance = 400.0
        self.ir_line = [0, 0, 0]
        self.ir_obstacle = [False, False]

        # Recording state
        self.recording = False
        self.current_recording: Optional[Recording] = None
        self.saved_recordings: List[Recording] = []

        # Playback state
        self.playback_enabled = False
        self.playback_loop = True
        self.playback_recording: Optional[Recording] = None
        self.playback_start_time = 0.0

    def load_config(self) -> Dict:
        """Load robot.config.json."""
        with open(self.config_path) as f:
            return json.load(f)

    async def initialize(self):
        """Initialize Arduino connection."""
        controller_config = self.config.get("controller", {})
        port = controller_config.get("port", "/dev/ttyUSB0")
        baudrate = controller_config.get("baudrate", 115200)

        if not port or not os.path.exists(port):
            detected_port = discover_serial_port()
            if detected_port:
                logger.info("[Arduino] Auto-detected controller at %s", detected_port)
                port = detected_port
            else:
                logger.warning("[Arduino] No serial controller detected, falling back to simulation mode")

        self.arduino = ArduinoInterface(
            port=port,
            baudrate=baudrate,
            simulate=not HAS_SERIAL or not port or not os.path.exists(port)
        )
        self.arduino.connect()

        # Set initial servo position
        self.arduino.set_servo_angle(90)

    async def handle_client(self, websocket):
        """Handle WebSocket client connection."""
        self.clients.add(websocket)
        client_id = id(websocket)
        logger.info(f"Client {client_id} connected. Total: {len(self.clients)}")

        try:
            await websocket.send(json.dumps({
                "type": "connected",
                "robot_type": "elegoo_car",
                "features": ["drive", "set_velocity", "scan", "camera", "recording"],
            }))
            await self.send_state(websocket)
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            # Safety: stop motors when client disconnects
            if not self.clients:
                self.arduino.stop()
            logger.info(f"Client {client_id} disconnected. Total: {len(self.clients)}")

    async def handle_message(self, websocket, message: str):
        """Process incoming WebSocket message."""
        try:
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "get_state":
                await self.send_state(websocket)

            elif msg_type == "set_velocity":
                # Set wheel velocities directly
                self.left_speed = data.get("left", 0)
                self.right_speed = data.get("right", 0)
                self.arduino.set_motor_speeds(self.left_speed, self.right_speed)

            elif msg_type == "drive":
                # Arcade-style drive (forward/backward + turn)
                forward = data.get("forward", 0)  # -255 to 255
                turn = data.get("turn", 0)  # -255 to 255
                self.left_speed = max(-255, min(255, forward + turn))
                self.right_speed = max(-255, min(255, forward - turn))
                self.arduino.set_motor_speeds(self.left_speed, self.right_speed)

            elif msg_type == "stop":
                # Emergency stop
                self.left_speed = 0
                self.right_speed = 0
                self.arduino.stop()
                logger.info("Emergency stop")

            elif msg_type == "set_servo":
                # Set ultrasonic servo angle
                self.servo_angle = data.get("angle", 90)
                self.arduino.set_servo_angle(self.servo_angle)

            elif msg_type == "scan":
                # Perform ultrasonic scan
                angles = data.get("angles", [0, 45, 90, 135, 180])
                scan_results = await self.perform_scan(angles)
                await websocket.send(json.dumps({
                    "type": "scan_result",
                    "data": scan_results
                }))

            elif msg_type == "set_autonomous":
                self.autonomous_mode = data.get("enabled", False)
                logger.info(f"Autonomous mode: {'enabled' if self.autonomous_mode else 'disabled'}")
                await self.broadcast({"type": "autonomous_status", "enabled": self.autonomous_mode})

            elif msg_type == "start_recording":
                self.recording = True
                self.current_recording = Recording(
                    frames=[],
                    start_time=time.time(),
                    name=data.get("name", f"recording_{int(time.time())}")
                )
                logger.info(f"Recording started: {self.current_recording.name}")
                await self.broadcast({
                    "type": "recording_status",
                    "recording": True,
                    "name": self.current_recording.name
                })

            elif msg_type == "stop_recording":
                if self.recording and self.current_recording:
                    self.recording = False
                    self.saved_recordings.append(self.current_recording)
                    frame_count = len(self.current_recording.frames)
                    duration = time.time() - self.current_recording.start_time

                    # Save to file
                    recording_path = self.config_path.parent / f"{self.current_recording.name}.json"
                    with open(recording_path, "w") as f:
                        json.dump({
                            "name": self.current_recording.name,
                            "robot_type": "elegoo_car",
                            "frame_count": frame_count,
                            "duration": duration,
                            "frames": [
                                {
                                    "t": fr.timestamp,
                                    "left": fr.left_speed,
                                    "right": fr.right_speed,
                                    "ultrasonic": fr.ultrasonic_distance,
                                    "servo": fr.ultrasonic_angle,
                                    "ir_line": fr.ir_line,
                                    "ir_obstacle": fr.ir_obstacle
                                }
                                for fr in self.current_recording.frames
                            ]
                        }, f)

                    logger.info(f"Recording saved: {recording_path}")
                    await self.broadcast({
                        "type": "recording_status",
                        "recording": False,
                        "saved": True,
                        "name": self.current_recording.name,
                        "frame_count": frame_count,
                        "duration": duration
                    })
                    self.current_recording = None

            elif msg_type == "start_playback":
                recording_name = data.get("name")
                self.playback_loop = data.get("loop", True)

                # Load recording
                recording_path = self.config_path.parent / f"{recording_name}.json"
                if recording_path.exists():
                    with open(recording_path) as f:
                        rec_data = json.load(f)
                    self.playback_recording = Recording(
                        name=rec_data["name"],
                        start_time=time.time(),
                        frames=[
                            RecordedFrame(
                                timestamp=fr["t"],
                                left_speed=fr["left"],
                                right_speed=fr["right"],
                                ultrasonic_distance=fr.get("ultrasonic", 0),
                                ultrasonic_angle=fr.get("servo", 90),
                                ir_line=fr.get("ir_line", [0, 0, 0]),
                                ir_obstacle=fr.get("ir_obstacle", [False, False])
                            ) for fr in rec_data["frames"]
                        ]
                    )
                    self.playback_enabled = True
                    self.playback_start_time = time.time()
                    logger.info(f"Playback started: {recording_name}")
                    await self.broadcast({
                        "type": "playback_status",
                        "playing": True,
                        "name": recording_name,
                        "loop": self.playback_loop
                    })
                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": f"Recording not found: {recording_name}"
                    }))

            elif msg_type == "stop_playback":
                self.playback_enabled = False
                self.arduino.stop()
                logger.info("Playback stopped")
                await self.broadcast({"type": "playback_status", "playing": False})

            elif msg_type == "list_recordings":
                recordings_dir = self.config_path.parent
                recording_files = list(recordings_dir.glob("recording_*.json"))
                recordings = []
                for rf in recording_files:
                    try:
                        with open(rf) as f:
                            rec_data = json.load(f)
                        recordings.append({
                            "name": rec_data.get("name", rf.stem),
                            "frame_count": rec_data.get("frame_count", 0),
                            "duration": rec_data.get("duration", 0)
                        })
                    except:
                        pass
                await websocket.send(json.dumps({
                    "type": "recordings_list",
                    "recordings": recordings
                }))

        except Exception as e:
            logger.error(f"Message handling error: {e}")
            await websocket.send(json.dumps({"type": "error", "message": str(e)}))

    async def perform_scan(self, angles: List[int]) -> List[Dict]:
        """Perform ultrasonic scan at multiple angles."""
        results = []
        for angle in angles:
            self.arduino.set_servo_angle(angle)
            await asyncio.sleep(0.1)  # Wait for servo
            distance = self.arduino.get_ultrasonic_distance()
            results.append({"angle": angle, "distance": distance})
        # Return to center
        self.arduino.set_servo_angle(90)
        return results

    async def send_state(self, websocket):
        """Send current car state to a client."""
        state = {
            "type": "state",
            "left_speed": self.left_speed,
            "right_speed": self.right_speed,
            "servo_angle": self.servo_angle,
            "ultrasonic_distance": self.ultrasonic_distance,
            "ir_line": self.ir_line,
            "ir_obstacle": self.ir_obstacle,
            "autonomous_mode": self.autonomous_mode,
            "recording": self.recording,
            "playback": self.playback_enabled
        }
        await websocket.send(json.dumps(state))

    async def broadcast(self, message: Dict):
        """Broadcast message to all connected clients."""
        if not self.clients:
            return
        msg = json.dumps(message)
        await asyncio.gather(*[client.send(msg) for client in list(self.clients)], return_exceptions=True)

    async def control_loop(self):
        """Main control loop - read sensors, handle autonomous mode, broadcast state."""
        while self.running:
            update_rate_hz = self.config.get("control", {}).get("update_rate_hz", 50)
            if self.arduino and self.arduino.protocol == "elegoo_json":
                update_rate_hz = min(update_rate_hz, 8)
            sensor_update_interval = 1.0 / max(update_rate_hz, 1)

            # Read sensors
            self.ultrasonic_distance = self.arduino.get_ultrasonic_distance()
            self.ir_line = self.arduino.get_ir_line_sensors()
            self.ir_obstacle = self.arduino.get_ir_obstacle_sensors()

            # Handle playback mode
            if self.playback_enabled and self.playback_recording:
                frames = self.playback_recording.frames
                if frames:
                    elapsed = time.time() - self.playback_start_time
                    first_timestamp = frames[0].timestamp
                    recording_duration = frames[-1].timestamp - first_timestamp

                    if recording_duration > 0:
                        if self.playback_loop:
                            playback_time = elapsed % recording_duration
                        else:
                            playback_time = min(elapsed, recording_duration)

                        target_time = first_timestamp + playback_time
                        frame = min(frames, key=lambda f: abs(f.timestamp - target_time))

                        # Apply recorded commands
                        self.left_speed = frame.left_speed
                        self.right_speed = frame.right_speed
                        self.arduino.set_motor_speeds(self.left_speed, self.right_speed)
                        self.arduino.set_servo_angle(frame.ultrasonic_angle)

                        if not self.playback_loop and elapsed >= recording_duration:
                            self.playback_enabled = False
                            self.arduino.stop()
                            await self.broadcast({"type": "playback_status", "playing": False, "completed": True})

            # Handle autonomous mode (simple obstacle avoidance)
            elif self.autonomous_mode:
                await self.autonomous_behavior()

            # Record frame if recording
            if self.recording and self.current_recording:
                frame = RecordedFrame(
                    timestamp=time.time(),
                    left_speed=self.left_speed,
                    right_speed=self.right_speed,
                    ultrasonic_distance=self.ultrasonic_distance,
                    ultrasonic_angle=self.servo_angle,
                    ir_line=self.ir_line.copy(),
                    ir_obstacle=self.ir_obstacle.copy()
                )
                self.current_recording.frames.append(frame)

            # Broadcast state
            state = {
                "type": "state",
                "left_speed": self.left_speed,
                "right_speed": self.right_speed,
                "servo_angle": self.servo_angle,
                "ultrasonic_distance": self.ultrasonic_distance,
                "ir_line": self.ir_line,
                "ir_obstacle": self.ir_obstacle,
                "autonomous_mode": self.autonomous_mode,
                "recording": self.recording,
                "playback": self.playback_enabled
            }
            if self.recording and self.current_recording:
                state["recording_frames"] = len(self.current_recording.frames)
                state["recording_name"] = self.current_recording.name

            await self.broadcast(state)
            await asyncio.sleep(sensor_update_interval)

    async def autonomous_behavior(self):
        """Simple obstacle avoidance behavior."""
        obstacle_threshold = 30  # cm
        line_threshold = self.config.get("sensors", {}).get("ir_line", {}).get("threshold", 500)

        # Check for obstacles
        if self.ultrasonic_distance < obstacle_threshold or any(self.ir_obstacle):
            # Obstacle detected - stop and scan
            self.arduino.stop()
            await asyncio.sleep(0.1)

            # Scan left and right
            self.arduino.set_servo_angle(45)
            await asyncio.sleep(0.15)
            left_dist = self.arduino.get_ultrasonic_distance()

            self.arduino.set_servo_angle(135)
            await asyncio.sleep(0.15)
            right_dist = self.arduino.get_ultrasonic_distance()

            self.arduino.set_servo_angle(90)

            # Turn towards more open direction
            if left_dist > right_dist:
                self.left_speed = -150
                self.right_speed = 150
            else:
                self.left_speed = 150
                self.right_speed = -150

            self.arduino.set_motor_speeds(self.left_speed, self.right_speed)
            await asyncio.sleep(0.3)
        else:
            # No obstacle - drive forward
            self.left_speed = 150
            self.right_speed = 150
            self.arduino.set_motor_speeds(self.left_speed, self.right_speed)

    async def run(self):
        """Start the WebSocket server."""
        await self.initialize()

        server_config = self.config.get("servers", {}).get("car", {})
        host = server_config.get("host", "0.0.0.0")
        port = server_config.get("port", 8765)

        self.running = True

        async with websockets.serve(self.handle_client, host, port):
            logger.info(f"ELEGOO Car server running on ws://{host}:{port}")
            await self.control_loop()


def main():
    config_path = os.environ.get("FORGE_CONFIG", "./robot.config.json")
    if len(sys.argv) > 1:
        config_path = sys.argv[1]

    if not Path(config_path).exists():
        config_path = Path(__file__).parent.parent / "robot.config.json"

    if not Path(config_path).exists():
        logger.error(f"Config not found: {config_path}")
        sys.exit(1)

    logger.info(f"Using config: {config_path}")
    server = CarServer(str(config_path))

    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        if server.arduino:
            server.arduino.stop()
            server.arduino.disconnect()


if __name__ == "__main__":
    main()
