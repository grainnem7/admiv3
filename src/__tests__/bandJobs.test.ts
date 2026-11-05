import { describe, it, expect } from 'vitest';
import {
  AS_BEFORE_JOBS, DEFAULT_JOBS, PLAN_JOBS, bandJobsWords, counterRange, leadInEvents, padRangeAway, sameJobs, sanitizeBandJobs,
  sanitizeLeadIn, type BandJobs,
} from '../songs/band/bandJobs';
import { bandEventsAtStep, bandParts, type BandInput } from '../songs/band/band';
import { clashes, isStrongBeat } from '../songs/harmony/currentChord';

/** Harmony spec stage 2: a band with jobs. */

const ALL: BandJobs = { asBefore: false, pads: true, bass: true, drums: true, counter: true };
const C = { root: 60, tones: [60, 64, 67] };
const G7 = { root: 67, tones: [67, 71, 74, 77] };
const input = (over: Partial<BandInput> = {}): BandInput => ({
  level: 'full', step: 0, loop: 8, style: 'warm', harmony: C, chordChange: true, chordSpan: 4,
  playerRoles: new Set(['melody', 'chord', 'bass', 'drums']), playerCounters: 3, jobs: ALL, ...over,
});
const pc = (n: number): number => ((n % 12) + 12) % 12;

describe('band jobs: stored safely', () => {
  it('a save from before jobs existed (or nonsense) plays as before', () => {
    expect(sanitizeBandJobs(undefined)).toEqual(AS_BEFORE_JOBS);
    expect(sanitizeBandJobs('full')).toEqual(AS_BEFORE_JOBS);
    expect(sanitizeBandJobs({ pads: 'yes' })).toEqual(AS_BEFORE_JOBS);
    expect(AS_BEFORE_JOBS.asBefore).toBe(true);
  });

  it('keeps chosen jobs', () => {
    expect(sanitizeBandJobs({ asBefore: false, pads: true, bass: false, drums: true, counter: true }))
      .toEqual({ asBefore: false, pads: true, bass: false, drums: true, counter: true });
    // A job left out of a hand-edited save is off.
    expect(sanitizeBandJobs({ asBefore: false, pads: true })).toEqual({ asBefore: false, pads: true, bass: false, drums: false, counter: false });
  });

  it('new players and new scenes: pads, bass and drums that keep their jobs', () => {
    expect(DEFAULT_JOBS).toEqual({ asBefore: false, pads: true, bass: true, drums: true, counter: false });
    expect(sameJobs(DEFAULT_JOBS, { ...DEFAULT_JOBS })).toBe(true);
    expect(sameJobs(DEFAULT_JOBS, ALL)).toBe(false);
  });

  it('Make my plan builds: Arrival pads; Build pads and bass; Open all four; Home pads', () => {
    expect(PLAN_JOBS.map((j) => [j.pads, j.bass, j.drums, j.counter])).toEqual([
      [true, false, false, false], [true, true, false, false], [true, true, true, true], [true, false, false, false],
    ]);
    expect(PLAN_JOBS.every((j) => !j.asBefore)).toBe(true);
  });

  it('says the jobs in words', () => {
    expect(bandJobsWords(AS_BEFORE_JOBS)).toBe('band parts as before');
    expect(bandJobsWords(ALL)).toBe('pads, bass, drums, counter-melody');
    expect(bandJobsWords({ ...ALL, pads: false, bass: false, drums: false, counter: false })).toBe('no band parts');
  });

  it('a lead-in is None, Drum fill or Rising; anything else is None', () => {
    expect(sanitizeLeadIn('drumFill')).toBe('drumFill');
    expect(sanitizeLeadIn('rising')).toBe('rising');
    expect(sanitizeLeadIn('tuba')).toBe('none');
    expect(sanitizeLeadIn(undefined)).toBe('none');
  });
});

