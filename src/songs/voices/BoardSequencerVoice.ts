/**
 * BoardSequencerVoice — a sampled voice driven by the board step sequencer.
 *
 * Reuses the existing sampler infrastructure (SamplerPlayer + the curated
 * instrument palette / SAMPLE_CONFIGS), like SurfacePressVoice. Sequencer
 * notes are short and scheduled, so it exposes play(midi, velocity, duration,
 * time) → triggerAttackRelease rather than press/release.
 */

import { ToneVoiceBase } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import type { Player } from './SynthPlayer';
import { getInstrumentEntry } from './presets/instrumentPalette';
import type { ChordEntry } from './chordLookup';

export class BoardSequencerVoice extends ToneVoiceBase {
  private player: Player;

  constructor(ctx: AudioContext, instrumentKey: string) {
    super(ctx);
    // Always-on gain; the sampler envelope handles dynamics.
    this.bypassFade = true;
    this.active = true;
    this.outputGain.gain.value = 1;
    const entry = getInstrumentEntry(instrumentKey);
    this.player = new SamplerPlayer(SAMPLE_CONFIGS[entry.sampleKey], this.filterNode);
  }

  /** Trigger one sequenced note. `time` is an audio-context time (Tone seconds). */
  play(midi: number, velocity: number, durationSec: number, time: number): void {
    if (!this.player.isReady()) return;
    this.player.triggerAttackRelease(midi, durationSec, time, velocity);
    this.onNoteTrigger?.();
  }

  /** Required by ToneVoiceBase; this voice is event-driven, not per-frame. */
  update(_playbackTime: number, _chord: ChordEntry | null, _velocity: number): void {
    /* no-op: steps are driven by the sequencer engine, not the frame loop */
  }

  dispose(): void {
    this.player.dispose();
    this.disposeBase();
  }
}
