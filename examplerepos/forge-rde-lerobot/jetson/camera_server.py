#!/usr/bin/env python3
"""
Forge RDE - Camera Server
Config-driven WebSocket server for streaming camera feeds.
Supports multiple cameras defined in robot.config.json.
"""

import asyncio
import json
import logging
import os
import sys
import base64
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, List, Set

import websockets

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    print("Warning: OpenCV not available")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@dataclass
class CameraConfig:
    id: str
    name: str
    device: str
    resolution: tuple
    fps: int
    encoding: str
    enabled: bool


class Camera:
    """Manages a single camera device."""

    def __init__(self, config: CameraConfig):
        self.config = config
        self.capture: Optional[cv2.VideoCapture] = None
        self.last_frame: Optional[bytes] = None
        self.frame_count = 0

    def connect(self) -> bool:
        """Open the camera device."""
        if not HAS_CV2:
            logger.warning(f"[{self.config.id}] OpenCV not available")
            return False

        try:
            # Parse device - could be /dev/video0 or just 0
            device = self.config.device
            if device.startswith("/dev/video"):
                device_idx = int(device.replace("/dev/video", ""))
            else:
                device_idx = int(device)

            self.capture = cv2.VideoCapture(device_idx)

            if not self.capture.isOpened():
                logger.error(f"[{self.config.id}] Failed to open {self.config.device}")
                return False

            # Set resolution and FPS
            self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.resolution[0])
            self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.resolution[1])
            self.capture.set(cv2.CAP_PROP_FPS, self.config.fps)

            # Set MJPEG if available (faster)
            if self.config.encoding == "mjpeg":
                self.capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))

            logger.info(f"[{self.config.id}] Connected to {self.config.device} "
                       f"@ {self.config.resolution[0]}x{self.config.resolution[1]}")
            return True

        except Exception as e:
            logger.error(f"[{self.config.id}] Connection error: {e}")
            return False

    def read_frame(self) -> Optional[bytes]:
        """Capture and encode a frame as JPEG."""
        if not self.capture or not self.capture.isOpened():
            return None

        ret, frame = self.capture.read()
        if not ret:
            return None

        # Encode as JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        self.last_frame = buffer.tobytes()
        self.frame_count += 1
        return self.last_frame

    def get_frame_base64(self) -> Optional[str]:
        """Get current frame as base64 string."""
        frame = self.read_frame()
        if frame:
            return base64.b64encode(frame).decode('utf-8')
        return None

    def disconnect(self):
        """Release the camera."""
        if self.capture:
            self.capture.release()
            logger.info(f"[{self.config.id}] Disconnected")


