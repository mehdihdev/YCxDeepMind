#!/usr/bin/env python3
"""
Forge RDE - Arm Server
Config-driven WebSocket server for leader-follower arm control.
Reads from robot.config.json for device paths, ports, and calibration.
"""

import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, List

import websockets


@dataclass
class RecordedFrame:
    timestamp: float
    leader_raw: List[int]
    follower_raw: List[int]


@dataclass
class Recording:
    frames: List[RecordedFrame] = field(default_factory=list)
    start_time: float = 0.0
    name: str = "recording"

# Optional: dynamixel SDK for real hardware
try:
    from lerobot.common.robot_devices.motors.feetech import FeetechMotorsBus
    HAS_FEETECH = True
except ImportError:
    HAS_FEETECH = False
    print("Warning: FeetechMotorsBus not available, running in simulation mode")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@dataclass
class JointCalibration:
    id: int
    name: str
    min_raw: int
    max_raw: int
    min_deg: float
    max_deg: float
    home_raw: int
    direction: int = 1


@dataclass
class ArmConfig:
    name: str  # "leader" or "follower"
    device: str
    baudrate: int
    motor_ids: List[int]
    calibration: List[JointCalibration]
    enabled: bool = True


class ArmController:
    """Controls a single arm (leader or follower)."""

    def __init__(self, config: ArmConfig, simulate: bool = False):
        self.config = config
        self.simulate = simulate
        self.bus = None
        self.positions = [2048] * len(config.motor_ids)  # Default positions

    async def connect(self):
        if self.simulate or not HAS_FEETECH:
            logger.info(f"[{self.config.name}] Running in simulation mode")
            return True

        try:
            motors = {f"motor_{i}": (mid, "sts3215") for i, mid in enumerate(self.config.motor_ids)}
            self.bus = FeetechMotorsBus(port=self.config.device, motors=motors)
            self.bus.connect()
            logger.info(f"[{self.config.name}] Connected to {self.config.device}")
            return True
        except Exception as e:
            logger.error(f"[{self.config.name}] Failed to connect: {e}")
            return False

    def read_positions(self) -> List[int]:
        """Read raw motor positions."""
        if self.simulate or not self.bus:
            return self.positions
        try:
            self.positions = [self.bus.read(f"motor_{i}", "Present_Position")
                            for i in range(len(self.config.motor_ids))]
        except Exception as e:
            logger.error(f"[{self.config.name}] Read error: {e}")
        return self.positions

    def write_positions(self, positions: List[int]):
        """Write raw motor positions."""
        if self.simulate or not self.bus:
            self.positions = positions
            return
        try:
            for i, pos in enumerate(positions):
                self.bus.write(f"motor_{i}", "Goal_Position", pos)
        except Exception as e:
            logger.error(f"[{self.config.name}] Write error: {e}")

    def raw_to_degrees(self, raw: int, joint_idx: int) -> float:
        """Convert raw motor value to degrees using calibration."""
        cal = self.config.calibration[joint_idx]
        raw_range = cal.max_raw - cal.min_raw
        deg_range = cal.max_deg - cal.min_deg
        normalized = (raw - cal.min_raw) / raw_range
        return cal.min_deg + (normalized * deg_range) * cal.direction

    def degrees_to_raw(self, degrees: float, joint_idx: int) -> int:
        """Convert degrees to raw motor value using calibration."""
        cal = self.config.calibration[joint_idx]
        deg_range = cal.max_deg - cal.min_deg
        raw_range = cal.max_raw - cal.min_raw
        normalized = (degrees - cal.min_deg) / deg_range * cal.direction
        return int(cal.min_raw + (normalized * raw_range))

    def get_state(self) -> Dict:
        """Get arm state with both raw and calibrated values."""
        raw_positions = self.read_positions()
        calibrated = [self.raw_to_degrees(raw, i) for i, raw in enumerate(raw_positions)]
        return {
            "arm": self.config.name,
            "enabled": self.config.enabled,
            "raw_positions": raw_positions,
            "positions": calibrated,
            "joint_names": [cal.name for cal in self.config.calibration]
        }

    def disconnect(self):
        if self.bus:
            self.bus.disconnect()
            logger.info(f"[{self.config.name}] Disconnected")


