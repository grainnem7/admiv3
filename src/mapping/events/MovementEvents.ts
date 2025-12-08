/**
 * MovementEvent Types
 *
 * These types define the semantic outputs of the movement layer that
 * the mapping layer subscribes to. They abstract raw landmark data
 * into meaningful movement descriptions.
 *
 * @see mapping_requirements.md Section 2
 */

import type { FeatureModality } from '../../state/types';

// ============================================
// Base Event Type
// ============================================

/**
 * Base interface for all movement events.
 * All events carry source identification and timing.
 */
export interface MovementEventBase {
  /** Unique event ID (generated per event instance) */
  id: string;
  /** Feature ID that generated this event */
  featureId: string;
  /** Modality source (pose, leftHand, rightHand, face) */
  modality: FeatureModality;
  /** Event timestamp (ms) */
  timestamp: number;
}

// ============================================
// Continuous Control Events
// ============================================

/**
 * Continuous control value from tracked feature.
 * Used for smooth parameter control (pitch, filter, volume).
 *
 * @see mapping_requirements.md Section 2.2
 */
export interface ContinuousMovementEvent extends MovementEventBase {
  type: 'continuous';

  /** Normalized position (0-1 range, calibrated to user's movement range) */
  position: {
    x: number;
    y: number;
    z: number;
  };

  /** Velocity vector with magnitude */
  velocity: {
    x: number;
    y: number;
    z: number;
    magnitude: number;
  };

  /** Whether the feature is currently active (above noise threshold) */
  isActive: boolean;

  /** Detection confidence (0-1) */
  confidence: number;
}

// ============================================
// Discrete Gesture Events
// ============================================

/**
 * Discrete gesture type identifiers.
 */
export type GestureType =
  | 'pinch'           // Thumb-index contact
  | 'release'         // Pinch release
  | 'blink'           // Eye closure
  | 'wink_left'       // Left eye only
  | 'wink_right'      // Right eye only
  | 'brow_raise'      // Eyebrow elevation
  | 'brow_furrow'     // Eyebrow lowering
  | 'mouth_open'      // Mouth opening past threshold
  | 'mouth_close'     // Mouth closing
  | 'head_nod'        // Vertical head movement
  | 'head_shake'      // Horizontal head movement
  | 'thumb_up'        // Thumb extension
  | 'fist'            // Hand closure
  | 'point'           // Index extension
  | 'custom';         // User-defined gesture

/**
 * Discrete gesture detection event.
 * Used for triggering notes, chords, or mode switches.
 *
 * @see mapping_requirements.md Section 2.3
 */
export interface DiscreteGestureEvent extends MovementEventBase {
  type: 'gesture';

  /** Gesture type identifier */
  gestureType: GestureType;

  /** Gesture intensity (0-1) for gestures with variable strength */
  intensity: number;

  /** Whether this is the onset (true) or offset (false) of the gesture */
  isOnset: boolean;

  /** Optional custom gesture ID for user-defined gestures */
  customGestureId?: string;
}

// ============================================
// Zone-Based Events
// ============================================

/**
 * Zone shape types for spatial triggering.
 */
export type ZoneShape = 'rectangle' | 'circle' | 'polygon';

/**
 * Zone definition for spatial triggering.
 */
export interface Zone {
  id: string;
  name: string;

  /** Zone shape */
  shape: ZoneShape;

  /** Normalized coordinates (0-1 range) */
  bounds: {
    // For rectangle
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    // For circle
    centerX?: number;
    centerY?: number;
    radius?: number;
    // For polygon
    points?: { x: number; y: number }[];
  };

  /** Visual feedback color */
  color?: string;
}

/**
 * Zone action types.
 */
export type ZoneAction = 'enter' | 'exit' | 'dwell';

/**
 * Zone entry/exit event.
 * Used for MusiKraken-style chord pads and spatial instruments.
 *
 * @see mapping_requirements.md Section 2.4
 */
export interface ZoneEvent extends MovementEventBase {
  type: 'zone';

  /** Zone identifier */
  zoneId: string;

  /** Event subtype */
  action: ZoneAction;

  /** Position within zone (normalized to zone bounds) */
  positionInZone?: { x: number; y: number };

  /** Time spent in zone (for dwell events) */
  dwellTimeMs?: number;
}

// ============================================
// Motion Quality Events
// ============================================

/**
 * Motion quality type identifiers.
 */
export type MotionQualityType =
  | 'onset'    // Movement starts
  | 'offset'   // Movement stops
  | 'burst'    // Sudden high-energy spike
  | 'drift'    // Slow, sustained motion
  | 'steady';  // Consistent motion maintained

