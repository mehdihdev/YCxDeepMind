import { useRef, useEffect, useState, useCallback } from 'react';

interface CameraInfo {
  width: number;
  height: number;
  fps: number;
}

interface LiveCameraFeedProps {
  host: string;
  port: number;
  onConnectionChange?: (connected: boolean) => void;
  autoConnect?: boolean;
  overlay?: React.ReactNode;
  compact?: boolean;
}

export function LiveCameraFeed({ host, port, onConnectionChange, autoConnect = false, overlay, compact = false }: LiveCameraFeedProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [cameras, setCameras] = useState<Record<string, CameraInfo>>({});
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setIsConnecting(true);
    setError(null);

    const ws = new WebSocket(`ws://${host}:${port}`);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[camera] Connected to camera server');
      setIsConnected(true);
      setIsConnecting(false);
      onConnectionChange?.(true);
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        // JSON message (camera info, etc.)
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'camera_info') {
            setCameras(data.cameras || {});
            console.log('[camera] Camera info:', data.cameras);
          }
        } catch (e) {
          console.error('[camera] Failed to parse message:', e);
        }
      } else {
        // Binary message (frame data)
        const buffer = event.data as ArrayBuffer;
        if (buffer.byteLength < 2) return;

        // Extract camera ID (first byte) and JPEG data
        const view = new DataView(buffer);
        const cameraId = view.getUint8(0);
        const jpegData = new Uint8Array(buffer, 1);

        // Create blob and render to canvas
        const blob = new Blob([jpegData], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);

        const canvas = canvasRefs.current.get(cameraId);
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const img = new Image();
            img.onload = () => {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              URL.revokeObjectURL(url);
            };
            img.src = url;
          }
        }

        // Update FPS counter
        frameCountRef.current++;
        const now = Date.now();
        if (now - lastFpsUpdateRef.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsUpdateRef.current = now;
        }
      }
    };

    ws.onerror = () => {
      setError('Connection error');
      setIsConnecting(false);
    };

    ws.onclose = () => {
      console.log('[camera] Disconnected from camera server');
      setIsConnected(false);
      setIsConnecting(false);
      onConnectionChange?.(false);
      wsRef.current = null;
    };

    wsRef.current = ws;
  }, [host, port, onConnectionChange]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && !isConnected && !isConnecting) {
      connect();
    }
  }, [autoConnect, connect, isConnected, isConnecting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const cameraIds = Object.keys(cameras).map(Number).sort();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>Live Cameras</span>
          {isConnected && (
            <span style={styles.fpsCounter}>{fps} FPS</span>
          )}
        </div>
        <div style={styles.headerRight}>
          <div style={{
            ...styles.statusDot,
            background: isConnected ? '#10b981' : isConnecting ? '#f59e0b' : '#666',
          }} />
          <span style={styles.statusText}>
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
          </span>
          <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            style={{
              ...styles.connectBtn,
              background: isConnected ? '#ef4444' : '#10b981',
              opacity: isConnecting ? 0.5 : 1,
            }}
          >
            {isConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.error}>{error}</div>
      )}

      {!isConnected && !isConnecting && (
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <p style={styles.placeholderText}>
            Connect to Jetson camera server
          </p>
          <p style={styles.placeholderSubtext}>
            ws://{host}:{port}
          </p>
        </div>
      )}

      {isConnected && cameraIds.length === 0 && (
        <div style={styles.placeholder}>
          <p style={styles.placeholderText}>Waiting for camera data...</p>
        </div>
      )}

      {isConnected && cameraIds.length > 0 && (
        <div style={compact ? styles.cameraGridCompact : styles.cameraGrid}>
          {cameraIds.map(camId => (
            <div key={camId} style={styles.cameraPanel}>
              {!compact && (
                <div style={styles.cameraLabel}>
                  Camera {camId}
                  {cameras[camId] && (
                    <span style={styles.cameraRes}>
                      {cameras[camId].width}x{cameras[camId].height}
                    </span>
                  )}
                </div>
              )}
              <canvas
                ref={el => {
                  if (el) canvasRefs.current.set(camId, el);
                  else canvasRefs.current.delete(camId);
                }}
                style={styles.canvas}
              />
            </div>
          ))}
        </div>
      )}

      {/* Overlay */}
      {overlay}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #333',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: 600,
  },
  fpsCounter: {
    color: '#10b981',
    fontSize: 11,
    fontFamily: 'monospace',
    padding: '2px 6px',
    background: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  statusText: {
    color: '#888',
    fontSize: 11,
  },
  connectBtn: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
  },
  error: {
    padding: '8px 16px',
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    fontSize: 12,
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  placeholderIcon: {
    marginBottom: 8,
  },
  placeholderText: {
    color: '#666',
    fontSize: 13,
    margin: 0,
  },
  placeholderSubtext: {
    color: '#444',
    fontSize: 11,
    fontFamily: 'monospace',
    margin: 0,
  },
  cameraGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 8,
    padding: 8,
    overflow: 'auto',
  },
  cameraGridCompact: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 4,
    padding: 4,
    overflow: 'auto',
  },
  cameraPanel: {
    background: '#111',
    borderRadius: 6,
    overflow: 'hidden',
  },
  cameraLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    background: 'rgba(0, 0, 0, 0.5)',
    color: '#888',
    fontSize: 11,
  },
  cameraRes: {
    color: '#555',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  canvas: {
    width: '100%',
    height: 'auto',
    display: 'block',
    background: '#000',
  },
};
