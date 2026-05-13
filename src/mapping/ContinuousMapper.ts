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
  /**
   * Calibrated Y envelope (movementRange.minY/maxY).  When set, raw
   * frame Y is remapped into this envelope's range before being
   * converted to pitch — so the full pitch range is reachable within
   * the user's actual playing zone, not the full frame.  When null,
   * raw 0–1 frame coords are used.
   */
  yRange?: { min: number; max: number } | null;
}

const DEFAULT_CONFIG: Required<ContinuousMapperConfig> = {
  noteRange: { min: 48, max: 72 }, // C3 to C5
  volumeRange: { min: 0.3, max: 1.0 },
  invertY: true, // Moving up = higher pitch
  smoothing: 0.3,
  yRange: null,
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

    // Remap raw Y → envelope-relative Y before inversion, so 0..1 means
    // "bottom..top of user's reachable range" not "bottom..top of frame".
    const envelopeY = this.applyEnvelope(movement.position.y);
    const yValue = this.config.invertY ? 1 - envelopeY : envelopeY;
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
    const envelopeY = this.applyEnvelope(yPosition);
    const yValue = this.config.invertY ? 1 - envelopeY : envelopeY;
    const midi = normalizeRange(
      yValue,
      0,
      1,
      this.config.noteRange.min,
      this.config.noteRange.max
    );
    return midiToFrequency(clamp(midi, 21, 108));
  }

  /** Remap a raw 0–1 Y value into the calibrated envelope. */
  private applyEnvelope(rawY: number): number {
    const range = this.config.yRange;
    if (!range) return rawY;
    const span = range.max - range.min;
    if (span <= 0) return rawY;
    return clamp((rawY - range.min) / span, 0, 1);
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
