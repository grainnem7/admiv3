import { describe, it, expect } from 'vitest';
import {
  initialNudgeState, stepNudge, dismissNudge, boardMovedRaw, colourMatchesBoardRaw, type NudgeContext,
} from '../ui/screens/boardSequencer/playNudge';
import type { CellReading } from '../tracking/BoardSequencerMode';

const ctx = (over: Partial<NudgeContext> = {}): NudgeContext => ({
  boardSquares: 8, rows: 4, cols: 4, variationEnabled: false, variationOffsetThreshold: 0.6, enabled: true, ...over,
});

/** A piece in physical square (sr, sc) of an 8×8 board, shifted by (dx, dy) squares. */
function piece(sr: number, sc: number, dx = 0, dy = 0, colour = 'red', offset = 0.5, rows = 4, cols = 4): CellReading {
  const x = (sc + 0.5 + dx) / 8;
  const y = (sr + 0.5 + dy) / 8;
  return { row: Math.floor(y * rows), col: Math.floor(x * cols), occupied: true, colour, centroid: { x, y }, offset, fractions: { [colour]: 0.12 } };
}

const spread = (dx = 0, dy = 0): CellReading[] => [piece(0, 0, dx, dy), piece(2, 5, dx, dy), piece(5, 2, dx, dy), piece(7, 7, dx, dy), piece(4, 4, dx, dy)];

function run(readings: CellReading[], c: NudgeContext, ms: number) {
  let st = initialNudgeState();
  let signal = null;
  for (let t = 0; t <= ms; t += 100) ({ state: st, signal } = stepNudge(st, readings, c, t));
  return { st, signal };
}

describe('board-moved', () => {
  it('counters centred on their squares (4×4 over 8×8) → none', () => {
    expect(boardMovedRaw(spread(), ctx())).toBe(false);
  });
  it('a uniform 0.35-square shift fires only after 2 s', () => {
    expect(boardMovedRaw(spread(0.35, 0), ctx())).toBe(true);
    expect(run(spread(0.35, 0), ctx(), 1500).signal).toBeNull();
    expect(run(spread(0.35, 0), ctx(), 2200).signal).toEqual({ kind: 'board-moved' });
  });
  it('fewer than 4 pieces → never', () => {
    expect(boardMovedRaw(spread(0.35, 0).slice(0, 3), ctx())).toBe(false);
  });
  it('Variation pushes in mixed directions → none', () => {
    const pushed = [piece(0, 0, 0.4, 0, 'red', 0.8), piece(2, 5, -0.4, 0, 'red', 0.8), piece(5, 2, 0, 0.4, 'red', 0.8), piece(7, 7, 0, -0.4, 'red', 0.8), piece(4, 4)];
    expect(boardMovedRaw(pushed, ctx({ variationEnabled: true }))).toBe(false);
  });
  it('is off when the grid does not divide the board, and ignores control colours', () => {
    expect(boardMovedRaw(spread(0.35, 0), ctx({ rows: 3, cols: 3 }))).toBe(false);
    expect(boardMovedRaw(spread(0.35, 0).map((r) => ({ ...r, colour: 'vol' })), ctx({ ignoreColours: new Set(['vol']) }))).toBe(false);
  });
});

describe('colour-matches-board', () => {
  const cells = (n: number, fill: number): CellReading[] => Array.from({ length: n }, (_, i) => ({
    row: Math.floor(i / 4), col: i % 4, occupied: true, colour: 'orange', centroid: { x: 0.5, y: 0.5 }, offset: 0.5, fractions: { orange: fill },
  }));
  it('a channel in 12 of 16 cells at fraction ≥ 0.5 fires; at 0.1 it does not', () => {
    expect(colourMatchesBoardRaw(cells(12, 0.8), ctx())).toBe('orange');
    expect(colourMatchesBoardRaw(cells(12, 0.1), ctx())).toBeNull();
  });
  it('off on grids smaller than 16 cells (3 counters on 2×2)', () => {
    const small = cells(3, 0.9).map((r, i) => ({ ...r, row: Math.floor(i / 2), col: i % 2 }));
    expect(colourMatchesBoardRaw(small, ctx({ rows: 2, cols: 2 }))).toBeNull();
  });
  it('wins over board-moved when both hold', () => {
    const both = [...cells(12, 0.8), ...spread(0.35, 0)];
    expect(run(both, ctx(), 2200).signal).toEqual({ kind: 'colour-matches-board', channelId: 'orange' });
  });
});

