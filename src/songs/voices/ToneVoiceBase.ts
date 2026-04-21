/**
 * ToneVoiceBase.ts — Abstract base class for Song Preset voices.
 *
 * Uses raw Web Audio API (GainNode, BiquadFilterNode) via AudioContext.
 * Tone.Transport is used by the engine externally for timing; voices use
 * ctx.currentTime directly for scheduling.
 *
 * Additions over original VoiceBase:
 *   - velocity: smoothed movement speed from engine
 *   - playHello(): characteristic sound when object first appears
 *   - onNoteTrigger: callback for sidechain ducking
 *   - bypassFade: StemMixerVoice sets this to keep outputGain at 1.0
 *   - update() signature includes velocity parameter
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

export const FILTER_MIN_HZ = 200;
export const FILTER_MAX_HZ = 8000;

export const LEFT_THRESHOLD = 0.30;
export const RIGHT_THRESHOLD = 0.70;

// ============================================
// Abstract base
// ============================================

export abstract class ToneVoiceBase {
  protected ctx: AudioContext;
  protected outputGain: GainNode;
  protected filterNode: BiquadFilterNode;

  protected active = false;
  protected fadeLevel = 0;
  protected posX = 0.5;
  protected posY = 0.5;

  /** Velocity (0-1), computed by engine from frame-to-frame movement speed. */
  protected velocity = 0;

  /**
   * When true, outputGain stays at 1.0 and the normal fade is bypassed.
   * StemMixerVoice sets this because per-stem gainNodes control volume directly.
   */
  protected bypassFade = false;

  /** Callback for sidechain ducking — called when this voice triggers a note. */
  onNoteTrigger?: () => void;

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

  connect(destination: AudioNode): void {
    this.outputGain.connect(destination);
  }

  disconnect(): void {
    this.outputGain.disconnect();
  }

  setActive(active: boolean): void { this.active = active; }
  isActive(): boolean { return this.active; }
  setPosition(x: number, y: number): void { this.posX = x; this.posY = y; }
  setVelocity(vel: number): void { this.velocity = vel; }

  /** Override to select a named instrument preset. No-op unless overridden. */
  setPreset(_key: string): void { /* override per voice */ }

  updateFade(): void {
    if (this.bypassFade) {
      this.outputGain.gain.value = 1;
      this.fadeLevel = 1;
      return;
    }

    if (this.active) {
      // Smooth fade-in (~0.4 s to full volume at 60 fps)
      this.fadeLevel = lerp(this.fadeLevel, 1, 0.08);
    } else {
      // Slow fade-out (~1.5 s at 60 fps)
      this.fadeLevel = lerp(this.fadeLevel, 0, 0.04);
      if (this.fadeLevel < 0.001) this.fadeLevel = 0;
    }
    this.outputGain.gain.value = this.fadeLevel;
  }

  isSilent(): boolean { return this.fadeLevel < 0.001; }

  abstract update(playbackTime: number, chord: ChordEntry | null, velocity: number): void;

  onTransportStart(): void { /* override if needed */ }
  onTransportPause(): void { /* override if needed */ }
  onTransportStop(): void { /* override if needed */ }

  abstract dispose(): void;

  protected disposeBase(): void {
    this.filterNode.disconnect();
    this.outputGain.disconnect();
  }
}
