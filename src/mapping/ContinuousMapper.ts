/**
 * Continuous Mapper - Maps continuous movement to continuous musical parameters
 */

import { normalizeRange, clamp, midiToFrequency } from '../utils/math';
import type { ProcessedMovement } from '../state/types';
import { musicEvents } from './MusicEventEmitter';

export interface ContinuousMapperConfig {
  /** MIDI note range for pitch mapping */
  noteRange?: { min: number; max: number };
  /** Volume range */
  volumeRange?: { min: number; max: number };
  /** Whether Y axis is inverted (up = higher pitch) */
  invertY?: boolean;
  /** Smoothing factor for output values */
  smoothing?: number;
}

const DEFAULT_CONFIG: Required<ContinuousMapperConfig> = {
  noteRange: { min: 48, max: 72 }, // C3 to C5
  volumeRange: { min: 0.3, max: 1.0 },
  invertY: true, // Moving up = higher pitch
  smoothing: 0.3,
};

export class ContinuousMapper {
  private config: Required<ContinuousMapperConfig>;
  private activeNoteId: string | null = null;
  private lastFrequency: number = 0;
  private lastVolume: number = 0;
  private isPlaying: boolean = false;

  constructor(config: ContinuousMapperConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Map movement to pitch and volume, emitting appropriate events
   */
  map(movement: ProcessedMovement, isMuted: boolean = false): void {
    if (isMuted) {
      this.stopNote();
      return;
    }

    // Calculate target frequency from Y position
    const yValue = this.config.invertY ? 1 - movement.position.y : movement.position.y;
    const targetMidi = normalizeRange(
      yValue,
      0,
      1,
      this.config.noteRange.min,
      this.config.noteRange.max
    );
    const targetFrequency = midiToFrequency(clamp(targetMidi, 21, 108));

    // Calculate target volume from velocity magnitude
    const targetVolume = normalizeRange(
      Math.min(movement.velocity.magnitude * 10, 1),
      0,
      1,
      this.config.volumeRange.min,
      this.config.volumeRange.max
    );

    // Apply smoothing
    const frequency = this.smooth(this.lastFrequency, targetFrequency);
    const volume = this.smooth(this.lastVolume, targetVolume);

    this.lastFrequency = frequency;
    this.lastVolume = volume;

    if (movement.isActive) {
      if (!this.isPlaying) {
        // Start new note
        this.activeNoteId = musicEvents.noteOn(frequency, volume);
        this.isPlaying = true;
      } else if (this.activeNoteId) {
        // Update existing note
        musicEvents.pitchChange(this.activeNoteId, frequency);
        musicEvents.volumeChange(volume, this.activeNoteId);
      }
    } else {
      this.stopNote();
    }
  }

  /**
   * Get current frequency without emitting events
   */
  getFrequency(yPosition: number): number {
    const yValue = this.config.invertY ? 1 - yPosition : yPosition;
    const midi = normalizeRange(
      yValue,
      0,
      1,
      this.config.noteRange.min,
      this.config.noteRange.max
    );
    return midiToFrequency(clamp(midi, 21, 108));
  }

  /**
   * Get current volume without emitting events
   */
  getVolume(velocityMagnitude: number): number {
    return normalizeRange(
      Math.min(velocityMagnitude * 10, 1),
      0,
      1,
      this.config.volumeRange.min,
      this.config.volumeRange.max
    );
  }

  /**
   * Stop current note
   */
  stopNote(): void {
    if (this.activeNoteId) {
      musicEvents.noteOff(this.activeNoteId);
      this.activeNoteId = null;
      this.isPlaying = false;
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ContinuousMapperConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set note range
   */
  setNoteRange(min: number, max: number): void {
    this.config.noteRange = {
      min: clamp(min, 21, 108),
      max: clamp(max, 21, 108),
    };
  }

  /**
   * Reset mapper state
   */
  reset(): void {
    this.stopNote();
    this.lastFrequency = 0;
    this.lastVolume = 0;
  }

  /**
   * Apply smoothing between values
   */
  private smooth(current: number, target: number): number {
    if (current === 0) return target;
    return current + (target - current) * this.config.smoothing;
  }

  /**
   * Check if currently producing sound
   */
  isActive(): boolean {
    return this.isPlaying;
  }
}
