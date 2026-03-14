/**
 * SoundEngine - Tone.js based sound engine for ADMI v3
 *
 * Architecture from v2's ToneSoundEngine, enhanced with v1's musical content:
 * - Three-voice architecture (melody, bass, chord)
 * - Effects chain: Filter → Delay → Chorus → Reverb
 * - Chord progressions with emotional arcs
 * - Melodic patterns for phrase generation
 *
 * This replaces the basic Web Audio AudioEngine with a richer implementation.
 */

import * as Tone from 'tone';
import type { MusicSettings } from '../state/types';

// ============================================
// Types
// ============================================

export type VoiceType = 'melody' | 'bass' | 'chord';
export type OscillatorType = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface SoundEngineConfig {
  /** Master volume (0-1, default: 0.7) */
  masterVolume?: number;
  /** Enable reverb effect (default: true) */
  reverb?: boolean;
  /** Reverb decay time in seconds (default: 4) */
  reverbDecay?: number;
  /** Reverb wet/dry mix (0-1, default: 0.35) */
  reverbWet?: number;
  /** Enable delay effect (default: true) */
  delay?: boolean;
  /** Delay time (default: '8n.') */
  delayTime?: Tone.Unit.Time;
  /** Delay feedback (0-1, default: 0.2) */
  delayFeedback?: number;
  /** Delay wet/dry mix (0-1, default: 0.15) */
  delayWet?: number;
  /** Enable chorus effect (default: true) */
  chorus?: boolean;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

export interface VoiceConfig {
  oscillator: OscillatorType;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  volume: number; // in dB
}

export interface PlayNoteOptions {
  velocity?: number;
  duration?: Tone.Unit.Time;
}

// ============================================
// Default Configurations
// ============================================

const DEFAULT_CONFIG: Required<SoundEngineConfig> = {
  masterVolume: 0.7,
  reverb: true,
  reverbDecay: 4,
  reverbWet: 0.35,
  delay: true,
  delayTime: '8n.',
  delayFeedback: 0.2,
  delayWet: 0.15,
  chorus: true,
  debug: false,
};

// Voice configurations inspired by v1's ambient sound design
const VOICE_CONFIGS: Record<VoiceType, VoiceConfig> = {
  melody: {
    oscillator: 'triangle',
    attack: 0.02,
    decay: 0.8,
    sustain: 0.2,
    release: 2.0,
    volume: -8,
  },
  bass: {
    oscillator: 'sine',
    attack: 0.1,
    decay: 0.3,
    sustain: 0.7,
    release: 1.5,
    volume: -10,
  },
  chord: {
    oscillator: 'sine',
    attack: 0.3,
    decay: 0.5,
    sustain: 0.6,
    release: 2.5,
    volume: -12,
  },
};

// ============================================
// SoundEngine Class
// ============================================

export class SoundEngine {
  private config: Required<SoundEngineConfig>;
  private isInitialized = false;

  // Synths (one per voice type)
  private melodySynth: Tone.PolySynth | null = null;
  private bassSynth: Tone.PolySynth | null = null;
  private chordSynth: Tone.PolySynth | null = null;

  // Theremin synth (MonoSynth with portamento for smooth pitch)
  private thereminSynth: Tone.MonoSynth | null = null;
  private thereminPlaying: boolean = false;

  // Effects chain
  private filter: Tone.Filter | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private chorus: Tone.Chorus | null = null;
  private reverb: Tone.Reverb | null = null;
  private masterGain: Tone.Gain | null = null;

  // Vibrato effect (inserted between synths and filter)
  private vibratoEffect: Tone.Vibrato | null = null;

  // Dynamics velocity clamping
  private dynamicsRange: [number, number] = [0, 1];

  // Portamento time in seconds
  private portamentoTime = 0;

  // State
  private isMuted = false;

  constructor(config: SoundEngineConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the sound engine. Must be called after user interaction.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Start Tone.js context
      await Tone.start();

      // Create master gain
      this.masterGain = new Tone.Gain(this.config.masterVolume).toDestination();

      // Create effects chain (in reverse order for connection)
      await this.createEffectsChain();

      // Create synths
      this.createSynths();

      this.isInitialized = true;

      if (this.config.debug) {
        console.log('[SoundEngine] Initialized with effects chain:',
          this.config.delay ? 'Filter → Delay →' : 'Filter →',
          this.config.chorus ? 'Chorus →' : '',
          this.config.reverb ? 'Reverb →' : '',
          'Master'
        );
      }
    } catch (error) {
      console.error('[SoundEngine] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create the effects chain.
   */
  private async createEffectsChain(): Promise<void> {
    // Create reverb (end of chain, connects to master)
    if (this.config.reverb) {
      this.reverb = new Tone.Reverb({
        decay: this.config.reverbDecay,
        wet: this.config.reverbWet,
        preDelay: 0.05,
      });
      await this.reverb.generate();
      this.reverb.connect(this.masterGain!);
    }

    // Create chorus (connects to reverb or master)
    if (this.config.chorus) {
      this.chorus = new Tone.Chorus({
        frequency: 1.5,
        delayTime: 3.5,
        depth: 0.7,
        wet: 0.3,
      }).start();
      this.chorus.connect(this.reverb ?? this.masterGain!);
    }

    // Create delay (connects to chorus, reverb, or master)
    if (this.config.delay) {
      this.delay = new Tone.FeedbackDelay({
        delayTime: this.config.delayTime,
        feedback: this.config.delayFeedback,
        wet: this.config.delayWet,
      });
      this.delay.connect(this.chorus ?? this.reverb ?? this.masterGain!);
    }

    // Create filter (synths → vibrato → filter → delay → ...)
    this.filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 4000,
      Q: 0.5,
      rolloff: -12,
    });
    this.filter.connect(this.delay ?? this.chorus ?? this.reverb ?? this.masterGain!);

    // Create vibrato effect (between synths and filter, starts at 0 depth)
    this.vibratoEffect = new Tone.Vibrato({
      frequency: 5,
      depth: 0,
      wet: 1,
    });
    this.vibratoEffect.connect(this.filter);
  }

  /**
   * Create the three synth voices.
   */
  private createSynths(): void {
    const createPolySynth = (config: VoiceConfig): Tone.PolySynth => {
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: config.oscillator },
        envelope: {
          attack: config.attack,
          decay: config.decay,
          sustain: config.sustain,
          release: config.release,
        },
      });
      synth.maxPolyphony = 16;
      synth.volume.value = config.volume;
      // Connect to vibrato (if available) or filter directly
      synth.connect(this.vibratoEffect ?? this.filter!);
      return synth;
    };

    this.melodySynth = createPolySynth(VOICE_CONFIGS.melody);
    this.bassSynth = createPolySynth(VOICE_CONFIGS.bass);
    this.chordSynth = createPolySynth(VOICE_CONFIGS.chord);

    // Create theremin synth (MonoSynth with portamento for smooth glides)
    this.thereminSynth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 1.0,
        release: 0.2,
      },
      filterEnvelope: {
        attack: 0.02,
        decay: 0.2,
        sustain: 0.6,
        release: 0.2,
        baseFrequency: 300,
        octaves: 5,
      },
    });
    this.thereminSynth.portamento = 0.03; // 30ms glide between notes
    this.thereminSynth.volume.value = 0;
    this.thereminSynth.connect(this.vibratoEffect ?? this.filter!);

    // DEBUG: Confirm synths created
    console.log('[SoundEngine] Synths created:', {
      melody: !!this.melodySynth,
      bass: !!this.bassSynth,
      chord: !!this.chordSynth,
      theremin: !!this.thereminSynth,
      filter: !!this.filter,
      audioContextState: Tone.context.state,
    });
  }

  /**
   * Get a synth by voice type.
   */
  private getSynth(voice: VoiceType): Tone.PolySynth | null {
    switch (voice) {
      case 'melody':
        return this.melodySynth;
      case 'bass':
        return this.bassSynth;
      case 'chord':
        return this.chordSynth;
      default:
        return this.melodySynth;
    }
  }

  /**
   * Play a single note on a voice.
   */
  playNote(
    voice: VoiceType,
    note: string | number,
    options: PlayNoteOptions = {}
  ): void {
    if (!this.isInitialized || this.isMuted) return;

    const synth = this.getSynth(voice);
    if (!synth) return;

    const { velocity = 0.7, duration = '8n' } = options;
    const clampedVelocity = this.clampVelocity(velocity);

    try {
      synth.triggerAttackRelease(note, duration, undefined, clampedVelocity);

      if (this.config.debug) {
        console.log(`[SoundEngine] ${voice}: ${note} (vel: ${clampedVelocity.toFixed(2)}, dur: ${duration})`);
      }
    } catch (error) {
      console.error('[SoundEngine] Error playing note:', error);
    }
  }

  /**
   * Play a chord (multiple notes at once).
   */
  playChord(
    voice: VoiceType,
    notes: (string | number)[],
    options: PlayNoteOptions = {}
  ): void {
    if (!this.isInitialized || this.isMuted) return;

    const synth = this.getSynth(voice);
    if (!synth) return;

    const { velocity = 0.5, duration = '2n' } = options;
    const clampedVelocity = this.clampVelocity(velocity);

    try {
      synth.triggerAttackRelease(notes, duration, undefined, clampedVelocity);

      if (this.config.debug) {
        console.log(`[SoundEngine] ${voice} chord: [${notes.join(', ')}]`);
      }
    } catch (error) {
      console.error('[SoundEngine] Error playing chord:', error);
    }
  }

  /**
   * Start a sustained note (noteOn).
   */
  noteOn(voice: VoiceType, note: string | number, velocity = 0.7): void {
    // DEBUG: Log noteOn call details
    console.log(`[SoundEngine] noteOn called: voice=${voice}, note=${note}, vel=${velocity}, initialized=${this.isInitialized}, muted=${this.isMuted}`);

    if (!this.isInitialized || this.isMuted) {
      console.log(`[SoundEngine] noteOn BLOCKED: initialized=${this.isInitialized}, muted=${this.isMuted}`);
      return;
    }

    const synth = this.getSynth(voice);
    if (!synth) {
      console.log(`[SoundEngine] noteOn BLOCKED: no synth for voice=${voice}`);
      return;
    }

    const clampedVelocity = this.clampVelocity(velocity);

    try {
      console.log(`[SoundEngine] Triggering attack: ${note} on ${voice}`);
      synth.triggerAttack(note, undefined, clampedVelocity);
    } catch (error) {
      console.error('[SoundEngine] Error in noteOn:', error);
    }
  }

  /**
   * Release a sustained note (noteOff).
   */
  noteOff(voice: VoiceType, note: string | number): void {
    if (!this.isInitialized) return;

    const synth = this.getSynth(voice);
    if (!synth) return;

    try {
      synth.triggerRelease(note);
    } catch (error) {
      console.error('[SoundEngine] Error in noteOff:', error);
    }
  }

  // ============================================
  // Theremin Mode Methods
  // ============================================

  /**
   * Start theremin sound at a given frequency.
   * Uses MonoSynth with portamento for smooth pitch changes.
   */
  thereminStart(frequency: number, velocity = 0.7): void {
    if (!this.isInitialized || this.isMuted || !this.thereminSynth) return;

    try {
      if (!this.thereminPlaying) {
        this.thereminSynth.triggerAttack(frequency, undefined, velocity);
        this.thereminPlaying = true;
        console.log(`[SoundEngine] Theremin start: ${frequency.toFixed(1)} Hz`);
      }
    } catch (error) {
      console.error('[SoundEngine] Error in thereminStart:', error);
    }
  }

  /**
   * Update theremin frequency (glides smoothly due to portamento).
   */
  thereminSetFrequency(frequency: number): void {
    if (!this.isInitialized || !this.thereminSynth || !this.thereminPlaying) return;

    try {
      // Use setTargetAtTime for smooth frequency transition
      this.thereminSynth.frequency.rampTo(frequency, 0.05);
    } catch (error) {
      console.error('[SoundEngine] Error in thereminSetFrequency:', error);
    }
  }

  /**
   * Update theremin volume (for left hand control).
   */
  thereminSetVolume(volume: number): void {
    if (!this.isInitialized || !this.thereminSynth) return;

    try {
      // Map 0-1 to dB range (-24 to 0)
      const dbValue = -24 + volume * 24;
      this.thereminSynth.volume.rampTo(dbValue, 0.05);
    } catch (error) {
      console.error('[SoundEngine] Error in thereminSetVolume:', error);
    }
  }

  /**
   * Stop theremin sound.
   */
  thereminStop(): void {
    if (!this.isInitialized || !this.thereminSynth) return;

    try {
      if (this.thereminPlaying) {
        this.thereminSynth.triggerRelease();
        this.thereminPlaying = false;
        console.log('[SoundEngine] Theremin stop');
      }
    } catch (error) {
      console.error('[SoundEngine] Error in thereminStop:', error);
    }
  }

  /**
   * Check if theremin is currently playing.
   */
  isThereminPlaying(): boolean {
    return this.thereminPlaying;
  }

  /**
   * Release all notes on a voice.
   */
  releaseAll(voice?: VoiceType): void {
    if (!this.isInitialized) return;

    if (voice) {
      this.getSynth(voice)?.releaseAll();
    } else {
      this.melodySynth?.releaseAll();
      this.bassSynth?.releaseAll();
      this.chordSynth?.releaseAll();
    }
  }

  /**
   * Set filter frequency (0-1 normalized, maps to 200-8000 Hz).
   */
  setFilterFrequency(value: number): void {
    if (!this.filter) return;

    // Clamp and validate input
    if (!Number.isFinite(value)) {
      value = 0.5; // Default to mid-range if invalid
    }
    value = Math.max(0, Math.min(1, value));

    // Map 0-1 to 200-8000 Hz (logarithmic)
    const minFreq = 200;
    const maxFreq = 8000;
    const freq = minFreq * Math.pow(maxFreq / minFreq, value);
    this.filter.frequency.rampTo(freq, 0.05);
  }

  /**
   * Set reverb wet/dry mix (0-1).
   */
  setReverbWet(value: number): void {
    if (!this.reverb) return;
    if (!Number.isFinite(value)) value = 0.3;
    value = Math.max(0, Math.min(1, value));
    this.reverb.wet.rampTo(value, 0.1);
  }

  /**
   * Set delay wet/dry mix (0-1).
   */
  setDelayWet(value: number): void {
    if (!this.delay) return;
    this.delay.wet.rampTo(value, 0.1);
  }

  /**
   * Set master volume (0-1).
   */
  setMasterVolume(volume: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.rampTo(this.config.masterVolume, 0.05);
    }
  }

  /**
   * Set muted state.
   */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.rampTo(muted ? 0 : this.config.masterVolume, 0.05);
    }
    if (muted) {
      this.releaseAll();
    }
  }

  /**
   * Toggle mute.
   */
  toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * Check if engine is ready.
   */
  isReady(): boolean {
    return this.isInitialized && Tone.context.state === 'running';
  }

  /**
   * Get current state.
   */
  getState(): 'uninitialized' | 'running' | 'suspended' {
    if (!this.isInitialized) return 'uninitialized';
    return Tone.context.state === 'running' ? 'running' : 'suspended';
  }

  /**
   * Resume audio context (call after user interaction if suspended).
   */
  async resume(): Promise<void> {
    if (Tone.context.state === 'suspended') {
      await Tone.context.resume();
    }
  }

  /**
   * Play a test sound to verify audio is working.
   */
  async testSound(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Resume audio context if suspended (required after user interaction)
    await this.resume();

    // Play a nice arpeggio
    const notes = ['C4', 'E4', 'G4', 'C5', 'E5'];
    notes.forEach((note, i) => {
      const time = Tone.now() + i * 0.15;
      this.melodySynth?.triggerAttackRelease(note, '8n', time, 0.5);
    });
  }

  /**
   * Apply effect preset configuration.
   * Updates filter, delay, reverb, and chorus settings.
   */
  applyEffectConfig(config: {
    filterFrequency?: number;
    filterQ?: number;
    delayTime?: string;
    delayFeedback?: number;
    delayWet?: number;
    reverbDecay?: number;
    reverbWet?: number;
    chorusFrequency?: number;
    chorusDepth?: number;
    chorusWet?: number;
  }): void {
    if (!this.isInitialized) return;

    // Filter settings
    if (config.filterFrequency !== undefined && this.filter) {
      this.filter.frequency.rampTo(config.filterFrequency, 0.2);
    }
    if (config.filterQ !== undefined && this.filter) {
      this.filter.Q.rampTo(config.filterQ, 0.1);
    }

    // Delay settings
    if (config.delayFeedback !== undefined && this.delay) {
      this.delay.feedback.rampTo(config.delayFeedback, 0.1);
    }
    if (config.delayWet !== undefined && this.delay) {
      this.delay.wet.rampTo(config.delayWet, 0.1);
    }

    // Reverb settings
    if (config.reverbWet !== undefined && this.reverb) {
      this.reverb.wet.rampTo(config.reverbWet, 0.2);
    }

    // Chorus settings
    if (config.chorusFrequency !== undefined && this.chorus) {
      this.chorus.frequency.rampTo(config.chorusFrequency, 0.1);
    }
    if (config.chorusDepth !== undefined && this.chorus) {
      this.chorus.depth = config.chorusDepth;
    }
    if (config.chorusWet !== undefined && this.chorus) {
      this.chorus.wet.rampTo(config.chorusWet, 0.1);
    }

    if (this.config.debug) {
      console.log('[SoundEngine] Applied effect config:', config);
    }
  }

  /**
   * Get the filter node for external effect chain integration.
   */
  getFilterNode(): Tone.Filter | null {
    return this.filter;
  }

  /**
   * Get the reverb node for external effect chain integration.
   */
  getReverbNode(): Tone.Reverb | null {
    return this.reverb;
  }

  // ============================================
  // Music Settings Methods
  // ============================================

  /**
   * Set the oscillator type for a specific voice at runtime.
   */
  setVoiceSynthType(voice: VoiceType, type: OscillatorType): void {
    if (!this.isInitialized) return;
    const synth = this.getSynth(voice);
    if (!synth) return;

    try {
      synth.set({ oscillator: { type } });
    } catch (error) {
      console.error(`[SoundEngine] Error setting ${voice} synth type:`, error);
    }
  }

  /**
   * Set ADSR envelope for a specific voice.
   */
  setVoiceEnvelope(voice: VoiceType, envelope: {
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
  }): void {
    if (!this.isInitialized) return;
    const synth = this.getSynth(voice);
    if (!synth) return;

    try {
      synth.set({ envelope });
    } catch (error) {
      console.error(`[SoundEngine] Error setting ${voice} envelope:`, error);
    }
  }

  /**
   * Set vibrato depth and rate. Applies to all voices via the shared vibrato effect node.
   * @param depth 0-1 (0 = off)
   * @param rateHz 1-10 Hz
   */
  setVibrato(depth: number, rateHz: number): void {
    if (!this.vibratoEffect) return;

    try {
      this.vibratoEffect.depth.value = Math.max(0, Math.min(1, depth));
      this.vibratoEffect.frequency.value = Math.max(0.1, Math.min(20, rateHz));
    } catch (error) {
      console.error('[SoundEngine] Error setting vibrato:', error);
    }
  }

  /**
   * Set portamento (glide) time in seconds.
   * Only applies to theremin synth (MonoSynth).
   */
  setPortamento(time: number): void {
    this.portamentoTime = Math.max(0, Math.min(0.5, time));
    if (this.thereminSynth) {
      this.thereminSynth.portamento = this.portamentoTime;
    }
  }

  /**
   * Get current portamento time.
   */
  getPortamento(): number {
    return this.portamentoTime;
  }

  /**
   * Set filter type (lowpass, highpass, bandpass).
   */
  setFilterType(type: 'lowpass' | 'highpass' | 'bandpass'): void {
    if (!this.filter) return;
    this.filter.type = type;
  }

  /**
   * Set chorus wet/dry mix (harmonic richness control).
   */
  setChorusWet(value: number): void {
    if (!this.chorus) return;
    if (!Number.isFinite(value)) value = 0.3;
    value = Math.max(0, Math.min(1, value));
    this.chorus.wet.rampTo(value, 0.1);
  }

  /**
   * Set dynamics (velocity) range.
   */
  setDynamicsRange(min: number, max: number): void {
    this.dynamicsRange = [Math.max(0, min), Math.min(1, max)];
  }

  /**
   * Clamp velocity to the configured dynamics range.
   */
  private clampVelocity(velocity: number): number {
    const [min, max] = this.dynamicsRange;
    return Math.max(min, Math.min(max, velocity));
  }

  /**
   * Apply a complete MusicSettings object to the engine.
   * Called when music settings change in the Zustand store.
   */
  applyMusicSettings(settings: MusicSettings): void {
    if (!this.isInitialized) return;

    // Per-voice synth types
    this.setVoiceSynthType('melody', settings.melodicSynthType);
    this.setVoiceSynthType('bass', settings.bassSynthType);
    this.setVoiceSynthType('chord', settings.chordSynthType);

    // ADSR envelope (denormalize from 0-1 to real values)
    const attackSeconds = 0.001 + settings.attackTime * 0.499; // 0.001-0.5s
    const releaseSeconds = 0.1 + settings.releaseTime * 1.9; // 0.1-2s
    for (const voice of ['melody', 'bass', 'chord'] as VoiceType[]) {
      this.setVoiceEnvelope(voice, {
        attack: attackSeconds,
        release: releaseSeconds,
      });
    }

    // Vibrato (denormalize rate from 0-1 to 1-10 Hz)
    const vibratoRateHz = 1 + settings.vibratoRate * 9;
    this.setVibrato(settings.vibratoDepth, vibratoRateHz);

    // Portamento (denormalize from 0-1 to 0-0.5s)
    this.setPortamento(settings.portamento * 0.5);

    // Dynamics range
    this.setDynamicsRange(settings.dynamicsRange[0], settings.dynamicsRange[1]);

    // Filter
    this.setFilterType(settings.filterType);
    this.setFilterFrequency(settings.filterFrequency);

    // Effects
    this.setReverbWet(settings.reverbAmount);
    this.setDelayWet(settings.delayAmount);
    this.setChorusWet(settings.harmonicRichness);

    if (this.config.debug) {
      console.log('[SoundEngine] Applied music settings');
    }
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.releaseAll();

    this.melodySynth?.dispose();
    this.bassSynth?.dispose();
    this.chordSynth?.dispose();
    this.vibratoEffect?.dispose();
    this.filter?.dispose();
    this.delay?.dispose();
    this.chorus?.dispose();
    this.reverb?.dispose();
    this.masterGain?.dispose();

    this.melodySynth = null;
    this.bassSynth = null;
    this.chordSynth = null;
    this.vibratoEffect = null;
    this.filter = null;
    this.delay = null;
    this.chorus = null;
    this.reverb = null;
    this.masterGain = null;
    this.dynamicsRange = [0, 1];
    this.portamentoTime = 0;

    this.isInitialized = false;

    if (this.config.debug) {
      console.log('[SoundEngine] Disposed');
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let soundEngineInstance: SoundEngine | null = null;

export function getSoundEngine(): SoundEngine {
  if (!soundEngineInstance) {
    soundEngineInstance = new SoundEngine();
  }
  return soundEngineInstance;
}

export function resetSoundEngine(): void {
  soundEngineInstance?.dispose();
  soundEngineInstance = null;
}
