import { describe, it, expect } from 'vitest';
import {
  counterAt, differsFromBoard, estimateGain, learnBoardReference, loadBoardReference, nearestCounter,
  orientReference, orientSquareGrid, storeBoardReference, type BoardReference,
} from '../tracking/boardReference/boardReference';
import { flipCorners, rotateCorners } from '../tracking/boardDetect/orientation';
import { computeHomography, UNIT_SQUARE } from '../utils/homography';
import { detectionSetup } from '../tracking/boardReference/detectionSetup';
import type { ColourChannel } from '../tracking/boardColours';
import { angledCorners, boardHomography, COUNTERS, MAPLE, renderBoard, WALNUT } from './helpers/boardRenderer';

const W = 320;
const H = 180;
const corners = angledCorners(W, H);
const hom = boardHomography({ corners });
const ref = learnBoardReference(
  Array.from({ length: 4 }, (_, i) => renderBoard({ width: W, height: H, corners, seed: i, perturb: { noise: 3 } })),
  hom, 8,
) as BoardReference;

/** The reference pixel at the centre of a square. */
const centreOf = (row: number, col: number): number => {
  const y = row * 8 + 4; const x = col * 8 + 4;
  return y * ref.size + x;
};
const protos = Object.keys(COUNTERS).map((id) => ({ id, rgb: COUNTERS[id] }));

describe('the learnt board', () => {
  it('is learnt from the frames, square by square, in board order', () => {
    expect(ref.squares).toBe(8);
    expect(ref.size).toBe(64);
    // (0,0) is maple and (0,1) walnut on this board.
    const k0 = centreOf(0, 0); const k1 = centreOf(0, 1);
    expect(Math.abs(ref.mean[k0 * 3] - MAPLE[0])).toBeLessThan(30);
    expect(Math.abs(ref.mean[k1 * 3] - WALNUT[0])).toBeLessThan(25);
  });

  it('survives being saved and loaded', () => {
    const back = loadBoardReference(storeBoardReference(ref))!;
    expect(back.size).toBe(ref.size);
    for (const k of [0, 100, 2000, 4095]) {
      expect(Math.abs(back.mean[k * 3] - ref.mean[k * 3])).toBeLessThanOrEqual(0.5);
      expect(Math.abs(back.spreadL[k] - ref.spreadL[k])).toBeLessThan(0.01);
    }
    expect(loadBoardReference({ squares: 8, size: 64, mean: 'AAA', spreadL: '', spreadC: '' })).toBeNull();
  });
});

describe('the light, from the board itself', () => {
  it('reads an exposure and white-balance change', () => {
    const refPx = [100, 80, 60, 200, 190, 170, 120, 90, 70];
    const obs: number[] = [];
    for (let i = 0; i < 40; i++) obs.push(...refPx.map((v, j) => v * [1.2, 1.1, 0.9][j % 3]));
    const g = estimateGain(obs, Array.from({ length: 40 }, () => refPx).flat());
    expect(g[0]).toBeCloseTo(1.2, 2);
    expect(g[1]).toBeCloseTo(1.1, 2);
    expect(g[2]).toBeCloseTo(0.9, 2);
  });

  it("is not fooled by counters covering part of the board", () => {
    const refPx = [150, 120, 90];
    const obs: number[] = [];
    const refs: number[] = [];
    for (let i = 0; i < 100; i++) {
      refs.push(...refPx);
      obs.push(...(i < 30 ? [40, 80, 200] : refPx)); // 30% covered by blue counters
    }
    const g = estimateGain(obs, refs);
    for (const v of g) expect(v).toBeCloseTo(1, 2);
  });
});

describe('is this the board?', () => {
  const maple = centreOf(0, 0);
  const walnut = centreOf(0, 1);
  const at = (k: number, f = 1): [number, number, number] =>
    [ref.mean[k * 3] * f, ref.mean[k * 3 + 1] * f, ref.mean[k * 3 + 2] * f];

  it('the board itself is the board, and so is the board in shadow', () => {
    expect(differsFromBoard(at(maple), ref, maple)).toBe(false);
    expect(differsFromBoard(at(walnut), ref, walnut)).toBe(false);
    expect(differsFromBoard(at(maple, 0.6), ref, maple)).toBe(false);
    expect(differsFromBoard(at(walnut, 0.6), ref, walnut)).toBe(false);
  });

  it('a counter is not the board — every colour, on both kinds of square', () => {
    for (const name of Object.keys(COUNTERS)) {
      if (name === 'white') continue; // white on maple: see the next test
      expect(counterAt(COUNTERS[name], ref, maple, protos), `${name} on maple`).toBe(name);
      if (name === 'black') continue;
      expect(counterAt(COUNTERS[name], ref, walnut, protos), `${name} on walnut`).toBe(name);
    }
  });

  it('white on maple and black on walnut — the hard pairs — are still found', () => {
    expect(counterAt(COUNTERS.white, ref, maple, protos)).toBe('white');
    expect(counterAt(COUNTERS.black, ref, walnut, protos)).toBe('black');
  });

  it('something that is no counter colour (a hand) counts for none', () => {
    expect(nearestCounter([205, 150, 125], protos.filter((p) => p.id !== 'orange' && p.id !== 'pink'))).toBeNull();
  });

  it('a hand counts for none, whatever its skin and whichever counters are in use', () => {
    // Skin sits within reach of yellow, pink, orange and white: before, a hand resting on an
    // empty board played notes. Pale to dark.
    for (const skin of [[232, 190, 172], [225, 172, 145], [205, 150, 125], [176, 122, 92], [130, 88, 64], [92, 62, 48]] as const) {
      expect(nearestCounter(skin, protos), `skin ${skin.join(',')}`).toBeNull();
    }
  });

  it('a counter as pale as skin (cream wood) is still found: that skin tone stands aside', () => {
    const cream = { id: 'cream', rgb: [226, 178, 150] as [number, number, number] };
    expect(nearestCounter([226, 178, 150], [...protos, cream])).toBe('cream');
  });
});

