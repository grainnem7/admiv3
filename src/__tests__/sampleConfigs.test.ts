// src/__tests__/sampleConfigs.test.ts
import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
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
});
