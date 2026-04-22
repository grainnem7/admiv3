/**
 * BassSynthVoice.ts — Orange object: rhythmic bass hits on chord root.
 *
 * NEVER drones — always plays discrete rhythmic hits locked to the beat grid.
 *
 * Controls:
 *   Horizontal (X): Rhythm pattern
 *     Left   → root on beat 1 only (minimal)
 *     Center → root on beats 1 and 3 (driving)
 *     Right  → walking pattern root-fifth-octave (groovy)
 *   Vertical (Y):   Tone via filter cutoff
 *   Velocity:       Hit loudness
 */

import type { ChordEntry } from './chordLookup';
import {
  ToneVoiceBase,
  lerp,
  clamp,
  FILTER_MIN_HZ,
  FILTER_MAX_HZ,
  LEFT_THRESHOLD,
  RIGHT_THRESHOLD,
} from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import { SynthPlayer, type Player } from './SynthPlayer';
import { BASS_PRESETS, BASS_PRESET_LIST, type BassPreset } from './presets/bassPresets';

export { BASS_PRESET_LIST };

// ============================================
// Constants
// ============================================

const BASS_MIN_MIDI = 38; // D2
const BASS_MAX_MIDI = 50; // D3
const FILTER_LERP = 0.06;

// ============================================
// BassSynthVoice
// ============================================

export class BassSynthVoice extends ToneVoiceBase {
  private bpm: number;
  private filterCutoff = FILTER_MAX_HZ;
  private currentPreset: BassPreset = BASS_PRESETS['upright'];
  private player: Player;

  private currentRoot = 0;
  private currentChordName: string | null = null;
  private walkingStep = 0;
  private lastStepTime = 0;
  private lastHalfBarTime = 0;

  private getStemBassGain: (() => number) | null = null;

  constructor(ctx: AudioContext, bpm: number) {
    super(ctx);
    this.bpm = bpm;
    this.player = this.createPlayer(this.currentPreset);
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  setStemBassGainCallback(cb: () => number): void {
    this.getStemBassGain = cb;
  }

  override setPreset(key: string): void {
    const preset = BASS_PRESETS[key];
    if (!preset) return;
    this.currentPreset = preset;
    this.player.dispose();
    this.player = this.createPlayer(preset);
  }

  private createPlayer(preset: BassPreset): Player {
    return preset.kind === 'sampled'
      ? new SamplerPlayer(SAMPLE_CONFIGS[preset.sampleKey], this.filterNode)
      : new SynthPlayer(preset.synthConfig, this.filterNode);
  }

  update(playbackTime: number, chord: ChordEntry | null, velocity: number): void {
    if (!chord) return;
    if (this.isSilent() && !this.active) return;

    if (chord.name !== this.currentChordName) {
      this.onChordChange(chord);
    }

    // Y position → filter brightness
    const filterNorm = 1 - this.posY;
    const targetHz = FILTER_MIN_HZ + filterNorm * (FILTER_MAX_HZ - FILTER_MIN_HZ);
    this.filterCutoff = lerp(this.filterCutoff, targetHz, FILTER_LERP);
    this.filterNode.frequency.value = this.filterCutoff;

    this.updateRhythm(playbackTime, velocity);
  }

  onTransportStop(): void {
    this.player.releaseAll();
    this.currentChordName = null;
    this.walkingStep = 0;
    this.lastStepTime = 0;
    this.lastHalfBarTime = 0;
  }

  dispose(): void {
    this.player.releaseAll();
    this.player.dispose();
    this.disposeBase();
  }

  // ---- Internal ----

  private onChordChange(chord: ChordEntry): void {
    this.currentChordName = chord.name;
    let rootMidi = chord.root;
    while (rootMidi < BASS_MIN_MIDI) rootMidi += 12;
    while (rootMidi > BASS_MAX_MIDI) rootMidi -= 12;
    this.currentRoot = rootMidi;
    this.walkingStep = 0;
  }

  private updateRhythm(playbackTime: number, velocity: number): void {
    // In 12/8: dottedQuarter = 1 beat
    const dottedQuarter = 60 / this.bpm;
    const quarter = dottedQuarter * 2 / 3;
    const eighth = dottedQuarter / 3;
    const halfBar = dottedQuarter * 2;

    const stemBass = this.getStemBassGain?.() ?? 0;
    const duckFactor = stemBass > 0.5 ? 0.5 : 1.0;
    const noteVelocity = clamp((0.3 + velocity * 0.5) * duckFactor, 0.15, 0.8);

    if (this.posX < LEFT_THRESHOLD) {
      if (playbackTime - this.lastHalfBarTime >= halfBar) {
        this.lastHalfBarTime = playbackTime;
        this.triggerBassHit(this.currentRoot, quarter, noteVelocity);
      }
    } else if (this.posX > RIGHT_THRESHOLD) {
      if (playbackTime - this.lastStepTime >= eighth) {
        this.lastStepTime = playbackTime;
        const walkNotes = this.getWalkingPattern();
        this.walkingStep = (this.walkingStep + 1) % walkNotes.length;
        this.triggerBassHit(walkNotes[this.walkingStep], eighth * 0.8, noteVelocity);
      }
    } else {
      if (playbackTime - this.lastStepTime >= quarter) {
        this.lastStepTime = playbackTime;
        this.triggerBassHit(this.currentRoot, quarter * 0.7, noteVelocity);
      }
    }
  }

  private triggerBassHit(midi: number, duration: number, velocity: number): void {
    if (!this.player.isReady()) return;
    this.player.triggerAttackRelease(midi, duration, undefined, velocity * 0.9);
  }

  private getWalkingPattern(): number[] {
    const root = this.currentRoot;
    const fifth = root + 7;
    const octave = root + 12;
    const clampedOctave = octave > BASS_MAX_MIDI + 12 ? root : octave;
    return [root, fifth, clampedOctave, fifth];
  }
}
