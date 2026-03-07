// App Modes
export type AppMode = 'sim' | 'real' | 'calibrate' | 'bench';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// View Layout
export type ViewLayout = 'sim-only' | 'split' | 'cameras-only';

// Joint definitions
export interface JointConfig {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
}

// Calibration Types
export interface JointCalibrationData {
  jointName: string;      // Internal name (shoulder_pan, etc.)
  mujocoName: string;     // MuJoCo name (Rotation, etc.)
  mujocoMin: number;
  mujocoMax: number;
  leaderMin: number | null;
  leaderMax: number | null;
}

export interface CalibrationState {
  currentJoint: number;   // 0-5 (6 joints)
  phase: 'idle' | 'min' | 'max' | 'complete';
  joints: JointCalibrationData[];
  isActive: boolean;
}

export interface CalibrationResult {
  home_positions: {
    leader: Record<string, number>;
    mujoco: number[];
  };
  joint_mappings: Record<string, {
    leader_min: number;
    leader_max: number;
    leader_range: number;
  }>;
  offsets: Record<string, number>;
  scales: Record<string, number>;
}

// Virtual Camera Types
export interface VirtualCameraConfig {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  resolution: { width: number; height: number };
  enabled: boolean;
}

export interface CameraCapture {
  cameraId: string;
  pixels: Uint8Array;
  width: number;
  height: number;
  timestamp: number;
}

// Recording Types
export interface RecordingFrame {
  timestamp: number;
  frameIndex: number;
  jointPositions: number[];
  images: Record<string, Uint8Array>;
}

export interface RecordingEpisode {
  episodeIndex: number;
  task: string;
  frames: RecordingFrame[];
  startTime: number;
  endTime: number | null;
}

export interface RecordingState {
  isRecording: boolean;
  currentEpisode: RecordingEpisode | null;
  completedEpisodes: RecordingEpisode[];
  fps: number;
  taskName: string;
}

// WebSocket Message Types
export interface PositionsMessage {
  type: 'positions';
  positions: Record<string, number>;
  raw_positions?: Record<string, number>;
  timestamp: number;
}

export interface CalibrationUploadMessage {
  type: 'upload_calibration';
  calibration: CalibrationResult;
}

export interface CalibrationAckMessage {
  type: 'calibration_saved';
  success: boolean;
  path?: string;
  error?: string;
}

// Live Bench Types
export interface LiveCameraConfig {
  id: number;
  name: string;
  width: number;
  height: number;
  fps: number;
  enabled: boolean;
}

export interface VerifierMetrics {
  trajectoryDrift: number;       // Radians deviation from target
  poseSuccess: boolean;
  taskState: 'idle' | 'in_progress' | 'completed' | 'failed';
  visualMismatch: number;        // 0-1 score
  timestamp: number;
}

export interface DiagnosisResult {
  id: string;
  timestamp: number;
  summary: string;
  causes: string[];
  suggestedFix: string;
  confidence: number;
  verified: boolean;
}

// Teleoperation
export interface TeleopState {
  enabled: boolean;
  followerConnected: boolean;
}
