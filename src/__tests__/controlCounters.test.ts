import { describe, it, expect } from 'vitest';
import {
  initialControlState, stepControls, faderPositionFromCentroid, rawFaderPosition,
  CONTROL_HYSTERESIS, type ControlsConfig, type ControlState,
} from '../tracking/controlCounters';
import type { CellReading } from '../tracking/BoardSequencerMode';
import type { ColourChannel } from '../tracking/boardColours';
import { DEFAULT_BOARD_SEQUENCER_CONFIG } from '../profiles/BoardSequencerConfig';

const cfg = (over: Partial<ControlsConfig> = {}): ControlsConfig => ({
  faderAxis: 'row',
  boardSquares: 8,
  controlStillMs: DEFAULT_BOARD_SEQUENCER_CONFIG.controlStillMs,
  controlReturnMs: DEFAULT_BOARD_SEQUENCER_CONFIG.controlReturnMs,
  controlRanges: DEFAULT_BOARD_SEQUENCER_CONFIG.controlRanges,
  controlRemoval: DEFAULT_BOARD_SEQUENCER_CONFIG.controlRemoval,
  ...over,
});

const volCh: ColourChannel = { id: 'vol', kind: 'hue', role: 'volume', swatch: '#0f0' };
const revToggle: ColourChannel = { id: 'rv', kind: 'hue', role: 'reverbToggle', swatch: '#00f' };

/** One counter of `colour` whose centroid sits at board position (x, y) in unit coords. */
const at = (y: number, colour = 'vol'): CellReading[] => [
  { row: 0, col: 0, occupied: true, colour, centroid: { x: 0.5, y }, offset: 0 },
];
const empty: CellReading[] = [{ row: 0, col: 0, occupied: false, colour: null, centroid: null }];

/** Run the same readings for `ms`, 50 ms per frame. */
function hold(state: ControlState, readings: CellReading[], c: ControlsConfig, ms: number, channels = [volCh]) {
  let out = stepControls(state, readings, channels, c, 0);
  for (let t = 0; t < ms; t += 50) out = stepControls(out.state, readings, channels, c, 50);
  return out;
}

describe('faderPositionFromCentroid', () => {
  it('row axis runs up the board and the end zones snap to exactly 0 and 1', () => {
    expect(faderPositionFromCentroid({ x: 0.5, y: 0.5 }, 'row', 8)).toBeCloseTo(0.5, 10);
    expect(faderPositionFromCentroid({ x: 0.5, y: 0.02 }, 'row', 8)).toBe(1);
    expect(faderPositionFromCentroid({ x: 0.5, y: 0.98 }, 'row', 8)).toBe(0);
    expect(faderPositionFromCentroid({ x: 0.02, y: 0.5 }, 'col', 8)).toBe(0);
    expect(faderPositionFromCentroid({ x: 0.98, y: 0.5 }, 'col', 8)).toBe(1);
  });

  it('the ends are reachable by a counter sitting ON the end square', () => {
    // The test above used centroids hard against the very edge of the board, which no
    // counter can reach: a counter sits roughly centred on a square, so the furthest it
    // physically goes is half a square in — 0.0625 on an 8-square board. The snap band
    // has to be wider than that, or the ends can never actually be played.
    for (const squares of [8, 10]) {
      const end = 0.5 / squares;
      expect(faderPositionFromCentroid({ x: 0.5, y: end }, 'row', squares)).toBe(1);
      expect(faderPositionFromCentroid({ x: 0.5, y: 1 - end }, 'row', squares)).toBe(0);
      expect(faderPositionFromCentroid({ x: end, y: 0.5 }, 'col', squares)).toBe(0);
      expect(faderPositionFromCentroid({ x: 1 - end, y: 0.5 }, 'col', squares)).toBe(1);
    }
  });

  it('but the square next to the end is still a real step, not snapped', () => {
    expect(faderPositionFromCentroid({ x: 0.5, y: 1.5 / 8 }, 'row', 8)).toBeLessThan(1);
    expect(faderPositionFromCentroid({ x: 0.5, y: 1 - 1.5 / 8 }, 'row', 8)).toBeGreaterThan(0);
  });

  it('gives far more than a cell-per-step resolution on a 4 × 4 grid', () => {
    const levels = new Set<number>();
    for (let i = 0; i < 40; i++) levels.add(faderPositionFromCentroid({ x: 0.5, y: 0.1 + i * 0.02 }, 'row', 8));
    expect(levels.size).toBeGreaterThan(20);
  });

  it('takes the highest counter and returns null when the colour is absent', () => {
    const two = [...at(0.8), ...at(0.3)];
    expect(rawFaderPosition(two, 'vol', cfg())).toBeCloseTo(0.7, 10);
    expect(rawFaderPosition(empty, 'vol', cfg())).toBeNull();
  });
});

