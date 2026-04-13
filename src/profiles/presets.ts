/**
 * Default Input Profile Presets
 *
 * These are EDITABLE presets - users can clone and modify them.
 * The system NEVER infers mobility level from motion.
 * Users define their own preferences.
 *
 * REDESIGNED: Profiles now combine body, hands, and face tracking
 * into unified experiences rather than separating them.
 */

import type { InputProfile } from '../state/types';
import { LANDMARKS, HAND_LANDMARKS } from '../utils/constants';

/**
 * Create a preset profile with default timestamps
 */
function createPreset(
  id: string,
  name: string,
  description: string,
  category: 'recommended' | 'expressive' | 'accessible',
  profile: Omit<InputProfile, 'id' | 'name' | 'description' | 'createdAt' | 'updatedAt' | 'isPreset' | 'category'>
): InputProfile {
  return {
    id,
    name,
    description,
    category,
    createdAt: 0,
    updatedAt: 0,
    isPreset: true,
    ...profile,
  };
}

// ============================================
// RECOMMENDED PRESETS - Best for most users
// ============================================

/**
 * Full Experience - Body + hands + face combined
 * The default preset that gives users full expressive control
 */
export const PRESET_FULL_EXPERIENCE = createPreset(
  'preset-full-experience',
  'Default Mode',
  'Body movement for pitch, hand gestures for triggers, facial expressions for effects. Best overall experience.',
  'recommended',
  {
    activeModalities: {
      pose: true,
      leftHand: true,
      rightHand: true,
      face: true,
      color: false,
    },
    trackedFeatures: [
      // Body: Arms control pitch (vertical) and stereo panning (horizontal)
      {
        id: 'right-wrist',
        name: 'Right Arm',
        modality: 'pose',
        landmarkIndex: LANDMARKS.RIGHT_WRIST,
        role: 'continuous',
        axis: 'y',
      },
      {
        id: 'left-wrist',
        name: 'Left Arm',
        modality: 'pose',
        landmarkIndex: LANDMARKS.LEFT_WRIST,
        role: 'continuous',
        axis: 'y',
      },
      // Hands: Finger positions for fine control
      {
        id: 'right-index',
        name: 'Right Index',
        modality: 'rightHand',
        landmarkIndex: HAND_LANDMARKS.INDEX_TIP,
        role: 'continuous',
        axis: 'y',
      },
      {
        id: 'left-index',
        name: 'Left Index',
        modality: 'leftHand',
        landmarkIndex: HAND_LANDMARKS.INDEX_TIP,
        role: 'continuous',
        axis: 'y',
      },
      // Face: Head position adds expression
      {
        id: 'head-y',
        name: 'Head Tilt',
        modality: 'face',
        landmarkIndex: 1,
        role: 'continuous',
        axis: 'y',
      },
    ],
    gestures: [
      // Hand pinch gestures to trigger notes
      {
        id: 'right-pinch',
        name: 'Right Pinch',
        type: 'pinch',
        threshold: 0.05,
        cooldownMs: 200,
        hand: 'right',
      },
      {
        id: 'left-pinch',
        name: 'Left Pinch',
        type: 'pinch',
        threshold: 0.05,
        cooldownMs: 200,
        hand: 'left',
      },
      // Facial expression triggers
      {
        id: 'brow-raise',
        name: 'Eyebrow Raise',
        type: 'browRaise',
        threshold: 0.4,
        cooldownMs: 400,
      },
    ],
    movementSettings: {
      smoothingLevel: 'medium',
      velocityThreshold: 0.008,
      stabilityFrames: 3,
      dwellEnabled: false,
      dwellTimeMs: 500,
    },
    sensitivity: 1.0,
  }
);

/**
 * Body + Hands - Arms and fingers without face tracking
 */
export const PRESET_BODY_HANDS = createPreset(
  'preset-body-hands',
  'Body + Hands',
  'Arm movements for pitch, finger pinch to trigger notes. No face tracking needed.',
  'recommended',
  {
    activeModalities: {
      pose: true,
      leftHand: true,
      rightHand: true,
      face: false,
      color: false,
    },
    trackedFeatures: [
      {
        id: 'right-wrist',
        name: 'Right Arm',
        modality: 'pose',
        landmarkIndex: LANDMARKS.RIGHT_WRIST,
        role: 'continuous',
        axis: 'y',
      },
      {
        id: 'left-wrist',
        name: 'Left Arm',
        modality: 'pose',
        landmarkIndex: LANDMARKS.LEFT_WRIST,
        role: 'continuous',
        axis: 'y',
      },
      {
        id: 'right-index',
        name: 'Right Index',
        modality: 'rightHand',
        landmarkIndex: HAND_LANDMARKS.INDEX_TIP,
        role: 'continuous',
        axis: 'y',
      },
    ],
    gestures: [
      {
        id: 'right-pinch',
        name: 'Right Pinch',
        type: 'pinch',
        threshold: 0.05,
        cooldownMs: 200,
        hand: 'right',
      },
      {
        id: 'left-pinch',
        name: 'Left Pinch',
        type: 'pinch',
        threshold: 0.05,
        cooldownMs: 200,
        hand: 'left',
      },
    ],
    movementSettings: {
      smoothingLevel: 'medium',
      velocityThreshold: 0.01,
      stabilityFrames: 3,
      dwellEnabled: false,
      dwellTimeMs: 500,
    },
    sensitivity: 1.0,
  }
);

