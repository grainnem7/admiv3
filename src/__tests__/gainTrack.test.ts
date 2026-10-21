import { describe, it, expect } from 'vitest';
import { GainTrack } from '../songs/gainTrack';

describe('the ending gain, as numbers', () => {
  it('steady until something is scheduled', () => {
    expect(new GainTrack(1).valueAt(5)).toBe(1);
  });

  it('a linear fade from where the value was set', () => {
    const g = new GainTrack(1);
    g.setValueAtTime(1, 2);
    g.linearRampToValueAtTime(0, 6);
    expect(g.valueAt(1)).toBe(1);
    expect(g.valueAt(4)).toBeCloseTo(0.5, 9);
    expect(g.valueAt(6)).toBe(0);
    expect(g.valueAt(9)).toBe(0);
  });

  it('a glide toward a target, as setTargetAtTime', () => {
    const g = new GainTrack(1);
    g.setTargetAtTime(0, 1, 0.2);
    expect(g.valueAt(1)).toBe(1);
    expect(g.valueAt(1.2)).toBeCloseTo(Math.exp(-1), 6);
    expect(g.valueAt(3)).toBeLessThan(0.001);
  });

  it('cancel drops what was still to come (as Web Audio does), then a glide back up', () => {
    const g = new GainTrack(1);
    g.setValueAtTime(1, 0);
    g.linearRampToValueAtTime(0, 10);
    g.cancelScheduledValues(5);
    g.setTargetAtTime(1, 5, 0.02);
    expect(g.valueAt(5.5)).toBeCloseTo(1, 6);
  });

  it('the final chord: down to 0.35, then straight back up', () => {
    const g = new GainTrack(1);
    g.setValueAtTime(1, 0);
    g.linearRampToValueAtTime(0.35, 4);
    expect(g.valueAt(2)).toBeCloseTo(0.675, 6);
    g.cancelScheduledValues(4);
    g.setValueAtTime(0.35, 4);
    g.linearRampToValueAtTime(1, 4.03);
    expect(g.valueAt(4)).toBeCloseTo(0.35, 9);
    expect(g.valueAt(4.05)).toBe(1);
  });

  it('reset: back to steady with nothing scheduled', () => {
    const g = new GainTrack(1);
    g.setTargetAtTime(0, 0, 0.1);
    g.reset(1);
    expect(g.valueAt(10)).toBe(1);
  });
});
