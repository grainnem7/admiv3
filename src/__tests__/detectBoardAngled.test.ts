import { describe, it, expect } from 'vitest';
import { detectBoard } from '../tracking/boardDetect/detectBoard';
import { computeHomography, applyHomography, UNIT_SQUARE, type Point } from '../utils/homography';

/**
 * A board seen from an angle, rendered through a real perspective mapping.
 *
 * Every other detection test renders the board square-on and axis-aligned, which is how a
 * whole class of failure stayed invisible: the lattice refit silently fell back to a
 * parallelogram (an affine map, no perspective), and square-on that is nearly right. On a
 * camera looking down at a board on a table it is not, and the corners came back covering
 * a fraction of the board.
 */
const W = 320;
const H = 240;
const LIGHT: [number, number, number] = [214, 203, 180];
const DARK: [number, number, number] = [116, 86, 58];
const DESK: [number, number, number] = [152, 112, 74];

function render(corners: Point[], squares = 8): Uint8ClampedArray {
  const toBoard = computeHomography(corners, UNIT_SQUARE);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const b = applyHomography(toBoard, { x: x + 0.5, y: y + 0.5 });
      let rgb = DESK;
      if (b.x >= 0 && b.x < 1 && b.y >= 0 && b.y < 1) {
        const sx = Math.floor(b.x * squares);
        const sy = Math.floor(b.y * squares);
        rgb = (sx + sy) % 2 === 0 ? LIGHT : DARK;
      }
      const i = (y * W + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  }
  return data;
}

/** Corners in pixels, then as fractions of the frame, for comparing with a detection. */
const asFraction = (p: Point): Point => ({ x: p.x / W, y: p.y / H });

/** How far the worst corner is out, as a fraction of the frame. */
function worstCornerError(got: readonly Point[], want: readonly Point[]): number {
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    worst = Math.max(worst, Math.hypot(got[i].x - want[i].x, got[i].y - want[i].y));
  }
  return worst;
}

describe('a board seen from an angle', () => {
  // Roughly a webcam on a stand looking down at a board on a table: the far edge is
  // noticeably shorter than the near one, and the whole board is skewed.
  const TILTED: Point[] = [
    { x: 78, y: 40 }, { x: 250, y: 58 }, { x: 292, y: 205 }, { x: 30, y: 178 },
  ];

  it('puts the corners on the board, not on a piece of it', () => {
    const out = detectBoard(render(TILTED), W, H);
    expect(out.corners).toBeDefined();
    const want = TILTED.map(asFraction);
    // Within 4% of the frame — close enough that the player nudges rather than re-taps.
    expect(worstCornerError(out.corners!, want)).toBeLessThan(0.04);
    expect(out.squares).toBe(8);
  });

  it('covers the whole board, not a corner of it', () => {
    // The affine fallback's signature: a confident-looking quad over a fraction of the
    // board. Comparing areas catches that even when each corner is "not far" in absolute
    // terms.
    const out = detectBoard(render(TILTED), W, H);
    const area = (q: readonly Point[]): number => Math.abs(
      (q[0].x * q[1].y - q[1].x * q[0].y) + (q[1].x * q[2].y - q[2].x * q[1].y)
      + (q[2].x * q[3].y - q[3].x * q[2].y) + (q[3].x * q[0].y - q[0].x * q[3].y),
    ) / 2;
    const ratio = area(out.corners!) / area(TILTED.map(asFraction));
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.15);
  });

  it('still manages a steeper angle than anyone should need', () => {
    const steep: Point[] = [
      { x: 96, y: 34 }, { x: 226, y: 62 }, { x: 300, y: 210 }, { x: 18, y: 160 },
    ];
    const out = detectBoard(render(steep), W, H);
    expect(out.corners).toBeDefined();
    expect(worstCornerError(out.corners!, steep.map(asFraction))).toBeLessThan(0.06);
  });

  it('never claims to be sure about a 10 x 10 board it cannot resolve', () => {
    // KNOWN LIMIT, not a claim that this works: the detector reads a 320px-wide working
    // image, so a 10 x 10 board seen at an angle has squares about 16px across at the
    // near edge and fewer further away — too few for the crossing detector to be certain.
    // Square-on it is fine (see detectBoard.test.ts). What matters here is that it does
    // not confidently hand back the WRONG size: the player is asked to check.
    const out = detectBoard(render(TILTED, 10), W, H);
    expect(out.status).not.toBe('high');
  });

  it('a chequered thing beside the board does not destroy its confidence', () => {
    // Verified failure before this: one extra crossing a few squares away — a tiled
    // splashback, a gingham cloth, a window blind — took an 8 x 8 detection from
    // "Found a board" to "I'm not sure this is right", because the score was penalised by
    // the FULL span of the lattice and the counted block was anchored at its extreme.
    const clean = detectBoard(render(TILTED), W, H);
    const data = render(TILTED);
    // A small dark square out on the desk, well clear of the board (whose top-left
    // corner is at x 78, y 40).
    for (let y = 3; y < 15; y++) {
      for (let x = 3; x < 15; x++) {
        const i = (y * W + x) * 4;
        data[i] = 40; data[i + 1] = 34; data[i + 2] = 28;
      }
    }
    const withStray = detectBoard(data, W, H);
    expect(withStray.status).toBe(clean.status);
    expect(withStray.squares).toBe(8);
    expect(withStray.metrics.coverage).toBeGreaterThan(clean.metrics.coverage * 0.8);
  });
});
