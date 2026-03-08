import { useState, useRef, useEffect } from 'react';

interface Waypoint {
  joints: number[];
  duration: number;
  name: string;
}

interface Trajectory {
  name: string;
  description: string;
  waypoints: Waypoint[];
}

// Pick and place trajectory - Joint order: [Rotation, Pitch, Elbow, Wrist_Pitch, Wrist_Roll, Jaw]
// Block position: (0.1, -0.25, 0.115) - slightly right, forward
// Box position: (-0.1, -0.35, 0.09) - slightly left, further forward
const PICK_PLACE_DEMO: Trajectory = {
  name: "Pick and Place Demo",
  description: "Pick up red block and place in green box",
  waypoints: [
    // Start at home
    { joints: [0, -1.57, 1.57, 1.57, -1.57, 1.8], duration: 400, name: "home" },
    // Rotate towards block (x=0.1) and reach forward
    { joints: [0.38, -0.7, 1.1, 0.5, -1.57, 1.8], duration: 600, name: "above_block" },
    // Lower to block height (z=0.115)
    { joints: [0.38, -0.35, 0.75, 0.2, -1.57, 1.8], duration: 500, name: "approaching" },
    // At block - gripper around it
    { joints: [0.38, -0.2, 0.55, 0.0, -1.57, 1.8], duration: 400, name: "at_block" },
    // Close gripper
    { joints: [0.38, -0.2, 0.55, 0.0, -1.57, -0.1], duration: 350, name: "grasp" },
    // Lift block up
    { joints: [0.38, -0.8, 1.2, 0.6, -1.57, -0.1], duration: 500, name: "lift" },
    // Rotate to box (x=-0.1, y=-0.35) - turn left
    { joints: [-0.28, -0.8, 1.2, 0.6, -1.57, -0.1], duration: 700, name: "move_to_box" },
    // Lower towards box
    { joints: [-0.28, -0.4, 0.8, 0.2, -1.57, -0.1], duration: 500, name: "above_box" },
    // Into box
    { joints: [-0.28, -0.25, 0.6, 0.05, -1.57, -0.1], duration: 400, name: "in_box" },
    // Release
    { joints: [-0.28, -0.25, 0.6, 0.05, -1.57, 1.8], duration: 300, name: "release" },
    // Retract up
    { joints: [-0.28, -0.9, 1.3, 0.7, -1.57, 1.8], duration: 500, name: "retract" },
    // Back to home
    { joints: [0, -1.57, 1.57, 1.57, -1.57, 0.5], duration: 600, name: "done" },
  ]
};

const WAVE_DEMO: Trajectory = {
  name: "Wave Demo",
  description: "Wave motion",
  waypoints: [
    { joints: [0, -1.57, 1.57, 1.57, -1.57, 0.5], duration: 400, name: "home" },
    { joints: [0.8, -1.0, 1.0, 0.5, -1.57, 1.5], duration: 500, name: "wave1" },
    { joints: [-0.8, -1.0, 1.0, 0.5, -1.57, 1.5], duration: 500, name: "wave2" },
    { joints: [0.8, -1.0, 1.0, 0.5, -1.57, 1.5], duration: 500, name: "wave3" },
    { joints: [-0.8, -1.0, 1.0, 0.5, -1.57, 1.5], duration: 500, name: "wave4" },
    { joints: [0, -1.57, 1.57, 1.57, -1.57, 0.5], duration: 600, name: "done" },
  ]
};

const TRAJECTORIES = [PICK_PLACE_DEMO, WAVE_DEMO];

interface Props {
  onJointUpdate: (joints: number[]) => void;
  onPlayStateChange?: (playing: boolean, waypoint: string) => void;
  isConnected?: boolean;
}

