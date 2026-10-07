/**
 * Between the board and Magenta's note format (a quantized NoteSequence, 4 steps to the
 * beat). Pure, so the part of the AI path that can be wrong is tested without a model.
 */

import { KIT_GM_NOTE } from '../../midi/gmDrums';
import type { KitDrum } from '../../audio/instruments/RoundRobinDrumKit';
import type { FillCandidate } from './fillFilter';
import type { SoundingNote } from './rulesFill';

export const STEPS_PER_BEAT = 4;

/** The pitch range the melody model was trained on (melody_rnn: 48–83). */
export const MELODY_MIN = 48;
export const MELODY_MAX = 83;

/** The parts of a quantized NoteSequence the model reads and writes. */
export interface QuantizedNote {
  pitch: number;
  quantizedStartStep: number;
  quantizedEndStep: number;
  isDrum?: boolean;
  velocity?: number;
}
export interface QuantizedSequence {
  notes: QuantizedNote[];
  totalQuantizedSteps: number;
  quantizationInfo: { stepsPerQuarter: number };
}


/** A GM drum note back to the nearest kit piece. */
export function gmToKit(pitch: number): KitDrum {
  if (pitch === 35 || pitch === 36) return 'kick';
  if (pitch === 38 || pitch === 40) return 'snare';
  if (pitch === 37) return 'rim';
  if (pitch === 39) return 'clap';
  if ([41, 43, 45, 47, 48, 50].includes(pitch)) return 'tom';
  if ([49, 52, 55, 57].includes(pitch)) return 'crash';
  return 'hat'; // closed/open/pedal hats, ride, and anything else cymbal-like
}

const slotOf = (n: { step: number; offset: number }): number => n.step * STEPS_PER_BEAT + Math.round(n.offset * STEPS_PER_BEAT);

/** Fold a pitch into the melody model's range by octaves. */
export function intoMelodyRange(pitch: number): number {
  let p = pitch;
  while (p > MELODY_MAX) p -= 12;
  while (p < MELODY_MIN) p += 12;
  return p;
}

/**
 * The player's melody as a seed: one note per sixteenth (the highest — the model only
 * takes a single line), each held until the next, inside the model's range.
 */
export function melodySeed(sounding: readonly SoundingNote[], loop: number, colour?: string): QuantizedSequence {
  const total = loop * STEPS_PER_BEAT;
  const bySlot = new Map<number, number>();
  for (const n of sounding) {
    if (n.role !== 'melody' || n.midi === undefined || (colour && n.colour !== colour)) continue;
    const s = slotOf(n);
    if (s < 0 || s >= total) continue;
    bySlot.set(s, Math.max(bySlot.get(s) ?? -Infinity, intoMelodyRange(n.midi)));
  }
  const starts = [...bySlot.keys()].sort((a, b) => a - b);
  const notes = starts.map((start, i) => ({
    pitch: bySlot.get(start)!,
    quantizedStartStep: start,
    quantizedEndStep: Math.min(i + 1 < starts.length ? starts[i + 1] : total, start + 2 * STEPS_PER_BEAT),
  }));
  return { notes, totalQuantizedSteps: total, quantizationInfo: { stepsPerQuarter: STEPS_PER_BEAT } };
}

/** The player's drums as a seed, one hit per piece per sixteenth. */
export function drumSeed(sounding: readonly SoundingNote[], loop: number): QuantizedSequence {
  const total = loop * STEPS_PER_BEAT;
  const seen = new Set<string>();
  const notes: QuantizedNote[] = [];
  for (const n of sounding) {
    if (n.role !== 'drums' || !n.drum) continue;
    const s = slotOf(n);
    const pitch = KIT_GM_NOTE[n.drum];
    if (s < 0 || s >= total || seen.has(`${s}:${pitch}`)) continue;
    seen.add(`${s}:${pitch}`);
    notes.push({ pitch, quantizedStartStep: s, quantizedEndStep: s + 1, isDrum: true });
  }
  notes.sort((a, b) => a.quantizedStartStep - b.quantizedStartStep || a.pitch - b.pitch);
  return { notes, totalQuantizedSteps: total, quantizationInfo: { stepsPerQuarter: STEPS_PER_BEAT } };
}

