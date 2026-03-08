import { useMemo, type CSSProperties } from 'react';

interface CarDrivePadProps {
  enabled: boolean;
  speedPercent: number;
  servoAngle: number;
  autonomousEnabled: boolean;
  onSpeedChange: (value: number) => void;
  onDrive: (forwardPercent: number, turnPercent: number) => void;
  onStop: () => void;
  onServoChange: (angle: number) => void;
  onScan: () => void;
  onCenterServo: () => void;
  onToggleAutonomous: () => void;
}

interface DriveButtonConfig {
  label: string;
  forward: number;
  turn: number;
}

const BUTTONS: DriveButtonConfig[] = [
  { label: 'Forward', forward: 1, turn: 0 },
  { label: 'Left', forward: 0, turn: 1 },
  { label: 'Stop', forward: 0, turn: 0 },
  { label: 'Right', forward: 0, turn: -1 },
  { label: 'Reverse', forward: -1, turn: 0 },
];

export function CarDrivePad({
  enabled,
  speedPercent,
  servoAngle,
  autonomousEnabled,
  onSpeedChange,
  onDrive,
  onStop,
  onServoChange,
  onScan,
  onCenterServo,
  onToggleAutonomous,
}: CarDrivePadProps) {
  const driveButtons = useMemo(() => BUTTONS, []);

  const buttonBase: CSSProperties = {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'rgba(15, 23, 42, 0.9)',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    transition: 'transform 120ms ease, background 120ms ease, border-color 120ms ease',
    opacity: enabled ? 1 : 0.5,
    userSelect: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ color: '#666', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>
          Drive Control
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div />
          {driveButtons.slice(0, 1).map((button) => (
            <button
              key={button.label}
              disabled={!enabled}
              style={buttonBase}
              onMouseDown={() => onDrive(button.forward, button.turn)}
              onMouseUp={onStop}
              onMouseLeave={onStop}
              onTouchStart={(event) => {
                event.preventDefault();
                onDrive(button.forward, button.turn);
              }}
              onTouchEnd={onStop}
            >
              {button.label}
            </button>
          ))}
          <div />

          {driveButtons.slice(1, 4).map((button) => (
            <button
              key={button.label}
              disabled={!enabled}
              style={{
                ...buttonBase,
                background: button.label === 'Stop' ? 'rgba(127, 29, 29, 0.85)' : buttonBase.background,
                borderColor: button.label === 'Stop' ? 'rgba(248, 113, 113, 0.35)' : 'rgba(148, 163, 184, 0.18)',
              }}
              onMouseDown={() => {
                if (button.label === 'Stop') {
                  onStop();
                  return;
                }
                onDrive(button.forward, button.turn);
              }}
              onMouseUp={onStop}
              onMouseLeave={onStop}
              onTouchStart={(event) => {
                event.preventDefault();
                if (button.label === 'Stop') {
                  onStop();
                  return;
                }
                onDrive(button.forward, button.turn);
              }}
              onTouchEnd={onStop}
            >
              {button.label}
            </button>
          ))}

          <div />
          {driveButtons.slice(4).map((button) => (
            <button
              key={button.label}
              disabled={!enabled}
              style={buttonBase}
              onMouseDown={() => onDrive(button.forward, button.turn)}
              onMouseUp={onStop}
              onMouseLeave={onStop}
              onTouchStart={(event) => {
                event.preventDefault();
                onDrive(button.forward, button.turn);
              }}
              onTouchEnd={onStop}
            >
              {button.label}
            </button>
          ))}
          <div />
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
          <span>Drive speed</span>
          <span>{Math.round(speedPercent * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.15}
          max={1}
          step={0.05}
          value={speedPercent}
          onChange={(event) => onSpeedChange(parseFloat(event.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
          <span>Ultrasonic servo</span>
          <span>{Math.round(servoAngle)}°</span>
        </div>
        <input
          type="range"
          min={0}
          max={180}
          step={1}
          value={servoAngle}
          onChange={(event) => onServoChange(parseInt(event.target.value, 10))}
          disabled={!enabled}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <button
          style={{ ...buttonBase, padding: '9px 10px' }}
          disabled={!enabled}
          onClick={onCenterServo}
        >
          Center
        </button>
        <button
          style={{ ...buttonBase, padding: '9px 10px' }}
          disabled={!enabled}
          onClick={onScan}
        >
          Scan
        </button>
        <button
          style={{
            ...buttonBase,
            padding: '9px 10px',
            background: autonomousEnabled ? 'rgba(22, 101, 52, 0.85)' : buttonBase.background,
            borderColor: autonomousEnabled ? 'rgba(74, 222, 128, 0.3)' : 'rgba(148, 163, 184, 0.18)',
          }}
          disabled={!enabled}
          onClick={onToggleAutonomous}
        >
          {autonomousEnabled ? 'Auto On' : 'Auto Off'}
        </button>
      </div>
    </div>
  );
}