class CameraServer:
    """WebSocket server for streaming multiple cameras."""

    def __init__(self, config_path: str):
        self.config_path = Path(config_path)
        self.config = self.load_config()
        self.cameras: Dict[str, Camera] = {}
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.subscriptions: Dict[websockets.WebSocketServerProtocol, Set[str]] = {}
        self.running = False

    def load_config(self) -> Dict:
        """Load robot.config.json."""
        with open(self.config_path) as f:
            return json.load(f)

    async def initialize(self):
        """Initialize cameras from config."""
        for cam_cfg in self.config.get("cameras", []):
            if not cam_cfg.get("enabled", True):
                logger.info(f"Camera {cam_cfg['id']} disabled, skipping")
                continue

            camera = Camera(CameraConfig(
                id=cam_cfg["id"],
                name=cam_cfg.get("name", cam_cfg["id"]),
                device=cam_cfg["device"],
                resolution=tuple(cam_cfg.get("resolution", [640, 480])),
                fps=cam_cfg.get("fps", 30),
                encoding=cam_cfg.get("encoding", "mjpeg"),
                enabled=True
            ))

            if camera.connect():
                self.cameras[cam_cfg["id"]] = camera
            else:
                logger.warning(f"Failed to initialize camera {cam_cfg['id']}")

        logger.info(f"Initialized {len(self.cameras)} cameras")

    async def handle_client(self, websocket):
        """Handle WebSocket client connection."""
        self.clients.add(websocket)
        self.subscriptions[websocket] = set()
        client_id = id(websocket)
        logger.info(f"Client {client_id} connected. Total: {len(self.clients)}")

        try:
            # Send available cameras
            await websocket.send(json.dumps({
                "type": "cameras",
                "cameras": [
                    {"id": cam.config.id, "name": cam.config.name}
                    for cam in self.cameras.values()
                ]
            }))

            async for message in websocket:
                await self.handle_message(websocket, message)

        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            self.subscriptions.pop(websocket, None)
            logger.info(f"Client {client_id} disconnected. Total: {len(self.clients)}")

    async def handle_message(self, websocket, message: str):
        """Process incoming WebSocket message."""
        try:
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "subscribe":
                # Subscribe to camera feeds
                camera_ids = data.get("cameras", [])
                self.subscriptions[websocket] = set(camera_ids)
                logger.info(f"Client subscribed to cameras: {camera_ids}")

            elif msg_type == "unsubscribe":
                camera_ids = data.get("cameras", [])
                self.subscriptions[websocket] -= set(camera_ids)

            elif msg_type == "get_frame":
                # Get single frame from a camera
                camera_id = data.get("camera")
                if camera_id in self.cameras:
                    frame = self.cameras[camera_id].get_frame_base64()
                    if frame:
                        await websocket.send(json.dumps({
                            "type": "frame",
                            "camera": camera_id,
                            "data": frame
                        }))

            elif msg_type == "list_cameras":
                await websocket.send(json.dumps({
                    "type": "cameras",
                    "cameras": [
                        {"id": cam.config.id, "name": cam.config.name}
                        for cam in self.cameras.values()
                    ]
                }))

        except Exception as e:
            logger.error(f"Message handling error: {e}")

    async def stream_loop(self):
        """Main loop for streaming frames to subscribed clients."""
        target_interval = 1.0 / 30  # 30 FPS target

        while self.running:
            start_time = asyncio.get_event_loop().time()

            # Capture frames from all cameras
            frames = {}
            for cam_id, camera in self.cameras.items():
                frame = camera.get_frame_base64()
                if frame:
                    frames[cam_id] = frame

            # Send to subscribed clients
            for client in list(self.clients):
                subscribed = self.subscriptions.get(client, set())
                if not subscribed:
                    continue

                for cam_id in subscribed:
                    if cam_id in frames:
                        try:
                            await client.send(json.dumps({
                                "type": "frame",
                                "camera": cam_id,
                                "data": frames[cam_id]
                            }))
                        except Exception:
                            pass  # Client disconnected

            # Maintain frame rate
            elapsed = asyncio.get_event_loop().time() - start_time
            sleep_time = max(0, target_interval - elapsed)
            await asyncio.sleep(sleep_time)

    async def run(self):
        """Start the WebSocket server."""
        await self.initialize()

        if not self.cameras:
            logger.warning("No cameras available, server will still run")

        server_config = self.config["servers"]["camera"]
        host = server_config.get("host", "0.0.0.0")
        port = server_config.get("port", 8766)

        self.running = True

        async with websockets.serve(self.handle_client, host, port):
            logger.info(f"Camera server running on ws://{host}:{port}")
            await self.stream_loop()


def main():
    # Find config file
    config_path = os.environ.get("FORGE_CONFIG", "./robot.config.json")
    if len(sys.argv) > 1:
        config_path = sys.argv[1]

    if not Path(config_path).exists():
        config_path = Path(__file__).parent.parent / "robot.config.json"

    if not Path(config_path).exists():
        logger.error(f"Config not found: {config_path}")
        sys.exit(1)

    logger.info(f"Using config: {config_path}")
    server = CameraServer(str(config_path))

    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        for camera in server.cameras.values():
            camera.disconnect()


if __name__ == "__main__":
    main()
