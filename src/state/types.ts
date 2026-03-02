/**
 * Central type definitions for application state
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// ============================================
// Tracking Types
// ============================================

export interface PoseLandmarks {
  landmarks: NormalizedLandmark[];
  worldLandmarks: NormalizedLandmark[];
  timestamp: number;
}

/** Hand landmarks from MediaPipe (21 landmarks per hand) */
export interface HandLandmarks {
  landmarks: NormalizedLandmark[];
  worldLandmarks: NormalizedLandmark[];
  handedness: 'Left' | 'Right';
  confidence: number;
}

/** Face blendshape for expression detection */
export interface FaceBlendshape {
  categoryName: string;
  score: number;
}

/** Face landmarks from MediaPipe (478 landmarks) */
export interface FaceLandmarks {
  landmarks: NormalizedLandmark[];
  /** Blendshapes for expression detection (eyeBlink, mouthOpen, etc.) */
  blendshapes: FaceBlendshape[];
  /** Face transformation matrix for head pose */
  transformMatrix?: number[];
}

/**
 * Unified tracking frame - THE core interface for multi-modal tracking.
 * All downstream processing receives this single unified frame.
 */
export interface TrackingFrame {
  pose: PoseLandmarks | null;
  leftHand: HandLandmarks | null;
  rightHand: HandLandmarks | null;
  face: FaceLandmarks | null;
  timestamp: number;
}

/** Which tracking modalities are active */
export interface ActiveModalities {
  pose: boolean;
  leftHand: boolean;
  rightHand: boolean;
  face: boolean;
}

// ============================================
// Movement Types
// ============================================

export type AccessibilityMode = 'standard' | 'lowMobility' | 'dwell' | 'singleSwitch';

export interface MovementVector {
  x: number;
  y: number;
  magnitude: number;
  direction: number; // radians
}

export interface ProcessedMovement {
  /** Position of tracked point (normalized 0-1) */
  position: { x: number; y: number };
  /** Velocity of movement */
  velocity: MovementVector;
  /** Is the movement currently active (above threshold) */
  isActive: boolean;
  /** Has the movement been stable for required duration */
  isStable: boolean;
  /** Confidence score of the detection */
  confidence: number;
}

// ============================================
// Input Profile Types (Non-Prescriptive Accessibility)
// ============================================

/** Modality source for a tracked feature */
export type FeatureModality = 'pose' | 'leftHand' | 'rightHand' | 'face';

/** Role of a tracked feature in the system */
export type FeatureRole = 'continuous' | 'trigger' | 'ignored';

/** Axis to extract from a feature */
export type FeatureAxis = 'x' | 'y' | 'z' | 'distance' | 'angle';

/** Curve type for value mapping */
export type MappingCurve = 'linear' | 'exponential' | 'logarithmic' | 'step';

/** Smoothing level presets */
export type SmoothingLevel = 'none' | 'light' | 'medium' | 'heavy';

/**
 * A tracked feature definition.
 * Users can configure which body parts/features to track.
 */
export interface TrackedFeature {
  id: string;
  name: string;
  modality: FeatureModality;
  /** Landmark index within the modality (-1 for computed gestures like pinch) */
  landmarkIndex: number;
  /** How this feature is used */
  role: FeatureRole;
  /** Which axis to extract (for continuous features) */
  axis?: FeatureAxis;
  /** Whether to invert the axis */
  inverted?: boolean;
}

/**
 * Gesture definition for discrete triggers.
 */
export interface GestureDefinition {
  id: string;
  name: string;
  type: 'pinch' | 'blink' | 'browRaise' | 'mouthOpen' | 'thumbToFinger' | 'headNod' | 'custom';
  /** Threshold for triggering (0-1) */
  threshold: number;
  /** Cooldown period after trigger (ms) */
  cooldownMs: number;
  /** Which hand for hand gestures */
  hand?: 'left' | 'right' | 'either';
}

/**
 * Movement processing settings for an input profile.
 */
export interface MovementSettings {
  smoothingLevel: SmoothingLevel;
  /** Minimum velocity to register as intentional movement */
  velocityThreshold: number;
  /** Frames movement must be sustained */
  stabilityFrames: number;
  /** Enable dwell-to-trigger */
  dwellEnabled: boolean;
  /** Dwell time in milliseconds */
  dwellTimeMs: number;
}

/** Profile category for grouping */
export type ProfileCategory = 'recommended' | 'expressive' | 'accessible';

