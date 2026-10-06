/**
 * Fill, rules-v1: in-key notes the instrument adds AROUND what the player placed.
 *
 * The player stays in charge (design part D):
 *  - nothing is added on a sixteenth where that part already plays, so a fill can never
 *    sit on top of, or replace, a note the player made;
 *  - every pitch comes from the scale (or the chord sounding then);
 *  - at most two added notes per beat per part;
 *  - the same board, amount and seed always give the same fill — "New idea" is a new
 *    seed, "Keep" freezes the notes.
 *
 * Rules: passing notes between the player's melody notes, an echo of a note in the gap
 * after it, a neighbour note leading into the next one, approach notes into each bass
 * change, and for drums soft hats in empty eighths, ghost snares, and a tom fill at the
 * end of every fourth time round.
 *
 * Pure. A `FillGenerator` (see the design) can replace this later — an ML model, say —
 * as long as its output goes through the same rules about where notes may go.
 */

import type { KitDrum } from '../../audio/instruments/RoundRobinDrumKit';
import { degreeMidi, DEFAULT_DRUM_ROWS } from '../boardSequencerScale';

export type FillRole = 'melody' | 'bass' | 'drums';
/** Why a fill note exists. 'ai' = suggested by a model (Magenta) and passed by fitFill. */
export type FillRule = 'passing' | 'echo' | 'neighbour' | 'approach' | 'hat' | 'ghost' | 'fill' | 'ai';

/** A note the board plays over one loop — what the fill has to fit around. */
export interface SoundingNote {
  step: number;
  /** Beats after the step starts: 0, 0.25, 0.5 or 0.75. */
  offset: number;
  role: 'melody' | 'bass' | 'drums' | 'chord';
  colour: string;
  midi?: number;
  drum?: KitDrum;
}

export interface FillContext {
  sounding: readonly SoundingNote[];
  /** Steps in the loop. */
  loop: number;
  rows: number;
  rootMidi: number;
  semitones: readonly number[];
  /** Chord tones sounding at a step, when the board has a chord; else null. */
  harmonyAt?(step: number): readonly number[] | null;
  /** 0 = nothing added, 1 = as much as the rules allow. */
  amount: number;
  seed: number;
}

export interface FillNote {
  step: number;
  offset: number;
  role: FillRole;
  colour: string;
  midi?: number;
  drum?: KitDrum;
  /** Length in beats. */
  dur: number;
  /** Loudness relative to a placed note (0–1), before the fill's own level. */
  accent: number;
  /** Where its ring is drawn on the board. */
  cell: { row: number; col: number };
  /** Why it exists — for the session log. */
  rule: FillRule;
  /** Only on every Nth time round the loop (the last of each N). */
  everyNthLap?: number;
}

/** At most this many added notes in one beat, per part. */
export const MAX_FILL_PER_BEAT = 2;

/** A small, fast, seeded random number generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOTS_PER_STEP = 4;
const slotOf = (n: { step: number; offset: number }): number => n.step * SLOTS_PER_STEP + Math.round(n.offset * SLOTS_PER_STEP);

/** The scale degree nearest a MIDI note (a chord note from a song may be off the scale). */
export function degreeOf(midi: number, root: number, semitones: readonly number[]): number {
  let best = 0;
  let bestGap = Infinity;
  for (let d = -semitones.length * 3; d <= semitones.length * 6; d++) {
    const gap = Math.abs(degreeMidi(d, root, [...semitones]) - midi);
    if (gap < bestGap) { bestGap = gap; best = d; }
  }
  return best;
}

/** The board row a kit piece is drawn on (its default row, bottom = kick). */
export function rowForDrum(drum: KitDrum, rows: number): number {
  const i = (DEFAULT_DRUM_ROWS as readonly string[]).indexOf(drum);
  return Math.max(0, rows - 1 - Math.max(0, i));
}

