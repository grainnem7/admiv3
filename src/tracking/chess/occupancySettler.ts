/**
 * The settle window for a chess board: a new reading of the board is only believed once it
 * has held, unchanged, for the settle time with no hand over the board. A hand reaching in
 * holds everything; when it lifts, the board must stay still for the settle time again.
 * Pure: readings and the time in, the settled occupancy out.
 */
import type { Occupancy, SquareState } from './chessOccupancy';

export interface SettleOptions {
  /** How long a reading must hold, unchanged, before it counts (ms). */
  settleMs: number;
  /** Squares allowed to flicker between frames without restarting the wait. */
  flickerSquares: number;
}
export const DEFAULT_SETTLE: SettleOptions = { settleMs: 700, flickerSquares: 0 };

const same = (a: Occupancy, b: Occupancy, allow: number): boolean => {
  let diff = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i] && ++diff > allow) return false;
  return true;
};

export class OccupancySettler {
  private settled: SquareState[] | null = null;
  private candidate: SquareState[] | null = null;
  private since = 0;

  constructor(private opts: SettleOptions = DEFAULT_SETTLE) {}

  setOptions(opts: SettleOptions): void { this.opts = opts; }

  /** The occupancy believed now, or null before the board has ever settled. */
  current(): Occupancy | null { return this.settled; }

  /** Start again from a known occupancy (after the start position is learnt, or a take back). */
  reset(to: Occupancy | null): void {
    this.settled = to ? [...to] : null;
    this.candidate = null;
  }

  /** Feed one reading. Returns the new settled occupancy when it has just changed, else null. */
  step(reading: Occupancy, handOverBoard: boolean, nowMs: number): Occupancy | null {
    if (handOverBoard) { this.candidate = null; return null; }
    if (!this.candidate || !same(this.candidate, reading, this.opts.flickerSquares)) {
      this.candidate = [...reading];
      this.since = nowMs;
      return null;
    }
    if (nowMs - this.since < this.opts.settleMs) return null;
    if (this.settled && same(this.settled, this.candidate, 0)) return null;
    this.settled = [...this.candidate];
    return this.settled;
  }
}
