import { useEffect, useRef, useState } from 'react';
import type { ActiveCell, PieceColour } from '../../../../tracking/BoardSequencerMode';
import type { ColourId } from '../../../../tracking/boardColours';
import { swatchRingFor, type BoardPalette } from '../theme/boardTokens';
import { boardSummary, type Pop } from './boardViewModel';
import type { BankSlotState } from '../../../../tracking/boardFrame';

export interface BoardViewFrame {
  /** Every piece the camera can see right now (settled or not). */
  detected: Map<string, PieceColour>;
  /** The pieces that have settled and are playing. */
  settled: Map<string, PieceColour>;
  conditional: Set<string>;
  /** Which cell each loop pad is in, keyed "row,col" — the pads are a lane, not a row. */
  bankCells?: ReadonlyMap<string, BankSlotState>;
  /** Cells the hand guard is holding — drawn hatched, so "on hold" is its own picture. */
  held?: ReadonlySet<string>;
  /** Knocked cells still sounding: a hollow disc with a double outline and a ↺. */
  ghosts?: ReadonlyMap<string, ActiveCell>;
}

export interface BoardViewProps {
  rows: number;
  cols: number;
  frame: BoardViewFrame;
  /** Notes sounding right now, from the engine's fired-note log. */
  pops: Pop[];
  playheadCol: number;
  playing: boolean;
  pingPongDirection: number;
  swatchFor(colour: ColourId): string;
  palette: BoardPalette;
  /**
   * Where the fill adds notes. Drawn as a small dotted ring — never a solid piece — so
   * what the instrument added is always told apart from what the player put down, by
   * shape and not only by colour. A ring fills in while its note sounds.
   */
  fillMarks?: readonly { row: number; col: number; colour: ColourId }[];
  /**
   * The band: it has no counters, so the board's bottom edge pulses with its beat instead.
   * Every sound has something to see, including the ones the player did not place.
   */
  band?: { playing: boolean; beatOn: boolean } | null;
  /** Page label ("Page A · live"), when there is more than one page. */
  pageLabel?: string | null;
  reducedMotion?: boolean;
}

const keyOf = (row: number, col: number): string => `${row},${col}`;

/** Ghosts by square, whatever colour they are and however many share the square. */
function ghostsBySquare(ghosts: ReadonlyMap<string, ActiveCell> | undefined): Map<string, ActiveCell> {
  const out = new Map<string, ActiveCell>();
  if (ghosts) for (const cell of ghosts.values()) out.set(keyOf(cell.row, cell.col), cell);
  return out;
}

/**
 * The board as the player reads it: one canvas, drawn from the detection frame and the
 * engine's fired notes. Piece states differ by ring style as well as fill, and every
 * swatch carries a two-tone contrast ring, so a black counter on a dark theme (or a
 * white one on light) is still visible.
 */
