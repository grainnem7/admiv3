import { describe, it, expect, beforeEach, vi } from 'vitest';

// Prevent Tone.js instantiating real nodes when SongPresetEngine is loaded
// transitively (via the palette import chain).
vi.mock('tone', () => ({
  Sampler: vi.fn(),
  Frequency: vi.fn(() => ({ toNote: () => 'A4', toFrequency: () => 440 })),
  now: vi.fn(() => 0),
}));

import {
  loadBatonAssignments,
  saveBatonAssignments,
  clearBatonAssignments,
} from '../profiles/BatonAssignments';
import { DEFAULT_INSTRUMENT_KEY } from '../songs/voices/presets/instrumentPalette';

const KEY = 'admi-baton-assignments';

beforeEach(() => {
  localStorage.clear();
});

describe('BatonAssignments persistence', () => {
  it('returns an empty map when nothing is stored', () => {
    expect(loadBatonAssignments()).toEqual({});
  });

  it('round-trips a valid assignment', () => {
    saveBatonAssignments({
      red: { mode: 'instrument', instrumentKey: 'piano' },
      green: { mode: 'parameter', instrumentKey: 'strings' },
    });
    const loaded = loadBatonAssignments();
    expect(loaded.red).toEqual({ mode: 'instrument', instrumentKey: 'piano' });
    expect(loaded.green).toEqual({ mode: 'parameter', instrumentKey: 'strings' });
  });

  it('drops unknown roles (e.g. blue is not switchable)', () => {
    // Blue is a valid ColorRole in the type system but is not a
    // switchable baton — sanitize() must drop it on load/save.
    saveBatonAssignments({
      blue: { mode: 'instrument', instrumentKey: 'piano' },
      red: { mode: 'instrument', instrumentKey: 'piano' },
    });
    const loaded = loadBatonAssignments();
    expect(loaded.blue).toBeUndefined();
    expect(loaded.red).toBeDefined();
  });

  it('coerces unknown modes to "parameter"', () => {
    // Plant a hand-crafted bad value to test sanitisation on load.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        red: { mode: 'orbit', instrumentKey: 'piano' },
      }),
    );
    const loaded = loadBatonAssignments();
    expect(loaded.red?.mode).toBe('parameter');
  });

  it('coerces unknown instrument keys to the default', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        red: { mode: 'instrument', instrumentKey: 'not-a-real-instrument' },
      }),
    );
    const loaded = loadBatonAssignments();
    expect(loaded.red?.instrumentKey).toBe(DEFAULT_INSTRUMENT_KEY);
  });

  it('returns empty on malformed JSON without throwing', () => {
    localStorage.setItem(KEY, '{not valid json');
    // Suppress the warn this triggers — the warning is informational
    // and intentionally non-fatal.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadBatonAssignments()).toEqual({});
    warn.mockRestore();
  });

  it('clearBatonAssignments empties the store', () => {
    saveBatonAssignments({
      red: { mode: 'instrument', instrumentKey: 'piano' },
    });
    expect(Object.keys(loadBatonAssignments())).toHaveLength(1);

    clearBatonAssignments();
    expect(loadBatonAssignments()).toEqual({});
  });
});