describe('dismiss, hysteresis and switch', () => {
  it('Not now hides a kind until it clears for 1 s, then it can come back', () => {
    let { st, signal } = run(spread(0.35, 0), ctx(), 2200);
    expect(signal).not.toBeNull();
    st = dismissNudge(st, 'board-moved');
    ({ state: st, signal } = stepNudge(st, spread(0.35, 0), ctx(), 2300));
    expect(signal).toBeNull();
    for (let t = 2400; t <= 3500; t += 100) ({ state: st, signal } = stepNudge(st, spread(), ctx(), t));
    expect(st.boardMoved.active).toBe(false);
    for (let t = 3600; t <= 5800; t += 100) ({ state: st, signal } = stepNudge(st, spread(0.35, 0), ctx(), t));
    expect(signal).toEqual({ kind: 'board-moved' });
  });
  it('a brief clear under 1 s does not drop an active nudge', () => {
    let { st } = run(spread(0.35, 0), ctx(), 2200);
    let signal;
    ({ state: st, signal } = stepNudge(st, spread(), ctx(), 2600));
    expect(signal).toEqual({ kind: 'board-moved' });
  });
  it('disabled → never signals', () => {
    expect(run(spread(0.35, 0), ctx({ enabled: false }), 3000).signal).toBeNull();
  });
});

describe('hand-guard nudges and priority', () => {
  const cells = (n: number, fill: number): CellReading[] => Array.from({ length: n }, (_, i) => ({
    row: Math.floor(i / 4), col: i % 4, occupied: true, colour: 'orange', centroid: { x: 0.5, y: 0.5 }, offset: 0.5, fractions: { orange: fill },
  }));

  it('something resting needs the same hold as the other hints, and can be dismissed', () => {
    const c = ctx({ resting: true });
    expect(run([], c, 1500).signal).toBeNull();
    let { st, signal } = run([], c, 2200);
    expect(signal).toEqual({ kind: 'something-resting' });
    st = dismissNudge(st, 'something-resting');
    ({ signal } = stepNudge(st, [], c, 2300));
    expect(signal).toBeNull();
  });

  it('a knock outranks every other hint and appears at once', () => {
    const both = [...cells(12, 0.8), ...spread(0.35, 0)];
    const { signal } = run(both, ctx({ knocked: true, resting: true }), 2200);
    expect(signal).toEqual({ kind: 'knocked' });
  });

  it('a knock is reported even when hints are switched off', () => {
    expect(run([], ctx({ enabled: false, knocked: true }), 100).signal).toEqual({ kind: 'knocked' });
    expect(run([], ctx({ enabled: false }), 100).signal).toBeNull();
  });

  it('a knock can never be dismissed: it needs a decision', () => {
    const { st } = run([], ctx({ knocked: true }), 2200);
    expect(stepNudge(dismissNudge(st, 'knocked'), [], ctx({ knocked: true }), 2300).signal)
      .toEqual({ kind: 'knocked' });
  });

  it('colour-matches-board still outranks resting, which outranks board-moved', () => {
    const colourAndRest = run(cells(12, 0.8), ctx({ resting: true }), 2200);
    expect(colourAndRest.signal).toEqual({ kind: 'colour-matches-board', channelId: 'orange' });
    const restAndMoved = run(spread(0.35, 0), ctx({ resting: true }), 2200);
    expect(restAndMoved.signal).toEqual({ kind: 'something-resting' });
  });

  it('a bumped camera raises board-moved without the four-piece rule', () => {
    expect(run([], ctx({ global: true }), 2200).signal).toEqual({ kind: 'board-moved' });
  });
});
