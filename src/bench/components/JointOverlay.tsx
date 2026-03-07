interface JointConfig {
  name: string;
  label: string;
  min: number;
  max: number;
}

interface JointOverlayProps {
  joints: JointConfig[];
  positions: number[];
  side?: 'left' | 'right';
  label?: string;
  color?: string;
}

export function JointOverlay({
  joints,
  positions,
  side = 'left',
  label = 'Joints',
  color = '#10b981',
}: JointOverlayProps) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      [side]: 12,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      borderRadius: 8,
      padding: '8px 12px',
      fontFamily: 'monospace',
      fontSize: 11,
      color: '#fff',
      minWidth: 120,
      border: `1px solid ${color}33`,
    }}>
      <div style={{
        fontSize: 9,
        fontWeight: 600,
        color: color,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontFamily: 'system-ui, sans-serif',
      }}>
        {label}
      </div>
      {joints.map((joint, i) => {
        const value = positions[i] ?? 0;
        const deg = Math.round((value / Math.PI) * 180);
        const pct = ((value - joint.min) / (joint.max - joint.min)) * 100;

        return (
          <div key={joint.name} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}>
            <span style={{ color: '#888', width: 50, fontSize: 10 }}>{joint.label}</span>
            <div style={{
              flex: 1,
              height: 3,
              background: '#333',
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.max(0, Math.min(100, pct))}%`,
                height: '100%',
                background: color,
                transition: 'width 0.05s ease-out',
              }} />
            </div>
            <span style={{
              color: color,
              width: 36,
              textAlign: 'right',
              fontSize: 10,
            }}>
              {deg}°
            </span>
          </div>
        );
      })}
    </div>
  );
}
