import { describe, it, expect } from 'vitest';
import { toGrayDownscaled, gaussianBlur, sampleGray, WORKING_WIDTH } from '../tracking/boardDetect/gray';
import { findXCorners } from '../tracking/boardDetect/xCorners';
import { scene, counter } from './helpers/syntheticBoard';

const BOX = { x: 0.15, y: 0.1, w: 0.7, h: 0.8 };

/** A big enough picture that an 8 × 8 board has several pixels per square. */
const board = (over = {}) => scene({
  width: 320, height: 240, boardBox: BOX, squares: 8, ...over,
});

const grayOf = (frame: { data: Uint8ClampedArray; width: number; height: number }) =>
  toGrayDownscaled(frame.data, frame.width, frame.height);

describe('toGrayDownscaled', () => {
  it('reduces to the working width and keeps the aspect ratio', () => {
    const big = scene({ width: 1280, height: 720 });
    const g = toGrayDownscaled(big.data, big.width, big.height);
    expect(g.width).toBe(WORKING_WIDTH);
    expect(g.height).toBe(180);
    expect(g.scale).toBeCloseTo(4, 6);
  });

  it('leaves a picture that is already small alone', () => {
    const small = scene({ width: 80, height: 60 });
    const g = toGrayDownscaled(small.data, small.width, small.height);
    expect(g.width).toBe(80);
    expect(g.scale).toBe(1);
  });

  it('light squares come out lighter than dark ones', () => {
    const g = grayOf(board());
    const light = sampleGray(g, 320 * (BOX.x + BOX.w / 16), 240 * (BOX.y + BOX.h / 16));
    const dark = sampleGray(g, 320 * (BOX.x + BOX.w * 3 / 16), 240 * (BOX.y + BOX.h / 16));
    expect(light).toBeGreaterThan(dark + 20);
  });
});

describe('gaussianBlur', () => {
  it('keeps the overall brightness and smooths a hard edge', () => {
    const g = grayOf(board());
    const b = gaussianBlur(g, 1.5);
    const mean = (img: typeof g): number => img.data.reduce((a, v) => a + v, 0) / img.data.length;
    expect(mean(b)).toBeCloseTo(mean(g), 0);
    expect(b.width).toBe(g.width);
  });
});

describe('findXCorners', () => {
  it('finds the crossings of an 8 × 8 board, and they sit inside it', () => {
    const corners = findXCorners(grayOf(board()));
    // An 8 × 8 board has 7 × 7 interior crossings; detection need not be perfect, but it
    // must find most of them.
    expect(corners.length).toBeGreaterThanOrEqual(30);
    for (const c of corners) {
      expect(c.x).toBeGreaterThan(320 * BOX.x - 6);
      expect(c.x).toBeLessThan(320 * (BOX.x + BOX.w) + 6);
      expect(c.y).toBeGreaterThan(240 * BOX.y - 6);
      expect(c.y).toBeLessThan(240 * (BOX.y + BOX.h) + 6);
    }
  });

  it('a crossing lands where the squares actually meet', () => {
    const corners = findXCorners(grayOf(board()));
    // The first interior crossing of the board, in picture pixels.
    const cx = 320 * (BOX.x + BOX.w / 8);
    const cy = 240 * (BOX.y + BOX.h / 8);
    const nearest = corners.reduce((best, c) =>
      (Math.hypot(c.x - cx, c.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? c : best));
    expect(Math.hypot(nearest.x - cx, nearest.y - cy)).toBeLessThan(2.5);
  });

  it('finds nothing on a plain surface', () => {
    const flat = scene({ width: 160, height: 120, boardBox: { x: 0, y: 0, w: 0, h: 0 } });
    expect(findXCorners(grayOf(flat))).toHaveLength(0);
  });

  it('counters on the board do not become crossings', () => {
    const withCounters = board({ shapes: [counter(0.3, 0.3, 0.12), counter(0.7, 0.6, 0.12)] });
    const corners = findXCorners(grayOf(withCounters));
    const counterCentre = { x: 320 * (BOX.x + 0.3 * BOX.w), y: 240 * (BOX.y + 0.3 * BOX.h) };
    const onCounter = corners.filter(
      (c) => Math.hypot(c.x - counterCentre.x, c.y - counterCentre.y) < 6,
    );
    expect(onCounter).toHaveLength(0);
  });

  it('never returns more than the cap', () => {
    const corners = findXCorners(grayOf(board()), { maxCorners: 10 });
    expect(corners.length).toBeLessThanOrEqual(10);
    // …and the cap keeps the strongest.
    for (let i = 1; i < corners.length; i++) {
      expect(corners[i - 1].score).toBeGreaterThanOrEqual(corners[i].score);
    }
  });
});
