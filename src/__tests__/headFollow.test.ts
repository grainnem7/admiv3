import { describe, it, expect } from 'vitest';
import {
  headPoseFromLandmarks, followHead, headBounds, initialHeadFollow, NOSE, LEFT_EDGE, RIGHT_EDGE, BROW, CHIN,
} from '../tracking/cap/headFollow';

/** A face's five points that matter, placed by how much it is turned and tipped. */
function face(turn: number, tip: number, at = { x: 0.5, y: 0.5 }): { x: number; y: number }[] {
  const points = Array.from({ length: 478 }, () => ({ x: at.x, y: at.y }));
  points[LEFT_EDGE] = { x: at.x - 0.1, y: at.y };
  points[RIGHT_EDGE] = { x: at.x + 0.1, y: at.y };
  points[BROW] = { x: at.x, y: at.y - 0.12 };
  points[CHIN] = { x: at.x, y: at.y + 0.12 };
  // The nose stands out from the face: turning moves it across, tipping moves it up and down.
  points[NOSE] = { x: at.x + turn * 0.2, y: at.y + tip * 0.24 };
  return points;
}

describe('the way the head points, from the face', () => {
  it('looking straight ahead is the middle of both ways', () => {
    const p = headPoseFromLandmarks(face(0, 0), false)!;
    expect(p.x).toBeCloseTo(0.5, 5);
    expect(p.y).toBeCloseTo(0.5, 5);
  });

  it('turning moves it across, tipping down moves it down (as the hat moves in the picture)', () => {
    const right = headPoseFromLandmarks(face(0.15, 0), false)!;
    const down = headPoseFromLandmarks(face(0, 0.15), false)!;
    expect(right.x).toBeGreaterThan(0.6);
    expect(right.y).toBeCloseTo(0.5, 5);
    expect(down.y).toBeGreaterThan(0.6);
    expect(down.x).toBeCloseTo(0.5, 5);
  });

  it('a turn is not read as a nod, wherever the head is in the picture', () => {
    const p = headPoseFromLandmarks(face(0.15, 0, { x: 0.2, y: 0.7 }), false)!;
    expect(p.y).toBeCloseTo(0.5, 5);
  });

  it('mirrored the other way, a turn goes the other way', () => {
    expect(headPoseFromLandmarks(face(0.15, 0), true)!.x).toBeLessThan(0.4);
  });

  it('stays between 0 and 1, and no face is nothing', () => {
    const p = headPoseFromLandmarks(face(2, -2), false)!;
    expect(p.x).toBeLessThanOrEqual(1);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(headPoseFromLandmarks([], false)).toBeNull();
  });
});

describe('following the head, with the hat as backup', () => {
  const bounds = headBounds(null);
  const cap = (y: number) => ({ x: 0.5, y, area: 0.01 });

  it('face seen: the head is followed', () => {
    const r = followHead({ x: 0.7, y: 0.4 }, cap(0.3), initialHeadFollow(), bounds);
    expect(r.source).toBe('head');
    expect(r.sighting).toMatchObject({ x: 0.7, y: 0.4 });
  });

  it('face lost and the hat lower than when the face was last seen: a bow, so the bottom of the range', () => {
    let st = followHead({ x: 0.6, y: 0.55 }, cap(0.3), initialHeadFollow(), bounds).state;
    const r = followHead(null, cap(0.42), st, bounds);
    expect(r.source).toBe('bow');
    expect(r.sighting!.y).toBeCloseTo(bounds.bottom, 5);
    expect(r.sighting!.x).toBeCloseTo(0.6, 5); // side to side holds where it was
    st = r.state;
    // Still bowed: still the bottom.
    expect(followHead(null, cap(0.45), st, bounds).source).toBe('bow');
  });

  it('face lost, no hat, but the head was already low in its nod: a bow', () => {
    const st = followHead({ x: 0.5, y: 0.8 }, null, initialHeadFollow(), bounds).state;
    expect(followHead(null, null, st, bounds).source).toBe('bow');
  });

  it('face lost with the head up high and the hat where it was (someone walked in front): it holds', () => {
    const st = followHead({ x: 0.5, y: 0.4 }, cap(0.3), initialHeadFollow(), bounds).state;
    const r = followHead(null, cap(0.31), st, bounds);
    expect(r.source).toBe('none');
    expect(r.sighting).toBeNull();
    expect(followHead(null, null, st, bounds).source).toBe('none');
  });

  it('the face comes back: the head again, at once', () => {
    let st = followHead({ x: 0.5, y: 0.8 }, null, initialHeadFollow(), bounds).state;
    st = followHead(null, null, st, bounds).state;
    expect(followHead({ x: 0.5, y: 0.5 }, null, st, bounds).source).toBe('head');
  });

  it('the learnt up-and-down range sets where the bottom and "already low" are', () => {
    const b = headBounds({ min: 0.4, max: 0.6 });
    expect(b.bottom).toBeGreaterThanOrEqual(0.6);
    const st = followHead({ x: 0.5, y: 0.57 }, null, initialHeadFollow(), b).state;
    expect(followHead(null, null, st, b).source).toBe('bow');
    const high = followHead({ x: 0.5, y: 0.45 }, null, initialHeadFollow(), b).state;
    expect(followHead(null, null, high, b).source).toBe('none');
  });
});