describe('which detector is used', () => {
  const channels: ColourChannel[] = [
    { id: 'c1', kind: 'hue', role: 'melody', swatch: '#c42a2e' },
    { id: 'c2', kind: 'black', role: 'drums', swatch: '#1a1a1e' },
  ];
  const stored = storeBoardReference(ref);

  it('against the board once it is learnt, with black marked as achromatic', () => {
    const d = detectionSetup({ counterDetection: 'board', boardReference: stored, boardSquares: 8, channels });
    expect(d.mode).toBe('board');
    expect(d.prototypes.map((p) => p.id)).toEqual(['c1', 'c2']);
    expect([...d.achromatic]).toEqual(['c2']);
  });

  it('says why it falls back to the colour ranges', () => {
    expect(detectionSetup({ counterDetection: 'board', boardReference: null, boardSquares: 8, channels }).reason).toMatch(/Learn the board/);
    expect(detectionSetup({ counterDetection: 'board', boardReference: stored, boardSquares: 10, channels }).reason).toMatch(/size has changed/);
    const old = detectionSetup({ counterDetection: 'bands', boardReference: stored, boardSquares: 8, channels });
    expect(old.mode).toBe('bands');
    expect(old.reason).toBeNull();
  });
});

describe('turning or flipping the board after it is learnt', () => {
  // The learnt board is stored in board order (start, high notes…). Turn the board — or
  // confirm its corners in another order — and that order changes: the learnt board has
  // to turn with it, or every square is compared with a different square and the board
  // fills with notes that aren't there.
  const frames = [0, 1].map((seed) => renderBoard({ width: W, height: H, corners, seed }));
  const learnt = learnBoardReference(frames, hom, 8)!;
  const orders = [
    ['a quarter turn', rotateCorners(corners, 1)],
    ['a half turn', rotateCorners(corners, 2)],
    ['three quarters', rotateCorners(corners, 3)],
    ['a flip', flipCorners(corners)],
    ['a flip and a turn', rotateCorners(flipCorners(corners), 1)],
  ] as const;

  for (const [name, turned] of orders) {
    it(`after ${name}, matches the board learnt that way round`, () => {
      const fresh = learnBoardReference(frames, computeHomography(UNIT_SQUARE, turned), 8)!;
      const oriented = orientReference(learnt, corners, turned);
      let worst = 0;
      for (let i = 0; i < fresh.mean.length; i++) worst = Math.max(worst, Math.abs(oriented.mean[i] - fresh.mean[i]));
      expect(worst).toBeLessThan(1);
      let worstSpread = 0;
      for (let i = 0; i < fresh.spreadL.length; i++) worstSpread = Math.max(worstSpread, Math.abs(oriented.spreadL[i] - fresh.spreadL[i]));
      expect(worstSpread).toBeLessThan(0.01);
    });
  }

  it('leaves it alone when the corners only moved a little (a nudged board)', () => {
    const nudged = corners.map((c) => ({ x: c.x + 3, y: c.y - 2 }));
    expect(orientReference(learnt, corners, nudged)).toBe(learnt);
    // Saved before corners were stored with it: as before.
    expect(orientReference(learnt, undefined, rotateCorners(corners, 1))).toBe(learnt);
  });

  it('turns the per-square colours the same way', () => {
    const grid = Array.from({ length: 4 * 3 }, (_, i) => i); // 2 × 2 squares, RGB each
    // A quarter turn: the new first square (start, high) is the old start, low notes.
    expect(orientSquareGrid(grid, 2, corners, rotateCorners(corners, 1)).slice(0, 3)).toEqual([6, 7, 8]);
  });

  it('is applied when the reader is set up', () => {
    const turned = rotateCorners(corners, 1);
    const channels: ColourChannel[] = [{ id: 'c1', kind: 'hue', role: 'melody', swatch: '#c42a2e' }];
    const d = detectionSetup({
      counterDetection: 'board', boardReference: { ...storeBoardReference(learnt), corners: [...corners] },
      boardSquares: 8, channels, corners: turned,
    });
    const fresh = learnBoardReference(frames, computeHomography(UNIT_SQUARE, turned), 8)!;
    expect(Math.abs(d.reference!.mean[0] - fresh.mean[0])).toBeLessThanOrEqual(1);
  });
});

describe('learning a board that is not all in the picture', () => {
  it('refuses, rather than reading the missing edge as counters for ever', () => {
    const low = corners.map((c) => ({ x: c.x, y: c.y + H * 0.1 })) as typeof corners;
    const f = renderBoard({ width: W, height: H, corners: low, seed: 1 });
    expect(learnBoardReference([f], boardHomography({ corners: low }), 8)).toBeNull();
  });
});
