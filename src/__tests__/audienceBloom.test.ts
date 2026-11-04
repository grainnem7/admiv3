import { describe, it, expect } from 'vitest';
import {
  BLOOM_LIGHT_BUDGET, BLOOM_SEC, bloomAt, bloomColour, bloomShare, boardLayout, canRebloom, contrastRatio, COUNTER_RADIUS,
  counterNeedsRing, DIM_PRESENCE, INITIAL_LIGHT, REBLOOM_MIN_GAP_SEC, SCENE_NAME, bloomGlowScale, stepLight, type Rgb,
} from '../audience/light';
import { INITIAL_MARKER, markerShare, stepMarker } from '../audience/hatMarker';

const sat = (c: Rgb): number => (Math.max(...c) - Math.min(...c)) / Math.max(1, Math.max(...c));
const lin = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (c: Rgb): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

describe('A5: the audience screen, a little easier to see', () => {
  it('the dim board before the piece is at about 0.4', () => {
    expect(DIM_PRESENCE).toBeCloseTo(0.4, 5);
  });

  it('the scene name sits 5% in from the edge, at about 0.8 opacity, about 2.2% of the width', () => {
    expect(SCENE_NAME.inset).toBeCloseTo(0.05, 5);
    expect(SCENE_NAME.opacity).toBeCloseTo(0.8, 5);
    expect(SCENE_NAME.widthShare).toBeCloseTo(0.022, 5);
  });

  it('counters are 0.42 of a square', () => {
    expect(COUNTER_RADIUS).toBeCloseTo(0.42, 5);
    // Biggest ripple (3.2 radii) still stays on its own neighbourhood: a square or two.
    const l = boardLayout(1920, 1080, 8, 8);
    expect(l.cell * COUNTER_RADIUS * 2).toBeLessThan(l.cell);
  });

  it('a bloom brightens a colour without washing it to white', () => {
    for (const c of [[220, 40, 40], [40, 200, 80], [60, 90, 230], [235, 190, 40]] as Rgb[]) {
      for (const g of [0.25, 0.6, 1]) {
        const b = bloomColour(c, g);
        expect(lum(b)).toBeGreaterThanOrEqual(lum(c) - 1e-9);
        // The colour keeps its strength: no more than a few points paler than it started.
        expect(sat(b)).toBeGreaterThan(sat(c) - 0.08);
        // And keeps its hue: the brightest and dimmest channels stay the same ones.
        expect(b.indexOf(Math.max(...b))).toBe(c.indexOf(Math.max(...c)));
        expect(b.indexOf(Math.min(...b))).toBe(c.indexOf(Math.min(...c)));
        for (const v of b) expect(v).toBeLessThanOrEqual(255);
      }
    }
    // Red does not turn to salmon, green does not turn to mint.
    expect(sat(bloomColour([220, 40, 40], 1))).toBeGreaterThan(0.75);
    expect(sat(bloomColour([40, 200, 80], 1))).toBeGreaterThan(0.7);
    // No bloom, no change.
    expect(bloomColour([220, 40, 40], 0)).toEqual([220, 40, 40]);
  });

  it('a dark counter gets a thin light ring, a bright one does not', () => {
    expect(counterNeedsRing([0, 0, 0])).toBe(true);
    expect(counterNeedsRing([20, 20, 40])).toBe(true);
    expect(counterNeedsRing([235, 190, 40])).toBe(false);
    expect(counterNeedsRing([60, 90, 230])).toBe(false);
    expect(contrastRatio([0, 0, 0], [5, 6, 10])).toBeLessThan(1.2);
  });
});

// A third of the screen, and how bright it gets.
//
// The model mirrors how AudienceScreen draws a bloom: a halo (alpha 0.6 x glow, fading over
// 1.6 + glow radii), and the counter's own disc brightened by 0.4 x glow. Each bloom's light
// is counted wholly in the third that holds its counter (more than the real picture, where a
// halo near an edge is shared): a bigger swing than the screen's own.

interface Cell { row: number; col: number; rgb: Rgb }

