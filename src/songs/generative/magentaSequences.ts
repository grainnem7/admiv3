/**
 * Between the board and Magenta's note format (a quantized NoteSequence, 4 steps to the
 * beat). Pure, so the part of the AI path that can be wrong is tested without a model.
 */

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

/** General MIDI drum notes for the kit pieces. */
const KIT_TO_GM: Record<KitDrum, number> = {
  kick: 36, snare: 38, hat: 42, crash: 49, tom: 45, clap: 39, rim: 37, kickCrash: 36,
};

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
    const pitch = KIT_TO_GM[n.drum];
    if (s < 0 || s >= total || seen.has(`${s}:${pitch}`)) continue;
    seen.add(`${s}:${pitch}`);
    notes.push({ pitch, quantizedStartStep: s, quantizedEndStep: s + 1, isDrum: true });
  }
  notes.sort((a, b) => a.quantizedStartStep - b.quantizedStartStep || a.pitch - b.pitch);
  return { notes, totalQuantizedSteps: total, quantizationInfo: { stepsPerQuarter: STEPS_PER_BEAT } };
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
