import { describe, it, expect } from 'vitest';
import { bandKeeps, fitSafeBand, KEEP_COUNTER_SHARE } from '../tracking/boardColourDetect/detectColours';

// A pale purple counter as the Camo camera reads it (hue 289, colour level 32), and its
// pixels: shading and a highlight spread them around that average.
const average = { h: 289, s: 32, v: 78 };
const pixels: { h: number; s: number; v: number }[] = [];
for (let i = 0; i < 60; i++) {
  pixels.push({ h: 280 + (i % 7) * 3, s: 20 + (i % 11) * 2.5, v: 65 + (i % 5) * 6 });
}

// A board with a few lilac-ish squares near that colour, so the band has to be narrowed.
const board = [
  ...Array.from({ length: 54 }, () => ({ h: 20, s: 30, v: 70 })),
  ...Array.from({ length: 10 }, () => ({ h: 295, s: 26, v: 72 })),
];

describe('fitting a tapped colour against the board', () => {
  it('narrowing to the average alone loses most of the counter — the "0 on board" bug', () => {
    const old = fitSafeBand(average, board);
    expect(bandKeeps(old.band, pixels)).toBeLessThan(KEEP_COUNTER_SHARE);
  });

  it('with the counter\'s pixels, the band keeps most of the counter', () => {
    const fitted = fitSafeBand(average, board, pixels);
    expect(bandKeeps(fitted.band, pixels)).toBeGreaterThanOrEqual(KEEP_COUNTER_SHARE);
  });

  it('still narrows when it can do so without losing the counter', () => {
    const vivid = Array.from({ length: 40 }, (_, i) => ({ h: 287 + (i % 5), s: 70 + (i % 4), v: 70 }));
    const fitted = fitSafeBand({ h: 289, s: 71, v: 70 }, board, vivid);
    expect(fitted.unsafe).toBe(false);
    expect(bandKeeps(fitted.band, vivid)).toBe(1);
  });
});
