import { describe, it, expect, beforeEach } from 'vitest';
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
});
