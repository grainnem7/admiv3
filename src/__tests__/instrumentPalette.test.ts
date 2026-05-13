import { describe, it, expect, vi } from 'vitest';

// Prevent Tone.js from instantiating real audio nodes at import time.
vi.mock('tone', () => ({
  Sampler: vi.fn(),
  Frequency: vi.fn(() => ({ toNote: () => 'A4' })),
  now: vi.fn(() => 0),
}));

import {
  INSTRUMENT_PALETTE,
  INSTRUMENT_PALETTE_BY_KEY,
  INSTRUMENT_PALETTE_LIST,
  DEFAULT_INSTRUMENT_KEY,
  getInstrumentEntry,
} from '../songs/voices/presets/instrumentPalette';
import { SAMPLE_CONFIGS } from '../songs/voices/SamplerPlayer';

describe('instrument palette', () => {
  it('contains exactly the five curated entries', () => {
    expect(INSTRUMENT_PALETTE).toHaveLength(5);
  });

  it('includes the workshop-requested categories (piano, EP, bass, percussion, strings)', () => {
    const keys = INSTRUMENT_PALETTE.map((e) => e.key).sort();
    expect(keys).toEqual([
      'bass',
      'electricPiano',
      'percussion',
      'piano',
      'strings',
    ]);
  });

  it('exposes the default key from the palette', () => {
    expect(INSTRUMENT_PALETTE_BY_KEY[DEFAULT_INSTRUMENT_KEY]).toBeDefined();
  });

  for (const entry of INSTRUMENT_PALETTE) {
    describe(`entry "${entry.key}"`, () => {
      it('has a display name', () => {
        expect(entry.name).toBeTruthy();
      });

      it('references an existing SAMPLE_CONFIGS sample key', () => {
        expect(SAMPLE_CONFIGS).toHaveProperty(entry.sampleKey);
      });

      it('has a positive duration', () => {
        expect(entry.duration).toBeGreaterThan(0);
      });

      it('has a velocity range within 0..1 with min < max', () => {
        expect(entry.velocityRange.min).toBeGreaterThanOrEqual(0);
        expect(entry.velocityRange.max).toBeLessThanOrEqual(1);
        expect(entry.velocityRange.min).toBeLessThan(entry.velocityRange.max);
      });

      it('declares its sample source', () => {
        expect(entry.source).toBeTruthy();
      });
    });
  }

  it('lookup falls back to the default for unknown keys', () => {
    expect(getInstrumentEntry('not-a-real-key').key).toBe(DEFAULT_INSTRUMENT_KEY);
  });

  it('list and map representations match the canonical array', () => {
    expect(INSTRUMENT_PALETTE_LIST).toHaveLength(INSTRUMENT_PALETTE.length);
    expect(Object.keys(INSTRUMENT_PALETTE_BY_KEY).sort()).toEqual(
      INSTRUMENT_PALETTE.map((e) => e.key).sort(),
    );
  });
});
