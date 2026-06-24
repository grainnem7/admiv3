import { useEffect, useRef, useState } from 'react';
import type { ActiveCell } from '../../../tracking/BoardSequencerMode';

interface Props {
  rows: number;
  cols: number;
  active: ActiveCell[];
  playheadCol: number;
  /** Maps a cell's colour id → its display swatch (so cells show their real colour). */
  colourFor?: (colour: string) => string;
}

/**
 * Top-down warped grid: active cells highlighted, current beat column marked.
 * Fills its parent, fitting a cols:rows rectangle inside the available space so
 * cells stay square.
 */
export default function WarpedBoardView({ rows, cols, active, playheadCol, colourFor }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: 240, h: 240 });

  // Fit a cols:rows rectangle inside the wrapper (square cells), responsive.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const aw = el.clientWidth;
      const ah = el.clientHeight;
      if (aw <= 0 || ah <= 0) return;
      const aspect = cols / rows;
      let w = aw;
      let h = w / aspect;
      if (h > ah) {
        h = ah;
        w = h * aspect;
      }
      setDims({ w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, cols]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const activeColour = new Map(active.map((c) => [`${c.row},${c.col}`, c.colour]));
    const w = cv.width;
    const h = cv.height;
    ctx.clearRect(0, 0, w, h);
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const colour = activeColour.get(`${r},${c}`);
        ctx.fillStyle = colour
          ? (colourFor?.(colour) ?? '#e23')
          : '#1b1b22';
        ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
      }
    }
    ctx.strokeStyle = '#3cf';
    ctx.lineWidth = 3;
    ctx.strokeRect(playheadCol * cw + 1, 1, cw - 2, h - 2);
  }, [rows, cols, playheadCol, active, dims]);

  return (
    <div
      ref={wrapRef}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <canvas ref={canvasRef} width={dims.w} height={dims.h} aria-label="Board state" style={{ borderRadius: 6 }} />
    </div>
  );
}
