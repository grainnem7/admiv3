/**
 * Mapping Events Module
 *
 * Exports all event types for the mapping layer:
 * - MovementEvents: Inputs from movement layer
 * - MusicalEvents: Outputs to sound layer
 *
 * @see mapping_requirements.md Sections 2 and 3
 */

// ============================================
// MovementEvent Types
// ============================================

export type {
  MovementEventBase,
  ContinuousMovementEvent,
  DiscreteGestureEvent,
  ZoneEvent,
  MotionQualityEvent,
  DwellEvent,
  MovementEvent,
  GestureType,
  ZoneShape,
  Zone,
  ZoneAction,
  MotionQualityType,
} from './MovementEvents';

export {
  // Type guards
  isContinuousEvent,
  isGestureEvent,
  isZoneEvent,
  isMotionEvent,
  isDwellEvent,
  // Factory functions
  createContinuousEvent,
  createGestureEvent,
  createZoneEvent,
  createMotionEvent,
  createDwellEvent,
} from './MovementEvents';

// ============================================
// MusicalEvent Types
// ============================================

export type {
  NoteEvent,
  ChordEvent,
  ControlChangeEvent,
  StructuralEvent,
  SafetyEvent,
  MusicalEvent,
  NoteAction,
  ChordAction,
  ControlParameter,
  StructuralAction,
  SafetyAction,
} from './MusicalEvents';

export {
  // Type guards
  isNoteEvent,
  isChordEvent,
  isControlChangeEvent,
  isStructuralEvent,
  isSafetyEvent,
  // Factory functions
  createNoteEvent,
  createChordEvent,
  createControlChangeEvent,
  createStructuralEvent,
  createSafetyEvent,
  // Utility functions
  midiToFrequency,
  midiToNoteName,
  describeMusicalEvent,
} from './MusicalEvents';