const SCREEN = { w: 1920, h: 1080 };
const RELATIVE_FLASH = 0.1; // WCAG 2.3.1: a swing of 10% of the maximum relative luminance
const DT = 1 / 60;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE: Rgb[] = [
  [255, 255, 255], [235, 190, 40], [220, 40, 40], [60, 90, 230], [40, 200, 80], [0, 0, 0], [240, 240, 90],
];

/** What the screen does with a stream of notes, the way AudienceScreen does it. */
function simulate(
  board: { rows: number; cols: number; cells: Cell[] },
  notes: { t: number; cell: Cell }[],
  seconds: number,
  orientation: 'columns' | 'rows',
  /** The hat's marker as well: the hat swung from side to side and up and down `hatHz` times a second. */
  hatHz = 0,
): number[][] {
  const { cell: size, x0, y0 } = boardLayout(SCREEN.w, SCREEN.h, board.rows, board.cols);
  const r = size * COUNTER_RADIUS;
  const thirdArea = (SCREEN.w * SCREEN.h) / 3;
  const share = bloomShare(size, SCREEN.w, SCREEN.h);
  const thirdOf = (c: Cell): number => {
    const x = x0 + (c.col + 0.5) * size;
    const y = y0 + (c.row + 0.5) * size;
    return Math.min(2, Math.floor(((orientation === 'columns' ? x / SCREEN.w : y / SCREEN.h)) * 3));
  };
  const lastAt = new Map<string, number>();
  const live: { key: string; at: number; cell: Cell }[] = [];
  const series: number[][] = [[], [], []];
  let next = 0;
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  let light = INITIAL_LIGHT;
  let marker = INITIAL_MARKER;
  const markerLight = markerShare(SCREEN.w, SCREEN.h);
  for (let t = 0; t < seconds; t += DT) {
    while (next < sorted.length && sorted[next].t <= t) {
      const n = sorted[next++];
      const key = `${n.cell.row},${n.cell.col}`;
      if (!canRebloom(lastAt.get(key) ?? -Infinity, n.t)) continue;
      lastAt.set(key, n.t);
      const hit = live.findIndex((b) => b.key === key);
      if (hit >= 0) live.splice(hit, 1);
      live.push({ key, at: n.t, cell: n.cell });
    }
    for (let i = live.length - 1; i >= 0; i--) if (t - live[i].at > BLOOM_SEC) live.splice(i, 1);
    const shapes = live.map((b) => bloomAt(t - b.at, false));
    const scale = bloomGlowScale(live.map((b, i) => ({ glow: shapes[i]?.glow ?? 0, colour: b.cell.rgb })), share);
    const sum = [0, 0, 0];
    live.forEach((b, i) => {
      const s = shapes[i];
      if (!s) return;
      const g = s.glow * scale;
      const rr = r * s.scale;
      const R = rr * (1.6 + g);
      // The halo: alpha 0.6 g at 0.5 rr, falling to 0 at R. Its mass, in pixels of full light.
      let halo = 0;
      for (let q = rr * 0.5; q < R; q += 1) halo += 0.6 * g * (1 - (q - rr * 0.5) / (R - rr * 0.5)) * 2 * Math.PI * q;
      halo += 0.6 * g * Math.PI * (rr * 0.5) ** 2;
      const disc = 0.4 * g * Math.PI * rr * rr;
      sum[thirdOf(b.cell)] += ((halo + disc) * lum(bloomColour(b.cell.rgb, g))) / thirdArea;
    });
    if (hatHz > 0) {
      // The marker, all of it (ring, core and trail) counted in the third that holds the ring.
      const side = Math.floor(t * hatHz * 2) % 2;
      const hat = { mode: 'follow' as const, x: side, y: 1 - side, warmth: 0.5 };
      light = stepLight(light, hat, DT, t);
      marker = stepMarker(marker, 'follow', light, DT, t, false);
      const k = Math.min(2, Math.floor((orientation === 'columns' ? marker.x : marker.y) * 3));
      sum[k] += markerLight * marker.alpha;
    }
    for (let k = 0; k < 3; k++) series[k].push(Math.min(1, sum[k]));
  }
  return series;
}

