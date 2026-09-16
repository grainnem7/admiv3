import { describe, it, expect } from 'vitest';
import {
  NUDGE_FINE, NUDGE_COARSE, nudgeCorner, cornerOrderForTaps, defaultInsetCorners, hitTestHandle,
  videoContentRect, boxToFrame, frameToBox, squareCentreToImage,
} from '../ui/screens/boardSequencer/cornerEditor';
import type { Corners } from '../tracking/boardDetect/orientation';
import { computeHomography, applyHomography, UNIT_SQUARE, cellCentreUnit } from '../utils/homography';

const sq: Corners = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

describe('nudgeCorner', () => {
  it('moves only the selected corner by exactly the step, clamped to [0,1]', () => {
    const n = nudgeCorner(sq, 2, 1, -1, NUDGE_COARSE);
    expect(n[2].x).toBeCloseTo(0.92, 10);
    expect(n[2].y).toBeCloseTo(0.88, 10);
    expect(n[0]).toEqual(sq[0]);
    expect(nudgeCorner(sq, 0, -100, 0, NUDGE_FINE)[0].x).toBe(0);
    const back = nudgeCorner(nudgeCorner(sq, 1, 1, 1, NUDGE_FINE), 1, -1, -1, NUDGE_FINE);
    expect(back[1].x).toBeCloseTo(0.9, 10);
  });
});

describe('cornerOrderForTaps', () => {
  it('keeps the tap order, so corner 1 is corner 1 everywhere', () => {
    // Rotating the taps meant the corner tapped FIRST was saved as corner 4, and every
    // handle was renamed the instant the fourth tap landed.
    expect(cornerOrderForTaps(sq)).toEqual(sq);
  });
  it('taps in prompt order give a homography whose start + low cell is at the start-low corner', () => {
    const saved = cornerOrderForTaps(sq)!;
    const h = computeHomography(UNIT_SQUARE, saved);
    const p = applyHomography(h, cellCentreUnit(3, 0, 4, 4));
    expect(p.x).toBeLessThan(0.5);
    expect(p.y).toBeGreaterThan(0.5);
  });
  it('rejects crossed and non-convex quads', () => {
    expect(cornerOrderForTaps([sq[3], sq[1], sq[0], sq[2]])).toBeNull(); // crossed
    expect(cornerOrderForTaps([sq[3], sq[0], { x: 0.4, y: 0.4 }, sq[2]])).toBeNull(); // dent
  });
});

describe('defaultInsetCorners / hitTestHandle', () => {
  it('insets 10% from each edge in saved order', () => {
    expect(defaultInsetCorners()).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }]);
  });
  it('hits the nearest handle within the radius', () => {
    expect(hitTestHandle(sq, { x: 0.12, y: 0.88 }, 0.05)).toBe(3);
    expect(hitTestHandle(sq, { x: 0.5, y: 0.5 }, 0.05)).toBeNull();
  });
});

describe('video content rect mapping', () => {
  it('16:9 video in a 4:3 box (contain) round-trips and rejects the letterbox bars', () => {
    const r = videoContentRect(400, 300, 1280, 720, 'contain');
    expect(r).toEqual({ x: 0, y: 37.5, w: 400, h: 225 });
    const f = boxToFrame(200, 150, r)!;
    expect(f).toEqual({ x: 0.5, y: 0.5 });
    expect(frameToBox(f, r)).toEqual({ x: 200, y: 150 });
    expect(boxToFrame(200, 10, r)).toBeNull();
  });
  it('4:3 video in a 16:9 box (contain) pillarboxes', () => {
    expect(videoContentRect(640, 360, 640, 480, 'contain')).toEqual({ x: 80, y: 0, w: 480, h: 360 });
  });
  it('fill uses the whole box', () => {
    expect(videoContentRect(640, 360, 640, 480, 'fill')).toEqual({ x: 0, y: 0, w: 640, h: 360 });
  });
});

describe('squareCentreToImage', () => {
  it('maps a board square centre through the corners', () => {
    const p = squareCentreToImage(sq, 8, 0, 0);
    expect(p.x).toBeCloseTo(0.15, 10);
    expect(p.y).toBeCloseTo(0.15, 10);
  });
});
