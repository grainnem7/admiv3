/**
 * Application-wide constants
 * All magic numbers and defaults are defined here for easy tuning
 */

// Tracking constants
export const TRACKING = {
  /** Target frames per second for pose detection */
  TARGET_FPS: 30,
  /** Minimum confidence score to consider a landmark valid (0-1) */
  MIN_CONFIDENCE: 0.5,
  /** Number of frames to buffer for smoothing */
  SMOOTHING_WINDOW: 5,
} as const;

// Movement detection constants
export const MOVEMENT = {
  /** Minimum velocity (normalized units/frame) to register as movement */
  MIN_VELOCITY: 0.01,
  /** Number of frames movement must be sustained to count as intentional */
  STABILITY_FRAMES: 3,
  /** Default dwell time in milliseconds for dwell-to-trigger mode */
  DEFAULT_DWELL_MS: 500,
  /** Hysteresis factor - must return this far toward rest before re-triggering */
  HYSTERESIS_FACTOR: 0.3,
} as const;

// Audio constants
export const AUDIO = {
  /** Base frequency for middle C (C4) */
  MIDDLE_C_HZ: 261.63,
  /** Default master volume (0-1) */
  DEFAULT_VOLUME: 0.5,
  /** Maximum safe volume to prevent hearing damage */
  MAX_SAFE_VOLUME: 0.8,
  /** Audio context sample rate */
  SAMPLE_RATE: 44100,
  /** Attack time for notes in seconds */
  DEFAULT_ATTACK: 0.05,
  /** Release time for notes in seconds */
  DEFAULT_RELEASE: 0.3,
} as const;

// Calibration constants
export const CALIBRATION = {
  /** Number of samples to collect per gesture during calibration */
  SAMPLES_PER_GESTURE: 30,
  /** Minimum number of samples needed for valid calibration */
  MIN_SAMPLES: 10,
  /** Time to wait at rest position before starting calibration (ms) */
  REST_SETTLE_TIME_MS: 1000,
} as const;

// UI constants
export const UI = {
  /** Debounce time for UI updates in ms */
  DEBOUNCE_MS: 16,
  /** Minimum touch target size in pixels (WCAG 2.5.5) */
  MIN_TOUCH_TARGET: 44,
} as const;

// MediaPipe landmark indices for common body parts (Pose - 33 landmarks)
export const LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

// MediaPipe Hand landmarks (21 landmarks per hand)
export const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

// Hand finger connections for drawing
export const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm
  [5, 9], [9, 13], [13, 17],
] as const;

// MediaPipe Face landmarks - key points for expression detection (478 total, but we use key ones)
export const FACE_LANDMARKS = {
  // Lips
  UPPER_LIP_TOP: 13,
  LOWER_LIP_BOTTOM: 14,
  LIPS_LEFT: 61,
  LIPS_RIGHT: 291,

  // Left eye
  LEFT_EYE_INNER: 133,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_UPPER: 159,
  LEFT_EYE_LOWER: 145,
  LEFT_IRIS: 468, // Iris center (if available)

  // Right eye
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_UPPER: 386,
  RIGHT_EYE_LOWER: 374,
  RIGHT_IRIS: 473, // Iris center (if available)

  // Eyebrows
  LEFT_EYEBROW_INNER: 107,
  LEFT_EYEBROW_MIDDLE: 105,
  LEFT_EYEBROW_OUTER: 70,
  RIGHT_EYEBROW_INNER: 336,
  RIGHT_EYEBROW_MIDDLE: 334,
  RIGHT_EYEBROW_OUTER: 300,

  // Nose
  NOSE_TIP: 1,
  NOSE_BOTTOM: 2,
  NOSE_LEFT: 129,
  NOSE_RIGHT: 358,

  // Face contour
  CHIN: 152,
  FOREHEAD: 10,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
} as const;

// Face blendshape names from MediaPipe (subset of the 52 available)
export const FACE_BLENDSHAPES = {
  // Eye blendshapes
  EYE_BLINK_LEFT: 'eyeBlinkLeft',
  EYE_BLINK_RIGHT: 'eyeBlinkRight',
  EYE_LOOK_DOWN_LEFT: 'eyeLookDownLeft',
  EYE_LOOK_DOWN_RIGHT: 'eyeLookDownRight',
  EYE_LOOK_UP_LEFT: 'eyeLookUpLeft',
  EYE_LOOK_UP_RIGHT: 'eyeLookUpRight',
  EYE_SQUINT_LEFT: 'eyeSquintLeft',
  EYE_SQUINT_RIGHT: 'eyeSquintRight',
  EYE_WIDE_LEFT: 'eyeWideLeft',
  EYE_WIDE_RIGHT: 'eyeWideRight',

  // Brow blendshapes
  BROW_DOWN_LEFT: 'browDownLeft',
  BROW_DOWN_RIGHT: 'browDownRight',
  BROW_INNER_UP: 'browInnerUp',
  BROW_OUTER_UP_LEFT: 'browOuterUpLeft',
  BROW_OUTER_UP_RIGHT: 'browOuterUpRight',

  // Mouth blendshapes
  JAW_OPEN: 'jawOpen',
  MOUTH_CLOSE: 'mouthClose',
  MOUTH_SMILE_LEFT: 'mouthSmileLeft',
  MOUTH_SMILE_RIGHT: 'mouthSmileRight',
  MOUTH_PUCKER: 'mouthPucker',
  MOUTH_FROWN_LEFT: 'mouthFrownLeft',
  MOUTH_FROWN_RIGHT: 'mouthFrownRight',
} as const;

// Gesture detection thresholds
export const GESTURE_THRESHOLDS = {
  /** Pinch: distance between thumb tip and index tip (normalized) */
  PINCH_DISTANCE: 0.05,
  /** Blink: eye aspect ratio threshold (both eyes must exceed) */
  BLINK_THRESHOLD: 0.3,
  /** Wink: closed eye threshold (higher = more closed) */
  WINK_CLOSED_THRESHOLD: 0.4,
  /** Wink: open eye max threshold (the other eye must stay below this) */
  WINK_OPEN_MAX_THRESHOLD: 0.25,
  /** Wink: max squint allowed on open eye (to filter out squinting) */
  WINK_SQUINT_MAX: 0.4,
  /** Eyebrow raise: vertical displacement from neutral */
  BROW_RAISE_THRESHOLD: 0.15,
  /** Mouth open: jaw open blendshape value */
  MOUTH_OPEN_THRESHOLD: 0.3,
  /** Default gesture cooldown in ms */
  DEFAULT_COOLDOWN_MS: 300,
} as const;
