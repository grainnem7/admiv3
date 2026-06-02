import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveArrangement, loadArrangementFromStore, listArrangements } from '../remix/recording/arrangementStore';
import type { RemixArrangement } from '../remix/recording/remixRecording';

const A: RemixArrangement = {
  songId: 'song1',
  sections: [{ originBar: 0, lengthBars: 8, layers: [{ id: 't1', muted: false, events: [{ t: 1, kind: 'percussion', velocity: 0.8 }] }] }],
};

beforeEach(() => localStorage.clear());

describe('arrangementStore', () => {
  it('save then load round-trips', () => {
    saveArrangement('my mix', A);
    const loaded = loadArrangementFromStore('song1', 'my mix');
    expect(loaded).toEqual(A);
  });

  it('load returns null for a missing arrangement', () => {
    expect(loadArrangementFromStore('song1', 'nope')).toBeNull();
  });

  it('listArrangements lists names for a song only', () => {
    saveArrangement('a', A);
    saveArrangement('b', A);
    saveArrangement('c', { ...A, songId: 'other' });
    expect(listArrangements('song1').sort()).toEqual(['a', 'b']);
    expect(listArrangements('other')).toEqual(['c']);
  });

  it('save returns true on success, false when storage throws (e.g. quota)', () => {
    expect(saveArrangement('ok', A)).toBe(true);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      expect(saveArrangement('boom', A)).toBe(false); // does not throw
    } finally {
      spy.mockRestore();
    }
  });

  it('load returns null for malformed / schema-drifted data', () => {
    // sections present but a take is missing its events array.
    localStorage.setItem('remix:arr:song1:bad', JSON.stringify({
      songId: 'song1',
      sections: [{ originBar: 0, lengthBars: 8, layers: [{ id: 't1', muted: false }] }],
    }));
    expect(loadArrangementFromStore('song1', 'bad')).toBeNull();

    // not even an object.
    localStorage.setItem('remix:arr:song1:bad2', '42');
    expect(loadArrangementFromStore('song1', 'bad2')).toBeNull();

    // invalid JSON.
    localStorage.setItem('remix:arr:song1:bad3', '{not json');
    expect(loadArrangementFromStore('song1', 'bad3')).toBeNull();
  });
});
