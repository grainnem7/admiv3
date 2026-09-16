import { describe, it, expect } from 'vitest';
import { stepBoardFrame, type BoardFrameCfg } from '../tracking/boardFrame';
import { emptyLoopBank } from '../songs/loopBank';
import type { ActiveCell, BoardStepResult, CellReading } from '../tracking/BoardSequencerMode';

const cfg = (over: Partial<BoardFrameCfg> = {}): BoardFrameCfg => ({
  rows: 4, cols: 4, loopBankEnabled: false, variationEnabled: false, variationOffsetThreshold: 0.6, numPages: 1, ...over,
});
const rd = (row: number, col: number, colour: string | null, offset: number | null = 0.1): CellReading => ({
  row, col, occupied: colour !== null, colour, centroid: colour ? { x: 0.5, y: 0.5 } : null, offset,
});
const res = (active: ActiveCell[], justSettled = active.length > 0): BoardStepResult => ({
  activeCells: active, justSettled: justSettled ? active.map(({ row, col }) => ({ row, col })) : [], justDeactivated: [],
});

describe('stepBoardFrame', () => {
  it('counts occupied readings per colour whether or not running', () => {
    const out = stepBoardFrame({ readings: [rd(0, 0, 'red'), rd(1, 1, 'red'), rd(2, 2, 'blue'), rd(3, 3, null)], cfg: cfg(), running: false, modeResult: null, loopBank: emptyLoopBank(0) });
    expect(out.byColour).toEqual({ red: 2, blue: 1 });
    expect(out.occupied.get('2,2')).toBe('blue');
    expect(out.patternCells).toEqual([]);
    expect(out.fireTick).toBe(false);
    expect(out.bankSlots).toBeNull();
  });

  it('marks conditional cells only when variation is on and single-page', () => {
    const readings = [rd(0, 0, 'red', 0.8), rd(0, 1, 'red', 0.2)];
    expect([...stepBoardFrame({ readings, cfg: cfg({ variationEnabled: true }), running: false, modeResult: null, loopBank: emptyLoopBank(0) }).conditional]).toEqual(['0,0']);
    expect(stepBoardFrame({ readings, cfg: cfg({ variationEnabled: true, numPages: 2 }), running: false, modeResult: null, loopBank: emptyLoopBank(0) }).conditional.size).toBe(0);
    expect(stepBoardFrame({ readings, cfg: cfg(), running: false, modeResult: null, loopBank: emptyLoopBank(0) }).conditional.size).toBe(0);
  });

  it('loop bank off: the whole settled set is the pattern, no loops', () => {
    const active = [{ row: 3, col: 0, colour: 'red' }, { row: 0, col: 1, colour: 'red' }];
    const out = stepBoardFrame({ readings: [], cfg: cfg(), running: true, modeResult: res(active), loopBank: emptyLoopBank(0) });
    expect(out.patternCells).toEqual(active);
    expect(out.activeLoops).toEqual([]);
    expect(out.activeMap.size).toBe(2);
    expect(out.fireTick).toBe(true);
  });

  it('loop bank on: bottom row are slots, capture on rising edge, slot states reported', () => {
    const pattern = { row: 0, col: 1, colour: 'red' };
    const onSlot2 = { row: 3, col: 2, colour: 'blue' };
    const out = stepBoardFrame({ readings: [], cfg: cfg({ loopBankEnabled: true }), running: true, modeResult: res([pattern, onSlot2]), loopBank: emptyLoopBank(4) });
    expect(out.patternCells).toEqual([pattern]);
    expect(out.captured).toEqual([2]);
    expect(out.activeLoops).toEqual([[pattern]]);
    expect(out.bankSlots).toEqual(['empty', 'empty', 'active', 'empty']);
    const next = stepBoardFrame({ readings: [], cfg: cfg({ loopBankEnabled: true }), running: true, modeResult: res([pattern], false), loopBank: out.loopBank });
    expect(next.bankSlots).toEqual(['empty', 'empty', 'paused', 'empty']);
    expect(next.captured).toEqual([]);
  });

  it('not running: loop bank state is passed through unchanged', () => {
    const bank = emptyLoopBank(4);
    const out = stepBoardFrame({ readings: [], cfg: cfg({ loopBankEnabled: true }), running: false, modeResult: null, loopBank: bank });
    expect(out.loopBank).toBe(bank);
    expect(out.bankSlots).toEqual(['empty', 'empty', 'empty', 'empty']);
  });
});

