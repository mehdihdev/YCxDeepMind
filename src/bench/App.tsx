import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  MujocoProvider,
  MujocoCanvas,
  useMujoco,
  useCtrl,
  useBeforePhysicsStep,
} from 'mujoco-react';
import type { SceneConfig } from 'mujoco-react';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import type { AppMode, ConnectionStatus, VirtualCameraConfig, CalibrationResult, ViewLayout, TeleopState } from './types';
import { LiveCameraFeed } from './components/LiveCameraFeed';
import { CalibrationWizard } from './components/CalibrationWizard';
import { CameraManager } from './components/CameraManager';
import { RecordingControls } from './components/RecordingControls';
import { VirtualCamera, CameraPreviewGrid, type VirtualCameraHandle } from './components/VirtualCamera';
import { useRecording } from './hooks/useRecording';
import { ResizableSplit } from './components/ResizableSplit';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { JointOverlay } from './components/JointOverlay';

// Joint configurations for different robot types
const ARM_JOINTS = [
  { name: 'Rotation', label: 'Base', min: -2.2, max: 2.2, default: 0 },
  { name: 'Pitch', label: 'Shoulder', min: -3.14, max: 0.2, default: -1.57 },
  { name: 'Elbow', label: 'Elbow', min: 0, max: 3.14, default: 1.57 },
  { name: 'Wrist_Pitch', label: 'Wrist', min: -2.0, max: 1.8, default: 1.57 },
  { name: 'Wrist_Roll', label: 'Roll', min: -3.14, max: 3.14, default: -1.57 },
  { name: 'Jaw', label: 'Gripper', min: -0.2, max: 2.0, default: 0 },
];

const CAR_JOINTS = [
  { name: 'motor_fl', label: 'Front Left', min: -50, max: 50, default: 0 },
  { name: 'motor_fr', label: 'Front Right', min: -50, max: 50, default: 0 },
  { name: 'motor_bl', label: 'Back Left', min: -50, max: 50, default: 0 },
  { name: 'motor_br', label: 'Back Right', min: -50, max: 50, default: 0 },
  { name: 'ultrasonic_servo', label: 'Servo', min: -1.57, max: 1.57, default: 0 },
];

// Parse URL params to determine robot type
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    robotType: params.get('robotType') || 'arm',
    armType: params.get('armType') || 'so100',
    carType: params.get('carType') || 'elegoo_v4',
    ip: params.get('ip') || '',
    armPort: params.get('armPort') || '8765',
    cameraPort: params.get('cameraPort') || '8766',
  };
}

// Default to arm joints for backwards compatibility
const JOINTS = ARM_JOINTS;

// Scene configs for different robot types
function getSceneConfig(robotType: string, carType: string): SceneConfig {
  if (robotType === 'car') {
    return {
      src: '/bench/robot/',
      sceneFile: 'elegoo_car_scene.xml',
      homeJoints: CAR_JOINTS.map(j => j.default),
    };
  }
  // Default: arm
  return {
    src: '/bench/robot/',
    sceneFile: 'scene.xml',
    homeJoints: ARM_JOINTS.map(j => j.default),
  };
}

const DEFAULT_JETSON_HOST = '10.0.0.42';
const DEFAULT_JETSON_PORT = 8765;
const DEFAULT_CAMERA_PORT = 8766;
const CAMERA_STORAGE_KEY = 'forge-rde-cameras';

function useJointController(jointValues: number[], joints: typeof ARM_JOINTS) {
  const ctrls = joints.map(j => useCtrl(j.name));
  useBeforePhysicsStep(() => {
    ctrls.forEach((ctrl, i) => {
      if (ctrl) ctrl.write(jointValues[i]);
    });
  });
}

function JointController({ jointValues, joints }: { jointValues: number[], joints: typeof ARM_JOINTS }) {
  useJointController(jointValues, joints);
  return null;
}

