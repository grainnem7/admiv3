import { describe, it, expect } from 'vitest';
import {
  AS_BEFORE_CHORDS, CHORD_SEQUENCE_IDS, clashes, counterChord, currentChord, fitToChord, isStrongBeat, sequenceAt,
  type ChordCounter, type ChordSetting, type CurrentChordInput, type SequenceInput,
} from '../songs/harmony/currentChord';
import { defaultHarmonyAt, bandEventsAtStep } from '../songs/band/band';
import type { SoundWorldId } from '../audio/worlds/soundWorlds';

/**
 * One shared harmony (spec 2026-10-28, stage 1): the current chord at every step, for a
 * scene's sequence, with chord counters (the player's and a loop's) and a locked song; and
 * the clash nudge.
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENT = [0, 2, 4, 7, 9];
const ROWS = 8;
/** The row whose note is scale degree `d` (row 7 = the key note). */
const rowOf = (d: number): number => ROWS - 1 - d;

interface Board {
  setting: ChordSetting;
  style?: SoundWorldId;
  semitones?: number[];
  loop?: number;
  counters?: ChordCounter[];
  songChord?: number[] | null;
  bandOn?: boolean;
  /** The beat the sequence started on. */
  origin?: number;
}

/** The chord on a beat, as the engine works it out: the loop column from the beat. */
function chordOn(b: Board, beat: number) {
  const loop = b.loop ?? 16;
  const step = ((beat % loop) + loop) % loop;
  const seq = (back: number) => sequenceAt({
    setting: b.setting, style: b.style ?? 'warm', rootMidi: 60, semitones: b.semitones ?? MAJOR,
    beatsIn: beat - back - (b.origin ?? 0), step: step - back, loop, bandOn: b.bandOn ?? true,
  } satisfies SequenceInput);
  const input: CurrentChordInput = {
    step, counters: b.counters ?? [], rows: ROWS, rootMidi: 60, semitones: b.semitones ?? MAJOR,
    style: b.style ?? 'warm', songChord: b.songChord ?? null, sequence: seq,
  };
  return currentChord(input);
}
const symbols = (b: Board, beats: number) => Array.from({ length: beats }, (_, i) => chordOn(b, i).harmony?.symbol ?? '-');
/** The chord at the start of each bar. */
const bars = (b: Board, n: number) => Array.from({ length: n }, (_, i) => chordOn(b, i * 4).harmony?.symbol ?? '-');

describe('the current chord: a scene’s sequence', () => {
  it('Rising, two bars each: I–V–vi–IV, then round again', () => {
    expect(bars({ setting: { sequence: 'rising', bars: 2 } }, 10)).toEqual(['C', 'C', 'G7', 'G7', 'Am', 'Am', 'F', 'F', 'C', 'C']);
  });

  it('each chord lasts 1, 2 or 4 bars as chosen', () => {
    expect(bars({ setting: { sequence: 'calm', bars: 1 } }, 4)).toEqual(['C', 'F', 'C', 'F']);
    expect(bars({ setting: { sequence: 'calm', bars: 4 } }, 9)).toEqual(['C', 'C', 'C', 'C', 'F', 'F', 'F', 'F', 'C']);
  });

  it('starts at the scene’s first pass, not at the start of the run', () => {
    const b: Board = { setting: { sequence: 'home', bars: 1 }, origin: 32 };
    expect(chordOn(b, 32).harmony?.symbol).toBe('F');
    expect(chordOn(b, 36).harmony?.symbol).toBe('G7');
    expect(chordOn(b, 40).harmony?.symbol).toBe('C');
  });

  it('the named choices: Calm, Dreamy (with the minor four), Tense (with sus chords), Home, Still', () => {
    expect(bars({ setting: { sequence: 'dreamy', bars: 1 } }, 4)).toEqual(['C', 'Em', 'F', 'Fm']);
    expect(bars({ setting: { sequence: 'tense', bars: 1 } }, 4)).toEqual(['Am', 'Fsus2', 'Csus2', 'Gsus4']);
    expect(bars({ setting: { sequence: 'home', bars: 1 } }, 3)).toEqual(['F', 'G7', 'C']);
    // Still: one open chord, the key note and its fifth, all the way.
    const still = Array.from({ length: 12 }, (_, i) => chordOn({ setting: { sequence: 'still', bars: 1 } }, i * 4).harmony!.tones.map((t) => t % 12));
    for (const t of still) expect([...new Set(t)].sort((a, b) => a - b)).toEqual([0, 7]);
  });

  it('a sus chord is used only where the key has its note: never a note from outside the key', () => {
    for (const id of CHORD_SEQUENCE_IDS.filter((s) => s !== 'dreamy')) {
      for (const semitones of [MAJOR, PENT, [0, 3, 5, 7, 10]]) {
        for (let beat = 0; beat < 64; beat += 4) {
          const h = chordOn({ setting: { sequence: id, bars: 1 }, semitones, style: 'electronic', loop: 16 }, beat).harmony;
          if (!h) continue;
          const parent = semitones === MAJOR || semitones === PENT ? MAJOR : [0, 2, 3, 5, 7, 8, 10];
          for (const t of h.tones) expect(parent).toContain(((t - 60) % 12 + 12) % 12);
        }
      }
    }
  });

  it('the world’s own, two bars each: today’s progression, stretched', () => {
    expect(bars({ setting: { sequence: 'world', bars: 2 }, style: 'warm' }, 8)).toEqual(['C', 'C', 'Am', 'Am', 'F', 'F', 'G7', 'G7']);
  });

  it('“As before” is exactly what played before: four chords to the loop, only with the band on', () => {
    for (const style of ['warm', 'lofi', 'ambient', 'electronic'] as const) {
      for (let step = 0; step < 16; step++) {
        const now = chordOn({ setting: AS_BEFORE_CHORDS, style, semitones: PENT, loop: 16 }, step).harmony;
        expect(now).toEqual(defaultHarmonyAt(style, step, 16, 60, PENT));
      }
    }
    expect(chordOn({ setting: AS_BEFORE_CHORDS, bandOn: false }, 3)).toEqual({ harmony: null, from: 'none' });
  });
});

