import { describe, it, expect } from 'vitest';
import { addTap, stepBpm, tapTempo, TAP_MAX_GAP_MS, TAP_WINDOW } from '../songs/tapTempo';

describe('tap tempo (producer flow, item 4)', () => {
  it('four taps half a second apart say 120 BPM', () => {
    let taps: number[] = [];
    for (const t of [0, 500, 1000, 1500]) taps = addTap(taps, t);
    expect(tapTempo(taps)).toBe(120);
  });

  it('one tap says nothing yet', () => {
    expect(tapTempo(addTap([], 1000))).toBeNull();
  });

  it('a long pause starts again: the old taps are forgotten', () => {
    let taps: number[] = [];
    for (const t of [0, 500, 1000]) taps = addTap(taps, t);
    taps = addTap(taps, 1000 + TAP_MAX_GAP_MS + 1);
    expect(taps).toEqual([1000 + TAP_MAX_GAP_MS + 1]);
    expect(tapTempo(taps)).toBeNull();
  });

  it('only the last few gaps count, so a changed mind settles quickly', () => {
    let taps: number[] = [];
    for (let i = 0; i < 20; i++) taps = addTap(taps, i * 1000);
    expect(taps.length).toBe(TAP_WINDOW + 1);
    for (let i = 20; i < 40; i++) taps = addTap(taps, 20000 + (i - 20) * 500);
    expect(tapTempo(taps)).toBe(120);
  });

  it('stays within 50 and 300 BPM', () => {
    expect(tapTempo([0, 100, 200])).toBe(300);
    expect(tapTempo([0, 1900, 3800])).toBe(50);
  });
});

describe('arrow keys on the speed readout', () => {
  it('up or right is one more, down or left one less, five with Shift', () => {
    expect(stepBpm(90, 'ArrowUp', false)).toBe(91);
    expect(stepBpm(90, 'ArrowRight', false)).toBe(91);
    expect(stepBpm(90, 'ArrowDown', false)).toBe(89);
    expect(stepBpm(90, 'ArrowLeft', true)).toBe(85);
    expect(stepBpm(299, 'ArrowUp', true)).toBe(300);
    expect(stepBpm(50, 'ArrowDown', false)).toBe(50);
  });

  it('any other key is not a speed change', () => {
    expect(stepBpm(90, 'a', false)).toBeNull();
    expect(stepBpm(90, ' ', false)).toBeNull();
  });
});
