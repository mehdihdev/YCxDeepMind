import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { VirtualCameraConfig } from '../types';

interface CameraManagerProps {
  cameras: VirtualCameraConfig[];
  selectedCameraId: string | null;
  onAddCamera: (camera: VirtualCameraConfig) => void;
  onRemoveCamera: (id: string) => void;
  onUpdateCamera: (id: string, updates: Partial<VirtualCameraConfig>) => void;
  onSelectCamera: (id: string | null) => void;
}

const RESOLUTION_OPTIONS = [
  { label: '320x240', width: 320, height: 240 },
  { label: '640x480', width: 640, height: 480 },
  { label: '1280x720', width: 1280, height: 720 },
];

function createDefaultCamera(index: number): VirtualCameraConfig {
  // Default positions for common camera angles
  const presets: [number, number, number][] = [
    [0.5, -0.5, 0.5],   // Front-right
    [-0.5, -0.5, 0.5],  // Front-left
    [0, 0.5, 0.8],      // Back overhead
    [0, 0, 0.8],        // Top-down
  ];

  const position = presets[index % presets.length];

  return {
    id: uuidv4(),
    name: `camera_${index + 1}`,
    position,
    rotation: [0, 0, 0],
    fov: 60,
    resolution: { width: 640, height: 480 },
    enabled: true,
  };
}

