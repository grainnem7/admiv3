import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KEEPING_TIME_LIMITS, LATE_WINDOW_SEC, TIME_SEEN_NONE, TimeKeeper, VALVE_ORDER, keepingTimeIndicator, keepingTimeNews, nextValveStep, type ValveStep,
} from '../songs/keepingTime';

/**
 * Keeping time (spec 2026-10-28): the meter that says whether the sound keeps up with the
 * wall clock, and the safety valve that drops extras when it falls behind.
 */

describe('the meter: clock drift', () => {
  it('an audio clock running 1 % slow gives the expected drift and rate', () => {
    const k = new TimeKeeper();
    k.start(5, 1000);
    // 100 s of wall time; the audio clock gets through only 99 s of it.
    const r = k.report(5 + 99, 1000 + 100_000);
    expect(r.runSec).toBeCloseTo(100, 6);
    expect(r.driftSec).toBeCloseTo(1, 6);
    expect(r.driftRate).toBeCloseTo(0.01, 6);
    expect(r.drifting).toBe(true);
  });

  it('a clock in step is not drifting, and a tiny wobble never counts', () => {
    const k = new TimeKeeper();
    k.start(0, 0);
    const r = k.report(420.02, 420_000);
    expect(Math.abs(r.driftSec)).toBeLessThan(0.05);
    expect(r.drifting).toBe(false);
  });

  it('drift is reported only past its own threshold (calibratable)', () => {
    const k = new TimeKeeper({ ...DEFAULT_KEEPING_TIME_LIMITS, driftSec: 3 });
    k.start(0, 0);
    expect(k.report(298, 300_000).drifting).toBe(false); // 2 s
    expect(k.report(296, 300_000).drifting).toBe(true); // 4 s
  });
});

describe('the meter: late and skipped beats', () => {
  it('counts late and skipped beats from a stalled tick, with the worst lateness and the time lost', () => {
    const k = new TimeKeeper();
    k.start(0, 0);
    // One stall: 3 beats sent late, the oldest 1.4 s late, 2 more dropped by the catch-up cap.
    k.late(30_000, 1.4, 3, 2);
    const r = k.report(31, 31_000);
    expect(r.lateBeats).toBe(3);
    expect(r.skippedBeats).toBe(2);
    expect(r.worstLateSec).toBeCloseTo(1.4, 6);
    expect(r.lostSec).toBeCloseTo(1.4, 6);
    expect(r.recentLostSec).toBeCloseTo(1.4, 6);
    expect(r.behind).toBe(true);
    expect(r.everBehind).toBe(true);
  });

  it('a healthy run is fine: nothing late, nothing skipped, not behind', () => {
    const k = new TimeKeeper();
    k.start(0, 0);
    const r = k.report(420, 420_000);
    expect(r).toMatchObject({ lateBeats: 0, skippedBeats: 0, lostSec: 0, behind: false, everBehind: false, drifting: false });
  });

  it('a one-off hiccup (a sample loading) is tolerated: no warning', () => {
    const k = new TimeKeeper();
    k.start(0, 0);
    k.late(60_000, 0.15, 1, 0);
    k.late(200_000, 0.3, 1, 0);
    const r = k.report(201, 201_000);
    expect(r.lateBeats).toBe(2);
    expect(r.behind).toBe(false);
    expect(r.everBehind).toBe(false);
  });

  it('several stalls close together add up to falling behind; once they are older than the window it is over', () => {
    const k = new TimeKeeper();
    k.start(0, 0);
    for (let i = 0; i < 4; i++) k.late(100_000 + i * 2000, 0.3, 1, 0);
    expect(k.report(107, 107_000).behind).toBe(true);
    const later = k.report(107 + LATE_WINDOW_SEC, 107_000 + LATE_WINDOW_SEC * 1000);
    expect(later.behind).toBe(false);
    expect(later.everBehind).toBe(true); // the run still remembers it
    expect(later.lostSec).toBeCloseTo(1.2, 6);
  });

  it('lost time counted since a moment leaves out what came before it', () => {
    const k = new TimeKeeper();
    k.start(0, 0);
    k.late(10_000, 1.5, 2, 0);
    expect(k.lostSince(11_000, 0)).toBeCloseTo(1.5, 6);
    expect(k.lostSince(11_000, 10_500)).toBe(0);
  });

  it('start() begins a new run', () => {
    const k = new TimeKeeper();
    k.start(0, 0);
    k.late(1000, 2, 4, 1);
    k.start(50, 50_000);
    expect(k.report(51, 51_000)).toMatchObject({ lateBeats: 0, skippedBeats: 0, lostSec: 0, everBehind: false });
  });
});

