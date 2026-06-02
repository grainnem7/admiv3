import { describe, it, expect, vi } from 'vitest';

// surfacePressTiming imports nextBeatAfter from InstrumentVoice, which pulls
// in Tone transitively. Mock the audio surface so module load is inert.
vi.mock('tone', () => ({
  Sampler: vi.fn(),
  Frequency: vi.fn(() => ({ toNote: () => 'A4', toFrequency: () => 440 })),
  now: vi.fn(() => 0),
}));

import { resolvePressTime, PendingPressQueue } from '../songs/surfacePressTiming';

describe('resolvePressTime', () => {
  const beats = [1.0, 2.0, 3.0, 4.0];

  it('returns currentTime immediately when beat-snap is off', () => {
    expect(resolvePressTime(beats, 1.3, false)).toBe(1.3);
  });

  it('returns currentTime when there is no beat data', () => {
    expect(resolvePressTime(null, 1.3, true)).toBe(1.3);
    expect(resolvePressTime([], 1.3, true)).toBe(1.3);
  });

  it('defers to the next beat after now when beat-snap is on', () => {
    expect(resolvePressTime(beats, 1.3, true)).toBe(2.0);
    expect(resolvePressTime(beats, 2.0, true)).toBe(3.0); // strictly after
  });
});

describe('PendingPressQueue', () => {
  it('flushes a scheduled press once its target time has passed', () => {
    const q = new PendingPressQueue();
    q.schedule('press-1', 64, 0.8, 2.0);
    expect(q.flushDue(1.9)).toEqual([]);                 // not due yet
    expect(q.flushDue(2.0)).toEqual([{ buttonId: 'press-1', midi: 64, velocity: 0.8 }]);
    expect(q.flushDue(2.1)).toEqual([]);                 // consumed
  });

  it('cancel removes a pending press before it fires (release before the beat)', () => {
    const q = new PendingPressQueue();
    q.schedule('press-1', 64, 0.8, 2.0);
    q.cancel('press-1');
    expect(q.flushDue(5.0)).toEqual([]);
  });

  it('a later schedule for the same button overwrites the earlier one', () => {
    const q = new PendingPressQueue();
    q.schedule('press-1', 60, 0.5, 2.0);
    q.schedule('press-1', 67, 0.9, 2.0);
    expect(q.flushDue(2.0)).toEqual([{ buttonId: 'press-1', midi: 67, velocity: 0.9 }]);
  });
});
