/**
 * Zone Collision Detection Hook
 *
 * Detects when specific body parts enter an instrument zone based on trigger configuration.
 * Supports body part filtering and finger-specific detection for hands.
 *
 * Reliability features:
 * - Enter/exit state machine: triggers only on ENTRY, not while staying inside
 * - Exit hysteresis: requires multiple frames outside before counting as "exited"
 * - Enlarged hitbox: collision radius is 1.3x the visual zone for tracking noise tolerance
 * - Swept collision: checks along the path between previous and current positions
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

/** Per-zone collision state for enter/exit tracking */
interface ZoneState {
  /** Whether body is currently considered "inside" the zone */
  inside: boolean;
  /** Number of consecutive frames the body has been outside while state is "inside" */
  framesOutside: number;
}

// How many consecutive "outside" frames before we consider the body truly exited
const EXIT_HYSTERESIS_FRAMES = 4;

// Hitbox multiplier — collision radius is this * visual radius for tracking noise tolerance
const HITBOX_MULTIPLIER = 1.4;

// Number of interpolation steps for swept collision detection
const SWEEP_STEPS = 3;

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

// Check if any point is inside a circular zone (with enlarged hitbox)
function isAnyPointInZone(
  points: Array<{ x: number; y: number }>,
  zone: InstrumentZone
): boolean {
  const radius = (zone.size / 2) * HITBOX_MULTIPLIER;
  const radiusSq = radius * radius;

  for (const point of points) {
    const dx = point.x - zone.x;
    const dy = point.y - zone.y;
    // Use squared distance to avoid sqrt (faster)
    if (dx * dx + dy * dy < radiusSq) {
      return true;
    }
  }
  return false;
}

// Check if any point (or interpolated path from previous position) hits a zone
function isAnyPointOrPathInZone(
  currentPoints: Array<{ x: number; y: number }>,
  previousPoints: Array<{ x: number; y: number }> | null,
  zone: InstrumentZone
): boolean {
  // First check current positions
  if (isAnyPointInZone(currentPoints, zone)) return true;

  // If we have previous positions, check interpolated points along the path
  // This prevents fast movements from "tunneling" through zones
  if (previousPoints && previousPoints.length > 0) {
    const radius = (zone.size / 2) * HITBOX_MULTIPLIER;
    const radiusSq = radius * radius;
    const numPrev = Math.min(previousPoints.length, currentPoints.length);

    for (let i = 0; i < numPrev; i++) {
      const prev = previousPoints[i];
      const curr = currentPoints[i];
      if (!prev || !curr) continue;

      // Check intermediate points along the path
      for (let step = 1; step <= SWEEP_STEPS; step++) {
        const t = step / (SWEEP_STEPS + 1);
        const interpX = prev.x + (curr.x - prev.x) * t;
        const interpY = prev.y + (curr.y - prev.y) * t;
        const dx = interpX - zone.x;
        const dy = interpY - zone.y;
        if (dx * dx + dy * dy < radiusSq) {
          return true;
        }
      }
    }
  }

  return false;
}

// Debug counter to throttle logging
let debugCounter = 0;

export function useZoneCollision() {
  // Per-zone enter/exit state for hysteresis
  const zoneStates = useRef<Map<string, ZoneState>>(new Map());
  // Previous frame positions per zone (for swept collision)
  const prevPositions = useRef<Map<string, Array<{ x: number; y: number }>>>(new Map());

  const checkCollisions = useCallback(
    (frame: TrackingFrame | null, zones: InstrumentZone[]): CollisionResult => {
      const activeZoneIds = new Set<string>();
      const triggeredZones: InstrumentZone[] = [];

      debugCounter++;

      if (!frame || zones.length === 0) {
        return { activeZoneIds, triggeredZones };
      }

      // Clean up states for removed zones
      const zoneIdSet = new Set(zones.map(z => z.id));
      for (const id of zoneStates.current.keys()) {
        if (!zoneIdSet.has(id)) {
          zoneStates.current.delete(id);
          prevPositions.current.delete(id);
        }
      }

      for (const zone of zones) {
        const triggerConfig = zone.triggerConfig || DEFAULT_TRIGGER_CONFIG;
        const bodyPositions = getPositionsForTrigger(frame, triggerConfig);

        // Debug logging every 120 frames (~2 per second at 60fps)
        if (debugCounter % 120 === 0 && zones.indexOf(zone) === 0) {
          const state = zoneStates.current.get(zone.id);
          console.log(`[ZoneCollision] Zone "${zone.type}" (${triggerConfig.bodyPart}): ${bodyPositions.length} pts, inside=${state?.inside ?? false}`);
        }

        // Get previous positions for swept collision
        const prevPos = prevPositions.current.get(zone.id) || null;

        // Check collision with enlarged hitbox + swept path
        const rawHit = isAnyPointOrPathInZone(bodyPositions, prevPos, zone);

        // Store current positions for next frame's sweep check
        prevPositions.current.set(zone.id, bodyPositions);

        // Get or create zone state
        let state = zoneStates.current.get(zone.id);
        if (!state) {
          state = { inside: false, framesOutside: 0 };
          zoneStates.current.set(zone.id, state);
        }

        if (rawHit) {
          // Body is in (or passing through) the zone
          state.framesOutside = 0;

          if (!state.inside) {
            // ENTRY: transition from outside → inside → trigger!
            state.inside = true;
            triggeredZones.push(zone);
            console.log(`[ZoneCollision] ENTER! Zone "${zone.type}" triggered by ${triggerConfig.bodyPart}`);
          }

          activeZoneIds.add(zone.id);
        } else {
          // Body is not in the zone this frame
          if (state.inside) {
            state.framesOutside++;

            if (state.framesOutside >= EXIT_HYSTERESIS_FRAMES) {
              // Confirmed exit after sustained absence
              state.inside = false;
              state.framesOutside = 0;
            } else {
              // Still within grace period — keep zone "active" visually
              activeZoneIds.add(zone.id);
            }
          }
        }
      }

      return { activeZoneIds, triggeredZones };
    },
    []
  );

  return { checkCollisions };
}
