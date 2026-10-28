/**
 * BoardSequencerVoice — a voice driven by the board step sequencer.
 *
 * Plays either a named instrument (the player's own pick: a sampler from the curated
 * palette / SAMPLE_CONFIGS, as before) or a sound world's layered voice: a sampler and a
 * synth layer blended. Sequencer notes are short and scheduled, so it exposes
 * play(midi, velocity, duration, time) rather than press/release.
 */

import { ToneVoiceBase } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import type { Player } from './SynthPlayer';
import { getInstrumentEntry } from './presets/instrumentPalette';
import type { ChordEntry } from './chordLookup';
import type { LayeredVoiceSpec } from '../../audio/worlds/soundWorlds';
import { createSynthLayer, type SynthLayer } from '../../audio/worlds/synthLayers';

/** The sampler settings for a named instrument key. */
function sampleConfigFor(instrumentKey: string) {
  // 'pad' is a board-local alias for the soft choir-pad sample (sustained by the engine).
  // Otherwise prefer a DIRECT SAMPLE_CONFIGS key (the real, good instrument samples); fall
  // back to the curated palette for legacy keys.
  return instrumentKey === 'pad'
    ? SAMPLE_CONFIGS.padChoir
    : instrumentKey === 'chord'
      ? SAMPLE_CONFIGS.electricPiano // 'chord' = stacked notes on electric piano
      : instrumentKey in SAMPLE_CONFIGS
        ? SAMPLE_CONFIGS[instrumentKey as keyof typeof SAMPLE_CONFIGS]
        : SAMPLE_CONFIGS[getInstrumentEntry(instrumentKey).sampleKey];
}

/** How fast a cut voice's notes fall away (time constant, s): quick, without a click. */
const CUT_FADE_TC = 0.006;
/** When the players of a cut voice are freed: well after their fade is over. */
const CUT_FREE_MS = 250;

export class BoardSequencerVoice extends ToneVoiceBase {
  private player: Player | null = null;
  private synth: SynthLayer | null = null;
  private sampleGain: GainNode | null = null;
  /** What the voice plays, so cut() can start it afresh. */
  private readonly sound: string | LayeredVoiceSpec;
  /** Where the players' notes go now: cut() fades this one out and makes a new one. */
  private lane: GainNode;
  /** Players cut but not yet freed: dispose() frees them at once. */
  private retiring = new Set<() => void>();

  constructor(ctx: AudioContext, sound: string | LayeredVoiceSpec) {
    super(ctx);
    // Always-on gain; the sampler envelope handles dynamics.
    this.bypassFade = true;
    this.active = true;
    this.outputGain.gain.value = 1;
    this.sound = sound;
    this.lane = this.build();
  }

  /** The players for this voice's sound, into a lane of their own. */
  private build(): GainNode {
    const lane = this.ctx.createGain();
    lane.connect(this.filterNode);
    this.player = null;
    this.synth = null;
    this.sampleGain = null;
    const sound = this.sound;
    if (typeof sound === 'string') {
      this.player = new SamplerPlayer(sampleConfigFor(sound), lane);
      return lane;
    }
    if (sound.sample) {
      this.sampleGain = this.ctx.createGain();
      this.sampleGain.gain.value = sound.sampleLevel ?? 1;
      this.sampleGain.connect(lane);
      this.player = new SamplerPlayer(SAMPLE_CONFIGS[sound.sample], this.sampleGain);
    }
    if (sound.synth) {
      this.synth = createSynthLayer(sound.synth, sound.synthLevel ?? 1);
      this.synth.connect(lane);
    }
    return lane;
  }

  /**
   * Silence at once: every note this voice is sounding or has queued falls away within a
   * few milliseconds (a held bass note, a note scheduled for the next beat), and the voice
   * plays on from its next note with fresh players of the same sound. A sampler's own
   * release can't cut a note it has already been told when to end, hence fresh players.
   * The samples are cached, so the fresh sampler is ready almost at once.
   */
  cut(): void {
    const old = { lane: this.lane, player: this.player, synth: this.synth, sampleGain: this.sampleGain };
    const now = this.ctx.currentTime;
    old.lane.gain.cancelScheduledValues(now);
    old.lane.gain.setTargetAtTime(0, now, CUT_FADE_TC);
    this.lane = this.build();
    const free = (): void => {
      this.retiring.delete(free);
      old.player?.dispose();
      old.synth?.dispose();
      old.sampleGain?.disconnect();
      old.lane.disconnect();
    };
    this.retiring.add(free);
    setTimeout(() => { if (this.retiring.has(free)) free(); }, CUT_FREE_MS);
  }

  /** Set tone/brightness: the voice's low-pass cutoff, t in 0..1 (dark→bright). */
  setBrightness(t: number): void {
    const clamped = Math.max(0, Math.min(1, t));
    // Log map ~300 Hz (dark) → ~12 kHz (bright).
    const hz = 300 * Math.pow(12000 / 300, clamped);
    this.filterNode.frequency.value = hz;
  }

  /**
   * Whether the voice can sound yet. A synth layer is ready at once, so a world that has
   * one plays immediately while its samples are still arriving.
   */
  isReady(): boolean {
    return this.synth !== null || (this.player?.isReady() ?? false);
  }

  /** Trigger one sequenced note. `time` is an audio-context time (Tone seconds). */
  play(midi: number, velocity: number, durationSec: number, time: number): void {
    let played = false;
    if (this.player?.isReady()) {
      this.player.triggerAttackRelease(midi, durationSec, time, velocity);
      played = true;
    }
    if (this.synth) {
      this.synth.play(midi, durationSec, time, velocity);
      played = true;
    }
    if (played) this.onNoteTrigger?.();
  }

  /** Required by ToneVoiceBase; this voice is event-driven, not per-frame. */
  update(_playbackTime: number, _chord: ChordEntry | null, _velocity: number): void {
    /* no-op: steps are driven by the sequencer engine, not the frame loop */
  }

  dispose(): void {
    for (const free of [...this.retiring]) free();
    this.player?.dispose();
    this.synth?.dispose();
    this.sampleGain?.disconnect();
    this.lane.disconnect();
    this.disposeBase();
  }
}
