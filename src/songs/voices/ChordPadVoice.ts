/**
 * ChordPadVoice.ts — Red object: chord pad with event-based triggering.
 *
 * Retriggers on velocity threshold crossing, chord change, or object re-entry.
 * Instrument preset controls waveform and envelope shape.
 *
 * Controls:
 *   Horizontal (X): Voicing spread (close → standard → wide)
 *   Vertical (Y): Filter cutoff (brightness)
 *   Velocity: Attack time + loudness
 *
 * Presets: Warm Pad, Bright Pad, Stab, Strings
 */

import type { ChordEntry } from './chordLookup';
import { noteToFrequency } from './chordLookup';
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

// ============================================
// Presets
// ============================================

interface PadPreset {
  name: string;
  oscType: OscillatorType;
  /** Seconds to ramp from 0 to peak gain. */
  attack: number;
  /** If true, oscillator sustains at peak — no decay automation. */
  sustained: boolean;
  /** When sustained=false: setTargetAtTime time constant for decay. */
  decayTC: number;
  /** Gain per oscillator note (before velocity scaling). */
  gainPerNote: number;
  /** Optional second oscillator detune offset in cents (0 = disabled). */
  detuneOffset: number;
  /** Sample config key from SAMPLE_CONFIGS. */
  sampleKey: keyof typeof SAMPLE_CONFIGS;
}

const PRESETS: Record<string, PadPreset> = {
  warmPad:   { name: 'Warm Pad',   oscType: 'sawtooth', attack: 0.5,  sustained: true,  decayTC: 0,    gainPerNote: 0.15, detuneOffset: 0, sampleKey: 'warmPad' },
  brightPad: { name: 'Bright Pad', oscType: 'square',   attack: 0.2,  sustained: true,  decayTC: 0,    gainPerNote: 0.12, detuneOffset: 5, sampleKey: 'ePiano'  },
  stab:      { name: 'Stab',       oscType: 'sawtooth', attack: 0.01, sustained: false, decayTC: 0.15, gainPerNote: 0.18, detuneOffset: 0, sampleKey: 'stabPad' },
  strings:   { name: 'Strings',    oscType: 'sawtooth', attack: 1.0,  sustained: true,  decayTC: 0,    gainPerNote: 0.10, detuneOffset: 8, sampleKey: 'strings' },
};

export const PAD_PRESET_LIST = Object.entries(PRESETS).map(([key, p]) => ({ key, name: p.name }));

// ============================================
// Constants
// ============================================

const FILTER_LERP = 0.18;
const MIN_RETRIGGER_INTERVAL = 0.25;

/** Map posX to one of three voicing zones. */
function xZone(posX: number): 'left' | 'center' | 'right' {
  if (posX < LEFT_THRESHOLD) return 'left';
  if (posX > RIGHT_THRESHOLD) return 'right';
  return 'center';
}

// ============================================
// ChordPadVoice
// ============================================

interface NoteNode {
  osc: OscillatorNode;
  gain: GainNode;
}

export class ChordPadVoice extends ToneVoiceBase {
  private activeNoteNodes: NoteNode[] = [];
  private currentChordName: string | null = null;
  private filterCutoff = FILTER_MAX_HZ;
  private lastRetriggerTime = 0;
  private currentPreset: PadPreset = PRESETS['warmPad'];
  private samplerPlayer: SamplerPlayer | null = null;

  /** Current X voicing zone — retrigger when this changes. */
  private currentZone: 'left' | 'center' | 'right' = 'center';

