/**
 * MusicalEvent Types
 *
 * These types define the outputs of the mapping layer that the
 * sound engine responds to. They represent specific musical actions
 * to be performed.
 *
 * @see mapping_requirements.md Section 3
 */

// ============================================
// Note Events
// ============================================

/**
 * Note action types.
 */
export type NoteAction = 'noteOn' | 'noteOff';

/**
 * Single note event.
 *
 * @see mapping_requirements.md Section 3.1
 */
export interface NoteEvent {
  type: 'note';

  /** Note subtype */
  action: NoteAction;

  /** MIDI note number (0-127) */
  midiNote: number;

  /** Velocity (0-1) */
  velocity: number;

  /** Optional voice ID for polyphonic tracking */
  voiceId?: string;

  /** Timestamp */
  timestamp: number;
}

// ============================================
// Chord Events
// ============================================

/**
 * Chord action types.
 */
export type ChordAction = 'chordOn' | 'chordOff';

/**
 * Chord event (multiple simultaneous notes).
 *
 * @see mapping_requirements.md Section 3.1
 */
export interface ChordEvent {
  type: 'chord';

  /** Chord subtype */
  action: ChordAction;

  /** Array of MIDI notes */
  midiNotes: number[];

  /** Velocity for all notes (0-1) */
  velocity: number;

  /** Chord voicing name (for display) */
  voicingName?: string;

  /** Optional voice IDs */
  voiceIds?: string[];

  /** Timestamp */
  timestamp: number;
}

// ============================================
// Continuous Control Events
// ============================================

/**
 * Control parameter types.
 */
export type ControlParameter =
  | 'pitch'             // Pitch bend or continuous pitch
  | 'volume'            // Amplitude
  | 'filter_cutoff'     // Low-pass filter frequency
  | 'filter_resonance'  // Filter Q
  | 'pan'               // Stereo position
  | 'reverb_mix'        // Reverb send
  | 'delay_mix'         // Delay send
  | 'attack'            // Envelope attack time
  | 'release'           // Envelope release time
  | 'vibrato_rate'      // Vibrato LFO speed
  | 'vibrato_depth'     // Vibrato intensity
  | 'harmonic_richness' // Oscillator mix or overtone content
  | 'formant'           // Vowel formant position
  | 'custom';           // User-defined parameter

/**
 * Continuous parameter control.
 * Maps to synthesizer parameters, effects, or modulation.
 *
 * @see mapping_requirements.md Section 3.2
 */
export interface ControlChangeEvent {
  type: 'control';

  /** Parameter being controlled */
  parameter: ControlParameter;

  /** Normalized value (0-1) */
  value: number;

  /** Optional custom parameter ID */
  customParameterId?: string;

  /** Timestamp */
  timestamp: number;
}

// ============================================
// Structural Events
// ============================================

/**
 * Structural action types.
 */
export type StructuralAction =
  | 'toggleLayer'      // Enable/disable a sound layer
  | 'switchMode'       // Change mapping mode (e.g., melodic → chord pad)
  | 'switchPreset'     // Change sound preset
  | 'switchScale'      // Change musical scale
  | 'transposeUp'      // Shift pitch up
  | 'transposeDown'    // Shift pitch down
  | 'nextChord'        // Advance chord progression
  | 'previousChord'    // Reverse chord progression
  | 'startRecording'   // Begin loop recording
  | 'stopRecording'    // End loop recording
  | 'toggleLoop';      // Enable/disable loop playback

/**
 * Structural/mode-switching events.
 * Control higher-level musical organization.
 *
 * @see mapping_requirements.md Section 3.3
 */
export interface StructuralEvent {
  type: 'structural';

  /** Structural action */
  action: StructuralAction;

  /** Target ID (layer, preset, mode, etc.) */
  targetId?: string;

  /** Optional value (e.g., transpose amount) */
  value?: number;

  /** Timestamp */
  timestamp: number;
}

// ============================================
// Safety Events
// ============================================

/**
 * Safety action types.
 */
