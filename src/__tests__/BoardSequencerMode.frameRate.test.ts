import { describe, it, expect } from 'vitest';
import { BoardSequencerMode, type CellReading } from '../tracking/BoardSequencerMode';

const cfg = { settleWindowMs: 600, velocityFloor: 0.0008, velocitySmoothing: 0.5, occupancyGraceMs: 150, motionConfirmMs: 80 };
const at = (x: number): CellReading => ({ row: 0, col: 0, occupied: true, colour: 'red', centroid: { x, y: 0.5 } });

/** Settle a piece, then slide it at `speed` (units/ms); return ms until it deactivates (or -1). */
function msToDeactivate(dtMs: number, speed: number): number {
  const m = new BoardSequencerMode(cfg);
  let t = 0;
  for (; t <= 1000; t += dtMs) m.step([at(0.5)], dtMs, t);
  let x = 0.5;
  for (let elapsed = 0; elapsed < 1000; elapsed += dtMs) {
    x += speed * dtMs;
    const r = m.step([at(x)], dtMs, t + elapsed);
    if (r.justDeactivated.length > 0) return elapsed + dtMs;
  }
  return -1;
}

describe('BoardSequencerMode frame-rate independence', () => {
  it('confirms the same slow slide at 30 fps and 60 fps within one frame', () => {
    const speed = 0.0008 * 1.3;
    const a = msToDeactivate(1000 / 30, speed);
    const b = msToDeactivate(1000 / 60, speed);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1000 / 30 + 1);
  });
});