/**
 * The most flashes in any one second. A flash is a rise of `threshold` or more followed by a
 * fall of as much; its time is the top of the rise. Counted over any window under a second.
 */
function worstFlashesPerSecond(series: number[], threshold: number): number {
  const peaks: number[] = [];
  let dir = 0; // 1 rising, -1 falling, 0 not yet known
  let ext = series[0];
  let extAt = 0;
  let rose = false; // the last rise was big enough to count
  series.forEach((v, i) => {
    if (dir === 0) {
      if (v - ext >= threshold) { dir = 1; ext = v; extAt = i; rose = true; }
      else if (ext - v >= threshold) { dir = -1; ext = v; extAt = i; }
      else { if (v > ext) { ext = v; extAt = i; } }
      return;
    }
    if (dir === 1) {
      if (v > ext) { ext = v; extAt = i; }
      else if (ext - v >= threshold) { if (rose) peaks.push(extAt); dir = -1; ext = v; extAt = i; rose = false; }
    } else if (v < ext) { ext = v; extAt = i; }
    else if (v - ext >= threshold) { dir = 1; ext = v; extAt = i; rose = true; }
  });
  const per = Math.round(1 / DT);
  let worst = 0;
  for (let i = 0; i < peaks.length; i++) {
    let n = 0;
    for (let j = i; j < peaks.length && peaks[j] - peaks[i] < per; j++) n++;
    worst = Math.max(worst, n);
  }
  return worst;
}

function randomBoard(rand: () => number, full: boolean): { rows: number; cols: number; cells: Cell[] } {
  const rows = 3 + Math.floor(rand() * 6);
  const cols = 3 + Math.floor(rand() * 6);
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (full || rand() < 0.35 + rand() * 0.65) cells.push({ row, col, rgb: PALETTE[Math.floor(rand() * PALETTE.length)] });
    }
  }
  return { rows, cols, cells };
}

/** Speed 240: a step is 62.5 ms at the fastest (16th notes). */
const STEP = 60 / 240 / 4;

