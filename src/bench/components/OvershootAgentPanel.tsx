import { useCallback } from 'react';
import { useOvershootAgent } from '../hooks/useOvershootAgent';
import type { VirtualCameraHandle } from './VirtualCamera';

interface OvershootAgentPanelProps {
  onJointUpdate: (joints: number[]) => void;
  cameraRefs: React.MutableRefObject<Map<string, VirtualCameraHandle>>;
  cameras: Array<{ id: string; resolution: { width: number; height: number } }>;
}

export function OvershootAgentPanel({ onJointUpdate, cameraRefs, cameras }: OvershootAgentPanelProps) {
  const captureFrame = useCallback((): string | null => {
    // Use the first camera available (camera_1)
    const cameraId = cameras[0]?.id;
    if (!cameraId) {
      console.error('[OvershootAgent] No camera available');
      return null;
    }

    const handle = cameraRefs.current.get(cameraId);
    const camera = cameras.find(c => c.id === cameraId);

    if (!handle || !camera) {
      console.error('[OvershootAgent] Camera handle not found:', cameraId);
      return null;
    }

    try {
      const pixels = handle.capture();
      if (!pixels || pixels.length === 0) {
        console.error('[OvershootAgent] No pixels captured from camera');
        return null;
      }

      // Convert pixels to JPEG data URL
      const { width, height } = camera.resolution;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(width, height);

      // Copy pixels
      for (let i = 0; i < pixels.length; i++) {
        imageData.data[i] = pixels[i];
      }

      ctx.putImageData(imageData, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      console.log('[OvershootAgent] Captured frame from', cameraId, width, 'x', height);
      return dataUrl;
    } catch (error) {
      console.error('[OvershootAgent] Frame capture failed:', error);
      return null;
    }
  }, [cameraRefs, cameras]);

  const {
    isRunning,
    currentStep,
    lastAnalysis,
    jointCorrections,
    error,
    history,
    start,
    stop,
  } = useOvershootAgent({ onJointUpdate, captureFrame });

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerIcon}>OV</div>
        <div>
          <div style={styles.headerTitle}>Overshoot Agent</div>
          <div style={styles.headerSub}>LiveKit Streaming + Qwen3-VL</div>
        </div>
      </div>

      {/* Start/Stop Button */}
      <button
        onClick={isRunning ? stop : start}
        style={{
          ...styles.toggleBtn,
          background: isRunning
            ? '#ef4444'
            : 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
        }}
      >
        {isRunning ? 'Stop Agent' : 'Start Agent'}
      </button>

      {/* No Camera Warning */}
      {cameras.length === 0 && (
        <div style={styles.warning}>
          No virtual camera found. Add a camera in the Cameras section to enable vision.
        </div>
      )}

      {/* Instructions */}
      {!isRunning && !lastAnalysis && cameras.length > 0 && (
        <div style={styles.instructions}>
          Using camera: {cameras[0]?.id}. Click "Start Agent" to analyze and control the robot.
        </div>
      )}

      {/* Status */}
      {isRunning && (
        <div style={styles.status}>
          <div style={styles.statusDot} />
          <span>{currentStep}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {/* Current Analysis */}
      {lastAnalysis && (
        <div style={styles.analysisBox}>
          <div style={styles.analysisHeader}>Vision Analysis</div>
          <div style={styles.analysisText}>
            {lastAnalysis}
          </div>
        </div>
      )}

      {/* Current Joints */}
      {jointCorrections && (
        <div style={styles.jointsBox}>
          <div style={styles.jointsHeader}>Target Joints</div>
          <div style={styles.jointsGrid}>
            {['Rot', 'Pitch', 'Elbow', 'Wrist', 'Roll', 'Grip'].map((name, i) => (
              <div key={i} style={styles.jointItem}>
                <span style={styles.jointName}>{name}</span>
                <span style={styles.jointValue}>
                  {jointCorrections[i]?.toFixed(2) ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={styles.history}>
          <div style={styles.historyHeader}>
            Actions ({history.length})
          </div>
          <div style={styles.historyList}>
            {history.slice(0, 5).map((item, idx) => (
              <div key={idx} style={styles.historyItem}>
                <span style={styles.historyAction}>{item.step}</span>
                <span style={styles.historyAnalysis}>
                  {item.analysis?.substring(0, 50)}...
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
  },
  headerSub: {
    color: '#888',
    fontSize: 10,
  },
  toggleBtn: {
    padding: '12px 16px',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  instructions: {
    padding: '10px 12px',
    background: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 6,
    color: '#a78bfa',
    fontSize: 11,
    lineHeight: 1.5,
  },
  warning: {
    padding: '10px 12px',
    background: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 6,
    color: '#f59e0b',
    fontSize: 11,
    lineHeight: 1.5,
  },
  info: {
    padding: '10px 12px',
    background: 'rgba(6, 182, 212, 0.15)',
    borderRadius: 6,
    color: '#06b6d4',
    fontSize: 11,
    lineHeight: 1.5,
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 6,
    color: '#8b5cf6',
    fontSize: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#10b981',
    animation: 'pulse 1s infinite',
  },
  error: {
    padding: '8px 12px',
    background: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 6,
    color: '#ef4444',
    fontSize: 11,
  },
  analysisBox: {
    background: '#111',
    borderRadius: 8,
    overflow: 'hidden',
  },
  analysisHeader: {
    padding: '8px 12px',
    background: '#1a1a1a',
    borderBottom: '1px solid #333',
    color: '#06b6d4',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  analysisText: {
    padding: 12,
    color: '#e0e0e0',
    fontSize: 12,
    lineHeight: 1.5,
  },
  jointsBox: {
    background: '#111',
    borderRadius: 8,
    overflow: 'hidden',
  },
  jointsHeader: {
    padding: '6px 12px',
    background: '#1a1a1a',
    borderBottom: '1px solid #333',
    color: '#8b5cf6',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  jointsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 1,
    padding: 1,
  },
  jointItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 4px',
    background: '#1a1a1a',
  },
  jointName: {
    color: '#888',
    fontSize: 9,
    marginBottom: 2,
  },
  jointValue: {
    color: '#8b5cf6',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  history: {
    borderTop: '1px solid #333',
    paddingTop: 10,
  },
  historyHeader: {
    color: '#666',
    fontSize: 10,
    marginBottom: 8,
    fontWeight: 600,
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  historyItem: {
    display: 'flex',
    flexDirection: 'column',
    padding: '6px 8px',
    background: '#1a1a1a',
    borderRadius: 4,
  },
  historyAction: {
    color: '#06b6d4',
    fontSize: 10,
    fontWeight: 600,
    marginBottom: 2,
  },
  historyAnalysis: {
    color: '#888',
    fontSize: 10,
    lineHeight: 1.3,
  },
};
