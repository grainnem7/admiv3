import { describe, it, expect } from 'vitest';
import {
  clockView, cuesCrossed, cueText, DEFAULT_PERFORMANCE, endingDue, endingLeadSec, formatClock, parseClock,
  sanitizePerformance, scenesDue,
} from '../songs/performance/clock';
import { DEFAULT_LOOP_COLOUR_OPTIONS, initialLoopColourState, stepLoopColours } from '../songs/performance/loopColours';

describe('the performance clock', () => {
  it('counts down from the length and names its phases', () => {
    const len = 7 * 60;
    expect(clockView(null, 0, len, false)).toMatchObject({ phase: 'idle', text: '7:00' });
    expect(clockView(0, 10_000, len, false)).toMatchObject({ phase: 'running', text: '6:50' });
    expect(clockView(0, (len - 45) * 1000, len, false).phase).toBe('lastMinute');
    expect(clockView(0, (len - 20) * 1000, len, false).phase).toBe('lastMoments');
    expect(clockView(0, (len + 15) * 1000, len, false)).toMatchObject({ phase: 'over', text: '-0:15', remainingSec: 0 });
    expect(clockView(0, 1000, len, true).phase).toBe('ending');
  });

  it('gives each cue once, as the clock crosses it', () => {
    expect(cuesCrossed(61, 59)).toEqual([60]);
    expect(cuesCrossed(59, 58)).toEqual([]);
    expect(cuesCrossed(35, 8)).toEqual([30, 10]);
    expect(cueText(60)).toBe('1 minute left');
    expect(cueText(30)).toBe('30 seconds left');
  });

  it('an automatic fade begins its passes before the end; a stop at the end; a cue never', () => {
    const passSec = 8 * 60 / 90; // 8 beats at 90 BPM
    const fade = { ...DEFAULT_PERFORMANCE, ending: 'fade' as const, fadePasses: 2 };
    expect(endingLeadSec(fade, passSec)).toBeCloseTo(2 * passSec, 9);
    expect(endingDue(fade, 2 * passSec + 1, passSec)).toBe(false);
    expect(endingDue(fade, 2 * passSec - 0.1, passSec)).toBe(true);
    expect(endingDue({ ...fade, ending: 'stop' }, 0.5, passSec)).toBe(false);
    expect(endingDue({ ...fade, ending: 'stop' }, 0, passSec)).toBe(true);
    expect(endingDue({ ...fade, ending: 'cue' }, -100, passSec)).toBe(false);
  });

  it('scheduled scenes come due in time order, each once', () => {
    const scenes = [{ at: 120 }, { at: 30 }, { at: null }, { at: 30.5 }];
    expect(scenesDue(29, 31, scenes)).toEqual([1, 3]);
    expect(scenesDue(31, 119, scenes)).toEqual([]);
    expect(scenesDue(119, 121, scenes)).toEqual([0]);
  });

  it('reads and writes mm:ss', () => {
    expect(formatClock(425)).toBe('7:05');
    expect(parseClock('2:30')).toBe(150);
    expect(parseClock('90')).toBe(90);
    expect(parseClock('')).toBeNull();
    expect(parseClock('x')).toBeNull();
  });

  it('stored settings are made safe', () => {
    expect(sanitizePerformance({ lengthSec: 5, ending: 'explode', fadePasses: 3, startOn: 'manual' }))
      .toEqual({ lengthSec: 30, ending: 'cue', fadePasses: 2, startOn: 'manual' });
    expect(sanitizePerformance(undefined)).toEqual(DEFAULT_PERFORMANCE);
  });
});

describe('a counter as a loop', () => {
  const opts = DEFAULT_LOOP_COLOUR_OPTIONS;
  const run = (frames: boolean[], mode: 'hold' | 'toggle' = 'hold', dt = 50) => {
    let st = initialLoopColourState();
    const out: boolean[] = [];
    for (const here of frames) {
      const r = stepLoopColours(st, new Map([[2, here]]), { ...opts, mode }, dt);
      st = r.state;
      out.push(r.wanted.has(2));
    }
    return out;
  };

  it('hold: plays once the counter has settled, keeps through a lost frame, stops once it is really gone', () => {
    const seen = Array(5).fill(true);          // 250 ms: settled after 150
    const blip = [...seen, false, true, true]; // one lost frame
    const gone = [...blip, ...Array(14).fill(false)]; // 700 ms away
    const out = run(gone);
    expect(out[1]).toBe(false);
    expect(out[3]).toBe(true);
    expect(out[5]).toBe(true);   // the lost frame changes nothing
    expect(out.at(-1)).toBe(false);
  });

  it('toggle: each placement flips the loop, and lifting changes nothing', () => {
    const place = Array(4).fill(true);
    const lift = Array(14).fill(false);
    const out = run([...place, ...lift, ...place, ...lift], 'toggle');
    expect(out[3]).toBe(true);
    expect(out[17]).toBe(true);   // lifted: still on
    expect(out[21]).toBe(false);  // placed again: off
  });
});
