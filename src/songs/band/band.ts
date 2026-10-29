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
 *  - it builds with the player: one or two counters get only the pad, the bass joins at
 *    BASS_FROM counters and the groove at GROOVE_FROM. Coming in whole, a hat on every
 *    eighth buried a single counter (one note of the player's to some 36 of the band's);
 *  - it follows the player's chords (chord counters, or a backing song), and with none it
 *    plays each world's own gentle progression, which the phrases follow too.
 *
 * Pure: same step, same answer.
 */

import { grooveFor, harmonyFromChord, type DrumHit, type Harmony as PhraseHarmony } from '../phrases/phrases';
import { bassNote, chordOnDegree, voiceLead } from '../harmony/harmony';
import { WORLD_PROGRESSION } from '../harmony/currentChord';
import type { SoundWorldId } from '../../audio/worlds/soundWorlds';
import type { KitDrum } from '../../audio/instruments/RoundRobinDrumKit';

export type BandLevel = 'off' | 'gentle' | 'full';
export type BandPart = 'pad' | 'bass' | 'groove';
export const BAND_PARTS: BandPart[] = ['pad', 'bass', 'groove'];

export type Harmony = PhraseHarmony;

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
  /** How many counters the player has down: the band builds with them (see bandParts). */
  playerCounters?: number;
  /** The pad's last voicing, so this chord moves to it by small steps. */
  previousPad?: readonly number[] | null;
}

export interface BandEvent {
  part: BandPart;
  /** For the pad: the voicing this chord took, to lead the next one from. */
  voicing?: number[];
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

/** The bass joins once the player has this many counters down. */
export const BASS_FROM = 3;
/** The groove joins once the player has this many counters down. */
export const GROOVE_FROM = 5;

/**
 * Which of the band's parts play, given what the player has taken over and how many
 * counters they have down (unknown = all of them, as before).
 */
export function bandParts(level: BandLevel, playerRoles: ReadonlySet<string>, playerCounters = Infinity): BandPart[] {
  if (level === 'off') return [];
  const taken = new Set<BandPart>();
  for (const [role, part] of Object.entries(PART_OF_ROLE)) if (part && playerRoles.has(role)) taken.add(part);
  if (playerCounters < BASS_FROM) taken.add('bass');
  if (playerCounters < GROOVE_FROM) taken.add('groove');
  return BAND_PARTS.filter((p) => !taken.has(p));
}

/** The chord of the world's own progression on `step`. */
export function defaultHarmonyAt(
  style: SoundWorldId, step: number, loop: number, rootMidi: number, semitones: readonly number[],
): Harmony {
  const prog = WORLD_PROGRESSION[style];
  const span = Math.max(1, Math.floor(loop / prog.length));
  const i = Math.min(prog.length - 1, Math.floor((((step % loop) + loop) % loop) / span));
  // The progression is written in sevenths of the key, whatever the board's scale.
  const degree = Math.round(prog[i] * 7) % 7;
  return harmonyFromChord(chordOnDegree(degree, rootMidi, semitones, style));
}

/** The chord's fifth above `root` (its tone nearest a perfect fifth), or the perfect fifth. */
function fifthAbove(root: number, tones: readonly number[]): number {
  let best = root + 7;
  let gap = Infinity;
  for (const t of tones) {
    const iv = (((t - root) % 12) + 12) % 12;
    if (iv >= 6 && iv <= 8 && Math.abs(iv - 7) < gap) { gap = Math.abs(iv - 7); best = root + iv; }
  }
  return best;
}

/** The band's notes on one step. */
export function bandEventsAtStep(input: BandInput): BandEvent[] {
  const parts = bandParts(input.level, input.playerRoles, input.playerCounters);
  if (parts.length === 0 || input.loop <= 0) return [];
  const out: BandEvent[] = [];
  const h = input.harmony;
  const span = Math.max(1, input.chordSpan);
  const full = input.level === 'full';

  if (h && parts.includes('pad') && input.chordChange) {
    // Led from the last voicing, so the pad moves by small steps and never jumps.
    const pcs = [...new Set(h.tones.map((t) => ((t % 12) + 12) % 12))];
    const voiced = voiceLead({ pcs }, input.previousPad ?? null, 52, 72);
    for (const midi of voiced) out.push({ part: 'pad', offset: 0, dur: span - 0.05, accent: full ? 0.7 : 0.55, midi, voicing: voiced });
  }

  if (h && parts.includes('bass')) {
    const root = bassNote({ rootPc: ((h.root % 12) + 12) % 12 }, 36);
    if (input.chordChange) out.push({ part: 'bass', offset: 0, dur: full ? Math.min(span, 1.9) : span - 0.05, accent: 0.8, midi: root });
    if (full) {
      // A walk under the chord: the fifth halfway through, the octave leading into the next.
      const into = (input.step % input.loop);
      const changeIn = span; // steps until the next change, counted from this step when chordChange
      if (!input.chordChange && changeIn === 1) out.push({ part: 'bass', offset: 0.5, dur: 0.45, accent: 0.6, midi: root + 12 });
      // The chord's own fifth: a diminished chord's is a semitone below a perfect one.
      else if (!input.chordChange && into % 2 === 0) out.push({ part: 'bass', offset: 0, dur: 0.9, accent: 0.65, midi: fifthAbove(root, h.tones) });
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
