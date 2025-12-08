/**
 * Chord Mapping Node
 *
 * Maps input values to chord voicings.
 * Can output multiple MIDI notes for polyphonic playback.
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame } from '../../state/types';
import { midiToFrequency } from '../../utils/math';
import { createChordEvent, type MusicalEvent } from '../events';

export interface ChordVoicing {
  name: string;
  intervals: number[]; // Intervals from root
}

export interface ChordMappingConfig extends MappingNodeConfig {
  /** Available chord voicings */
  voicings: ChordVoicing[];
  /** Root note (MIDI) */
  rootNote: number;
  /** Octave range for chord movement */
  octaveRange: number;
  /** Current voicing index */
  currentVoicingIndex: number;
  /** Whether to arpeggiate instead of play simultaneously */
  arpeggiate: boolean;
  /** Arpeggio rate in ms per note */
  arpeggioRate: number;
  /**
   * Whether to emit ChordEvents.
   * @default true
   */
  emitEvents: boolean;
  /**
   * Default velocity for chord events (0-1).
   * @default 0.7
   */
  velocity: number;
}

// Common chord voicings
export const CHORD_VOICINGS: ChordVoicing[] = [
  { name: 'Major', intervals: [0, 4, 7] },
  { name: 'Minor', intervals: [0, 3, 7] },
  { name: 'Major 7th', intervals: [0, 4, 7, 11] },
  { name: 'Minor 7th', intervals: [0, 3, 7, 10] },
  { name: 'Dominant 7th', intervals: [0, 4, 7, 10] },
  { name: 'Diminished', intervals: [0, 3, 6] },
  { name: 'Augmented', intervals: [0, 4, 8] },
  { name: 'Sus2', intervals: [0, 2, 7] },
  { name: 'Sus4', intervals: [0, 5, 7] },
  { name: 'Power', intervals: [0, 7] },
  { name: 'Add9', intervals: [0, 4, 7, 14] },
  { name: 'Minor Add9', intervals: [0, 3, 7, 14] },
];

const DEFAULT_CONFIG: Omit<ChordMappingConfig, 'id' | 'name' | 'inputs'> = {
  enabled: true,
  voicings: CHORD_VOICINGS,
  rootNote: 60, // C4
  octaveRange: 2,
  currentVoicingIndex: 0,
  arpeggiate: false,
  arpeggioRate: 100,
  emitEvents: true,
  velocity: 0.7,
};

export interface ChordOutput extends MappingNodeOutput {
  /** Array of frequencies for the chord */
  frequencies: number[];
  /** Array of MIDI notes for the chord */
  midiNotes: number[];
  /** Current voicing name */
  voicingName: string;
  // Note: `events` is inherited from MappingNodeOutput
}

export class ChordMappingNode extends MappingNode {
  private chordConfig: ChordMappingConfig;
  private currentArpeggioIndex: number = 0;
  private lastArpeggioTime: number = 0;
  /** Track previous active state for edge detection */
  private wasActive: boolean = false;
  /** Track previous chord notes for change detection */
  private lastChordNotes: number[] = [];

  constructor(config: Partial<ChordMappingConfig> & Pick<MappingNodeConfig, 'id' | 'name'>) {
    const fullConfig: ChordMappingConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.chordConfig = fullConfig;
  }