describe('band jobs: the band keeps its jobs whatever Tim plays', () => {
  it('at Full with Tim on bass, chords and drums: pads, drums and counter-melody still play; the bass steps aside', () => {
    expect(bandParts('full', new Set(['bass', 'chord', 'drums']), 3, ALL, true)).toEqual(['pad', 'groove', 'counter']);
    // His bass lifted: the band's comes back.
    expect(bandParts('full', new Set(['chord', 'drums']), 2, ALL, false)).toEqual(['pad', 'bass', 'groove', 'counter']);
    // Jobs that are off stay off; a band that is off plays nothing.
    expect(bandParts('full', new Set(), 1, { ...ALL, drums: false, counter: false }, false)).toEqual(['pad', 'bass']);
    expect(bandParts('off', new Set(), 1, ALL, false)).toEqual([]);
  });

  it('as before: the band still hands Tim the parts he takes, and builds with his counters', () => {
    expect(bandParts('full', new Set(['bass', 'chord', 'drums']), 3, AS_BEFORE_JOBS, true)).toEqual([]);
    expect(bandParts('gentle', new Set(['melody']), 1, AS_BEFORE_JOBS, false)).toEqual(['pad']);
  });

  it('pads sound under Tim’s chords, thinned to the root and the fifth and voiced away from them', () => {
    const pads = bandEventsAtStep(input({ chordRegister: { lo: 60, hi: 72 } })).filter((e) => e.part === 'pad');
    // A bed under his chord, not a second copy of it (density, S2).
    expect(pads.length).toBe(2);
    expect(pads.map((e) => pc(e.midi!)).sort((a, b) => a - b)).toEqual([0, 7]);
    for (const e of pads) expect(e.midi! < 60 || e.midi! > 72).toBe(true);
  });

  it('pad register: below chord parts that sit high, above ones that sit low, the middle with none', () => {
    expect(padRangeAway(null)).toEqual([52, 72]);
    const [lo, hi] = padRangeAway({ lo: 62, hi: 76 });
    expect(hi).toBeLessThan(62);
    expect(hi - lo).toBeGreaterThanOrEqual(12);
    const [lo2, hi2] = padRangeAway({ lo: 45, hi: 57 });
    expect(lo2).toBeGreaterThan(57);
    expect(hi2 - lo2).toBeGreaterThanOrEqual(12);
    // Never down on the bass: chords in the middle (A3 to F4) send the pads above them.
    expect(padRangeAway({ lo: 57, hi: 65 })[0]).toBeGreaterThan(65);
    for (let lo = 40; lo <= 80; lo++) expect(padRangeAway({ lo, hi: lo + 7 })[0]).toBeGreaterThanOrEqual(48);
  });

  it('drums play only on steps the board’s and loops’ drums leave empty', () => {
    const grooveAt = (step: number, drumsHere: boolean) =>
      bandEventsAtStep(input({ step, chordChange: false, drumsHere })).filter((e) => e.part === 'groove');
    expect(grooveAt(0, false).length).toBeGreaterThan(0);
    for (let s = 0; s < 8; s++) expect(grooveAt(s, true)).toEqual([]);
  });

  it('the bass steps aside while a bass of Tim’s or a loop’s is down', () => {
    const bass = (bassTaken: boolean) => bandEventsAtStep(input({ bassTaken })).filter((e) => e.part === 'bass');
    expect(bass(true)).toEqual([]);
    expect(bass(false)).toHaveLength(1);
  });

  it('counter-melody: only in the gaps of Tim’s melody, never his note, a chord note on strong beats, another register', () => {
    for (const harmony of [C, G7]) {
      for (let step = 0; step < 8; step++) {
        const strong = isStrongBeat(step);
        const melodyHere = step % 3 === 0;
        const avoidPcs = [pc(harmony.tones[1])];
        const ev = bandEventsAtStep(input({
          step, harmony, chordChange: false, melodyHere, avoidPcs, strong, melodyRegister: { lo: 64, hi: 76 }, previousCounter: 82,
        })).filter((e) => e.part === 'counter');
        if (melodyHere) { expect(ev).toEqual([]); continue; }
        for (const e of ev) {
          expect(avoidPcs).not.toContain(pc(e.midi!));
          if (strong) expect(harmony.tones.map(pc)).toContain(pc(e.midi!));
          expect(clashes(e.midi!, harmony.tones)).toBe(false);
          expect(e.midi! < 64 || e.midi! > 76).toBe(true);
        }
      }
    }
  });

  it('counter-melody register: above a low melody, below a high one', () => {
    const [lo, hi] = counterRange({ lo: 60, hi: 67 });
    expect(lo).toBeGreaterThan(67);
    const [lo2, hi2] = counterRange({ lo: 74, hi: 84 });
    expect(hi2).toBeLessThan(74);
    expect(hi - lo).toBeGreaterThanOrEqual(10);
    expect(hi2 - lo2).toBeGreaterThanOrEqual(10);
  });

  it('Quiet: the counter-melody only on strong beats; Full: in every gap', () => {
    const count = (level: BandInput['level']) => Array.from({ length: 8 }, (_, step) => bandEventsAtStep(input({
      level, step, chordChange: false, strong: isStrongBeat(step), melodyHere: false,
    })).filter((e) => e.part === 'counter').length).reduce((a, b) => a + b, 0);
    expect(count('gentle')).toBe(4);
    expect(count('full')).toBe(8);
  });
});

