/**
 * Pitch Mapping Node
 *
 * Maps input values to MIDI pitch values.
 * Supports continuous pitch (theremin-style) or quantized to scale.
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame } from '../../state/types';
import { midiToFrequency } from '../../utils/math';
import { createControlChangeEvent, type MusicalEvent } from '../events';

export interface PitchMappingConfig extends MappingNodeConfig {
  /** Minimum MIDI note */
  midiMin: number;
  /** Maximum MIDI note */
  midiMax: number;
  /** Quantize to scale (null for continuous) */
  scale: number[] | null;
  /** Root note for scale quantization */
  rootNote: number;
  /** Glide/portamento time in ms */
  glideTime: number;
  /**
   * Whether to emit ControlChangeEvents.
   * @default true
   */
  emitEvents: boolean;
  /**
   * Minimum change threshold to emit an event (0-1).
   * Prevents flooding with events when value barely changes.
   * @default 0.01
   */
  eventThreshold: number;
}

const DEFAULT_CONFIG: Omit<PitchMappingConfig, 'id' | 'name' | 'inputs'> = {
  enabled: true,
  midiMin: 48, // C3
  midiMax: 72, // C5
  scale: null, // Continuous by default
  rootNote: 60, // C4
  glideTime: 50,
  emitEvents: true,
  eventThreshold: 0.01,
};

// Common scales (intervals from root)
export const SCALES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

export class PitchMappingNode extends MappingNode {
  private pitchConfig: PitchMappingConfig;
  private lastMidi: number = 60;
  private lastFrequency: number = 261.63;
  /** Last normalized value emitted as event (for threshold comparison) */
  private lastEmittedNormalized: number = -1;

  constructor(config: Partial<PitchMappingConfig> & Pick<MappingNodeConfig, 'id' | 'name'>) {
    const fullConfig: PitchMappingConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.pitchConfig = fullConfig;
  }

  /**
   * Process frame and output pitch value.
   *
   * Emits ControlChangeEvent for pitch when:
   * - emitEvents is enabled
   * - The node has active input
   * - The normalized value has changed by more than eventThreshold
   */
  process(frame: ProcessedFrame): MappingNodeOutput {
    if (!this.enabled) {
      return {
        nodeId: this.id,
        value: this.lastFrequency,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    const inputValue = this.getInputValue(frame);
    const isActive = this.hasActiveInput(frame);

    // Map input (0-1) to MIDI range
    let midiNote = this.pitchConfig.midiMin +
      inputValue * (this.pitchConfig.midiMax - this.pitchConfig.midiMin);

    // Quantize to scale if specified
    if (this.pitchConfig.scale) {
      midiNote = this.quantizeToScale(midiNote);
    }

    // Apply glide (simple smoothing)
    if (this.pitchConfig.glideTime > 0) {
      const glideAmount = Math.min(1, 16 / this.pitchConfig.glideTime);
      midiNote = this.lastMidi + (midiNote - this.lastMidi) * glideAmount;
    }

    this.lastMidi = midiNote;
    this.lastFrequency = midiToFrequency(midiNote);

    // Build events array
    const events: MusicalEvent[] = [];

    // Emit ControlChangeEvent if enabled and value changed significantly
    if (this.pitchConfig.emitEvents && isActive) {
      // Normalize MIDI note to 0-1 for the event
      const normalizedValue = (midiNote - this.pitchConfig.midiMin) /
        (this.pitchConfig.midiMax - this.pitchConfig.midiMin);
      const clampedNormalized = Math.max(0, Math.min(1, normalizedValue));

      // Only emit if change exceeds threshold
      if (
        this.lastEmittedNormalized < 0 ||
        Math.abs(clampedNormalized - this.lastEmittedNormalized) >= this.pitchConfig.eventThreshold
      ) {
        events.push(
          createControlChangeEvent('pitch', clampedNormalized, frame.timestamp)
        );
        this.lastEmittedNormalized = clampedNormalized;
      }
    }

    return {
      nodeId: this.id,
      value: this.lastFrequency,
      active: isActive,
      timestamp: frame.timestamp,
      events,
    };
  }

  /**
   * Quantize a MIDI note to the current scale
   */
  private quantizeToScale(midiNote: number): number {
    if (!this.pitchConfig.scale) return midiNote;

    const root = this.pitchConfig.rootNote;
    const scale = this.pitchConfig.scale;

    // Find the octave and note within octave
    const octave = Math.floor((midiNote - root) / 12);
    const noteInOctave = ((midiNote - root) % 12 + 12) % 12;

    // Find closest scale degree
    let closestDegree = scale[0];
    let minDistance = Math.abs(noteInOctave - scale[0]);

    for (const degree of scale) {
      const distance = Math.abs(noteInOctave - degree);
      if (distance < minDistance) {
        minDistance = distance;
        closestDegree = degree;
      }
    }

    return root + octave * 12 + closestDegree;
  }

  /**
   * Set MIDI range
   */
  setRange(min: number, max: number): void {
    this.pitchConfig.midiMin = Math.max(21, Math.min(108, min));
    this.pitchConfig.midiMax = Math.max(21, Math.min(108, max));
  }

  /**
   * Set scale for quantization
   */
  setScale(scale: number[] | null): void {
    this.pitchConfig.scale = scale;
  }

  /**
   * Set root note
   */
  setRootNote(note: number): void {
    this.pitchConfig.rootNote = Math.max(0, Math.min(127, note));
  }

  /**
   * Set glide time
   */
  setGlideTime(ms: number): void {
    this.pitchConfig.glideTime = Math.max(0, ms);
  }

  /**
   * Get current MIDI note
   */
  getCurrentMidi(): number {
    return this.lastMidi;
  }

  /**
   * Get current frequency
   */
  getCurrentFrequency(): number {
    return this.lastFrequency;
  }

  /**
   * Get pitch config
   */
  getPitchConfig(): PitchMappingConfig {
    return { ...this.pitchConfig };
  }
}
