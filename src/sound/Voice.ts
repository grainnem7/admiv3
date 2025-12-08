/**
 * Voice - A single synthesizer voice
 *
 * Represents one sound-producing unit with oscillator, filter, and envelope.
 * Voices can be allocated by VoiceManager for polyphonic playback.
 */

import { clamp } from '../utils/math';

export interface VoiceConfig {
  /** Oscillator type */
  oscillatorType: OscillatorType;
  /** Attack time in seconds */
  attack: number;
  /** Decay time in seconds */
  decay: number;
  /** Sustain level (0-1) */
  sustain: number;
  /** Release time in seconds */
  release: number;
  /** Enable filter */
  filterEnabled: boolean;
  /** Filter type */
  filterType: BiquadFilterType;
  /** Base filter cutoff in Hz */
  filterCutoff: number;
  /** Filter resonance (Q) */
  filterResonance: number;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  oscillatorType: 'sine',
  attack: 0.1,
  decay: 0.2,
  sustain: 0.7,
  release: 0.5,
  filterEnabled: false,
  filterType: 'lowpass',
  filterCutoff: 2000,
  filterResonance: 1,
};

export type VoiceState = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

export class Voice {
  private context: AudioContext;
  private outputNode: GainNode;
  private config: VoiceConfig;

  // Audio nodes
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;

  // State
  private _state: VoiceState = 'idle';
  private _noteId: string | null = null;
  private _frequency: number = 440;
  private _velocity: number = 1;
  private releaseTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(context: AudioContext, outputNode: GainNode, config: Partial<VoiceConfig> = {}) {
    this.context = context;
    this.outputNode = outputNode;
    this.config = { ...DEFAULT_VOICE_CONFIG, ...config };
  }

  /**
   * Get voice state
   */
  get state(): VoiceState {
    return this._state;
  }

  /**
   * Get current note ID
   */
  get noteId(): string | null {
    return this._noteId;
  }

  /**
   * Get current frequency
   */
  get frequency(): number {
    return this._frequency;
  }

  /**
   * Check if voice is available for allocation
   */
  get isAvailable(): boolean {
    return this._state === 'idle';
  }

  /**
   * Check if voice is currently active (producing sound)
   */
  get isActive(): boolean {
    return this._state !== 'idle';
  }

  /**
   * Start the voice (note on)
   */
  noteOn(noteId: string, frequency: number, velocity: number = 1): void {
    // Clear any pending release
    if (this.releaseTimeout) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = null;
    }

    // Stop existing sound
    this.cleanup();

    this._noteId = noteId;
    this._frequency = frequency;
    this._velocity = clamp(velocity, 0, 1);

    // Create oscillator
    this.oscillator = this.context.createOscillator();
    this.oscillator.type = this.config.oscillatorType;
    this.oscillator.frequency.value = frequency;

    // Create gain node for envelope
    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = 0;

    // Create filter if enabled
    if (this.config.filterEnabled) {
      this.filter = this.context.createBiquadFilter();
      this.filter.type = this.config.filterType;
      this.filter.frequency.value = this.config.filterCutoff;
      this.filter.Q.value = this.config.filterResonance;

      // Connect: oscillator -> filter -> gain -> output
      this.oscillator.connect(this.filter);
      this.filter.connect(this.gainNode);
    } else {
      // Connect: oscillator -> gain -> output
      this.oscillator.connect(this.gainNode);
    }

    this.gainNode.connect(this.outputNode);

    // Start oscillator
    this.oscillator.start();

    // Apply ADSR envelope - Attack phase
    this._state = 'attack';
    const now = this.context.currentTime;
    const attackEnd = now + this.config.attack;
    const decayEnd = attackEnd + this.config.decay;
    const peakLevel = this._velocity;
    const sustainLevel = peakLevel * this.config.sustain;

    // Attack: 0 -> peak
    this.gainNode.gain.setValueAtTime(0, now);
    this.gainNode.gain.linearRampToValueAtTime(peakLevel, attackEnd);

