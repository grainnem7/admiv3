/**
 * Quantizer Mapping Node
 *
 * Quantizes incoming pitch values to a musical scale in real-time.
 * Can operate in multiple modes:
 * - chromatic: Pass through without quantization
 * - scale: Quantize to nearest scale degree
 * - snap: Hard snap to scale (no in-between values)
 *
 * Emits ControlChangeEvents for pitch and NoteEvents for triggered notes.
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame } from '../../state/types';
import { createControlChangeEvent, createNoteEvent, type MusicalEvent } from '../events';
import {
  quantizeToScale,
  midiToNote,
  type ScaleType,
  type NoteName,
  SCALES,
  NOTE_NAMES,
} from '../../sound/MusicTheory';

/** Quantization mode */
export type QuantizeMode = 'chromatic' | 'scale' | 'snap';

export interface QuantizerConfig extends MappingNodeConfig {
  /** Root note of the scale */
  rootNote: NoteName;
  /** Scale type to quantize to */
  scaleType: ScaleType;
  /** Quantization mode */
  mode: QuantizeMode;
  /** Minimum MIDI note (default 36 = C2) */
  minMidi: number;
  /** Maximum MIDI note (default 96 = C7) */
  maxMidi: number;
  /** Smoothing factor for pitch changes (0-1) */
  smoothing: number;
  /** Whether to emit note events on pitch change */
  emitNotes: boolean;
  /** Minimum pitch change to trigger a new note (in semitones) */
  noteChangeThreshold: number;
}

const DEFAULT_CONFIG: Omit<QuantizerConfig, 'id' | 'name' | 'inputs'> = {
  enabled: true,
  rootNote: 'C',
  scaleType: 'pentatonic',
  mode: 'scale',
  minMidi: 36,
  maxMidi: 96,
  smoothing: 0.3,
  emitNotes: false,
  noteChangeThreshold: 1,
};

export class QuantizerNode extends MappingNode {
  private quantizerConfig: QuantizerConfig;
  private currentMidi: number = 60;
  private smoothedMidi: number = 60;
  private lastNoteMidi: number = -1;
  private inputPitch: number = 0.5; // 0-1 normalized input

  constructor(config: Partial<QuantizerConfig> & Pick<MappingNodeConfig, 'id' | 'name'>) {
    const fullConfig: QuantizerConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.quantizerConfig = fullConfig;
  }

  /**
   * Set input pitch value (0-1 normalized)
   */
  setInputPitch(pitch: number): void {
    this.inputPitch = Math.max(0, Math.min(1, pitch));
  }

  /**
   * Process frame and output quantized pitch values.
   */
  process(frame: ProcessedFrame): MappingNodeOutput {
    const events: MusicalEvent[] = [];

    if (!this.enabled) {
      return {
        nodeId: this.id,
        value: this.smoothedMidi,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    // Convert normalized pitch to MIDI range
    const rawMidi = this.quantizerConfig.minMidi +
      this.inputPitch * (this.quantizerConfig.maxMidi - this.quantizerConfig.minMidi);

    // Apply quantization based on mode
    let quantizedMidi: number;
    switch (this.quantizerConfig.mode) {
      case 'chromatic':
        quantizedMidi = Math.round(rawMidi);
        break;
      case 'scale':
        quantizedMidi = quantizeToScale(
          Math.round(rawMidi),
          this.quantizerConfig.rootNote,
          this.quantizerConfig.scaleType
        );
        break;
      case 'snap':
        // Snap mode: always quantize, no smooth transition
        quantizedMidi = quantizeToScale(
          Math.round(rawMidi),
          this.quantizerConfig.rootNote,
          this.quantizerConfig.scaleType
        );
        this.smoothedMidi = quantizedMidi;
        this.currentMidi = quantizedMidi;
        break;
      default:
        quantizedMidi = Math.round(rawMidi);
    }

    // Apply smoothing (except for snap mode which sets directly)
    if (this.quantizerConfig.mode !== 'snap') {
      this.smoothedMidi = this.smoothedMidi +
        (quantizedMidi - this.smoothedMidi) * (1 - this.quantizerConfig.smoothing);
      this.currentMidi = Math.round(this.smoothedMidi);
    }

    // Clamp to range
    this.currentMidi = Math.max(
      this.quantizerConfig.minMidi,
      Math.min(this.quantizerConfig.maxMidi, this.currentMidi)
    );

    // Emit pitch control change
    const normalizedPitch = (this.currentMidi - this.quantizerConfig.minMidi) /
      (this.quantizerConfig.maxMidi - this.quantizerConfig.minMidi);
    events.push(createControlChangeEvent('pitch', normalizedPitch, frame.timestamp));

    // Emit note event if pitch changed significantly
    if (this.quantizerConfig.emitNotes) {
      const pitchChange = Math.abs(this.currentMidi - this.lastNoteMidi);
      if (pitchChange >= this.quantizerConfig.noteChangeThreshold) {
        // Release previous note
        if (this.lastNoteMidi > 0) {
          events.push(createNoteEvent(
            'noteOff',
            this.lastNoteMidi,
            0,
            frame.timestamp
          ));
        }
        // Trigger new note
        events.push(createNoteEvent(
          'noteOn',
          this.currentMidi,
          0.7,
          frame.timestamp
        ));
        this.lastNoteMidi = this.currentMidi;
      }
    }

    return {
      nodeId: this.id,
      value: this.currentMidi,
      active: true,
      timestamp: frame.timestamp,
      events,
    };
  }

  /**
   * Get current quantized MIDI note
   */
  getCurrentMidi(): number {
    return this.currentMidi;
  }

  /**
   * Get current note name
   */
  getCurrentNote(): string {
    return midiToNote(this.currentMidi);
  }

  /**
   * Set root note
   */
  setRootNote(root: NoteName): void {
    this.quantizerConfig.rootNote = root;
  }

  /**
   * Set scale type
   */
  setScaleType(scaleType: ScaleType): void {
    this.quantizerConfig.scaleType = scaleType;
  }

  /**
   * Set quantization mode
   */
  setMode(mode: QuantizeMode): void {
    this.quantizerConfig.mode = mode;
  }

  /**
   * Set MIDI range
   */
  setMidiRange(min: number, max: number): void {
    this.quantizerConfig.minMidi = Math.max(0, Math.min(127, min));
    this.quantizerConfig.maxMidi = Math.max(0, Math.min(127, max));
  }

  /**
   * Get available scales
   */
  static getAvailableScales(): { type: ScaleType; name: string; description: string }[] {
    return Object.entries(SCALES).map(([type, info]) => ({
      type: type as ScaleType,
      name: info.name,
      description: info.description,
    }));
  }

  /**
   * Get available root notes
   */
  static getAvailableRoots(): NoteName[] {
    return [...NOTE_NAMES];
  }

  /**
   * Get configuration
   */
  getQuantizerConfig(): QuantizerConfig {
    return { ...this.quantizerConfig };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.currentMidi = 60;
    this.smoothedMidi = 60;
    this.lastNoteMidi = -1;
    this.inputPitch = 0.5;
  }
}
