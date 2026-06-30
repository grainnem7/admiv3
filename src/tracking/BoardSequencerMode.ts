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
  /** Colour of the piece currently occupying the cell (last seen). */
  colour: PieceColour;
  /** Whether the occupying piece is currently off-centre past the threshold. */
  conditional: boolean;
}

const keyOf = (row: number, col: number): string => `${row},${col}`;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class BoardSequencerMode {
  private readonly states = new Map<string, CellState>();

  private variationEnabled: boolean;
  private variationOffsetThreshold: number;

  constructor(private readonly cfg: BoardSettleConfig) {
    this.variationEnabled = cfg.variationEnabled ?? false;
    this.variationOffsetThreshold = cfg.variationOffsetThreshold ?? 0.6;
  }

  /** Live-update the variation calibration (safe to call while running). */
  setVariation(enabled: boolean, offsetThreshold: number): void {
    this.variationEnabled = enabled;
    this.variationOffsetThreshold = offsetThreshold;
  }

  reset(): void {
    this.states.clear();
  }

  step(readings: CellReading[], dtMs: number, _nowMs: number): BoardStepResult {
    const {
      settleWindowMs, velocityFloor, velocitySmoothing, occupancyGraceMs, motionConfirmMs,
    } = this.cfg;
    const justSettled: CellRef[] = [];
    const justDeactivated: CellRef[] = [];

    for (const r of readings) {
      const k = keyOf(r.row, r.col);
      let st = this.states.get(k);
      if (!st) {
        st = {
          lastCentroid: null, velocity: 0, stillMs: 0, movingMs: 0, lostMs: 0, phase: 'idle',
          colour: 'red', conditional: false,
        };
        this.states.set(k, st);
      }

      const isPiece = r.occupied && r.colour !== null && r.centroid !== null;

      if (isPiece && r.centroid && r.colour) {
        st.colour = r.colour;
        st.conditional = conditionalFromOffset(
          r.offset ?? null, this.variationEnabled, this.variationOffsetThreshold,
        );
        st.lostMs = 0;
        if (st.lastCentroid) {
          const inst = dist(r.centroid, st.lastCentroid) / Math.max(dtMs, 1e-6);
          st.velocity = st.velocity + velocitySmoothing * (inst - st.velocity);
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
        } else {
          st.stillMs += dtMs;
          st.movingMs = 0;
        }

        if (st.phase === 'idle') {
          if (st.stillMs >= settleWindowMs) {
            st.phase = 'settled';
            st.movingMs = 0;
            justSettled.push({ row: r.row, col: r.col });
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
            justDeactivated.push({ row: r.row, col: r.col });
          }
        } else {
          st.stillMs = 0;
          st.lostMs = 0;
        }
      }
    }

    const activeCells: ActiveCell[] = [];
    for (const [k, st] of this.states) {
      if (st.phase === 'settled') {
        const [row, col] = k.split(',').map(Number);
        const cell: ActiveCell = { row, col, colour: st.colour };
        if (st.conditional) cell.conditional = true;
        activeCells.push(cell);
      }
    }

    return { activeCells, justSettled, justDeactivated };
  }
}
