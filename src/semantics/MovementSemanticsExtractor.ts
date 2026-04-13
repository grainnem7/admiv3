/**
 * Movement Semantics Extractor
 *
 * Extracts high-dimensional kinematic features from raw tracking data.
 * Computes velocity, acceleration, jerk, curvature, torsion, and other
 * movement descriptors for each tracked joint.
 *
 * Inspired by:
 * - Biomechanical analysis techniques
 * - Laban Movement Analysis computational implementations
 * - DMI research on expressive movement mapping
 */

import type { TrackingFrame, FaceLandmarks } from '../state/types';
import type {
  Vector3,
  Vector3WithMagnitude,
  JointKinematics,
  JointHistory,
  BodyConfiguration,
  PostureArchetype,
  FacialExpression,
  GazeData,
  MovementSemanticsFrame,
  MovementQualities,
  LabanEffort,
} from './types';

// ============================================
// Constants
// ============================================

/** Number of frames to keep in history for derivative calculation */
const HISTORY_LENGTH = 10;

/** Maximum age of history entries (ms) */
const MAX_HISTORY_AGE_MS = 500;

/** Minimum frames needed for velocity calculation */
const MIN_FRAMES_VELOCITY = 2;

/** Minimum frames needed for acceleration calculation */
const MIN_FRAMES_ACCELERATION = 3;

/** Minimum frames needed for jerk calculation */
const MIN_FRAMES_JERK = 4;

/** Pose landmark indices (MediaPipe BlazePose) */
const POSE_LANDMARKS = {
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
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
};

/** Hand landmark indices (MediaPipe Hands) */
const HAND_LANDMARKS = {
  wrist: 0,
  thumbCmc: 1,
  thumbMcp: 2,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexPip: 6,
  indexDip: 7,
  indexTip: 8,
  middleMcp: 9,
  middlePip: 10,
  middleDip: 11,
  middleTip: 12,
  ringMcp: 13,
  ringPip: 14,
  ringDip: 15,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyPip: 18,
  pinkyDip: 19,
  pinkyTip: 20,
};

// ============================================
// Utility Functions
// ============================================

function createZeroVector(): Vector3 {
  return { x: 0, y: 0, z: 0 };
}

function createZeroVectorWithMag(): Vector3WithMagnitude {
  return { x: 0, y: 0, z: 0, magnitude: 0 };
}

