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
  occlusionEnter: 0.65, // press needs ≥35% of the tube covered
  occlusionExit: 0.85,  // release once ≥85% of the tube is visible again
  defaultVelocity: 0.7,
});

const key = (
  area: number,
  segment: typeof TUBE | null = TUBE,
  found = true,
): SurfaceKeyFrame[] => [{ id: 'press-1', segment, area, found }];

const onLine = [{ x: 0.5, y: 0.6 }]; // perpendicular distance 0 to TUBE

describe('SurfacePressMode — contact = on the tube AND its colour is covered', () => {
  it('fires when a finger is on the tube AND the tube area dips (covered)', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(key(0.10), onLine, 0);             // baseline area 0.10, full → no press
    const ev = m.step(key(0.05), onLine, 16); // ~50% covered + on line → press
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('press');
    expect(ev[0].velocity).toBeCloseTo(0.7, 6);
  });

  it('does NOT fire when the finger is on the line but the tube is fully visible (hover, not covering)', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(key(0.10), onLine, 0);
    expect(m.step(key(0.10), onLine, 16)).toEqual([]); // no area dip → no press
  });

  it('does NOT fire when the area dips but no finger is near (something else covered it)', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(key(0.10), [], 0);
    expect(m.step(key(0.04), [], 16)).toEqual([]); // covered but no finger → no press
  });

  it('releases when the tube colour comes back (finger lifted off)', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(key(0.10), onLine, 0);
    m.step(key(0.05), onLine, 16);            // press
    const ev = m.step(key(0.10), onLine, 32); // area recovered → release
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('release');
  });

  it('releases when the finger moves off the tube line', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(key(0.10), onLine, 0);
    m.step(key(0.05), onLine, 16);            // press
    const ev = m.step(key(0.05), [{ x: 0.7, y: 0.6 }], 32); // finger far → release
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('release');
  });

  it('holds the press under full coverage (tube not found) while a finger stays on it', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(key(0.10), onLine, 0);
    m.step(key(0.05), onLine, 16);            // press
    // Fully covered: tube not found, area 0, no segment — uses last segment,
    // coverage 1 → still occluded, finger still on it → stays down.
    expect(m.step([{ id: 'press-1', segment: null, area: 0, found: false }], onLine, 32)).toEqual([]);
  });

  it('does not adapt its baseline away while pressed (sustained press stays down)', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    m.step(key(0.10), onLine, 0);
    m.step(key(0.04), onLine, 16);            // press
    // Hold covered for many frames — must not drift back to idle.
    let events: ReturnType<typeof m.step> = [];
    for (let t = 32; t < 32 + 60 * 16; t += 16) events = m.step(key(0.04), onLine, t);
    expect(events).toEqual([]); // still held, no spurious release
  });
});

describe('SurfacePressMode — nearest key wins', () => {
  const A = { ax: 0.3, ay: 0.8, bx: 0.3, by: 0.4 };
  const B = { ax: 0.7, ay: 0.8, bx: 0.7, by: 0.4 };

  it('a finger covering tube A presses only A', () => {
    const m = new SurfacePressMode();
    m.setConfig(thresholds());
    const keysFull: SurfaceKeyFrame[] = [
      { id: 'press-A', segment: A, area: 0.1, found: true },
      { id: 'press-B', segment: B, area: 0.1, found: true },
    ];
    m.step(keysFull, [{ x: 0.31, y: 0.6 }], 0); // baselines
    const ev = m.step(
      [
        { id: 'press-A', segment: A, area: 0.05, found: true }, // A covered
        { id: 'press-B', segment: B, area: 0.1, found: true },
      ],
      [{ x: 0.31, y: 0.6 }], // finger near A
      16,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0].buttonId).toBe('press-A');
  });
});
