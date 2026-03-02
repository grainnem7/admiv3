/**
 * Landmark Definitions - Human-readable definitions for all trackable body points
 *
 * Organized by source (pose, hands, face) and category for intuitive UI navigation.
 */

export type LandmarkSource = 'pose' | 'leftHand' | 'rightHand' | 'face';
export type LandmarkCategory = 'head' | 'torso' | 'arms' | 'legs' | 'wrist' | 'thumb' | 'index' | 'middle' | 'ring' | 'pinky' | 'eyes' | 'brows' | 'mouth' | 'other';

export interface LandmarkDefinition {
  index: number;
  name: string;
  shortName: string;
  category: LandmarkCategory;
}

// ============================================
// POSE LANDMARKS (33 total)
// ============================================

export const POSE_HEAD_LANDMARKS: LandmarkDefinition[] = [
  { index: 0, name: 'Nose', shortName: 'Nose', category: 'head' },
  { index: 1, name: 'Left Eye Inner', shortName: 'L Eye In', category: 'head' },
  { index: 2, name: 'Left Eye', shortName: 'L Eye', category: 'head' },
  { index: 3, name: 'Left Eye Outer', shortName: 'L Eye Out', category: 'head' },
  { index: 4, name: 'Right Eye Inner', shortName: 'R Eye In', category: 'head' },
  { index: 5, name: 'Right Eye', shortName: 'R Eye', category: 'head' },
  { index: 6, name: 'Right Eye Outer', shortName: 'R Eye Out', category: 'head' },
  { index: 7, name: 'Left Ear', shortName: 'L Ear', category: 'head' },
  { index: 8, name: 'Right Ear', shortName: 'R Ear', category: 'head' },
  { index: 9, name: 'Mouth Left', shortName: 'Mouth L', category: 'head' },
  { index: 10, name: 'Mouth Right', shortName: 'Mouth R', category: 'head' },
];

export const POSE_TORSO_LANDMARKS: LandmarkDefinition[] = [
  { index: 11, name: 'Left Shoulder', shortName: 'L Shoulder', category: 'torso' },
  { index: 12, name: 'Right Shoulder', shortName: 'R Shoulder', category: 'torso' },
  { index: 23, name: 'Left Hip', shortName: 'L Hip', category: 'torso' },
  { index: 24, name: 'Right Hip', shortName: 'R Hip', category: 'torso' },
];

export const POSE_ARM_LANDMARKS: LandmarkDefinition[] = [
  { index: 13, name: 'Left Elbow', shortName: 'L Elbow', category: 'arms' },
  { index: 14, name: 'Right Elbow', shortName: 'R Elbow', category: 'arms' },
  { index: 15, name: 'Left Wrist', shortName: 'L Wrist', category: 'arms' },
  { index: 16, name: 'Right Wrist', shortName: 'R Wrist', category: 'arms' },
  { index: 17, name: 'Left Pinky (Pose)', shortName: 'L Pinky', category: 'arms' },
  { index: 18, name: 'Right Pinky (Pose)', shortName: 'R Pinky', category: 'arms' },
  { index: 19, name: 'Left Index (Pose)', shortName: 'L Index', category: 'arms' },
  { index: 20, name: 'Right Index (Pose)', shortName: 'R Index', category: 'arms' },
  { index: 21, name: 'Left Thumb (Pose)', shortName: 'L Thumb', category: 'arms' },
  { index: 22, name: 'Right Thumb (Pose)', shortName: 'R Thumb', category: 'arms' },
];

export const POSE_LEG_LANDMARKS: LandmarkDefinition[] = [
  { index: 25, name: 'Left Knee', shortName: 'L Knee', category: 'legs' },
  { index: 26, name: 'Right Knee', shortName: 'R Knee', category: 'legs' },
  { index: 27, name: 'Left Ankle', shortName: 'L Ankle', category: 'legs' },
  { index: 28, name: 'Right Ankle', shortName: 'R Ankle', category: 'legs' },
  { index: 29, name: 'Left Heel', shortName: 'L Heel', category: 'legs' },
  { index: 30, name: 'Right Heel', shortName: 'R Heel', category: 'legs' },
  { index: 31, name: 'Left Foot Index', shortName: 'L Foot', category: 'legs' },
  { index: 32, name: 'Right Foot Index', shortName: 'R Foot', category: 'legs' },
];

export const ALL_POSE_LANDMARKS = [
  ...POSE_HEAD_LANDMARKS,
  ...POSE_TORSO_LANDMARKS,
  ...POSE_ARM_LANDMARKS,
  ...POSE_LEG_LANDMARKS,
];

