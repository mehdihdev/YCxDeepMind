import { useState, useCallback } from 'react';
import { useOvershootVision, type SourceType } from '../hooks/useOvershootVision';

interface OvershootVisionPanelProps {
  cameraCanvas?: HTMLCanvasElement | null;
  defaultPrompt?: string;
}

const OVERSHOOT_API_KEY = 'ovs_c60b05204d538098e1f2da4d0e58e09d';

// Prompts optimized for pick and place robotics tasks
const PRESET_PROMPTS = [
  { label: 'Pick & Place', prompt: 'Describe the robot arm pick and place task. Is the gripper holding an object? Where is it moving? Has it placed the object?' },
  { label: 'Gripper', prompt: 'What is the gripper state? Open or closed? Is it holding anything?' },
  { label: 'Objects', prompt: 'List all objects visible in the robot workspace.' },
  { label: 'Progress', prompt: 'What is the current progress of the robot task? What step is it on?' },
];

export function OvershootVisionPanel({
  defaultPrompt = 'Describe what the robot arm is doing'
}: OvershootVisionPanelProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isEnabled, setIsEnabled] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>('screen');

  const {
    isConnected,
    isProcessing,
    lastResult,
    error,
    resultHistory,
    start,
    stop,
    clearHistory
  } = useOvershootVision({
    prompt,
    enabled: isEnabled,
    apiKey: OVERSHOOT_API_KEY,
    model: 'google/gemini-2.0-flash-lite',
    sourceType
  });

  const handleToggle = useCallback(async () => {
    if (isConnected) {
      await stop();
      setIsEnabled(false);
    } else {
      setIsEnabled(true);
      await start();
    }
  }, [isConnected, start, stop]);

  const handlePresetClick = useCallback((presetPrompt: string) => {
    setPrompt(presetPrompt);
  }, []);

  return (
    <div style={styles.container}>
      {/* Source selector */}
      <div style={styles.sourceRow}>
        <span style={styles.sourceLabel}>Source:</span>
        <button
          onClick={() => setSourceType('screen')}
          disabled={isConnected}
          style={{
            ...styles.sourceBtn,
            background: sourceType === 'screen' ? '#8b5cf6' : '#333',
          }}
        >
          Screen
        </button>
        <button
          onClick={() => setSourceType('camera')}
          disabled={isConnected}
          style={{
            ...styles.sourceBtn,
            background: sourceType === 'camera' ? '#8b5cf6' : '#333',
          }}
        >
          Camera
        </button>
      </div>

      {/* Prompt presets */}
      <div style={styles.presets}>
        {PRESET_PROMPTS.map((preset, idx) => (
          <button
            key={idx}
            onClick={() => handlePresetClick(preset.prompt)}
            style={{
              ...styles.presetBtn,
              background: prompt === preset.prompt ? '#8b5cf6' : '#333',
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Prompt input */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter your vision prompt..."
        style={styles.promptInput}
        rows={2}
        disabled={isConnected}
      />

      {/* Start/Stop button */}
      <button
        onClick={handleToggle}
        style={{
          ...styles.toggleBtn,
          background: isConnected ? '#ef4444' : 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
        }}
      >
        {isConnected ? 'Stop Analysis' : 'Start Analysis'}
      </button>

      {/* Status */}
      {isConnected && (
        <div style={styles.status}>
          <div style={styles.statusDot} />
          <span>{isProcessing ? 'Analyzing...' : 'Connected'}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {/* Result */}
      {lastResult && (
        <div style={styles.resultBox}>
          <div style={styles.resultHeader}>
            <span>Latest Result</span>
            <button onClick={clearHistory} style={styles.clearBtn}>Clear</button>
          </div>
          <div style={styles.resultText}>
            {lastResult}
          </div>
        </div>
      )}

      {/* History */}
      {resultHistory.length > 1 && (
        <div style={styles.history}>
          <span style={styles.historyLabel}>History ({resultHistory.length})</span>
          {resultHistory.slice(1, 4).map((item, idx) => (
            <div key={idx} style={styles.historyItem}>
              {item.result.substring(0, 100)}...
            </div>
          ))}
        </div>
      )}

      {/* Instructions */}
      {!isConnected && (
        <div style={styles.instructions}>
          {sourceType === 'screen'
            ? 'Click Start, then select the simulation window to analyze'
            : 'Click Start to use your camera'}
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
  },
  sourceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sourceLabel: {
    color: '#888',
    fontSize: 11,
  },
  sourceBtn: {
    padding: '4px 12px',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 11,
    cursor: 'pointer',
  },
  presets: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetBtn: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: 12,
    color: '#ccc',
    fontSize: 10,
    cursor: 'pointer',
  },
  promptInput: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #444',
    borderRadius: 6,
    background: '#111',
    color: '#fff',
    fontSize: 11,
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit',
  },
  toggleBtn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 6,
    color: '#8b5cf6',
    fontSize: 11,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#10b981',
    animation: 'pulse 1s infinite',
  },
  error: {
    padding: '8px 10px',
    background: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 6,
    color: '#ef4444',
    fontSize: 11,
  },
  resultBox: {
    background: '#111',
    borderRadius: 6,
    overflow: 'hidden',
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    background: '#1a1a1a',
    borderBottom: '1px solid #333',
    color: '#888',
    fontSize: 10,
  },
  clearBtn: {
    padding: '2px 6px',
    border: 'none',
    borderRadius: 3,
    background: 'transparent',
    color: '#666',
    fontSize: 9,
    cursor: 'pointer',
  },
  resultText: {
    padding: '10px',
    color: '#e0e0e0',
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    maxHeight: 150,
    overflow: 'auto',
  },
  history: {
    borderTop: '1px solid #333',
    paddingTop: 8,
  },
  historyLabel: {
    display: 'block',
    color: '#666',
    fontSize: 10,
    marginBottom: 6,
  },
  historyItem: {
    padding: '4px 8px',
    background: '#1a1a1a',
    borderRadius: 4,
    marginBottom: 4,
    color: '#888',
    fontSize: 10,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  instructions: {
    padding: '8px 10px',
    background: 'rgba(6, 182, 212, 0.1)',
    borderRadius: 6,
    color: '#06b6d4',
    fontSize: 10,
    textAlign: 'center',
  },
};
