/**
 * Slide-and-settle: the pure heart of the board sequencer. No audio, no DOM.
 * Sibling of SurfacePressMode.
 *
 * Each cell is judged INDEPENDENTLY (no cross-cell or board-global signals):
 *  - It ACTIVATES only when a red piece sits on it with velocity below
 *    `velocityFloor` continuously for `settleWindowMs`.
 *  - A settled cell DEACTIVATES when either (a) its piece is seen moving
 *    (velocity >= floor) for a sustained `motionConfirmMs` — hysteresis, so a
 *    single jitter frame is ignored — or (b) the cell loses occupancy for
 *    longer than `occupancyGraceMs` (a brief occlusion is tolerated).
 *
 * Velocity is in unit-square units per millisecond. On first sighting or on
 * recovery from a brief occlusion the velocity is unmeasurable, so the piece
 * is treated as still (an occluded settled cell survives recovery; an idle
 * cell still needs the full settle window before it can activate).
 *
 * This deliberately does NOT use the baton `found === false` mute semantic:
 * occupancy comes from the recognizer's filled fraction, and neither a single
 * dropped frame nor a single jitter frame changes a settled cell.
 */

import type { ColourId } from './boardColours';
import { conditionalFromOffset } from '../songs/boardSequencerScale';
import { alphaForDt } from '../utils/timeConstant';
import { CENTRED, medianPosition, timingBeatsFor, velocityFor, type BoxPosition } from './boxDetail';

export interface Point {
  x: number;
  y: number;
}

export type PieceColour = ColourId;

export interface CellReading {
  row: number;
  col: number;
  occupied: boolean;
  colour: PieceColour | null;
  centroid: Point | null;
  /** Centroid of EVERY colour matched in the cell, for spill checks and control reads. */
  centroids?: Partial<Record<ColourId, Point>>;
  /** Every colour above the threshold, priority-first — two counters can share a box. */
  colours?: ColourId[];
  /** Per-colour shove from the square centre, so each counter has its own Variation. */
  offsets?: Partial<Record<ColourId, number>>;
  /** Per-colour position within the box, for loudness and timing. */
  boxPositions?: Partial<Record<ColourId, BoxPosition>>;
  /** Fraction of the sampled region matching each colour this frame (0..1). Diagnostic. */
  fractions?: Partial<Record<ColourId, number>>;
  /**
   * Normalised offset of the piece from its cell centre (0 = centre, 1 = edge),
   * or null when the cell is empty. Drives the "play every other pass" variation.
   */
  offset?: number | null;
}

export interface CellRef {
  row: number;
  col: number;
}

/** A settled cell plus the colour of the piece occupying it. */
export interface ActiveCell extends CellRef {
  colour: PieceColour;
  /** True only when shoved off-centre → plays every other pass. Absent = every pass. */
  conditional?: boolean;
  /** Box detail: this counter's own velocity, when where-it-sits is switched on. */
  velocity?: number;
  /** Box detail: how late (+) or early (−) it plays, as a fraction of a step. */
  timingBeats?: number;
}

export interface BoardStepResult {
  activeCells: ActiveCell[];
  justSettled: CellRef[];
  justDeactivated: CellRef[];
}

export interface BoardSettleConfig {
  settleWindowMs: number;
  /** Unit-square units per millisecond below which a piece counts as "still". */
  velocityFloor: number;
  /** Velocity low-pass factor 0..1 (1 = instantaneous). */
  velocitySmoothing: number;
  /** A settled cell tolerates this much occupancy loss before deactivating. */
  occupancyGraceMs: number;
  /** Sustained motion required before a settled cell deactivates (jitter tolerance). */
  motionConfirmMs: number;
  /** Variation: when true, a piece shoved past the offset threshold plays every other pass. */
  variationEnabled?: boolean;
  /** Normalised centroid offset (0=centre, 1=edge) at/above which a piece is conditional. */
  variationOffsetThreshold?: number;
}

interface CellState {
  lastCentroid: Point | null;
  velocity: number;
  stillMs: number;
  movingMs: number;
  lostMs: number;
  phase: 'idle' | 'settled';
  /** Colour of the piece occupying the cell. Held steady while settled. */
  colour: PieceColour | null;
  /** A different colour seen over a settled cell, and how long it has persisted. */
  pendingColour: PieceColour | null;
  pendingColourMs: number;
  /** Offsets seen during the current settle window; their median latches `conditional`. */
  offsets: number[];
  /** Box positions over the same window; their median latches loudness and timing. */
  positions: BoxPosition[];
  settledPosition: BoxPosition;
  /** The median offset this piece was placed at, kept so recalibration can re-latch. */
  settledOffset: number | null;
  /** Latched at settle: this piece was placed off-centre, so it plays every other pass. */
  conditional: boolean;
  /** The next settle continues an existing piece (colour take-over), so it must not tick. */
  resettle: boolean;
}

