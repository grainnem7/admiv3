import { describe, expect, it } from 'vitest';
import { admitLoopNote, admitPlayerNote, LANE_TOP, loopLaneShift, loopNoteCap, newStepTally } from '../songs/density';

describe('density: how much may sound at once (S2)', () => {
  it('the cap rises with Energy: Calm two, Steady three, Lively four, Driving six', () => {
    expect(loopNoteCap(0)).toBe(2);
    expect(loopNoteCap(0.3)).toBe(2);
    expect(loopNoteCap(0.5)).toBe(3);
    expect(loopNoteCap(0.7)).toBe(4);
    expect(loopNoteCap(1)).toBe(6);
  });
  it("the player's notes are always in, and never counted against the loops", () => {
    const t = newStepTally();
    admitPlayerNote(t, [60, 64, 67]);
    expect(t.loopPitched).toBe(0);
    expect(admitLoopNote(t, [62], 2)).toBe(true);
    expect(admitLoopNote(t, [65], 2)).toBe(true);
    expect(admitLoopNote(t, [69], 2)).toBe(false); // the cap
    expect(t.loopPitched).toBe(2);
  });
  it('a loop never doubles a pitch the player plays on the same step', () => {
    const t = newStepTally();
    admitPlayerNote(t, [64]);
    expect(admitLoopNote(t, [64], 6)).toBe(false);
    // A chord that merely shares the tone is harmony, and plays.
    expect(admitLoopNote(t, [60, 64, 67], 6)).toBe(true);
    // A chord the player already plays note for note does not.
    admitPlayerNote(t, [60, 67]);
    expect(admitLoopNote(t, [60, 64, 67], 6)).toBe(false);
    expect(admitLoopNote(t, [76], 6)).toBe(true); // the octave is another note
    expect(t.loopPitched).toBe(2);
  });
  it("a loop's melody sits an octave above the player's melody while it sounds, within reach", () => {
    expect(loopLaneShift('melody', true, 64)).toBe(12);
    expect(loopLaneShift('melody', false, 64)).toBe(0);
    expect(loopLaneShift('bass', true, 40)).toBe(0);
    expect(loopLaneShift('chord', true, 64)).toBe(0);
    expect(loopLaneShift('melody', true, LANE_TOP - 11)).toBe(0);
    expect(loopLaneShift('melody', true, LANE_TOP - 12)).toBe(12);
  });
});
