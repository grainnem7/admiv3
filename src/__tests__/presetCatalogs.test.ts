import { describe, it, expect, vi } from 'vitest';

// Prevent Tone.js from instantiating a real AudioContext at import time.
// The catalog tests only inspect plain-object data; no audio playback needed.
vi.mock('tone', () => ({
  Sampler: vi.fn(),
  Frequency: vi.fn(() => ({ toNote: () => 'A4' })),
  now: vi.fn(() => 0),
}));

import { PAD_PRESETS } from '../songs/voices/presets/chordPadPresets';
import { MELODY_PRESETS } from '../songs/voices/presets/melodyPresets';
import { ARP_PRESETS } from '../songs/voices/presets/arpeggioPresets';
import { BASS_PRESETS } from '../songs/voices/presets/bassPresets';
import { SAMPLE_CONFIGS } from '../songs/voices/SamplerPlayer';

const catalogs = {
  pad: PAD_PRESETS,
  melody: MELODY_PRESETS,
  arp: ARP_PRESETS,
  bass: BASS_PRESETS,
};

const validSynthKinds = new Set(['poly', 'fm', 'am', 'mono', 'duo']);

describe('preset catalog integrity', () => {
  for (const [name, catalog] of Object.entries(catalogs)) {
    describe(`${name} catalog`, () => {
      it('is non-empty', () => {
        expect(Object.keys(catalog).length).toBeGreaterThan(0);
      });

      for (const [key, preset] of Object.entries(catalog)) {
        describe(`preset "${key}"`, () => {
          it('has a non-empty display name', () => {
            expect(preset.name).toBeTruthy();
          });

          it('has a valid kind discriminator', () => {
            expect(['sampled', 'synth']).toContain(preset.kind);
          });

          if (preset.kind === 'sampled') {
            it('references an existing SAMPLE_CONFIGS entry', () => {
              expect(SAMPLE_CONFIGS).toHaveProperty(preset.sampleKey);
            });
          } else {
            it('has a valid synth kind', () => {
              expect(validSynthKinds).toContain(preset.synthConfig.kind);
            });

            it('chorusDepth (if present) is within 0..1', () => {
              if (preset.synthConfig.chorusDepth !== undefined) {
                expect(preset.synthConfig.chorusDepth).toBeGreaterThanOrEqual(0);
                expect(preset.synthConfig.chorusDepth).toBeLessThanOrEqual(1);
              }
            });
          }
        });
      }
    });
  }

  it('expected preset totals match the design', () => {
    expect(Object.keys(PAD_PRESETS).length).toBe(7);
    expect(Object.keys(MELODY_PRESETS).length).toBe(7);
    expect(Object.keys(ARP_PRESETS).length).toBe(7);
    expect(Object.keys(BASS_PRESETS).length).toBe(7);
  });

  it('engine default voice preset keys exist in their catalogs', () => {
    expect(PAD_PRESETS).toHaveProperty('rhodesEP');
    expect(MELODY_PRESETS).toHaveProperty('clarinet');
    expect(ARP_PRESETS).toHaveProperty('nylonGuitar');
    expect(BASS_PRESETS).toHaveProperty('upright');
  });
});
