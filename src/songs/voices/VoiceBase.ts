/**
 * VoiceBase.ts — Abstract base class for all 5 Song Preset voices.
 *
 * Each voice owns an output GainNode (for fade in/out) and a BiquadFilter.
 * The engine calls update() every frame with the current playback time and
 * active chord. Voices that are not among the 2 currently active fade to 0.
 */

import type { ChordEntry } from './chordLookup';

// ============================================
// Shared helpers
// ============================================

export function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function logFreq(norm: number, minHz: number, maxHz: number): number {
  const minLog = Math.log(minHz);
  const maxLog = Math.log(maxHz);
  return Math.exp(minLog + norm * (maxLog - minLog));
}

// ============================================
// Constants
// ============================================

/** Lerp factor per frame for ~0.3 s fade at 60 fps */
const FADE_LERP = 0.08;

export const FILTER_MIN_HZ = 200;
export const FILTER_MAX_HZ = 8000;

export const LEFT_THRESHOLD = 0.30;
export const RIGHT_THRESHOLD = 0.70;

// ============================================
// Abstract base
// ============================================

export abstract class VoiceBase {
  protected ctx: AudioContext;
  protected outputGain: GainNode;
  protected filterNode: BiquadFilterNode;

  protected active = false;
  protected fadeLevel = 0;
  protected posX = 0.5;
  protected posY = 0.5;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 0;

    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = FILTER_MAX_HZ;
    this.filterNode.Q.value = 0.7;
    this.filterNode.connect(this.outputGain);
  }

  /** Connect voice output to a destination node (e.g. dryGain or generatedVoiceGain). */
  connect(destination: AudioNode): void {
    this.outputGain.connect(destination);
  }

  /** Disconnect from all destinations. */
  disconnect(): void {
    this.outputGain.disconnect();
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  isActive(): boolean {
    return this.active;
  }

  setPosition(x: number, y: number): void {
    this.posX = x;
    this.posY = y;
  }

  /** Lerp fadeLevel toward active state. Call once per frame before update(). */
  updateFade(): void {
    const target = this.active ? 1 : 0;
    this.fadeLevel = lerp(this.fadeLevel, target, FADE_LERP);
    // Snap to 0 when very close to avoid residual sound
    if (this.fadeLevel < 0.001) this.fadeLevel = 0;
    this.outputGain.gain.value = this.fadeLevel;
  }

  /** True when the voice has faded out completely. */
  isSilent(): boolean {
    return this.fadeLevel < 0.001;
  }

  /**
   * Per-frame update. Called by the engine after updateFade().
   * @param playbackTime Current playback position in seconds
   * @param chord Current chord from the progression (may be undefined if no progression)
   */
  abstract update(playbackTime: number, chord: ChordEntry | null): void;

  /** Called when transport starts or resumes. */
  onTransportStart(): void { /* override if needed */ }

  /** Called when transport pauses. */
  onTransportPause(): void { /* override if needed */ }

  /** Called when transport stops or restarts. */
  onTransportStop(): void { /* override if needed */ }

  /** Disconnect and release all audio resources. */
  abstract dispose(): void;

  protected disposeBase(): void {
    this.filterNode.disconnect();
    this.outputGain.disconnect();
  }
}
