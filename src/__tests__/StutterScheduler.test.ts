import { describe, it, expect } from 'vitest';
import { computeStutterWindow } from '../remix/StutterScheduler';

const BEATS = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
const DOWNBEATS = [0, 2.0, 4.0]; // a bar every 2 s

describe('computeStutterWindow', () => {
  it('starts on the next beat at or after now', () => {
    const w = computeStutterWindow(1.2, BEATS, DOWNBEATS);
    expect(w.startSec).toBe(1.5);
  });

  it('uses half a beat as the slice duration', () => {
    const w = computeStutterWindow(1.2, BEATS, DOWNBEATS);
    // local beat interval = 0.5 → slice = 0.25
    expect(w.sliceDurSec).toBeCloseTo(0.25, 5);
  });

  it('uses one bar (downbeat-to-downbeat) as the burst duration', () => {
    const w = computeStutterWindow(1.2, BEATS, DOWNBEATS);
    expect(w.burstDurSec).toBeCloseTo(2.0, 5);
  });

  it('falls back to 4 beats when downbeats are absent', () => {
    const w = computeStutterWindow(1.2, BEATS, []);
    expect(w.burstDurSec).toBeCloseTo(2.0, 5); // 4 * 0.5
  });

  it('extrapolates a beat past the end for tail triggers', () => {
    const w = computeStutterWindow(3.7, BEATS, DOWNBEATS);
    expect(w.startSec).toBe(4.0);
    expect(w.sliceDurSec).toBeGreaterThan(0);
  });

  it('returns now-aligned window when there are no beats', () => {
    const w = computeStutterWindow(2.3, [], []);
    expect(w.startSec).toBe(2.3);
    expect(w.sliceDurSec).toBeGreaterThan(0);
    expect(w.burstDurSec).toBeGreaterThan(0);
  });
});
