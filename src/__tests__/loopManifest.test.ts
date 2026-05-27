import { describe, it, expect } from 'vitest';
import { parseBpmFromFilename, parseLoopManifest } from '../remix/layers/loopManifest';

describe('parseBpmFromFilename', () => {
  it('parses "124bpm"', () => {
    expect(parseBpmFromFilename('drumloop_124bpm.wav')).toBe(124);
  });
  it('parses "130 BPM" with space and uppercase', () => {
    expect(parseBpmFromFilename('Ed HiHat1 Loop_130 BPM.wav')).toBe(130);
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
  it('returns [] for non-array / empty input', () => {
    expect(parseLoopManifest(undefined)).toEqual([]);
    expect(parseLoopManifest([])).toEqual([]);
  });
});
