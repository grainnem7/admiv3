import { useEffect, useRef } from 'react';
import type { CellRef } from '../../../tracking/BoardSequencerMode';

interface Props {
  rows: number;
  cols: number;
  active: CellRef[];
  playheadCol: number;
  size?: number;
}

/** Top-down warped grid: active cells highlighted, current beat column marked. */
export default function WarpedBoardView({ rows, cols, active, playheadCol, size = 240 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const activeSet = new Set(active.map((c) => `${c.row},${c.col}`));
    const w = cv.width;
    const h = cv.height;
    ctx.clearRect(0, 0, w, h);
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = activeSet.has(`${r},${c}`) ? '#e23' : '#1b1b22';
        ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
      }
    }
    ctx.strokeStyle = '#3cf';
    ctx.lineWidth = 3;
    ctx.strokeRect(playheadCol * cw + 1, 1, cw - 2, h - 2);
  }, [rows, cols, playheadCol, active]);

  return <canvas ref={ref} width={size} height={size} aria-label="Board state" />;
}
