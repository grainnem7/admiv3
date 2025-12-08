/**
 * InstrumentSampler - Sample-based sounds for instrument zones
 *
 * Uses Tone.js built-in instruments and synthesizers configured
 * to sound like real drums, percussion, and melodic instruments.
 */

import * as Tone from 'tone';
import type { InstrumentType, ZoneSoundSettings } from '../state/instrumentZones';
import { DEFAULT_SOUND_SETTINGS } from '../state/instrumentZones';

// Instrument player types
type DrumPlayer = Tone.MembraneSynth | Tone.MetalSynth | Tone.NoiseSynth;
type TonalPlayer = Tone.Synth | Tone.PluckSynth | Tone.FMSynth;

// Synth class names for reliable type checking (instanceof can fail with bundlers)
type SynthClassName = 'MembraneSynth' | 'MetalSynth' | 'NoiseSynth' | 'Synth' | 'PluckSynth' | 'FMSynth';

interface InstrumentPlayer {
  player: DrumPlayer | TonalPlayer;
  type: 'drum' | 'tonal' | 'percussion';
  synthClass: SynthClassName; // Reliable synth type identifier
  note?: string; // Default note for drums
}

export class InstrumentSampler {
  private isInitialized = false;
  private instruments: Map<InstrumentType, InstrumentPlayer> = new Map();
  private masterGain: Tone.Gain | null = null;
  private reverb: Tone.Reverb | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await Tone.start();

    // Create effects chain - increased master gain for better audibility
    this.masterGain = new Tone.Gain(1.0).toDestination();
    this.reverb = new Tone.Reverb({ decay: 1.5, wet: 0.2 });
    await this.reverb.generate();
    this.reverb.connect(this.masterGain);

    // Create all instruments
    this.createDrumInstruments();
    this.createTonalInstruments();
    this.createPercussionInstruments();

