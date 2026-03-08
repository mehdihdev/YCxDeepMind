interface ScanPoint {
  angle: number;
  distance: number;
}

interface UltrasonicRadarProps {
  currentDistance: number;
  currentAngle: number;
  scanResults?: ScanPoint[];
  maxDistance?: number;
  size?: number;
  compact?: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const theta = ((180 - angle) * Math.PI) / 180;
  return {
    x: cx + Math.cos(theta) * radius,
    y: cy - Math.sin(theta) * radius,
  };
}

export function UltrasonicRadar({
  currentDistance,
  currentAngle,
  scanResults = [],
  maxDistance = 150,
  size = 220,
  compact = false,
}: UltrasonicRadarProps) {
  const padding = compact ? 18 : 24;
  const radius = size / 2 - padding;
  const cx = size / 2;
  const cy = size - padding;
  const normalizedDistance = clamp(currentDistance, 0, maxDistance);
  const activePoint = polarPoint(
    cx,
    cy,
    (normalizedDistance / maxDistance) * radius,
    clamp(currentAngle, 0, 180),
  );

  const scanPolyline = scanResults
    .map((point) => {
      const pt = polarPoint(
        cx,
        cy,
        (clamp(point.distance, 0, maxDistance) / maxDistance) * radius,
        clamp(point.angle, 0, 180),
      );
      return `${pt.x},${pt.y}`;
    })
    .join(" ");

  const distanceColor =
    normalizedDistance < 30 ? "#ef4444" : normalizedDistance < 60 ? "#f59e0b" : "#10b981";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 6 : 10,
        padding: compact ? 10 : 14,
        borderRadius: 14,
        background: "rgba(3, 7, 18, 0.84)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        color: "#e2e8f0",
        backdropFilter: "blur(10px)",
        boxShadow: "0 20px 40px rgba(2, 6, 23, 0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: compact ? 10 : 11, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: "#94a3b8" }}>
            Ultrasonic Radar
          </div>
          <div style={{ fontSize: compact ? 18 : 24, fontWeight: 700, color: distanceColor }}>
            {normalizedDistance.toFixed(1)} cm
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: compact ? 10 : 11, color: "#94a3b8" }}>
          <div>Servo</div>
          <div style={{ fontSize: compact ? 14 : 16, fontWeight: 600, color: "#e2e8f0" }}>
            {Math.round(currentAngle)}°
          </div>
        </div>
      </div>

      <svg width={size} height={size * 0.58} viewBox={`0 0 ${size} ${size * 0.58}`}>
        <defs>
          <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.1)" />
            <stop offset="100%" stopColor="rgba(16, 185, 129, 0.24)" />
          </linearGradient>
        </defs>

        {[0.33, 0.66, 1].map((ratio) => (
          <path
            key={ratio}
            d={`M ${cx - radius * ratio} ${cy} A ${radius * ratio} ${radius * ratio} 0 0 1 ${cx + radius * ratio} ${cy}`}
            fill="none"
            stroke="rgba(148, 163, 184, 0.18)"
            strokeWidth="1"
          />
        ))}

        {[0, 45, 90, 135, 180].map((angle) => {
          const pt = polarPoint(cx, cy, radius, angle);
          return (
            <g key={angle}>
              <line x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
              <text
                x={pt.x}
                y={pt.y - 6}
                textAnchor="middle"
                fontSize={compact ? 8 : 9}
                fill="rgba(148, 163, 184, 0.7)"
              >
                {angle}
              </text>
            </g>
          );
        })}

        {scanPolyline ? (
          <polyline
            points={scanPolyline}
            fill="rgba(34, 197, 94, 0.12)"
            stroke="rgba(34, 197, 94, 0.8)"
            strokeWidth="2"
          />
        ) : null}

        <line
          x1={cx}
          y1={cy}
          x2={activePoint.x}
          y2={activePoint.y}
          stroke={distanceColor}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={activePoint.x} cy={activePoint.y} r={compact ? 4 : 5} fill={distanceColor} />
        <circle cx={cx} cy={cy} r="4" fill="#38bdf8" />
      </svg>
    </div>
  );
}
