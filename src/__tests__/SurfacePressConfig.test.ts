import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSurfacePressConfig,
  saveSurfacePressConfig,
  clearSurfacePressConfig,
  type SurfacePressStored,
} from '../profiles/SurfacePressConfig';

const sample = (): SurfacePressStored => ({
  enabled: true,
  touchDist: 0.06,
  releaseDist: 0.1,
  occlusionEnter: 0.65,
  occlusionExit: 0.85,
  defaultVelocity: 0.7,
  keys: [
    {
      id: 'press-1',
      instrumentKey: 'piano',
      color: { id: 'press-1', hue: 200, hueTolerance: 12, minSaturation: 40, minValue: 35, minArea: 0.0005 },
    },
  ],
});

beforeEach(() => localStorage.clear());

describe('SurfacePressConfig persistence', () => {
  it('returns null when nothing is stored', () => {
    expect(loadSurfacePressConfig()).toBeNull();
  });

  it('round-trips a valid config', () => {
    const cfg = sample();
    saveSurfacePressConfig(cfg);
    expect(loadSurfacePressConfig()).toEqual(cfg);
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('admi-surface-press', '{not json');
    expect(loadSurfacePressConfig()).toBeNull();
  });

  it('returns null when the keys array is missing', () => {
    localStorage.setItem('admi-surface-press', JSON.stringify({ enabled: true }));
    expect(loadSurfacePressConfig()).toBeNull();
  });

  it('coerces an unknown instrument key to the default', () => {
    const cfg = sample();
    cfg.keys[0].instrumentKey = 'definitely-not-real';
    saveSurfacePressConfig(cfg);
    expect(loadSurfacePressConfig()!.keys[0].instrumentKey).toBe('piano');
  });

  it('fills default thresholds when absent', () => {
    localStorage.setItem('admi-surface-press', JSON.stringify({ enabled: false, keys: [] }));
    const loaded = loadSurfacePressConfig()!;
    expect(loaded.touchDist).toBeCloseTo(0.06, 6);
    expect(loaded.releaseDist).toBeCloseTo(0.1, 6);
    expect(loaded.occlusionEnter).toBeCloseTo(0.65, 6);
    expect(loaded.occlusionExit).toBeCloseTo(0.85, 6);
    expect(loaded.defaultVelocity).toBeCloseTo(0.7, 6);
  });

  it('round-trips a per-key colour search region', () => {
    const cfg = sample();
    cfg.keys[0].color.searchRegion = { minX: 0.2, minY: 0.5, maxX: 0.5, maxY: 1 };
    saveSurfacePressConfig(cfg);
    expect(loadSurfacePressConfig()!.keys[0].color.searchRegion).toEqual({
      minX: 0.2, minY: 0.5, maxX: 0.5, maxY: 1,
    });
  });

  it('clear removes the stored config', () => {
    saveSurfacePressConfig(sample());
    clearSurfacePressConfig();
    expect(loadSurfacePressConfig()).toBeNull();
  });
});