    // Decay: peak -> sustain
    this.gainNode.gain.linearRampToValueAtTime(sustainLevel, decayEnd);

    // Schedule state transitions
    setTimeout(() => {
      if (this._state === 'attack') {
        this._state = 'decay';
      }
    }, this.config.attack * 1000);

    setTimeout(() => {
      if (this._state === 'decay') {
        this._state = 'sustain';
      }
    }, (this.config.attack + this.config.decay) * 1000);
  }

  /**
   * Stop the voice (note off)
   */
  noteOff(): void {
    if (!this.gainNode || this._state === 'idle' || this._state === 'release') {
      return;
    }

    this._state = 'release';
    const now = this.context.currentTime;
    const releaseEnd = now + this.config.release;

    // Cancel any scheduled automation
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);

    // Release: current -> 0
    this.gainNode.gain.linearRampToValueAtTime(0, releaseEnd);

    // Schedule cleanup after release
    this.releaseTimeout = setTimeout(() => {
      this.cleanup();
      this._state = 'idle';
      this._noteId = null;
    }, this.config.release * 1000 + 50);
  }

  /**
   * Update frequency (pitch bend / continuous pitch)
   */
  setFrequency(frequency: number, glideTime: number = 0.05): void {
    this._frequency = frequency;

    if (this.oscillator) {
      const now = this.context.currentTime;
      this.oscillator.frequency.linearRampToValueAtTime(frequency, now + glideTime);
    }
  }

  /**
   * Update filter cutoff
   */
  setFilterCutoff(cutoff: number, glideTime: number = 0.05): void {
    if (this.filter) {
      const now = this.context.currentTime;
      const clampedCutoff = clamp(cutoff, 20, 20000);
      this.filter.frequency.linearRampToValueAtTime(clampedCutoff, now + glideTime);
    }
  }

  /**
   * Update filter resonance
   */
  setFilterResonance(q: number): void {
    if (this.filter) {
      this.filter.Q.value = clamp(q, 0.1, 30);
    }
  }

  /**
   * Update velocity/volume
   */
  setVelocity(velocity: number, glideTime: number = 0.05): void {
    this._velocity = clamp(velocity, 0, 1);

    if (this.gainNode && this._state === 'sustain') {
      const now = this.context.currentTime;
      const sustainLevel = this._velocity * this.config.sustain;
      this.gainNode.gain.linearRampToValueAtTime(sustainLevel, now + glideTime);
    }
  }

  /**
   * Update voice configuration
   */
  setConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config };

    // Update oscillator type if active
    if (this.oscillator && config.oscillatorType) {
      this.oscillator.type = config.oscillatorType;
    }

    // Update filter parameters if active
    if (this.filter) {
      if (config.filterType) {
        this.filter.type = config.filterType;
      }
      if (config.filterCutoff !== undefined) {
        this.filter.frequency.value = config.filterCutoff;
      }
      if (config.filterResonance !== undefined) {
        this.filter.Q.value = config.filterResonance;
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): VoiceConfig {
    return { ...this.config };
  }

  /**
   * Force stop and cleanup (for voice stealing)
   */
  forceStop(): void {
    if (this.releaseTimeout) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = null;
    }

    this.cleanup();
    this._state = 'idle';
    this._noteId = null;
  }

  /**
   * Clean up audio nodes
   */
  private cleanup(): void {
    try {
      if (this.oscillator) {
        this.oscillator.stop();
        this.oscillator.disconnect();
        this.oscillator = null;
      }

      if (this.filter) {
        this.filter.disconnect();
        this.filter = null;
      }

      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
    } catch {
      // Ignore errors from already stopped/disconnected nodes
    }
  }

  /**
   * Dispose of the voice
   */
  dispose(): void {
    if (this.releaseTimeout) {
      clearTimeout(this.releaseTimeout);
      this.releaseTimeout = null;
    }
    this.cleanup();
  }
}
