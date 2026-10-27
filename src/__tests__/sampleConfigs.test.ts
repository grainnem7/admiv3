// src/__tests__/sampleConfigs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Prevent Tone.js from instantiating a real AudioContext at import time.
// This test only inspects plain-object config data; no audio playback needed.
vi.mock('tone', () => ({
  Sampler: vi.fn(),
  Frequency: vi.fn(() => ({ toNote: () => 'A4' })),
  now: vi.fn(() => 0),
}));

import { SAMPLE_CONFIGS } from '../songs/voices/SamplerPlayer';

const PUBLIC = join(process.cwd(), 'public');

describe('SAMPLE_CONFIGS', () => {
  it('every referenced sample resolves to a committed local file', () => {
    const missing: string[] = [];
    for (const [key, cfg] of Object.entries(SAMPLE_CONFIGS)) {
      expect(cfg.baseUrl.startsWith('samples/')).toBe(true);
      for (const file of Object.values(cfg.urls)) {
        if (!existsSync(join(PUBLIC, cfg.baseUrl, file))) missing.push(`${key}: ${cfg.baseUrl}${file}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every instrument has at least 3 sample points', () => {
    for (const [key, cfg] of Object.entries(SAMPLE_CONFIGS)) {
      expect(Object.keys(cfg.urls).length, key).toBeGreaterThanOrEqual(3);
    }
  });

  it('every url key is a valid Tone note name (# for sharps, not s)', () => {
    // Tone.Sampler rejects keys like "Fs2" ("url key is neither a note or midi
    // pitch") — sharps must be "#". Files keep the "s" spelling; only keys differ.
    const valid = /^[A-G](#|b)?-?\d$/;
    const bad: string[] = [];
    for (const [key, cfg] of Object.entries(SAMPLE_CONFIGS)) {
      for (const note of Object.keys(cfg.urls)) {
        if (!valid.test(note)) bad.push(`${key}: "${note}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});

const STAGE_4: Record<string, string[]> = {
  flute: ['C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'C6', 'E6'],
  saxophone: ['Cs3', 'F3', 'Gs3', 'C4', 'E4', 'Gs4', 'C5', 'E5', 'A5'],
  trumpet: ['F3', 'A3', 'C4', 'Ds4', 'G4', 'As4', 'D5', 'F5', 'A5', 'C6'],
  trombone: ['As1', 'Ds2', 'Gs2', 'C3', 'F3', 'As3', 'D4', 'F4'],
  bassoon: ['G2', 'A2', 'C3', 'G3', 'A3', 'C4', 'E4', 'G4', 'A4', 'C5'],
  xylophone: ['G4', 'C5', 'G5', 'C6', 'G6', 'C7', 'G7', 'C8'],
  guitarAcoustic: ['E2', 'Gs2', 'C3', 'E3', 'Gs3', 'C4', 'E4', 'Gs4', 'C5'],
  guitarElectric: ['E2', 'A2', 'C3', 'Fs3', 'A3', 'C4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6'],
};

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "F#3" → 54. */
function midiOf(note: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!m) throw new Error(`not a note: ${note}`);
  return 12 * (Number(m[3]) + 1) + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const configs = SAMPLE_CONFIGS as Record<string, { urls: Record<string, string>; baseUrl: string }>;

describe('the stage 4 instruments', () => {
  it('the stage 4 instruments are bundled', () => {
    for (const [key, notes] of Object.entries(STAGE_4)) {
      expect(configs[key], key).toBeDefined();
      expect(Object.values(configs[key].urls).sort(), key).toEqual(notes.map((n) => `${n}.mp3`).sort());
    }
  });

  it('no bundled note is more than 7 semitones from the next', () => {
    for (const key of Object.keys(STAGE_4)) {
      const midis = Object.keys(configs[key]?.urls ?? {}).map(midiOf).sort((a, b) => a - b);
      expect(midis.length, key).toBeGreaterThan(0);
      for (let i = 1; i < midis.length; i++) expect(midis[i] - midis[i - 1], `${key} near ${midis[i]}`).toBeLessThanOrEqual(7);
    }
  });

  it('manifest.json lists the same notes as SAMPLE_CONFIGS', () => {
    const manifest = JSON.parse(readFileSync(join(PUBLIC, 'samples/instruments/manifest.json'), 'utf8')) as Record<string, string[]>;
    for (const cfg of Object.values(configs)) {
      const folder = /^samples\/instruments\/([^/]+)\/$/.exec(cfg.baseUrl)?.[1];
      if (!folder) continue;
      const files = Object.values(cfg.urls).map((f) => f.replace(/\.\w+$/, '')).sort();
      expect([...(manifest[folder] ?? [])].sort(), folder).toEqual(files);
    }
  });
});
