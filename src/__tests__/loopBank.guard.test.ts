import { describe, it, expect } from 'vitest';
import { emptyLoopBank, stepLoopBank, clearLoopSlot, type LoopBankState } from '../songs/loopBank';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const pattern: ActiveCell[] = [{ row: 0, col: 0, colour: 'red' }, { row: 1, col: 2, colour: 'black' }];
const QUIET = 500;

/** Hold `present` for `ms` at 50 ms a frame; `captured` collects every capture in that time. */
function hold(state: LoopBankState, present: boolean[], cells: ActiveCell[], ms: number, quietMs = QUIET) {
  let out = stepLoopBank(state, present, cells, present.length, { quietMs, dtMs: 0 });
  const captured = [...out.captured];
  for (let t = 0; t < ms; t += 50) {
    out = stepLoopBank(out.state, present, cells, present.length, { quietMs, dtMs: 50 });
    captured.push(...out.captured);
  }
  return { ...out, captured };
}

describe('loop bank capture guard', () => {
  it('waits for the pattern to be quiet before capturing', () => {
    // The counter lands on the slot while the pattern is still being built.
    let out = stepLoopBank(emptyLoopBank(4), [true, false, false, false], pattern, 4, { quietMs: QUIET, dtMs: 50 });
    expect(out.captured).toEqual([]);
    out = hold(out.state, [true, false, false, false], pattern, 200);
    expect(out.captured).toEqual([]);
    out = hold(out.state, [true, false, false, false], pattern, 400);
    expect(out.captured).toEqual([0]);
    expect(out.state.saved[0]).toHaveLength(2);
  });

  it('a pattern change restarts the quiet window', () => {
    let out = hold(emptyLoopBank(4), [true, false, false, false], pattern, 400);
    expect(out.captured).toEqual([]);
    const changed = [...pattern, { row: 2, col: 3, colour: 'red' }];
    out = hold(out.state, [true, false, false, false], changed, 200);
    expect(out.captured).toEqual([]);
    out = hold(out.state, [true, false, false, false], changed, 400);
    expect(out.captured).toEqual([0]);
    expect(out.state.saved[0]).toHaveLength(3);
  });

  it('with no quiet window configured it still captures on the rising edge (old behaviour)', () => {
    const out = stepLoopBank(emptyLoopBank(4), [true, false, false, false], pattern, 4);
    expect(out.captured).toEqual([0]);
  });

  it('a full slot recalls at once — the guard only delays capture', () => {
    const saved = emptyLoopBank(2);
    saved.saved[0] = pattern;
    const out = stepLoopBank(saved, [true, false], [], 2, { quietMs: QUIET, dtMs: 50 });
    expect(out.active).toEqual([pattern]);
    expect(out.captured).toEqual([]);
  });

  it('lifting the counter before the window ends captures nothing', () => {
    let out = hold(emptyLoopBank(2), [true, false], pattern, 300);
    out = hold(out.state, [false, false], pattern, 300);
    expect(out.state.saved[0]).toBeNull();
  });
});

describe('Clear is the undo', () => {
  it('a cleared slot does not re-capture until its counter is lifted', () => {
    let out = hold(emptyLoopBank(2), [true, false], pattern, 600);
    expect(out.state.saved[0]).toHaveLength(2);
    out = hold(clearLoopSlot(out.state, 0), [true, false], pattern, 1200);
    expect(out.state.saved[0]).toBeNull();
    out = hold(out.state, [false, false], pattern, 100);   // counter lifted
    out = hold(out.state, [true, false], pattern, 600);    // put back down
    expect(out.state.saved[0]).toHaveLength(2);
  });
});

describe('toggle loop pads', () => {
  const toggleOpts = { quietMs: 0, dtMs: 50, padMode: 'toggle' as const };

  it('one placement starts the loop and it keeps playing with the counter gone', () => {
    const first = stepLoopBank(emptyLoopBank(2), [true, false], pattern, 2, toggleOpts);
    expect(first.state.saved[0]).toHaveLength(2);
    expect(first.active).toEqual([first.state.saved[0]]);
    // Counter lifted: in Toggle the loop carries on.
    const lifted = stepLoopBank(first.state, [false, false], [], 2, toggleOpts);
    expect(lifted.active).toHaveLength(1);
  });

  it('the next placement stops it', () => {
    let out = stepLoopBank(emptyLoopBank(2), [true, false], pattern, 2, toggleOpts);
    out = stepLoopBank(out.state, [false, false], [], 2, toggleOpts);
    out = stepLoopBank(out.state, [true, false], [], 2, toggleOpts);
    expect(out.active).toHaveLength(0);
    expect(out.state.saved[0]).toHaveLength(2);   // the loop is kept, just silent
  });

  it('Hold is unchanged: lifting the counter pauses the loop', () => {
    const holdOpts = { quietMs: 0, dtMs: 50, padMode: 'hold' as const };
    let out = stepLoopBank(emptyLoopBank(2), [true, false], pattern, 2, holdOpts);
    expect(out.active).toHaveLength(1);
    out = stepLoopBank(out.state, [false, false], [], 2, holdOpts);
    expect(out.active).toHaveLength(0);
  });
});
