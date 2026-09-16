import { describe, it, expect } from 'vitest';
import { BoardSequencerMode, type BoardSettleConfig, type CellReading } from '../tracking/BoardSequencerMode';
import { velocityFor } from '../tracking/boxDetail';

const cfg: BoardSettleConfig = {
  settleWindowMs: 600,
  velocityFloor: 0.0008,
  velocitySmoothing: 0.5,
  occupancyGraceMs: 150,
  motionConfirmMs: 80,
};

const DT = 50;
const BASE = 0.7;

/** One cell holding `colours`, each with its own centroid and box position. */
function cell(
  colours: { id: string; up: number; side: number }[],
): CellReading[] {
  return [{
    row: 0,
    col: 0,
    occupied: colours.length > 0,
    colour: colours[0]?.id ?? null,
    colours: colours.map((c) => c.id),
    centroid: colours.length > 0 ? { x: 0.125, y: 0.125 } : null,
    centroids: Object.fromEntries(colours.map((c) => [c.id, { x: 0.125, y: 0.125 }])),
    boxPositions: Object.fromEntries(colours.map((c) => [c.id, { up: c.up, side: c.side }])),
    offsets: Object.fromEntries(colours.map((c) => [c.id, 0])),
    offset: 0,
  }];
}

function run(mode: BoardSequencerMode, readings: CellReading[], ms: number, t0 = 0) {
  let out = mode.step(readings, DT, t0);
  for (let t = DT; t < ms; t += DT) out = mode.step(readings, DT, t0 + t);
  return out;
}

const withBoxDetail = (over: Partial<{ loudness: number; timing: number }> = {}): BoardSequencerMode => {
  const m = new BoardSequencerMode(cfg);
  m.setBoxDetail({ enabled: true, loudness: 0.5, timing: 0.35, baseVelocity: BASE, ...over });
  return m;
};

describe('box detail', () => {
  it('is off by default: no velocity or timing on a settled cell', () => {
    const m = new BoardSequencerMode(cfg);
    const out = run(m, cell([{ id: 'red', up: 1, side: 1 }]), 700);
    expect(out.activeCells[0]).toEqual({ row: 0, col: 0, colour: 'red' });
  });

  it('higher in the box plays louder, lower softer, centred unchanged', () => {
    const high = run(withBoxDetail(), cell([{ id: 'red', up: 1, side: 0 }]), 700);
    expect(high.activeCells[0].velocity).toBeCloseTo(velocityFor(BASE, 1, 0.5), 10);
    const low = run(withBoxDetail(), cell([{ id: 'red', up: -1, side: 0 }]), 700);
    expect(low.activeCells[0].velocity).toBeLessThan(BASE);
    const centred = run(withBoxDetail(), cell([{ id: 'red', up: 0, side: 0 }]), 700);
    expect(centred.activeCells[0].velocity).toBeCloseTo(BASE, 10);
    expect(centred.activeCells[0].timingBeats).toBeUndefined();
  });

  it('right of centre plays late, left early', () => {
    const late = run(withBoxDetail(), cell([{ id: 'red', up: 0, side: 1 }]), 700);
    expect(late.activeCells[0].timingBeats).toBeCloseTo(0.175, 10);
    const early = run(withBoxDetail(), cell([{ id: 'red', up: 0, side: -1 }]), 700);
    expect(early.activeCells[0].timingBeats).toBeCloseTo(-0.175, 10);
  });

  it('is latched at settle: jitter afterwards does not change the loudness', () => {
    const m = withBoxDetail();
    const settled = run(m, cell([{ id: 'red', up: 0.8, side: 0 }]), 700);
    const loud = settled.activeCells[0].velocity;
    const jittered = run(m, cell([{ id: 'red', up: -1, side: 0 }]), 400, 700);
    expect(jittered.activeCells[0].velocity).toBeCloseTo(loud!, 10);
  });
});

describe('two counters in one box', () => {
  const two = [{ id: 'red', up: 1, side: 0 }, { id: 'blue', up: -1, side: 0 }];

  it('off: only the strongest colour plays', () => {
    const m = new BoardSequencerMode(cfg);
    const out = run(m, cell(two), 700);
    expect(out.activeCells).toHaveLength(1);
    expect(out.activeCells[0].colour).toBe('red');
  });

  it('both: each counter settles and plays in its own right', () => {
    const m = new BoardSequencerMode(cfg);
    m.setTwoCounters(true);
    const out = run(m, cell(two), 700);
    expect(out.activeCells.map((c) => c.colour).sort()).toEqual(['blue', 'red']);
    expect(out.activeCells.every((c) => c.row === 0 && c.col === 0)).toBe(true);
  });

  it('both: each keeps its own place in the box, so one can be louder', () => {
    const m = new BoardSequencerMode(cfg);
    m.setTwoCounters(true);
    m.setBoxDetail({ enabled: true, loudness: 0.5, timing: 0.35, baseVelocity: BASE });
    const out = run(m, cell(two), 700);
    const red = out.activeCells.find((c) => c.colour === 'red')!;
    const blue = out.activeCells.find((c) => c.colour === 'blue')!;
    expect(red.velocity).toBeGreaterThan(blue.velocity!);
  });

  it('both: taking one counter away leaves the other playing', () => {
    const m = new BoardSequencerMode(cfg);
    m.setTwoCounters(true);
    run(m, cell(two), 700);
    const out = run(m, cell([two[0]]), 400, 700);
    expect(out.activeCells.map((c) => c.colour)).toEqual(['red']);
  });

  it('switching the mode clears the board rather than leaving stale notes', () => {
    const m = new BoardSequencerMode(cfg);
    m.setTwoCounters(true);
    expect(run(m, cell(two), 700).activeCells).toHaveLength(2);
    m.setTwoCounters(false);
    expect(m.step(cell(two), DT, 800).activeCells).toHaveLength(0);
  });
});