// ============================================
// HAND LANDMARKS (21 per hand)
// ============================================

export const HAND_WRIST_LANDMARKS: LandmarkDefinition[] = [
  { index: 0, name: 'Wrist', shortName: 'Wrist', category: 'wrist' },
];

export const HAND_THUMB_LANDMARKS: LandmarkDefinition[] = [
  { index: 1, name: 'Thumb CMC', shortName: 'Th CMC', category: 'thumb' },
  { index: 2, name: 'Thumb MCP', shortName: 'Th MCP', category: 'thumb' },
  { index: 3, name: 'Thumb IP', shortName: 'Th IP', category: 'thumb' },
  { index: 4, name: 'Thumb Tip', shortName: 'Th Tip', category: 'thumb' },
];

export const HAND_INDEX_LANDMARKS: LandmarkDefinition[] = [
  { index: 5, name: 'Index MCP', shortName: 'Ix MCP', category: 'index' },
  { index: 6, name: 'Index PIP', shortName: 'Ix PIP', category: 'index' },
  { index: 7, name: 'Index DIP', shortName: 'Ix DIP', category: 'index' },
  { index: 8, name: 'Index Tip', shortName: 'Ix Tip', category: 'index' },
];

export const HAND_MIDDLE_LANDMARKS: LandmarkDefinition[] = [
  { index: 9, name: 'Middle MCP', shortName: 'Md MCP', category: 'middle' },
  { index: 10, name: 'Middle PIP', shortName: 'Md PIP', category: 'middle' },
  { index: 11, name: 'Middle DIP', shortName: 'Md DIP', category: 'middle' },
  { index: 12, name: 'Middle Tip', shortName: 'Md Tip', category: 'middle' },
];

export const HAND_RING_LANDMARKS: LandmarkDefinition[] = [
  { index: 13, name: 'Ring MCP', shortName: 'Rn MCP', category: 'ring' },
  { index: 14, name: 'Ring PIP', shortName: 'Rn PIP', category: 'ring' },
  { index: 15, name: 'Ring DIP', shortName: 'Rn DIP', category: 'ring' },
  { index: 16, name: 'Ring Tip', shortName: 'Rn Tip', category: 'ring' },
];

export const HAND_PINKY_LANDMARKS: LandmarkDefinition[] = [
  { index: 17, name: 'Pinky MCP', shortName: 'Pk MCP', category: 'pinky' },
  { index: 18, name: 'Pinky PIP', shortName: 'Pk PIP', category: 'pinky' },
  { index: 19, name: 'Pinky DIP', shortName: 'Pk DIP', category: 'pinky' },
  { index: 20, name: 'Pinky Tip', shortName: 'Pk Tip', category: 'pinky' },
];

export const ALL_HAND_LANDMARKS = [
  ...HAND_WRIST_LANDMARKS,
  ...HAND_THUMB_LANDMARKS,
  ...HAND_INDEX_LANDMARKS,
  ...HAND_MIDDLE_LANDMARKS,
  ...HAND_RING_LANDMARKS,
  ...HAND_PINKY_LANDMARKS,
];

// ============================================
// FACE LANDMARKS (key points from 478 total)
// ============================================

export const FACE_EYE_LANDMARKS: LandmarkDefinition[] = [
  { index: 133, name: 'Left Eye Inner', shortName: 'L Eye In', category: 'eyes' },
  { index: 33, name: 'Left Eye Outer', shortName: 'L Eye Out', category: 'eyes' },
  { index: 159, name: 'Left Eye Upper', shortName: 'L Eye Up', category: 'eyes' },
  { index: 145, name: 'Left Eye Lower', shortName: 'L Eye Dn', category: 'eyes' },
  { index: 468, name: 'Left Iris', shortName: 'L Iris', category: 'eyes' },
  { index: 362, name: 'Right Eye Inner', shortName: 'R Eye In', category: 'eyes' },
  { index: 263, name: 'Right Eye Outer', shortName: 'R Eye Out', category: 'eyes' },
  { index: 386, name: 'Right Eye Upper', shortName: 'R Eye Up', category: 'eyes' },
  { index: 374, name: 'Right Eye Lower', shortName: 'R Eye Dn', category: 'eyes' },
  { index: 473, name: 'Right Iris', shortName: 'R Iris', category: 'eyes' },
];

export const FACE_BROW_LANDMARKS: LandmarkDefinition[] = [
  { index: 107, name: 'Left Brow Inner', shortName: 'L Brow In', category: 'brows' },
  { index: 105, name: 'Left Brow Middle', shortName: 'L Brow Md', category: 'brows' },
  { index: 70, name: 'Left Brow Outer', shortName: 'L Brow Out', category: 'brows' },
  { index: 336, name: 'Right Brow Inner', shortName: 'R Brow In', category: 'brows' },
  { index: 334, name: 'Right Brow Middle', shortName: 'R Brow Md', category: 'brows' },
  { index: 300, name: 'Right Brow Outer', shortName: 'R Brow Out', category: 'brows' },
];