// ============================================
// EXPRESSIVE PRESETS - For creative exploration
// ============================================

/**
 * Finger Virtuoso - Detailed finger tracking for precise control
 */
export const PRESET_FINGER_VIRTUOSO = createPreset(
  'preset-finger-virtuoso',
  'Finger Virtuoso',
  'Each finger controls different parameters. Index=pitch, Middle=filter, Thumb=effects. For detailed expression.',
  'expressive',
  {
    activeModalities: {
      pose: false,
      leftHand: true,
      rightHand: true,
      face: true,
      color: false,
    },
    trackedFeatures: [
      // Right hand finger control
      {
        id: 'right-index',
        name: 'Right Index',
        modality: 'rightHand',
        landmarkIndex: HAND_LANDMARKS.INDEX_TIP,
        role: 'continuous',
        axis: 'y',
      },
      {
        id: 'right-middle',
        name: 'Right Middle',
        modality: 'rightHand',
        landmarkIndex: HAND_LANDMARKS.MIDDLE_TIP,
        role: 'continuous',
        axis: 'y',
      },
      {
        id: 'right-thumb',
        name: 'Right Thumb',
        modality: 'rightHand',
        landmarkIndex: HAND_LANDMARKS.THUMB_TIP,
        role: 'continuous',
        axis: 'y',
      },
      // Left hand for second voice
      {
        id: 'left-index',
        name: 'Left Index',
        modality: 'leftHand',
        landmarkIndex: HAND_LANDMARKS.INDEX_TIP,
        role: 'continuous',
        axis: 'y',
      },
      // Face for expression modulation
      {
        id: 'head-y',
        name: 'Head Tilt',
        modality: 'face',
        landmarkIndex: 1,
        role: 'continuous',
        axis: 'y',
      },
    ],
    gestures: [
      {
        id: 'right-pinch',
        name: 'Right Pinch',
        type: 'pinch',
        threshold: 0.05,
        cooldownMs: 150,
        hand: 'right',
      },
      {
        id: 'left-pinch',
        name: 'Left Pinch',
        type: 'pinch',
        threshold: 0.05,
        cooldownMs: 150,
        hand: 'left',
      },
      {
        id: 'mouth-open',
        name: 'Mouth Open',
        type: 'mouthOpen',
        threshold: 0.3,
        cooldownMs: 300,
      },
    ],
    movementSettings: {
      smoothingLevel: 'light',
      velocityThreshold: 0.005,
      stabilityFrames: 2,
      dwellEnabled: false,
      dwellTimeMs: 500,
    },
    sensitivity: 1.2,
  }
);

/**
 * Expressive Face - Rich facial expression control
 */
export const PRESET_EXPRESSIVE_FACE = createPreset(
  'preset-expressive-face',
  'Expressive Face',
  'Head movement and facial expressions. Blink triggers notes, eyebrows change chords, mouth modulates sound.',
  'expressive',
  {
    activeModalities: {
      pose: true,
      leftHand: false,
      rightHand: false,
      face: true,
      color: false,
    },
    trackedFeatures: [
      {
        id: 'head-y',
        name: 'Head Vertical',
        modality: 'face',
        landmarkIndex: 1,
        role: 'continuous',
        axis: 'y',
      },
      {
        id: 'head-x',
        name: 'Head Horizontal',
        modality: 'face',
        landmarkIndex: 1,
        role: 'continuous',
        axis: 'x',
      },
      // Body for additional expression
      {
        id: 'torso',
        name: 'Torso',
        modality: 'pose',
        landmarkIndex: LANDMARKS.NOSE,
        role: 'continuous',
        axis: 'y',
      },
    ],
    gestures: [
      {
        id: 'blink',
        name: 'Blink',
        type: 'blink',
        threshold: 0.5,
        cooldownMs: 400,
      },
      {
        id: 'brow-raise',
        name: 'Eyebrow Raise',
        type: 'browRaise',
        threshold: 0.4,
        cooldownMs: 400,
      },
      {
        id: 'mouth-open',
        name: 'Mouth Open',
        type: 'mouthOpen',
        threshold: 0.3,
        cooldownMs: 300,
      },
    ],
    movementSettings: {
      smoothingLevel: 'medium',
      velocityThreshold: 0.003,
      stabilityFrames: 4,
      dwellEnabled: false,
      dwellTimeMs: 500,
    },
    sensitivity: 1.5,
  }
);