describe('stepControls — debounce, hysteresis and ranges', () => {
  it('commits only after the stillness window, then maps through the range', () => {
    const early = hold(initialControlState(), at(0.5), cfg(), 100);
    expect(early.values.volume).toBeUndefined();
    const settled = hold(initialControlState(), at(0.5), cfg(), 200);
    expect(settled.positions.volume).toBeCloseTo(0.5, 10);
    expect(settled.values.volume).toBeCloseTo(0.6, 10); // 0.2 + 0.5 × 0.8
  });

  it('a wobble smaller than the hysteresis band never moves the value', () => {
    const { state } = hold(initialControlState(), at(0.5), cfg(), 200);
    const wobbled = hold(state, at(0.5 - CONTROL_HYSTERESIS / 2), cfg(), 1000);
    expect(wobbled.positions.volume).toBeCloseTo(0.5, 10);
  });

  it('a real move takes the stillness window to land', () => {
    const { state } = hold(initialControlState(), at(0.5), cfg(), 200);
    const moving = hold(state, at(0.2), cfg(), 100);
    expect(moving.positions.volume).toBeCloseTo(0.5, 10);
    const landed = hold(moving.state, at(0.2), cfg(), 100);
    expect(landed.positions.volume).toBeCloseTo(0.8, 10);
  });
});

describe('stepControls — removal', () => {
  it('holds the last value by default, and reports the role as held', () => {
    const { state } = hold(initialControlState(), at(0.5), cfg(), 200);
    const gone = hold(state, empty, cfg(), 2000);
    expect(gone.values.volume).toBeCloseTo(0.6, 10);
    expect([...gone.held]).toEqual(['volume']);
  });

  it('drop-to-zero falls to the range minimum at once', () => {
    const c = cfg({ controlRemoval: { ...DEFAULT_BOARD_SEQUENCER_CONFIG.controlRemoval, volume: 'zero' } });
    const { state } = hold(initialControlState(), at(0.5), c, 200);
    const gone = hold(state, empty, c, 100);
    expect(gone.values.volume).toBeCloseTo(0.2, 10);
    expect(gone.held.size).toBe(0);
  });

  it('return-to-default waits controlReturnMs, holding until then', () => {
    const c = cfg({
      controlRemoval: { ...DEFAULT_BOARD_SEQUENCER_CONFIG.controlRemoval, volume: 'default' },
      controlReturnMs: 1000,
      defaults: { volume: 0.75 },
    });
    const { state } = hold(initialControlState(), at(0.5), c, 200);
    const waiting = hold(state, empty, c, 500);
    expect(waiting.positions.volume).toBeCloseTo(0.5, 10);
    expect([...waiting.held]).toEqual(['volume']);
    const returned = hold(waiting.state, empty, c, 700);
    expect(returned.positions.volume).toBeCloseTo(0.75, 10);
  });
});