export const FACE_MOUTH_LANDMARKS: LandmarkDefinition[] = [
  { index: 13, name: 'Upper Lip Top', shortName: 'Upper Lip', category: 'mouth' },
  { index: 14, name: 'Lower Lip Bottom', shortName: 'Lower Lip', category: 'mouth' },
  { index: 61, name: 'Lips Left', shortName: 'Lips L', category: 'mouth' },
  { index: 291, name: 'Lips Right', shortName: 'Lips R', category: 'mouth' },
];

export const FACE_OTHER_LANDMARKS: LandmarkDefinition[] = [
  { index: 1, name: 'Nose Tip', shortName: 'Nose', category: 'other' },
  { index: 152, name: 'Chin', shortName: 'Chin', category: 'other' },
  { index: 10, name: 'Forehead', shortName: 'Forehead', category: 'other' },
  { index: 234, name: 'Left Cheek', shortName: 'L Cheek', category: 'other' },
  { index: 454, name: 'Right Cheek', shortName: 'R Cheek', category: 'other' },
];

export const ALL_FACE_LANDMARKS = [
  ...FACE_EYE_LANDMARKS,
  ...FACE_BROW_LANDMARKS,
  ...FACE_MOUTH_LANDMARKS,
  ...FACE_OTHER_LANDMARKS,
];

// ============================================
// GROUPED BY SOURCE FOR UI TABS
// ============================================

export interface LandmarkGroup {
  name: string;
  category: LandmarkCategory;
  landmarks: LandmarkDefinition[];
}

export const POSE_LANDMARK_GROUPS: LandmarkGroup[] = [
  { name: 'Head', category: 'head', landmarks: POSE_HEAD_LANDMARKS },
  { name: 'Torso', category: 'torso', landmarks: POSE_TORSO_LANDMARKS },
  { name: 'Arms', category: 'arms', landmarks: POSE_ARM_LANDMARKS },
  { name: 'Legs', category: 'legs', landmarks: POSE_LEG_LANDMARKS },
];

export const HAND_LANDMARK_GROUPS: LandmarkGroup[] = [
  { name: 'Wrist', category: 'wrist', landmarks: HAND_WRIST_LANDMARKS },
  { name: 'Thumb', category: 'thumb', landmarks: HAND_THUMB_LANDMARKS },
  { name: 'Index', category: 'index', landmarks: HAND_INDEX_LANDMARKS },
  { name: 'Middle', category: 'middle', landmarks: HAND_MIDDLE_LANDMARKS },
  { name: 'Ring', category: 'ring', landmarks: HAND_RING_LANDMARKS },
  { name: 'Pinky', category: 'pinky', landmarks: HAND_PINKY_LANDMARKS },
];

export const FACE_LANDMARK_GROUPS: LandmarkGroup[] = [
  { name: 'Eyes', category: 'eyes', landmarks: FACE_EYE_LANDMARKS },
  { name: 'Brows', category: 'brows', landmarks: FACE_BROW_LANDMARKS },
  { name: 'Mouth', category: 'mouth', landmarks: FACE_MOUTH_LANDMARKS },
  { name: 'Other', category: 'other', landmarks: FACE_OTHER_LANDMARKS },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getLandmarkDefinition(
  source: LandmarkSource,
  index: number
): LandmarkDefinition | undefined {
  switch (source) {
    case 'pose':
      return ALL_POSE_LANDMARKS.find(l => l.index === index);
    case 'leftHand':
    case 'rightHand':
      return ALL_HAND_LANDMARKS.find(l => l.index === index);
    case 'face':
      return ALL_FACE_LANDMARKS.find(l => l.index === index);
  }
}

export function getLandmarkGroups(source: LandmarkSource): LandmarkGroup[] {
  switch (source) {
    case 'pose':
      return POSE_LANDMARK_GROUPS;
    case 'leftHand':
    case 'rightHand':
      return HAND_LANDMARK_GROUPS;
    case 'face':
      return FACE_LANDMARK_GROUPS;
  }
}

export function getSourceDisplayName(source: LandmarkSource): string {
  switch (source) {
    case 'pose':
      return 'Body';
    case 'leftHand':
      return 'Left Hand';
    case 'rightHand':
      return 'Right Hand';
    case 'face':
      return 'Face';
  }
}
