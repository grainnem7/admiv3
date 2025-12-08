/**
 * Voice Manager - Polyphonic voice allocation
 *
 * Manages a pool of Voice instances for polyphonic playback.
 * Implements voice stealing when all voices are in use.
 */

import { Voice, type VoiceConfig, DEFAULT_VOICE_CONFIG } from './Voice';

export interface VoiceManagerConfig {
  /** Maximum number of voices (polyphony) */
  maxVoices: number;
  /** Voice configuration */
  voiceConfig: VoiceConfig;
  /** Voice stealing mode */
  stealMode: 'oldest' | 'quietest' | 'none';
}

const DEFAULT_MANAGER_CONFIG: VoiceManagerConfig = {
  maxVoices: 8,
  voiceConfig: DEFAULT_VOICE_CONFIG,
  stealMode: 'oldest',
};

interface VoiceAllocation {
  voice: Voice;
  noteId: string;
  startTime: number;
}

export class VoiceManager {
  private context: AudioContext;
  private outputNode: GainNode;
  private config: VoiceManagerConfig;
  private voices: Voice[] = [];
  private allocations: Map<string, VoiceAllocation> = new Map();
  private allocationOrder: string[] = [];

  constructor(
    context: AudioContext,
    outputNode: GainNode,
    config: Partial<VoiceManagerConfig> = {}
  ) {
    this.context = context;
    this.outputNode = outputNode;
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };

