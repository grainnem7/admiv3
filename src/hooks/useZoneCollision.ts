/**
 * Zone Collision Detection Hook
 *
 * Detects when specific body parts enter an instrument zone based on trigger configuration.
 * Supports body part filtering and finger-specific detection for hands.
 */

import { useCallback, useRef } from 'react';
import type { TrackingFrame } from '../state/types';
import type { InstrumentZone, ZoneTriggerConfig, FingerConfig } from '../state/instrumentZones';
import { DEFAULT_TRIGGER_CONFIG } from '../state/instrumentZones';

interface CollisionResult {
  /** IDs of zones that are currently active */
  activeZoneIds: Set<string>;
  /** Zones that were just triggered this frame */
  triggeredZones: InstrumentZone[];
}

// Hand landmark indices (MediaPipe hand model)
const HAND_LANDMARKS = {
  wrist: 0,
  // Thumb: CMC(1), MCP(2), IP(3), TIP(4)
  thumb: [1, 2, 3, 4],
  // Index: MCP(5), PIP(6), DIP(7), TIP(8)
  index: [5, 6, 7, 8],
  // Middle: MCP(9), PIP(10), DIP(11), TIP(12)
  middle: [9, 10, 11, 12],
  // Ring: MCP(13), PIP(14), DIP(15), TIP(16)
  ring: [13, 14, 15, 16],
  // Pinky: MCP(17), PIP(18), DIP(19), TIP(20)
  pinky: [17, 18, 19, 20],
};

// Pose landmark indices (MediaPipe pose model)
const POSE_LANDMARKS = {
  // Head landmarks
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  // Hand landmarks from pose (less precise than hand detector)
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  // Foot landmarks
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
};

// Get all pose positions (used for 'any' trigger)
function getAllBodyPositions(frame: TrackingFrame): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  // Add pose landmarks (key points only for performance)
  if (frame.pose?.landmarks) {
    const keyPoseLandmarks = [0, 11, 12, 13, 14, 15, 16, 27, 28, 29, 30, 31, 32];
    for (const idx of keyPoseLandmarks) {
      const lm = frame.pose.landmarks[idx];
      if (lm && lm.x !== undefined && lm.y !== undefined) {
        positions.push({ x: lm.x, y: lm.y });
      }
    }
  }

  // Add hand landmarks (fingertips and palm)
  if (frame.leftHand?.landmarks) {
    const keyHandLandmarks = [0, 4, 8, 12, 16, 20];
    for (const idx of keyHandLandmarks) {
      const lm = frame.leftHand.landmarks[idx];
      if (lm && lm.x !== undefined && lm.y !== undefined) {
        positions.push({ x: lm.x, y: lm.y });
      }
    }
  }

  if (frame.rightHand?.landmarks) {
    const keyHandLandmarks = [0, 4, 8, 12, 16, 20];
    for (const idx of keyHandLandmarks) {
      const lm = frame.rightHand.landmarks[idx];
      if (lm && lm.x !== undefined && lm.y !== undefined) {
        positions.push({ x: lm.x, y: lm.y });
      }
    }
  }

  // Add face landmark (nose tip) if available
  if (frame.face?.landmarks?.[1]) {
    const nose = frame.face.landmarks[1];
    if (nose.x !== undefined && nose.y !== undefined) {
      positions.push({ x: nose.x, y: nose.y });
    }
  }

  return positions;
}

// Get hand landmarks based on finger config
function getHandLandmarkIndices(fingers: FingerConfig): number[] {
  const indices: number[] = [HAND_LANDMARKS.wrist]; // Always include wrist

  if (fingers.thumb) indices.push(...HAND_LANDMARKS.thumb);
  if (fingers.index) indices.push(...HAND_LANDMARKS.index);
  if (fingers.middle) indices.push(...HAND_LANDMARKS.middle);
  if (fingers.ring) indices.push(...HAND_LANDMARKS.ring);
  if (fingers.pinky) indices.push(...HAND_LANDMARKS.pinky);

  return indices;
}

