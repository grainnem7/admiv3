/**
 * BassSynthVoice.ts — Orange object: rhythmic bass hits on chord root.
 *
 * NEVER drones — always plays discrete rhythmic hits locked to the beat grid.
 *
 * Controls:
 *   Horizontal (X): Rhythm pattern
 *     Left  → root on beat 1 only (minimal)
 *     Center → root on beats 1 and 3 (driving)
 *     Right → walking pattern root-fifth-octave (groovy)
 *
 *   Vertical (Y): Tone via filter cutoff
 *   Velocity: Hit loudness
 *
 * Presets: Sub, Moog, Punchy, Growl
 */

import type { ChordEntry } from './chordLookup';
import { noteToFrequency } from './chordLookup';
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

// ============================================
// Presets
// ============================================

interface BassPreset {
  name: string;
  oscType: OscillatorType;
  /** Attack ramp in seconds (0 = instant). */
  attack: number;
  /** Decay time constant as a fraction of note duration. */
  decayFactor: number;
  /** Sample config key from SAMPLE_CONFIGS. */
  sampleKey: keyof typeof SAMPLE_CONFIGS;
}

const PRESETS: Record<string, BassPreset> = {
  sub:    { name: 'Sub',    oscType: 'sine',     attack: 0,     decayFactor: 0.2,  sampleKey: 'aBass'    },
  moog:   { name: 'Moog',   oscType: 'sawtooth', attack: 0.01,  decayFactor: 0.3,  sampleKey: 'eBass'    },
  punchy: { name: 'Punchy', oscType: 'triangle', attack: 0,     decayFactor: 0.1,  sampleKey: 'slapBass' },
  growl:  { name: 'Growl',  oscType: 'square',   attack: 0.005, decayFactor: 0.25, sampleKey: 'pickBass' },
};

export const BASS_PRESET_LIST = Object.entries(PRESETS).map(([key, p]) => ({ key, name: p.name }));

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
  private currentPreset: BassPreset = PRESETS['sub'];
  private samplerPlayer: SamplerPlayer | null = null;

  private currentRoot = 0;
  private currentChordName: string | null = null;
  private walkingStep = 0;
  private lastStepTime = 0;
  private lastHalfBarTime = 0;

  private getStemBassGain: (() => number) | null = null;

  constructor(ctx: AudioContext, bpm: number) {
    super(ctx);
    this.bpm = bpm;
    this.samplerPlayer = new SamplerPlayer(SAMPLE_CONFIGS['aBass'], this.filterNode);
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  setStemBassGainCallback(cb: () => number): void {
    this.getStemBassGain = cb;
  }

  override setPreset(key: string): void {
    if (!PRESETS[key]) return;
    this.currentPreset = PRESETS[key];
    this.samplerPlayer?.dispose();
    this.samplerPlayer = new SamplerPlayer(SAMPLE_CONFIGS[this.currentPreset.sampleKey], this.filterNode);
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
    this.currentChordName = null;
    this.walkingStep = 0;
    this.lastStepTime = 0;
    this.lastHalfBarTime = 0;
  }

  dispose(): void {
    this.samplerPlayer?.dispose();
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
    if (this.samplerPlayer?.isReady()) {
      this.samplerPlayer.triggerAttackRelease(midi, duration, undefined, velocity * 0.9);
      return;
    }

    // Oscillator fallback
    const now = this.ctx.currentTime;
    const p = this.currentPreset;
    const osc = this.ctx.createOscillator();
    osc.type = p.oscType;
    osc.frequency.value = noteToFrequency(midi);
    const gain = this.ctx.createGain();
    const peakGain = velocity * 0.7;
    if (p.attack > 0) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + p.attack);
      gain.gain.setTargetAtTime(0, now + p.attack, duration * p.decayFactor);
    } else {
      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.setTargetAtTime(0, now + 0.01, duration * p.decayFactor);
    }
    osc.connect(gain);
    gain.connect(this.filterNode);
    osc.start(now);
    osc.stop(now + duration + 0.3);
  }

  private getWalkingPattern(): number[] {
    const root = this.currentRoot;
    const fifth = root + 7;
    const octave = root + 12;
    const clampedOctave = octave > BASS_MAX_MIDI + 12 ? root : octave;
    return [root, fifth, clampedOctave, fifth];
  }
}
