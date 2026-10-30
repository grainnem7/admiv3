import { describe, it, expect } from 'vitest';
import {
  bloomGlowScale, brightenKeepingHue, canRebloom, isDarkCounter, BLOOM_SEC, MAX_PULSE_HZ, boardLayout, bloomAt,
  type Rgb,
} from '../audience/light';
import { maxFlashesPerSecond, regionLuma, FLASH_SWING } from '../audience/flashCheck';

interface Note { t: number; row: number; col: number }

const W = 1920;
const H = 1080;
const FPS = 60;

/** Which of the six thirds (three columns, three rows of the screen) each square is in. */
function runBoard(rows: number, cols: number, notes: Note[], seconds: number, limited: boolean): number {
  const { x0, y0, cell } = boardLayout(W, H, rows, cols);
  const cells = new Map<string, { cx: number; cy: number }>();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.set(`${r},${c}`, { cx: x0 + (c + 0.5) * cell, cy: y0 + (r + 0.5) * cell });
  const last = new Map<string, number>();
  const blooms: { key: string; at: number }[] = [];
  let next = 0;
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  const series: number[][] = [[], [], [], [], [], []];
  for (let f = 0; f < seconds * FPS; f++) {
    const now = f / FPS;
    while (next < sorted.length && sorted[next].t <= now + 1e-9) {
      const n = sorted[next++];
      const key = `${n.row},${n.col}`;
      if (limited && !canRebloom(last.get(key) ?? -Infinity, n.t)) continue;
      last.set(key, n.t);
      blooms.push({ key, at: n.t });
    }
    const live = blooms.filter((b) => now - b.at <= BLOOM_SEC);
    const latest = new Map<string, number>();
    for (const b of live) latest.set(b.key, b.at);
    const scale = limited ? bloomGlowScale(latest.size) : 1;
    const lit: { cx: number; cy: number; glow: number }[] = [];
    for (const [key, at] of latest) {
      const g = bloomAt(now - at, false)?.glow ?? 0;
      lit.push({ ...cells.get(key)!, glow: g * scale });
    }
    const regions = regionLuma(lit, cell, W, H);
    regions.forEach((v, i) => series[i].push(v));
  }
  return Math.max(...series.map((s) => maxFlashesPerSecond(s, FPS, FLASH_SWING)));
}

const everyone = (rows: number, cols: number, hz: number, seconds: number): Note[] => {
  const out: Note[] = [];
  for (let t = 0; t < seconds; t += 1 / hz) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ t, row: r, col: c });
  return out;
};
/** A column a step, at Speed 240 (a sixteenth every 62.5 ms). */
const sweep = (rows: number, cols: number, seconds: number): Note[] => {
  const out: Note[] = [];
  const step = 60 / 240 / 4;
  for (let i = 0; i * step < seconds; i++) for (let r = 0; r < rows; r++) out.push({ t: i * step, row: r, col: i % cols });
  return out;
};
/** Every square on its own beat, offset from its neighbours, as often as it likes. */
const staggered = (rows: number, cols: number, seconds: number, period: number): Note[] => {
  const out: Note[] = [];
  let k = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++, k++) {
    for (let t = (k * period) / (rows * cols); t < seconds; t += period) out.push({ t, row: r, col: c });
  }
  return out;
};
let seed = 7;
const rand = (): number => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const scatter = (rows: number, cols: number, seconds: number): Note[] => {
  const out: Note[] = [];
  const step = 60 / 240 / 4;
  for (let i = 0; i * step < seconds; i++) for (let k = 0; k < 6; k++) out.push({ t: i * step, row: Math.floor(rand() * rows), col: Math.floor(rand() * cols) });
  return out;
};

describe('a counter blooms again no more than 3 times a second', () => {
  it('lets the first bloom, and the next after a third of a second', () => {
    expect(canRebloom(-Infinity, 5)).toBe(true);
    expect(canRebloom(5, 5.2)).toBe(false);
    expect(canRebloom(5, 5 + 1 / MAX_PULSE_HZ)).toBe(true);
  });
});

describe('the glow shares out when many bloom together', () => {
  it('a few blooms are full, many are softer, and it never goes to nothing', () => {
    expect(bloomGlowScale(1)).toBe(1);
    expect(bloomGlowScale(4)).toBe(1);
    expect(bloomGlowScale(64)).toBeLessThan(0.5);
    expect(bloomGlowScale(64)).toBeGreaterThan(0.2);
    expect(bloomGlowScale(16)).toBeGreaterThan(bloomGlowScale(64));
  });
});

describe('the flash limit on the audience screen (WCAG 2.3.1)', () => {
  const boards: [number, number][] = [[2, 2], [4, 4], [6, 6], [8, 8], [3, 10]];
  it('the reviewer’s worst case failed without the limit: all 64 together 4 times a second', () => {
    expect(runBoard(8, 8, everyone(8, 8, 4, 4), 4, false)).toBeGreaterThan(3);
  });
  it.each(boards)('no third of the screen swings more than 3 times a second: all together, %i x %i', (r, c) => {
    expect(runBoard(r, c, everyone(r, c, 4, 4), 4, true)).toBeLessThanOrEqual(3);
    expect(runBoard(r, c, everyone(r, c, 4.5, 4), 4, true)).toBeLessThanOrEqual(3);
  });
  it.each(boards)('at Speed 240, a column a step, %i x %i', (r, c) => {
    expect(runBoard(r, c, sweep(r, c, 4), 4, true)).toBeLessThanOrEqual(3);
  });
  it.each(boards)('at Speed 240, squares taking turns at their fastest allowed, %i x %i', (r, c) => {
    expect(runBoard(r, c, staggered(r, c, 4, 1 / 8), 4, true)).toBeLessThanOrEqual(3);
  });
  it.each(boards)('at Speed 240, notes scattered over the board, %i x %i', (r, c) => {
    expect(runBoard(r, c, scatter(r, c, 4), 4, true)).toBeLessThanOrEqual(3);
  });
});

describe('a bloom brightens without washing to white', () => {
  const hue = (c: Rgb): number => {
    const [r, g, b] = c.map((v) => v / 255);
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
    if (d === 0) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const sat = (c: Rgb): number => (Math.max(...c) === 0 ? 0 : (Math.max(...c) - Math.min(...c)) / Math.max(...c));
  it.each<[Rgb]>([[[220, 50, 50]], [[40, 170, 80]], [[50, 90, 220]], [[230, 190, 40]]])('keeps the hue and the colourfulness of %j', (c) => {
    const lit = brightenKeepingHue(c, 1);
    expect(Math.abs(hue(lit) - hue(c))).toBeLessThan(3);
    expect(sat(lit)).toBeGreaterThan(sat(c) * 0.95);
    expect(Math.max(...lit)).toBeGreaterThan(Math.max(...c));
    expect(Math.min(...lit)).toBeLessThan(Math.min(...c) + 40); // never mint or salmon
  });
  it('no glow changes nothing', () => {
    expect(brightenKeepingHue([10, 20, 30], 0)).toEqual([10, 20, 30]);
  });
});

describe('dark counters', () => {
  it('a black or deep navy counter gets a light ring, a red or white one does not', () => {
    expect(isDarkCounter([0, 0, 0])).toBe(true);
    expect(isDarkCounter([20, 24, 60])).toBe(true);
    expect(isDarkCounter([220, 50, 50])).toBe(false);
    expect(isDarkCounter([255, 255, 255])).toBe(false);
  });
});
