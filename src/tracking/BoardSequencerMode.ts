/**
 * Slide-and-settle: the pure heart of the board sequencer. No audio, no DOM.
 * Sibling of SurfacePressMode.
 *
 * A cell becomes SETTLED_ACTIVE only when occupied by a red piece whose
 * velocity has stayed below `velocityFloor` for `settleWindowMs`. A piece in
 * transit (velocity >= floor) never accumulates still-time, so it never fires.
 * Movement of a settled piece deactivates its cell immediately; brief blob
 * loss (occlusion) is absorbed for `occupancyGraceMs` before deactivating.
 *
 * This deliberately does NOT use the baton `found === false` mute semantic:
 * occupancy comes from the recognizer's filled fraction, and a single dropped
 * frame does not mute.
 */

export interface Point {
  x: number;
  y: number;
}

export interface CellReading {
  row: number;
  col: number;
  occupied: boolean;
  colour: 'red' | 'black' | null;
  centroid: Point | null;
}

export interface CellRef {
  row: number;
  col: number;
}

export interface BoardStepResult {
  activeCells: CellRef[];
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
}

interface CellState {
  lastCentroid: Point | null;
  velocity: number;
  stillMs: number;
  lostMs: number;
  phase: 'idle' | 'settled';
}

const keyOf = (row: number, col: number): string => `${row},${col}`;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class BoardSequencerMode {
  private readonly states = new Map<string, CellState>();

  constructor(private readonly cfg: BoardSettleConfig) {}

  reset(): void {
    this.states.clear();
  }

  step(readings: CellReading[], dtMs: number, _nowMs: number): BoardStepResult {
    const { settleWindowMs, velocityFloor, velocitySmoothing, occupancyGraceMs } = this.cfg;
    const justSettled: CellRef[] = [];
    const justDeactivated: CellRef[] = [];

    // A new red piece has appeared if it is occupied+red in a cell that had no
    // lastCentroid (i.e. wasn't tracking a piece last frame).
    const hasNewRedPiece = readings.some(r => {
      if (!(r.occupied && r.colour === 'red' && r.centroid !== null)) return false;
      const existing = this.states.get(keyOf(r.row, r.col));
      return !existing || existing.lastCentroid === null;
    });

    for (const r of readings) {
      const k = keyOf(r.row, r.col);
      let st = this.states.get(k);
      if (!st) {
        st = { lastCentroid: null, velocity: 0, stillMs: 0, lostMs: 0, phase: 'idle' };
        this.states.set(k, st);
      }

      const isRed = r.occupied && r.colour === 'red' && r.centroid !== null;

      if (isRed && r.centroid) {
        const wasInGrace = st.phase === 'settled' && st.lastCentroid === null && st.lostMs > 0;
        st.lostMs = 0;

        if (st.lastCentroid) {
          const inst = dist(r.centroid, st.lastCentroid) / Math.max(dtMs, 1e-6);
          st.velocity = st.velocity + velocitySmoothing * (inst - st.velocity);
        } else if (wasInGrace) {
          // Piece returned after a brief occlusion — treat as still so settled
          // cells are not immediately deactivated by the velocity check.
          st.velocity = 0;
        } else {
          st.velocity = velocityFloor;
        }
        st.lastCentroid = r.centroid;

        if (st.velocity < velocityFloor) {
          st.stillMs += dtMs;
        } else {
          st.stillMs = 0;
          if (st.phase === 'settled') {
            st.phase = 'idle';
            justDeactivated.push({ row: r.row, col: r.col });
          }
        }

        if (st.phase === 'idle' && st.stillMs >= settleWindowMs) {
          st.phase = 'settled';
          justSettled.push({ row: r.row, col: r.col });
        }
      } else {
        // Not a red piece this frame — possible occlusion or piece moved away.
        st.lastCentroid = null;
        st.velocity = 0;
        st.stillMs = 0;
        if (st.phase === 'settled') {
          // If a new red piece appeared elsewhere this same step, the piece has
          // moved rather than been briefly occluded — deactivate immediately.
          if (hasNewRedPiece) {
            st.phase = 'idle';
            st.lostMs = 0;
            justDeactivated.push({ row: r.row, col: r.col });
          } else {
            st.lostMs += dtMs;
            if (st.lostMs >= occupancyGraceMs) {
              st.phase = 'idle';
              st.lostMs = 0;
              justDeactivated.push({ row: r.row, col: r.col });
            }
          }
        }
      }
    }

    const activeCells: CellRef[] = [];
    for (const [k, st] of this.states) {
      if (st.phase === 'settled') {
        const [row, col] = k.split(',').map(Number);
        activeCells.push({ row, col });
      }
    }

    return { activeCells, justSettled, justDeactivated };
  }
}
