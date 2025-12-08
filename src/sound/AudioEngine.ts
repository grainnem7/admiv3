/**
 * Audio Engine - Core Web Audio API wrapper
 */

import { AUDIO } from '../utils/constants';
import { clamp } from '../utils/math';
import { musicEvents, type MusicEvent } from '../mapping/MusicEventEmitter';

export interface AudioEngineConfig {
  /** Master volume (0-1) */
  masterVolume?: number;
  /** Attack time in seconds */
  attack?: number;
  /** Release time in seconds */
  release?: number;
}

const DEFAULT_CONFIG: Required<AudioEngineConfig> = {
  masterVolume: AUDIO.DEFAULT_VOLUME,
  attack: AUDIO.DEFAULT_ATTACK,
  release: AUDIO.DEFAULT_RELEASE,
};

interface ActiveVoice {
  oscillator: OscillatorNode;
  gainNode: GainNode;
  frequency: number;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private config: Required<AudioEngineConfig>;
  private voices: Map<string, ActiveVoice> = new Map();
  private isMuted: boolean = true;
  private eventUnsubscribe: (() => void) | null = null;
  private oscillatorType: OscillatorType = 'sine';

  constructor(config: AudioEngineConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the audio engine
   */
  async initialize(): Promise<void> {
    // Create audio context
    this.context = new AudioContext();

    // Create master gain node
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.isMuted ? 0 : this.config.masterVolume;
    this.masterGain.connect(this.context.destination);

    // Subscribe to music events
    this.eventUnsubscribe = musicEvents.onAny((event) => this.handleMusicEvent(event));

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

      // If muting, stop all voices
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
   * Set oscillator type
   */
  setOscillatorType(type: OscillatorType): void {
    this.oscillatorType = type;
  }

  /**
   * Handle music events
   */
  private handleMusicEvent(event: MusicEvent): void {
    if (this.isMuted || !this.context || !this.masterGain) return;

    switch (event.type) {
      case 'noteOn':
        this.startVoice(event.noteId, event.frequency, event.velocity);
        break;

      case 'noteOff':
        this.stopVoice(event.noteId);
        break;

      case 'pitchChange':
        this.updatePitch(event.noteId, event.frequency);
        break;

      case 'volumeChange':
        if (event.noteId) {
          this.updateVoiceVolume(event.noteId, event.volume);
        } else {
          this.setMasterVolume(event.volume);
        }
        break;
    }
  }

  /**
   * Start a new voice
   */
  private startVoice(noteId: string, frequency: number, velocity: number): void {
    if (!this.context || !this.masterGain) return;

    // Stop existing voice with same ID
    this.stopVoice(noteId);

    // Create oscillator
    const oscillator = this.context.createOscillator();
    oscillator.type = this.oscillatorType;
    oscillator.frequency.value = frequency;

    // Create gain node for this voice
    const gainNode = this.context.createGain();
    gainNode.gain.value = 0;

    // Connect: oscillator -> voice gain -> master gain -> destination
    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    // Start oscillator
    oscillator.start();

    // Apply attack envelope
    gainNode.gain.linearRampToValueAtTime(
      velocity,
      this.context.currentTime + this.config.attack
    );

    // Store voice
    this.voices.set(noteId, { oscillator, gainNode, frequency });
  }

  /**
   * Stop a voice
   */
  private stopVoice(noteId: string): void {
    const voice = this.voices.get(noteId);
    if (!voice || !this.context) return;

    const { oscillator, gainNode } = voice;

    // Apply release envelope
    gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + this.config.release);

    // Stop and disconnect after release
    setTimeout(() => {
      try {
        oscillator.stop();
        oscillator.disconnect();
        gainNode.disconnect();
      } catch {
        // Ignore errors from already stopped oscillators
      }
    }, this.config.release * 1000 + 50);

    this.voices.delete(noteId);
  }

  /**
   * Update pitch of existing voice
   */
  private updatePitch(noteId: string, frequency: number): void {
    const voice = this.voices.get(noteId);
    if (!voice || !this.context) return;

    // Smooth pitch transition
    voice.oscillator.frequency.linearRampToValueAtTime(
      frequency,
      this.context.currentTime + 0.05
    );
    voice.frequency = frequency;
  }

  /**
   * Update volume of existing voice
   */
  private updateVoiceVolume(noteId: string, volume: number): void {
    const voice = this.voices.get(noteId);
    if (!voice || !this.context) return;

    voice.gainNode.gain.linearRampToValueAtTime(
      clamp(volume, 0, 1),
      this.context.currentTime + 0.05
    );
  }

  /**
   * Stop all active voices
   */
  stopAllVoices(): void {
    this.voices.forEach((_, noteId) => this.stopVoice(noteId));
  }

  /**
   * Get number of active voices
   */
  getActiveVoiceCount(): number {
    return this.voices.size;
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  /**
   * Get audio context state
   */
  getState(): AudioContextState | 'uninitialized' {
    return this.context?.state ?? 'uninitialized';
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopAllVoices();

    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = null;
    }

    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
    }

    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
}

// Singleton instance
let audioEngineInstance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!audioEngineInstance) {
    audioEngineInstance = new AudioEngine();
  }
  return audioEngineInstance;
}
