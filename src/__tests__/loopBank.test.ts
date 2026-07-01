import { describe, it, expect } from 'vitest';
import { emptyLoopBank, stepLoopBank, clearLoopSlot } from '../songs/loopBank';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const pat = (col: number): ActiveCell[] => [{ row: 0, col, colour: 'red' }];

describe('loopBank', () => {
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
