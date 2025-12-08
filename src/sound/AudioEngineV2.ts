/**
 * Audio Engine V2 - Enhanced audio engine with polyphony and filter support
 *
 * Uses VoiceManager for polyphonic playback and integrates with
 * the new MappingResult interface for seamless sound generation.
 */

import { AUDIO } from '../utils/constants';
import { clamp } from '../utils/math';
import { VoiceManager } from './VoiceManager';
import { DEFAULT_VOICE_CONFIG, type VoiceConfig } from './Voice';
import type { MappingResult, SoundPreset } from '../state/types';

export interface AudioEngineV2Config {
  /** Master volume (0-1) */
  masterVolume: number;
  /** Maximum polyphony */
  maxVoices: number;
  /** Voice configuration */
  voiceConfig: VoiceConfig;
  /** Enable global filter */
  filterEnabled: boolean;
  /** Voice stealing mode */
  stealMode: 'oldest' | 'quietest' | 'none';
}

const DEFAULT_CONFIG: AudioEngineV2Config = {
  masterVolume: AUDIO.DEFAULT_VOLUME,
  maxVoices: 8,
  voiceConfig: DEFAULT_VOICE_CONFIG,
  filterEnabled: false,
  stealMode: 'oldest',
};

export class AudioEngineV2 {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private globalFilter: BiquadFilterNode | null = null;
  private voiceManager: VoiceManager | null = null;
  private config: AudioEngineV2Config;
  private isMuted: boolean = true;
  private isInitialized: boolean = false;

  // Continuous control state
  private currentPrimaryNoteId: string | null = null;
  private lastMappingResult: MappingResult | null = null;

  constructor(config: Partial<AudioEngineV2Config> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the audio engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Create audio context
    this.context = new AudioContext();

    // Create master gain node
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : this.config.masterVolume;

    // Create global filter (optional)
    if (this.config.filterEnabled) {
      this.globalFilter = this.context.createBiquadFilter();
      this.globalFilter.type = 'lowpass';
      this.globalFilter.frequency.value = 20000;
      this.globalFilter.Q.value = 1;
      this.globalFilter.connect(this.context.destination);
      this.masterGain.connect(this.globalFilter);
    } else {
      this.masterGain.connect(this.context.destination);
    }

    // Create voice manager
    this.voiceManager = new VoiceManager(this.context, this.masterGain, {
      maxVoices: this.config.maxVoices,
      voiceConfig: this.config.voiceConfig,
      stealMode: this.config.stealMode,
    });

    this.isInitialized = true;

    // Handle browser autoplay policy
    if (this.context.state === 'suspended') {
      console.log('AudioContext suspended - waiting for user interaction');
    }
  }

