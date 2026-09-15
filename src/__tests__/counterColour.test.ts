import { describe, it, expect } from 'vitest';
import { counterColourFromRegion } from '../tracking/ColorTracker';
import { calibrationFromHsv } from '../tracking/boardColours';

/** Build an sw×sh RGBA region: `bg` everywhere, a centred `size`×`size` `fg` square. */
function region(
  sw: number, sh: number, bg: [number, number, number],
  size: number, fg: [number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(sw * sh * 4);
  const mx = Math.floor((sw - size) / 2);
  const my = Math.floor((sh - size) / 2);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const inC = x >= mx && x < mx + size && y >= my && y < my + size;
      const [r, g, b] = inC ? fg : bg;
      const i = (y * sw + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return data;
}

const TAN: [number, number, number] = [180, 140, 90]; // vivid tan wood (hue ~33, sat ~50)

describe('counterColourFromRegion', () => {
  it('anchors to the counter under the click, not vivid wood at the edges', () => {
    // A washed dark-blue counter (sat ~31) is LESS saturated than the tan wood
    // (sat ~50) around it — the old "most saturated in the whole region" would
    // wrongly seed on the tan; centre-anchoring seeds on the blue counter.
    const out = counterColourFromRegion(region(20, 20, TAN, 10, [90, 100, 130]), 20, 20);
    expect(out).not.toBeNull();
    expect(out!.h).toBeGreaterThan(200); // blue-ish, not tan (~33)
    expect(out!.h).toBeLessThan(250);
  });

  it('captures a vivid red counter in a tan surround', () => {
    const out = counterColourFromRegion(region(20, 20, TAN, 10, [200, 40, 40]), 20, 20);
    expect(out).not.toBeNull();
    expect(out!.h < 20 || out!.h > 340).toBe(true); // red hue near 0/360
  });

  it('captures a green counter', () => {
    const out = counterColourFromRegion(region(20, 20, TAN, 10, [40, 160, 60]), 20, 20);
    expect(out).not.toBeNull();
    expect(out!.h).toBeGreaterThan(90);
    expect(out!.h).toBeLessThan(160);
  });

  it('returns null for an empty region', () => {
    expect(counterColourFromRegion(new Uint8ClampedArray(0), 0, 0)).toBeNull();
  });
});

describe('counterColourFromRegion on dark counters', () => {
  it('a noisy near-black counter is classified black, not a random hue', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (const base of [8, 16, 24]) {
      const sw = 20; const sh = 20;
      const data = new Uint8ClampedArray(sw * sh * 4);
      for (let i = 0; i < sw * sh; i++) {
        for (let ch = 0; ch < 3; ch++) data[i * 4 + ch] = Math.max(0, Math.round(base + (rand() - 0.5) * 12));
        data[i * 4 + 3] = 255;
      }
      const c = counterColourFromRegion(data, sw, sh)!;
      expect(calibrationFromHsv({ h: c.h, s: c.s, v: c.v }).kind).toBe('black');
    }
  });
});