/**
 * Input Profile - User-defined configuration for how the instrument
 * responds to their movements. This is NON-PRESCRIPTIVE: the system
 * never infers mobility level from motion. Users define their own
 * preferences.
 */
export interface InputProfile {
  id: string;
  name: string;
  description?: string;
  /** Category for grouping in UI */
  category?: ProfileCategory;
  createdAt: number;
  updatedAt: number;

  /** Which modalities are active */
  activeModalities: ActiveModalities;

  /** Which specific features to track */
  trackedFeatures: TrackedFeature[];

  /** Registered gesture triggers */
  gestures: GestureDefinition[];

  /** Movement processing settings */
  movementSettings: MovementSettings;

  /** Global sensitivity multiplier */
  sensitivity: number;

  /** Whether this is a system preset (still editable as a copy) */
  isPreset: boolean;
}

// ============================================
// Calibration Types
// ============================================

export type CalibrationPhase =
  | 'idle'
  | 'awaitingStart'
  | 'recordingRest'
  | 'recordingGesture'
  | 'testing'
  | 'complete';

export interface GestureSample {
  position: { x: number; y: number };
  timestamp: number;
}

export interface CalibratedGesture {
  id: string;
  name: string;
  samples: GestureSample[];
  /** Bounding box of the gesture in normalized coordinates */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  /** Threshold for triggering this gesture */
  threshold: number;
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Rest position learned during calibration */
  restPosition: { x: number; y: number };
  /** User's comfortable movement range */
  movementRange: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  /** Calibrated gestures */
  gestures: CalibratedGesture[];
  /** Accessibility mode preference */
  accessibilityMode: AccessibilityMode;
  /** Sensitivity multiplier (1.0 = normal) */
  sensitivity: number;
  /** Preferred sound preset */
  soundPreset: string;
}

// ============================================
// Sound Types
// ============================================

export interface Note {
  id: string;
  frequency: number;
  velocity: number; // 0-1
  startTime: number;
}

export interface SoundPreset {
  id: string;
  name: string;
  oscillatorType: OscillatorType;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

// ============================================
// Mapping Types
// ============================================

export type MappingType = 'pitch' | 'volume' | 'trigger' | 'effect';

export interface GestureMapping {
  gestureId: string;
  mappingType: MappingType;
  /** For pitch: MIDI note range */
  noteRange?: { min: number; max: number };
  /** For volume: volume range */
  volumeRange?: { min: number; max: number };
}

/**
 * Mapping node input connection.
 * Defines how a feature value feeds into a mapping node.
 */
export interface MappingInput {
  /** Source feature ID from InputProfile.trackedFeatures */
  sourceFeatureId: string;
  /** Which aspect of the feature to use */
  sourceType: 'position' | 'velocity' | 'gesture';
  /** Value range to map from */
  inputRange: { min: number; max: number };
  /** Value range to map to */
  outputRange: { min: number; max: number };
  /** Mapping curve */
  curve: MappingCurve;
  /** Invert the mapping */
  inverted: boolean;
}

/**
 * Mapping node definition.
 * Part of the modular mapping architecture (MusiKraken-inspired).
 */
export interface MappingNodeConfig {
  id: string;
  name: string;
  type: 'pitch' | 'volume' | 'filter' | 'trigger' | 'chord' | 'modulation';
  enabled: boolean;
  inputs: MappingInput[];
  /** Node-specific parameters */
  parameters: Record<string, number | string | boolean>;
}

/**
 * Extracted feature value from movement processing.
 */
export interface FeatureValue {
  featureId: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number; magnitude: number };
  isActive: boolean;
  confidence: number;
  timestamp: number;
}

/**
 * Detected gesture event.
 */
export interface DetectedGesture {
  gestureId: string;
  type: GestureDefinition['type'];
  /** 0-1 for continuous gestures, 1 for triggered */
  value: number;
  triggered: boolean;
  timestamp: number;
}

/**
 * Processed frame output from MultiModalProcessor.
 */
export interface ProcessedFrame {
  features: Map<string, FeatureValue>;
  gestures: DetectedGesture[];
  timestamp: number;
}

/**
 * Mapping engine output.
 */
export interface MappingResult {
  pitch?: number;
  volume?: number;
  filterCutoff?: number;
  triggers: string[];
  chord?: number[];
  modulation: Map<string, number>;
  timestamp: number;
}

// ============================================
// UI Types
// ============================================

export type Screen = 'welcome' | 'calibration' | 'performance' | 'betweenUs' | 'settings' | 'info';

// ============================================
// Application State
// ============================================