export function CameraManager({
  cameras,
  selectedCameraId,
  onAddCamera,
  onRemoveCamera,
  onUpdateCamera,
  onSelectCamera,
}: CameraManagerProps) {
  const handleAddCamera = useCallback(() => {
    const newCamera = createDefaultCamera(cameras.length);
    onAddCamera(newCamera);
    onSelectCamera(newCamera.id);
  }, [cameras.length, onAddCamera, onSelectCamera]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Virtual Cameras</span>
        <button onClick={handleAddCamera} style={styles.addBtn}>
          + Add
        </button>
      </div>

      {cameras.length === 0 ? (
        <div style={styles.empty}>
          No cameras. Click "Add" to create one.
        </div>
      ) : (
        <div style={styles.list}>
          {cameras.map(camera => (
            <div
              key={camera.id}
              style={{
                ...styles.cameraItem,
                border: selectedCameraId === camera.id
                  ? '1px solid #0ea5e9'
                  : '1px solid #333',
              }}
              onClick={() => onSelectCamera(camera.id)}
            >
              <div style={styles.cameraHeader}>
                <input
                  value={camera.name}
                  onChange={e => onUpdateCamera(camera.id, { name: e.target.value })}
                  onClick={e => e.stopPropagation()}
                  style={styles.nameInput}
                />
                <div style={styles.cameraActions}>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onUpdateCamera(camera.id, { enabled: !camera.enabled });
                    }}
                    style={{
                      ...styles.toggleBtn,
                      background: camera.enabled ? '#10b981' : '#333',
                    }}
                  >
                    {camera.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onRemoveCamera(camera.id);
                    }}
                    style={styles.removeBtn}
                  >
                    X
                  </button>
                </div>
              </div>

              {selectedCameraId === camera.id && (
                <div style={styles.cameraSettings}>
                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>FOV</label>
                    <input
                      type="range"
                      min={30}
                      max={120}
                      value={camera.fov}
                      onChange={e => onUpdateCamera(camera.id, { fov: +e.target.value })}
                      style={styles.slider}
                    />
                    <span style={styles.settingValue}>{camera.fov}</span>
                  </div>

                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>Resolution</label>
                    <select
                      value={`${camera.resolution.width}x${camera.resolution.height}`}
                      onChange={e => {
                        const opt = RESOLUTION_OPTIONS.find(
                          o => `${o.width}x${o.height}` === e.target.value
                        );
                        if (opt) {
                          onUpdateCamera(camera.id, {
                            resolution: { width: opt.width, height: opt.height }
                          });
                        }
                      }}
                      style={styles.select}
                    >
                      {RESOLUTION_OPTIONS.map(opt => (
                        <option key={opt.label} value={`${opt.width}x${opt.height}`}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>X</label>
                    <input
                      type="range"
                      min={-1.5}
                      max={1.5}
                      step={0.05}
                      value={camera.position[0]}
                      onChange={e => onUpdateCamera(camera.id, {
                        position: [+e.target.value, camera.position[1], camera.position[2]]
                      })}
                      style={styles.slider}
                    />
                    <span style={styles.settingValue}>{camera.position[0].toFixed(2)}</span>
                  </div>

                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>Y</label>
                    <input
                      type="range"
                      min={-1.5}
                      max={1.5}
                      step={0.05}
                      value={camera.position[1]}
                      onChange={e => onUpdateCamera(camera.id, {
                        position: [camera.position[0], +e.target.value, camera.position[2]]
                      })}
                      style={styles.slider}
                    />
                    <span style={styles.settingValue}>{camera.position[1].toFixed(2)}</span>
                  </div>

                  <div style={styles.settingRow}>
                    <label style={styles.settingLabel}>Z</label>
                    <input
                      type="range"
                      min={0.1}
                      max={1.5}
                      step={0.05}
                      value={camera.position[2]}
                      onChange={e => onUpdateCamera(camera.id, {
                        position: [camera.position[0], camera.position[1], +e.target.value]
                      })}
                      style={styles.slider}
                    />
                    <span style={styles.settingValue}>{camera.position[2].toFixed(2)}</span>
                  </div>

                  {/* Preset positions */}
                  <div style={styles.presetRow}>
                    <span style={styles.settingLabel}>Presets</span>
                    <div style={styles.presetButtons}>
                      <button
                        onClick={() => onUpdateCamera(camera.id, { position: [0.5, -0.4, 0.4] })}
                        style={styles.presetBtn}
                      >Front</button>
                      <button
                        onClick={() => onUpdateCamera(camera.id, { position: [-0.5, -0.4, 0.4] })}
                        style={styles.presetBtn}
                      >Left</button>
                      <button
                        onClick={() => onUpdateCamera(camera.id, { position: [0, 0, 0.9] })}
                        style={styles.presetBtn}
                      >Top</button>
                      <button
                        onClick={() => onUpdateCamera(camera.id, { position: [0, 0.5, 0.3] })}
                        style={styles.presetBtn}
                      >Back</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
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
  addBtn: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: 4,
    background: '#0ea5e9',
    color: '#fff',
    fontSize: 10,
    fontWeight: 500,
    cursor: 'pointer',
  },
  empty: {
    color: '#555',
    fontSize: 11,
    textAlign: 'center',
    padding: 16,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cameraItem: {
    background: '#111',
    borderRadius: 6,
    padding: 10,
    cursor: 'pointer',
  },
  cameraHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameInput: {
    background: 'transparent',
    border: 'none',
    color: '#ccc',
    fontSize: 12,
    fontWeight: 500,
    outline: 'none',
    flex: 1,
    marginRight: 8,
  },
  cameraActions: {
    display: 'flex',
    gap: 6,
  },
  toggleBtn: {
    padding: '2px 8px',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 9,
    fontWeight: 600,
    cursor: 'pointer',
  },
  removeBtn: {
    padding: '2px 6px',
    border: 'none',
    borderRadius: 4,
    background: '#333',
    color: '#888',
    fontSize: 9,
    cursor: 'pointer',
  },
  cameraSettings: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px solid #222',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  settingLabel: {
    color: '#666',
    fontSize: 10,
    width: 70,
  },
  slider: {
    flex: 1,
    height: 4,
  },
  settingValue: {
    color: '#0ea5e9',
    fontSize: 10,
    fontFamily: 'monospace',
    width: 30,
    textAlign: 'right',
  },
  select: {
    flex: 1,
    padding: '4px 8px',
    border: '1px solid #333',
    borderRadius: 4,
    background: '#1a1a1a',
    color: '#ccc',
    fontSize: 10,
    outline: 'none',
  },
  presetRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 4,
  },
  presetButtons: {
    display: 'flex',
    gap: 4,
  },
  presetBtn: {
    flex: 1,
    padding: '4px 0',
    border: '1px solid #333',
    borderRadius: 4,
    background: '#1a1a1a',
    color: '#888',
    fontSize: 9,
    cursor: 'pointer',
  },
};
