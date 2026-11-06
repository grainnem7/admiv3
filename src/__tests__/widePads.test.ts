import { describe, it, expect } from 'vitest';
import { bandEventsAtStep, WIDE_PAD_RANGE } from '../songs/band/band';
import { harmonyFromChord, voiceLead } from '../songs/harmony/harmony';
import { sequenceAt, type ChordSequenceId } from '../songs/harmony/currentChord';

/**
 * The wide pads' upper layer, chord after chord (the demo's pads, 2026-11-06). It once ran
 * away: a voicing that fitted nowhere fed the next chord a lower start, and by three minutes
 * into the demo the pads were sending notes 0, 1 and 4, the bottom of MIDI.
 */
describe('the wide pads', () => {
  it('chord after chord, through every sequence and key: the upper layer stays in its range, never runs away', () => {
    const keys = [[69, [0, 2, 4, 7, 9]], [69, [0, 3, 5, 7, 10]], [71, [0, 2, 4, 7, 9]], [62, [0, 2, 4, 5, 7, 9, 11]]] as const;
    const seqs: ChordSequenceId[] = ['still', 'calm', 'tense', 'home', 'rising', 'dreamy'];
    let previousUpper: number[] | null = null;
    let checked = 0;
    for (let round = 0; round < 5; round++) {
      for (const [root, semis] of keys) {
        for (const sequence of seqs) {
          for (let k = 0; k < 6; k++) {
            const h = sequenceAt({ setting: { sequence, bars: 1 }, style: 'warm', rootMidi: root, semitones: semis, beatsIn: k * 4, step: 0, loop: 8, bandOn: true }).harmony;
            const events = bandEventsAtStep({
              level: 'full', step: 0, loop: 8, style: 'warm', harmony: h, chordChange: true, chordSpan: 4,
              playerRoles: new Set(), jobs: { asBefore: false, pads: true, bass: false, drums: false, counter: false },
              chordRegister: { lo: 52, hi: 62 }, widePads: true, previousUpper,
            });
            const upper = events.filter((e) => e.upper).map((e) => e.midi ?? NaN);
            expect(upper.length).toBeGreaterThan(0);
            for (const m of upper) {
              expect(Number.isFinite(m)).toBe(true);
              expect(m).toBeGreaterThanOrEqual(WIDE_PAD_RANGE[0]);
              expect(m).toBeLessThanOrEqual(WIDE_PAD_RANGE[1]);
            }
            previousUpper = upper;
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(5 * 4 * 6 * 6);
  });

  it('a voicing led from one that had wandered out of the register starts again in the middle of it', () => {
    const a = harmonyFromChord({ rootPc: 9, pcs: [9, 1, 4], symbol: 'A', degree: 0 });
    const v = voiceLead({ pcs: a.pcs ?? [] }, [2, 6, 9], 60, 72);
    for (const n of v) {
      expect(n).toBeGreaterThanOrEqual(60);
      expect(n).toBeLessThanOrEqual(72);
    }
  });
});
