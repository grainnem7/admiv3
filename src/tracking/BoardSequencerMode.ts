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
  /** Sustained motion required before a settled cell deactivates (jitter tolerance). */
  motionConfirmMs: number;
}

interface CellState {
  lastCentroid: Point | null;
  velocity: number;
  stillMs: number;
  movingMs: number;
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
    const {
      settleWindowMs, velocityFloor, velocitySmoothing, occupancyGraceMs, motionConfirmMs,
    } = this.cfg;
    const justSettled: CellRef[] = [];
    const justDeactivated: CellRef[] = [];

    for (const r of readings) {
      const k = keyOf(r.row, r.col);
      let st = this.states.get(k);
      if (!st) {
        st = { lastCentroid: null, velocity: 0, stillMs: 0, movingMs: 0, lostMs: 0, phase: 'idle' };
        this.states.set(k, st);
      }

      const isRed = r.occupied && r.colour === 'red' && r.centroid !== null;

      if (isRed && r.centroid) {
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
        // Not occupied-red this frame (empty or occluded).
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