describe('the current chord: chord counters change one chord', () => {
  const rising: ChordSetting = { sequence: 'rising', bars: 2 };

  it('one counter changes only its own part: from its column until the sequence moves on', () => {
    // Dm (degree 1) in column 2 of a 16-step loop, under Rising (C for 8 beats, then G7).
    const b: Board = { setting: rising, counters: [{ row: rowOf(1), col: 2, live: true }] };
    expect(symbols(b, 16)).toEqual(['C', 'C', 'Dm', 'Dm', 'Dm', 'Dm', 'Dm', 'Dm', 'G7', 'G7', 'G7', 'G7', 'G7', 'G7', 'G7', 'G7']);
    // The next time round the loop the sequence has moved on (vi, then IV): the counter
    // changes the chord in the same place again, and only there.
    expect(symbols(b, 32).slice(16)).toEqual(['Am', 'Am', 'Dm', 'Dm', 'Dm', 'Dm', 'Dm', 'Dm', 'F', 'F', 'F', 'F', 'F', 'F', 'F', 'F']);
  });

  it('a counter in the first column no longer owns the whole loop', () => {
    // Before, Dm in column 0 owned all 16 steps, every time round (the piece sat on one chord).
    const b: Board = { setting: rising, counters: [{ row: rowOf(1), col: 0, live: true }] };
    expect(symbols(b, 16)).toEqual([...Array(8).fill('Dm'), ...Array(8).fill('G7')]);
    expect(symbols(b, 32).slice(16)).toEqual([...Array(8).fill('Dm'), ...Array(8).fill('F')]);
  });

  it('two counters: each sets the chord up to the next', () => {
    const b: Board = { setting: rising, counters: [{ row: rowOf(1), col: 2, live: true }, { row: rowOf(2), col: 5, live: true }] };
    expect(symbols(b, 10)).toEqual(['C', 'C', 'Dm', 'Dm', 'Dm', 'Em', 'Em', 'Em', 'G7', 'G7']);
  });

  it('two in one column: the lower one names the chord', () => {
    const b: Board = { setting: rising, counters: [{ row: rowOf(1), col: 2, live: true }, { row: rowOf(3), col: 2, live: true }] };
    expect(chordOn(b, 2).harmony?.symbol).toBe('Dm');
  });

  it('a loop’s chord counter works the same way; the player’s wins where both are', () => {
    const loopOnly: Board = { setting: rising, counters: [{ row: rowOf(3), col: 4, live: false }] };
    expect(symbols(loopOnly, 10)).toEqual(['C', 'C', 'C', 'C', 'F', 'F', 'F', 'F', 'G7', 'G7']);
    const both: Board = { setting: rising, counters: [{ row: rowOf(3), col: 4, live: false }, { row: rowOf(1), col: 6, live: true }] };
    expect(symbols(both, 10)).toEqual(['C', 'C', 'C', 'C', 'F', 'F', 'Dm', 'Dm', 'G7', 'G7']);
    expect(chordOn(both, 6).from).toBe('counter');
    expect(chordOn(both, 6).owner?.live).toBe(true);
  });

  it('with Still (one chord all the way) a counter lasts to the next counter or the end of the loop', () => {
    const b: Board = { setting: { sequence: 'still', bars: 1 }, loop: 8, counters: [{ row: rowOf(3), col: 3, live: true }] };
    expect(symbols(b, 8).map((s) => (s === 'F' ? 'F' : 'I'))).toEqual(['I', 'I', 'I', 'F', 'F', 'F', 'F', 'F']);
  });

  it('“As before” with the band off: no chord until a counter, which then lasts to the end of the loop', () => {
    const b: Board = { setting: AS_BEFORE_CHORDS, bandOn: false, loop: 8, counters: [{ row: rowOf(4), col: 2, live: true }] };
    expect(symbols(b, 8)).toEqual(['-', '-', 'G7', 'G7', 'G7', 'G7', 'G7', 'G7']);
  });

  it('a locked backing song’s chord wins over counters and the sequence', () => {
    const b: Board = { setting: rising, counters: [{ row: rowOf(1), col: 0, live: true }], songChord: [65, 69, 72] };
    expect(chordOn(b, 3)).toEqual({ harmony: { root: 65, tones: [65, 69, 72] }, from: 'song' });
  });

  it('a counter names the key’s own chord on its row, as before', () => {
    expect(counterChord(rowOf(5), ROWS, 60, MAJOR, 'warm').symbol).toBe('Am');
  });
});

