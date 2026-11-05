import { describe, it, expect } from 'vitest';
import {
  cellFeatures, learnFromStart, readOccupancy, slantOf, squareAt, squareIndex, occupancyText, occupancyFromText,
  START_OCCUPANCY, SLANT_LIMIT, type Occupancy, type BoardCorners, type WhiteAt,
} from '../tracking/chess/chessOccupancy';
import { OccupancySettler } from '../tracking/chess/occupancySettler';

/** A drawn board seen from above: wood squares, round piece tops, a little noise. */
function drawBoard(occ: Occupancy, whiteAt: WhiteAt, corners: BoardCorners, w = 320, h = 240, seed = 1): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  const rnd = (): number => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // Inverse bilinear is enough for a near-rectangle: find u,v by the corners' axes.
  const [tl, tr, , bl] = corners.map((c) => ({ x: c.x * w, y: c.y * h }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ux = (x - tl.x) / (tr.x - tl.x);
    const vy = (y - tl.y) / (bl.y - tl.y);
    let rgb = [60, 90, 60]; // table
    if (ux >= 0 && ux < 1 && vy >= 0 && vy < 1) {
      const col = Math.floor(ux * 8); const row = Math.floor(vy * 8);
      const sq = squareAt(row, col, whiteAt);
      const dark = ((sq % 8) + Math.floor(sq / 8)) % 2 === 0;
      rgb = dark ? [120, 80, 50] : [225, 200, 160];
      const cx = (col + 0.5) / 8; const cy = (row + 0.5) / 8;
      const r = Math.hypot(ux - cx, vy - cy) * 8;
      if (occ[sq] !== 'empty' && r < 0.3) rgb = occ[sq] === 'white' ? [245, 240, 230] : [30, 28, 26];
    }
    const k = (y * w + x) * 4;
    const n = (rnd() - 0.5) * 12;
    data[k] = rgb[0] + n; data[k + 1] = rgb[1] + n; data[k + 2] = rgb[2] + n; data[k + 3] = 255;
  }
  return { data, width: w, height: h };
}

const CORNERS: BoardCorners = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.9 }];

const AFTER_E4_E5_NF3 = occupancyFromText(`
BBBBBBBB
BBBB.BBB
........
....B...
....W...
.....W..
WWWW.WWW
WWWWWW.W`);

describe('reading a chess board', () => {
  it('squares and text round trip', () => {
    expect(squareIndex('a1')).toBe(0);
    expect(squareIndex('h8')).toBe(63);
    expect(occupancyFromText(occupancyText(START_OCCUPANCY))).toEqual(START_OCCUPANCY);
    expect(squareAt(7, 0, 'bottom')).toBe(squareIndex('a1'));
    expect(squareAt(0, 7, 'top')).toBe(squareIndex('a1'));
  });

  for (const whiteAt of ['bottom', 'top', 'left', 'right'] as const) {
    it(`learns the start position with White at the ${whiteAt}, then reads a later position`, () => {
      const start = cellFeatures(drawBoard(START_OCCUPANCY, whiteAt, CORNERS), CORNERS);
      const model = learnFromStart(start);
      expect(model?.whiteAt).toBe(whiteAt);
      expect(occupancyText(readOccupancy(start, model!))).toBe(occupancyText(START_OCCUPANCY));
      const later = cellFeatures(drawBoard(AFTER_E4_E5_NF3, whiteAt, CORNERS, 320, 240, 7), CORNERS);
      expect(occupancyText(readOccupancy(later, model!))).toBe(occupancyText(AFTER_E4_E5_NF3));
    });
  }

  it('says when the camera is too slanted', () => {
    expect(slantOf(CORNERS, 320, 240)).toBeCloseTo(1, 5);
    const slanted: BoardCorners = [{ x: 0.35, y: 0.1 }, { x: 0.65, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    expect(slantOf(slanted, 320, 240)).toBeGreaterThan(SLANT_LIMIT);
  });
});

describe('the settle window', () => {
  it('believes a reading only after it holds, and never while a hand is over the board', () => {
    const s = new OccupancySettler({ settleMs: 500, flickerSquares: 0 });
    expect(s.step(START_OCCUPANCY, false, 0)).toBeNull();
    expect(s.step(START_OCCUPANCY, false, 499)).toBeNull();
    expect(s.step(START_OCCUPANCY, false, 500)).toEqual(START_OCCUPANCY);
    expect(s.step(START_OCCUPANCY, false, 900)).toBeNull(); // no change, nothing new
    // A hand reaches in: nothing is believed, and the wait starts again after it lifts.
    expect(s.step(AFTER_E4_E5_NF3, true, 1000)).toBeNull();
    expect(s.step(AFTER_E4_E5_NF3, false, 1600)).toBeNull();
    expect(s.step(AFTER_E4_E5_NF3, false, 2000)).toBeNull();
    expect(s.step(AFTER_E4_E5_NF3, false, 2100)).toEqual(AFTER_E4_E5_NF3);
  });
});
