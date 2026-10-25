import { describe, it, expect } from 'vitest';
import { learnBoardReference, type BoardReference } from '../tracking/boardReference/boardReference';
import { findCounterBlobs } from '../tracking/boardReference/findCounters';
import { coloursFromBlobs } from '../tracking/boardColourDetect/detectColours';
import { angledCorners, boardHomography, COUNTERS, renderBoard, type CounterSpec, type Perturb, type RGB } from './helpers/boardRenderer';

// Seen on the rig: "Find colours" offered 40 + 10 + … "counters" on bare golden and pale
// walnut, and split three teal counters into two colours.
const W = 320;
const H = 180;
const corners = angledCorners(W, H);
const hom = boardHomography({ corners });
const base: Perturb = { noise: 3, chromaBlur: 1 };
const ref = learnBoardReference(
  Array.from({ length: 6 }, (_, i) => renderBoard({ width: W, height: H, corners, seed: 40 + i, perturb: base })),
  hom, 8,
) as BoardReference;

const TEAL: RGB = [30, 170, 180];
const counters: CounterSpec[] = [
  { row: 2, col: 1, rgb: TEAL }, { row: 4, col: 2, rgb: TEAL, du: 0.15 }, { row: 5, col: 6, rgb: TEAL, dv: -0.1 },
  { row: 3, col: 4, rgb: COUNTERS.purple }, { row: 6, col: 1, rgb: COUNTERS.red }, { row: 6, col: 4, rgb: COUNTERS.blue },
  { row: 1, col: 6, rgb: COUNTERS.yellow },
];

function find(perturb: Perturb) {
  const frames = Array.from({ length: 4 }, (_, i) => renderBoard({ width: W, height: H, corners, counters, seed: 90 + i, perturb: { ...base, ...perturb } }));
  return findCounterBlobs(frames, hom, ref, 1);
}

describe('Find colours against the learnt board', () => {
  it('an empty board offers nothing — not even after the camera has shifted its light', () => {
    for (const perturb of [{}, { exposure: 1.25 }, { exposure: 0.8, whiteBalance: [1.1, 1, 0.85] as RGB }]) {
      const frames = Array.from({ length: 4 }, (_, i) => renderBoard({ width: W, height: H, corners, seed: 70 + i, perturb: { ...base, ...perturb } }));
      expect(findCounterBlobs(frames, hom, ref, 1)).toHaveLength(0);
    }
  });

  for (const [name, perturb] of [['as learnt', {}], ['brighter and warmer since learning', { exposure: 1.2, whiteBalance: [1.1, 1, 0.85] as RGB }]] as const) {
    it(`finds exactly the counters, on the right squares (${name})`, () => {
      const blobs = find(perturb);
      expect(blobs).toHaveLength(counters.length);
      const squares = new Set(blobs.map((b) => `${b.row},${b.col}`));
      for (const c of counters) expect(squares.has(`${c.row},${c.col}`)).toBe(true);
    });

    it(`groups the three teal counters as one colour, and the rest each as their own (${name})`, () => {
      const found = coloursFromBlobs(find(perturb), []);
      expect(found.ok).toBe(true);
      if (!found.ok) return;
      expect(found.colours).toHaveLength(5);
      expect(found.colours[0].counters).toBe(3);
    });
  }
});