  /**
   * Process frame and output chord frequencies.
   *
   * Emits ChordEvent when:
   * - emitEvents is enabled
   * - Transitioning from inactive to active (chordOn)
   * - Transitioning from active to inactive (chordOff)
   * - Chord notes change while active (chordOff old, chordOn new)
   */
  process(frame: ProcessedFrame): ChordOutput {
    if (!this.enabled) {
      // If we were active before, emit chordOff
      if (this.wasActive && this.chordConfig.emitEvents && this.lastChordNotes.length > 0) {
        const events: MusicalEvent[] = [
          createChordEvent('chordOff', this.lastChordNotes, 0, frame.timestamp),
        ];
        this.wasActive = false;
        this.lastChordNotes = [];
        return {
          nodeId: this.id,
          value: 0,
          active: false,
          timestamp: frame.timestamp,
          events,
          frequencies: [],
          midiNotes: [],
          voicingName: '',
        };
      }
      return {
        nodeId: this.id,
        value: 0,
        active: false,
        timestamp: frame.timestamp,
        events: [],
        frequencies: [],
        midiNotes: [],
        voicingName: '',
      };
    }

    const inputValue = this.getInputValue(frame);
    const isActive = this.hasActiveInput(frame);

    // Map input to root note within octave range
    const octaveOffset = Math.floor(inputValue * this.chordConfig.octaveRange) * 12;
    const chordRoot = this.chordConfig.rootNote + octaveOffset;

    // Get current voicing
    const voicing = this.chordConfig.voicings[this.chordConfig.currentVoicingIndex];
    if (!voicing) {
      return {
        nodeId: this.id,
        value: chordRoot,
        active: isActive,
        timestamp: frame.timestamp,
        events: [],
        frequencies: [midiToFrequency(chordRoot)],
        midiNotes: [chordRoot],
        voicingName: 'None',
      };
    }

    // Build chord notes
    const midiNotes = voicing.intervals.map((interval) => chordRoot + interval);
    let outputNotes = midiNotes;
    let outputFrequencies: number[];

    // Handle arpeggio mode
    if (this.chordConfig.arpeggiate && isActive) {
      const timeSinceLastArp = frame.timestamp - this.lastArpeggioTime;
      if (timeSinceLastArp >= this.chordConfig.arpeggioRate) {
        this.currentArpeggioIndex = (this.currentArpeggioIndex + 1) % midiNotes.length;
        this.lastArpeggioTime = frame.timestamp;
      }
      outputNotes = [midiNotes[this.currentArpeggioIndex]];
      outputFrequencies = [midiToFrequency(outputNotes[0])];
    } else {
      outputFrequencies = midiNotes.map(midiToFrequency);
    }

    // Build events array
    const events: MusicalEvent[] = [];

    if (this.chordConfig.emitEvents) {
      // Check if chord notes changed
      const chordChanged = !this.arraysEqual(midiNotes, this.lastChordNotes);

      if (isActive && !this.wasActive) {
        // Transitioning to active: emit chordOn
        events.push(
          createChordEvent('chordOn', midiNotes, this.chordConfig.velocity, frame.timestamp, voicing.name)
        );
        this.lastChordNotes = [...midiNotes];
      } else if (!isActive && this.wasActive) {
        // Transitioning to inactive: emit chordOff
        events.push(
          createChordEvent('chordOff', this.lastChordNotes, 0, frame.timestamp, voicing.name)
        );
        this.lastChordNotes = [];
      } else if (isActive && chordChanged && this.lastChordNotes.length > 0) {
        // Chord changed while active: emit chordOff for old, chordOn for new
        events.push(
          createChordEvent('chordOff', this.lastChordNotes, 0, frame.timestamp)
        );
        events.push(
          createChordEvent('chordOn', midiNotes, this.chordConfig.velocity, frame.timestamp, voicing.name)
        );
        this.lastChordNotes = [...midiNotes];
      }
    }

    this.wasActive = isActive;

    return {
      nodeId: this.id,
      value: chordRoot,
      active: isActive,
      timestamp: frame.timestamp,
      events,
      frequencies: outputFrequencies,
      midiNotes: outputNotes,
      voicingName: voicing.name,
    };
  }

  /**
   * Compare two arrays for equality
   */
  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Set root note
   */
  setRootNote(note: number): void {
    this.chordConfig.rootNote = Math.max(0, Math.min(127, note));
  }

  /**
   * Set voicing by index
   */
  setVoicingIndex(index: number): void {
    this.chordConfig.currentVoicingIndex = Math.max(
      0,
      Math.min(this.chordConfig.voicings.length - 1, index)
    );
  }

  /**
   * Set voicing by name
   */
  setVoicingByName(name: string): void {
    const index = this.chordConfig.voicings.findIndex(
      (v) => v.name.toLowerCase() === name.toLowerCase()
    );
    if (index !== -1) {
      this.chordConfig.currentVoicingIndex = index;
    }
  }

  /**
   * Cycle to next voicing
   */
  nextVoicing(): void {
    this.chordConfig.currentVoicingIndex =
      (this.chordConfig.currentVoicingIndex + 1) % this.chordConfig.voicings.length;
  }

  /**
   * Cycle to previous voicing
   */
  previousVoicing(): void {
    this.chordConfig.currentVoicingIndex =
      (this.chordConfig.currentVoicingIndex - 1 + this.chordConfig.voicings.length) %
      this.chordConfig.voicings.length;
  }

  /**
   * Set octave range
   */
  setOctaveRange(range: number): void {
    this.chordConfig.octaveRange = Math.max(1, Math.min(4, range));
  }

  /**
   * Enable/disable arpeggio mode
   */
  setArpeggiate(enabled: boolean): void {
    this.chordConfig.arpeggiate = enabled;
    if (!enabled) {
      this.currentArpeggioIndex = 0;
    }
  }

  /**
   * Set arpeggio rate
   */
  setArpeggioRate(ms: number): void {
    this.chordConfig.arpeggioRate = Math.max(10, ms);
  }

  /**
   * Get current voicing
   */
  getCurrentVoicing(): ChordVoicing | null {
    return this.chordConfig.voicings[this.chordConfig.currentVoicingIndex] ?? null;
  }

  /**
   * Get all available voicings
   */
  getVoicings(): ChordVoicing[] {
    return [...this.chordConfig.voicings];
  }

  /**
   * Add a custom voicing
   */
  addVoicing(voicing: ChordVoicing): void {
    this.chordConfig.voicings.push(voicing);
  }

  /**
   * Get chord config
   */
  getChordConfig(): ChordMappingConfig {
    return { ...this.chordConfig };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.currentArpeggioIndex = 0;
    this.lastArpeggioTime = 0;
    this.wasActive = false;
    this.lastChordNotes = [];
  }
}
