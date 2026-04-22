/**
 * ArpeggioVoice.ts — Yellow object: cascading arpeggio locked to the beat grid.
 *
 * Scheduling uses ctx.currentTime with lookahead for glitch-free playback.
 *
 * Controls:
 *   Horizontal (X): Density (left=quarter, center=8th, right=16th notes)
 *   Vertical (Y):   Range (low=1 octave, high=2 octaves)
 *   Velocity:       High velocity adds chromatic passing notes for elaboration
 */

import type { ChordEntry } from './chordLookup';
import {
  ToneVoiceBase,
  clamp,
  LEFT_THRESHOLD,
  RIGHT_THRESHOLD,
} from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import { SynthPlayer, type Player } from './SynthPlayer';
import { ARP_PRESETS, ARP_PRESET_LIST, type ArpPreset } from './presets/arpeggioPresets';

export { ARP_PRESET_LIST };

// ============================================
// Constants
// ============================================

const LOOKAHEAD = 0.1;
const VELOCITY_ELABORATE_THRESHOLD = 0.4;

// ============================================
// ArpeggioVoice
// ============================================

export class ArpeggioVoice extends ToneVoiceBase {
  private bpm: number;
  private currentPreset: ArpPreset = ARP_PRESETS['piano'];
  private player: Player;

  private patternNotes: number[] = [];
  private stepIndex = 0;
  private nextStepTime = 0;
  private currentChordName: string | null = null;
  private running = false;

  constructor(ctx: AudioContext, bpm: number) {
    super(ctx);
    this.bpm = bpm;
    this.player = this.createPlayer(this.currentPreset);
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  override setPreset(key: string): void {
    const preset = ARP_PRESETS[key];
    if (!preset) return;
    this.currentPreset = preset;
    this.player.dispose();
    this.player = this.createPlayer(preset);
  }

  private createPlayer(preset: ArpPreset): Player {
    return preset.kind === 'sampled'
      ? new SamplerPlayer(SAMPLE_CONFIGS[preset.sampleKey], this.filterNode)
      : new SynthPlayer(preset.synthConfig, this.filterNode);
  }

  update(_playbackTime: number, chord: ChordEntry | null, velocity: number): void {
    if (!chord) return;

    if (chord.name !== this.currentChordName) {
      this.onChordChange(chord);
    }

    if (this.isSilent() && !this.active) return;

    this.buildPattern(chord, velocity);
    this.scheduleNotes(velocity);
  }

  onTransportStart(): void {
    this.running = true;
    this.nextStepTime = this.ctx.currentTime;
    this.stepIndex = 0;
  }

  onTransportPause(): void {
    this.running = false;
  }

  onTransportStop(): void {
    this.running = false;
    this.stepIndex = 0;
    this.nextStepTime = 0;
    this.currentChordName = null;
    this.patternNotes = [];
  }

  dispose(): void {
    this.running = false;
    this.player.releaseAll();
    this.player.dispose();
    this.disposeBase();
  }

  // ---- Internal ----

  private onChordChange(chord: ChordEntry): void {
    this.currentChordName = chord.name;
    this.buildPattern(chord, 0);
    this.stepIndex = 0;
  }

  private buildPattern(chord: ChordEntry, velocity: number): void {
    const notes = chord.notes;
    if (notes.length === 0) { this.patternNotes = []; return; }

    const root = notes[0];
    const third = notes.length > 1 ? notes[1] : root + 4;
    const fifth = notes.length > 2 ? notes[2] : root + 7;
    const octave = root + 12;

    let pattern = [root, third, fifth, octave, fifth, third];

    if (this.posY < 0.4) {
      const highRoot = root + 24;
      const highThird = third + 12;
      pattern = [root, third, fifth, octave, highThird, highRoot, highThird, octave, fifth, third];
    }

    if (velocity > VELOCITY_ELABORATE_THRESHOLD) {
      const elaborated: number[] = [];
      for (let i = 0; i < pattern.length; i++) {
        elaborated.push(pattern[i]);
        if (i < pattern.length - 1) {
          const diff = pattern[i + 1] - pattern[i];
          if (Math.abs(diff) > 2) {
            elaborated.push(pattern[i + 1] + (diff > 0 ? -1 : 1));
          }
        }
      }
      this.patternNotes = elaborated;
    } else {
      this.patternNotes = pattern;
    }
  }

  private getStepDuration(): number {
    const dottedQuarter = 60 / this.bpm;
    const quarter = dottedQuarter * 2 / 3;
    const eighth = dottedQuarter / 3;
    const sixteenth = eighth / 2;

    if (this.posX < LEFT_THRESHOLD) return quarter;
    if (this.posX > RIGHT_THRESHOLD) return sixteenth;
    return eighth;
  }

  private scheduleNotes(velocity: number): void {
    if (this.patternNotes.length === 0 || !this.running) return;
    if (!this.player.isReady()) return;

    const now = this.ctx.currentTime;
    const stepDuration = this.getStepDuration();
    const noteVelocity = clamp(0.3 + velocity * 0.5, 0.3, 0.8);

    if (this.nextStepTime < now - 1) this.nextStepTime = now;

    while (this.nextStepTime < now + LOOKAHEAD) {
      const midi = this.patternNotes[this.stepIndex % this.patternNotes.length];
      const t = this.nextStepTime;

      this.player.triggerAttackRelease(midi, this.currentPreset.duration, t, noteVelocity);

      this.stepIndex = (this.stepIndex + 1) % this.patternNotes.length;
      this.nextStepTime += stepDuration;
    }
  }
}
