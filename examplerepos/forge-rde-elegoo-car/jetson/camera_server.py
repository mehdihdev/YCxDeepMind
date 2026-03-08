#!/usr/bin/env python3
"""
Forge RDE - ELEGOO Camera Server
Streams either a USB camera or ESP32-CAM feed defined in robot.config.json.
Protocol is compatible with the Forge RDE LiveCameraFeed component.
"""

import asyncio
import base64
import json
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Set

import websockets

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    print("Warning: OpenCV not available")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class CameraConfig:
    id: str
    name: str
    device: Optional[str]
    resolution: tuple[int, int]
    fps: int
    encoding: str
    enabled: bool
    stream_url: Optional[str] = None


class Camera:
    def __init__(self, config: CameraConfig):
        self.config = config
        self.capture: Optional["cv2.VideoCapture"] = None
        self.width = config.resolution[0]
        self.height = config.resolution[1]

    def connect(self) -> bool:
        if not HAS_CV2:
            logger.warning("[%s] OpenCV not available", self.config.id)
            return False

        if self.config.stream_url:
            source = self.config.stream_url
        elif self.config.device and self.config.device.strip():
            source = self.config.device
        else:
            source = None

        if not source:
            logger.error("[%s] No camera source configured", self.config.id)
            return False

        try:
            if sys.platform == "darwin" and source.startswith("/dev/video"):
                device_idx = int(source.replace("/dev/video", "") or "0")
                logger.info("[%s] Mapping Linux camera path %s to macOS camera index %s", self.config.id, source, device_idx)
                self.capture = cv2.VideoCapture(device_idx, cv2.CAP_AVFOUNDATION)
            elif source.startswith("/dev/video"):
                device_idx = int(source.replace("/dev/video", ""))
                self.capture = cv2.VideoCapture(device_idx)
            elif source.isdigit():
                device_idx = int(source)
                if sys.platform == "darwin":
                    self.capture = cv2.VideoCapture(device_idx, cv2.CAP_AVFOUNDATION)
                else:
                    self.capture = cv2.VideoCapture(device_idx)
            else:
                self.capture = cv2.VideoCapture(source)

            if not self.capture or not self.capture.isOpened():
                logger.error("[%s] Failed to open %s", self.config.id, source)
                return False

            self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.resolution[0])
            self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.resolution[1])
            self.capture.set(cv2.CAP_PROP_FPS, self.config.fps)
            if self.config.encoding == "mjpeg":
                self.capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))

            self.width = int(self.capture.get(cv2.CAP_PROP_FRAME_WIDTH) or self.config.resolution[0])
            self.height = int(self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or self.config.resolution[1])
            logger.info("[%s] Connected to %s", self.config.id, source)
            return True
        except Exception as error:
            logger.error("[%s] Camera connection failed: %s", self.config.id, error)
            return False

    def get_frame_base64(self) -> Optional[str]:
        if not self.capture or not self.capture.isOpened():
            return None

        ok, frame = self.capture.read()
        if not ok:
            return None

        ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ok:
            return None
        return base64.b64encode(buffer.tobytes()).decode("utf-8")

    def disconnect(self) -> None:
        if self.capture:
            self.capture.release()
            logger.info("[%s] Disconnected", self.config.id)


