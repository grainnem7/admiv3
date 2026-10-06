/**
 * The band: a pad holding the chord, a bass root under it and a groove, so that one or
 * two counters already sound like music (design part C).
 *
 * The player is always the foreground:
 *  - the band is silent on an empty board, comes in on the pass AFTER the first counter
 *    goes down, and stops once the pass in which the last counter was lifted has finished
 *    (the engine keeps that clock; this module only answers "what plays on this step");
 *  - it makes room: as soon as the player has a counter of a part's role, that part drops
 *    out — placing a bass counter is taking over the bass, never doubling it;
 *  - it follows the player's chords (chord counters, or a backing song), and with none it
 *    plays each world's own gentle progression, which the phrases follow too.
 *
 * Pure: same step, same answer.
 */

import { degreeMidi } from '../boardSequencerScale';
import { grooveFor, type DrumHit } from '../phrases/phrases';
import type { SoundWorldId } from '../../audio/worlds/soundWorlds';
import type { KitDrum } from '../../audio/instruments/RoundRobinDrumKit';

export type BandLevel = 'off' | 'gentle' | 'full';
export type BandPart = 'pad' | 'bass' | 'groove';
export const BAND_PARTS: BandPart[] = ['pad', 'bass', 'groove'];

export interface Harmony { root: number; tones: number[] }

export interface BandInput {
  level: BandLevel;
  /** Step within the loop (0 … loop - 1). */
  step: number;
  loop: number;
  style: SoundWorldId;
  /** The chord on this step; null when there is no harmony at all. */
  harmony: Harmony | null;
  /** True when this step starts a new chord (or the loop): the pad re-sounds, the bass lands. */
  chordChange: boolean;
  /** Steps until the chord changes again (or the loop ends): how long held notes last. */
  chordSpan: number;
  /** Roles the player has counters for: the band's part for each is silent. */
  playerRoles: ReadonlySet<'melody' | 'chord' | 'bass' | 'drums'>;
}

export interface BandEvent {
  part: BandPart;
  /** Beats after the step starts (0 ≤ offset < 1). */
  offset: number;
  /** Length in beats. */
  dur: number;
  /** Loudness 0–1, before the band's own level. */
  accent: number;
  midi?: number;
  drum?: KitDrum;
}

/** The band's level under the player's notes, per setting (linear gain). */
export const BAND_GAIN: Record<BandLevel, number> = { off: 0, gentle: 0.32, full: 0.45 };

/** The part a player's role takes over. */
const PART_OF_ROLE: Record<'melody' | 'chord' | 'bass' | 'drums', BandPart | null> = {
  melody: null, chord: 'pad', bass: 'bass', drums: 'groove',
};

/** Which of the band's parts play, given what the player has taken over. */
export function bandParts(level: BandLevel, playerRoles: ReadonlySet<string>): BandPart[] {
  if (level === 'off') return [];
  const taken = new Set<BandPart>();
  for (const [role, part] of Object.entries(PART_OF_ROLE)) if (part && playerRoles.has(role)) taken.add(part);
  return BAND_PARTS.filter((p) => !taken.has(p));
}

/**
 * Each world's own progression when nobody has set a chord, as positions along the scale
 * (0 = the key note, 1 = an octave up), so it is in key whatever the scale's size. Four
 * chords, one per quarter of the loop.
 */
const PROGRESSION: Record<SoundWorldId, number[]> = {
  warm: [0, 5 / 7, 3 / 7, 4 / 7],        // I  vi  IV  V
  lofi: [1 / 7, 4 / 7, 0, 0],            // ii V  I   I
  ambient: [0, 3 / 7, 0, 5 / 7],         // I  IV  I   vi
  electronic: [0, 5 / 7, 3 / 7, 6 / 7],  // I  vi  IV  VII
};

/** The chord of the world's own progression on `step`. */
export function defaultHarmonyAt(
  style: SoundWorldId, step: number, loop: number, rootMidi: number, semitones: readonly number[],
): Harmony {
  const len = Math.max(1, semitones.length);
  const prog = PROGRESSION[style];
  const span = Math.max(1, Math.floor(loop / prog.length));
  const i = Math.min(prog.length - 1, Math.floor((((step % loop) + loop) % loop) / span));
  const degree = Math.round(prog[i] * len) % len;
  const semis = [...semitones];
  const tones = [0, 2, 4].map((o) => degreeMidi(degree + o, rootMidi, semis));
  return { root: tones[0], tones };
}

/** Move a note into [lo, lo + 12). */
function intoOctave(midi: number, lo: number): number {
  let n = midi;
  while (n >= lo + 12) n -= 12;
  while (n < lo) n += 12;
  return n;
}

/** The band's notes on one step. */
export function bandEventsAtStep(input: BandInput): BandEvent[] {
  const parts = bandParts(input.level, input.playerRoles);
  if (parts.length === 0 || input.loop <= 0) return [];
  const out: BandEvent[] = [];
  const h = input.harmony;
  const span = Math.max(1, input.chordSpan);
  const full = input.level === 'full';

  if (h && parts.includes('pad') && input.chordChange) {
    // Voiced in the middle of the keyboard, held until the chord changes.
    const voiced = h.tones.map((t) => intoOctave(t, 57)).sort((a, b) => a - b);
    for (const midi of voiced) out.push({ part: 'pad', offset: 0, dur: span - 0.05, accent: full ? 0.7 : 0.55, midi });
  }

  if (h && parts.includes('bass')) {
    const root = intoOctave(h.root, 36);
    if (input.chordChange) out.push({ part: 'bass', offset: 0, dur: full ? Math.min(span, 1.9) : span - 0.05, accent: 0.8, midi: root });
    if (full) {
      // A walk under the chord: the fifth halfway through, the octave leading into the next.
      const into = (input.step % input.loop);
      const changeIn = span; // steps until the next change, counted from this step when chordChange
      if (!input.chordChange && changeIn === 1) out.push({ part: 'bass', offset: 0.5, dur: 0.45, accent: 0.6, midi: root + 12 });
      else if (!input.chordChange && into % 2 === 0) out.push({ part: 'bass', offset: 0, dur: 0.9, accent: 0.65, midi: root + 7 });
    }
  }

  if (parts.includes('groove')) {
    const beat = input.step % 4;
    const hits: DrumHit[] = full
      ? grooveFor(input.style, 2)
      : [
        // Gentle: a soft pulse, hats on the eighths and a quiet kick on the one.
        { at: 0, drum: 'kick', accent: 0.5 },
        ...[0, 2, 4, 6, 8, 10, 12, 14].map((at): DrumHit => ({ at, drum: 'hat', accent: at % 4 === 0 ? 0.35 : 0.25 })),
      ];
    for (const hit of hits) {
      if (Math.floor(hit.at / 4) !== beat) continue;
      out.push({ part: 'groove', offset: (hit.at % 4) / 4, dur: 0.25, accent: hit.accent * (full ? 0.85 : 1), drum: hit.drum });
    }
  }
  return out;
}
