/**
 * SurfacePressVoice — a sampled voice driven by discrete surface presses.
 *
 * Reuses the existing sampler infrastructure (SamplerPlayer + the curated
 * instrument palette / SAMPLE_CONFIGS) — NOT new synthesis. Unlike the
 * position-driven InstrumentVoice, it exposes explicit press()/release()
 * for note-on at press and note-off at release.
 *
 * bypassFade is set so the voice is always at unit gain — the sampler's
 * own envelope shapes the note. One voice instance per registered button;
 * the engine releases the held note on a release event.
 */

import { ToneVoiceBase } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import type { Player } from './SynthPlayer';
import { getInstrumentEntry } from './presets/instrumentPalette';
import type { ChordEntry } from './chordLookup';

export class SurfacePressVoice extends ToneVoiceBase {
  private player: Player;
  private heldMidi: number | null = null;

  constructor(ctx: AudioContext, instrumentKey: string) {
    super(ctx);
    // Always-on gain; the sampler envelope handles dynamics.
    this.bypassFade = true;
    this.active = true;
    this.outputGain.gain.value = 1;
    const entry = getInstrumentEntry(instrumentKey);
    this.player = new SamplerPlayer(SAMPLE_CONFIGS[entry.sampleKey], this.filterNode);
  }

  /** Note-on for a press. */
  press(midi: number, velocity: number): void {
    if (!this.player.isReady()) return;
    // Release any previous note on this button before retriggering.
    if (this.heldMidi !== null) this.player.releaseAll();
    this.player.triggerAttack(midi, velocity);
    this.heldMidi = midi;
    this.onNoteTrigger?.();
  }

  /** Note-off for a release. */
  release(): void {
    if (this.heldMidi === null) return;
    this.player.releaseAll();
    this.heldMidi = null;
  }

  isHolding(): boolean {
    return this.heldMidi !== null;
  }

  /** Required by ToneVoiceBase; this voice is event-driven, not per-frame. */
  update(_playbackTime: number, _chord: ChordEntry | null, _velocity: number): void {
    /* no-op: presses are driven by the engine, not the frame loop */
  }

  override onTransportStop(): void {
    this.release();
  }

  dispose(): void {
    this.player.releaseAll();
    this.player.dispose();
    this.disposeBase();
  }
}
