import { describe, it, expect } from 'vitest';
import { BoardSequencerMode, type BoardSettleConfig, type CellReading } from '../tracking/BoardSequencerMode';

const cfg: BoardSettleConfig = {
  settleWindowMs: 600,
  velocityFloor: 0.0008,
  velocitySmoothing: 0.5,
  occupancyGraceMs: 150,
  motionConfirmMs: 80,
  variationEnabled: true,
  variationOffsetThreshold: 0.6,
};

const DT = 50;

const at = (colour: string | null, offset = 0): CellReading[] => [{
  row: 0, col: 0, occupied: colour !== null, colour,
  centroid: colour ? { x: 0.125, y: 0.125 } : null, offset: colour ? offset : null,
}];

/** Run the same reading for `ms` and return the last step result. */
function run(mode: BoardSequencerMode, readings: CellReading[], ms: number, t0 = 0) {
  let out = mode.step(readings, DT, t0);
  for (let t = DT; t < ms; t += DT) out = mode.step(readings, DT, t0 + t);
  return out;
}

describe('colour hold', () => {
  it('a sleeve passing over a settled cell does not change its colour', () => {
    const mode = new BoardSequencerMode(cfg);
    run(mode, at('red'), 700);
    expect(run(mode, at('black'), 300).activeCells[0]).toMatchObject({ colour: 'red' });
  });

  it('a genuinely new colour takes over after the settle window', () => {
    const mode = new BoardSequencerMode(cfg);
    run(mode, at('red'), 700);
    const out = run(mode, at('black'), 1400, 700);
    expect(out.activeCells[0]).toMatchObject({ colour: 'black' });
  });

  it('a colour take-over is not a new placement, so it fires no settle tick', () => {
    const mode = new BoardSequencerMode(cfg);
    run(mode, at('red'), 700);
    let ticks = 0;
    for (let t = 700; t < 2400; t += DT) ticks += mode.step(at('black'), DT, t).justSettled.length;
    expect(ticks).toBe(0);
  });
});

describe('conditional latched at settle', () => {
  it('is fixed from the settle window and does not follow later jitter', () => {
    const mode = new BoardSequencerMode(cfg);
    const settled = run(mode, at('red', 0.1), 700);
    expect(settled.activeCells[0].conditional).toBeUndefined();
    const jittered = run(mode, at('red', 0.9), 400, 700);
    expect(jittered.activeCells[0].conditional).toBeUndefined();
  });

  it('a counter settled off-centre stays conditional', () => {
    const mode = new BoardSequencerMode(cfg);
    const out = run(mode, at('red', 0.8), 700);
    expect(out.activeCells[0].conditional).toBe(true);
  });
});

describe('settle tick only for new placements', () => {
  it('a brief occlusion and recovery does not re-tick', () => {
    const mode = new BoardSequencerMode(cfg);
    expect(run(mode, at('red'), 700).justSettled).toHaveLength(0); // ticked earlier in the run
    let ticks = 0;
    for (let t = 700; t < 800; t += DT) ticks += mode.step(at(null), DT, t).justSettled.length;
    for (let t = 800; t < 1600; t += DT) ticks += mode.step(at('red'), DT, t).justSettled.length;
    expect(ticks).toBe(0);
  });

  it('a counter picked up for good and put back down ticks again', () => {
    const mode = new BoardSequencerMode(cfg);
    run(mode, at('red'), 700);
    run(mode, at(null), 400, 700);                    // gone well past the grace window
    let ticks = 0;
    for (let t = 1100; t < 1900; t += DT) ticks += mode.step(at('red'), DT, t).justSettled.length;
    expect(ticks).toBe(1);
  });
});