    // Create voice pool
    this.createVoicePool();
  }

  /**
   * Create the voice pool
   */
  private createVoicePool(): void {
    for (let i = 0; i < this.config.maxVoices; i++) {
      const voice = new Voice(this.context, this.outputNode, this.config.voiceConfig);
      this.voices.push(voice);
    }
  }

  /**
   * Trigger a note on
   */
  noteOn(noteId: string, frequency: number, velocity: number = 1): Voice | null {
    // Check if this note is already playing
    const existing = this.allocations.get(noteId);
    if (existing) {
      // Update existing voice
      existing.voice.setFrequency(frequency);
      existing.voice.setVelocity(velocity);
      return existing.voice;
    }

    // Find an available voice
    let voice = this.findAvailableVoice();

    // If no available voice, try to steal one
    if (!voice) {
      voice = this.stealVoice();
    }

    if (!voice) {
      console.warn('VoiceManager: No voice available and stealing disabled');
      return null;
    }

    // Allocate the voice
    voice.noteOn(noteId, frequency, velocity);
    this.allocations.set(noteId, {
      voice,
      noteId,
      startTime: Date.now(),
    });
    this.allocationOrder.push(noteId);

    return voice;
  }

  /**
   * Trigger a note off
   */
  noteOff(noteId: string): void {
    const allocation = this.allocations.get(noteId);
    if (!allocation) return;

    allocation.voice.noteOff();

    // Remove from allocations after release
    const releaseTime = this.config.voiceConfig.release * 1000 + 100;
    setTimeout(() => {
      if (this.allocations.get(noteId) === allocation) {
        this.allocations.delete(noteId);
        const orderIndex = this.allocationOrder.indexOf(noteId);
        if (orderIndex !== -1) {
          this.allocationOrder.splice(orderIndex, 1);
        }
      }
    }, releaseTime);
  }

  /**
   * Update pitch of an active note
   */
  setPitch(noteId: string, frequency: number, glideTime?: number): void {
    const allocation = this.allocations.get(noteId);
    if (allocation) {
      allocation.voice.setFrequency(frequency, glideTime);
    }
  }

  /**
   * Update velocity of an active note
   */
  setVelocity(noteId: string, velocity: number, glideTime?: number): void {
    const allocation = this.allocations.get(noteId);
    if (allocation) {
      allocation.voice.setVelocity(velocity, glideTime);
    }
  }

  /**
   * Update filter cutoff for all active voices
   */
  setFilterCutoff(cutoff: number, glideTime?: number): void {
    for (const allocation of this.allocations.values()) {
      allocation.voice.setFilterCutoff(cutoff, glideTime);
    }
  }

  /**
   * Update filter resonance for all active voices
   */
  setFilterResonance(q: number): void {
    for (const allocation of this.allocations.values()) {
      allocation.voice.setFilterResonance(q);
    }
  }

  /**
   * Play a chord (multiple simultaneous notes)
   */
  playChord(chordId: string, frequencies: number[], velocity: number = 1): Voice[] {
    const voices: Voice[] = [];

    frequencies.forEach((freq, index) => {
      const noteId = `${chordId}-${index}`;
      const voice = this.noteOn(noteId, freq, velocity);
      if (voice) {
        voices.push(voice);
      }
    });

    return voices;
  }

  /**
   * Stop a chord
   */
  stopChord(chordId: string): void {
    // Find all notes belonging to this chord
    const chordNoteIds = Array.from(this.allocations.keys()).filter((noteId) =>
      noteId.startsWith(`${chordId}-`)
    );

    for (const noteId of chordNoteIds) {
      this.noteOff(noteId);
    }
  }

  /**
   * Stop all notes
   */
  allNotesOff(): void {
    for (const noteId of this.allocations.keys()) {
      const allocation = this.allocations.get(noteId);
      if (allocation) {
        allocation.voice.forceStop();
      }
    }
    this.allocations.clear();
    this.allocationOrder = [];
  }

  /**
   * Find an available (idle) voice
   */
  private findAvailableVoice(): Voice | null {
    return this.voices.find((v) => v.isAvailable) ?? null;
  }

  /**
   * Steal a voice based on steal mode
   */
  private stealVoice(): Voice | null {
    if (this.config.stealMode === 'none') {
      return null;
    }

    let targetNoteId: string | null = null;

    switch (this.config.stealMode) {
      case 'oldest':
        // Steal the oldest playing voice
        targetNoteId = this.allocationOrder[0] ?? null;
        break;

      case 'quietest':
        // Steal the voice with lowest velocity
        let minVelocity = Infinity;
        for (const [noteId, allocation] of this.allocations) {
          const config = allocation.voice.getConfig();
          if (config.sustain < minVelocity) {
            minVelocity = config.sustain;
            targetNoteId = noteId;
          }
        }
        break;
    }

    if (targetNoteId) {
      const allocation = this.allocations.get(targetNoteId);
      if (allocation) {
        allocation.voice.forceStop();
        this.allocations.delete(targetNoteId);
        const orderIndex = this.allocationOrder.indexOf(targetNoteId);
        if (orderIndex !== -1) {
          this.allocationOrder.splice(orderIndex, 1);
        }
        return allocation.voice;
      }
    }

    return null;
  }

  /**
   * Get count of active voices
   */
  getActiveVoiceCount(): number {
    return this.allocations.size;
  }

  /**
   * Get maximum voices
   */
  getMaxVoices(): number {
    return this.config.maxVoices;
  }

  /**
   * Update voice configuration for all voices
   */
  setVoiceConfig(config: Partial<VoiceConfig>): void {
    this.config.voiceConfig = { ...this.config.voiceConfig, ...config };

    // Update all voices
    for (const voice of this.voices) {
      voice.setConfig(config);
    }
  }

  /**
   * Update manager configuration
   */
  setConfig(config: Partial<VoiceManagerConfig>): void {
    const oldMaxVoices = this.config.maxVoices;
    this.config = { ...this.config, ...config };

    // Resize voice pool if needed
    if (config.maxVoices && config.maxVoices !== oldMaxVoices) {
      this.resizeVoicePool(config.maxVoices);
    }

    // Update voice configs
    if (config.voiceConfig) {
      this.setVoiceConfig(config.voiceConfig);
    }
  }

  /**
   * Resize the voice pool
   */
  private resizeVoicePool(newSize: number): void {
    if (newSize > this.voices.length) {
      // Add new voices
      for (let i = this.voices.length; i < newSize; i++) {
        const voice = new Voice(this.context, this.outputNode, this.config.voiceConfig);
        this.voices.push(voice);
      }
    } else if (newSize < this.voices.length) {
      // Remove excess voices (force stop if active)
      while (this.voices.length > newSize) {
        const voice = this.voices.pop();
        if (voice) {
          voice.forceStop();
          voice.dispose();
        }
      }
    }
  }

  /**
   * Get voice by note ID
   */
  getVoice(noteId: string): Voice | null {
    return this.allocations.get(noteId)?.voice ?? null;
  }

  /**
   * Check if a note is currently playing
   */
  isNotePlaying(noteId: string): boolean {
    return this.allocations.has(noteId);
  }

  /**
   * Get all active note IDs
   */
  getActiveNoteIds(): string[] {
    return Array.from(this.allocations.keys());
  }

  /**
   * Dispose of the manager and all voices
   */
  dispose(): void {
    this.allNotesOff();
    for (const voice of this.voices) {
      voice.dispose();
    }
    this.voices = [];
    this.allocations.clear();
    this.allocationOrder = [];
  }
}
