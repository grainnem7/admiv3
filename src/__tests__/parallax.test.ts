import { describe, it, expect } from 'vitest';
import { estimateFocal, liftHomography } from '../tracking/parallax';
import { applyHomography, computeHomography, UNIT_SQUARE } from '../utils/homography';

/**
 * A camera we know everything about: focal length, where it is, which way it looks. A
 * point (x, y, z) on or above the board (board units; z towards the camera) is projected
 * into its 1280 × 720 picture. The board's four corners give the mapping the app has.
 */
const W = 1280;
const H = 720;
function camera(f: number, tiltDeg: number, panDeg: number, dist: number) {
  const t = (tiltDeg * Math.PI) / 180;
  const p = (panDeg * Math.PI) / 180;
  // Look at the board's centre from in front and above.
  const target = [0.5, 0.5, 0];
  const eye = [0.5 + dist * Math.sin(p) * Math.cos(t), 0.5 + dist * Math.cos(p) * Math.cos(t), dist * Math.sin(t)];
  const fwd = target.map((v, i) => v - eye[i]);
  const n = (v: number[]) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const z = n(fwd);
  const right = n([z[1] * 1 - z[2] * 0, z[2] * 0 - z[0] * 1, 0]); // z × up(0,0,1)
  const down = [z[1] * right[2] - z[2] * right[1], z[2] * right[0] - z[0] * right[2], z[0] * right[1] - z[1] * right[0]];
  return (x: number, y: number, h: number) => {
    const d = [x - eye[0], y - eye[1], h - eye[2]];
    const cx = d[0] * right[0] + d[1] * right[1] + d[2] * right[2];
    const cy = d[0] * down[0] + d[1] * down[1] + d[2] * down[2];
    const cz = d[0] * z[0] + d[1] * z[1] + d[2] * z[2];
    return { x: W / 2 + (f * cx) / cz, y: H / 2 + (f * cy) / cz };
  };
}

describe('the plane at counter height, from the board\'s four corners', () => {
  for (const [name, f, tilt, pan] of [['looking down at 35°', 1000, 35, 0], ['steeper, from the side', 900, 55, 25], ['shallow', 1100, 25, -10]] as const) {
    it(`${name}: finds the lens and where counter tops appear`, () => {
      const project = camera(f, tilt, pan, 1.6);
      const corners = UNIT_SQUARE.map((c) => project(c.x, c.y, 0));
      const hBoard = computeHomography(UNIT_SQUARE, corners);
      expect(Math.abs(estimateFocal(hBoard, W, H) - f) / f).toBeLessThan(0.03);
      const lift = 0.025; // a counter a fifth of a square tall on an 8-square board
      const hTop = liftHomography(hBoard, W, H, lift);
      for (const [x, y] of [[0.5, 0.5], [0.1, 0.9], [0.9, 0.2], [0.44, 0.56]]) {
        const want = project(x, y, lift);
        const got = applyHomography(hTop, { x, y });
        expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1.5); // pixels
      }
    });
  }

  it('the same in a mirrored picture', () => {
    const project = camera(1000, 40, 15, 1.6);
    const mirror = (q: { x: number; y: number }) => ({ x: W - q.x, y: q.y });
    const hBoard = computeHomography(UNIT_SQUARE, UNIT_SQUARE.map((c) => mirror(project(c.x, c.y, 0))));
    const hTop = liftHomography(hBoard, W, H, 0.025);
    for (const [x, y] of [[0.5, 0.5], [0.2, 0.8]]) {
      const want = mirror(project(x, y, 0.025));
      const got = applyHomography(hTop, { x, y });
      expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1.5);
    }
  });

  it('at height 0 it is the board itself', () => {
    const project = camera(1000, 35, 0, 1.6);
    const hBoard = computeHomography(UNIT_SQUARE, UNIT_SQUARE.map((c) => project(c.x, c.y, 0)));
    expect(liftHomography(hBoard, W, H, 0)).toBe(hBoard);
  });

  it('a counter top appears further away than its base, as the camera sees it', () => {
    const project = camera(1000, 35, 0, 1.6);
    const hBoard = computeHomography(UNIT_SQUARE, UNIT_SQUARE.map((c) => project(c.x, c.y, 0)));
    const base = applyHomography(hBoard, { x: 0.5, y: 0.5 });
    const top = applyHomography(liftHomography(hBoard, W, H, 0.025), { x: 0.5, y: 0.5 });
    // Camera in front of the board (towards y = 1): the top shows higher in the picture.
    expect(top.y).toBeLessThan(base.y - 3);
  });
});
