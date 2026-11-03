import { usePops, type PopStore } from '../popStore';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ActiveCell, PieceColour } from '../../../../tracking/BoardSequencerMode';
import type { ColourId } from '../../../../tracking/boardColours';
import { CellGrid } from './CellGrid';
import { contrastRatio, playheadColour, swatchRingFor, type BoardPalette } from '../theme/boardTokens';
import { boardSummary, type PhraseSpan, type Pop } from './boardViewModel';
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
  /** With phrases on: the beats each counter owns, drawn as a band under it. */
  spans?: readonly PhraseSpan[];
  /** Something that just changed and was only heard ("New sounds", "Band joins"): shown for a moment. */
  notice?: string | null;
  /** Page label ("Page A · live"), when there is more than one page. */
  pageLabel?: string | null;
  reducedMotion?: boolean;
  /**
   * Notes of the loops playing now, drawn as outlined counters where no counter of the
   * player's stands, so what is sounding can be seen (deaf and hard-of-hearing players,
   * the audience) — they pulse as they play.
   */
  loopCells?: readonly { row: number; col: number; colour: ColourId }[];
  /**
   * Squares whose counter can never sound: past its part's loop length (see
   * songs/beyondLoop). Drawn faded, so a silent counter doesn't look like a playing one.
   */
  silent?: ReadonlySet<string>;
  /**
   * Colours waiting for their time in the piece: their counters are drawn faded with a small
   * clock on them, so a counter that is down but not yet heard never looks like one playing.
   */
  waiting?: ReadonlySet<ColourId>;
  /** The laptop board: squares are buttons, and a click places or lifts a counter. */
  onCellTap?(row: number, col: number): void;
  /** What a square is called for a screen reader on the laptop board ("Red, melody"). */
  describeCell?(row: number, col: number): string;
}

const keyOf = (row: number, col: number): string => `${row},${col}`;

/** Ghosts by square, whatever colour they are and however many share the square. */
function ghostsBySquare(ghosts: ReadonlyMap<string, ActiveCell> | undefined): Map<string, ActiveCell> {
  const out = new Map<string, ActiveCell>();
  if (ghosts) for (const cell of ghosts.values()) out.set(keyOf(cell.row, cell.col), cell);
  return out;
}

/**
 * The board as the player reads it (L3): one canvas, drawn from the detection frame and
 * the engine's fired notes. Empty squares are small dots; counters are flat discs, ringed
 * only when they would vanish against the ground; the column playing now is tinted and
 * marked along its top edge; a sounding counter wears a thin ring in the text colour.
 */
/** Height of the line kept above the board for a notice. */
const NOTICE_H = 32;
/** The row of step numbers above the board. */
const STEP_H = 22;

const CLEAR_CELL = (): CSSProperties => ({ background: 'transparent', border: 'none', borderRadius: 6 });