class CameraServer:
    def __init__(self, config_path: str):
        self.config_path = Path(config_path)
        self.config = self.load_config()
        self.cameras: Dict[str, Camera] = {}
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.subscriptions: Dict[websockets.WebSocketServerProtocol, Set[str]] = {}
        self.running = False

    def load_config(self) -> Dict:
        with open(self.config_path) as handle:
            return json.load(handle)

    def resolve_stream_url(self, camera_cfg: Dict) -> Optional[str]:
        if camera_cfg.get("stream_url"):
            return camera_cfg["stream_url"]
        if camera_cfg.get("type") in {"esp32_wrover", "esp32_cam"} and camera_cfg.get("ip"):
            port = camera_cfg.get("stream_port", 81)
            path = camera_cfg.get("stream_path", "/stream")
            return f"http://{camera_cfg['ip']}:{port}{path}"
        return None

    async def initialize(self):
        for camera_cfg in self.config.get("cameras", []):
            if not camera_cfg.get("enabled", True):
                continue

            camera = Camera(
                CameraConfig(
                    id=camera_cfg["id"],
                    name=camera_cfg.get("name", camera_cfg["id"]),
                    device=(
                        None
                        if camera_cfg.get("type") in {"esp32_wrover", "esp32_cam"} and not self.resolve_stream_url(camera_cfg)
                        else camera_cfg.get("device")
                    ),
                    resolution=tuple(camera_cfg.get("resolution", [640, 480])),
                    fps=camera_cfg.get("fps", 15),
                    encoding=camera_cfg.get("encoding", "mjpeg"),
                    enabled=True,
                    stream_url=self.resolve_stream_url(camera_cfg)
                )
            )
            if camera.connect():
                self.cameras[camera.config.id] = camera
            else:
                logger.warning("Skipping unavailable camera %s", camera_cfg["id"])

        logger.info("Initialized %s camera(s)", len(self.cameras))

    async def send_camera_info(self, websocket):
        camera_info = {
            cam_id: {
                "name": camera.config.name,
                "width": camera.width,
                "height": camera.height,
                "fps": camera.config.fps
            }
            for cam_id, camera in self.cameras.items()
        }
        await websocket.send(json.dumps({"type": "camera_info", "cameras": camera_info}))
        await websocket.send(
            json.dumps(
                {
                    "type": "cameras",
                    "cameras": [
                        {
                            "id": cam_id,
                            "name": camera.config.name,
                            "width": camera.width,
                            "height": camera.height,
                            "fps": camera.config.fps
                        }
                        for cam_id, camera in self.cameras.items()
                    ]
                }
            )
        )

    async def handle_client(self, websocket):
        self.clients.add(websocket)
        self.subscriptions[websocket] = set()
        client_id = id(websocket)
        logger.info("Client %s connected. Total: %s", client_id, len(self.clients))

        try:
            await self.send_camera_info(websocket)
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            self.subscriptions.pop(websocket, None)
            logger.info("Client %s disconnected. Total: %s", client_id, len(self.clients))

    async def handle_message(self, websocket, message: str):
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            return

        msg_type = data.get("type")
        if msg_type == "list_cameras":
            await self.send_camera_info(websocket)
        elif msg_type == "subscribe":
            requested = set(data.get("cameras", []))
            if "*" in requested:
                requested = set(self.cameras.keys())
            self.subscriptions[websocket] = requested
        elif msg_type == "unsubscribe":
            requested = set(data.get("cameras", []))
            self.subscriptions[websocket] -= requested
        elif msg_type == "get_frame":
            camera_id = data.get("camera")
            camera = self.cameras.get(camera_id)
            if not camera:
                return
            frame = camera.get_frame_base64()
            if frame:
                await websocket.send(json.dumps({"type": "frame", "camera": camera_id, "data": frame}))

    async def stream_loop(self):
        target_interval = 1.0 / 15
        while self.running:
            start = asyncio.get_event_loop().time()
            frames = {}
            for camera_id, camera in self.cameras.items():
                frame = camera.get_frame_base64()
                if frame:
                    frames[camera_id] = frame

            for client in list(self.clients):
                subscribed = self.subscriptions.get(client)
                if not subscribed:
                    continue
                for camera_id in subscribed:
                    frame = frames.get(camera_id)
                    if not frame:
                        continue
                    try:
                        await client.send(json.dumps({"type": "frame", "camera": camera_id, "data": frame}))
                    except Exception:
                        pass

            elapsed = asyncio.get_event_loop().time() - start
            await asyncio.sleep(max(0, target_interval - elapsed))

    async def run(self):
        await self.initialize()
        server_cfg = self.config.get("servers", {}).get("camera", {})
        host = server_cfg.get("host", "0.0.0.0")
        port = server_cfg.get("port", 8766)
        self.running = True

        async with websockets.serve(self.handle_client, host, port, max_size=10_000_000):
            logger.info("ELEGOO Camera server running on ws://%s:%s", host, port)
            await self.stream_loop()


def main():
    config_path = os.environ.get("FORGE_CONFIG", "./robot.config.json")
    if len(sys.argv) > 1:
        config_path = sys.argv[1]

    if not Path(config_path).exists():
        config_path = Path(__file__).parent.parent / "robot.config.json"

    logger.info("Using config: %s", config_path)
    server = CameraServer(str(config_path))
    asyncio.run(server.run())


if __name__ == "__main__":
    main()