// Get positions for a specific hand from hand detector
function getHandPositions(
  handLandmarks: Array<{ x: number; y: number; z?: number }> | undefined,
  fingers: FingerConfig
): Array<{ x: number; y: number }> {
  if (!handLandmarks) return [];

  const positions: Array<{ x: number; y: number }> = [];
  const indices = getHandLandmarkIndices(fingers);

  for (const idx of indices) {
    const lm = handLandmarks[idx];
    if (lm && lm.x !== undefined && lm.y !== undefined) {
      positions.push({ x: lm.x, y: lm.y });
    }
  }

  // Also add pose hand points for more coverage
  return positions;
}

// Get positions for right hand (from user's perspective - their actual right hand)
// Note: HandDetector swaps so frame.leftHand = user's right hand (appears on left of mirrored video)
function getRightHandPositions(frame: TrackingFrame, fingers: FingerConfig): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  // From hand detector - user's right hand is stored in leftHand (after HandDetector's swap)
  if (frame.leftHand?.landmarks) {
    positions.push(...getHandPositions(frame.leftHand.landmarks, fingers));
  }

  // From pose as fallback only if hand detector didn't find this hand
  if (!frame.leftHand?.landmarks && frame.pose?.landmarks) {
    const poseHandPoints = [
      POSE_LANDMARKS.rightWrist,
      POSE_LANDMARKS.rightIndex,
      POSE_LANDMARKS.rightPinky,
      POSE_LANDMARKS.rightThumb,
    ];
    for (const idx of poseHandPoints) {
      const lm = frame.pose.landmarks[idx];
      if (lm && lm.x !== undefined && lm.y !== undefined) {
        positions.push({ x: lm.x, y: lm.y });
      }
    }
  }

  return positions;
}

// Get positions for left hand (from user's perspective - their actual left hand)
// Note: HandDetector swaps so frame.rightHand = user's left hand (appears on right of mirrored video)
function getLeftHandPositions(frame: TrackingFrame, fingers: FingerConfig): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  // From hand detector - user's left hand is stored in rightHand (after HandDetector's swap)
  if (frame.rightHand?.landmarks) {
    positions.push(...getHandPositions(frame.rightHand.landmarks, fingers));
  }

  // From pose as fallback only if hand detector didn't find this hand
  if (!frame.rightHand?.landmarks && frame.pose?.landmarks) {
    const poseHandPoints = [
      POSE_LANDMARKS.leftWrist,
      POSE_LANDMARKS.leftIndex,
      POSE_LANDMARKS.leftPinky,
      POSE_LANDMARKS.leftThumb,
    ];
    for (const idx of poseHandPoints) {
      const lm = frame.pose.landmarks[idx];
      if (lm && lm.x !== undefined && lm.y !== undefined) {
        positions.push({ x: lm.x, y: lm.y });
      }
    }
  }

  return positions;
}

// Get head positions (nose, eyes, ears, mouth from pose)
function getHeadPositions(frame: TrackingFrame): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  if (frame.pose?.landmarks) {
    const headLandmarks = [
      POSE_LANDMARKS.nose,
      POSE_LANDMARKS.leftEye,
      POSE_LANDMARKS.rightEye,
      POSE_LANDMARKS.leftEar,
      POSE_LANDMARKS.rightEar,
      POSE_LANDMARKS.mouthLeft,
      POSE_LANDMARKS.mouthRight,
    ];
    for (const idx of headLandmarks) {
      const lm = frame.pose.landmarks[idx];
      if (lm && lm.x !== undefined && lm.y !== undefined) {
        positions.push({ x: lm.x, y: lm.y });
      }
    }
  }

  // Also use face detector nose if available
  if (frame.face?.landmarks?.[1]) {
    const nose = frame.face.landmarks[1];
    if (nose.x !== undefined && nose.y !== undefined) {
      positions.push({ x: nose.x, y: nose.y });
    }
  }

  return positions;
}

// Get right foot positions (from user's perspective - their actual right foot)
function getRightFootPositions(frame: TrackingFrame): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  if (frame.pose?.landmarks) {
    const footLandmarks = [
      POSE_LANDMARKS.rightAnkle,
      POSE_LANDMARKS.rightHeel,
      POSE_LANDMARKS.rightFootIndex,
    ];
    for (const idx of footLandmarks) {
      const lm = frame.pose.landmarks[idx];
      if (lm && lm.x !== undefined && lm.y !== undefined) {
        positions.push({ x: lm.x, y: lm.y });
      }
    }
  }

  return positions;
}

