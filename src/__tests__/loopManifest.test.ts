import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseBpmFromFilename, parseLoopManifest } from '../remix/layers/loopManifest';

describe('parseBpmFromFilename', () => {
  it('parses "124bpm"', () => {
    expect(parseBpmFromFilename('drumloop_124bpm.wav')).toBe(124);
  });
  it('parses "130 BPM" with space and uppercase', () => {
    expect(parseBpmFromFilename('Ed HiHat1 Loop_130 BPM.wav')).toBe(130);
  });
  it('parses 2-digit BPM like "90bpm"', () => {
    expect(parseBpmFromFilename('loop_90bpm.wav')).toBe(90);
  });
  it('returns null when no bpm present', () => {
    expect(parseBpmFromFilename('break_unknown.wav')).toBeNull();
  });
});

describe('parseLoopManifest', () => {
  it('keeps entries with parseable bpm and attaches it', () => {
    const out = parseLoopManifest([
      { file: 'drumloop_124bpm.wav', name: 'Boom Bap' },
      { file: 'houseloop_126bpm.wav', name: 'Four-on-the-Floor' },
    ]);
    expect(out).toEqual([
      { file: 'drumloop_124bpm.wav', name: 'Boom Bap', bpm: 124 },
      { file: 'houseloop_126bpm.wav', name: 'Four-on-the-Floor', bpm: 126 },
    ]);
  });
  it('drops entries whose filename has no bpm', () => {
    const out = parseLoopManifest([
      { file: 'good_90bpm.wav', name: 'Half-Time' },
      { file: 'nobpm.wav', name: 'Mystery' },
    ]);
    expect(out).toEqual([{ file: 'good_90bpm.wav', name: 'Half-Time', bpm: 90 }]);
  });
  it('drops null / non-object / wrong-typed entries', () => {
    expect(parseLoopManifest([null, 42, {}, { file: 123, name: 'x' }, { file: 'ok_100bpm.wav', name: 'OK' }]))
      .toEqual([{ file: 'ok_100bpm.wav', name: 'OK', bpm: 100 }]);
  });
  it('returns [] for non-array / empty input', () => {
    expect(parseLoopManifest(undefined)).toEqual([]);
    expect(parseLoopManifest([])).toEqual([]);
  });
});

import { loadLoopManifest } from '../remix/layers/loadLoopManifest';

describe('loadLoopManifest', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('fetches loops.json, parses bpm, drops no-bpm entries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { file: 'a_120bpm.wav', name: 'A' },
        { file: 'nobpm.wav', name: 'B' },
      ],
    }) as unknown as typeof fetch;
    const loops = await loadLoopManifest();
    expect(loops).toEqual([{ file: 'a_120bpm.wav', name: 'A', bpm: 120 }]);
  });

  it('returns [] when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('404')) as unknown as typeof fetch;
    expect(await loadLoopManifest()).toEqual([]);
  });

  it('returns [] when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await loadLoopManifest()).toEqual([]);
  });
});