export function generateFill(ctx: FillContext): FillNote[] {
  const amount = Math.max(0, Math.min(1, ctx.amount));
  if (amount <= 0 || ctx.loop <= 0) return [];
  const rand = seededRandom(ctx.seed);
  const chance = (p: number): boolean => rand() < p * amount;
  const total = ctx.loop * SLOTS_PER_STEP;
  const wrap = (slot: number): number => ((slot % total) + total) % total;
  const semis = [...ctx.semitones];
  const midiOf = (degree: number): number => degreeMidi(degree, ctx.rootMidi, semis);
  const rowOfDegree = (degree: number): number => Math.max(0, Math.min(ctx.rows - 1, ctx.rows - 1 - degree));

  // Where each part already plays, and how many notes have been added to each beat.
  const taken: Record<FillRole, Set<number>> = { melody: new Set(), bass: new Set(), drums: new Set() };
  for (const n of ctx.sounding) {
    if (n.role === 'melody' || n.role === 'bass' || n.role === 'drums') taken[n.role].add(wrap(slotOf(n)));
  }
  const perBeat = new Map<string, number>();
  const out: FillNote[] = [];

  const add = (
    role: FillRole, slot: number, note: Omit<FillNote, 'step' | 'offset' | 'role'>,
  ): boolean => {
    const s = wrap(slot);
    if (taken[role].has(s)) return false;
    const step = Math.floor(s / SLOTS_PER_STEP);
    const beatKey = `${role}@${step}`;
    if ((perBeat.get(beatKey) ?? 0) >= MAX_FILL_PER_BEAT) return false;
    taken[role].add(s);
    perBeat.set(beatKey, (perBeat.get(beatKey) ?? 0) + 1);
    out.push({ step, offset: (s % SLOTS_PER_STEP) / SLOTS_PER_STEP, role, ...note, cell: { ...note.cell, col: step } });
    return true;
  };

  /** The player's notes of one part and colour, one per sixteenth (the highest), in time order. */
  const line = (role: 'melody' | 'bass', colour: string): { slot: number; midi: number }[] => {
    const bySlot = new Map<number, number>();
    for (const n of ctx.sounding) {
      if (n.role !== role || n.colour !== colour || n.midi === undefined) continue;
      const s = wrap(slotOf(n));
      bySlot.set(s, Math.max(bySlot.get(s) ?? -Infinity, n.midi));
    }
    return [...bySlot.entries()].map(([slot, midi]) => ({ slot, midi })).sort((a, b) => a.slot - b.slot);
  };
  const coloursOf = (role: SoundingNote['role']): string[] =>
    [...new Set(ctx.sounding.filter((n) => n.role === role).map((n) => n.colour))].sort();

  // ---- melody ----
  for (const colour of coloursOf('melody')) {
    const notes = line('melody', colour);
    const placeMelody = (slot: number, degree: number, rule: FillRule, accent: number, dur: number): void => {
      let midi = midiOf(degree);
      // On a beat, a chord note if there is a chord.
      const chord = ctx.harmonyAt?.(Math.floor(wrap(slot) / SLOTS_PER_STEP)) ?? null;
      if (chord && chord.length > 0 && wrap(slot) % SLOTS_PER_STEP === 0) {
        midi = chord.reduce((best, t) => {
          const cand = t + 12 * Math.round((midi - t) / 12);
          return Math.abs(cand - midi) < Math.abs(best - midi) ? cand : best;
        }, chord[0] + 12 * Math.round((midi - chord[0]) / 12));
      }
      add('melody', slot, { colour, midi, dur, accent, rule, cell: { row: rowOfDegree(degreeOf(midi, ctx.rootMidi, semis)), col: 0 } });
    };
    for (let i = 0; i < notes.length; i++) {
      const a = notes[i];
      const b = notes[(i + 1) % notes.length];
      const gap = notes.length === 1 ? total : wrap(b.slot - a.slot) || total;
      const da = degreeOf(a.midi, ctx.rootMidi, semis);
      const db = degreeOf(b.midi, ctx.rootMidi, semis);
      // Passing notes: walk the scale from one of the player's notes to the next.
      const leap = db - da;
      if (notes.length > 1 && gap >= 4 && Math.abs(leap) >= 2 && chance(1)) {
        const count = Math.min(Math.abs(leap) - 1, Math.floor(gap / 2) - 1, 2);
        for (let k = 1; k <= count; k++) {
          const slot = a.slot + Math.round((gap * k) / (count + 1) / 2) * 2; // on the eighths
          placeMelody(slot, da + Math.sign(leap) * k, 'passing', 0.7, 0.5);
        }
      }
      // An echo of the note in the space after it — or, for a lone note, an answer
      // halfway round the loop.
      if (gap >= 6 && chance(0.7)) placeMelody(a.slot + 6, da, 'echo', 0.55, 0.5);
      if (notes.length === 1 && chance(0.6)) placeMelody(a.slot + total / 2, da + 2, 'echo', 0.6, 1);
      // A neighbour note a sixteenth before the next one, leaning into it.
      if (notes.length > 1 && gap >= 3 && chance(0.35)) placeMelody(b.slot - 1, db + 1, 'neighbour', 0.5, 0.25);
    }
  }

  // ---- bass ----
  for (const colour of coloursOf('bass')) {
    const notes = line('bass', colour);
    for (let i = 0; i < notes.length && notes.length > 1; i++) {
      const a = notes[i];
      const b = notes[(i + 1) % notes.length];
      if (a.midi === b.midi || wrap(b.slot - a.slot) < 3 || !chance(0.8)) continue;
      const db = degreeOf(b.midi, ctx.rootMidi, semis);
      const from = b.midi > a.midi ? db - 1 : db + 1;
      const midi = midiOf(from) + 12 * Math.round((b.midi - midiOf(db)) / 12);
      add('bass', b.slot - 2, { colour, midi, dur: 0.5, accent: 0.6, rule: 'approach', cell: { row: rowOfDegree(degreeOf(midi + 12, ctx.rootMidi, semis)), col: 0 } });
    }
  }

  // ---- drums ----
  const drumColour = coloursOf('drums')[0];
  if (drumColour !== undefined) {
    const rowOfDrum = (drum: KitDrum): number => rowForDrum(drum, ctx.rows);
    const drum = (slot: number, d: KitDrum, accent: number, rule: FillRule, everyNthLap?: number): void => {
      add('drums', slot, {
        colour: drumColour, drum: d, dur: 0.25, accent, rule, cell: { row: rowOfDrum(d), col: 0 },
        ...(everyNthLap ? { everyNthLap } : {}),
      });
    };
    const hasSnare = ctx.sounding.some((n) => n.role === 'drums' && n.drum === 'snare');
    // The tom fill first, so the end of the loop belongs to it rather than to stray hats.
    if (amount >= 0.5) {
      for (let k = 0; k < SLOTS_PER_STEP; k++) drum(total - SLOTS_PER_STEP + k, 'tom', 0.45 + k * 0.12, 'fill', 4);
    }
    for (let slot = 0; slot < total; slot += 2) if (chance(0.6)) drum(slot, 'hat', 0.35, 'hat');
    if (hasSnare) for (let slot = 1; slot < total; slot += 2) if (chance(0.15)) drum(slot, 'snare', 0.22, 'ghost');
  }

  return out.sort((a, b) => a.step - b.step || a.offset - b.offset);
}
