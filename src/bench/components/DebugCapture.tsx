import { useState, useCallback } from 'react';
import type { VirtualCameraHandle } from './VirtualCamera';

interface DebugCaptureProps {
  cameraRefs: React.MutableRefObject<Map<string, VirtualCameraHandle>>;
  cameras: Array<{ id: string; resolution: { width: number; height: number } }>;
}

export function DebugCapture({ cameraRefs, cameras }: DebugCaptureProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string>('');

  const saveCamera = useCallback((cameraId: string) => {
    const handle = cameraRefs.current.get(cameraId);
    const camera = cameras.find(c => c.id === cameraId);

    if (!handle || !camera) {
      setTestResult(`Camera ${cameraId} not found!`);
      return;
    }

    const pixels = handle.capture();
    if (!pixels || pixels.length === 0) {
      setTestResult(`No pixels from ${cameraId}!`);
      return;
    }

    // Convert pixels to PNG
    const { width, height } = camera.resolution;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);

    // Copy pixels (already flipped by VirtualCamera)
    for (let i = 0; i < pixels.length; i++) {
      imageData.data[i] = pixels[i];
    }

    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');

    setCapturedImage(dataUrl);
    setTestResult(`Saved ${cameraId}! ${width}x${height}, ${Math.round(dataUrl.length / 1024)}KB`);

    // Download
    const link = document.createElement('a');
    link.download = `${cameraId}.png`;
    link.href = dataUrl;
    link.click();
  }, [cameraRefs, cameras]);

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: 300,
      background: 'rgba(0,0,0,0.9)',
      padding: 12,
      borderRadius: 8,
      color: '#fff',
      fontSize: 12,
      zIndex: 9999,
      maxWidth: 300,
    }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>Save Camera</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {cameras.map(cam => (
          <button
            key={cam.id}
            onClick={() => saveCamera(cam.id)}
            style={{
              padding: '6px 10px',
              background: '#0ea5e9',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            Save {cam.id}
          </button>
        ))}
      </div>

      {testResult && (
        <div style={{
          padding: 6,
          background: '#1a1a1a',
          borderRadius: 4,
          marginBottom: 8,
          fontSize: 11,
        }}>
          {testResult}
        </div>
      )}

      {capturedImage && (
        <img
          src={capturedImage}
          alt="Captured"
          style={{ width: '100%', borderRadius: 4, maxHeight: 150 }}
        />
      )}
    </div>
  );
}