describe('lead-in into a scene', () => {
  it('None plays nothing', () => {
    for (let left = 0; left <= 16; left++) expect(leadInEvents('none', left, 16, C)).toEqual([]);
  });

  it('on the last beat of any lead in the bass steps up to the fifth, the approach into the root', () => {
    for (const kind of ['drumFill', 'rising'] as const) {
      const bass = leadInEvents(kind, 1, 8, C).filter((e) => e.midi !== undefined && e.midi < 48);
      expect(bass).toHaveLength(1);
      expect(pc(bass[0].midi!)).toBe(7); // G under C
      expect(leadInEvents(kind, 2, 8, C).filter((e) => e.midi !== undefined && e.midi < 48)).toEqual([]);
    }
    expect(leadInEvents('none', 1, 8, C)).toEqual([]);
    expect(leadInEvents('drumFill', 1, 8, null).filter((e) => e.midi !== undefined)).toEqual([]);
  });

  it('Drum fill: the last bar before the scene, louder towards it, and a crash as it lands', () => {
    // The drums of the fill; the bass approach on the last beat is its own test.
    const hits = (left: number) => leadInEvents('drumFill', left, 16, C).filter((e) => e.drum !== undefined);
    expect(hits(5)).toEqual([]);
    expect(hits(4).length).toBeGreaterThan(0);
    expect(hits(1).length).toBeGreaterThanOrEqual(hits(4).length);
    expect(Math.max(...hits(1).map((e) => e.accent))).toBeGreaterThan(Math.max(...hits(4).map((e) => e.accent)));
    expect(hits(0).map((e) => e.drum)).toContain('crash');
    expect([...hits(4), ...hits(1)].every((e) => e.drum !== undefined)).toBe(true);
  });

  it('Rising: notes of the chord that climb and grow over the last pass', () => {
    const notes = Array.from({ length: 8 }, (_, i) => leadInEvents('rising', 8 - i, 8, C)).flat().filter((e) => e.midi! >= 48);
    expect(notes.length).toBeGreaterThanOrEqual(8);
    for (const n of notes) expect(C.tones.map(pc)).toContain(pc(n.midi!));
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i].midi!).toBeGreaterThanOrEqual(notes[i - 1].midi!);
      expect(notes[i].accent).toBeGreaterThanOrEqual(notes[i - 1].accent);
    }
    expect(leadInEvents('rising', 9, 8, C)).toEqual([]);
    expect(leadInEvents('rising', 4, 8, null)).toEqual([]);
  });
});
