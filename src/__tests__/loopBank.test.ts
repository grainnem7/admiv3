import { describe, it, expect } from 'vitest';
import { emptyLoopBank, stepLoopBank, clearLoopSlot } from '../songs/loopBank';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const pat = (col: number): ActiveCell[] => [{ row: 0, col, colour: 'red' }];

// NOTE: every test in this block runs with quietMs 0 — the capture guard switched off.
// That is NOT the shipped default (captureQuietMs is 500), and with the guard on, capture
// is a level check rather than a rising edge, so these cover a branch no player reaches.
// The default is exercised in loopBank.guard.test.ts, and the block at the bottom of this
// file pins the behaviours that must hold either way.
describe('loopBank (capture guard off)', () => {
  it('emptyLoopBank: N empty slots, none present', () => {
    const s = emptyLoopBank(3);
    expect(s.saved).toEqual([null, null, null]);
    expect(s.present).toEqual([false, false, false]);
  });

  it('captures the pattern on a rising edge of an empty slot', () => {
    const r = stepLoopBank(emptyLoopBank(2), [true, false], pat(2), 2);
    expect(r.captured).toEqual([0]);
    expect(r.state.saved[0]).toEqual(pat(2));
    expect(r.active).toEqual([pat(2)]);
  });

  it('does not re-capture while a counter stays on a full slot (recall only)', () => {
    const s = stepLoopBank(emptyLoopBank(1), [true], pat(2), 1).state;
    const r = stepLoopBank(s, [true], pat(5), 1); // still present, different board
    expect(r.captured).toEqual([]);
    expect(r.state.saved[0]).toEqual(pat(2)); // unchanged
    expect(r.active).toEqual([pat(2)]);
  });

  it('pauses on removal (snapshot kept, not active)', () => {
    const s = stepLoopBank(emptyLoopBank(1), [true], pat(2), 1).state;
    const r = stepLoopBank(s, [false], [], 1);
    expect(r.active).toEqual([]);
    expect(r.state.saved[0]).toEqual(pat(2));
  });

  it('resumes on re-place without re-recording', () => {
    let s = stepLoopBank(emptyLoopBank(1), [true], pat(2), 1).state;
    s = stepLoopBank(s, [false], [], 1).state; // pause
    const r = stepLoopBank(s, [true], pat(9), 1); // re-place, new board pattern
    expect(r.captured).toEqual([]);
    expect(r.active).toEqual([pat(2)]); // resumes the ORIGINAL
  });

  it('clearLoopSlot empties a slot; re-record needs a fresh rising edge', () => {
    let s = stepLoopBank(emptyLoopBank(1), [true], pat(2), 1).state;
    s = clearLoopSlot(s, 0);
    expect(s.saved[0]).toBeNull();
    const r = stepLoopBank(s, [true], pat(7), 1); // counter still present (no rising edge)
    expect(r.captured).toEqual([]); // does NOT re-capture until lifted + replaced
  });

  it('captures the conditional flag with the pattern', () => {
    const cells: ActiveCell[] = [{ row: 1, col: 3, colour: 'red', conditional: true }];
    const r = stepLoopBank(emptyLoopBank(1), [true], cells, 1);
    expect(r.state.saved[0]?.[0].conditional).toBe(true);
  });

  it('slots are independent', () => {
    const s = stepLoopBank(emptyLoopBank(2), [true, false], pat(1), 2).state;
    const r = stepLoopBank(s, [true, true], pat(4), 2); // slot 1 rising → capture
    expect(r.captured).toEqual([1]);
    expect(r.active).toEqual([pat(1), pat(4)]);
  });
});

describe('loopBank at the shipped default (capture guard on)', () => {
  const QUIET = 500;
  /** Hold `present` for `ms` at 50 ms a frame, with the real capture guard. */
  function hold(state: Parameters<typeof stepLoopBank>[0], present: boolean[], cells: ActiveCell[], ms: number) {
    let out = stepLoopBank(state, present, cells, present.length, { quietMs: QUIET, dtMs: 0 });
    const captured = [...out.captured];
    for (let t = 0; t < ms; t += 50) {
      out = stepLoopBank(out.state, present, cells, present.length, { quietMs: QUIET, dtMs: 50 });
      captured.push(...out.captured);
    }
    return { ...out, captured };
  }

  it('captures a counter already resting on an empty pad when play starts', () => {
    // There is no rising edge here at all: the counter was down before the bank existed.
    // The tests above would say nothing happens; what actually happens is it captures.
    const resting = emptyLoopBank(2);
    resting.present = [true, false];
    const out = hold(resting, [true, false], pat(2), 700);
    expect(out.captured).toEqual([0]);
    expect(out.state.saved[0]).toEqual(pat(2));
  });

  it('still refuses to re-record over a slot that already holds a loop', () => {
    const filled = hold(emptyLoopBank(1), [true], pat(2), 700);
    const later = hold(filled.state, [true], pat(5), 700);
    expect(later.captured).toEqual([]);
    expect(later.state.saved[0]).toEqual(pat(2));
  });

  it('waits out a board that is still being rearranged', () => {
    let out = stepLoopBank(emptyLoopBank(1), [true], pat(1), 1, { quietMs: QUIET, dtMs: 50 });
    for (let i = 0; i < 6; i++) {
      // The pattern changes every frame, so the quiet window keeps restarting.
      out = stepLoopBank(out.state, [true], pat(i), 1, { quietMs: QUIET, dtMs: 50 });
    }
    expect(out.captured).toEqual([]);
    expect(out.state.saved[0]).toBeNull();
  });
});
