/**
 * StemMixerVoice.ts — Blue object: controls the mix of the original recording stems.
 *
 * Horizontal position controls the stem mix (arrangement intensity):
 *   Left zone:   Vocals only (intimate)
 *   Center zone: Vocals + Other at 60%
 *   Right zone:  All stems balanced (full arrangement)
 *
 * Vertical position: Lowpass filter on the stems (high = bright, low = warm).
 *
 * Continuous backing mode: when enabled, all stems play at a configurable
 * level even when this voice is not active, freeing both hands for instruments.
 *
 * Uses bypassFade so outputGain stays at 1.0 — volume is controlled entirely
 * via per-stem gainNode.gain.value, not the voice outputGain.
 */

import type { ChordEntry } from './chordLookup';
import type { StemMixerMapping } from '../songLibrary';
import {
  ToneVoiceBase,
  lerp,
  logFreq,
  FILTER_MIN_HZ,
  FILTER_MAX_HZ,
  LEFT_THRESHOLD,
  RIGHT_THRESHOLD,
} from './ToneVoiceBase';

// ============================================
// Constants
// ============================================

const CROSSFADE_LERP = 0.15;
const FILTER_LERP = 0.08;

// ============================================
// Stem state (per stem)
// ============================================

export interface StemGainRef {
  id: string;
  gainNode: GainNode;
  currentGain: number;
  targetGain: number;
}

// ============================================
// StemMixerVoice
// ============================================

export class StemMixerVoice extends ToneVoiceBase {
  private stems: Map<string, StemGainRef>;
  private mapping: StemMixerMapping;
  private filterCutoff = FILTER_MAX_HZ;
  private currentZone: 'left' | 'center' | 'right' | null = null;

  // Continuous backing
  private continuousBackingEnabled = true;
  private continuousBackingLevel = 0.4;

  constructor(
    ctx: AudioContext,
    stems: Map<string, StemGainRef>,
    mapping: StemMixerMapping,
  ) {
    super(ctx);
    // Volume controlled entirely by per-stem gainNodes — keep outputGain at 1.0
    this.bypassFade = true;
    this.stems = stems;
    this.mapping = mapping;

    // Connect all stem gainNodes directly into filterNode (both raw Web Audio)
    for (const stem of stems.values()) {
      stem.gainNode.connect(this.filterNode);
    }
  }

  /** Configure continuous backing mode from engine. */
  setContinuousBacking(enabled: boolean, level: number): void {
    this.continuousBackingEnabled = enabled;
    this.continuousBackingLevel = level;
  }

  getZone(): 'left' | 'center' | 'right' | null {
    return this.currentZone;
  }

  getFilterHz(): number {
    return this.filterCutoff;
  }

  getStemVolumes(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [id, stem] of this.stems) {
      result[id] = Math.round(stem.currentGain * 100) / 100;
    }
    return result;
  }

  getStemGain(stemId: string): number {
    return this.stems.get(stemId)?.currentGain ?? 0;
  }

  update(_playbackTime: number, _chord: ChordEntry | null, _velocity: number): void {
    if (this.active) {
      this.updateActive();
    } else {
      this.updateDefault();
    }
  }

  private updateActive(): void {
    let targetLevels: Record<string, number>;
    if (this.posX < LEFT_THRESHOLD) {
      targetLevels = this.mapping.leftZone;
      this.currentZone = 'left';
    } else if (this.posX > RIGHT_THRESHOLD) {
      targetLevels = this.mapping.rightZone;
      this.currentZone = 'right';
    } else {
      targetLevels = this.mapping.centerZone;
      this.currentZone = 'center';
    }

    for (const [, stem] of this.stems) {
      stem.targetGain = targetLevels[stem.id] ?? 0;
      stem.currentGain = lerp(stem.currentGain, stem.targetGain, CROSSFADE_LERP);
      stem.gainNode.gain.value = stem.currentGain;
    }

    // Filter: Y → lowpass cutoff (top = bright, bottom = warm)
    const filterNorm = 1 - this.posY;
    const targetHz = logFreq(filterNorm, FILTER_MIN_HZ, FILTER_MAX_HZ);
    this.filterCutoff = lerp(this.filterCutoff, targetHz, FILTER_LERP);
    this.filterNode.frequency.value = this.filterCutoff;
  }

  private updateDefault(): void {
    this.currentZone = null;

    const defaultGain = this.continuousBackingEnabled ? this.continuousBackingLevel : 0;

    for (const [, stem] of this.stems) {
      stem.targetGain = defaultGain;
      stem.currentGain = lerp(stem.currentGain, stem.targetGain, CROSSFADE_LERP);
      stem.gainNode.gain.value = stem.currentGain;
    }

    // Open filter fully when not actively controlled
    this.filterCutoff = lerp(this.filterCutoff, FILTER_MAX_HZ, FILTER_LERP);
    this.filterNode.frequency.value = this.filterCutoff;
  }

  dispose(): void {
    for (const stem of this.stems.values()) {
      try { stem.gainNode.disconnect(this.filterNode); } catch { /* already disconnected */ }
    }
    this.disposeBase();
  }
}
