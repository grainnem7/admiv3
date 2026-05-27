import { describe, it, expect } from 'vitest';
import { selectLoopZone, RemixLoopBaton } from '../remix/RemixLoopBaton';

const H = 0.04;

describe('selectLoopZone', () => {
  it('snaps directly to the zone when current is -1 (uninitialised)', () => {
    expect(selectLoopZone(0.1, 3, -1, H)).toBe(0);
    expect(selectLoopZone(0.5, 3, -1, H)).toBe(1);
    expect(selectLoopZone(0.9, 3, -1, H)).toBe(2);
  });
  it('returns 0 when there is only one loop', () => {
    expect(selectLoopZone(0.9, 1, -1, H)).toBe(0);
  });
  it('switches up only after crossing the boundary by the hysteresis margin', () => {
    // n=3 → boundary between zone 0 and 1 is at 0.333.
    expect(selectLoopZone(0.34, 3, 0, H)).toBe(0); // within margin → stay
    expect(selectLoopZone(0.40, 3, 0, H)).toBe(1); // past boundary+H → switch
  });
  it('does not flip back and forth while drifting on a boundary', () => {
    expect(selectLoopZone(0.32, 3, 1, H)).toBe(1);
    expect(selectLoopZone(0.28, 3, 1, H)).toBe(0); // clearly past → drop
  });
  it('clamps to valid zone range', () => {
    expect(selectLoopZone(1.5, 3, -1, H)).toBe(2);
    expect(selectLoopZone(-0.5, 3, -1, H)).toBe(0);
  });
});

describe('RemixLoopBaton', () => {
  function make() {
    const b = new RemixLoopBaton();
    b.setLoopCount(3);
    return b;
  }

  it('absent centroid → present:false, latches last index + volume', () => {
    const b = make();
    b.process({ x: 0.9, y: 0.5 }); // present, sets index 2, volume 0.5
    const out = b.process(null);
    expect(out.present).toBe(false);
    expect(out.loopIndex).toBe(2);
    expect(out.volume).toBeCloseTo(0.5, 5);
  });

  it('present centroid → present:true, index from X, volume from Y', () => {
    const b = make();
    const out = b.process({ x: 0.1, y: 0.75 });
    expect(out.present).toBe(true);
    expect(out.loopIndex).toBe(0);
    expect(out.volume).toBeCloseTo(0.75, 5);
  });

  it('applies X calibration to loop selection', () => {
    const b = make();
    b.setCalibration({ min: 0.25, max: 0.75 }, null);
    const out = b.process({ x: 0.75, y: 0.5 });
    expect(out.loopIndex).toBe(2);
  });

  it('latches index 0 (not -1) before any present frame', () => {
    const b = make();
    const out = b.process(null);
    expect(out.loopIndex).toBe(0);
  });

  it('setCurrentIndex seeds + clamps the selected index', () => {
    const b = make(); // loopCount 3
    b.setCurrentIndex(9);
    expect(b.process(null).loopIndex).toBe(2); // clamped to count-1
    b.setCurrentIndex(1);
    expect(b.process(null).loopIndex).toBe(1);
  });
});