/**
 * The chord for every beat of the seed loop and the continuation loop, for Magenta's
 * chord-conditioned model, which spreads the list evenly over seed + continuation. Null
 * when any beat has no chord: the plain model is used instead.
 */
export function chordProgressionFor(symbolAt: (step: number) => string | null, loop: number): string[] | null {
  const once: string[] = [];
  for (let step = 0; step < loop; step++) {
    const s = symbolAt(step);
    if (!s) return null;
    once.push(s);
  }
  return [...once, ...once];
}

/**
 * Which of several suggestions fits best: chord tones on the beat, mostly stepwise
 * motion, no wild leaps, and not far busier than the player. A small, honest critic —
 * the model proposes, this chooses.
 */
export function bestCandidate(
  candidates: readonly (readonly FillCandidate[])[],
  chordTonesAt: ((step: number) => readonly number[] | null) | undefined,
  playerNotes: number,
): number {
  let best = 0;
  let bestScore = -Infinity;
  candidates.forEach((cand, i) => {
    const melody = cand.filter((c) => c.midi !== undefined).sort((a, b) => a.step - b.step || a.offset - b.offset);
    let score = 0;
    for (let k = 0; k < melody.length; k++) {
      const n = melody[k];
      const tones = chordTonesAt?.(n.step);
      if (tones && n.offset === 0) score += tones.some((t) => ((t - n.midi!) % 12 + 12) % 12 === 0) ? 1 : -0.5;
      if (k > 0) {
        const leap = Math.abs(n.midi! - melody[k - 1].midi!);
        if (leap <= 2) score += 0.5;
        else if (leap > 7) score -= 0.75;
      }
    }
    // Judged per note, so a long suggestion cannot win on volume; and one far busier than
    // what the player placed crowds them out, whatever its notes.
    const perNote = melody.length > 0 ? score / melody.length : -1;
    const over = playerNotes > 0 ? Math.max(0, melody.length - 2 * playerNotes - 2) : 0;
    const total = perNote - 0.25 * over;
    if (total > bestScore) { bestScore = total; best = i; }
  });
  return best;
}

/** A sequence exactly `steps` long, for a model that takes a fixed length. */
export function fitLength(seq: QuantizedSequence, steps: number): QuantizedSequence {
  return {
    ...seq,
    totalQuantizedSteps: steps,
    notes: seq.notes
      .filter((n) => n.quantizedStartStep < steps)
      .map((n) => ({ ...n, quantizedEndStep: Math.min(steps, n.quantizedEndStep) })),
  };
}

/** What the model wrote, as fill suggestions on the loop's grid. */
export function fromGenerated(
  generated: { notes?: readonly Partial<QuantizedNote>[] | null } | null | undefined,
  role: 'melody' | 'drums',
  colour: string,
  loop: number,
): FillCandidate[] {
  const total = loop * STEPS_PER_BEAT;
  const out: FillCandidate[] = [];
  for (const n of generated?.notes ?? []) {
    const start = n.quantizedStartStep ?? -1;
    if (n.pitch === undefined || start < 0 || start >= total) continue;
    const end = Math.max(start + 1, n.quantizedEndStep ?? start + 1);
    const step = Math.floor(start / STEPS_PER_BEAT);
    const offset = (start % STEPS_PER_BEAT) / STEPS_PER_BEAT;
    if (role === 'drums') {
      const drum = gmToKit(n.pitch);
      out.push({
        step, offset, role, colour, drum, dur: 0.25, rule: 'ai',
        accent: drum === 'hat' ? 0.4 : drum === 'kick' ? 0.75 : 0.6,
      });
    } else {
      out.push({
        step, offset, role, colour, midi: n.pitch, dur: (end - start) / STEPS_PER_BEAT, rule: 'ai',
        accent: offset === 0 ? 0.75 : 0.6,
      });
    }
  }
  return out;
}
