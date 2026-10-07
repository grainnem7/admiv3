/**
 * Fill ideas from Magenta (Google, Apache-2.0): pre-trained models used as they are.
 *
 *  - melody_rnn continues the player's melody in its own style;
 *  - drum_kit_rnn continues the player's drum pattern.
 *
 * Each continuation is laid over the same loop and passed through `fitFill`, so a model
 * can suggest anything but only what fits around the player is played. Bass keeps the
 * rule-based approach notes: Magenta has no bass model.
 *
 * The models download on first use (a few MB each, from Magenta's public storage) and are
 * loaded with a dynamic import, so nothing of Magenta or TensorFlow.js is fetched until a
 * player turns the fill up. Generation runs when the board changes or "New idea" is
 * pressed — never on the sound path — and its result plays from the next time round.
 */

import { generateFill, type FillContext, type FillNote } from './rulesFill';
import { fitFill, type FillCandidate } from './fillFilter';
import {
  bestCandidate, chordProgressionFor, drumSeed, fitLength, fromGenerated, melodySeed, STEPS_PER_BEAT, type QuantizedSequence,
} from './magentaSequences';

const CHECKPOINTS = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/';
const VAE_CHECKPOINTS = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/';
/** Several tries at different boldness; the critic keeps the best. */
const TEMPERATURES = [0.9, 1.1, 1.35];
/** The variation model works in two bars of sixteenths. */
const VAE_STEPS = 32;
/** How close a variation stays to the player's tune (1 = the same). */
const VAE_SIMILARITY = 0.75;
/** Results kept, so "Back" and the same board give the same idea again. */
const CACHE_SIZE = 24;

export type MagentaStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface Rnn {
  initialize(): Promise<void>;
  continueSequence(
    seq: QuantizedSequence, steps: number, temperature?: number, chordProgression?: string[],
  ): Promise<{ notes?: QuantizedSequence['notes'] | null }>;
}
interface Vae {
  initialize(): Promise<void>;
  similar(seq: QuantizedSequence, n: number, similarity: number, temperature?: number): Promise<{ notes?: QuantizedSequence['notes'] | null }[]>;
}

let status: MagentaStatus = 'idle';
let loading: Promise<void> | null = null;
let melodyModel: Rnn | null = null;
/** The chord-conditioned melody model: used whenever the board's chords are known. */
let improvModel: Rnn | null = null;
let drumModel: Rnn | null = null;
/** Variations on the player's own tune, loaded in the background after the rest. */
let vaeModel: Vae | null = null;
const cache = new Map<string, FillNote[]>();

export function magentaStatus(): MagentaStatus {
  return status;
}

/** Download and start the models, once. Safe to call repeatedly. */
export function loadMagenta(): Promise<void> {
  if (!loading) {
    status = 'loading';
    loading = (async () => {
      try {
        const mm = await import('@magenta/music/esm/music_rnn');
        const melody = new mm.MusicRNN(`${CHECKPOINTS}melody_rnn`) as unknown as Rnn;
        const improv = new mm.MusicRNN(`${CHECKPOINTS}chord_pitches_improv`) as unknown as Rnn;
        const drums = new mm.MusicRNN(`${CHECKPOINTS}drum_kit_rnn`) as unknown as Rnn;
        await Promise.all([melody.initialize(), improv.initialize(), drums.initialize()]);
        melodyModel = melody;
        improvModel = improv;
        drumModel = drums;
        status = 'ready';
        // The variation model is larger: it arrives in the background and is used once it has.
        void (async () => {
          try {
            const mv = await import('@magenta/music/esm/music_vae');
            const vae = new mv.MusicVAE(`${VAE_CHECKPOINTS}mel_2bar_small`) as unknown as Vae;
            await vae.initialize();
            vaeModel = vae;
          } catch (err) {
            console.warn('[Fill] the variation model could not load; continuations only.', err);
          }
        })();
      } catch (err) {
        // Offline, blocked, or the browser can't run it: the simple rules carry on.
        console.warn('[Fill] Magenta could not load; using the simple rules.', err);
        status = 'failed';
      }
    })();
  }
  return loading;
}

/**
 * Magenta's idea for this board. `key` names the board + settings + idea, so the same
 * request is answered from memory (Back, or a board put back the way it was).
 */
export async function magentaFill(ctx: FillContext, key: string): Promise<FillNote[]> {
  const hit = cache.get(key);
  if (hit) return hit;
  await loadMagenta();
  if (status !== 'ready' || !melodyModel || !drumModel) throw new Error('Magenta is not available');

  const steps = ctx.loop * STEPS_PER_BEAT;
  const candidates: FillCandidate[] = [];
  const melodyColours = [...new Set(ctx.sounding.filter((n) => n.role === 'melody').map((n) => n.colour))].sort();
  const progression = ctx.chordSymbolAt ? chordProgressionFor(ctx.chordSymbolAt, ctx.loop) : null;
  for (const colour of melodyColours) {
    const seed = melodySeed(ctx.sounding, ctx.loop, colour);
    if (seed.notes.length === 0) continue;
    const playerNotes = seed.notes.length;
    const tries: FillCandidate[][] = [];
    // Every other idea is a variation on the player's own tune rather than a continuation
    // of it, once the variation model is here — so New idea does not always do the same kind of thing.
    if (vaeModel && ctx.seed % 2 === 1) {
      const variations = await vaeModel.similar(fitLength(seed, VAE_STEPS), TEMPERATURES.length, VAE_SIMILARITY, 1.0);
      for (const v of variations) tries.push(fromGenerated(v, 'melody', colour, ctx.loop));
    } else {
      for (const temperature of TEMPERATURES) {
        const generated = progression && improvModel
          ? await improvModel.continueSequence(seed, steps, temperature, progression)
          : await melodyModel.continueSequence(seed, steps, temperature);
        tries.push(fromGenerated(generated, 'melody', colour, ctx.loop));
      }
    }
    candidates.push(...tries[bestCandidate(tries, ctx.harmonyAt, playerNotes)]);
  }
  const drumColour = ctx.sounding.find((n) => n.role === 'drums')?.colour;
  if (drumColour !== undefined) {
    const seed = drumSeed(ctx.sounding, ctx.loop);
    if (seed.notes.length > 0) {
      const generated = await drumModel.continueSequence(seed, steps, TEMPERATURES[1]);
      candidates.push(...fromGenerated(generated, 'drums', drumColour, ctx.loop));
    }
  }
  const notes = [
    ...fitFill(candidates, ctx),
    ...generateFill(ctx).filter((n) => n.role === 'bass'),
  ].sort((a, b) => a.step - b.step || a.offset - b.offset);

  cache.set(key, notes);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return notes;
}
