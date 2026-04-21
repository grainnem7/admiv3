/**
 * CalibrationTargetOverlay - Visual targets for range detection.
 *
 * Shows 4 target circles at edges of the frame (up/down/left/right).
 * Targets fill with color as the tracked point approaches them.
 * Also builds a heat map of movement coverage.
 */

import { IconCheck } from '../../design-system/Icons';

interface TargetProps {
  position: 'top' | 'bottom' | 'left' | 'right';
  progress: number; // 0-1, how close the hand has come
  reached: boolean;
}

interface CalibrationTargetOverlayProps {
  targets: Record<string, { progress: number; reached: boolean }>;
  heatPoints: { x: number; y: number }[];
}

function Target({ position, progress, reached }: TargetProps) {
  const positions: Record<string, React.CSSProperties> = {
    top: { top: '10%', left: '50%', transform: 'translate(-50%, -50%)' },
    bottom: { bottom: '10%', left: '50%', transform: 'translate(-50%, 50%)' },
    left: { top: '50%', left: '10%', transform: 'translate(-50%, -50%)' },
    right: { top: '50%', right: '10%', transform: 'translate(50%, -50%)' },
  };

  const labels: Record<string, string> = {
    top: 'Up',
    bottom: 'Down',
    left: 'Left',
    right: 'Right',
  };

  return (
    <div
      style={{
        position: 'absolute',
        ...positions[position],
        width: 60,
        height: 60,
        borderRadius: '50%',
        border: `3px solid ${reached ? 'var(--color-success)' : 'var(--color-primary)'}`,
        backgroundColor: reached
          ? 'rgba(34, 197, 94, 0.3)'
          : `rgba(249, 115, 22, ${progress * 0.4})`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color var(--duration-fast)',
        pointerEvents: 'none',
      }}
      aria-label={`${labels[position]} target: ${reached ? 'reached' : `${Math.round(progress * 100)}%`}`}
    >
      <span style={{
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-semibold)',
        color: reached ? 'var(--color-success)' : 'var(--color-text)',
      }}>
        {reached ? <IconCheck size={14} /> : labels[position]}
      </span>
    </div>
  );
}

export default function CalibrationTargetOverlay({
  targets,
  heatPoints,
}: CalibrationTargetOverlayProps) {
  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}
      aria-hidden="true"
    >
      <Target position="top" progress={targets.top?.progress ?? 0} reached={targets.top?.reached ?? false} />
      <Target position="bottom" progress={targets.bottom?.progress ?? 0} reached={targets.bottom?.reached ?? false} />
      <Target position="left" progress={targets.left?.progress ?? 0} reached={targets.left?.reached ?? false} />
      <Target position="right" progress={targets.right?.progress ?? 0} reached={targets.right?.reached ?? false} />

      {/* Heat map dots */}
      {heatPoints.map((point, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${(1 - point.x) * 100}%`, // Mirror for video
            top: `${point.y * 100}%`,
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: 'rgba(249, 115, 22, 0.15)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
}
