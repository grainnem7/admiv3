/**
 * ChordPadVoice.ts — Red object: chord pad with event-based triggering.
 *
 * Retriggers on velocity threshold crossing, chord change, or object re-entry.
 * Instrument preset (sampled or synthesised) controls tone colour; the voice-level
 * `sustained` param controls whether notes are held or decay immediately.
 *
 * Controls:
 *   Horizontal (X): Voicing spread (close → standard → wide)
 *   Vertical (Y):   Filter cutoff (brightness) + continuous volume swell
 *   Velocity:       Attack time + loudness
 */

import type { ChordEntry } from './chordLookup';
import {
  ToneVoiceBase,
  lerp,
  logFreq,
  clamp,
  FILTER_MIN_HZ,
  FILTER_MAX_HZ,
  LEFT_THRESHOLD,
  RIGHT_THRESHOLD,
} from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import { SynthPlayer, type Player } from './SynthPlayer';
import { PAD_PRESETS, PAD_PRESET_LIST, type PadPreset } from './presets/chordPadPresets';

export { PAD_PRESET_LIST };

// ============================================
// Constants
// ============================================

const FILTER_LERP = 0.18;
const MIN_RETRIGGER_INTERVAL = 0.25;

function xZone(posX: number): 'left' | 'center' | 'right' {
  if (posX < LEFT_THRESHOLD) return 'left';
  if (posX > RIGHT_THRESHOLD) return 'right';
  return 'center';
}

// ============================================
// ChordPadVoice
// ============================================

export class ChordPadVoice extends ToneVoiceBase {
  private currentChordName: string | null = null;
  private filterCutoff = FILTER_MAX_HZ;
  private lastRetriggerTime = 0;
  private currentPreset: PadPreset = PAD_PRESETS['electricPiano'];
  private player: Player;

  private currentZone: 'left' | 'center' | 'right' = 'center';

  /** Swell gain inserted between filterNode and outputGain. */
  private swellGain: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);

    this.swellGain = ctx.createGain();
    this.swellGain.gain.value = 1;
    this.filterNode.disconnect();
    this.filterNode.connect(this.swellGain);
    this.swellGain.connect(this.outputGain);

    this.player = this.createPlayer(this.currentPreset);
  }

  override setPreset(key: string): void {
    const preset = PAD_PRESETS[key];
    if (!preset) return;
    this.currentPreset = preset;
    this.player.dispose();
    this.player = this.createPlayer(preset);
  }

  private createPlayer(preset: PadPreset): Player {
    return preset.kind === 'sampled'
      ? new SamplerPlayer(SAMPLE_CONFIGS[preset.sampleKey], this.filterNode)
      : new SynthPlayer(preset.synthConfig, this.filterNode);
  }

  update(_playbackTime: number, chord: ChordEntry | null, velocity: number): void {
    if (!chord) return;
    if (this.isSilent() && !this.active) return;

    const now = this.ctx.currentTime;
    let shouldRetrigger = false;

    if (chord.name !== this.currentChordName) {
      this.currentChordName = chord.name;
      shouldRetrigger = true;
    }

    const zone = xZone(this.posX);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      shouldRetrigger = true;
    }

    if (shouldRetrigger && (now - this.lastRetriggerTime) >= MIN_RETRIGGER_INTERVAL) {
      this.retriggerChord(chord, velocity);
      this.lastRetriggerTime = now;
    }

    // Y axis → continuous volume swell (top = full, bottom = ~20%)
    const swellTarget = clamp(0.2 + (1 - this.posY) * 0.8, 0.2, 1.0);
    this.swellGain.gain.value = lerp(this.swellGain.gain.value, swellTarget, 0.1);

    // Y axis → filter brightness (brighter at top)
    const filterNorm = 1 - this.posY;
    const targetHz = logFreq(filterNorm, FILTER_MIN_HZ, FILTER_MAX_HZ);
    this.filterCutoff = lerp(this.filterCutoff, targetHz, FILTER_LERP);
    this.filterNode.frequency.value = this.filterCutoff;
  }

  onTransportStop(): void {
    this.player.releaseAll();
    this.currentChordName = null;
    this.lastRetriggerTime = 0;
  }

  dispose(): void {
    this.player.releaseAll();
    this.player.dispose();
    this.swellGain.disconnect();
    this.disposeBase();
  }

  // ---- Internal ----

  private retriggerChord(chord: ChordEntry, velocity: number): void {
    const noteVelocity = clamp(0.3 + velocity * 0.7, 0.3, 1.0);
    const voicedNotes = this.applyVoicing(chord.notes);

    if (!this.player.isReady()) return;

    this.player.releaseAll();
    for (const midi of voicedNotes) {
      if (this.currentPreset.sustained) {
        this.player.triggerAttack(midi, noteVelocity);
      } else {
        this.player.triggerAttackRelease(midi, 0.4, undefined, noteVelocity);
      }
    }
    this.onNoteTrigger?.();
  }

  private applyVoicing(notes: number[]): number[] {
    if (notes.length === 0) return notes;

    if (this.posX < LEFT_THRESHOLD) {
      const base = notes[0];
      return notes.map((note) => {
        let n = note;
        while (n - base >= 12) n -= 12;
        return n;
      });
    } else if (this.posX > RIGHT_THRESHOLD) {
      return notes.map((note, i) => {
        if (i === 0) return note;
        return note + Math.floor(i / 2) * 12;
      });
    }
    return [...notes];
  }
}