/**
 * Motion quality/pattern event.
 * Describes the character of movement rather than position.
 *
 * @see mapping_requirements.md Section 2.5
 */
export interface MotionQualityEvent extends MovementEventBase {
  type: 'motion';

  /** Motion quality type */
  motionType: MotionQualityType;

  /** Event intensity (0-1) */
  intensity: number;

  /** Direction of motion (if applicable) */
  direction?: { x: number; y: number };
}

// ============================================
// Dwell/Confirm Events
// ============================================

/**
 * Dwell confirmation event.
 * Triggered when a feature remains stable in a region for a defined duration.
 *
 * @see mapping_requirements.md Section 2.6
 */
export interface DwellEvent extends MovementEventBase {
  type: 'dwell';

  /** Dwell progress (0-1, where 1 = confirmed) */
  progress: number;

  /** Whether dwell has been confirmed */
  confirmed: boolean;

  /** Target zone or region ID (if applicable) */
  targetId?: string;

  /** Position where dwell is occurring */
  position: { x: number; y: number };
}

// ============================================
// Union Type
// ============================================

/**
 * Union of all MovementEvent types.
 *
 * Use the `type` discriminator to narrow the type:
 * ```typescript
 * if (event.type === 'continuous') {
 *   // event is ContinuousMovementEvent
 * }
 * ```
 */
export type MovementEvent =
  | ContinuousMovementEvent
  | DiscreteGestureEvent
  | ZoneEvent
  | MotionQualityEvent
  | DwellEvent;

// ============================================
// Type Guards
// ============================================

export function isContinuousEvent(event: MovementEvent): event is ContinuousMovementEvent {
  return event.type === 'continuous';
}

export function isGestureEvent(event: MovementEvent): event is DiscreteGestureEvent {
  return event.type === 'gesture';
}

export function isZoneEvent(event: MovementEvent): event is ZoneEvent {
  return event.type === 'zone';
}

export function isMotionEvent(event: MovementEvent): event is MotionQualityEvent {
  return event.type === 'motion';
}

export function isDwellEvent(event: MovementEvent): event is DwellEvent {
  return event.type === 'dwell';
}

// ============================================
// Factory Functions
// ============================================

let eventIdCounter = 0;

function generateEventId(): string {
  return `evt_${Date.now()}_${++eventIdCounter}`;
}

/**
 * Create a ContinuousMovementEvent from feature data.
 */
export function createContinuousEvent(
  featureId: string,
  modality: FeatureModality,
  position: { x: number; y: number; z: number },
  velocity: { x: number; y: number; z: number; magnitude: number },
  isActive: boolean,
  confidence: number,
  timestamp: number
): ContinuousMovementEvent {
  return {
    id: generateEventId(),
    type: 'continuous',
    featureId,
    modality,
    position,
    velocity,
    isActive,
    confidence,
    timestamp,
  };
}

/**
 * Create a DiscreteGestureEvent.
 */
export function createGestureEvent(
  featureId: string,
  modality: FeatureModality,
  gestureType: GestureType,
  intensity: number,
  isOnset: boolean,
  timestamp: number,
  customGestureId?: string
): DiscreteGestureEvent {
  return {
    id: generateEventId(),
    type: 'gesture',
    featureId,
    modality,
    gestureType,
    intensity,
    isOnset,
    customGestureId,
    timestamp,
  };
}

/**
 * Create a ZoneEvent.
 */
export function createZoneEvent(
  featureId: string,
  modality: FeatureModality,
  zoneId: string,
  action: ZoneAction,
  timestamp: number,
  positionInZone?: { x: number; y: number },
  dwellTimeMs?: number
): ZoneEvent {
  return {
    id: generateEventId(),
    type: 'zone',
    featureId,
    modality,
    zoneId,
    action,
    positionInZone,
    dwellTimeMs,
    timestamp,
  };
}

/**
 * Create a MotionQualityEvent.
 */
export function createMotionEvent(
  featureId: string,
  modality: FeatureModality,
  motionType: MotionQualityType,
  intensity: number,
  timestamp: number,
  direction?: { x: number; y: number }
): MotionQualityEvent {
  return {
    id: generateEventId(),
    type: 'motion',
    featureId,
    modality,
    motionType,
    intensity,
    direction,
    timestamp,
  };
}

/**
 * Create a DwellEvent.
 */
export function createDwellEvent(
  featureId: string,
  modality: FeatureModality,
  progress: number,
  confirmed: boolean,
  position: { x: number; y: number },
  timestamp: number,
  targetId?: string
): DwellEvent {
  return {
    id: generateEventId(),
    type: 'dwell',
    featureId,
    modality,
    progress,
    confirmed,
    targetId,
    position,
    timestamp,
  };
}