    this.isInitialized = true;
    console.log('[InstrumentSampler] Initialized with all instruments');
  }

  private createDrumInstruments(): void {
    // Kick drum - deep membrane synth
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.4,
        sustain: 0.01,
        release: 0.4,
      },
    });
    kick.volume.value = 3; // Boosted for punch
    kick.connect(this.masterGain!);
    this.instruments.set('kick', { player: kick, type: 'drum', synthClass: 'MembraneSynth', note: 'C1' });

    // Snare drum - noise + membrane combo
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: {
        attack: 0.001,
        decay: 0.2,
        sustain: 0,
        release: 0.2,
      },
    });
    snare.volume.value = 3; // Boosted
    snare.connect(this.reverb!);
    this.instruments.set('snare', { player: snare, type: 'drum', synthClass: 'NoiseSynth' });

    // Tom - membrane synth with mid pitch
    const tom = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 4,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.3,
        sustain: 0.01,
        release: 0.3,
      },
    });
    tom.volume.value = 3; // Boosted
    tom.connect(this.reverb!);
    this.instruments.set('tom', { player: tom, type: 'drum', synthClass: 'MembraneSynth', note: 'G1' });
  }

  private createPercussionInstruments(): void {
    // Hi-hat - metal synth, short decay
    const hihat = new Tone.MetalSynth({
      envelope: {
        attack: 0.001,
        decay: 0.15,
        release: 0.05,
      },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    });
    hihat.volume.value = 3; // Boosted for better audibility
    hihat.connect(this.masterGain!);
    this.instruments.set('hihat', { player: hihat, type: 'percussion', synthClass: 'MetalSynth' });

    // Cymbal - metal synth, longer decay
    const cymbal = new Tone.MetalSynth({
      envelope: {
        attack: 0.001,
        decay: 1.0,
        release: 0.3,
      },
      harmonicity: 5.1,
      modulationIndex: 40,
      resonance: 5000,
      octaves: 1.5,
    });
    cymbal.volume.value = 3; // Boosted for better audibility
    cymbal.connect(this.reverb!);
    this.instruments.set('cymbal', { player: cymbal, type: 'percussion', synthClass: 'MetalSynth' });

    // Clap - filtered noise burst
    const clap = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: {
        attack: 0.005,
        decay: 0.15,
        sustain: 0,
        release: 0.1,
      },
    });
    clap.volume.value = 3; // Boosted
    clap.connect(this.reverb!);
    this.instruments.set('clap', { player: clap, type: 'percussion', synthClass: 'NoiseSynth' });

    // Woodblock - pluck synth for percussive wood sound
    const woodblock = new Tone.PluckSynth({
      attackNoise: 4,
      dampening: 4000,
      resonance: 0.9,
    });
    woodblock.volume.value = 6; // Boosted significantly - PluckSynth is quieter
    woodblock.connect(this.masterGain!);
    this.instruments.set('woodblock', { player: woodblock, type: 'percussion', synthClass: 'PluckSynth' });
  }

  private createTonalInstruments(): void {
    // Piano low (bass) - FM synth with piano-like timbre
    const pianoLow = new Tone.FMSynth({
      harmonicity: 2,
      modulationIndex: 1.5,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.01,
        decay: 0.3,
        sustain: 0.2,
        release: 0.8,
      },
      modulation: { type: 'square' },
      modulationEnvelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.1,
        release: 0.5,
      },
    });
    pianoLow.volume.value = 3; // Boosted for better bass presence
    pianoLow.connect(this.reverb!);
    this.instruments.set('piano-low', { player: pianoLow, type: 'tonal', synthClass: 'FMSynth' });

    // Piano mid - brighter FM synth
    const pianoMid = new Tone.FMSynth({
      harmonicity: 3,
      modulationIndex: 2,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.005,
        decay: 0.2,
        sustain: 0.15,
        release: 0.6,
      },
      modulation: { type: 'triangle' },
      modulationEnvelope: {
        attack: 0.01,
        decay: 0.15,
        sustain: 0.1,
        release: 0.4,
      },
    });
    pianoMid.volume.value = 3; // Boosted
    pianoMid.connect(this.reverb!);
    this.instruments.set('piano-mid', { player: pianoMid, type: 'tonal', synthClass: 'FMSynth' });

    // Piano high - pluck synth for bell-like highs
    const pianoHigh = new Tone.PluckSynth({
      attackNoise: 1,
      dampening: 8000,
      resonance: 0.95,
    });
    pianoHigh.volume.value = 6; // Boosted significantly - PluckSynth is quieter
    pianoHigh.connect(this.reverb!);
    this.instruments.set('piano-high', { player: pianoHigh, type: 'tonal', synthClass: 'PluckSynth' });

    // Synth pad - smooth synth with slow attack
    const synthPad = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.3,
        decay: 0.4,
        sustain: 0.6,
        release: 1.2,
      },
    });
    synthPad.volume.value = 3; // Boosted
    synthPad.connect(this.reverb!);
    this.instruments.set('synth-pad', { player: synthPad, type: 'tonal', synthClass: 'Synth' });

    // Bell - FM synth with bell harmonics
    const bell = new Tone.FMSynth({
      harmonicity: 8,
      modulationIndex: 10,
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 1.5,
        sustain: 0,
        release: 1.0,
      },
      modulation: { type: 'sine' },
      modulationEnvelope: {
        attack: 0.001,
        decay: 0.5,
        sustain: 0,
        release: 0.5,
      },
    });
    bell.volume.value = 3; // Boosted
    bell.connect(this.reverb!);
    this.instruments.set('bell', { player: bell, type: 'tonal', synthClass: 'FMSynth' });
  }

  /**
   * Transpose a note by semitones
   */
  private transposeNote(note: string, semitones: number): string {
    if (semitones === 0) return note;
    const freq = Tone.Frequency(note).toFrequency();
    const transposedFreq = freq * Math.pow(2, semitones / 12);
    return Tone.Frequency(transposedFreq).toNote();
  }

  /**
   * Calculate duration with decay multiplier
   */
  private getDuration(baseDuration: string, decayMultiplier: number): string {
    // Map multiplier to duration: 0.1 = very short, 1 = normal, 3 = very long
    const durations = ['32n', '16n', '8n', '4n', '2n', '1n'];
    const baseIndex = durations.indexOf(baseDuration);
    if (baseIndex === -1) return baseDuration;

    // Shift duration based on multiplier
    const shift = Math.round((decayMultiplier - 1) * 2);
    const newIndex = Math.max(0, Math.min(durations.length - 1, baseIndex + shift));
    return durations[newIndex];
  }

  /**
   * Trigger an instrument sound with optional custom settings
   */
  trigger(instrumentType: InstrumentType, velocity: number = 0.8, soundSettings?: ZoneSoundSettings): void {
    const settings = soundSettings || DEFAULT_SOUND_SETTINGS;
    console.log(`[InstrumentSampler] trigger() called: ${instrumentType}, initialized=${this.isInitialized}, context=${Tone.context.state}`);

    if (!this.isInitialized) {
      console.warn('[InstrumentSampler] Not initialized - attempting to initialize now');
      this.initialize().then(() => {
        this.trigger(instrumentType, velocity, soundSettings);
      });
      return;
    }

    // Resume audio context if needed
    if (Tone.context.state === 'suspended') {
      console.log('[InstrumentSampler] Resuming suspended audio context');
      Tone.context.resume();
    }

    const instrument = this.instruments.get(instrumentType);
    if (!instrument) {
      console.warn(`[InstrumentSampler] Unknown instrument: ${instrumentType}`);
      return;
    }

    const { player, type, synthClass, note } = instrument;

    // Apply volume and velocity from settings
    const finalVelocity = velocity * settings.volume;
    console.log(`[InstrumentSampler] Playing ${instrumentType} (${type}, ${synthClass}) velocity=${finalVelocity.toFixed(2)}, pitch=${settings.pitchOffset}`);

    try {
      const now = Tone.now();
      if (type === 'drum') {
        if (synthClass === 'MembraneSynth') {
          const baseNote = note || 'C2';
          const transposedNote = this.transposeNote(baseNote, settings.pitchOffset);
          const duration = this.getDuration('8n', settings.decay);
          (player as Tone.MembraneSynth).triggerAttackRelease(transposedNote, duration, now, finalVelocity);
        } else if (synthClass === 'NoiseSynth') {
          const duration = this.getDuration('8n', settings.decay);
          (player as Tone.NoiseSynth).triggerAttackRelease(duration, now);
        }
      } else if (type === 'percussion') {
        if (synthClass === 'MetalSynth') {
          const transposedNote = this.transposeNote('C6', settings.pitchOffset);
          const duration = this.getDuration('16n', settings.decay);
          (player as Tone.MetalSynth).triggerAttackRelease(transposedNote, duration, now, finalVelocity);
        } else if (synthClass === 'NoiseSynth') {
          const duration = this.getDuration('16n', settings.decay);
          (player as Tone.NoiseSynth).triggerAttackRelease(duration, now);
        } else if (synthClass === 'PluckSynth') {
          const transposedNote = this.transposeNote('G4', settings.pitchOffset);
          (player as Tone.PluckSynth).triggerAttack(transposedNote, now);
        }
      } else if (type === 'tonal') {
        const baseNote = this.getNoteForInstrument(instrumentType);
        const transposedNote = this.transposeNote(baseNote, settings.pitchOffset);
        const duration = this.getDuration('4n', settings.decay);
        console.log(`[InstrumentSampler] Tonal: playing ${transposedNote} (from ${baseNote}), synthClass: ${synthClass}`);
        if (synthClass === 'PluckSynth') {
          (player as Tone.PluckSynth).triggerAttack(transposedNote, now);
        } else if (synthClass === 'Synth') {
          (player as Tone.Synth).triggerAttackRelease(transposedNote, duration, now, finalVelocity);
        } else if (synthClass === 'FMSynth') {
          (player as Tone.FMSynth).triggerAttackRelease(transposedNote, duration, now, finalVelocity);
        }
      }
    } catch (error) {
      console.error(`[InstrumentSampler] Error triggering ${instrumentType}:`, error);
    }
  }

  private getNoteForInstrument(type: InstrumentType): string {
    switch (type) {
      case 'piano-low':
        return 'C2';
      case 'piano-mid':
        return 'C4';
      case 'piano-high':
        return 'C5';
      case 'synth-pad':
        return 'E3';
      case 'bell':
        return 'C5';
      default:
        return 'C4';
    }
  }

  /**
   * Resume audio context
   */
  async resume(): Promise<void> {
    if (Tone.context.state === 'suspended') {
      await Tone.context.resume();
    }
  }

  /**
   * Set master volume (0-1)
   */
  setVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.rampTo(Math.max(0, Math.min(1, volume)), 0.05);
    }
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.instruments.forEach(({ player }) => {
      player.dispose();
    });
    this.instruments.clear();
    this.reverb?.dispose();
    this.masterGain?.dispose();
    this.isInitialized = false;
  }
}

// Singleton
let instance: InstrumentSampler | null = null;

export function getInstrumentSampler(): InstrumentSampler {
  if (!instance) {
    instance = new InstrumentSampler();
  }
  return instance;
}