describe('the clash nudge', () => {
  const C = [60, 64, 67];
  it('a note a semitone from a chord note moves to the nearest chord note', () => {
    expect(fitToChord(65, C)).toBe(64); // F over C → E
    expect(fitToChord(71, C)).toBe(72); // B over C → C
    expect(fitToChord(61, C)).toBe(60); // C# → C
    expect(fitToChord(66, C)).toBe(67); // F# → G
  });

  it('a chord note, or a scale note that doesn’t rub, stays the player’s', () => {
    expect(fitToChord(64, C)).toBe(64);
    expect(fitToChord(62, C)).toBe(62); // D: a tone from C and E, no rub
    expect(fitToChord(69, C)).toBe(69); // A: no rub
    expect(fitToChord(50, C)).toBe(50);
  });

  it('works in any octave (the bass, an octave and more down)', () => {
    expect(fitToChord(41, C)).toBe(40);
    expect(clashes(41, C)).toBe(true);
  });

  it('strong beats are the first and third of the bar', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(isStrongBeat)).toEqual([true, false, true, false, true, false, true, false]);
  });
});

describe('no clash on strong beats (random boards)', () => {
  // A small deterministic random, so a failure can be replayed.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  }
  it('every band pitch and every nudged one-note melody and bass note on a strong beat is a chord note or does not rub', () => {
    const r = rng(7);
    const styles: SoundWorldId[] = ['warm', 'lofi', 'ambient', 'electronic'];
    for (let trial = 0; trial < 200; trial++) {
      const setting: ChordSetting = {
        sequence: CHORD_SEQUENCE_IDS[Math.floor(r() * CHORD_SEQUENCE_IDS.length)],
        bars: ([1, 2, 4] as const)[Math.floor(r() * 3)],
      };
      const style = styles[Math.floor(r() * styles.length)];
      const semitones = r() < 0.5 ? MAJOR : PENT;
      const loop = [8, 12, 16][Math.floor(r() * 3)];
      const counters: ChordCounter[] = Array.from({ length: Math.floor(r() * 4) }, () => ({
        row: Math.floor(r() * ROWS), col: Math.floor(r() * loop), live: r() < 0.7,
      }));
      const melody = Array.from({ length: loop }, () => (r() < 0.5 ? 60 + semitones[Math.floor(r() * semitones.length)] + 12 * Math.floor(r() * 2) : null));
      const b: Board = { setting, style, semitones, loop, counters };
      let prev = '';
      for (let beat = 0; beat < 64; beat++) {
        const h = chordOn(b, beat).harmony;
        if (!h || !isStrongBeat(beat % loop)) { prev = h ? h.tones.join() : ''; continue; }
        const step = beat % loop;
        const m = melody[step];
        if (m !== null) {
          expect(clashes(fitToChord(m, h.tones), h.tones)).toBe(false);
          expect(clashes(fitToChord(m - 24, h.tones), h.tones)).toBe(false);
        }
        const change = h.tones.join() !== prev;
        prev = h.tones.join();
        const band = bandEventsAtStep({
          level: 'full', step, loop, style, harmony: h, chordChange: change, chordSpan: 2,
          playerRoles: new Set(), playerCounters: 9,
        });
        for (const ev of band) if (ev.midi !== undefined && ev.offset === 0) expect(clashes(ev.midi, h.tones)).toBe(false);
      }
    }
  });
});