export function BoardView({
  rows, cols, frame, pops, playheadCol, playing, pingPongDirection, swatchFor, palette,
  pageLabel, reducedMotion = false, fillMarks, band,
}: BoardViewProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: 320, h: 240 });

  // Fit a cols:rows rectangle inside the stage so cells stay square at any size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = (): void => {
      const aw = el.clientWidth;
      const ah = el.clientHeight;
      if (aw <= 0 || ah <= 0) return;
      const aspect = cols / rows;
      let w = aw;
      let h = w / aspect;
      if (h > ah) { h = ah; w = h * aspect; }
      setDims({ w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, cols]);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = dims.w;
    const h = dims.h;
    if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr);
    if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cw = w / cols;
    const ch = h / rows;
    const pad = Math.min(cw, ch) * 0.08;
    const popByKey = new Map(pops.filter((p) => p.origin !== 'fill').map((p) => [keyOf(p.row, p.col), p]));
    const fillPopAt = new Set(pops.filter((p) => p.origin === 'fill').map((p) => keyOf(p.row, p.col)));
    const ghostAt = ghostsBySquare(frame.ghosts);

    // Playhead band first, so pieces sit on top of it.
    if (playing) {
      ctx.fillStyle = palette.hi;
      ctx.fillRect(playheadCol * cw, 0, cw, h);
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + pad;
        const y = r * ch + pad;
        const cellW = cw - pad * 2;
        const cellH = ch - pad * 2;
        const radius = Math.min(cellW, cellH) * 0.18;

        roundRect(ctx, x, y, cellW, cellH, radius);
        ctx.fillStyle = palette.raised;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.border;
        ctx.stroke();

        const key = keyOf(r, c);
        const isHeld = frame.held?.has(key) === true;
        // The ghost map is keyed by counter ("row,col,colour"), so a square can only be
        // found by looking for any ghost standing on it.
        const ghost = ghostAt.get(key);
        if (isHeld) {
          // Hatching: distinct from the unsettled dotted ring and the Variation dashes.
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, x, y, cellW, cellH, radius);
          ctx.clip();
          ctx.strokeStyle = palette.fg3;
          ctx.lineWidth = 1;
          for (let d = -cellH; d < cellW; d += 6) {
            ctx.beginPath();
            ctx.moveTo(x + d, y);
            ctx.lineTo(x + d + cellH, y + cellH);
            ctx.stroke();
          }
          ctx.restore();
        }

        const settledColour = frame.settled.get(key);
        const detectedColour = frame.detected.get(key);
        const colour = settledColour ?? detectedColour ?? ghost?.colour;
        if (!colour) continue;

        const swatch = swatchFor(colour);
        const { inner, outer } = swatchRingFor(swatch, palette.raised, palette);
        const pop = popByKey.get(key);
        // A pop grows the piece, unless the player asked for less motion — then it is
        // a static outline for the same length of time.
        const grow = pop && !reducedMotion ? 1 + 0.06 * Math.sin(Math.PI * (1 - pop.progress)) : 1;
        const cx = x + cellW / 2;
        const cy = y + cellH / 2;
        const rr = (Math.min(cellW, cellH) / 2 - 2) * grow;

        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        if (ghost && !settledColour && !detectedColour) {
          // A ghost is hollow: the sound is still there, the counter is not.
          ctx.strokeStyle = swatch;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, rr - 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = palette.fg2;
          ctx.font = `${Math.round(rr)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('↺', cx, cy);
          continue;
        }
        if (settledColour) {
          ctx.fillStyle = swatch;
          ctx.fill();
        } else {
          // Detected but not settled: soft fill and a dotted ring, so "seen" and
          // "playing" are never the same picture.
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = swatch;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        ctx.setLineDash(settledColour ? [] : [3, 3]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = inner;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(cx, cy, rr + 1.75, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = outer;
        ctx.stroke();

        if (frame.conditional.has(key)) {
          // Variation: long dashes, in the warning colour, plus its own ring radius.
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.arc(cx, cy, rr + 4, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = palette.warn;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (pop) {
          ctx.beginPath();
          ctx.arc(cx, cy, rr + 6, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = palette.accent;
          ctx.stroke();
        }
      }
    }

    // The band's pulse: a soft bar along the bottom edge, brighter on the beat.
    if (band?.playing) {
      ctx.fillStyle = palette.accent;
      ctx.globalAlpha = band.beatOn || reducedMotion ? 0.55 : 0.2;
      ctx.fillRect(0, h - 5, w, 5);
      ctx.globalAlpha = 1;
    }

    // Fill marks, on squares with no counter of their own.
    if (fillMarks && fillMarks.length > 0) {
      for (const m of fillMarks) {
        if (m.row < 0 || m.row >= rows || m.col < 0 || m.col >= cols) continue;
        const key = keyOf(m.row, m.col);
        if (frame.settled.has(key) || frame.detected.has(key)) continue;
        const cx = m.col * cw + cw / 2;
        const cy = m.row * ch + ch / 2;
        const r = Math.min(cw, ch) * 0.2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (fillPopAt.has(key)) {
          ctx.fillStyle = swatchFor(m.colour);
          ctx.fill();
        }
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = swatchFor(m.colour);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Loop pads: each one's state carries a glyph, not only a fill, and each is drawn
    // where the lane actually puts it.
    if (frame.bankCells && frame.bankCells.size > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(Math.min(cw, ch) * 0.4)}px system-ui, sans-serif`;
      for (const [key, state] of frame.bankCells) {
        const [row, col] = key.split(',').map(Number);
        if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
        ctx.fillStyle = palette.fg2;
        ctx.fillText(
          state === 'empty' ? '□' : state === 'paused' ? '‖' : '▶',
          col * cw + cw / 2, row * ch + ch / 2,
        );
      }
    }

    // Ping-pong direction, so the sweep's turn is visible, not only audible.
    if (playing && pingPongDirection !== 0) {
      ctx.fillStyle = palette.accent;
      ctx.font = `${Math.round(Math.min(cw, ch) * 0.35)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(pingPongDirection > 0 ? '→' : '←', playheadCol * cw + cw / 2, 2);
    }
  }, [dims, rows, cols, frame, pops, playheadCol, playing, pingPongDirection, swatchFor, palette, reducedMotion, fillMarks, band]);

  const pieces = frame.settled.size;
  const heldCount = frame.held?.size ?? 0;
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 160, display: 'grid', placeItems: 'center' }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={heldCount > 0
          ? `${boardSummary(rows, cols, playheadCol, pieces)}, ${heldCount} on hold`
          : boardSummary(rows, cols, playheadCol, pieces)}
        style={{ width: dims.w, height: dims.h, borderRadius: 'var(--bs-radius-lg)' }}
      />
      {pageLabel && (
        <span style={{
          position: 'absolute', top: 6, left: 6, fontSize: 12, color: 'var(--bs-fg2)',
          background: 'var(--bs-bg)', padding: '2px 6px', borderRadius: 'var(--bs-radius-sm)',
        }}
        >
          {pageLabel}
        </span>
      )}
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** The cells currently settled, as a map, for `BoardViewFrame`. */
export function cellMap(cells: readonly ActiveCell[]): Map<string, PieceColour> {
  return new Map(cells.map((c) => [keyOf(c.row, c.col), c.colour]));
}