interface SceneProps {
  jointValues: number[];
  joints: typeof ARM_JOINTS;
  cameras: VirtualCameraConfig[];
  selectedCameraId: string | null;
  cameraRefs: React.MutableRefObject<Map<string, VirtualCameraHandle>>;
  onSelectCamera: (id: string | null) => void;
  onCameraPositionChange: (id: string, position: [number, number, number]) => void;
  orbitEnabled: boolean;
  onOrbitEnable: (enabled: boolean) => void;
}

function Scene({
  jointValues,
  joints,
  cameras,
  selectedCameraId,
  cameraRefs,
  onSelectCamera,
  onCameraPositionChange,
  orbitEnabled,
  onOrbitEnable,
}: SceneProps) {
  const { isPending, isError } = useMujoco();

  if (isPending) {
    return (
      <>
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[0.08, 0.08, 0.08]} />
          <meshStandardMaterial color="#0ea5e9" wireframe />
        </mesh>
        <ambientLight intensity={0.5} />
      </>
    );
  }

  if (isError) return null;

  return (
    <>
      <OrbitControls
        enabled={orbitEnabled}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.3}
        maxDistance={2}
        maxPolarAngle={Math.PI * 0.8}
        makeDefault
      />
      <JointController jointValues={jointValues} joints={joints} />
      <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={2} blur={1.5} far={1} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
      <directionalLight position={[-3, 3, -3]} intensity={0.3} />

      {/* Virtual cameras */}
      {cameras.map(cam => (
        <VirtualCamera
          key={cam.id}
          ref={el => {
            if (el) cameraRefs.current.set(cam.id, el);
            else cameraRefs.current.delete(cam.id);
          }}
          config={cam}
          isSelected={selectedCameraId === cam.id}
          onSelect={() => onSelectCamera(cam.id)}
          onPositionChange={(pos) => onCameraPositionChange(cam.id, pos)}
          onOrbitEnable={onOrbitEnable}
        />
      ))}
    </>
  );
}

