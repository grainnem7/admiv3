import { describe, it, expect } from 'vitest';
import { SurfacePressMode, type SurfacePressConfigInput, type SurfaceTrackPoint } from '../tracking/SurfacePressMode';

// Horizontal surface at y=0.8 for simple cases; press gap 0, release gap 0.1.
const flatConfig = (): SurfacePressConfigInput => ({
  line: { a: 0, b: 0.8 },
  pressGap: 0,
  releaseGap: 0.1,
  descentForFullVelocity: 0.1,
  defaultVelocity: 0.6,
  buttons: [{ id: 'press-1', x: 0.5, minBlobArea: 0 }],
});

const pt = (y: number, found = true): SurfaceTrackPoint[] => [
  { id: 'press-1', x: 0.5, y, found, area: 1 },
];

describe('SurfacePressMode', () => {
  it('does NOT fire on the first frame even if the object starts on the surface (resting)', () => {
    const m = new SurfacePressMode();
    m.setConfig(flatConfig());
    expect(m.step(pt(0.85), 0)).toEqual([]); // starts below the line → armed as "down", silent
  });

  it('fires a press when the point descends to the surface line', () => {
    const m = new SurfacePressMode();
    m.setConfig(flatConfig());
    m.step(pt(0.5), 0);                      // lifted, idle
    const events = m.step(pt(0.82), 16);     // descends past pressLine (0.8)
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('press');
    expect(events[0].buttonId).toBe('press-1');
  });

  it('does not chatter: no release until the point rises above the higher release line', () => {
    const m = new SurfacePressMode();
    m.setConfig(flatConfig());
    m.step(pt(0.5), 0);
    m.step(pt(0.82), 16);                    // press
    expect(m.step(pt(0.78), 32)).toEqual([]); // above pressLine but inside hysteresis band → no release
    expect(m.step(pt(0.72), 48)).toEqual([]); // still inside band (release line = 0.7)
    const rel = m.step(pt(0.68), 64);        // above release line (0.7) → release
    expect(rel).toHaveLength(1);
    expect(rel[0].type).toBe('release');
  });

  it('press threshold follows the oblique surface line across x', () => {
    const m = new SurfacePressMode();
    m.setConfig({
      ...flatConfig(),
      line: { a: -0.2, b: 0.8 },             // surfaceY: 0.8 at x=0, 0.6 at x=1
      buttons: [{ id: 'press-1', x: 1, minBlobArea: 0 }],
    });
    m.step([{ id: 'press-1', x: 1, y: 0.4, found: true, area: 1 }], 0);   // lifted
    // At x=1 the surface line is 0.6; y=0.55 is above it → no press.
    expect(m.step([{ id: 'press-1', x: 1, y: 0.55, found: true, area: 1 }], 16)).toEqual([]);
    // y=0.62 descends past the line → press.
    const ev = m.step([{ id: 'press-1', x: 1, y: 0.62, found: true, area: 1 }], 32);
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('press');
  });

  it('a faster descent yields a higher press velocity', () => {
    const slow = new SurfacePressMode(); slow.setConfig(flatConfig());
    slow.step(pt(0.78), 0); const sEv = slow.step(pt(0.81), 16); // Δ0.03

    const fast = new SurfacePressMode(); fast.setConfig(flatConfig());
    fast.step(pt(0.5), 0); const fEv = fast.step(pt(0.95), 16);  // Δ0.45

    expect(fEv[0].velocity).toBeGreaterThan(sEv[0].velocity);
  });

  it('ignores a button whose blob is below minBlobArea', () => {
    const m = new SurfacePressMode();
    m.setConfig({ ...flatConfig(), buttons: [{ id: 'press-1', x: 0.5, minBlobArea: 0.01 }] });
    m.step(pt(0.5), 0);
    expect(m.step([{ id: 'press-1', x: 0.5, y: 0.9, found: true, area: 0.001 }], 16)).toEqual([]);
  });
});

// Fingertip-onto-key model: the tracked point is a fingertip over the key,
// which vanishes when the finger moves away. releaseOnLost ends the note then.
describe('SurfacePressMode — releaseOnLost (fingertip model)', () => {
  it('releases a held key when the finger leaves it (no point this frame)', () => {
    const m = new SurfacePressMode();
    m.setConfig({ ...flatConfig(), releaseOnLost: true });
    m.step(pt(0.5), 0);          // finger over key, lifted → idle
    m.step(pt(0.82), 16);        // descends to surface → press
    const ev = m.step([], 32);   // finger leaves the key → release
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('release');
    expect(ev[0].buttonId).toBe('press-1');
  });

  it('without releaseOnLost (default), a lost point does NOT release', () => {
    const m = new SurfacePressMode();
    m.setConfig(flatConfig());   // releaseOnLost undefined → false
    m.step(pt(0.5), 0);
    m.step(pt(0.82), 16);        // press
    expect(m.step([], 32)).toEqual([]); // no release on lost
  });

  it('fires a press when a finger arrives over a key already at the surface', () => {
    const m = new SurfacePressMode();
    m.setConfig({ ...flatConfig(), releaseOnLost: true });
    m.step([], 0);               // no finger yet → key armed idle
    const ev = m.step(pt(0.85), 16); // finger appears already below the line → press
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('press');
  });

  it('does not double-release: a lost key already idle stays silent', () => {
    const m = new SurfacePressMode();
    m.setConfig({ ...flatConfig(), releaseOnLost: true });
    m.step([], 0);               // armed idle
    expect(m.step([], 16)).toEqual([]); // still no finger, still idle → nothing
  });
});
