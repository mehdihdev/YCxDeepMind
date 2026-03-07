import { useState } from 'react';
import type { RecordingEpisode, VirtualCameraConfig } from '../types';
import { exportLeRobotDataset, downloadBlob } from '../utils/lerobot-format';

interface RecordingControlsProps {
  isRecording: boolean;
  currentEpisode: RecordingEpisode | null;
  completedEpisodes: RecordingEpisode[];
  taskName: string;
  frameCount: number;
  cameras: VirtualCameraConfig[];
  onStart: () => void;
  onStop: () => void;
  onTaskNameChange: (name: string) => void;
  onClearEpisodes: () => void;
}

export function RecordingControls({
  isRecording,
  currentEpisode: _currentEpisode,
  completedEpisodes,
  taskName,
  frameCount,
  cameras,
  onStart,
  onStop,
  onTaskNameChange,
  onClearEpisodes,
}: RecordingControlsProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (completedEpisodes.length === 0) return;

    setIsExporting(true);
    try {
      const blob = await exportLeRobotDataset({
        episodes: completedEpisodes,
        cameras,
        robotType: 'so_arm100',
        fps: 50
      });
      downloadBlob(blob, `forge-dataset-${Date.now()}.zip`);
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed. Check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  const totalFrames = completedEpisodes.reduce((sum, ep) => sum + ep.frames.length, 0);
  const enabledCameras = cameras.filter(c => c.enabled).length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Recording</span>
        {isRecording && (
          <div style={styles.recordingIndicator}>
            <span style={styles.recordingDot} />
            REC
          </div>
        )}
      </div>

      {/* Task name input */}
      <div style={styles.taskInput}>
        <label style={styles.label}>Task:</label>
        <input
          value={taskName}
          onChange={e => onTaskNameChange(e.target.value)}
          disabled={isRecording}
          placeholder="e.g., pick_and_place"
          style={{
            ...styles.input,
            opacity: isRecording ? 0.5 : 1,
          }}
        />
      </div>

      {/* Camera info */}
      <div style={styles.info}>
        <span>{enabledCameras} camera{enabledCameras !== 1 ? 's' : ''} enabled</span>
      </div>

      {/* Record button */}
      <button
        onClick={isRecording ? onStop : onStart}
        style={{
          ...styles.recordBtn,
          background: isRecording
            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
            : 'linear-gradient(135deg, #10b981, #059669)',
        }}
      >
        {isRecording ? (
          <>Stop Recording ({frameCount} frames)</>
        ) : (
          <>Start Recording</>
        )}
      </button>

      {/* Episodes summary */}
      {completedEpisodes.length > 0 && (
        <div style={styles.episodesSummary}>
          <div style={styles.summaryHeader}>
            <span style={styles.summaryTitle}>
              {completedEpisodes.length} episode{completedEpisodes.length !== 1 ? 's' : ''}
            </span>
            <span style={styles.summaryFrames}>{totalFrames} frames</span>
          </div>

          <div style={styles.episodeList}>
            {completedEpisodes.slice(-3).map((ep, i) => (
              <div key={i} style={styles.episodeItem}>
                <span style={styles.episodeTask}>{ep.task}</span>
                <span style={styles.episodeFrames}>{ep.frames.length}f</span>
              </div>
            ))}
            {completedEpisodes.length > 3 && (
              <div style={styles.moreEpisodes}>
                +{completedEpisodes.length - 3} more
              </div>
            )}
          </div>

          <div style={styles.exportButtons}>
            <button
              onClick={handleExport}
              disabled={isExporting}
              style={styles.exportBtn}
            >
              {isExporting ? 'Exporting...' : 'Export ZIP'}
            </button>
            <button
              onClick={onClearEpisodes}
              style={styles.clearBtn}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    borderBottom: '1px solid #333',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#666',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recordingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#ef4444',
    fontSize: 10,
    fontWeight: 600,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#ef4444',
    animation: 'pulse 1s infinite',
  },
  taskInput: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  label: {
    color: '#666',
    fontSize: 11,
  },
  input: {
    flex: 1,
    padding: '6px 10px',
    border: '1px solid #333',
    borderRadius: 6,
    background: '#111',
    color: '#fff',
    fontSize: 11,
    outline: 'none',
  },
  info: {
    color: '#555',
    fontSize: 10,
    marginBottom: 10,
  },
  recordBtn: {
    width: '100%',
    padding: 12,
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  episodesSummary: {
    marginTop: 12,
    padding: 12,
    background: '#111',
    borderRadius: 6,
  },
  summaryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryTitle: {
    color: '#ccc',
    fontSize: 11,
    fontWeight: 500,
  },
  summaryFrames: {
    color: '#0ea5e9',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  episodeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 10,
  },
  episodeItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 8px',
    background: '#1a1a1a',
    borderRadius: 4,
  },
  episodeTask: {
    color: '#888',
    fontSize: 10,
  },
  episodeFrames: {
    color: '#666',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  moreEpisodes: {
    color: '#555',
    fontSize: 9,
    textAlign: 'center',
    padding: 4,
  },
  exportButtons: {
    display: 'flex',
    gap: 8,
  },
  exportBtn: {
    flex: 1,
    padding: 8,
    border: 'none',
    borderRadius: 6,
    background: '#0ea5e9',
    color: '#fff',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
  },
  clearBtn: {
    padding: '8px 12px',
    border: '1px solid #333',
    borderRadius: 6,
    background: 'transparent',
    color: '#888',
    fontSize: 11,
    cursor: 'pointer',
  },
};