export function TrajectoryPlayer({ onJointUpdate, onPlayStateChange }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waypointIdx, setWaypointIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);

  const animRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const waypointStartRef = useRef(0);

  const traj = TRAJECTORIES[selectedIdx];

  // Animation frame handler
  useEffect(() => {
    if (!isPlaying) return;

    let currentWp = waypointIdx;
    let wpStartTime = waypointStartRef.current;

    const animate = () => {
      const now = performance.now();
      const wp = traj.waypoints[currentWp];
      const prevWp = currentWp > 0 ? traj.waypoints[currentWp - 1] : wp;
      const duration = wp.duration / speed;

      const elapsed = now - wpStartTime;
      let t = Math.min(1, elapsed / duration);

      // Smoothstep interpolation
      const tSmooth = t * t * (3 - 2 * t);

      // Interpolate joints
      const joints = prevWp.joints.map((v, i) => v + (wp.joints[i] - v) * tSmooth);
      onJointUpdate(joints);

      // Update progress
      const totalWps = traj.waypoints.length;
      setProgress(((currentWp + t) / totalWps) * 100);
      setWaypointIdx(currentWp);

      // Check if waypoint complete
      if (t >= 1) {
        currentWp++;
        wpStartTime = now;
        waypointStartRef.current = now;

        if (currentWp >= traj.waypoints.length) {
          if (loop) {
            currentWp = 0;
            setWaypointIdx(0);
          } else {
            setIsPlaying(false);
            setProgress(100);
            onPlayStateChange?.(false, "complete");
            return;
          }
        }

        setWaypointIdx(currentWp);
        onPlayStateChange?.(true, traj.waypoints[currentWp].name);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [isPlaying, traj, speed, loop, onJointUpdate, onPlayStateChange]);

  const play = () => {
    setWaypointIdx(0);
    setProgress(0);
    waypointStartRef.current = performance.now();
    startTimeRef.current = performance.now();
    setIsPlaying(true);
    onPlayStateChange?.(true, traj.waypoints[0].name);
  };

  const stop = () => {
    setIsPlaying(false);
    setWaypointIdx(0);
    setProgress(0);
    onPlayStateChange?.(false, "stopped");
  };

  const wp = traj.waypoints[waypointIdx];

  return (
    <div style={{ padding: 12 }}>
      {/* Selector */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Demo</label>
        <select
          value={selectedIdx}
          onChange={(e) => { stop(); setSelectedIdx(Number(e.target.value)); }}
          disabled={isPlaying}
          style={selectStyle}
        >
          {TRAJECTORIES.map((t, i) => (
            <option key={i} value={i}>{t.name}</option>
          ))}
        </select>
        <p style={{ color: '#666', fontSize: 11, margin: '6px 0 0' }}>{traj.description}</p>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ height: 6, background: '#333', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)', transition: 'width 50ms' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ color: '#8b5cf6', fontSize: 11 }}>{wp?.name || '—'}</span>
          <span style={{ color: '#666', fontSize: 10, fontFamily: 'monospace' }}>{waypointIdx + 1}/{traj.waypoints.length}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {!isPlaying ? (
          <button onClick={play} style={playBtnStyle}>▶ Play</button>
        ) : (
          <button onClick={stop} style={stopBtnStyle}>⏹ Stop</button>
        )}
      </div>

      {/* Speed */}
      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>Speed: {speed}x</label>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.5}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* Loop */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 11, cursor: 'pointer' }}>
        <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
        Loop
      </label>

      {isPlaying && (
        <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(139,92,246,0.15)', borderRadius: 6, color: '#8b5cf6', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1s infinite' }} />
          Playing...
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', color: '#888', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 };
const selectStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #444', borderRadius: 6, background: '#111', color: '#fff', fontSize: 12 };
const playBtnStyle: React.CSSProperties = { flex: 1, padding: '10px 16px', border: 'none', borderRadius: 6, background: 'linear-gradient(135deg, #10b981, #06b6d4)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const stopBtnStyle: React.CSSProperties = { flex: 1, padding: '10px 16px', border: 'none', borderRadius: 6, background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
