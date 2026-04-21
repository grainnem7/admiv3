/**
 * MelodicVoice.ts — Green object: pentatonic melody with band-crossing triggers.
 *
 * Notes trigger ONLY when crossing a boundary between the 5 pentatonic bands
 * (D4, E4, F#4, A4, B4). Holding still plays nothing new.
 *
 * Controls:
 *   Horizontal (X): Note selection (5 equal bands)
 *   Vertical (Y): Octave (low=+1 oct, middle=0, high=-1 oct)
 *   Velocity at crossing: Note loudness and brightness
 *
 * Presets: Bell, Violin, Pluck, Flute
 */

import type { ChordEntry } from './chordLookup';
import { noteToFrequency, D_MAJOR_PENTATONIC } from './chordLookup';
import { EighthNoteQuantizer } from './quantizer';
import { ToneVoiceBase, clamp } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';

// ============================================
// Presets
// ============================================

interface MelodyPreset {
  name: string;
  oscType: OscillatorType;
  /** Seconds to ramp from 0 to peak gain. */
  attack: number;
  /** setTargetAtTime time constant for decay to 0. */
  decayTC: number;
  /** Seconds before osc.stop() — bounds the ring-out. */
  duration: number;
  /** LFO vibrato rate in Hz (0 = disabled). */
  vibratoHz: number;
  /** Vibrato depth in cents (peak deviation). */
  vibratoDepth: number;
  /** Seconds after attack onset before vibrato reaches full depth. */
  vibratoDelay: number;
  /** If > 0, creates 3 oscillators: 0, +spread, -round(spread*0.65) cents. */
  detuneSpread: number;
  /** Sample config key from SAMPLE_CONFIGS. */
  sampleKey: keyof typeof SAMPLE_CONFIGS;
}

const PRESETS: Record<string, MelodyPreset> = {
  bell:   { name: 'Bell',   oscType: 'sine',     attack: 0.005, decayTC: 0.5,  duration: 3.5, vibratoHz: 0,   vibratoDepth: 0,  vibratoDelay: 0,    detuneSpread: 0, sampleKey: 'bell'   },
  violin: { name: 'Violin', oscType: 'sawtooth', attack: 0.15,  decayTC: 1.8,  duration: 4.2, vibratoHz: 5.5, vibratoDepth: 14, vibratoDelay: 0.12, detuneSpread: 9, sampleKey: 'violin' },
  pluck:  { name: 'Pluck',  oscType: 'triangle', attack: 0.001, decayTC: 0.08, duration: 1.5, vibratoHz: 0,   vibratoDepth: 0,  vibratoDelay: 0,    detuneSpread: 0, sampleKey: 'pizz'   },
  flute:  { name: 'Flute',  oscType: 'sine',     attack: 0.1,   decayTC: 0.9,  duration: 3.2, vibratoHz: 5.0, vibratoDepth: 7,  vibratoDelay: 0.2,  detuneSpread: 0, sampleKey: 'flute'  },
};

export const MELODY_PRESET_LIST = Object.entries(PRESETS).map(([key, p]) => ({ key, name: p.name }));

// ============================================
// MelodicVoice
// ============================================

export class MelodicVoice extends ToneVoiceBase {
  private quantizer: EighthNoteQuantizer;
  private currentPreset: MelodyPreset = PRESETS['bell'];
  private samplerPlayer: SamplerPlayer | null = null;

  private currentZoneIndex = -1;
  private currentOctaveShift = 0;
  private pendingNote: number | null = null;
  private nextTriggerTime = 0;
  private lastTriggeredTime = 0;
  private referenceTime = 0;


  constructor(ctx: AudioContext, bpm: number) {
    super(ctx);
    this.quantizer = new EighthNoteQuantizer(bpm);
    this.samplerPlayer = new SamplerPlayer(SAMPLE_CONFIGS['bell'], this.filterNode);
  }

  override setPreset(key: string): void {
    if (!PRESETS[key]) return;
    this.currentPreset = PRESETS[key];
    this.samplerPlayer?.dispose();
    this.samplerPlayer = new SamplerPlayer(SAMPLE_CONFIGS[this.currentPreset.sampleKey], this.filterNode);
  }

  setBpm(bpm: number): void {
    this.quantizer.setBpm(bpm);
  }

  setBeatTimestamps(beats: number[] | null): void {
    this.quantizer.setBeatTimestamps(beats);
  }

