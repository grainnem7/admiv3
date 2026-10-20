/**
 * Detection reliability benchmark: the colour-band reader against the board-referenced
 * reader, on the same synthetic camera pictures, under the things a rehearsal room does.
 *
 *   BENCH=1 npx vitest run src/__tests__/bench      (prints the full table)
 *
 * Without BENCH a small quick subset runs as an ordinary test with pass thresholds for the
 * board-referenced reader, so a change that makes it worse fails the suite.
 */
import { describe, it, expect } from 'vitest';
import { BoardPixelReader, type BoardReaderOptions, type ReaderFrame } from '../../tracking/BoardReader';
import { ColourRecognizer } from '../../tracking/PieceRecognizer';
import {
  buildChannelMatchers, calibrationFromHsv, channelPriority, type ColourChannel,
} from '../../tracking/boardColours';
import { rgbToHsv } from '../../tracking/ColorTracker';
import { suggestReadSettings } from '../../tracking/boardGrid';
import { learnBoardReference, type CounterPrototype } from '../../tracking/boardReference/boardReference';
import {
  angledCorners, boardHomography, COUNTERS, renderBoard, rng, type CounterSpec, type Perturb, type RenderSpec,
} from '../helpers/boardRenderer';

const W = 640;
const H = 360;
const SQUARES = 8;
const corners = angledCorners(W, H);
const hom = boardHomography({ corners });

/** The app reads a frame downscaled; here the "video" is 640×360 and the reader sees half. */
function downsample(f: { data: Uint8ClampedArray; width: number; height: number }): ReaderFrame {
  const w = Math.floor(f.width / 2); const h = Math.floor(f.height / 2);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let ch = 0; ch < 4; ch++) {
        const a = ((2 * y) * f.width + 2 * x) * 4 + ch;
        const b = a + f.width * 4;
        data[(y * w + x) * 4 + ch] = (f.data[a] + f.data[a + 4] + f.data[b] + f.data[b + 4]) / 4;
      }
    }
  }
  return { data, width: w, height: h, downscale: 2 };
}

const NAMES = Object.keys(COUNTERS);
const channels: ColourChannel[] = NAMES.map((name) => {
  const [r, g, b] = COUNTERS[name];
  const cal = calibrationFromHsv(rgbToHsv(r, g, b));
  return { id: name, role: 'melody', swatch: '#000', ...cal, band: cal.band ? { ...cal.band, id: name } : undefined };
});
const prototypes: CounterPrototype[] = NAMES.map((id) => ({ id, rgb: COUNTERS[id] }));
const achromatic = new Set(channels.filter((c) => c.kind !== 'hue').map((c) => c.id));
const read = suggestReadSettings(SQUARES, SQUARES, SQUARES);

const base: Perturb = { noise: 4, chromaBlur: 1 };
// Learnt from frames exactly as the reader sees them (downscaled), as the app does.
const reference = learnBoardReference(
  Array.from({ length: 8 }, (_, i) => downsample(renderBoard({ width: W, height: H, corners, seed: 100 + i, perturb: base }))),
  hom, SQUARES, 2,
)!;

function options(mode: 'bands' | 'board'): BoardReaderOptions {
  return {
    homography: hom, rows: SQUARES, cols: SQUARES, boardSquares: SQUARES,
    colours: buildChannelMatchers(channels),
    recognizer: new ColourRecognizer(read.minFilledFraction, channelPriority(channels), achromatic),
    samplesPerAxis: read.samplesPerAxis, dtMs: 33,
    ...(mode === 'board' ? { reference, prototypes } : {}),
  };
}

// ---- scenarios ----
function allColours(offCentre: boolean, seed: number): CounterSpec[] {
  const r = rng(seed);
  const used = new Set<string>();
  const out: CounterSpec[] = [];
  for (const name of NAMES) {
    for (let k = 0; k < 2; k++) {
      let row = 0; let col = 0;
      do { row = Math.floor(r() * SQUARES); col = Math.floor(r() * SQUARES); } while (used.has(`${row},${col}`));
      used.add(`${row},${col}`);
      out.push({
        row, col, rgb: COUNTERS[name],
        du: offCentre ? (r() - 0.5) * 0.6 : 0, dv: offCentre ? (r() - 0.5) * 0.6 : 0,
        radius: 0.28 + r() * 0.06,
      });
    }
  }
  return out;
}
const nameOf = (rgb: readonly number[]): string => NAMES.find((n) => COUNTERS[n] === rgb) ?? '?';

const SCENARIOS: { name: string; counters: CounterSpec[] }[] = [
  { name: 'empty board', counters: [] },
  { name: 'every colour, centred', counters: allColours(false, 7) },
  { name: 'every colour, off-centre', counters: allColours(true, 11) },
];

const PERTURBS: { name: string; p: Perturb }[] = [
  { name: 'as learnt', p: {} },
  { name: 'darker (exposure 0.7)', p: { exposure: 0.7 } },
  { name: 'brighter (exposure 1.3)', p: { exposure: 1.3 } },
  { name: 'warm light', p: { whiteBalance: [1.12, 1, 0.82] } },
  { name: 'cool light', p: { whiteBalance: [0.88, 1, 1.15] } },
  { name: 'shadow across', p: { shadow: { angle: 0.6, offset: 0.7, depth: 0.45, softness: 0.4 } } },
  { name: 'hand over board', p: { hand: { u: 0.55, v: 0.62, radius: 0.12 } } },
  { name: 'glossy counters', p: {} },
];

