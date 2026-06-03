import { useState } from 'react';
import type { BoardPoint } from '../../../profiles/BoardSequencerConfig';

const ORDER = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

interface Props {
  width: number;
  height: number;
  onComplete: (corners: [BoardPoint, BoardPoint, BoardPoint, BoardPoint]) => void;
}

/** Click the four board corners in TL, TR, BR, BL order; stores normalised coords. */
export default function BoardCalibrationOverlay({ width, height, onComplete }: Props) {
  const [pts, setPts] = useState<BoardPoint[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    const next = [...pts, p];
    setPts(next);
    if (next.length === 4) {
      onComplete([next[0], next[1], next[2], next[3]]);
      setPts([]);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{ position: 'absolute', inset: 0, width, height, cursor: 'crosshair' }}
      role="button"
      tabIndex={0}
      aria-label={`Click the ${ORDER[pts.length] ?? 'four'} board corner`}
    >
      <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', background: '#000a', padding: '4px 8px' }}>
        {pts.length < 4 ? `Click the ${ORDER[pts.length]} corner (${pts.length}/4)` : 'Done'}
      </div>
      {pts.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`,
            width: 12, height: 12, marginLeft: -6, marginTop: -6,
            borderRadius: '50%', background: '#3cf', border: '2px solid #fff',
          }}
        />
      ))}
    </div>
  );
}
