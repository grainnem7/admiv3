import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSurfacePressConfig,
  saveSurfacePressConfig,
  clearSurfacePressConfig,
  type SurfacePressStored,
} from '../profiles/SurfacePressConfig';

const sample = (): SurfacePressStored => ({
  enabled: true,
  surface: { a: -0.2, b: 0.8, points: [{ x: 0, y: 0.8 }, { x: 1, y: 0.6 }] },
  pressGap: 0,
  releaseGap: 0.1,
  descentForFullVelocity: 0.1,
  defaultVelocity: 0.6,
  useFingertip: false,
  buttons: [
    {
      id: 'press-1', x: 0.3, minBlobArea: 0.0005, instrumentKey: 'piano',
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

  it('drops buttons with an unknown instrument key by defaulting it', () => {
    const cfg = sample();
    cfg.buttons[0].instrumentKey = 'definitely-not-real';
    saveSurfacePressConfig(cfg);
    expect(loadSurfacePressConfig()!.buttons[0].instrumentKey).toBe('piano');
  });

  it('clear removes the stored config', () => {
    saveSurfacePressConfig(sample());
    clearSurfacePressConfig();
    expect(loadSurfacePressConfig()).toBeNull();
  });
});
