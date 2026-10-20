import { describe, it, expect, beforeEach } from 'vitest';
import { laptopReadings, placeLaptopCounter } from '../tracking/laptopBoard';
import { suppressSpill } from '../tracking/boardFrame';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig } from '../profiles/BoardSequencerConfig';
import { loadActiveBoardConfig, saveActiveBoardConfig, RIG_KEY } from '../profiles/BoardProfiles';

/** The laptop board stands in for the camera: same readings, so the same music. */
describe('the laptop board', () => {
  it('reads like the camera: one reading per square, counters dead centre', () => {
    const r = laptopReadings([{ row: 1, col: 2, colour: 'c1' }, { row: 9, col: 9, colour: 'c2' }], 4, 4);
    expect(r).toHaveLength(16);
    const piece = r.find((x) => x.occupied)!;
    expect(piece).toMatchObject({ row: 1, col: 2, colour: 'c1', colours: ['c1'], offset: 0 });
    expect(piece.centroid).toEqual({ x: 2.5 / 4, y: 1.5 / 4 });
    expect(r.filter((x) => x.occupied)).toHaveLength(1); // off the grid is ignored
    // Neighbouring counters of one colour are two counters, not one on a grid line.
    const two = laptopReadings([{ row: 0, col: 0, colour: 'c1' }, { row: 0, col: 1, colour: 'c1' }], 2, 2);
    expect(suppressSpill(two, { ...DEFAULT_BOARD_SEQUENCER_CONFIG, rows: 2, cols: 2 }).filter((x) => x.occupied)).toHaveLength(2);
  });

  it('a click places, the same click lifts, another colour replaces', () => {
    let cells = placeLaptopCounter([], 0, 0, 'c1', false);
    expect(cells).toEqual([{ row: 0, col: 0, colour: 'c1' }]);
    cells = placeLaptopCounter(cells, 0, 1, 'c1', false);
    expect(cells).toHaveLength(2);
    cells = placeLaptopCounter(cells, 0, 0, 'c2', false);
    expect(cells).toContainEqual({ row: 0, col: 0, colour: 'c2' });
    cells = placeLaptopCounter(cells, 0, 0, 'c2', false);
    expect(cells).toEqual([{ row: 0, col: 1, colour: 'c1' }]);
  });

  it('a control or loop counter is one counter: placing it again moves it', () => {
    let cells = placeLaptopCounter([], 0, 0, 'vol', true);
    cells = placeLaptopCounter(cells, 3, 5, 'vol', true);
    expect(cells).toEqual([{ row: 3, col: 5, colour: 'vol' }]);
  });
});

describe('the laptop board is remembered', () => {
  beforeEach(() => localStorage.clear());

  it('the choice is the rig\'s, the counters are the player\'s, and both survive a reload', () => {
    saveActiveBoardConfig({
      ...DEFAULT_BOARD_SEQUENCER_CONFIG, boardSource: 'laptop', laptopBoard: [{ row: 2, col: 3, colour: 'c1' }],
    });
    expect(JSON.parse(localStorage.getItem(RIG_KEY)!).fields.boardSource).toBe('laptop');
    const back = loadActiveBoardConfig()!;
    expect(back.boardSource).toBe('laptop');
    expect(back.laptopBoard).toEqual([{ row: 2, col: 3, colour: 'c1' }]);
  });

  it('anything odd falls back to the camera and an empty board', () => {
    const cfg = sanitizeBoardSequencerConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, boardSource: 'tablet', laptopBoard: 'x' })!;
    expect(cfg.boardSource).toBe('camera');
    expect(cfg.laptopBoard).toEqual([]);
  });
});