export function BoardView({
  rows, cols, frame, pops, playheadCol, playing, pingPongDirection, swatchFor, palette,
  pageLabel, reducedMotion = false, fillMarks, band, spans, notice, onCellTap, describeCell, loopCells, silent, waiting,
}: BoardViewProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: 320, h: 240 });

  // A line kept above the board for a notice ("Scene: Build", "Band joins"): drawn on the
  // board it covered the top row. Kept even when empty, so a notice moves nothing.
  const noticeH = notice === undefined ? 0 : NOTICE_H;

  // Fit a cols:rows rectangle inside the stage so cells stay square at any size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = (): void => {
      const aw = el.clientWidth;
      const ah = el.clientHeight - noticeH - STEP_H;
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
  }, [rows, cols, noticeH]);

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
    const unit = Math.min(cw, ch);
    const popByKey = new Map(pops.filter((p) => p.origin !== 'fill').map((p) => [keyOf(p.row, p.col), p]));
    const fillPopAt = new Set(pops.filter((p) => p.origin === 'fill').map((p) => keyOf(p.row, p.col)));
    const ghostAt = ghostsBySquare(frame.ghosts);

    // The column playing now: one step up from the ground, the whole height. Its marker
    // comes last, over everything.
    if (playing) {
      ctx.fillStyle = palette.raised;
      ctx.fillRect(playheadCol * cw, 0, cw, h);
    }

    // Every square, as a dot at its centre: an edge at least 3:1 against the ground (A4),
    // small enough to read as a place and not a thing.
    const dotR = Math.max(2, unit * 0.055);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.beginPath();
        ctx.arc(c * cw + cw / 2, r * ch + ch / 2, dotR, 0, Math.PI * 2);
        ctx.fillStyle = palette.borderControl;
        ctx.fill();
      }
    }

    // Phrase spans: a thin band along the counter's row from its column to the next
    // counter of its colour, wrapping at the right edge. Under the pieces.
    if (spans && spans.length > 0) {
      const bandH = Math.max(2, ch * 0.07);
      const inset = unit * 0.12;
      for (const s of spans) {
        if (s.row < 0 || s.row >= rows) continue;
        const y = s.row * ch + ch - inset - bandH;
        ctx.fillStyle = swatchFor(s.colour);
        ctx.globalAlpha = 0.45;
        const first = Math.min(s.len, cols - s.col);
        ctx.fillRect(s.col * cw + inset, y, first * cw - inset * 2, bandH);
        if (s.len > first) ctx.fillRect(inset, y, (s.len - first) * cw - inset * 2, bandH);
        ctx.globalAlpha = 1;
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.globalAlpha = 1;
        const cx = c * cw + cw / 2;
        const cy = r * ch + ch / 2;
        const base = unit * 0.31;

        const key = keyOf(r, c);
        const isHeld = frame.held?.has(key) === true;
        // The ghost map is keyed by counter ("row,col,colour"), so a square can only be
        // found by looking for any ghost standing on it.
        const ghost = ghostAt.get(key);
        if (isHeld) {
          // Hatching over the square: distinct from the unsettled dotted ring and the
          // Variation dashes.
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, unit * 0.42, 0, Math.PI * 2);
          ctx.clip();
          ctx.strokeStyle = palette.fg3;
          ctx.lineWidth = 1;
          const x0 = cx - unit / 2;
          const y0 = cy - unit / 2;
          for (let d = -unit; d < unit; d += 6) {
            ctx.beginPath();
            ctx.moveTo(x0 + d, y0);
            ctx.lineTo(x0 + d + unit, y0 + unit);
            ctx.stroke();
          }
          ctx.restore();
        }

        const settledColour = frame.settled.get(key);
        const detectedColour = frame.detected.get(key);
        const colour = settledColour ?? detectedColour ?? ghost?.colour;
        if (!colour) continue;
        // Past its part's loop: it never plays, so it must not look like a counter that does.
        // Nor a colour waiting for its time in the piece.
        const isWaiting = waiting?.has(colour) === true;
        if (silent?.has(key) || isWaiting) ctx.globalAlpha = 0.3;

        const swatch = swatchFor(colour);
        const { inner } = swatchRingFor(swatch, palette.bg, palette);
        const pop = popByKey.get(key);
        // A pop grows the piece, unless the player asked for less motion — then it is
        // a static outline for the same length of time.
        const grow = pop && !reducedMotion ? 1 + 0.06 * Math.sin(Math.PI * (1 - pop.progress)) : 1;
        const rr = base * grow;

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
          ctx.font = `${Math.round(rr)}px Inter, system-ui, sans-serif`;
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
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = swatch;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // A flat disc, ringed only when it would vanish against the ground (black on dark,
        // white on light): the ring is the colour that tells them apart.
        if (contrastRatio(swatch, palette.bg) < 3) {
          ctx.beginPath();
          ctx.arc(cx, cy, rr + 1, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = inner;
          ctx.stroke();
        }

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

        if (isWaiting) {
          // A small clock: this one waits for its time.
          ctx.globalAlpha = 1;
          const cr = Math.max(4, rr * 0.45);
          ctx.beginPath();
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
          ctx.fillStyle = palette.bg;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = palette.fg;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx, cy - cr * 0.7);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + cr * 0.55, cy);
          ctx.stroke();
        }

        if (pop) {
          // Sounding now: a thin ring in the text colour, a gap of ground between it and the counter.
          ctx.beginPath();
          ctx.arc(cx, cy, rr + Math.max(5, unit * 0.09), 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = palette.fg;
          ctx.stroke();
        }
      }
    }

    // Loop notes: an outlined counter with a small centre, where the player has none.
    if (loopCells && loopCells.length > 0) {
      for (const l of loopCells) {
        if (l.row < 0 || l.row >= rows || l.col < 0 || l.col >= cols) continue;
        const key = keyOf(l.row, l.col);
        if (frame.settled.has(key) || frame.detected.has(key)) continue;
        const cx = l.col * cw + cw / 2;
        const cy = l.row * ch + ch / 2;
        const sounding = popByKey.has(key);
        const r = unit * 0.29;
        ctx.globalAlpha = sounding ? 1 : 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.lineWidth = sounding && !reducedMotion ? 3 : 2;
        ctx.strokeStyle = swatchFor(l.colour);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2, r * (sounding ? 0.45 : 0.22)), 0, Math.PI * 2);
        ctx.fillStyle = swatchFor(l.colour);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // The band's strip: a line along the bottom edge, brighter on the beat. The legend
    // under the board names it, so nothing here covers a counter.
    if (band?.playing) {
      const barH = 4;
      ctx.fillStyle = palette.fg;
      ctx.globalAlpha = band.beatOn || reducedMotion ? 0.7 : 0.25;
      ctx.fillRect(0, h - barH, w, barH);
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
        // Big enough to read from the player's chair: a dotted ring with a faint centre,
        // filling in while its note sounds.
        const r = unit * 0.27;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = swatchFor(m.colour);
        ctx.globalAlpha = fillPopAt.has(key) ? 0.85 : 0.15;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.setLineDash([3, 4]);
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
      ctx.font = `${Math.round(unit * 0.4)}px Inter, system-ui, sans-serif`;
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

    // The playhead's marker, last: a line along the top of its column, at least 3:1 against
    // the column's tint in both modes (B9), so the step playing now can be followed from the
    // player's chair.
    if (playing) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = playheadColour(palette);
      ctx.fillRect(playheadCol * cw, 0, cw, 3);
    }

    // Ping-pong direction, so the sweep's turn is visible, not only audible.
    if (playing && pingPongDirection !== 0) {
      ctx.fillStyle = palette.fg;
      ctx.font = `${Math.round(unit * 0.35)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(pingPongDirection > 0 ? '→' : '←', playheadCol * cw + cw / 2, 6);
    }
  }, [dims, rows, cols, frame, pops, playheadCol, playing, pingPongDirection, swatchFor, palette, reducedMotion, fillMarks, band, spans, notice, loopCells, silent, waiting]);

  // The squares to click: rebuilt only when what they say changes. The board redraws for
  // every frame of a sounding note, and rebuilding 64+ buttons with it cost more than the
  // drawing.
  const labelsKey = onCellTap
    ? Array.from({ length: rows * cols }, (_, i) => {
      const row = Math.floor(i / cols); const col = i % cols;
      const what = describeCell?.(row, col) ?? '';
      return `Row ${rows - row} from the bottom, step ${col + 1}${what ? `: ${what}` : ''}`;
    }).join('\n')
    : '';
  const cellLabel = useCallback((row: number, col: number) => labelsKey.split('\n')[row * cols + col] ?? '', [labelsKey, cols]);
  const gridStyle = useMemo<CSSProperties>(() => ({
    position: 'absolute', left: '50%', top: `calc(50% + ${(noticeH + STEP_H) / 2}px)`, transform: 'translate(-50%, -50%)', width: dims.w, height: dims.h,
  }), [dims.w, dims.h, noticeH]);

  const pieces = frame.settled.size;
  const loopNotes = loopCells?.length ?? 0;
  const heldCount = frame.held?.size ?? 0;
  return (
    <div
      ref={wrapRef}
      // The board sits on the page (L3): no well, no edge.
      data-board-stage=""
      style={{
        position: 'relative', width: '100%', height: '100%', minHeight: 160, display: 'grid', placeItems: 'center',
        paddingTop: noticeH, boxSizing: 'border-box', background: 'transparent',
      }}
    >
      {/* A change that was only heard, said above the board for a moment. */}
      {noticeH > 0 && (
        <div
          role="status"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: noticeH, display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}
        >
          {notice && (
            <span style={{ padding: '3px 14px', borderRadius: 'var(--bs-radius-pill)', background: 'var(--bs-fg)', color: 'var(--bs-bg)', fontWeight: 600, fontSize: 16 }}>
              {notice}
            </span>
          )}
        </div>
      )}
      <div style={{ width: dims.w, display: 'flex', flexDirection: 'column' }}>
        {/* The step numbers (L3): the one playing now in the text colour. The canvas's name
            already says the step, so these are not read out. */}
        <div aria-hidden="true" data-board-steps="" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, height: STEP_H, alignItems: 'center' }}>
          {Array.from({ length: cols }, (_, c) => (
            <span
              key={c}
              style={{
                textAlign: 'center', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em',
                color: playing && c === playheadCol ? 'var(--bs-fg)' : 'var(--bs-fg3)',
              }}
            >
              {c + 1}
            </span>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={heldCount > 0
            ? `${boardSummary(rows, cols, playheadCol, pieces)}, ${heldCount} on hold`
            : `${boardSummary(rows, cols, playheadCol, pieces)}${loopNotes > 0 ? `, ${loopNotes} loop ${loopNotes === 1 ? 'note' : 'notes'}` : ''}`}
          style={{ width: dims.w, height: dims.h, display: 'block' }}
        />
      </div>
      {onCellTap && (
        <CellGrid
          rows={rows}
          cols={cols}
          label={`Laptop board, ${rows} rows by ${cols} steps. Arrow keys move; Enter places or lifts.`}
          cellLabel={cellLabel}
          onActivate={onCellTap}
          cellStyle={CLEAR_CELL}
          style={gridStyle}
        />
      )}
      {pageLabel && (
        <span style={{
          position: 'absolute', top: 6, left: 6, fontSize: 14, color: 'var(--bs-fg2)',
          background: 'var(--bs-bg)', padding: '2px 6px', borderRadius: 'var(--bs-radius-sm)',
        }}
        >
          {pageLabel}
        </span>
      )}
    </div>
  );
}

/** The cells currently settled, as a map, for `BoardViewFrame`. */
export function cellMap(cells: readonly ActiveCell[]): Map<string, PieceColour> {
  return new Map(cells.map((c) => [keyOf(c.row, c.col), c.colour]));
}

/** The board, redrawn for every frame of the sounding notes without re-rendering its parent. */
export function LiveBoardView({ popStore, ...props }: Omit<BoardViewProps, 'pops'> & { popStore: PopStore }): JSX.Element {
  return <BoardView {...props} pops={usePops(popStore)} />;
}