describe('A6: no third of the screen flashes more than 3 times a second at Speed 240', () => {
  it('a counter cannot re-bloom more than about 3 times a second', () => {
    expect(REBLOOM_MIN_GAP_SEC).toBeGreaterThanOrEqual(1 / 3 - 1e-9);
    expect(canRebloom(-Infinity, 0)).toBe(true);
    expect(canRebloom(0, REBLOOM_MIN_GAP_SEC * 0.5)).toBe(false);
    expect(canRebloom(0, REBLOOM_MIN_GAP_SEC)).toBe(true);
  });

  it('the glow is scaled down as more blooms sound together, and left alone when only a few do', () => {
    const share = bloomShare(119, 1920, 1080); // an 8x8 board
    const white = (n: number): { glow: number; colour: Rgb }[] => new Array<{ glow: number; colour: Rgb }>(n).fill({ glow: 1, colour: [255, 255, 255] });
    expect(bloomGlowScale([], share)).toBe(1);
    expect(bloomGlowScale(white(1), share)).toBe(1);
    expect(bloomGlowScale([{ glow: 1, colour: [220, 40, 40] }, { glow: 1, colour: [60, 90, 230] }], share)).toBe(1);
    const many = bloomGlowScale(white(64), share);
    expect(many).toBeLessThan(0.1);
    // What they add together is the budget, however many there are.
    expect(64 * many * share).toBeCloseTo(BLOOM_LIGHT_BUDGET, 6);
    // Bigger counters (a small board) light more of the screen each, so they are held back sooner.
    expect(bloomShare(300, 1920, 1080)).toBeGreaterThan(share * 3);
  });

  const worstCases: [string, (b: { cells: Cell[] }) => { t: number; cell: Cell }[]][] = [
    // The reviewer's failing case: every counter together, 4 times a second.
    ['all together, 4 a second', (b) => { const o: { t: number; cell: Cell }[] = []; for (let t = 0.1; t < 5; t += 0.25) for (const cell of b.cells) o.push({ t, cell }); return o; }],
    // Every counter on every step.
    ['every counter every step', (b) => { const o: { t: number; cell: Cell }[] = []; for (let t = 0.1; t < 5; t += STEP) for (const cell of b.cells) o.push({ t, cell }); return o; }],
    // Halves in turn, as fast as the steps go.
    ['halves in turn', (b) => { const o: { t: number; cell: Cell }[] = []; let k = 0; for (let t = 0.1; t < 5; t += STEP, k++) b.cells.forEach((cell, i) => { if ((i + k) % 2 === 0) o.push({ t, cell }); }); return o; }],
    // One column to the next in time with the steps, the playhead sweeping.
    ['a column to a column', (b) => { const o: { t: number; cell: Cell }[] = []; let k = 0; for (let t = 0.1; t < 5; t += STEP, k++) for (const cell of b.cells) if (cell.col === k % 8) o.push({ t, cell }); return o; }],
    // Just off the limit, so the gate lets every one through and they all line up.
    ['at the gate', (b) => { const o: { t: number; cell: Cell }[] = []; for (let t = 0.1; t < 5; t += REBLOOM_MIN_GAP_SEC) for (const cell of b.cells) o.push({ t, cell }); return o; }],
  ];

  for (const orientation of ['columns', 'rows'] as const) {
    for (const [name, make] of worstCases) {
      it(`every board, ${name}, thirds by ${orientation}`, () => {
        const rand = mulberry(7);
        let worst = 0;
        for (let i = 0; i < 24; i++) {
          const board = randomBoard(rand, i % 3 === 0);
          const series = simulate(board, make(board), 6, orientation);
          for (const third of series) worst = Math.max(worst, worstFlashesPerSecond(third, RELATIVE_FLASH / 2));
        }
        expect(worst).toBeLessThanOrEqual(3);
      });
    }
  }

  for (const hatHz of [1, 2, 3, 5]) {
    it(`with the hat's marker swinging across the thirds ${hatHz} times a second, every worst case stays under 3`, () => {
      const rand = mulberry(11);
      let worst = 0;
      for (const orientation of ['columns', 'rows'] as const) {
        for (const [, make] of worstCases) {
          for (let i = 0; i < 6; i++) {
            const board = randomBoard(rand, i % 3 === 0);
            for (const third of simulate(board, make(board), 6, orientation, hatHz)) worst = Math.max(worst, worstFlashesPerSecond(third, RELATIVE_FLASH / 2));
          }
        }
      }
      expect(worst).toBeLessThanOrEqual(3);
    });
  }

  it('the marker alone, swinging as fast as it can, never flashes: it is far under the threshold', () => {
    for (const orientation of ['columns', 'rows'] as const) {
      for (const third of simulate({ rows: 8, cols: 8, cells: [] }, [], 6, orientation, 6)) {
        expect(Math.max(...third)).toBeLessThan(RELATIVE_FLASH / 5);
        expect(worstFlashesPerSecond(third, RELATIVE_FLASH / 2)).toBe(0);
      }
    }
  });

  it('a full 8x8 board of white counters, all together 4 times a second, is under 3 even at half the threshold', () => {
    const cells: Cell[] = [];
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) cells.push({ row, col, rgb: [255, 255, 255] });
    const notes: { t: number; cell: Cell }[] = [];
    for (let t = 0.1; t < 6; t += 0.25) for (const cell of cells) notes.push({ t, cell });
    for (const third of simulate({ rows: 8, cols: 8, cells }, notes, 6, 'columns')) {
      expect(worstFlashesPerSecond(third, RELATIVE_FLASH / 2)).toBeLessThanOrEqual(3);
      expect(Math.max(...third)).toBeLessThan(0.8); // not a white screen either
    }
  });

  it('the checker itself sees a flash when there is one (3.5 a second, swing 0.18)', () => {
    const series: number[] = [];
    for (let t = 0; t < 4; t += DT) series.push(0.18 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 3.5 * t)));
    expect(worstFlashesPerSecond(series, RELATIVE_FLASH)).toBeGreaterThan(3);
    const four: number[] = [];
    for (let t = 0; t < 4; t += DT) four.push(0.3 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 5 * t)));
    expect(worstFlashesPerSecond(four, RELATIVE_FLASH)).toBeGreaterThan(3);
  });
});
