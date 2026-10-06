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

export class BoardSequencerVoice extends ToneVoiceBase {
  private player: Player | null = null;
  private synth: SynthLayer | null = null;
  private sampleGain: GainNode | null = null;

  constructor(ctx: AudioContext, sound: string | LayeredVoiceSpec) {
    super(ctx);
    // Always-on gain; the sampler envelope handles dynamics.
    this.bypassFade = true;
    this.active = true;
    this.outputGain.gain.value = 1;
    if (typeof sound === 'string') {
      this.player = new SamplerPlayer(sampleConfigFor(sound), this.filterNode);
      return;
    }
    if (sound.sample) {
      this.sampleGain = ctx.createGain();
      this.sampleGain.gain.value = sound.sampleLevel ?? 1;
      this.sampleGain.connect(this.filterNode);
      this.player = new SamplerPlayer(SAMPLE_CONFIGS[sound.sample], this.sampleGain);
    }
    if (sound.synth) {
      this.synth = createSynthLayer(sound.synth, sound.synthLevel ?? 1);
      this.synth.connect(this.filterNode);
    }
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
    this.player?.dispose();
    this.synth?.dispose();
    this.sampleGain?.disconnect();
    this.disposeBase();
  }
}