export interface AppState {
  // Tracking state
  isTracking: boolean;
  landmarks: PoseLandmarks | null;
  trackingConfidence: number;
  cameraError: string | null;
  /** Unified tracking frame with all modalities */
  trackingFrame: TrackingFrame | null;
  /** Which modalities are currently active */
  activeModalities: ActiveModalities;

  // Movement state
  currentMovement: ProcessedMovement | null;
  /** @deprecated Use InputProfile instead */
  accessibilityMode: AccessibilityMode;
  sensitivityMultiplier: number;
  /** Processed frame from MultiModalProcessor */
  processedFrame: ProcessedFrame | null;

  // Input Profile state
  /** Currently active input profile */
  activeInputProfile: InputProfile | null;
  /** All available input profiles (user-created + presets) */
  availableInputProfiles: InputProfile[];

  // Calibration state
  calibrationPhase: CalibrationPhase;
  currentGestureIndex: number;
  calibrationProgress: number; // 0-1

  // Profile state
  userProfile: UserProfile | null;
  availableProfiles: UserProfile[];

  // Sound state
  isMuted: boolean;
  masterVolume: number;
  currentSoundPreset: string;
  activeNotes: Note[];
  /** When true, internal Tone.js sounds are disabled (MIDI-only mode) */
  internalSoundsMuted: boolean;

  // UI state
  currentScreen: Screen;
  showDebugPanel: boolean;
  isFullscreen: boolean;
}

// ============================================
// Store Actions
// ============================================

export interface AppActions {
  // Tracking actions
  setTracking: (isTracking: boolean) => void;
  setLandmarks: (landmarks: PoseLandmarks | null) => void;
  setCameraError: (error: string | null) => void;
  /** Set the unified tracking frame */
  setTrackingFrame: (frame: TrackingFrame | null) => void;
  /** Set which modalities are active */
  setActiveModalities: (modalities: ActiveModalities) => void;

  // Movement actions
  setCurrentMovement: (movement: ProcessedMovement | null) => void;
  /** @deprecated Use InputProfile instead */
  setAccessibilityMode: (mode: AccessibilityMode) => void;
  setSensitivity: (multiplier: number) => void;
  /** Set processed frame from MultiModalProcessor */
  setProcessedFrame: (frame: ProcessedFrame | null) => void;

  // Input Profile actions
  setActiveInputProfile: (profile: InputProfile | null) => void;
  saveInputProfile: (profile: InputProfile) => void;
  deleteInputProfile: (id: string) => void;
  loadInputProfile: (id: string) => void;

  // Calibration actions
  setCalibrationPhase: (phase: CalibrationPhase) => void;
  setCalibrationProgress: (progress: number) => void;
  nextGesture: () => void;
  resetCalibration: () => void;

  // Profile actions
  setUserProfile: (profile: UserProfile | null) => void;
  saveProfile: (profile: UserProfile) => void;
  loadProfile: (id: string) => void;
  deleteProfile: (id: string) => void;

  // Sound actions
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setMasterVolume: (volume: number) => void;
  setSoundPreset: (presetId: string) => void;
  addActiveNote: (note: Note) => void;
  removeActiveNote: (noteId: string) => void;
  clearActiveNotes: () => void;
  /** Mute internal sounds (for MIDI-only mode) */
  setInternalSoundsMuted: (muted: boolean) => void;

  // UI actions
  setCurrentScreen: (screen: Screen) => void;
  toggleDebugPanel: () => void;
  setFullscreen: (isFullscreen: boolean) => void;

  // Global actions
  reset: () => void;
}

// ============================================
// Body Point Tracking Types
// ============================================

/** Mapping target for a tracked body point */
export type PointMappingTarget = 'pitch' | 'volume' | 'filter' | 'zone-trigger' | 'none';

/** A tracked body point configuration */
export interface TrackedBodyPoint {
  id: string;
  name: string;
  source: 'pose' | 'leftHand' | 'rightHand' | 'face';
  landmarkIndex: number;
  enabled: boolean;
  mapping: {
    target: PointMappingTarget;
    axis?: 'x' | 'y';
    inverted?: boolean;
  } | null;
}

/** A trigger event for the activity feed */
export interface TriggerEvent {
  id: string;
  source: string;
  action: string;
  timestamp: number;
}

/** Real-time tracking status for a point */
export interface PointTrackingStatus {
  pointId: string;
  detected: boolean;
  position: { x: number; y: number };
  confidence: number;
  mappedValue: number | null;
}