  /**
   * Swell gain inserted between filterNode and outputGain.
   * Y axis maps continuously to this gain (top = full, bottom = quiet).
   */
  private swellGain: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);

    // Rewire: filterNode → swellGain → outputGain
    this.swellGain = ctx.createGain();
    this.swellGain.gain.value = 1;
    this.filterNode.disconnect();
    this.filterNode.connect(this.swellGain);
    this.swellGain.connect(this.outputGain);

    this.samplerPlayer = new SamplerPlayer(SAMPLE_CONFIGS['warmPad'], this.filterNode);
  }

  override setPreset(key: string): void {
    if (!PRESETS[key]) return;
    this.currentPreset = PRESETS[key];
    this.samplerPlayer?.dispose();
    this.samplerPlayer = new SamplerPlayer(SAMPLE_CONFIGS[this.currentPreset.sampleKey], this.filterNode);
  }

  update(_playbackTime: number, chord: ChordEntry | null, velocity: number): void {
    if (!chord) return;
    if (this.isSilent() && !this.active) return;

    const now = this.ctx.currentTime;
    let shouldRetrigger = false;

    // Chord change always retriggers
    if (chord.name !== this.currentChordName) {
      this.currentChordName = chord.name;
      shouldRetrigger = true;
    }

    // X zone crossing retriggers with new voicing
    const zone = xZone(this.posX);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      shouldRetrigger = true;
    }

    if (shouldRetrigger && (now - this.lastRetriggerTime) >= MIN_RETRIGGER_INTERVAL) {
      this.retriggerChord(chord, velocity, now);
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
    this.releaseAll();
    this.currentChordName = null;
    this.lastRetriggerTime = 0;
  }

  dispose(): void {
    this.samplerPlayer?.dispose();
    this.releaseAll();
    this.swellGain.disconnect();
    this.disposeBase();
  }

  // ---- Internal ----

  private retriggerChord(chord: ChordEntry, velocity: number, now: number): void {
    const p = this.currentPreset;
    const noteVelocity = clamp(0.3 + velocity * 0.7, 0.3, 1.0);
    const voicedNotes = this.applyVoicing(chord.notes);

    if (this.samplerPlayer?.isReady()) {
      this.samplerPlayer.releaseAll();
      for (const midi of voicedNotes) {
        if (p.sustained) {
          this.samplerPlayer.triggerAttack(midi, noteVelocity);
        } else {
          // stab: short note with sampler's release envelope
          this.samplerPlayer.triggerAttackRelease(midi, 0.4, undefined, noteVelocity);
        }
      }
      this.onNoteTrigger?.();
      return;
    }

    // Oscillator fallback
    this.releaseAll();

    // Map velocity to attack: fast gesture → use preset attack, slow → slower
    const attackTime = velocity > 0.5 ? p.attack : p.attack * (1 + (1 - velocity * 2) * 0.5);

    for (const midi of voicedNotes) {
      const freq = noteToFrequency(midi);
      this.createNoteOsc(freq, 0, now, attackTime, noteVelocity, p);
      // Strings preset: second detuned oscillator for ensemble thickness
      if (p.detuneOffset !== 0) {
        this.createNoteOsc(freq, p.detuneOffset, now, attackTime, noteVelocity * 0.7, p);
      }
    }

    this.onNoteTrigger?.();
  }

  private createNoteOsc(
    freq: number,
    detuneCents: number,
    now: number,
    attackTime: number,
    noteVelocity: number,
    p: PadPreset,
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = p.oscType;
    osc.frequency.value = freq;
    if (detuneCents !== 0) osc.detune.value = detuneCents;

    const gain = this.ctx.createGain();
    const peakGain = p.gainPerNote * noteVelocity;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + attackTime);

    if (!p.sustained) {
      // Stab: fast decay after short sustain
      gain.gain.setTargetAtTime(0, now + attackTime + 0.01, p.decayTC);
    }

    osc.connect(gain);
    gain.connect(this.filterNode);
    osc.start(now);
    this.activeNoteNodes.push({ osc, gain });
  }

  private releaseAll(): void {
    if (this.samplerPlayer?.isReady()) {
      this.samplerPlayer.releaseAll();
    }
    const now = this.ctx.currentTime;
    for (const { osc, gain } of this.activeNoteNodes) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.05);
      try { osc.stop(now + 0.4); } catch { /* already stopped */ }
    }
    this.activeNoteNodes = [];
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
