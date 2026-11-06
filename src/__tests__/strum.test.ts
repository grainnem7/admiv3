import { describe, it, expect } from 'vitest';
import { strumFor, strumOffsets, STRUM_DOWN_SEC, STRUM_UP_SEC, HARP_ROLL_SEC } from '../songs/strum';
import { midiEventsFor } from '../midi/boardMidi';

/** A guitar's chord is strummed, not struck (owner's listening, 2026-11-06: "fake"). */
describe('the strum', () => {
  it('a guitar strums down on the beat and up between; a harp rolls; other instruments play together', () => {
    expect(strumFor('guitarAcoustic', 0)).toBe(STRUM_DOWN_SEC);
    expect(strumFor('guitarNylon', 3)).toBe(-STRUM_UP_SEC);
    expect(strumFor('harp', 1)).toBe(HARP_ROLL_SEC);
    expect(strumFor('piano', 0)).toBe(0);
    expect(strumFor(undefined, 0)).toBe(0);
  });

  it('down: the lowest string first; up: the highest first; in the order the notes were given', () => {
    expect(strumOffsets([64, 52, 57], 0.01)).toEqual([0.02, 0, 0.01]);
    expect(strumOffsets([64, 52, 57], -0.01)).toEqual([0, 0.02, 0.01]);
    expect(strumOffsets([64, 52], 0)).toEqual([0, 0]);
  });

  it('over MIDI each string starts on its own, and they all end together', () => {
    const events = midiEventsFor(
      { role: 'chord', origin: 'placed', audioTime: 1, durSec: 1, velocity: 0.6, midis: [52, 57, 61], strumSec: 0.016 },
      { enabled: true, sends: 'player' }, (t) => t * 1000,
    );
    const on = events.filter((e) => (e.data[0] & 0xf0) === 0x90).map((e) => [e.data[1], Math.round(e.atMs)]);
    const off = new Set(events.filter((e) => (e.data[0] & 0xf0) === 0x80).map((e) => Math.round(e.atMs)));
    expect(on).toEqual([[52, 1000], [57, 1016], [61, 1032]]);
    expect(off.size).toBe(1);
  });
});
