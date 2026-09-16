import { describe, it, expect } from 'vitest';
import { fitLattices, invert, LATTICE_TOLERANCE } from '../tracking/boardDetect/lattice';
import { findXCorners } from '../tracking/boardDetect/xCorners';
import { toGrayDownscaled } from '../tracking/boardDetect/gray';
import { applyHomography, computeHomography, UNIT_SQUARE } from '../utils/homography';
import { scene, counter } from './helpers/syntheticBoard';
import type { XCorner } from '../tracking/boardDetect/xCorners';

const BOX = { x: 0.15, y: 0.1, w: 0.7, h: 0.8 };
const board = (over = {}) => scene({ width: 320, height: 240, boardBox: BOX, squares: 8, ...over });
const cornersOf = (frame: { data: Uint8ClampedArray; width: number; height: number }): XCorner[] =>
  findXCorners(toGrayDownscaled(frame.data, frame.width, frame.height));

describe('invert', () => {
  it('round-trips a point through a homography and back', () => {
    const h = computeHomography(UNIT_SQUARE, [
      { x: 10, y: 20 }, { x: 110, y: 15 }, { x: 120, y: 130 }, { x: 5, y: 120 },
    ]);
    const inv = invert(h)!;
    const p = applyHomography(h, { x: 0.3, y: 0.7 });
    const back = applyHomography(inv, p);
    expect(back.x).toBeCloseTo(0.3, 6);
    expect(back.y).toBeCloseTo(0.7, 6);
  });

  it('refuses a singular matrix rather than returning nonsense', () => {
    expect(invert([1, 2, 3, 2, 4, 6, 3, 6, 9])).toBeNull();
  });
});

describe('fitLattices', () => {
  it('covers the whole board: a 9 × 9 grid of crossings on an 8 × 8 board', () => {
    const [best] = fitLattices(cornersOf(board()));
    expect(best).toBeDefined();
    const spanI = Math.max(...best.nodes.map((n) => n.i)) - Math.min(...best.nodes.map((n) => n.i));
    const spanJ = Math.max(...best.nodes.map((n) => n.j)) - Math.min(...best.nodes.map((n) => n.j));
    expect(spanI).toBe(8);
    expect(spanJ).toBe(8);
    expect(best.nodes.length).toBeGreaterThanOrEqual(70);
    expect(best.rms).toBeLessThan(LATTICE_TOLERANCE);
  });

  it('its indices step exactly one square at a time', () => {
    const [best] = fitLattices(cornersOf(board()));
    // The picture is not square, so a square is 28 px across and 24 px down; which axis
    // the lattice calls "i" depends on the seed, and either is correct.
    const squareW = (320 * BOX.w) / 8;
    const squareH = (240 * BOX.h) / 8;
    const a = best.nodes.find((n) => best.nodes.some((m) => m.i === n.i + 1 && m.j === n.j))!;
    const b = best.nodes.find((n) => n.i === a.i + 1 && n.j === a.j)!;
    const step = Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y);
    expect(Math.min(Math.abs(step - squareW), Math.abs(step - squareH))).toBeLessThan(2);
  });

  it('still fits with counters on the board', () => {
    const withCounters = board({
      shapes: [counter(0.3, 0.3, 0.1), counter(0.6, 0.5, 0.1), counter(0.8, 0.2, 0.1)],
    });
    const [best] = fitLattices(cornersOf(withCounters));
    expect(best).toBeDefined();
    expect(best.nodes.length).toBeGreaterThanOrEqual(20);
  });

  it('finds nothing on a plain surface', () => {
    const flat = scene({ width: 160, height: 120, boardBox: { x: 0, y: 0, w: 0, h: 0 } });
    expect(fitLattices(cornersOf(flat))).toEqual([]);
  });

  it('returns at most the number asked for, best first', () => {
    const lattices = fitLattices(cornersOf(board()), 2);
    expect(lattices.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < lattices.length; i++) {
      expect(lattices[i - 1].score).toBeGreaterThanOrEqual(lattices[i].score);
    }
  });
});