// Get left foot positions (from user's perspective - their actual left foot)
function getLeftFootPositions(frame: TrackingFrame): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  if (frame.pose?.landmarks) {
    const footLandmarks = [
      POSE_LANDMARKS.leftAnkle,
      POSE_LANDMARKS.leftHeel,
      POSE_LANDMARKS.leftFootIndex,
    ];
    for (const idx of footLandmarks) {
      const lm = frame.pose.landmarks[idx];
      if (lm && lm.x !== undefined && lm.y !== undefined) {
        positions.push({ x: lm.x, y: lm.y });
      }
    }
  }

  return positions;
}

// Get positions based on trigger config
function getPositionsForTrigger(
  frame: TrackingFrame,
  config: ZoneTriggerConfig
): Array<{ x: number; y: number }> {
  switch (config.bodyPart) {
    case 'any':
      return getAllBodyPositions(frame);

    case 'rightHand':
      return getRightHandPositions(frame, config.fingers);

    case 'leftHand':
      return getLeftHandPositions(frame, config.fingers);

    case 'eitherHand':
      return [
        ...getRightHandPositions(frame, config.fingers),
        ...getLeftHandPositions(frame, config.fingers),
      ];

    case 'head':
      return getHeadPositions(frame);

    case 'rightFoot':
      return getRightFootPositions(frame);

    case 'leftFoot':
      return getLeftFootPositions(frame);

    default:
      return getAllBodyPositions(frame);
  }
}

// Check if any point is inside a circular zone
function isAnyPointInZone(
  points: Array<{ x: number; y: number }>,
  zone: InstrumentZone
): boolean {
  const radius = zone.size / 2;

  for (const point of points) {
    const dx = point.x - zone.x;
    const dy = point.y - zone.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < radius) {
      return true;
    }
  }
  return false;
}

// Debug counter to throttle logging
let debugCounter = 0;

export function useZoneCollision() {
  // Track last trigger times for cooldown
  const lastTriggerTimes = useRef<Map<string, number>>(new Map());

  const checkCollisions = useCallback(
    (frame: TrackingFrame | null, zones: InstrumentZone[]): CollisionResult => {
      const activeZoneIds = new Set<string>();
      const triggeredZones: InstrumentZone[] = [];

      // Debug: log when no frame or zones
      debugCounter++;
      if (debugCounter % 120 === 0) {
        console.log(`[ZoneCollision] frame=${!!frame}, zones=${zones.length}`);
      }

      if (!frame || zones.length === 0) {
        return { activeZoneIds, triggeredZones };
      }

      const now = Date.now();

      // Check each zone with its specific trigger config
      for (const zone of zones) {
        // Get trigger config (use default if not present for backwards compatibility)
        const triggerConfig = zone.triggerConfig || DEFAULT_TRIGGER_CONFIG;

        // Get body positions for this zone's trigger config
        const bodyPositions = getPositionsForTrigger(frame, triggerConfig);

        // Debug logging every 60 frames (~1 per second)
        if (debugCounter % 60 === 0 && zones.indexOf(zone) === 0) {
          console.log(`[ZoneCollision] Zone "${zone.type}" (${triggerConfig.bodyPart}): ${bodyPositions.length} positions`);
        }

        const isInZone = isAnyPointInZone(bodyPositions, zone);

        if (isInZone) {
          console.log(`[ZoneCollision] HIT! Zone "${zone.type}" at (${zone.x.toFixed(3)}, ${zone.y.toFixed(3)}) by ${triggerConfig.bodyPart}`);
          activeZoneIds.add(zone.id);

          // Check cooldown
          const lastTrigger = lastTriggerTimes.current.get(zone.id) || 0;
          if (now - lastTrigger > zone.cooldownMs) {
            triggeredZones.push(zone);
            lastTriggerTimes.current.set(zone.id, now);
          }
        }
      }

      return { activeZoneIds, triggeredZones };
    },
    []
  );

  return { checkCollisions };
}