// ============================================
// ACCESSIBLE PRESETS - Minimal movement options
// ============================================

/**
 * Head + Blink - Minimal body movement required
 */
export const PRESET_HEAD_BLINK = createPreset(
  'preset-head-blink',
  'Head + Blink',
  'Control pitch by tilting head, trigger notes by blinking. Minimal movement required.',
  'accessible',
  {
    activeModalities: {
      pose: true,
      leftHand: false,
      rightHand: false,
      face: true,
      color: false,
    },
    trackedFeatures: [
      {
        id: 'head-tilt',
        name: 'Head Tilt',
        modality: 'pose',
        landmarkIndex: LANDMARKS.NOSE,
        role: 'continuous',
        axis: 'y',
      },
    ],
    gestures: [
      {
        id: 'blink-trigger',
        name: 'Blink',
        type: 'blink',
        threshold: 0.6,
        cooldownMs: 500,
      },
      {
        id: 'brow-raise',
        name: 'Eyebrow Raise',
        type: 'browRaise',
        threshold: 0.4,
        cooldownMs: 400,
      },
    ],
    movementSettings: {
      smoothingLevel: 'heavy',
      velocityThreshold: 0.002,
      stabilityFrames: 6,
      dwellEnabled: false,
      dwellTimeMs: 500,
    },
    sensitivity: 2.0,
  }
);

/**
 * Dwell Mode - Hold position to trigger
 */
export const PRESET_DWELL_MODE = createPreset(
  'preset-dwell-mode',
  'Dwell Mode',
  'Hold any position for a moment to trigger a note. Very deliberate, precise control.',
  'accessible',
  {
    activeModalities: {
      pose: true,
      leftHand: false,
      rightHand: false,
      face: true,
      color: false,
    },
    trackedFeatures: [
      {
        id: 'head-position',
        name: 'Head Position',
        modality: 'pose',
        landmarkIndex: LANDMARKS.NOSE,
        role: 'continuous',
        axis: 'y',
      },
    ],
    gestures: [
      {
        id: 'blink-trigger',
        name: 'Blink',
        type: 'blink',
        threshold: 0.6,
        cooldownMs: 600,
      },
    ],
    movementSettings: {
      smoothingLevel: 'heavy',
      velocityThreshold: 0.001,
      stabilityFrames: 8,
      dwellEnabled: true,
      dwellTimeMs: 600,
    },
    sensitivity: 2.5,
  }
);

/**
 * Single Hand - One-handed control only
 */
export const PRESET_SINGLE_HAND = createPreset(
  'preset-single-hand',
  'Single Hand',
  'Control everything with just your right hand. Move up/down for pitch, pinch to play.',
  'accessible',
  {
    activeModalities: {
      pose: true,
      leftHand: false,
      rightHand: true,
      face: false,
      color: false,
    },
    trackedFeatures: [
      {
        id: 'right-wrist',
        name: 'Right Hand',
        modality: 'pose',
        landmarkIndex: LANDMARKS.RIGHT_WRIST,
        role: 'continuous',
        axis: 'y',
      },
      {
        id: 'right-index',
        name: 'Right Index',
        modality: 'rightHand',
        landmarkIndex: HAND_LANDMARKS.INDEX_TIP,
        role: 'continuous',
        axis: 'y',
      },
    ],
    gestures: [
      {
        id: 'right-pinch',
        name: 'Pinch',
        type: 'pinch',
        threshold: 0.05,
        cooldownMs: 250,
        hand: 'right',
      },
    ],
    movementSettings: {
      smoothingLevel: 'medium',
      velocityThreshold: 0.01,
      stabilityFrames: 3,
      dwellEnabled: false,
      dwellTimeMs: 500,
    },
    sensitivity: 1.2,
  }
);

/**
 * All available presets organized by category
 */
export const DEFAULT_PRESETS: InputProfile[] = [
  // Recommended (shown first)
  PRESET_FULL_EXPERIENCE,
  PRESET_BODY_HANDS,
  // Expressive
  PRESET_FINGER_VIRTUOSO,
  PRESET_EXPRESSIVE_FACE,
  // Accessible
  PRESET_HEAD_BLINK,
  PRESET_DWELL_MODE,
  PRESET_SINGLE_HAND,
];

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): InputProfile | undefined {
  return DEFAULT_PRESETS.find((p) => p.id === id);
}

/**
 * Clone a preset with a new ID and name
 */
export function clonePreset(preset: InputProfile, newName: string): InputProfile {
  return {
    ...preset,
    id: `profile_${Date.now()}`,
    name: newName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPreset: false, // User-created profiles are not presets
  };
}