interface Score { tp: number; fp: number; fn: number; wrongColour: number; flips: number; cells: number }

function run(mode: 'bands' | 'board', scenario: typeof SCENARIOS[number], perturb: typeof PERTURBS[number], frames: number): Score {
  const reader = new BoardPixelReader();
  const opts = options(mode);
  const counters = perturb.name === 'glossy counters'
    ? scenario.counters.map((c) => ({ ...c, specular: 0.8 }))
    : scenario.counters;
  const truth = new Map<string, string>();
  for (const c of counters) truth.set(`${c.row},${c.col}`, nameOf(c.rgb));
  const hand = perturb.p.hand;
  const occluded = (row: number, col: number): boolean => !!hand
    && Math.hypot((col + 0.5) / SQUARES - hand.u, ((row + 0.5) / SQUARES - hand.v) * 0.8) < hand.radius + 0.07;
  const score: Score = { tp: 0, fp: 0, fn: 0, wrongColour: 0, flips: 0, cells: 0 };
  let prev: Map<string, string> | null = null;
  for (let f = 0; f < frames; f++) {
    const spec: RenderSpec = {
      width: W, height: H, corners, counters, seed: 1000 + f * 7, perturb: { ...base, ...perturb.p },
    };
    const readings = reader.read(downsample(renderBoard(spec)), opts);
    const now = new Map<string, string>();
    for (const r of readings) if (r.occupied && r.colour) now.set(`${r.row},${r.col}`, r.colour);
    if (prev) {
      for (const k of new Set([...prev.keys(), ...now.keys()])) if (prev.get(k) !== now.get(k)) score.flips++;
    }
    prev = now;
    if (f < frames - 1) continue; // accuracy is judged on the last frame, once smoothing has settled
    for (let row = 0; row < SQUARES; row++) {
      for (let col = 0; col < SQUARES; col++) {
        if (occluded(row, col)) continue;
        score.cells++;
        const k = `${row},${col}`;
        const t = truth.get(k);
        const got = now.get(k);
        if (t && got) { score.tp++; if (got !== t) score.wrongColour++; }
        else if (t && !got) { score.fn++; if (process.env.BENCH_MISS) { const c = counters.find((x) => x.row === row && x.col === col)!; const r = readings.find((x) => x.row === row && x.col === col)!; console.log('MISS', mode, perturb.name, t, row, col, 'du', c.du?.toFixed(2), 'dv', c.dv?.toFixed(2), 'rad', c.radius?.toFixed(2), JSON.stringify(r.fractions)); } }
        else if (!t && got) score.fp++;
      }
    }
  }
  return score;
}

function table(frames: number, scenarios = SCENARIOS, perturbs = PERTURBS) {
  const rows: Record<string, string | number>[] = [];
  const totals: Record<'bands' | 'board', Score> = {
    bands: { tp: 0, fp: 0, fn: 0, wrongColour: 0, flips: 0, cells: 0 },
    board: { tp: 0, fp: 0, fn: 0, wrongColour: 0, flips: 0, cells: 0 },
  };
  for (const s of scenarios) {
    for (const p of perturbs) {
      const row: Record<string, string | number> = { scenario: s.name, light: p.name };
      for (const mode of ['bands', 'board'] as const) {
        const sc = run(mode, s, p, frames);
        const t = totals[mode];
        t.tp += sc.tp; t.fp += sc.fp; t.fn += sc.fn; t.wrongColour += sc.wrongColour; t.flips += sc.flips; t.cells += sc.cells;
        row[`${mode} missed`] = sc.fn;
        row[`${mode} phantom`] = sc.fp;
        row[`${mode} wrong colour`] = sc.wrongColour;
        row[`${mode} flicker`] = sc.flips;
      }
      rows.push(row);
    }
  }
  return { rows, totals };
}

const summary = (s: Score) => ({
  recall: s.tp / Math.max(1, s.tp + s.fn),
  precision: s.tp / Math.max(1, s.tp + s.fp),
  colour: (s.tp - s.wrongColour) / Math.max(1, s.tp),
  phantoms: s.fp,
  flicker: s.flips,
});

describe.skipIf(!process.env.BENCH)('detection benchmark (full)', () => {
  it('prints the table', () => {
    const { rows, totals } = table(5);
    console.table(rows);
    console.table({ bands: summary(totals.bands), board: summary(totals.board) });
  }, 600_000);
});

describe('detection: the board-referenced reader holds up', () => {
  it('finds counters and invents none, as learnt and when the light changes', () => {
    const { totals } = table(3, SCENARIOS.slice(0, 2), [PERTURBS[0], PERTURBS[1], PERTURBS[3]]);
    const b = summary(totals.board);
    expect(b.phantoms).toBe(0);
    expect(b.recall).toBeGreaterThanOrEqual(0.95);
    expect(b.colour).toBeGreaterThanOrEqual(0.95);
  }, 120_000);
});
