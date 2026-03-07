import { useState, useCallback, useRef, useEffect } from 'react';

interface ResizableSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  initialRatio?: number; // 0-1, left panel ratio
  minRatio?: number;
  maxRatio?: number;
  onRatioChange?: (ratio: number) => void;
}

export function ResizableSplit({
  left,
  right,
  initialRatio = 0.5,
  minRatio = 0.2,
  maxRatio = 0.8,
  onRatioChange,
}: ResizableSplitProps) {
  const [ratio, setRatio] = useState(initialRatio);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let newRatio = x / rect.width;

    // Clamp to min/max
    newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));

    setRatio(newRatio);
    onRatioChange?.(newRatio);
  }, [isDragging, minRatio, maxRatio, onRatioChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      {/* Left panel */}
      <div style={{
        width: `${ratio * 100}%`,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {left}
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: 6,
          height: '100%',
          background: isDragging ? '#8b5cf6' : '#333',
          cursor: 'col-resize',
          position: 'relative',
          flexShrink: 0,
          transition: isDragging ? 'none' : 'background 0.15s',
        }}
      >
        {/* Grip dots */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              style={{
                width: 2,
                height: 2,
                borderRadius: '50%',
                background: isDragging ? '#fff' : '#666',
              }}
            />
          ))}
        </div>

        {/* Hover highlight */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: -4,
          right: -4,
          bottom: 0,
          background: 'transparent',
        }} />
      </div>

      {/* Right panel */}
      <div style={{
        flex: 1,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {right}
      </div>
    </div>
  );
}
