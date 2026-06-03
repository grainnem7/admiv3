import { describe, it, expect } from 'vitest';
import { matchesTrackedColor, type TrackedColor } from '../tracking/ColorTracker';

const RED: TrackedColor = {
  id: 'r', hue: 5, hueTolerance: 16, minSaturation: 30, minValue: 20, minArea: 0,
};

describe('matchesTrackedColor skin-tone exclusion opt-out', () => {
  // A shadowed red (reddish hue, saturation below 60) — the kind of pixel a red
  // piece produces on a dark square.
  const shadowedRed = { h: 8, s: 48, v: 55 };

  it('rejects shadowed reddish pixels by default (skin-tone exclusion)', () => {
    expect(matchesTrackedColor(shadowedRed, RED)).toBe(false);
  });

  it('accepts the same pixel when skin-tone exclusion is skipped', () => {
    expect(matchesTrackedColor(shadowedRed, RED, true)).toBe(true);
  });

  it('still rejects out-of-band hues even when skipping skin exclusion', () => {
    // Skin/arm hue well outside the red band → rejected by hue regardless.
    expect(matchesTrackedColor({ h: 28, s: 50, v: 70 }, RED, true)).toBe(false);
  });

  it('still enforces saturation/value floors when skipping skin exclusion', () => {
    expect(matchesTrackedColor({ h: 5, s: 10, v: 70 }, RED, true)).toBe(false);
    expect(matchesTrackedColor({ h: 5, s: 70, v: 10 }, RED, true)).toBe(false);
  });
});