/** Enough samples for a stable median over a settle window, without growing forever. */
const MAX_OFFSET_SAMPLES = 128;

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const keyOf = (row: number, col: number): string => `${row},${col}`;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class BoardSequencerMode {
  private readonly states = new Map<string, CellState>();

  private variationEnabled: boolean;
  private variationOffsetThreshold: number;
  private settleWindowMs: number;
  private twoCounters = false;
  private boxDetail: { enabled: boolean; loudness: number; timing: number; baseVelocity: number } = {
    enabled: false, loudness: 0.5, timing: 0.35, baseVelocity: 0.7,
  };

  constructor(private readonly cfg: BoardSettleConfig) {
    this.variationEnabled = cfg.variationEnabled ?? false;
    this.variationOffsetThreshold = cfg.variationOffsetThreshold ?? 0.6;
    this.settleWindowMs = cfg.settleWindowMs;
  }

  /** Live-update the variation calibration (safe to call while running). */
  setVariation(enabled: boolean, offsetThreshold: number): void {
    if (enabled === this.variationEnabled && offsetThreshold === this.variationOffsetThreshold) return;
    this.variationEnabled = enabled;
    this.variationOffsetThreshold = offsetThreshold;
    // Conditional is latched at settle, so re-latch the settled cells from the offset
    // each piece was placed at — otherwise the calibration wouldn't take effect until
    // every counter had been picked up and put down again.
    for (const st of this.states.values()) {
      if (st.phase === 'settled') {
        st.conditional = conditionalFromOffset(st.settledOffset, enabled, offsetThreshold);
      }
    }
  }

  /** Two counters in one box: each colour gets its own settle clock and its own note. */
  setTwoCounters(on: boolean): void {
    if (on === this.twoCounters) return;
    this.twoCounters = on;
    // The keys change shape, so old state would never be matched or expired again.
    this.states.clear();
  }

  /** Live box-detail calibration; latched values are re-derived from the stored position. */
  setBoxDetail(detail: { enabled: boolean; loudness: number; timing: number; baseVelocity: number }): void {
    this.boxDetail = detail;
  }

  reset(): void {
    this.states.clear();
  }

  /**
   * Live-update the settle window. The hand guard makes settling safe to shorten: the
   * long window existed to ride out hands, and those cells are now held instead.
   */
  setSettleWindow(ms: number): void {
    this.settleWindowMs = ms;
  }

  /**
   * Restart the settle clock for cells that have just been released by the hand guard.
   * Settled cells are left alone: a counter that was already playing before the hand
   * arrived must not stop because the hand went away.
   */
  restartSettle(cells: Iterable<CellRef>): void {
    for (const { row, col } of cells) {
      const st = this.states.get(keyOf(row, col));
      if (!st || st.phase === 'settled') continue;
      st.stillMs = 0;
      st.movingMs = 0;
      st.lastCentroid = null;
      st.velocity = 0;
      st.offsets = [];
    }
  }

  step(readings: CellReading[], dtMs: number, _nowMs: number): BoardStepResult {
    const {
      velocityFloor, velocitySmoothing, occupancyGraceMs, motionConfirmMs,
    } = this.cfg;
    const settleWindowMs = this.settleWindowMs;
    const justSettled: CellRef[] = [];
    const justDeactivated: CellRef[] = [];

    interface Track {
      key: string;
      row: number;
      col: number;
      colour: PieceColour | null;
      centroid: Point | null;
      offset: number | null;
      position: BoxPosition;
    }
    const tracks: Track[] = [];
    const cellsRead = new Set<string>();
    const present = new Set<string>();
    for (const r of readings) {
      cellsRead.add(keyOf(r.row, r.col));
      const colours = this.twoCounters
        ? (r.colours ?? (r.colour ? [r.colour] : []))
        : (r.colour ? [r.colour] : []);
      for (const colour of colours) {
        const key = this.twoCounters ? `${r.row},${r.col},${colour}` : keyOf(r.row, r.col);
        present.add(key);
        tracks.push({
          key,
          row: r.row,
          col: r.col,
          colour,
          centroid: (this.twoCounters ? r.centroids?.[colour] : null) ?? r.centroid,
          offset: (this.twoCounters ? r.offsets?.[colour] : null) ?? r.offset ?? null,
          position: r.boxPositions?.[colour] ?? CENTRED,
        });
      }
    }
    // Anything this frame's cells no longer show has to be stepped as absent, or its
    // note would hang on for ever.
    for (const [key] of this.states) {
      if (present.has(key)) continue;
      const parts = key.split(',');
      const row = Number(parts[0]);
      const col = Number(parts[1]);
      if (!cellsRead.has(keyOf(row, col))) continue;   // the cell wasn't read (held)
      tracks.push({ key, row, col, colour: null, centroid: null, offset: null, position: CENTRED });
    }

    for (const r of tracks) {
      const k = r.key;
      let st = this.states.get(k);
      if (!st) {
        st = {
          lastCentroid: null, velocity: 0, stillMs: 0, movingMs: 0, lostMs: 0, phase: 'idle',
          colour: null, pendingColour: null, pendingColourMs: 0, offsets: [], positions: [],
          settledPosition: CENTRED, settledOffset: null, conditional: false, resettle: false,
        };
        this.states.set(k, st);
      }

      const isPiece = r.colour !== null && r.centroid !== null;

      if (isPiece && r.centroid && r.colour) {
        if (st.phase === 'settled') {
          // Colour hold: a hand or sleeve crossing a settled cell must not change what
          // it plays. A genuinely different colour has to persist for a whole settle
          // window; then the cell goes lost and re-settles as the new colour.
          if (r.colour === st.colour) {
            st.pendingColour = null;
            st.pendingColourMs = 0;
          } else {
            if (st.pendingColour === r.colour) st.pendingColourMs += dtMs;
            else { st.pendingColour = r.colour; st.pendingColourMs = 0; }
            if (st.pendingColourMs >= settleWindowMs) {
              st.phase = 'idle';
              st.stillMs = 0;
              st.movingMs = 0;
              st.offsets = [];
              st.positions = [];
              st.pendingColour = null;
              st.pendingColourMs = 0;
              st.colour = r.colour;
              // A take-over continues one piece's turn: no fresh settle tick.
              st.resettle = true;
              justDeactivated.push({ row: r.row, col: r.col });
            }
          }
        } else {
          // Idle: a new colour is a different piece, so its settle window starts over.
          if (st.colour !== r.colour) {
            st.colour = r.colour;
            st.stillMs = 0;
            st.offsets = [];
          }
          if (r.offset != null) {
            st.offsets.push(r.offset);
            if (st.offsets.length > MAX_OFFSET_SAMPLES) st.offsets.shift();
          }
          st.positions.push(r.position);
          if (st.positions.length > MAX_OFFSET_SAMPLES) st.positions.shift();
        }
        st.lostMs = 0;
        if (st.lastCentroid) {
          const inst = dist(r.centroid, st.lastCentroid) / Math.max(dtMs, 1e-6);
          st.velocity = st.velocity + alphaForDt(velocitySmoothing, dtMs) * (inst - st.velocity);
        } else {
          // First sighting or recovery from occlusion: velocity unmeasurable →
          // treat as still so an occluded settled cell survives recovery.
          st.velocity = 0;
        }
        st.lastCentroid = r.centroid;

        const moving = st.velocity >= velocityFloor;
        if (moving) {
          st.movingMs += dtMs;
          st.stillMs = 0;
          if (st.phase === 'idle') { st.offsets = []; st.positions = []; }
        } else {
          st.stillMs += dtMs;
          st.movingMs = 0;
        }

        if (st.phase === 'idle') {
          if (st.stillMs >= settleWindowMs) {
            st.phase = 'settled';
            st.movingMs = 0;
            // Latch how far off centre the piece was placed, from the whole settle
            // window, so later jitter can't flip it in and out of Variation.
            st.settledOffset = st.offsets.length > 0 ? median(st.offsets) : null;
            // Latched with the conditional flag: jitter under a resting counter must not
            // change how loud it is or when it plays.
            st.settledPosition = medianPosition(st.positions);
            st.conditional = conditionalFromOffset(
              st.settledOffset, this.variationEnabled, this.variationOffsetThreshold,
            );
            if (st.resettle) st.resettle = false;
            else justSettled.push({ row: r.row, col: r.col });
          }
        } else if (st.movingMs >= motionConfirmMs) {
          st.phase = 'idle';
          st.stillMs = 0;
          st.movingMs = 0;
          justDeactivated.push({ row: r.row, col: r.col });
        }
      } else {
        // Not occupied by a piece this frame (empty or occluded).
        st.lastCentroid = null;
        st.velocity = 0;
        st.movingMs = 0;
        if (st.phase === 'settled') {
          st.lostMs += dtMs;
          if (st.lostMs >= occupancyGraceMs) {
            st.phase = 'idle';
            st.lostMs = 0;
            st.stillMs = 0;
            st.offsets = [];
            st.positions = [];
            st.pendingColour = null;
            st.pendingColourMs = 0;
            justDeactivated.push({ row: r.row, col: r.col });
          }
        } else {
          st.stillMs = 0;
          st.lostMs = 0;
          st.offsets = [];
          st.positions = [];
        }
      }
    }

    const activeCells: ActiveCell[] = [];
    for (const [k, st] of this.states) {
      if (st.phase === 'settled' && st.colour !== null) {
        const [row, col] = k.split(',').map(Number);
        const cell: ActiveCell = { row, col, colour: st.colour };
        if (st.conditional) cell.conditional = true;
        if (this.boxDetail.enabled) {
          cell.velocity = velocityFor(
            this.boxDetail.baseVelocity, st.settledPosition.up, this.boxDetail.loudness,
          );
          const timing = timingBeatsFor(st.settledPosition.side, this.boxDetail.timing);
          if (timing !== 0) cell.timingBeats = timing;
        }
        activeCells.push(cell);
      }
    }

    return { activeCells, justSettled, justDeactivated };
  }
}
