import { UltrasonicRadar } from './UltrasonicRadar';

interface CarState {
  leftSpeed: number;
  rightSpeed: number;
  servoAngle: number;
  ultrasonicDistance: number;
  irLine: number[];
  irObstacle: boolean[];
  autonomousMode: boolean;
}

interface ScanPoint {
  angle: number;
  distance: number;
}

interface CarLiveOverlayProps {
  state: CarState;
  scanResults: ScanPoint[];
  intendedLeft?: number;
  intendedRight?: number;
  compact?: boolean;
}

function metricRow(label: string, value: string, accent?: string) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: accent || '#e2e8f0', fontWeight: 600, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

export function CarLiveOverlay({
  state,
  scanResults,
  intendedLeft = 0,
  intendedRight = 0,
  compact = false,
}: CarLiveOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        gap: 12,
        alignItems: compact ? 'stretch' : 'flex-end',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          minWidth: compact ? 180 : 210,
          padding: compact ? '10px 12px' : '12px 14px',
          borderRadius: 14,
          background: 'rgba(3, 7, 18, 0.84)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          color: '#e2e8f0',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 20px 40px rgba(2, 6, 23, 0.35)',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>
          Live Car State
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: compact ? 10 : 11 }}>
          {metricRow('Target L/R', `${Math.round(intendedLeft)} / ${Math.round(intendedRight)}`)}
          {metricRow('Actual L/R', `${Math.round(state.leftSpeed)} / ${Math.round(state.rightSpeed)}`, '#10b981')}
          {metricRow('Servo', `${Math.round(state.servoAngle)}°`)}
          {metricRow('Line', state.irLine.join(' / '))}
          {metricRow('Obstacle', state.irObstacle.some(Boolean) ? 'Detected' : 'Clear', state.irObstacle.some(Boolean) ? '#f59e0b' : '#10b981')}
          {metricRow('Autonomous', state.autonomousMode ? 'Enabled' : 'Disabled', state.autonomousMode ? '#38bdf8' : '#94a3b8')}
        </div>
      </div>

      <div style={{ pointerEvents: 'auto' }}>
        <UltrasonicRadar
          currentDistance={state.ultrasonicDistance}
          currentAngle={state.servoAngle}
          scanResults={scanResults}
          size={compact ? 180 : 220}
          compact={compact}
        />
      </div>
    </div>
  );
}