function vectorMagnitude(v: Vector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vectorSubtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vectorAdd(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vectorScale(v: Vector3, s: number): Vector3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vectorDot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vectorCross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vectorNormalize(v: Vector3): Vector3 {
  const mag = vectorMagnitude(v);
  if (mag < 0.0001) return createZeroVector();
  return vectorScale(v, 1 / mag);
}

function vectorDistance(a: Vector3, b: Vector3): number {
  return vectorMagnitude(vectorSubtract(a, b));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ============================================
// MovementSemanticsExtractor Class
// ============================================

export class MovementSemanticsExtractor {
  /** Position history for each tracked joint */
  private jointHistories: Map<string, JointHistory> = new Map();

  /** Last computed kinematics for each joint */
  private lastKinematics: Map<string, JointKinematics> = new Map();

  /** Last complete frame for reference */
  private lastFrame: MovementSemanticsFrame | null = null;

  /** Smoothing factor for derived quantities */
  private smoothingFactor: number = 0.3;

  /** Reference positions for body configuration (calibrated rest pose) */
  private restPose: Map<string, Vector3> | null = null;

  constructor() {
    this.reset();
  }

  /**
   * Set smoothing factor for temporal filtering
   */
  setSmoothingFactor(factor: number): void {
    this.smoothingFactor = clamp(factor, 0, 1);
  }

  /**
   * Calibrate rest pose from current tracking frame
   */
  calibrateRestPose(frame: TrackingFrame): void {
    this.restPose = new Map();

    if (frame.pose?.landmarks) {
      for (const [name, index] of Object.entries(POSE_LANDMARKS)) {
        const lm = frame.pose.landmarks[index];
        if (lm) {
          this.restPose.set(`pose_${name}`, { x: lm.x, y: lm.y, z: lm.z });
        }
      }
    }

    // Store hand rest positions if available
    if (frame.leftHand?.landmarks) {
      for (const [name, index] of Object.entries(HAND_LANDMARKS)) {
        const lm = frame.leftHand.landmarks[index];
        if (lm) {
          this.restPose.set(`leftHand_${name}`, { x: lm.x, y: lm.y, z: lm.z });
        }
      }
    }

    if (frame.rightHand?.landmarks) {
      for (const [name, index] of Object.entries(HAND_LANDMARKS)) {
        const lm = frame.rightHand.landmarks[index];
        if (lm) {
          this.restPose.set(`rightHand_${name}`, { x: lm.x, y: lm.y, z: lm.z });
        }
      }
    }
  }

  /**
   * Main extraction method - process a tracking frame into semantic features
   */
  extract(frame: TrackingFrame): MovementSemanticsFrame {
    const timestamp = frame.timestamp;

    // Extract kinematics for all joints
    const joints = this.extractAllJointKinematics(frame);

    // Extract body configuration
    const bodyConfig = this.extractBodyConfiguration(frame, joints);

    // Determine posture archetype
    const postureArchetype = this.classifyPosture(bodyConfig);

    // Extract facial expression
    const face = this.extractFacialExpression(frame.face);

    // Extract gaze data
    const gaze = this.extractGazeData(frame.face);

    // Compute abstract movement qualities
    const qualities = this.computeMovementQualities(joints, bodyConfig);

    // Build the complete frame
    const semanticFrame: MovementSemanticsFrame = {
      timestamp,
      joints,
      bodyConfig,
      postureArchetype,
      face,
      gaze,
      qualities,
      activeModalities: {
        pose: frame.pose !== null,
        leftHand: frame.leftHand !== null,
        rightHand: frame.rightHand !== null,
        face: frame.face !== null,
        color: frame.color !== null,
      },
      confidence: this.computeOverallConfidence(frame),
    };

    this.lastFrame = semanticFrame;
    return semanticFrame;
  }

  /**
   * Extract kinematics for all tracked joints
   */
  private extractAllJointKinematics(frame: TrackingFrame): Map<string, JointKinematics> {
    const result = new Map<string, JointKinematics>();
    const timestamp = frame.timestamp;

    // Process pose landmarks
    if (frame.pose?.landmarks) {
      for (const [name, index] of Object.entries(POSE_LANDMARKS)) {
        const lm = frame.pose.landmarks[index];
        if (lm && (lm.visibility ?? 1) > 0.5) {
          const jointId = `pose_${name}`;
          const position: Vector3 = { x: lm.x, y: lm.y, z: lm.z };
          const kinematics = this.computeJointKinematics(
            jointId,
            position,
            timestamp,
            lm.visibility ?? 1
          );
          result.set(jointId, kinematics);
        }
      }
    }

    // Process left hand landmarks
    if (frame.leftHand?.landmarks) {
      for (const [name, index] of Object.entries(HAND_LANDMARKS)) {
        const lm = frame.leftHand.landmarks[index];
        if (lm) {
          const jointId = `leftHand_${name}`;
          const position: Vector3 = { x: lm.x, y: lm.y, z: lm.z };
          const kinematics = this.computeJointKinematics(
            jointId,
            position,
            timestamp,
            frame.leftHand.confidence
          );
          result.set(jointId, kinematics);
        }
      }
    }

    // Process right hand landmarks
    if (frame.rightHand?.landmarks) {
      for (const [name, index] of Object.entries(HAND_LANDMARKS)) {
        const lm = frame.rightHand.landmarks[index];
        if (lm) {
          const jointId = `rightHand_${name}`;
          const position: Vector3 = { x: lm.x, y: lm.y, z: lm.z };
          const kinematics = this.computeJointKinematics(
            jointId,
            position,
            timestamp,
            frame.rightHand.confidence
          );
          result.set(jointId, kinematics);
        }
      }
    }

    return result;
  }

  /**
   * Compute full kinematics for a single joint
   */
  private computeJointKinematics(
    jointId: string,
    position: Vector3,
    timestamp: number,
    confidence: number
  ): JointKinematics {
    // Get or create history
    let history = this.jointHistories.get(jointId);
    if (!history) {
      history = {
        positions: [],
        maxLength: HISTORY_LENGTH,
        currentIndex: 0,
      };
      this.jointHistories.set(jointId, history);
    }

    // Add current position to history
    history.positions.push({ position, timestamp });

    // Clean old entries
    const cutoffTime = timestamp - MAX_HISTORY_AGE_MS;
    history.positions = history.positions.filter((p) => p.timestamp >= cutoffTime);

    // Keep history bounded
    while (history.positions.length > HISTORY_LENGTH) {
      history.positions.shift();
    }

    // Compute derivatives
    const velocity = this.computeVelocity(history);
    const acceleration = this.computeAcceleration(history);
    const jerk = this.computeJerk(history);
    const curvature = this.computeCurvature(history);
    const torsion = this.computeTorsion(history);

    // Apply smoothing with previous values
    const lastKin = this.lastKinematics.get(jointId);
    const smoothedVelocity = lastKin
      ? this.smoothVector(velocity, lastKin.velocity, this.smoothingFactor)
      : velocity;
    const smoothedAcceleration = lastKin
      ? this.smoothVector(acceleration, lastKin.acceleration, this.smoothingFactor)
      : acceleration;

    const kinematics: JointKinematics = {
      jointId,
      position,
      velocity: smoothedVelocity,
      acceleration: smoothedAcceleration,
      jerk,
      curvature,
      torsion,
      confidence,
      timestamp,
    };

    this.lastKinematics.set(jointId, kinematics);
    return kinematics;
  }

  /**
   * Compute velocity from position history
   */
  private computeVelocity(history: JointHistory): Vector3WithMagnitude {
    const n = history.positions.length;
    if (n < MIN_FRAMES_VELOCITY) {
      return createZeroVectorWithMag();
    }

    const current = history.positions[n - 1];
    const previous = history.positions[n - 2];
    const dt = (current.timestamp - previous.timestamp) / 1000;

    if (dt <= 0) return createZeroVectorWithMag();

    const velocity = vectorScale(vectorSubtract(current.position, previous.position), 1 / dt);
    return { ...velocity, magnitude: vectorMagnitude(velocity) };
  }

  /**
   * Compute acceleration from position history (second derivative)
   */
  private computeAcceleration(history: JointHistory): Vector3WithMagnitude {
    const n = history.positions.length;
    if (n < MIN_FRAMES_ACCELERATION) {
      return createZeroVectorWithMag();
    }

    const p0 = history.positions[n - 3];
    const p1 = history.positions[n - 2];
    const p2 = history.positions[n - 1];

    const dt1 = (p1.timestamp - p0.timestamp) / 1000;
    const dt2 = (p2.timestamp - p1.timestamp) / 1000;
    const dtAvg = (dt1 + dt2) / 2;

    if (dtAvg <= 0) return createZeroVectorWithMag();

    const v1 = vectorScale(vectorSubtract(p1.position, p0.position), 1 / dt1);
    const v2 = vectorScale(vectorSubtract(p2.position, p1.position), 1 / dt2);
    const acceleration = vectorScale(vectorSubtract(v2, v1), 1 / dtAvg);

    return { ...acceleration, magnitude: vectorMagnitude(acceleration) };
  }

  /**
   * Compute jerk from position history (third derivative)
   */
  private computeJerk(history: JointHistory): Vector3WithMagnitude {
    const n = history.positions.length;
    if (n < MIN_FRAMES_JERK) {
      return createZeroVectorWithMag();
    }

    const p0 = history.positions[n - 4];
    const p1 = history.positions[n - 3];
    const p2 = history.positions[n - 2];
    const p3 = history.positions[n - 1];

    const dt1 = (p1.timestamp - p0.timestamp) / 1000;
    const dt2 = (p2.timestamp - p1.timestamp) / 1000;
    const dt3 = (p3.timestamp - p2.timestamp) / 1000;
    const dtAvg = (dt1 + dt2 + dt3) / 3;

    if (dtAvg <= 0) return createZeroVectorWithMag();

    // Compute velocities
    const v1 = vectorScale(vectorSubtract(p1.position, p0.position), 1 / dt1);
    const v2 = vectorScale(vectorSubtract(p2.position, p1.position), 1 / dt2);
    const v3 = vectorScale(vectorSubtract(p3.position, p2.position), 1 / dt3);

    // Compute accelerations
    const a1 = vectorScale(vectorSubtract(v2, v1), 2 / (dt1 + dt2));
    const a2 = vectorScale(vectorSubtract(v3, v2), 2 / (dt2 + dt3));

    // Compute jerk
    const jerk = vectorScale(vectorSubtract(a2, a1), 1 / dtAvg);

    return { ...jerk, magnitude: vectorMagnitude(jerk) };
  }

  /**
   * Compute curvature of trajectory
   * κ = |v × a| / |v|³
   */
  private computeCurvature(history: JointHistory): number {
    const n = history.positions.length;
    if (n < MIN_FRAMES_ACCELERATION) return 0;

    const velocity = this.computeVelocity(history);
    const acceleration = this.computeAcceleration(history);

    const vMag = velocity.magnitude;
    if (vMag < 0.0001) return 0;

    const crossProduct = vectorCross(velocity, acceleration);
    const crossMag = vectorMagnitude(crossProduct);

    return crossMag / (vMag * vMag * vMag);
  }

  /**
   * Compute torsion of trajectory (3D twist)
   * τ = (v × a) · j / |v × a|²
   */
  private computeTorsion(history: JointHistory): number {
    const n = history.positions.length;
    if (n < MIN_FRAMES_JERK) return 0;

    const velocity = this.computeVelocity(history);
    const acceleration = this.computeAcceleration(history);
    const jerk = this.computeJerk(history);

    const cross = vectorCross(velocity, acceleration);
    const crossMagSq = vectorDot(cross, cross);

    if (crossMagSq < 0.0001) return 0;

    return vectorDot(cross, jerk) / crossMagSq;
  }

  /**
   * Smooth a vector with previous value using exponential smoothing
   */
  private smoothVector(
    current: Vector3WithMagnitude,
    previous: Vector3WithMagnitude,
    alpha: number
  ): Vector3WithMagnitude {
    return {
      x: lerp(previous.x, current.x, alpha),
      y: lerp(previous.y, current.y, alpha),
      z: lerp(previous.z, current.z, alpha),
      magnitude: lerp(previous.magnitude, current.magnitude, alpha),
    };
  }

  /**
   * Extract body configuration from joints
   */
  private extractBodyConfiguration(
    frame: TrackingFrame,
    joints: Map<string, JointKinematics>
  ): BodyConfiguration {
    const getJointPos = (id: string): Vector3 | null => {
      return joints.get(id)?.position ?? null;
    };

    // Get key positions
    const leftWrist = getJointPos('pose_leftWrist');
    const rightWrist = getJointPos('pose_rightWrist');
    const leftElbow = getJointPos('pose_leftElbow');
    const rightElbow = getJointPos('pose_rightElbow');
    const leftShoulder = getJointPos('pose_leftShoulder');
    const rightShoulder = getJointPos('pose_rightShoulder');
    const leftHip = getJointPos('pose_leftHip');
    const rightHip = getJointPos('pose_rightHip');
    const nose = getJointPos('pose_nose');

    // Compute hand spread (normalized by shoulder width)
    let handSpread = 0;
    let shoulderWidth = 0.3; // Default
    if (leftShoulder && rightShoulder) {
      shoulderWidth = vectorDistance(leftShoulder, rightShoulder);
    }
    if (leftWrist && rightWrist) {
      handSpread = vectorDistance(leftWrist, rightWrist) / (shoulderWidth * 2);
    }

    // Compute elbow spread
    let elbowSpread = 0;
    if (leftElbow && rightElbow) {
      elbowSpread = vectorDistance(leftElbow, rightElbow) / (shoulderWidth * 2);
    }

    // Shoulder expansion (current vs rest)
    let shoulderExpansion = 1;
    if (this.restPose) {
      const restLeft = this.restPose.get('pose_leftShoulder');
      const restRight = this.restPose.get('pose_rightShoulder');
      if (restLeft && restRight && leftShoulder && rightShoulder) {
        const restWidth = vectorDistance(restLeft, restRight);
        shoulderExpansion = shoulderWidth / restWidth;
      }
    }

    // Hand elevation relative to shoulders
    let leftHandElevation = 0.5;
    let rightHandElevation = 0.5;
    if (leftWrist && leftShoulder) {
      leftHandElevation = clamp(0.5 + (leftShoulder.y - leftWrist.y), 0, 1);
    }
    if (rightWrist && rightShoulder) {
      rightHandElevation = clamp(0.5 + (rightShoulder.y - rightWrist.y), 0, 1);
    }

    // Torso lean (using shoulder-hip relationship)
    let torsoPitch = 0;
    let torsoRoll = 0;
    let torsoYaw = 0;
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
      const shoulderCenter = vectorScale(vectorAdd(leftShoulder, rightShoulder), 0.5);
      const hipCenter = vectorScale(vectorAdd(leftHip, rightHip), 0.5);
      const torsoVector = vectorSubtract(shoulderCenter, hipCenter);

      torsoPitch = Math.atan2(torsoVector.z, torsoVector.y);
      torsoRoll = Math.atan2(torsoVector.x, torsoVector.y);

      // Yaw from shoulder rotation relative to hips
      const shoulderDir = vectorSubtract(rightShoulder, leftShoulder);
      const hipDir = vectorSubtract(rightHip, leftHip);
      torsoYaw = Math.atan2(shoulderDir.z, shoulderDir.x) - Math.atan2(hipDir.z, hipDir.x);
    }

    // Bilateral symmetry
    const symmetry = this.computeBilateralSymmetry(joints);

    // Overall expansion level
    const expansionLevel = clamp((handSpread + elbowSpread + shoulderExpansion) / 3, 0, 1);

    // Spinal twist (torso yaw)
    const spinalTwist = torsoYaw;

    // Head orientation
    let headPitch = 0;
    let headRoll = 0;
    let headYaw = 0;
    if (nose && leftShoulder && rightShoulder) {
      const shoulderCenter = vectorScale(vectorAdd(leftShoulder, rightShoulder), 0.5);
      const headVector = vectorSubtract(nose, shoulderCenter);
      headPitch = Math.atan2(-headVector.z, -headVector.y);
      headRoll = Math.atan2(headVector.x, -headVector.y);
    }
    // Use face transform matrix if available for more accurate head pose
    if (frame.face?.transformMatrix && frame.face.transformMatrix.length >= 16) {
      const m = frame.face.transformMatrix;
      // Extract Euler angles from rotation matrix
      headYaw = Math.atan2(m[1], m[0]);
      headPitch = Math.atan2(-m[2], Math.sqrt(m[6] * m[6] + m[10] * m[10]));
      headRoll = Math.atan2(m[6], m[10]);
    }

    return {
      handSpread,
      elbowSpread,
      shoulderExpansion,
      handElevation: { left: leftHandElevation, right: rightHandElevation },
      torsoLean: { pitch: torsoPitch, roll: torsoRoll, yaw: torsoYaw },
      bilateralSymmetry: symmetry,
      expansionLevel,
      spinalTwist,
      headOrientation: { pitch: headPitch, roll: headRoll, yaw: headYaw },
    };
  }

  /**
   * Compute bilateral symmetry score
   */
  private computeBilateralSymmetry(joints: Map<string, JointKinematics>): number {
    const pairs = [
      ['pose_leftWrist', 'pose_rightWrist'],
      ['pose_leftElbow', 'pose_rightElbow'],
      ['pose_leftShoulder', 'pose_rightShoulder'],
      ['pose_leftHip', 'pose_rightHip'],
    ];

    let totalDiff = 0;
    let validPairs = 0;

    for (const [leftId, rightId] of pairs) {
      const left = joints.get(leftId);
      const right = joints.get(rightId);

      if (left && right) {
        // Mirror right side for comparison
        const mirroredRight: Vector3 = {
          x: 1 - right.position.x,
          y: right.position.y,
          z: right.position.z,
        };
        const diff = vectorDistance(left.position, mirroredRight);
        totalDiff += diff;
        validPairs++;
      }
    }

    if (validPairs === 0) return 0.5;

    const avgDiff = totalDiff / validPairs;
    // Map difference to symmetry score (0 diff = 1 symmetry)
    return Math.exp(-avgDiff * 10);
  }

  /**
   * Classify current posture into archetype
   */
  private classifyPosture(config: BodyConfiguration): PostureArchetype {
    const { expansionLevel, torsoLean, handElevation, spinalTwist, bilateralSymmetry } = config;

    // High expansion = open
    if (expansionLevel > 0.7) {
      return 'open';
    }

    // Low expansion = closed
    if (expansionLevel < 0.3) {
      return 'closed';
    }

    // Significant forward lean = reaching
    if (torsoLean.pitch > 0.3) {
      return 'reaching';
    }

    // Backward lean = gathering
    if (torsoLean.pitch < -0.3) {
      return 'gathering';
    }

    // High hands = ascending
    if (handElevation.left > 0.7 && handElevation.right > 0.7) {
      return 'ascending';
    }

    // Low hands = descending
    if (handElevation.left < 0.3 && handElevation.right < 0.3) {
      return 'descending';
    }

    // Significant twist
    if (Math.abs(spinalTwist) > 0.4) {
      return 'twisting';
    }

    // Side tilt
    if (Math.abs(torsoLean.roll) > 0.3) {
      return 'tilting';
    }

    // High symmetry and centered = grounded
    if (bilateralSymmetry > 0.8 && Math.abs(torsoLean.pitch) < 0.1) {
      return 'grounded';
    }

    return 'neutral';
  }

  /**
   * Extract facial expression metrics from face landmarks
   */
  private extractFacialExpression(face: FaceLandmarks | null): FacialExpression {
    const defaultExpression: FacialExpression = {
      smileIntensity: 0,
      smileCurvature: 0,
      mouthOpenness: 0,
      mouthWidth: 0,
      leftBrowHeight: 0.5,
      rightBrowHeight: 0.5,
      browRaise: 0,
      browFurrow: 0,
      leftEyeOpen: 1,
      rightEyeOpen: 1,
      eyeSquint: 0,
      noseWrinkle: 0,
      cheekPuff: 0,
      jawClench: 0,
    };

    if (!face) return defaultExpression;

    // Use blendshapes if available (much more accurate)
    if (face.blendshapes && face.blendshapes.length > 0) {
      const getBlendshape = (name: string): number => {
        const bs = face.blendshapes.find((b) => b.categoryName === name);
        return bs?.score ?? 0;
      };

      return {
        smileIntensity: (getBlendshape('mouthSmileLeft') + getBlendshape('mouthSmileRight')) / 2,
        smileCurvature: getBlendshape('mouthSmileRight') - getBlendshape('mouthSmileLeft'),
        mouthOpenness: getBlendshape('jawOpen'),
        mouthWidth:
          (getBlendshape('mouthStretchLeft') + getBlendshape('mouthStretchRight')) / 2,
        leftBrowHeight: 1 - getBlendshape('browDownLeft') + getBlendshape('browOuterUpLeft') * 0.5,
        rightBrowHeight:
          1 - getBlendshape('browDownRight') + getBlendshape('browOuterUpRight') * 0.5,
        browRaise:
          (getBlendshape('browInnerUp') +
            getBlendshape('browOuterUpLeft') +
            getBlendshape('browOuterUpRight')) /
          3,
        browFurrow: (getBlendshape('browDownLeft') + getBlendshape('browDownRight')) / 2,
        leftEyeOpen: 1 - getBlendshape('eyeBlinkLeft'),
        rightEyeOpen: 1 - getBlendshape('eyeBlinkRight'),
        eyeSquint: (getBlendshape('eyeSquintLeft') + getBlendshape('eyeSquintRight')) / 2,
        noseWrinkle: getBlendshape('noseSneerLeft') + getBlendshape('noseSneerRight'),
        cheekPuff: getBlendshape('cheekPuff'),
        jawClench: getBlendshape('jawForward') * 0.5, // Approximation
      };
    }

    // Fallback to landmark-based estimation
    if (face.landmarks && face.landmarks.length >= 468) {
      // Simplified estimation from landmarks
      // These are approximate indices for key facial features
      const upperLip = face.landmarks[13];
      const lowerLip = face.landmarks[14];
      const mouthLeft = face.landmarks[61];
      const mouthRight = face.landmarks[291];

      if (upperLip && lowerLip && mouthLeft && mouthRight) {
        const mouthHeight = Math.abs(upperLip.y - lowerLip.y);
        const mouthWidthVal = Math.abs(mouthLeft.x - mouthRight.x);

        return {
          ...defaultExpression,
          mouthOpenness: clamp(mouthHeight * 10, 0, 1),
          mouthWidth: clamp(mouthWidthVal * 3, 0, 1),
        };
      }
    }

    return defaultExpression;
  }

  /**
   * Extract gaze data from face tracking
   */
  private extractGazeData(face: FaceLandmarks | null): GazeData {
    const defaultGaze: GazeData = {
      direction: { x: 0, y: 0, z: -1 },
      target: { x: 0.5, y: 0.5, z: 0 },
      targetBodyPart: null,
      isFixated: false,
      fixationDuration: 0,
      pupilDilation: 0.5,
      confidence: 0,
    };

    if (!face || !face.landmarks || face.landmarks.length < 468) {
      return defaultGaze;
    }

    // Approximate gaze from eye landmarks
    // Eye center landmarks (approximated)
    const leftEyeCenter = face.landmarks[468] ?? face.landmarks[159];
    const rightEyeCenter = face.landmarks[473] ?? face.landmarks[386];
    const leftIris = face.landmarks[468];
    const rightIris = face.landmarks[473];

    if (!leftEyeCenter || !rightEyeCenter) {
      return defaultGaze;
    }

    // Estimate gaze direction from iris position relative to eye center
    let gazeX = 0;
    let gazeY = 0;

    if (leftIris && rightIris) {
      // Average iris offset from eye center
      const leftOffset = {
        x: leftIris.x - leftEyeCenter.x,
        y: leftIris.y - leftEyeCenter.y,
      };
      const rightOffset = {
        x: rightIris.x - rightEyeCenter.x,
        y: rightIris.y - rightEyeCenter.y,
      };

      gazeX = (leftOffset.x + rightOffset.x) / 2;
      gazeY = (leftOffset.y + rightOffset.y) / 2;
    }

    // Normalize and create gaze vector
    const gazeMag = Math.sqrt(gazeX * gazeX + gazeY * gazeY + 1);
    const direction: Vector3 = {
      x: gazeX / gazeMag,
      y: gazeY / gazeMag,
      z: -1 / gazeMag,
    };

    // Estimate target position
    const target: Vector3 = {
      x: 0.5 + gazeX * 2,
      y: 0.5 + gazeY * 2,
      z: 0,
    };

    // TODO: Implement fixation detection based on gaze stability over time
    // For now, return basic gaze data
    return {
      direction,
      target,
      targetBodyPart: null, // Would need to check intersection with body landmarks
      isFixated: false,
      fixationDuration: 0,
      pupilDilation: 0.5,
      confidence: 0.6,
    };
  }

  /**
   * Compute abstract movement qualities from kinematics
   */
  private computeMovementQualities(
    joints: Map<string, JointKinematics>,
    bodyConfig: BodyConfiguration
  ): MovementQualities {
    // Aggregate kinematic features
    let totalVelocity = 0;
    let totalAcceleration = 0;
    let totalJerk = 0;
    let totalCurvature = 0;
    let jointCount = 0;

    let primaryDirection: Vector3 = { x: 0, y: 0, z: 0 };
    let angularMomentum: Vector3 = { x: 0, y: 0, z: 0 };

    for (const kinematics of joints.values()) {
      totalVelocity += kinematics.velocity.magnitude;
      totalAcceleration += kinematics.acceleration.magnitude;
      totalJerk += kinematics.jerk.magnitude;
      totalCurvature += kinematics.curvature;
      jointCount++;

      // Accumulate direction
      primaryDirection = vectorAdd(
        primaryDirection,
        vectorScale(vectorNormalize(kinematics.velocity), kinematics.velocity.magnitude)
      );
    }

    if (jointCount > 0) {
      totalVelocity /= jointCount;
      totalAcceleration /= jointCount;
      totalJerk /= jointCount;
      totalCurvature /= jointCount;
      primaryDirection = vectorNormalize(primaryDirection);
    }

    // Compute Laban effort qualities
    const effort = this.computeLabanEffort(
      totalVelocity,
      totalAcceleration,
      totalJerk,
      totalCurvature
    );

    // Energy: overall movement intensity
    const energy = clamp(totalVelocity * 2 + totalAcceleration * 0.5, 0, 1);

    // Fluidity: inverse of jerk (smooth = low jerk)
    const fluidity = clamp(1 - totalJerk * 0.1, 0, 1);

    // Tension: derived from body configuration and acceleration
    const tension = clamp(
      (1 - bodyConfig.expansionLevel) * 0.5 + totalAcceleration * 0.3,
      0,
      1
    );

    // Impulse: peak acceleration (attack quality)
    const impulse = clamp(totalAcceleration * 0.5, 0, 1);

    // Recovery: inverse of impulse with smoothing
    const recovery = clamp(1 - impulse, 0, 1);

    // Complexity: based on curvature and multi-joint coordination
    const complexity = clamp(totalCurvature * 0.5 + (1 - bodyConfig.bilateralSymmetry) * 0.5, 0, 1);

    // Rhythmicity: would need longer history to detect periodicity
    // For now, estimate from velocity stability
    const rhythmicity = 0.5;

    return {
      effort,
      energy,
      fluidity,
      tension,
      impulse,
      recovery,
      directionality: primaryDirection,
      angularMomentum,
      complexity,
      rhythmicity,
    };
  }

  /**
   * Compute Laban Effort qualities
   */
  private computeLabanEffort(
    velocity: number,
    acceleration: number,
    jerk: number,
    curvature: number
  ): LabanEffort {
    // Weight: Strong (high acceleration) vs Light (low acceleration)
    const weight = clamp(acceleration * 2, 0, 1);

    // Time: Quick (high jerk) vs Sustained (low jerk)
    const time = clamp(jerk * 0.1, 0, 1);

    // Space: Direct (low curvature) vs Indirect (high curvature)
    const space = clamp(1 - curvature * 2, 0, 1);

    // Flow: Free (high velocity, low jerk) vs Bound (low velocity, high jerk)
    const flowFree = velocity / (1 + jerk * 0.5);
    const flow = clamp(flowFree * 2, 0, 1);

    return { weight, time, space, flow };
  }

  /**
   * Compute overall frame confidence
   */
  private computeOverallConfidence(frame: TrackingFrame): number {
    let totalConfidence = 0;
    let count = 0;

    if (frame.pose) {
      const visibleLandmarks = frame.pose.landmarks.filter(
        (lm) => (lm.visibility ?? 0) > 0.5
      ).length;
      totalConfidence += visibleLandmarks / frame.pose.landmarks.length;
      count++;
    }

    if (frame.leftHand) {
      totalConfidence += frame.leftHand.confidence;
      count++;
    }

    if (frame.rightHand) {
      totalConfidence += frame.rightHand.confidence;
      count++;
    }

    if (frame.face) {
      totalConfidence += 0.8; // Face detection confidence assumed high if detected
      count++;
    }

    return count > 0 ? totalConfidence / count : 0;
  }

  /**
   * Get last extracted frame
   */
  getLastFrame(): MovementSemanticsFrame | null {
    return this.lastFrame;
  }

  /**
   * Get kinematics for a specific joint
   */
  getJointKinematics(jointId: string): JointKinematics | null {
    return this.lastKinematics.get(jointId) ?? null;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.jointHistories.clear();
    this.lastKinematics.clear();
    this.lastFrame = null;
  }

  /**
   * Clear rest pose calibration
   */
  clearCalibration(): void {
    this.restPose = null;
  }
}

// ============================================
// Singleton Instance
// ============================================

let extractorInstance: MovementSemanticsExtractor | null = null;

export function getMovementSemanticsExtractor(): MovementSemanticsExtractor {
  if (!extractorInstance) {
    extractorInstance = new MovementSemanticsExtractor();
  }
  return extractorInstance;
}

export function resetMovementSemanticsExtractor(): void {
  extractorInstance?.reset();
  extractorInstance = null;
}
