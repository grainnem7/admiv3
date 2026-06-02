import { describe, it, expect } from 'vitest';
import {
  SurfacePressMode,
  type SurfacePressThresholds,
  type SurfaceKeyFrame,
} from '../tracking/SurfacePressMode';

// A vertical tube at x=0.5, near end (0.5,0.8) → far end (0.5,0.4).
const TUBE = { ax: 0.5, ay: 0.8, bx: 0.5, by: 0.4 };
const thresholds = (): SurfacePressThresholds => ({
  touchDist: 0.05,
  releaseDist: 0.1,
  defaultVelocity: 0.7,
});
const keys = (segment: typeof TUBE | null = TUBE): SurfaceKeyFrame[] => [
  { id: 'press-1', segment },
];

describe('SurfacePressMode — press anywhere along a tube', () => {
  it('fires when a finger touches the MIDDLE of the tube (not just an end)', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    const ev = m.step(keys(), [{ x: 0.5, y: 0.6 }], 0); // mid-tube, dist 0
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('press');
    expect(ev[0].buttonId).toBe('press-1');
    expect(ev[0].velocity).toBeCloseTo(0.7, 6);
  });

  it('fires when a finger touches near the FAR end of the tube', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    expect(m.step(keys(), [{ x: 0.5, y: 0.42 }], 0)[0].type).toBe('press');
  });

  it('does NOT fire when the finger is far from the tube line', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    expect(m.step(keys(), [{ x: 0.5, y: 0.2 }], 0)).toEqual([]); // dist 0.2 > touchDist
  });

  it('releases when the finger leaves the tube (no finger nearby)', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(keys(), [{ x: 0.5, y: 0.6 }], 0);      // press
    const ev = m.step(keys(), [], 16);            // finger gone → release
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('release');
  });

  it('hysteresis: stays down between touch and release distance, releases beyond', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(keys(), [{ x: 0.5, y: 0.6 }], 0);      // press (dist 0)
    expect(m.step(keys(), [{ x: 0.57, y: 0.6 }], 16)).toEqual([]); // dist 0.07: between → stay
    const rel = m.step(keys(), [{ x: 0.62, y: 0.6 }], 32);          // dist 0.12 ≥ release
    expect(rel).toHaveLength(1);
    expect(rel[0].type).toBe('release');
  });

  it('a key whose segment is null this frame is not pressable; releases if held', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(keys(), [{ x: 0.5, y: 0.6 }], 0);      // press
    const ev = m.step(keys(null), [{ x: 0.5, y: 0.6 }], 16); // tube lost → release
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('release');
  });
});

describe('SurfacePressMode — nearest key wins', () => {
  const A = { ax: 0.3, ay: 0.8, bx: 0.3, by: 0.4 };
  const B = { ax: 0.7, ay: 0.8, bx: 0.7, by: 0.4 };

  it('a finger presses only the tube it is closest to', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    const ev = m.step(
      [{ id: 'press-A', segment: A }, { id: 'press-B', segment: B }],
      [{ x: 0.31, y: 0.6 }], // near A
      0,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0].buttonId).toBe('press-A');
  });

  it('two fingers can press two different tubes at once', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    const ev = m.step(
      [{ id: 'press-A', segment: A }, { id: 'press-B', segment: B }],
      [{ x: 0.3, y: 0.6 }, { x: 0.7, y: 0.6 }],
      0,
    );
    expect(ev.map((e) => e.buttonId).sort()).toEqual(['press-A', 'press-B']);
    expect(ev.every((e) => e.type === 'press')).toBe(true);
  });
});
