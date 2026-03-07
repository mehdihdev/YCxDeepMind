import JSZip from 'jszip';
import type { RecordingEpisode, VirtualCameraConfig } from '../types';

interface ExportOptions {
  episodes: RecordingEpisode[];
  cameras: VirtualCameraConfig[];
  robotType?: string;
  fps?: number;
}

// Convert RGBA pixels to JPEG blob using canvas
async function rgbaToJpeg(
  rgba: Uint8Array,
  width: number,
  height: number,
  quality = 0.85
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // WebGL renders upside down, flip it
  const flipped = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - y - 1) * width * 4;
    const dstRow = y * width * 4;
    for (let x = 0; x < width * 4; x++) {
      flipped[dstRow + x] = rgba[srcRow + x];
    }
  }

  const imageData = new ImageData(flipped, width, height);
  ctx.putImageData(imageData, 0, 0);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob!), 'image/jpeg', quality);
  });
}

export async function exportLeRobotDataset(options: ExportOptions): Promise<Blob> {
  const { episodes, cameras, robotType = 'so_arm100', fps = 50 } = options;
  const zip = new JSZip();

  const enabledCameras = cameras.filter(c => c.enabled);
  const totalFrames = episodes.reduce((sum, ep) => sum + ep.frames.length, 0);

  // Build info.json
  const info = {
    codebase_version: 'v3.0',
    robot_type: robotType,
    total_episodes: episodes.length,
    total_frames: totalFrames,
    fps,
    features: {
      action: {
        dtype: 'float32',
        shape: [6],
        names: ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper']
      },
      'observation.state': {
        dtype: 'float32',
        shape: [6],
        names: ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper']
      },
      ...Object.fromEntries(enabledCameras.map(cam => [
        `observation.images.${cam.name}`,
        {
          dtype: 'image',
          shape: [cam.resolution.height, cam.resolution.width, 3],
          info: {
            'image.height': cam.resolution.height,
            'image.width': cam.resolution.width,
            'image.format': 'jpeg'
          }
        }
      ]))
    }
  };
  zip.file('meta/info.json', JSON.stringify(info, null, 2));

  // Build episodes metadata
  const episodesMeta = episodes.map((ep, i) => ({
    episode_index: i,
    tasks: [ep.task],
    length: ep.frames.length,
    duration: ep.endTime && ep.startTime ? (ep.endTime - ep.startTime) / 1000 : 0
  }));
  zip.file('meta/episodes.json', JSON.stringify(episodesMeta, null, 2));

  // Build frame data
  const allFrames = episodes.flatMap((ep, episodeIndex) =>
    ep.frames.map((frame, frameIndex) => ({
      episode_index: episodeIndex,
      frame_index: frameIndex,
      timestamp: frame.timestamp,
      action: frame.jointPositions,
      'observation.state': frame.jointPositions,
      task: ep.task
    }))
  );
  zip.file('data/frames.json', JSON.stringify(allFrames, null, 2));

  // Export camera images
  for (const camera of enabledCameras) {
    for (let epIdx = 0; epIdx < episodes.length; epIdx++) {
      const episode = episodes[epIdx];
      const episodeFolder = `images/observation.images.${camera.name}/episode-${String(epIdx).padStart(6, '0')}`;

      for (let fIdx = 0; fIdx < episode.frames.length; fIdx++) {
        const frame = episode.frames[fIdx];
        const pixels = frame.images[camera.id];

        if (pixels && pixels.length > 0) {
          try {
            const jpegBlob = await rgbaToJpeg(
              pixels,
              camera.resolution.width,
              camera.resolution.height
            );
            zip.file(
              `${episodeFolder}/frame-${String(fIdx).padStart(6, '0')}.jpg`,
              jpegBlob
            );
          } catch (e) {
            console.error(`Failed to encode frame ${fIdx} for camera ${camera.name}:`, e);
          }
        }
      }
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