describe('stepControls — toggles', () => {
  it('a toggle colour switches on after the stillness window and off when it leaves', () => {
    const chans = [revToggle];
    const on = hold(initialControlState(), at(0.5, 'rv'), cfg(), 200, chans);
    expect(on.toggles.reverbToggle).toBe(true);
    const off = hold(on.state, empty, cfg(), 200, chans);
    expect(off.toggles.reverbToggle).toBe(false);
  });

  it('ignores colours with no control job', () => {
    const melody: ColourChannel = { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' };
    const out = hold(initialControlState(), at(0.5, 'm'), cfg(), 400, [melody]);
    expect(out.values).toEqual({});
    expect(out.state).toEqual({});
  });
});

describe('a control counter under a hand', () => {
  it('holds its value instead of being treated as removed', () => {
    // 'zero' would drop the volume to its minimum the moment a hand crossed the board.
    const c = cfg({ controlRemoval: { ...DEFAULT_BOARD_SEQUENCER_CONFIG.controlRemoval, volume: 'zero' } });
    const { state } = hold(initialControlState(), at(0.5), c, 200);
    const covered = hold(state, empty, { ...c, heldColours: new Set(['vol']) }, 1000);
    expect(covered.values.volume).toBeCloseTo(0.6, 10);
    expect([...covered.held]).toEqual(['volume']);
  });

  it('and once the hand really leaves, removal applies as chosen', () => {
    const c = cfg({ controlRemoval: { ...DEFAULT_BOARD_SEQUENCER_CONFIG.controlRemoval, volume: 'zero' } });
    const { state } = hold(initialControlState(), at(0.5), c, 200);
    const covered = hold(state, empty, { ...c, heldColours: new Set(['vol']) }, 300);
    const gone = hold(covered.state, empty, c, 100);
    expect(gone.values.volume).toBeCloseTo(0.2, 10);
  });

  it('a covered toggle counter stays on', () => {
    const chans = [revToggle];
    const on = hold(initialControlState(), at(0.5, 'rv'), cfg(), 200, chans);
    expect(on.toggles.reverbToggle).toBe(true);
    const covered = hold(on.state, empty, { ...cfg(), heldColours: new Set(['rv']) }, 400, chans);
    expect(covered.toggles.reverbToggle).toBe(true);
  });
});

describe('a fader living in a control lane', () => {
  // Every other test here runs with no lane, so the lane path had never been exercised.
  // It reads along the lane's own orientation instead of the fader axis.
  const lane = (over: Partial<ControlsConfig> = {}): ControlsConfig =>
    cfg({ zone: { mode: 'row', index: 0 }, ...over });

  /** A counter in lane row 0, `x` across the board. */
  const inLane = (x: number, colour = 'vol'): CellReading[] => [
    { row: 0, col: 0, occupied: true, colour, centroid: { x, y: 0.05 }, offset: 0 },
  ];

  it('reaches both ends, even though a counter can only sit in the middle of a square', () => {
    // On an 8-square board the end squares centre on 0.0625 and 0.9375. Without the end
    // snap a player who has pushed the counter as far as it physically goes still can't
    // reach full or silent — and that is hardest on the players with least movement.
    expect(rawFaderPosition(inLane(0.0625), 'vol', lane())).toBe(0);
    expect(rawFaderPosition(inLane(0.9375), 'vol', lane())).toBe(1);
  });

  it('still reads smoothly in between', () => {
    expect(rawFaderPosition(inLane(0.5), 'vol', lane())).toBeCloseTo(0.5, 10);
  });

  it('ignores a counter of the same colour outside the lane', () => {
    const outside: CellReading[] = [
      { row: 2, col: 0, occupied: true, colour: 'vol', centroid: { x: 0.9, y: 0.6 }, offset: 0 },
    ];
    expect(rawFaderPosition(outside, 'vol', lane())).toBeNull();
  });

  it('commits through the same stillness window and range', () => {
    const settled = hold(initialControlState(), inLane(0.5), lane(), 200);
    expect(settled.values.volume).toBeCloseTo(0.6, 10);
  });
});