  /**
   * Resume audio context (call after user interaction)
   */
  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }

  /**
   * Process a MappingResult and generate sound
   */
  processMappingResult(result: MappingResult): void {
    if (!this.isInitialized || this.isMuted || !this.voiceManager) return;

    const hasVolume = result.volume !== undefined && result.volume > 0.01;
    const hasPitch = result.pitch !== undefined;

    // Handle continuous note (theremin-style)
    if (hasPitch && hasVolume) {
      if (!this.currentPrimaryNoteId) {
        // Start new continuous note
        this.currentPrimaryNoteId = 'continuous-primary';
        this.voiceManager.noteOn(
          this.currentPrimaryNoteId,
          result.pitch!,
          result.volume!
        );
      } else {
        // Update existing continuous note
        this.voiceManager.setPitch(this.currentPrimaryNoteId, result.pitch!);
        this.voiceManager.setVelocity(this.currentPrimaryNoteId, result.volume!);
      }
    } else if (this.currentPrimaryNoteId && !hasVolume) {
      // Stop continuous note when volume drops
      this.voiceManager.noteOff(this.currentPrimaryNoteId);
      this.currentPrimaryNoteId = null;
    }

    // Handle chord playback
    if (result.chord && result.chord.length > 0 && hasVolume) {
      // Convert MIDI notes to frequencies if needed
      const frequencies = result.chord.map((note) => {
        if (note < 128) {
          // MIDI note - convert to frequency
          return 440 * Math.pow(2, (note - 69) / 12);
        }
        return note; // Already a frequency
      });

      // Check if chord changed
      const chordKey = frequencies.join('-');
      const lastChordKey = this.lastMappingResult?.chord?.join('-');

      if (chordKey !== lastChordKey) {
        // Stop old chord
        this.voiceManager.stopChord('chord');
        // Play new chord
        this.voiceManager.playChord('chord', frequencies, result.volume ?? 0.7);
      }
    }

    // Handle triggered events
    for (const triggerId of result.triggers) {
      this.handleTrigger(triggerId);
    }

    // Handle filter cutoff
    if (result.filterCutoff !== undefined && this.config.filterEnabled) {
      this.setFilterCutoff(result.filterCutoff);
    }

    // Handle modulation
    for (const [param, value] of result.modulation) {
      this.handleModulation(param, value);
    }

    this.lastMappingResult = result;
  }

  /**
   * Handle a trigger event
   */
  private handleTrigger(triggerId: string): void {
    // Triggers can be used for various purposes
    // For now, log them - specific implementations can be added
    console.log('Trigger:', triggerId);

    // Example: Play a percussion hit for certain triggers
    if (triggerId.includes('hit') || triggerId.includes('tap')) {
      this.playPercussion(triggerId);
    }
  }

  /**
   * Handle a modulation parameter
   */
  private handleModulation(param: string, value: number): void {
    switch (param) {
      case 'filterCutoff':
        this.setFilterCutoff(value);
        break;
      case 'filterResonance':
        this.setFilterResonance(value);
        break;
      case 'volume':
        this.setMasterVolume(value);
        break;
      // Add more modulation targets as needed
    }
  }

  /**
   * Play a percussion sound
   */
  private playPercussion(id: string): void {
    if (!this.voiceManager) return;

    // Quick attack/release percussion
    const voice = this.voiceManager.noteOn(`perc-${id}-${Date.now()}`, 200, 0.8);
    if (voice) {
      setTimeout(() => {
        voice.noteOff();
      }, 100);
    }
  }

  /**
   * Play a note directly
   */
  noteOn(noteId: string, frequency: number, velocity: number = 1): void {
    if (!this.isInitialized || this.isMuted || !this.voiceManager) return;
    this.voiceManager.noteOn(noteId, frequency, velocity);
  }

  /**
   * Stop a note directly
   */
  noteOff(noteId: string): void {
    if (!this.voiceManager) return;
    this.voiceManager.noteOff(noteId);
  }

  /**
   * Play a chord directly
   */
  playChord(chordId: string, frequencies: number[], velocity: number = 1): void {
    if (!this.isInitialized || this.isMuted || !this.voiceManager) return;
    this.voiceManager.playChord(chordId, frequencies, velocity);
  }

  /**
   * Stop a chord directly
   */
  stopChord(chordId: string): void {
    if (!this.voiceManager) return;
    this.voiceManager.stopChord(chordId);
  }

  /**
   * Set muted state
   */
  setMuted(muted: boolean): void {
    this.isMuted = muted;

    if (this.masterGain && this.context) {
      const targetGain = muted ? 0 : this.config.masterVolume;
      this.masterGain.gain.linearRampToValueAtTime(
        targetGain,
        this.context.currentTime + 0.05
      );

      if (muted) {
        this.stopAllVoices();
      }
    }
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this.config.masterVolume = clamp(volume, 0, AUDIO.MAX_SAFE_VOLUME);

    if (this.masterGain && this.context && !this.isMuted) {
      this.masterGain.gain.linearRampToValueAtTime(
        this.config.masterVolume,
        this.context.currentTime + 0.05
      );
    }
  }

  /**
   * Set filter cutoff
   */
  setFilterCutoff(cutoff: number): void {
    if (this.globalFilter && this.context) {
      const clampedCutoff = clamp(cutoff, 20, 20000);
      this.globalFilter.frequency.linearRampToValueAtTime(
        clampedCutoff,
        this.context.currentTime + 0.05
      );
    }

    // Also update voice filters
    if (this.voiceManager) {
      this.voiceManager.setFilterCutoff(cutoff);
    }
  }

  /**
   * Set filter resonance
   */
  setFilterResonance(q: number): void {
    if (this.globalFilter) {
      this.globalFilter.Q.value = clamp(q, 0.1, 30);
    }

    if (this.voiceManager) {
      this.voiceManager.setFilterResonance(q);
    }
  }

  /**
   * Apply a sound preset
   */
  applyPreset(preset: SoundPreset): void {
    const voiceConfig: Partial<VoiceConfig> = {
      oscillatorType: preset.oscillatorType,
      attack: preset.attack,
      decay: preset.decay,
      sustain: preset.sustain,
      release: preset.release,
    };

    if (this.voiceManager) {
      this.voiceManager.setVoiceConfig(voiceConfig);
    }

    this.config.voiceConfig = { ...this.config.voiceConfig, ...voiceConfig };
  }

  /**
   * Set oscillator type for all voices
   */
  setOscillatorType(type: OscillatorType): void {
    if (this.voiceManager) {
      this.voiceManager.setVoiceConfig({ oscillatorType: type });
    }
    this.config.voiceConfig.oscillatorType = type;
  }

  /**
   * Enable/disable filter for voices
   */
  setVoiceFilterEnabled(enabled: boolean): void {
    if (this.voiceManager) {
      this.voiceManager.setVoiceConfig({ filterEnabled: enabled });
    }
    this.config.voiceConfig.filterEnabled = enabled;
  }

  /**
   * Set maximum polyphony
   */
  setMaxVoices(max: number): void {
    this.config.maxVoices = clamp(max, 1, 32);
    if (this.voiceManager) {
      this.voiceManager.setConfig({ maxVoices: this.config.maxVoices });
    }
  }

  /**
   * Stop all active voices
   */
  stopAllVoices(): void {
    if (this.voiceManager) {
      this.voiceManager.allNotesOff();
    }
    this.currentPrimaryNoteId = null;
  }

  /**
   * Get number of active voices
   */
  getActiveVoiceCount(): number {
    return this.voiceManager?.getActiveVoiceCount() ?? 0;
  }

  /**
   * Get maximum voices
   */
  getMaxVoices(): number {
    return this.config.maxVoices;
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.context !== null && this.context.state === 'running';
  }

  /**
   * Get audio context state
   */
  getState(): AudioContextState | 'uninitialized' {
    return this.context?.state ?? 'uninitialized';
  }

  /**
   * Get muted state
   */
  getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioEngineV2Config {
    return { ...this.config };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopAllVoices();

    if (this.voiceManager) {
      this.voiceManager.dispose();
      this.voiceManager = null;
    }

    if (this.globalFilter) {
      this.globalFilter.disconnect();
      this.globalFilter = null;
    }

    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
    }

    if (this.context) {
      this.context.close();
      this.context = null;
    }

    this.isInitialized = false;
  }
}

// Singleton instance
let audioEngineV2Instance: AudioEngineV2 | null = null;

export function getAudioEngineV2(): AudioEngineV2 {
  if (!audioEngineV2Instance) {
    audioEngineV2Instance = new AudioEngineV2();
  }
  return audioEngineV2Instance;
}
