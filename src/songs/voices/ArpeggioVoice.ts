/**
 * ArpeggioVoice.ts — Yellow object: cascading arpeggio locked to the beat grid.
 *
 * Scheduling uses ctx.currentTime with lookahead for glitch-free playback.
 *
 * Controls:
 *   Horizontal (X): Density (left=quarter, center=8th, right=16th notes)
 *   Vertical (Y): Range (low=1 octave, high=2 octaves)
 *   Velocity: High velocity adds chromatic passing notes for elaboration
 *
 * Presets: Sparkle, Harp, Pluck, Vibes
 */

import type { ChordEntry } from './chordLookup';
import { noteToFrequency } from './chordLookup';
import {
  ToneVoiceBase,
  clamp,
  LEFT_THRESHOLD,
  RIGHT_THRESHOLD,
} from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';

// ============================================
// Presets
// ============================================

interface ArpPreset {
  name: string;
  oscType: OscillatorType;
  /** 'proportional': decayTC = factor × stepDuration; 'fixed': decayTC = fixedTC */
  decayMode: 'proportional' | 'fixed';
  decayFactor: number;  // used when proportional
  fixedTC: number;      // used when fixed
  /** Initial attack in seconds (0 = instant). */
  attack: number;
  /** Sample config key from SAMPLE_CONFIGS. */
  sampleKey: keyof typeof SAMPLE_CONFIGS;
}

const PRESETS: Record<string, ArpPreset> = {
  sparkle: { name: 'Sparkle', oscType: 'triangle', decayMode: 'proportional', decayFactor: 0.25, fixedTC: 0,    attack: 0,     sampleKey: 'piano'  },
  harp:    { name: 'Harp',    oscType: 'sine',     decayMode: 'proportional', decayFactor: 0.35, fixedTC: 0,    attack: 0.005, sampleKey: 'harp'   },
  pluck:   { name: 'Pluck',   oscType: 'sawtooth', decayMode: 'fixed',        decayFactor: 0,    fixedTC: 0.06, attack: 0,     sampleKey: 'guitar' },
  vibes:   { name: 'Vibes',   oscType: 'sine',     decayMode: 'proportional', decayFactor: 0.5,  fixedTC: 0,    attack: 0.003, sampleKey: 'vibes'  },
};

export const ARP_PRESET_LIST = Object.entries(PRESETS).map(([key, p]) => ({ key, name: p.name }));

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
  private currentPreset: ArpPreset = PRESETS['sparkle'];
  private samplerPlayer: SamplerPlayer | null = null;

  private patternNotes: number[] = [];
  private stepIndex = 0;
  private nextStepTime = 0;
  private currentChordName: string | null = null;
  private running = false;

  private scheduledStops: Array<{ osc: OscillatorNode; stopAt: number }> = [];

  constructor(ctx: AudioContext, bpm: number) {
    super(ctx);
    this.bpm = bpm;
    this.samplerPlayer = new SamplerPlayer(SAMPLE_CONFIGS['piano'], this.filterNode);
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  override setPreset(key: string): void {
    if (!PRESETS[key]) return;
    this.currentPreset = PRESETS[key];
    this.samplerPlayer?.dispose();
    this.samplerPlayer = new SamplerPlayer(SAMPLE_CONFIGS[this.currentPreset.sampleKey], this.filterNode);
  }

  update(_playbackTime: number, chord: ChordEntry | null, velocity: number): void {
    if (!chord) return;

    if (chord.name !== this.currentChordName) {
      this.onChordChange(chord);
    }

    if (this.isSilent() && !this.active) return;

    this.buildPattern(chord, velocity);
    this.scheduleNotes(velocity);
    this.cleanupOldNodes();
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
    this.stopAllScheduled();
  }

  dispose(): void {
    this.running = false;
    this.samplerPlayer?.dispose();
    this.stopAllScheduled();
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

    const now = this.ctx.currentTime;
    const stepDuration = this.getStepDuration();
    const p = this.currentPreset;
    const noteVelocity = clamp(0.3 + velocity * 0.5, 0.3, 0.8);

    if (this.nextStepTime < now - 1) this.nextStepTime = now;

    while (this.nextStepTime < now + LOOKAHEAD) {
      const midi = this.patternNotes[this.stepIndex % this.patternNotes.length];
      const t = this.nextStepTime;

      if (this.samplerPlayer?.isReady()) {
        // Pass pre-scheduled AudioContext time for glitch-free lookahead playback
        this.samplerPlayer.triggerAttackRelease(midi, stepDuration, t, noteVelocity);
      } else {
        // Oscillator fallback
        const decayTC = p.decayMode === 'proportional' ? p.decayFactor * stepDuration : p.fixedTC;
        const osc = this.ctx.createOscillator();
        osc.type = p.oscType;
        osc.frequency.value = noteToFrequency(midi);
        const gain = this.ctx.createGain();
        if (p.attack > 0) {
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(noteVelocity, t + p.attack);
          gain.gain.setTargetAtTime(0, t + p.attack + 0.005, decayTC);
        } else {
          gain.gain.setValueAtTime(noteVelocity, t);
          gain.gain.setTargetAtTime(0, t + 0.005, decayTC);
        }
        osc.connect(gain);
        gain.connect(this.filterNode);
        osc.start(t);
        const stopAt = t + stepDuration + 0.1;
        osc.stop(stopAt);
        this.scheduledStops.push({ osc, stopAt });
      }

      this.stepIndex = (this.stepIndex + 1) % this.patternNotes.length;
      this.nextStepTime += stepDuration;
    }
  }

  private cleanupOldNodes(): void {
    const now = this.ctx.currentTime;
    this.scheduledStops = this.scheduledStops.filter(({ stopAt }) => stopAt > now - 0.2);
  }

  private stopAllScheduled(): void {
    const now = this.ctx.currentTime;
    for (const { osc } of this.scheduledStops) {
      try { osc.stop(now); } catch { /* already stopped */ }
    }
    this.scheduledStops = [];
    this.patternNotes = [];
  }
}