  setReferenceTime(time: number): void {
    this.referenceTime = time;
  }

  update(playbackTime: number, _chord: ChordEntry | null, velocity: number): void {
    if (this.isSilent() && !this.active) return;

    const zoneIndex = this.getZoneIndex();
    const octaveShift = Math.round((0.5 - this.posY) * 2) * 12;

    if (zoneIndex !== this.currentZoneIndex || octaveShift !== this.currentOctaveShift) {
      this.currentZoneIndex = zoneIndex;
      this.currentOctaveShift = octaveShift;
      if (zoneIndex >= 0) {
        this.pendingNote = D_MAJOR_PENTATONIC[zoneIndex] + octaveShift;
        this.nextTriggerTime = this.quantizer.nextQuantizedTime(playbackTime, this.referenceTime);
      }
    }

    if (this.pendingNote !== null && playbackTime >= this.nextTriggerTime) {
      if (playbackTime - this.lastTriggeredTime >= this.quantizer.eighthDuration * 0.9) {
        this.triggerNote(this.pendingNote, velocity);
        this.lastTriggeredTime = playbackTime;
      }
      this.pendingNote = null;
    }
  }

  onTransportStart(): void {
    this.currentZoneIndex = -1;
    this.currentOctaveShift = 0;
    this.pendingNote = null;
    this.lastTriggeredTime = 0;
  }

  onTransportStop(): void {
    this.currentZoneIndex = -1;
    this.currentOctaveShift = 0;
    this.pendingNote = null;
    this.lastTriggeredTime = 0;
  }

  dispose(): void {
    this.samplerPlayer?.dispose();
    this.disposeBase();
  }

  // ---- Internal ----

  private getZoneIndex(): number {
    return Math.min(Math.floor(this.posX * 5), 4);
  }

  private triggerNote(midi: number, velocity: number): void {
    const now = this.ctx.currentTime;
    const p = this.currentPreset;
    const noteVelocity = clamp(0.3 + velocity * 0.7, 0.3, 1.0);

    // Velocity-driven filter brightness boost
    const brightnessBoost = velocity * 3000;
    this.filterNode.frequency.value = clamp(
      this.filterNode.frequency.value + brightnessBoost,
      200,
      12000,
    );

    // Use real sample if loaded; fall back to oscillator synthesis
    if (this.samplerPlayer?.isReady()) {
      this.samplerPlayer.triggerAttackRelease(midi, p.duration, undefined, noteVelocity);
      this.onNoteTrigger?.();
      return;
    }

    const freq = noteToFrequency(midi);
    const stopAt = now + p.duration;

    // Envelope gain (shared by all oscillators)
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(noteVelocity, now + p.attack);
    gain.gain.setTargetAtTime(0, now + p.attack + 0.05, p.decayTC);
    gain.connect(this.filterNode);

    // Vibrato LFO — ramps in after attack + vibratoDelay
    let lfoDepth: GainNode | null = null;
    if (p.vibratoHz > 0) {
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = p.vibratoHz;
      lfoDepth = this.ctx.createGain();
      lfoDepth.gain.setValueAtTime(0, now);
      lfoDepth.gain.linearRampToValueAtTime(0, now + p.attack + p.vibratoDelay);
      lfoDepth.gain.linearRampToValueAtTime(p.vibratoDepth, now + p.attack + p.vibratoDelay + 0.1);
      lfo.connect(lfoDepth);
      lfo.start(now);
      lfo.stop(stopAt);
    }

    // Multiple detuned oscillators for ensemble thickness (e.g. violin)
    const detunes = p.detuneSpread > 0
      ? [0, p.detuneSpread, -Math.round(p.detuneSpread * 0.65)]
      : [0];
    const oscLevel = 1 / detunes.length;

    for (const detune of detunes) {
      const osc = this.ctx.createOscillator();
      osc.type = p.oscType;
      osc.frequency.value = freq;
      if (detune !== 0) osc.detune.value = detune;
      if (lfoDepth) lfoDepth.connect(osc.detune);

      if (detunes.length > 1) {
        const oscGain = this.ctx.createGain();
        oscGain.gain.value = oscLevel;
        osc.connect(oscGain);
        oscGain.connect(gain);
      } else {
        osc.connect(gain);
      }
      osc.start(now);
      osc.stop(stopAt);
    }

    this.onNoteTrigger?.();
  }
}