class ArmServer:
    """WebSocket server managing leader-follower arms."""

    def __init__(self, config_path: str):
        self.config_path = Path(config_path)
        self.config = self.load_config()
        self.leader: Optional[ArmController] = None
        self.follower: Optional[ArmController] = None
        self.clients = set()
        self.teleop_enabled = False
        self.running = False

        # Recording state
        self.recording = False
        self.current_recording: Optional[Recording] = None
        self.saved_recordings: List[Recording] = []

        # Playback state
        self.playback_enabled = False
        self.playback_loop = True
        self.playback_recording: Optional[Recording] = None
        self.playback_index = 0
        self.playback_start_time = 0.0

    def load_config(self) -> Dict:
        """Load robot.config.json."""
        with open(self.config_path) as f:
            return json.load(f)

    def load_calibration(self, path: str) -> List[JointCalibration]:
        """Load calibration file."""
        cal_path = self.config_path.parent / path
        with open(cal_path) as f:
            data = json.load(f)
        return [JointCalibration(**j) for j in data["joints"]]

    async def initialize(self):
        """Initialize arm controllers from config."""
        arms_config = self.config["arms"]
        simulate = not HAS_FEETECH

        # Leader arm
        if arms_config["leader"]["enabled"]:
            leader_cfg = arms_config["leader"]
            self.leader = ArmController(
                ArmConfig(
                    name="leader",
                    device=leader_cfg["device"],
                    baudrate=leader_cfg["baudrate"],
                    motor_ids=leader_cfg["motors"]["ids"],
                    calibration=self.load_calibration(leader_cfg["calibration"]),
                    enabled=True
                ),
                simulate=simulate
            )
            await self.leader.connect()

        # Follower arm
        if arms_config["follower"]["enabled"]:
            follower_cfg = arms_config["follower"]
            self.follower = ArmController(
                ArmConfig(
                    name="follower",
                    device=follower_cfg["device"],
                    baudrate=follower_cfg["baudrate"],
                    motor_ids=follower_cfg["motors"]["ids"],
                    calibration=self.load_calibration(follower_cfg["calibration"]),
                    enabled=True
                ),
                simulate=simulate
            )
            await self.follower.connect()

    async def handle_client(self, websocket):
        """Handle WebSocket client connection."""
        self.clients.add(websocket)
        client_id = id(websocket)
        logger.info(f"Client {client_id} connected. Total: {len(self.clients)}")

        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            logger.info(f"Client {client_id} disconnected. Total: {len(self.clients)}")

    async def handle_message(self, websocket, message: str):
        """Process incoming WebSocket message."""
        try:
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "get_state":
                await self.send_state(websocket)

            elif msg_type == "set_teleop":
                self.teleop_enabled = data.get("enabled", False)
                logger.info(f"Teleoperation: {'enabled' if self.teleop_enabled else 'disabled'}")
                await self.broadcast({"type": "teleop_status", "enabled": self.teleop_enabled})

            elif msg_type == "set_positions":
                # Set follower positions (from sim or external control)
                if self.follower and not self.teleop_enabled:
                    positions = data.get("positions", [])
                    raw_positions = [self.follower.degrees_to_raw(deg, i)
                                   for i, deg in enumerate(positions)]
                    self.follower.write_positions(raw_positions)

            elif msg_type == "upload_calibration":
                # Save new calibration
                arm = data.get("arm", "leader")
                calibration_data = data.get("calibration")
                if calibration_data:
                    cal_path = self.config["arms"][arm]["calibration"]
                    full_path = self.config_path.parent / cal_path
                    with open(full_path, "w") as f:
                        json.dump(calibration_data, f, indent=2)
                    logger.info(f"Saved calibration for {arm}")
                    # Reload calibration
                    if arm == "leader" and self.leader:
                        self.leader.config.calibration = self.load_calibration(cal_path)
                    elif arm == "follower" and self.follower:
                        self.follower.config.calibration = self.load_calibration(cal_path)

            elif msg_type == "home":
                # Move to home position
                arm = data.get("arm", "follower")
                controller = self.follower if arm == "follower" else self.leader
                if controller:
                    home_positions = [cal.home_raw for cal in controller.config.calibration]
                    controller.write_positions(home_positions)
                    logger.info(f"Homing {arm}")

            elif msg_type == "start_recording":
                # Start recording leader-follower teleop
                if not self.teleop_enabled:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "Enable teleop first before recording"
                    }))
                else:
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
                # Stop recording and save
                if self.recording and self.current_recording:
                    self.recording = False
                    self.saved_recordings.append(self.current_recording)
                    frame_count = len(self.current_recording.frames)
                    duration = time.time() - self.current_recording.start_time
                    logger.info(f"Recording stopped: {self.current_recording.name} ({frame_count} frames, {duration:.1f}s)")

                    # Save to file
                    recording_path = self.config_path.parent / f"{self.current_recording.name}.json"
                    with open(recording_path, "w") as f:
                        json.dump({
                            "name": self.current_recording.name,
                            "frame_count": frame_count,
                            "duration": duration,
                            "frames": [
                                {"t": fr.timestamp, "leader": fr.leader_raw, "follower": fr.follower_raw}
                                for fr in self.current_recording.frames
                            ]
                        }, f)
                    logger.info(f"Recording saved to {recording_path}")

                    await self.broadcast({
                        "type": "recording_status",
                        "recording": False,
                        "saved": True,
                        "name": self.current_recording.name,
                        "frame_count": frame_count,
                        "duration": duration,
                        "path": str(recording_path)
                    })
                    self.current_recording = None

            elif msg_type == "start_playback":
                # Start playback of recorded trajectory
                recording_name = data.get("name")
                self.playback_loop = data.get("loop", True)

                # Find recording to play
                recording = None
                if recording_name:
                    # Load from file
                    recording_path = self.config_path.parent / f"{recording_name}.json"
                    if recording_path.exists():
                        with open(recording_path) as f:
                            rec_data = json.load(f)
                        recording = Recording(
                            name=rec_data["name"],
                            start_time=time.time(),
                            frames=[
                                RecordedFrame(
                                    timestamp=fr["t"],
                                    leader_raw=fr["leader"],
                                    follower_raw=fr["follower"]
                                ) for fr in rec_data["frames"]
                            ]
                        )
                elif self.saved_recordings:
                    # Use most recent recording
                    recording = self.saved_recordings[-1]

                if recording and recording.frames:
                    self.playback_recording = recording
                    self.playback_enabled = True
                    self.playback_index = 0
                    self.playback_start_time = time.time()
                    self.teleop_enabled = False  # Disable teleop during playback
                    logger.info(f"Playback started: {recording.name} (loop={self.playback_loop})")
                    await self.broadcast({
                        "type": "playback_status",
                        "playing": True,
                        "loop": self.playback_loop,
                        "name": recording.name,
                        "total_frames": len(recording.frames)
                    })
                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "No recording available for playback"
                    }))

            elif msg_type == "stop_playback":
                # Stop playback
                if self.playback_enabled:
                    self.playback_enabled = False
                    logger.info("Playback stopped")
                    await self.broadcast({
                        "type": "playback_status",
                        "playing": False
                    })

            elif msg_type == "list_recordings":
                # List available recordings
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

    async def send_state(self, websocket):
        """Send current arm states to a client."""
        state = {"type": "state"}
        if self.leader:
            state["leader"] = self.leader.get_state()
        if self.follower:
            state["follower"] = self.follower.get_state()
        state["teleop_enabled"] = self.teleop_enabled
        await websocket.send(json.dumps(state))

    async def broadcast(self, message: Dict):
        """Broadcast message to all connected clients."""
        if not self.clients:
            return
        msg = json.dumps(message)
        await asyncio.gather(*[client.send(msg) for client in list(self.clients)], return_exceptions=True)

    async def teleop_loop(self):
        """Main loop for leader-follower teleoperation and playback."""
        while self.running:
            # Handle playback mode
            if self.playback_enabled and self.playback_recording and self.follower:
                frames = self.playback_recording.frames
                if frames:
                    # Get current frame based on elapsed time
                    elapsed = time.time() - self.playback_start_time
                    first_timestamp = frames[0].timestamp
                    recording_duration = frames[-1].timestamp - first_timestamp

                    # Calculate which frame to play
                    if recording_duration > 0:
                        if self.playback_loop:
                            # Loop: use modulo to wrap around
                            playback_time = elapsed % recording_duration
                        else:
                            playback_time = min(elapsed, recording_duration)

                        # Find frame closest to playback_time
                        target_time = first_timestamp + playback_time
                        frame = min(frames, key=lambda f: abs(f.timestamp - target_time))

                        # Write frame positions to follower
                        self.follower.write_positions(frame.follower_raw)

                        # Check if non-looping playback is done
                        if not self.playback_loop and elapsed >= recording_duration:
                            self.playback_enabled = False
                            logger.info("Playback completed")
                            await self.broadcast({
                                "type": "playback_status",
                                "playing": False,
                                "completed": True
                            })

            # Handle teleop mode (leader controls follower)
            elif self.teleop_enabled and self.leader and self.follower:
                # Read leader positions
                leader_raw = self.leader.read_positions()
                # Write to follower
                self.follower.write_positions(leader_raw)

                # Record frame if recording is active
                if self.recording and self.current_recording:
                    follower_raw = self.follower.read_positions()
                    frame = RecordedFrame(
                        timestamp=time.time(),
                        leader_raw=leader_raw.copy(),
                        follower_raw=follower_raw.copy()
                    )
                    self.current_recording.frames.append(frame)

            # Broadcast state to all clients
            state = {
                "type": "state",
                "teleop_enabled": self.teleop_enabled,
                "recording": self.recording,
                "playback": self.playback_enabled
            }
            if self.leader:
                state["leader"] = self.leader.get_state()
            if self.follower:
                state["follower"] = self.follower.get_state()
            if self.recording and self.current_recording:
                state["recording_frames"] = len(self.current_recording.frames)
                state["recording_name"] = self.current_recording.name
            if self.playback_enabled and self.playback_recording:
                state["playback_name"] = self.playback_recording.name
                state["playback_loop"] = self.playback_loop
            await self.broadcast(state)

            await asyncio.sleep(0.02)  # 50Hz update rate

    async def run(self):
        """Start the WebSocket server."""
        await self.initialize()

        server_config = self.config["servers"]["arm"]
        host = server_config.get("host", "0.0.0.0")
        port = server_config.get("port", 8765)

        self.running = True

        async with websockets.serve(self.handle_client, host, port):
            logger.info(f"Arm server running on ws://{host}:{port}")
            await self.teleop_loop()


def main():
    # Find config file
    config_path = os.environ.get("FORGE_CONFIG", "./robot.config.json")
    if len(sys.argv) > 1:
        config_path = sys.argv[1]

    if not Path(config_path).exists():
        # Try parent directory
        config_path = Path(__file__).parent.parent / "robot.config.json"

    if not Path(config_path).exists():
        logger.error(f"Config not found: {config_path}")
        sys.exit(1)

    logger.info(f"Using config: {config_path}")
    server = ArmServer(str(config_path))

    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        if server.leader:
            server.leader.disconnect()
        if server.follower:
            server.follower.disconnect()


if __name__ == "__main__":
    main()