function App() {
  // Get robot type from URL params
  const urlParams = useMemo(() => getUrlParams(), []);
  const robotType = urlParams.robotType;
  const activeJoints = robotType === 'car' ? CAR_JOINTS : ARM_JOINTS;
  const config = useMemo(() => getSceneConfig(robotType, urlParams.carType), [robotType, urlParams.carType]);

  const [jointValues, setJointValues] = useState<number[]>(activeJoints.map(j => j.default));
  const [actualJointValues, setActualJointValues] = useState<number[]>(activeJoints.map(j => j.default));
  const [mode, setMode] = useState<AppMode>('sim');
  const [rawPositions, setRawPositions] = useState<Record<string, number>>({});

  // Connection settings - use URL params if provided
  const [jetsonHost, setJetsonHost] = useState(urlParams.ip || DEFAULT_JETSON_HOST);
  const [jetsonPort, setJetsonPort] = useState(parseInt(urlParams.armPort) || DEFAULT_JETSON_PORT);
  const [cameraPort, setCameraPort] = useState(parseInt(urlParams.cameraPort) || DEFAULT_CAMERA_PORT);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [showSettings, setShowSettings] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // View layout for bench mode
  const [viewLayout, setViewLayout] = useState<ViewLayout>('split');
  const [liveCameraConnected, setLiveCameraConnected] = useState(false);

  // Teleoperation state
  const [teleop, setTeleop] = useState<TeleopState>({ enabled: false, followerConnected: false });

  // Camera system
  const [cameras, setCameras] = useState<VirtualCameraConfig[]>(() => {
    const stored = localStorage.getItem(CAMERA_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [showCameras, setShowCameras] = useState(false);
  const [showPreviews, setShowPreviews] = useState(true);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const cameraRefs = useRef<Map<string, VirtualCameraHandle>>(new Map());

  // Recording
  const [showRecording, setShowRecording] = useState(false);
  const getCameraCapture = useCallback((cameraId: string) => {
    const handle = cameraRefs.current.get(cameraId);
    return handle?.capture() ?? null;
  }, []);

  const recording = useRecording({
    jointValues,
    cameras,
    getCameraCapture,
    fps: 50
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Save cameras to localStorage
  useEffect(() => {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(cameras));
  }, [cameras]);

  // Connect to Jetson WebSocket
  const connectToJetson = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus('connecting');
    const ws = new WebSocket(`ws://${jetsonHost}:${jetsonPort}`);

    ws.onopen = () => {
      console.log('Connected to Jetson');
      setConnectionStatus('connected');
      setReconnectAttempts(0);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'positions') {
          const newValues = activeJoints.map(j => data.positions[j.name] ?? j.default);
          // In real/calibrate mode, jointValues follow the leader arm
          if (mode === 'real' || mode === 'calibrate') {
            setJointValues(newValues);
          }
          // In bench mode, actualJointValues track what the leader arm is doing
          if (mode === 'bench') {
            setActualJointValues(newValues);
          }
          if (data.raw_positions) {
            setRawPositions(data.raw_positions);
          } else {
            // Fallback: derive raw positions from calibrated if server doesn't send raw
            // This maps MuJoCo joint names back to leader joint names with normalized values
            const leaderNames = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
            const fallbackRaw: Record<string, number> = {};
            activeJoints.forEach((j, i) => {
              // Normalize calibrated value to [-1, 1] range based on MuJoCo limits
              const val = data.positions[j.name] ?? j.default;
              const normalized = ((val - j.min) / (j.max - j.min)) * 2 - 1;
              fallbackRaw[leaderNames[i]] = normalized;
            });
            setRawPositions(fallbackRaw);
          }
        } else if (data.type === 'calibration_saved') {
          if (data.success) {
            alert('Calibration saved to Jetson!');
          } else {
            alert(`Calibration save failed: ${data.error}`);
          }
        } else if (data.type === 'connected') {
          // Initial connection message with follower status
          setTeleop({
            enabled: data.teleop_enabled ?? false,
            followerConnected: data.follower_connected ?? false,
          });
        } else if (data.type === 'teleop_status') {
          setTeleop({
            enabled: data.enabled ?? false,
            followerConnected: data.follower_connected ?? false,
          });
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onerror = () => {
      setConnectionStatus('error');
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      wsRef.current = null;

      if (mode === 'real' || mode === 'calibrate' || mode === 'bench') {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
        setReconnectAttempts(prev => prev + 1);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (mode === 'real' || mode === 'calibrate' || mode === 'bench') {
            connectToJetson();
          }
        }, delay);
      }
    };

    wsRef.current = ws;
  }, [jetsonHost, jetsonPort, mode, reconnectAttempts]);

  const disconnectFromJetson = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
    setReconnectAttempts(0);
  }, []);

  // Auto-connect when switching to real/calibrate/bench mode
  useEffect(() => {
    if ((mode === 'real' || mode === 'calibrate' || mode === 'bench') && connectionStatus === 'disconnected') {
      connectToJetson();
    }
  }, [mode, connectionStatus, connectToJetson]);

  // Disconnect when switching to sim mode
  useEffect(() => {
    if (mode === 'sim' && wsRef.current) {
      disconnectFromJetson();
    }
  }, [mode, disconnectFromJetson]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Teleop: send joint positions to follower (defined first to avoid circular dependency)
  const sendJointPositions = useCallback((positions: number[]) => {
    if (!teleop.enabled || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const positionDict: Record<string, number> = {};
    activeJoints.forEach((joint, i) => {
      positionDict[joint.name] = positions[i];
    });

    wsRef.current.send(JSON.stringify({
      type: 'set_positions',
      positions: positionDict,
    }));
  }, [teleop.enabled, activeJoints]);

  // Teleop: toggle enable
  const toggleTeleop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'enable_teleop',
        enabled: !teleop.enabled,
      }));
    }
  }, [teleop.enabled]);

  const handleJointChange = useCallback((index: number, value: number) => {
    if (mode === 'sim' || mode === 'bench') {
      setJointValues(prev => {
        const next = [...prev];
        next[index] = value;
        // Send to follower if teleop enabled
        if (teleop.enabled) {
          sendJointPositions(next);
        }
        return next;
      });
    }
  }, [mode, teleop.enabled, sendJointPositions]);

  const resetJoints = useCallback(() => {
    setJointValues(activeJoints.map(j => j.default));
  }, [activeJoints]);

  // Camera handlers
  const handleAddCamera = useCallback((camera: VirtualCameraConfig) => {
    setCameras(prev => [...prev, camera]);
  }, []);

  const handleRemoveCamera = useCallback((id: string) => {
    setCameras(prev => prev.filter(c => c.id !== id));
    if (selectedCameraId === id) {
      setSelectedCameraId(null);
    }
  }, [selectedCameraId]);

  const handleUpdateCamera = useCallback((id: string, updates: Partial<VirtualCameraConfig>) => {
    setCameras(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const handleCameraPositionChange = useCallback((id: string, position: [number, number, number]) => {
    setCameras(prev => prev.map(c => c.id === id ? { ...c, position } : c));
  }, []);


  // Calibration handlers
  const handleCalibrationComplete = useCallback((calibration: CalibrationResult) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'upload_calibration',
        calibration
      }));
    }
    setMode('real');
  }, []);

  const handleCalibrationCancel = useCallback(() => {
    setMode('real');
  }, []);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#10b981';
      case 'connecting': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#666';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Connection Error';
      default: return 'Disconnected';
    }
  };

  const getModeColor = () => {
    switch (mode) {
      case 'sim': return '#0ea5e9';
      case 'real': return '#10b981';
      case 'bench': return '#8b5cf6';
      case 'calibrate': return '#f59e0b';
    }
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', background: '#111' }}>
      {/* Sidebar */}
      <div style={{
        width: 280,
        minWidth: 280,
        background: '#1a1a1a',
        borderRight: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>Forge RDE</div>
            <div style={{ color: '#666', fontSize: 11 }}>
              {robotType === 'car' ? `ELEGOO ${urlParams.carType || 'Smart Car'}` : `SO-ARM100`}
            </div>
          </div>
        </div>

        {/* Mode Toggle */}
        <div style={{ padding: 16, borderBottom: '1px solid #333' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            background: '#111',
            borderRadius: 8,
            padding: 4,
            gap: 2,
          }}>
            {(['sim', 'real', 'bench', 'calibrate'] as AppMode[]).map((m) => {
              const colors: Record<AppMode, string> = {
                sim: '#0ea5e9',
                real: '#10b981',
                bench: '#8b5cf6',
                calibrate: '#f59e0b',
              };
              const labels: Record<AppMode, string> = {
                sim: 'Sim',
                real: 'Real',
                bench: 'Bench',
                calibrate: 'Cal',
              };
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '8px 0',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: mode === m ? colors[m] : 'transparent',
                    color: mode === m ? '#fff' : '#888',
                  }}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Connection Settings (when in real/calibrate/bench mode) */}
          {(mode === 'real' || mode === 'calibrate' || mode === 'bench') && (
            <div style={{ padding: 16, borderBottom: '1px solid #333' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => setShowSettings(!showSettings)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: getStatusColor(),
                    boxShadow: connectionStatus === 'connected' ? `0 0 8px ${getStatusColor()}` : 'none',
                  }} />
                  <span style={{ color: '#ccc', fontSize: 12 }}>
                    {getStatusText()}
                    {connectionStatus === 'connecting' && reconnectAttempts > 0 && ` (${reconnectAttempts})`}
                  </span>
                </div>
                <span style={{ color: '#666', fontSize: 10 }}>{showSettings ? '▲' : '▼'}</span>
              </div>

              {showSettings && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ color: '#888', fontSize: 10, display: 'block', marginBottom: 4 }}>Host</label>
                    <input
                      type="text"
                      value={jetsonHost}
                      onChange={(e) => setJetsonHost(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        border: '1px solid #333',
                        borderRadius: 6,
                        background: '#111',
                        color: '#fff',
                        fontSize: 12,
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ color: '#888', fontSize: 10, display: 'block', marginBottom: 4 }}>Arm Port</label>
                      <input
                        type="number"
                        value={jetsonPort}
                        onChange={(e) => setJetsonPort(parseInt(e.target.value) || 8765)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid #333',
                          borderRadius: 6,
                          background: '#111',
                          color: '#fff',
                          fontSize: 12,
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ color: '#888', fontSize: 10, display: 'block', marginBottom: 4 }}>Cam Port</label>
                      <input
                        type="number"
                        value={cameraPort}
                        onChange={(e) => setCameraPort(parseInt(e.target.value) || 8766)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid #333',
                          borderRadius: 6,
                          background: '#111',
                          color: '#fff',
                          fontSize: 12,
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={connectionStatus === 'connected' ? disconnectFromJetson : connectToJetson}
                    style={{
                      width: '100%',
                      padding: 8,
                      border: 'none',
                      borderRadius: 6,
                      background: connectionStatus === 'connected' ? '#ef4444' : '#10b981',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {connectionStatus === 'connected' ? 'Disconnect' : 'Connect'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bench Mode Layout Controls */}
          {mode === 'bench' && (
            <div style={{ padding: 16, borderBottom: '1px solid #333' }}>
              <div style={{ color: '#666', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 12, letterSpacing: 1 }}>
                View Layout
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                background: '#111',
                borderRadius: 6,
                padding: 3,
                gap: 2,
              }}>
                {(['sim-only', 'split', 'cameras-only'] as ViewLayout[]).map((layout) => {
                  const labels: Record<ViewLayout, string> = {
                    'sim-only': 'Sim',
                    'split': 'Split',
                    'cameras-only': 'Cams',
                  };
                  return (
                    <button
                      key={layout}
                      onClick={() => setViewLayout(layout)}
                      style={{
                        padding: '6px 0',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 500,
                        cursor: 'pointer',
                        background: viewLayout === layout ? '#8b5cf6' : 'transparent',
                        color: viewLayout === layout ? '#fff' : '#888',
                      }}
                    >
                      {labels[layout]}
                    </button>
                  );
                })}
              </div>

              {/* Camera connection status */}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: liveCameraConnected ? '#10b981' : '#666',
                }} />
                <span style={{ color: '#888', fontSize: 11 }}>
                  Live Cameras: {liveCameraConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              {/* Teleop controls */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #333' }}>
                <div style={{ color: '#666', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>
                  Teleoperation
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: teleop.followerConnected ? '#10b981' : '#666',
                  }} />
                  <span style={{ color: '#888', fontSize: 11 }}>
                    Follower: {teleop.followerConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <button
                  onClick={toggleTeleop}
                  disabled={!teleop.followerConnected || connectionStatus !== 'connected'}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: 'none',
                    borderRadius: 6,
                    background: teleop.enabled
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : teleop.followerConnected
                        ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
                        : '#333',
                    color: teleop.followerConnected ? '#fff' : '#666',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: teleop.followerConnected ? 'pointer' : 'not-allowed',
                  }}
                >
                  {teleop.enabled ? 'Stop Teleop' : 'Enable Teleop'}
                </button>
                {teleop.enabled && (
                  <p style={{ color: '#8b5cf6', fontSize: 10, marginTop: 6, textAlign: 'center' }}>
                    Move sliders to control follower arm
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Calibration Wizard */}
          {mode === 'calibrate' && (
            <CalibrationWizard
              rawPositions={rawPositions}
              onComplete={handleCalibrationComplete}
              onCancel={handleCalibrationCancel}
              isConnected={connectionStatus === 'connected'}
            />
          )}

          {/* Joint Controls (not in calibrate mode) */}
          {mode !== 'calibrate' && (
            <div style={{ padding: 16, borderBottom: '1px solid #333' }}>
              <div style={{ color: '#666', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 12, letterSpacing: 1 }}>
                {robotType === 'car' ? 'Motor Controls' : 'Joint Positions'}
              </div>
              {activeJoints.map((joint, i) => {
                const pct = ((jointValues[i] - joint.min) / (joint.max - joint.min)) * 100;
                const displayValue = robotType === 'car' && joint.name !== 'ultrasonic_servo'
                  ? Math.round(jointValues[i]) // Show velocity for car motors
                  : Math.round((jointValues[i] / Math.PI) * 180); // Show degrees for arm/servo
                return (
                  <div key={joint.name} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#ccc', fontSize: 13 }}>{joint.label}</span>
                      <span style={{ color: getModeColor(), fontSize: 11, fontFamily: 'monospace' }}>
                        {displayValue}{robotType === 'car' && joint.name !== 'ultrasonic_servo' ? '' : '°'}
                      </span>
                    </div>
                    <div style={{ position: 'relative', height: 6, background: '#333', borderRadius: 3 }}>
                      <div style={{
                        position: 'absolute',
                        height: '100%',
                        width: `${Math.max(0, Math.min(100, pct))}%`,
                        background: mode === 'real'
                          ? 'linear-gradient(90deg, #10b981, #06b6d4)'
                          : 'linear-gradient(90deg, #0ea5e9, #8b5cf6)',
                        borderRadius: 3,
                        transition: mode === 'real' ? 'width 0.05s ease-out' : 'none',
                      }} />
                    </div>
                    {(mode === 'sim' || mode === 'bench') && (
                      <input
                        type="range"
                        min={joint.min}
                        max={joint.max}
                        step={0.01}
                        value={jointValues[i]}
                        onChange={(e) => handleJointChange(i, parseFloat(e.target.value))}
                        style={{
                          width: '100%',
                          marginTop: -6,
                          height: 20,
                          opacity: 0,
                          cursor: 'pointer',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Cameras Section */}
          <div style={{ borderBottom: '1px solid #333' }}>
            <div
              style={{
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
              }}
              onClick={() => setShowCameras(!showCameras)}
            >
              <span style={{ color: '#666', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Cameras ({cameras.length})
              </span>
              <span style={{ color: '#666', fontSize: 10 }}>{showCameras ? '▲' : '▼'}</span>
            </div>
            {showCameras && (
              <>
                <CameraManager
                  cameras={cameras}
                  selectedCameraId={selectedCameraId}
                  onAddCamera={handleAddCamera}
                  onRemoveCamera={handleRemoveCamera}
                  onUpdateCamera={handleUpdateCamera}
                  onSelectCamera={setSelectedCameraId}
                />
                <div style={{ padding: '0 16px 16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 11, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showPreviews}
                      onChange={e => setShowPreviews(e.target.checked)}
                    />
                    Show camera previews
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Recording Section */}
          <div style={{ borderBottom: '1px solid #333' }}>
            <div
              style={{
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
              }}
              onClick={() => setShowRecording(!showRecording)}
            >
              <span style={{ color: '#666', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Recording {recording.isRecording && '(REC)'}
              </span>
              <span style={{ color: '#666', fontSize: 10 }}>{showRecording ? '▲' : '▼'}</span>
            </div>
            {showRecording && (
              <RecordingControls
                isRecording={recording.isRecording}
                currentEpisode={recording.currentEpisode}
                completedEpisodes={recording.completedEpisodes}
                taskName={recording.taskName}
                frameCount={recording.frameCount}
                cameras={cameras}
                onStart={recording.startRecording}
                onStop={recording.stopRecording}
                onTaskNameChange={recording.setTaskName}
                onClearEpisodes={recording.clearEpisodes}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: 16, borderTop: '1px solid #333' }}>
          <button
            onClick={() => {
              resetJoints();
              if (teleop.enabled) sendJointPositions(activeJoints.map(j => j.default));
            }}
            disabled={mode !== 'sim' && mode !== 'bench'}
            style={{
              width: '100%',
              padding: 10,
              border: 'none',
              borderRadius: 8,
              background: (mode !== 'sim' && mode !== 'bench') ? '#333' : '#0ea5e9',
              color: (mode !== 'sim' && mode !== 'bench') ? '#666' : '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: (mode !== 'sim' && mode !== 'bench') ? 'not-allowed' : 'pointer',
              marginBottom: 8,
            }}
          >
            Reset to Home
          </button>
          <button
            onClick={() => {
              const newPositions = activeJoints.map(j =>
                j.min + Math.random() * (j.max - j.min) * 0.6 + (j.max - j.min) * 0.2
              );
              setJointValues(newPositions);
              if (teleop.enabled) sendJointPositions(newPositions);
            }}
            disabled={mode !== 'sim' && mode !== 'bench'}
            style={{
              width: '100%',
              padding: 10,
              border: 'none',
              borderRadius: 8,
              background: '#333',
              color: (mode !== 'sim' && mode !== 'bench') ? '#555' : '#ccc',
              fontSize: 13,
              fontWeight: 500,
              cursor: (mode !== 'sim' && mode !== 'bench') ? 'not-allowed' : 'pointer',
            }}
          >
            Random Pose
          </button>
        </div>

        {/* Status */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: mode !== 'sim' ? getStatusColor() : '#10b981'
            }} />
            <span style={{ color: '#666', fontSize: 11 }}>
              {mode === 'sim' ? 'Sim Mode' : `Jetson ${jetsonHost}`}
            </span>
          </div>
          <span style={{ color: '#555', fontSize: 10 }}>
            {mode !== 'sim' && connectionStatus === 'connected' ? '50Hz' : ''}
          </span>
        </div>
      </div>

      {/* Main Viewport Area */}
      <div style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Bench mode with split view uses ResizableSplit */}
        {mode === 'bench' && viewLayout === 'split' ? (
          <ResizableSplit
            initialRatio={0.5}
            minRatio={0.25}
            maxRatio={0.75}
            left={
              <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <MujocoProvider>
                  <MujocoCanvas
                    config={config}
                    camera={{
                      position: [0.5, -0.5, 0.4],
                      up: [0, 0, 1],
                      fov: 50,
                    }}
                    shadows
                    style={{ width: '100%', height: '100%' }}
                  >
                    <Scene
                      jointValues={jointValues}
                      joints={activeJoints}
                      cameras={cameras}
                      selectedCameraId={selectedCameraId}
                      cameraRefs={cameraRefs}
                      onSelectCamera={setSelectedCameraId}
                      onCameraPositionChange={handleCameraPositionChange}
                      orbitEnabled={orbitEnabled}
                      onOrbitEnable={setOrbitEnabled}
                    />
                    <color attach="background" args={['#1a1a1a']} />
                  </MujocoCanvas>
                </MujocoProvider>
                {/* Sim Panel Label */}
                <div style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  background: 'rgba(0, 0, 0, 0.6)',
                  color: '#0ea5e9',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}>
                  Intended (Sim)
                </div>
                {/* Joint overlay on sim */}
                <JointOverlay
                  joints={activeJoints}
                  positions={jointValues}
                  side="left"
                  label="Target"
                  color="#0ea5e9"
                />
              </div>
            }
            right={
              <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <LiveCameraFeed
                  host={jetsonHost}
                  port={cameraPort}
                  onConnectionChange={setLiveCameraConnected}
                  autoConnect
                  overlay={
                    <JointOverlay
                      joints={activeJoints}
                      positions={actualJointValues}
                      side="right"
                      label="Actual"
                      color="#10b981"
                    />
                  }
                />
                {/* Actual Panel Label */}
                <div style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  background: 'rgba(0, 0, 0, 0.6)',
                  color: '#10b981',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}>
                  Actual (Live)
                </div>
              </div>
            }
          />
        ) : (
          <>
            {/* Non-split layouts */}
            {/* Simulation Panel - show unless cameras-only in bench mode */}
            {!(mode === 'bench' && viewLayout === 'cameras-only') && (
              <div style={{
                flex: 1,
                position: 'relative',
                minWidth: 0,
              }}>
                <MujocoProvider>
                  <MujocoCanvas
                    config={config}
                    camera={{
                      position: [0.5, -0.5, 0.4],
                      up: [0, 0, 1],
                      fov: 50,
                    }}
                    shadows
                    style={{ width: '100%', height: '100%' }}
                  >
                    <Scene
                      jointValues={jointValues}
                      joints={activeJoints}
                      cameras={cameras}
                      selectedCameraId={selectedCameraId}
                      cameraRefs={cameraRefs}
                      onSelectCamera={setSelectedCameraId}
                      onCameraPositionChange={handleCameraPositionChange}
                      orbitEnabled={orbitEnabled}
                      onOrbitEnable={setOrbitEnabled}
                    />
                    <color attach="background" args={['#1a1a1a']} />
                  </MujocoCanvas>
                </MujocoProvider>

                {/* Camera Previews - only show in non-bench modes or sim-only layout */}
                {(mode !== 'bench' || viewLayout === 'sim-only') && (
                  <CameraPreviewGrid
                    cameras={cameras}
                    cameraRefs={cameraRefs}
                    visible={showPreviews && cameras.length > 0}
                  />
                )}
              </div>
            )}

            {/* Live Camera Panel - cameras-only mode */}
            {mode === 'bench' && viewLayout === 'cameras-only' && (
              <div style={{
                flex: 1,
                position: 'relative',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
              }}>
                <LiveCameraFeed
                  host={jetsonHost}
                  port={cameraPort}
                  onConnectionChange={setLiveCameraConnected}
                  autoConnect
                />
              </div>
            )}
          </>
        )}

        {/* Diagnostics Panel - show in bench mode with split view */}
        {mode === 'bench' && viewLayout === 'split' && (
          <DiagnosticsPanel
            joints={activeJoints}
            intendedPositions={jointValues}
            actualPositions={actualJointValues}
            isConnected={connectionStatus === 'connected'}
            isTeleopEnabled={teleop.enabled}
            followerConnected={teleop.followerConnected}
          />
        )}

        {/* Mode Badge */}
        <div style={{
          position: 'absolute',
          top: 16,
          left: mode === 'bench' && viewLayout === 'split' ? '50%' : 16,
          transform: mode === 'bench' && viewLayout === 'split' ? 'translateX(-50%)' : 'none',
          padding: '6px 12px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 500,
          background: `${getModeColor()}33`,
          color: getModeColor(),
          border: `1px solid ${getModeColor()}55`,
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 10,
        }}>
          {mode !== 'sim' && (
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: getStatusColor(),
              animation: connectionStatus === 'connecting' ? 'pulse 1s infinite' : 'none',
            }} />
          )}
          {mode === 'sim' ? 'Simulation' : mode === 'real' ? 'Real Robot' : mode === 'bench' ? 'Live Bench' : 'Calibration'}
        </div>

        {/* Recording indicator */}
        {recording.isRecording && (
          <div style={{
            position: 'absolute',
            top: 16,
            left: 130,
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#ef4444',
              animation: 'pulse 1s infinite',
            }} />
            REC {recording.frameCount}f
          </div>
        )}

        {/* Controls hint */}
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          fontSize: 10,
          color: '#555',
          fontFamily: 'system-ui, sans-serif',
        }}>
          Drag to orbit · Scroll to zoom · Right-click to pan
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default App;
