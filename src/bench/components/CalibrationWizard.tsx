import { useState, useCallback } from 'react';
import type { CalibrationState, CalibrationResult } from '../types';

// Joint mapping from leader arm to MuJoCo
const JOINT_MAPPING = [
  { leader: 'shoulder_pan', mujoco: 'Rotation', label: 'Base Rotation', min: -2.2, max: 2.2 },
  { leader: 'shoulder_lift', mujoco: 'Pitch', label: 'Shoulder Pitch', min: -3.14, max: 0.2 },
  { leader: 'elbow_flex', mujoco: 'Elbow', label: 'Elbow', min: 0, max: 3.14 },
  { leader: 'wrist_flex', mujoco: 'Wrist_Pitch', label: 'Wrist Pitch', min: -2.0, max: 1.8 },
  { leader: 'wrist_roll', mujoco: 'Wrist_Roll', label: 'Wrist Roll', min: -3.14, max: 3.14 },
  { leader: 'gripper', mujoco: 'Jaw', label: 'Gripper', min: -0.2, max: 2.0 },
];

interface CalibrationWizardProps {
  rawPositions: Record<string, number>;
  onComplete: (calibration: CalibrationResult) => void;
  onCancel: () => void;
  isConnected: boolean;
}

export function CalibrationWizard({
  rawPositions,
  onComplete,
  onCancel,
  isConnected
}: CalibrationWizardProps) {
  const [state, setState] = useState<CalibrationState>(() => ({
    currentJoint: 0,
    phase: 'idle',
    joints: JOINT_MAPPING.map(j => ({
      jointName: j.leader,
      mujocoName: j.mujoco,
      mujocoMin: j.min,
      mujocoMax: j.max,
      leaderMin: null,
      leaderMax: null,
    })),
    isActive: true,
  }));

  const currentJointConfig = JOINT_MAPPING[state.currentJoint];
  const currentJointData = state.joints[state.currentJoint];
  const currentRawValue = rawPositions[currentJointConfig?.leader] ?? 0;

  const recordMin = useCallback(() => {
    setState(prev => {
      const newJoints = [...prev.joints];
      newJoints[prev.currentJoint] = {
        ...newJoints[prev.currentJoint],
        leaderMin: currentRawValue
      };
      return { ...prev, joints: newJoints, phase: 'max' };
    });
  }, [currentRawValue]);

  const recordMax = useCallback(() => {
    setState(prev => {
      const newJoints = [...prev.joints];
      newJoints[prev.currentJoint] = {
        ...newJoints[prev.currentJoint],
        leaderMax: currentRawValue
      };

      // Move to next joint or complete
      if (prev.currentJoint < 5) {
        return {
          ...prev,
          joints: newJoints,
          currentJoint: prev.currentJoint + 1,
          phase: 'min'
        };
      } else {
        return { ...prev, joints: newJoints, phase: 'complete' };
      }
    });
  }, [currentRawValue]);

  const startCalibration = useCallback(() => {
    setState(prev => ({ ...prev, phase: 'min' }));
  }, []);

  const computeCalibration = useCallback((): CalibrationResult => {
    const result: CalibrationResult = {
      home_positions: {
        leader: {},
        mujoco: JOINT_MAPPING.map(j => j.min + (j.max - j.min) / 2)
      },
      joint_mappings: {},
      offsets: {},
      scales: {}
    };

    for (const joint of state.joints) {
      if (joint.leaderMin === null || joint.leaderMax === null) continue;

      const leaderRange = joint.leaderMax - joint.leaderMin;
      const mujocoRange = joint.mujocoMax - joint.mujocoMin;

      const scale = Math.abs(leaderRange) > 0.001 ? mujocoRange / leaderRange : 1;
      const offset = joint.mujocoMin - (joint.leaderMin * scale);

      result.joint_mappings[joint.jointName] = {
        leader_min: joint.leaderMin,
        leader_max: joint.leaderMax,
        leader_range: leaderRange
      };
      result.scales[joint.jointName] = scale;
      result.offsets[joint.jointName] = offset;
      result.home_positions.leader[joint.jointName] = (joint.leaderMin + joint.leaderMax) / 2;
    }

    return result;
  }, [state.joints]);

  const handleComplete = useCallback(() => {
    const calibration = computeCalibration();
    onComplete(calibration);
  }, [computeCalibration, onComplete]);

  const downloadCalibration = useCallback(() => {
    const calibration = computeCalibration();
    const blob = new Blob([JSON.stringify(calibration, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calibration.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [computeCalibration]);

  if (!isConnected) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>Calibration</span>
        </div>
        <div style={styles.content}>
          <div style={styles.warning}>
            Connect to the real robot to start calibration.
          </div>
          <button onClick={onCancel} style={styles.cancelBtn}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === 'idle') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>Calibration</span>
        </div>
        <div style={styles.content}>
          <p style={styles.description}>
            Calibrate the leader arm by moving each joint to its minimum and maximum positions.
          </p>
          <p style={styles.description}>
            This creates a mapping from motor values to MuJoCo joint angles.
          </p>
          <button onClick={startCalibration} style={styles.startBtn}>
            Start Calibration
          </button>
          <button onClick={onCancel} style={styles.cancelBtn}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === 'complete') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>Calibration Complete</span>
        </div>
        <div style={styles.content}>
          <div style={styles.summary}>
            {state.joints.map((joint, i) => (
              <div key={joint.jointName} style={styles.summaryRow}>
                <span style={styles.jointLabel}>{JOINT_MAPPING[i].label}</span>
                <span style={styles.jointValues}>
                  {joint.leaderMin?.toFixed(3)} → {joint.leaderMax?.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
          <button onClick={downloadCalibration} style={styles.downloadBtn}>
            Download calibration.json
          </button>
          <button onClick={handleComplete} style={styles.startBtn}>
            Apply & Send to Jetson
          </button>
          <button onClick={onCancel} style={styles.cancelBtn}>
            Discard
          </button>
        </div>
      </div>
    );
  }

  // Active calibration step
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>
          Joint {state.currentJoint + 1}/6: {currentJointConfig.label}
        </span>
      </div>

      {/* Progress bar */}
      <div style={styles.progressContainer}>
        {JOINT_MAPPING.map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.progressDot,
              background: i < state.currentJoint ? '#10b981' :
                         i === state.currentJoint ? '#f59e0b' : '#333'
            }}
          />
        ))}
      </div>

      <div style={styles.content}>
        <div style={styles.instruction}>
          {state.phase === 'min' ? (
            <>Move <strong>{currentJointConfig.label}</strong> to its <span style={{ color: '#ef4444' }}>MINIMUM</span> position</>
          ) : (
            <>Move <strong>{currentJointConfig.label}</strong> to its <span style={{ color: '#10b981' }}>MAXIMUM</span> position</>
          )}
        </div>

        <div style={styles.valueDisplay}>
          <span style={styles.valueLabel}>Current Value:</span>
          <span style={styles.value}>{currentRawValue.toFixed(4)}</span>
        </div>

        {currentJointData.leaderMin !== null && (
          <div style={styles.recordedValue}>
            Min recorded: {currentJointData.leaderMin.toFixed(4)}
          </div>
        )}

        <button
          onClick={state.phase === 'min' ? recordMin : recordMax}
          style={styles.recordBtn}
        >
          Record {state.phase === 'min' ? 'Minimum' : 'Maximum'}
        </button>

        <button onClick={onCancel} style={styles.cancelBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 16,
    borderBottom: '1px solid #333',
  },
  header: {
    marginBottom: 12,
  },
  title: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: 600,
  },
  progressContainer: {
    display: 'flex',
    gap: 6,
    marginBottom: 16,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  description: {
    color: '#888',
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
  },
  warning: {
    color: '#f59e0b',
    fontSize: 12,
    padding: 12,
    background: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 6,
    border: '1px solid rgba(245, 158, 11, 0.3)',
  },
  instruction: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 1.5,
    textAlign: 'center',
    padding: '12px 0',
  },
  valueDisplay: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#111',
    padding: '10px 14px',
    borderRadius: 6,
  },
  valueLabel: {
    color: '#666',
    fontSize: 11,
  },
  value: {
    color: '#0ea5e9',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  recordedValue: {
    color: '#10b981',
    fontSize: 11,
    textAlign: 'center',
  },
  summary: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: '#111',
    padding: 12,
    borderRadius: 6,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  jointLabel: {
    color: '#888',
    fontSize: 11,
  },
  jointValues: {
    color: '#10b981',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  startBtn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: 6,
    background: '#10b981',
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  recordBtn: {
    padding: '12px 16px',
    border: 'none',
    borderRadius: 6,
    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  downloadBtn: {
    padding: '10px 16px',
    border: '1px solid #333',
    borderRadius: 6,
    background: 'transparent',
    color: '#ccc',
    fontSize: 12,
    cursor: 'pointer',
  },
  cancelBtn: {
    padding: '8px 16px',
    border: '1px solid #333',
    borderRadius: 6,
    background: 'transparent',
    color: '#888',
    fontSize: 11,
    cursor: 'pointer',
  },
};