describe('the safety valve', () => {
  const allOn: Record<ValveStep, boolean> = { magenta: true, fill: true, evolve: true };

  it('steps in order: Magenta, then Extra notes, then Sounds change', () => {
    expect(VALVE_ORDER).toEqual(['magenta', 'fill', 'evolve']);
    const taken: ValveStep[] = [];
    for (let i = 0; i < 3; i++) {
      const s = nextValveStep({ behind: true, enabled: true, taken, inUse: allOn });
      expect(s).not.toBeNull();
      taken.push(s!);
    }
    expect(taken).toEqual(['magenta', 'fill', 'evolve']);
    expect(nextValveStep({ behind: true, enabled: true, taken, inUse: allOn })).toBeNull();
  });

  it('never steps without lateness', () => {
    expect(nextValveStep({ behind: false, enabled: true, taken: [], inUse: allOn })).toBeNull();
  });

  it('never steps when switched off', () => {
    expect(nextValveStep({ behind: true, enabled: false, taken: [], inUse: allOn })).toBeNull();
  });

  it('skips what is not playing: with the simple rules it starts at Extra notes; with nothing extra on, it does nothing', () => {
    expect(nextValveStep({ behind: true, enabled: true, taken: [], inUse: { magenta: false, fill: true, evolve: true } })).toBe('fill');
    expect(nextValveStep({ behind: true, enabled: true, taken: [], inUse: { magenta: false, fill: false, evolve: true } })).toBe('evolve');
    expect(nextValveStep({ behind: true, enabled: true, taken: [], inUse: { magenta: false, fill: false, evolve: false } })).toBeNull();
  });
});

describe('what the laptop is told while the piece plays', () => {
  const ok = { behind: false, everBehind: false, drifting: false };

  it('nothing at all while all is well', () => {
    const n = keepingTimeNews(TIME_SEEN_NONE, ok, []);
    expect(n.say).toEqual([]);
    expect(keepingTimeIndicator(ok, [])).toBeNull();
  });

  it('falling behind is said once, then each step of the valve', () => {
    let n = keepingTimeNews(TIME_SEEN_NONE, { behind: true, everBehind: true, drifting: false }, []);
    expect(n.say).toEqual(['The sound is falling behind.']);
    n = keepingTimeNews(n.seen, { behind: true, everBehind: true, drifting: false }, ['fill']);
    expect(n.say).toEqual(['Extra notes paused to keep the sound in time.']);
    n = keepingTimeNews(n.seen, { behind: false, everBehind: true, drifting: false }, ['fill']);
    expect(n.say).toEqual([]);
    n = keepingTimeNews(n.seen, { behind: true, everBehind: true, drifting: false }, ['fill', 'evolve']);
    expect(n.say).toEqual(['Sounds change paused to keep the sound in time.']);
  });

  it('a drifting clock is said once, with what to check', () => {
    const n = keepingTimeNews(TIME_SEEN_NONE, { ...ok, drifting: true }, []);
    expect(n.say).toEqual(['The sound’s clock is running slow: check the sound output.']);
    expect(keepingTimeNews(n.seen, { ...ok, drifting: true }, []).say).toEqual([]);
  });

  it('the indicator: shown once there is a problem, and stays for the run with what was paused', () => {
    expect(keepingTimeIndicator({ behind: true, everBehind: true, drifting: false }, [])).toEqual({
      lines: ['The sound is falling behind.'], canRestore: false,
    });
    expect(keepingTimeIndicator({ behind: false, everBehind: true, drifting: false }, ['magenta', 'fill'])).toEqual({
      lines: ['The sound fell behind earlier in this run.', 'Paused to keep the sound in time: Magenta, Extra notes.'], canRestore: true,
    });
    expect(keepingTimeIndicator({ ...ok, drifting: true }, [])).toEqual({
      lines: ['The sound’s clock is running slow: check the sound output.'], canRestore: false,
    });
  });
});