export type SafetyAction =
  | 'muteOn'    // Mute all audio
  | 'muteOff'   // Unmute audio
  | 'panic'     // Kill all notes immediately
  | 'reset';    // Reset all state to defaults

/**
 * Safety and emergency events.
 * Critical for accessibility and user control.
 *
 * @see mapping_requirements.md Section 3.4
 */
export interface SafetyEvent {
  type: 'safety';

  /** Safety action */
  action: SafetyAction;

  /** Timestamp */
  timestamp: number;
}

// ============================================
// Union Type
// ============================================

/**
 * Union of all MusicalEvent types.
 *
 * Use the `type` discriminator to narrow the type:
 * ```typescript
 * if (event.type === 'note') {
 *   // event is NoteEvent
 * }
 * ```
 */
export type MusicalEvent =
  | NoteEvent
  | ChordEvent
  | ControlChangeEvent
  | StructuralEvent
  | SafetyEvent;

// ============================================
// Type Guards
// ============================================

export function isNoteEvent(event: MusicalEvent): event is NoteEvent {
  return event.type === 'note';
}

export function isChordEvent(event: MusicalEvent): event is ChordEvent {
  return event.type === 'chord';
}

export function isControlChangeEvent(event: MusicalEvent): event is ControlChangeEvent {
  return event.type === 'control';
}

export function isStructuralEvent(event: MusicalEvent): event is StructuralEvent {
  return event.type === 'structural';
}

export function isSafetyEvent(event: MusicalEvent): event is SafetyEvent {
  return event.type === 'safety';
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a NoteEvent.
 */
export function createNoteEvent(
  action: NoteAction,
  midiNote: number,
  velocity: number,
  timestamp: number,
  voiceId?: string
): NoteEvent {
  return {
    type: 'note',
    action,
    midiNote,
    velocity,
    voiceId,
    timestamp,
  };
}

/**
 * Create a ChordEvent.
 */
export function createChordEvent(
  action: ChordAction,
  midiNotes: number[],
  velocity: number,
  timestamp: number,
  voicingName?: string,
  voiceIds?: string[]
): ChordEvent {
  return {
    type: 'chord',
    action,
    midiNotes,
    velocity,
    voicingName,
    voiceIds,
    timestamp,
  };
}

/**
 * Create a ControlChangeEvent.
 */
export function createControlChangeEvent(
  parameter: ControlParameter,
  value: number,
  timestamp: number,
  customParameterId?: string
): ControlChangeEvent {
  return {
    type: 'control',
    parameter,
    value,
    customParameterId,
    timestamp,
  };
}

/**
 * Create a StructuralEvent.
 */
export function createStructuralEvent(
  action: StructuralAction,
  timestamp: number,
  targetId?: string,
  value?: number
): StructuralEvent {
  return {
    type: 'structural',
    action,
    targetId,
    value,
    timestamp,
  };
}

/**
 * Create a SafetyEvent.
 */
export function createSafetyEvent(
  action: SafetyAction,
  timestamp: number
): SafetyEvent {
  return {
    type: 'safety',
    action,
    timestamp,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Convert MIDI note number to frequency (A4 = 440Hz).
 */
export function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Convert MIDI note number to note name (e.g., 60 → 'C4').
 */
export function midiToNoteName(midiNote: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteName = noteNames[midiNote % 12];
  return `${noteName}${octave}`;
}

/**
 * Get a human-readable description of a MusicalEvent.
 */
export function describeMusicalEvent(event: MusicalEvent): string {
  switch (event.type) {
    case 'note':
      return `${event.action}: ${midiToNoteName(event.midiNote)} (vel: ${event.velocity.toFixed(2)})`;

    case 'chord':
      const notes = event.midiNotes.map(midiToNoteName).join(', ');
      return `${event.action}: [${notes}]${event.voicingName ? ` (${event.voicingName})` : ''}`;

    case 'control':
      return `control: ${event.parameter} = ${event.value.toFixed(3)}`;

    case 'structural':
      return `structural: ${event.action}${event.targetId ? ` → ${event.targetId}` : ''}`;

    case 'safety':
      return `safety: ${event.action}`;

    default:
      return 'unknown event';
  }
}
