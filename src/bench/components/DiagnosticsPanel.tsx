import { useMemo } from 'react';

interface JointConfig {
  name: string;
  label: string;
  min: number;
  max: number;
}

interface DiagnosticsPanelProps {
  joints: JointConfig[];
  intendedPositions: number[];  // From sim/sliders
  actualPositions: number[];    // From leader arm
  isConnected: boolean;
  isTeleopEnabled: boolean;
  followerConnected: boolean;
  latencyMs?: number;
}

export function DiagnosticsPanel({
  joints,
  intendedPositions,
  actualPositions,
  isConnected,
  isTeleopEnabled,
  followerConnected,
  latencyMs = 0,
}: DiagnosticsPanelProps) {
  // Calculate drift for each joint
  const jointDrifts = useMemo(() => {
    return joints.map((joint, i) => {
      const intended = intendedPositions[i] ?? joint.min;
      const actual = actualPositions[i] ?? joint.min;
      const range = joint.max - joint.min;
      const driftRad = Math.abs(intended - actual);
      const driftPct = (driftRad / range) * 100;
      const driftDeg = (driftRad / Math.PI) * 180;
      return { driftRad, driftPct, driftDeg };
    });
  }, [joints, intendedPositions, actualPositions]);

  // Overall drift score
  const totalDrift = useMemo(() => {
    const avgDriftPct = jointDrifts.reduce((sum, d) => sum + d.driftPct, 0) / jointDrifts.length;
    return avgDriftPct;
  }, [jointDrifts]);

  const getDriftColor = (pct: number) => {
    if (pct < 5) return '#10b981';  // Green - good
    if (pct < 15) return '#f59e0b'; // Yellow - warning
    return '#ef4444';               // Red - bad
  };

  const getStatusIcon = (ok: boolean) => ok ? '●' : '○';

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 8,
      width: 280,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(10px)',
      borderRadius: 12,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 11,
      color: '#fff',
      overflow: 'hidden',
      zIndex: 100,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>Diagnostics</span>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          borderRadius: 12,
          background: getDriftColor(totalDrift) + '22',
          color: getDriftColor(totalDrift),
          fontWeight: 600,
          fontSize: 10,
        }}>
          {totalDrift < 5 ? 'SYNC' : totalDrift < 15 ? 'DRIFT' : 'DESYNC'}
          <span style={{ opacity: 0.7 }}>{totalDrift.toFixed(1)}%</span>
        </div>
      </div>

      {/* Status Row */}
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        gap: 12,
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        fontSize: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: isConnected ? '#10b981' : '#666' }}>{getStatusIcon(isConnected)}</span>
          <span style={{ color: '#888' }}>Leader</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: followerConnected ? '#10b981' : '#666' }}>{getStatusIcon(followerConnected)}</span>
          <span style={{ color: '#888' }}>Follower</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: isTeleopEnabled ? '#8b5cf6' : '#666' }}>{getStatusIcon(isTeleopEnabled)}</span>
          <span style={{ color: '#888' }}>Teleop</span>
        </div>
        {latencyMs > 0 && (
          <div style={{ marginLeft: 'auto', color: '#666' }}>
            {latencyMs}ms
          </div>
        )}
      </div>

      {/* Joint Comparison */}
      <div style={{ padding: '8px 12px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr 40px',
          gap: '6px 8px',
          fontSize: 10,
        }}>
          {/* Header */}
          <div style={{ color: '#666', fontWeight: 500 }}>Joint</div>
          <div style={{ color: '#666', fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
            <span>Intended</span>
            <span>Actual</span>
          </div>
          <div style={{ color: '#666', fontWeight: 500, textAlign: 'right' }}>Drift</div>

          {/* Joints */}
          {joints.map((joint, i) => {
            const intended = intendedPositions[i] ?? joint.min;
            const actual = actualPositions[i] ?? joint.min;
            const drift = jointDrifts[i];
            const range = joint.max - joint.min;
            const intendedPct = ((intended - joint.min) / range) * 100;
            const actualPct = ((actual - joint.min) / range) * 100;

            return (
              <div key={joint.name} style={{ display: 'contents' }}>
                <div style={{ color: '#ccc', fontWeight: 500 }}>{joint.label}</div>
                <div style={{ position: 'relative', height: 14 }}>
                  {/* Track */}
                  <div style={{
                    position: 'absolute',
                    top: 6,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: '#333',
                    borderRadius: 1,
                  }} />
                  {/* Intended marker */}
                  <div style={{
                    position: 'absolute',
                    top: 3,
                    left: `${intendedPct}%`,
                    width: 8,
                    height: 8,
                    marginLeft: -4,
                    borderRadius: '50%',
                    background: '#0ea5e9',
                    border: '2px solid #0ea5e9',
                    boxShadow: '0 0 6px #0ea5e955',
                  }} />
                  {/* Actual marker */}
                  <div style={{
                    position: 'absolute',
                    top: 3,
                    left: `${actualPct}%`,
                    width: 8,
                    height: 8,
                    marginLeft: -4,
                    borderRadius: '50%',
                    background: 'transparent',
                    border: '2px solid #10b981',
                  }} />
                  {/* Drift line */}
                  {drift.driftPct > 2 && (
                    <div style={{
                      position: 'absolute',
                      top: 6,
                      left: `${Math.min(intendedPct, actualPct)}%`,
                      width: `${Math.abs(intendedPct - actualPct)}%`,
                      height: 2,
                      background: getDriftColor(drift.driftPct),
                      opacity: 0.5,
                    }} />
                  )}
                </div>
                <div style={{
                  textAlign: 'right',
                  color: getDriftColor(drift.driftPct),
                  fontFamily: 'monospace',
                  fontWeight: drift.driftPct > 10 ? 600 : 400,
                }}>
                  {drift.driftDeg.toFixed(0)}°
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        gap: 16,
        fontSize: 9,
        color: '#666',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0ea5e9' }} />
          Intended
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid #10b981', boxSizing: 'border-box' }} />
          Actual
        </div>
      </div>
    </div>
  );
}
