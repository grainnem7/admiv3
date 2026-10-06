/**
 * The rules every generated note has to pass, whoever generated it.
 *
 * A model (Magenta) is free to suggest anything; this decides what is actually played, so
 * the player stays in charge whatever the generator does (design part D):
 *  - never on a sixteenth where that part already plays a note the player made;
 *  - every pitch moved onto the scale;
 *  - at most MAX_FILL_PER_BEAT added notes per beat per part;
 *  - nothing for a part the player has not used;
 *  - the Fill amount decides how many suggestions survive, the same way every time for
 *    the same suggestions and seed.
 */

import { degreeMidi } from '../boardSequencerScale';
import {
  degreeOf, MAX_FILL_PER_BEAT, rowForDrum, seededRandom, type FillContext, type FillNote,
} from './rulesFill';

/** A suggestion before it has been checked: no board cell yet. */
export type FillCandidate = Omit<FillNote, 'cell'>;

const SLOTS = 4;

export function fitFill(candidates: readonly FillCandidate[], ctx: FillContext): FillNote[] {
  const amount = Math.max(0, Math.min(1, ctx.amount));
  if (amount <= 0) return [];
  const total = ctx.loop * SLOTS;
  const taken = { melody: new Set<number>(), bass: new Set<number>(), drums: new Set<number>() };
  const used = new Set<string>();
  for (const n of ctx.sounding) {
    if (n.role === 'melody' || n.role === 'bass' || n.role === 'drums') {
      taken[n.role].add(n.step * SLOTS + Math.round(n.offset * SLOTS));
      used.add(n.role);
    }
  }
  const semis = [...ctx.semitones];
  const rand = seededRandom(ctx.seed ^ 0x5bd1e995);
  const perBeat = new Map<string, number>();
  const out: FillNote[] = [];

  for (const c of candidates) {
    if (!used.has(c.role)) continue;
    const slot = c.step * SLOTS + Math.round(c.offset * SLOTS);
    if (slot < 0 || slot >= total) continue;
    // Draw for every candidate, kept or not, so the amount alone decides what survives.
    if (rand() >= amount) continue;
    if (taken[c.role].has(slot)) continue;
    const beatKey = `${c.role}@${c.step}`;
    if ((perBeat.get(beatKey) ?? 0) >= MAX_FILL_PER_BEAT) continue;

    let note: FillNote;
    if (c.drum) {
      note = { ...c, cell: { row: rowForDrum(c.drum, ctx.rows), col: c.step } };
    } else if (c.midi !== undefined) {
      // Onto the scale: the nearest scale note, in the same octave region.
      const degree = degreeOf(c.midi, ctx.rootMidi, semis);
      const midi = degreeMidi(degree, ctx.rootMidi, semis);
      const row = Math.max(0, Math.min(ctx.rows - 1, ctx.rows - 1 - degreeOf(c.role === 'bass' ? midi + 12 : midi, ctx.rootMidi, semis)));
      note = { ...c, midi, cell: { row, col: c.step } };
    } else continue;

    taken[c.role].add(slot);
    perBeat.set(beatKey, (perBeat.get(beatKey) ?? 0) + 1);
    out.push(note);
  }
  return out.sort((a, b) => a.step - b.step || a.offset - b.offset);
}