describe('stepBoardFrame — where the loop pads are', () => {
  const settled = (cells: { row: number; col: number; colour: string }[]) => ({
    activeCells: cells, justSettled: [], justDeactivated: [],
  });
  const base = {
    rows: 4, cols: 4, loopBankEnabled: true, variationEnabled: false,
    variationOffsetThreshold: 0.6, numPages: 1,
  };

  it('a row lane puts the pads in that row', () => {
    const out = stepBoardFrame({
      readings: [],
      cfg: { ...base, loopZone: { mode: 'row', index: 3 } },
      running: true,
      modeResult: settled([]),
      loopBank: emptyLoopBank(4),
    });
    expect([...out.bankCells.keys()].sort()).toEqual(['3,0', '3,1', '3,2', '3,3']);
  });

  it('a column lane puts them in that column, not the bottom row', () => {
    const out = stepBoardFrame({
      readings: [],
      cfg: { ...base, loopZone: { mode: 'col', index: 0 } },
      running: true,
      modeResult: settled([]),
      loopBank: emptyLoopBank(4),
    });
    expect([...out.bankCells.keys()].sort()).toEqual(['0,0', '1,0', '2,0', '3,0']);
  });

  it('no lane means no pads to draw anywhere', () => {
    const out = stepBoardFrame({
      readings: [],
      cfg: { ...base, loopBankEnabled: false, loopZone: { mode: 'off', index: 0 } },
      running: true,
      modeResult: settled([]),
      loopBank: emptyLoopBank(0),
    });
    expect(out.bankCells.size).toBe(0);
    expect(out.bankSlots).toBeNull();
  });
});

describe('stepBoardFrame — saving and recalling a loop through a column lane', () => {
  const cell = (row: number, col: number, colour = 'red') => ({ row, col, colour });
  const settled = (cells: { row: number; col: number; colour: string }[]) => ({
    activeCells: cells, justSettled: [], justDeactivated: [],
  });
  const laneCfg = {
    rows: 4, cols: 4, loopBankEnabled: true, variationEnabled: false,
    variationOffsetThreshold: 0.6, numPages: 1,
    loopZone: { mode: 'col' as const, index: 0 },
    sequencedColours: new Set(['red']),
  };
  // Pads run up column 0 from the bottom: slot 0 is row 3.
  const PAD_SLOT_1 = cell(3, 0, 'red');
  const PATTERN = [cell(0, 2), cell(1, 3)];

  it('a counter on a column pad captures the pattern and plays it back', () => {
    const first = stepBoardFrame({
      readings: [],
      cfg: laneCfg,
      running: true,
      modeResult: settled([...PATTERN, PAD_SLOT_1]),
      loopBank: emptyLoopBank(4),
    });
    // The pad itself never becomes a note.
    expect(first.patternCells.map((c) => `${c.row},${c.col}`).sort()).toEqual(['0,2', '1,3']);
    expect(first.captured).toEqual([0]);
    expect(first.loopBank.saved[0]).toHaveLength(2);

    // With the counter still there, the loop plays on top of the live pattern.
    const next = stepBoardFrame({
      readings: [],
      cfg: laneCfg,
      running: true,
      modeResult: settled([PAD_SLOT_1]),
      loopBank: first.loopBank,
    });
    expect(next.activeLoops).toHaveLength(1);
    expect(next.bankCells.get('3,0')).toBe('active');
  });

  it('a control counter on a pad never triggers it', () => {
    const out = stepBoardFrame({
      readings: [],
      cfg: { ...laneCfg, controlColours: new Set(['vol']) },
      running: true,
      modeResult: settled([...PATTERN, cell(3, 0, 'vol')]),
      loopBank: emptyLoopBank(4),
    });
    expect(out.captured).toEqual([]);
    expect(out.bankCells.get('3,0')).toBe('empty');
  });

  it('a counter in the control lane is not a note either', () => {
    const out = stepBoardFrame({
      readings: [],
      cfg: { ...laneCfg, loopZone: { mode: 'off' as const, index: 0 }, controlZone: { mode: 'row' as const, index: 0 } },
      running: true,
      modeResult: settled([cell(0, 1), cell(2, 2)]),
      loopBank: emptyLoopBank(0),
    });
    expect(out.patternCells.map((c) => `${c.row},${c.col}`)).toEqual(['2,2']);
  });
});
