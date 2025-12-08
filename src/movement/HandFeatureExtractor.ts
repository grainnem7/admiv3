/**
 * HandFeatureExtractor - Computes hand-specific features from tracking data
 *
 * Ported from v2's HandMotionExtractor with articulation and spread algorithms.
 * Provides rich hand features for expressive control:
 * - Intensity: Combined wrist + fingertip velocities
 * - Articulation: How bent/curled the fingers are (0=open, 1=fist)
 * - Spread: How far apart the fingers are (0=closed, 1=spread)
 */

import type { HandLandmarks, TrackingFrame } from '../state/types';

// ============================================
// Types
// ============================================

export interface HandFeatures {
  /** Movement intensity (0-1), combines wrist and fingertip velocities */
  intensity: number;
  /** Finger curl/articulation (0=extended, 1=fully curled fist) */
  articulation: number;
  /** Finger spread (0=fingers together, 1=fully spread) */
  spread: number;
  /** Whether the hand is being tracked */
  isTracked: boolean;
  /** Position of wrist (normalized 0-1) */
  wristPosition: { x: number; y: number };
}

export interface HandFeatureConfig {
  /** Maximum expected velocity for intensity normalization (default: 0.5) */
  maxVelocity?: number;
  /** Smoothing factor for features (0-1, default: 0.3) */
  smoothingFactor?: number;
}

interface HandState {
  lastWristPosition: { x: number; y: number } | null;
  lastFingertipPositions: { x: number; y: number }[] | null;
  lastTimestamp: number;
  smoothedIntensity: number;
  smoothedArticulation: number;
  smoothedSpread: number;
}

// MediaPipe hand landmark indices
const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

const FINGERTIP_INDICES = [
  HAND_LANDMARKS.THUMB_TIP,
  HAND_LANDMARKS.INDEX_TIP,
  HAND_LANDMARKS.MIDDLE_TIP,
  HAND_LANDMARKS.RING_TIP,
  HAND_LANDMARKS.PINKY_TIP,
];

const DEFAULT_CONFIG: Required<HandFeatureConfig> = {
  maxVelocity: 0.5,
  smoothingFactor: 0.3,
};

// ============================================
// HandFeatureExtractor Class
// ============================================

export class HandFeatureExtractor {
  private config: Required<HandFeatureConfig>;
  private leftHandState: HandState;
  private rightHandState: HandState;

  constructor(config: HandFeatureConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.leftHandState = this.createInitialState();
    this.rightHandState = this.createInitialState();
  }

  private createInitialState(): HandState {
    return {
      lastWristPosition: null,
      lastFingertipPositions: null,
      lastTimestamp: 0,
      smoothedIntensity: 0,
      smoothedArticulation: 0,
      smoothedSpread: 0,
    };
  }

  /**
   * Extract features from a tracking frame.
   */
  extract(frame: TrackingFrame): { leftHand: HandFeatures; rightHand: HandFeatures } {
    const leftHand = this.extractSingleHand(
      frame.leftHand,
      this.leftHandState,
      frame.timestamp
    );
    this.leftHandState = leftHand.newState;

    const rightHand = this.extractSingleHand(
      frame.rightHand,
      this.rightHandState,
      frame.timestamp
    );
    this.rightHandState = rightHand.newState;

    return {
      leftHand: leftHand.features,
      rightHand: rightHand.features,
    };
  }

  /**
   * Extract features from a single hand.
   */
  private extractSingleHand(
    hand: HandLandmarks | null,
    state: HandState,
    timestamp: number
  ): { features: HandFeatures; newState: HandState } {
    if (!hand || !hand.landmarks || hand.landmarks.length < 21) {
      return {
        features: {
          intensity: 0,
          articulation: 0,
          spread: 0,
          isTracked: false,
          wristPosition: { x: 0.5, y: 0.5 },
        },
        newState: this.createInitialState(),
      };
    }

    const wrist = hand.landmarks[HAND_LANDMARKS.WRIST];
    const wristPosition = { x: wrist.x, y: wrist.y };

    // Calculate raw features
    const rawIntensity = this.computeIntensity(hand, state, timestamp);
    const rawArticulation = this.computeArticulation(hand);
    const rawSpread = this.computeSpread(hand);

    // Apply smoothing
    const alpha = this.config.smoothingFactor;
    const smoothedIntensity = alpha * state.smoothedIntensity + (1 - alpha) * rawIntensity;
    const smoothedArticulation = alpha * state.smoothedArticulation + (1 - alpha) * rawArticulation;
    const smoothedSpread = alpha * state.smoothedSpread + (1 - alpha) * rawSpread;

    // Update state
    const fingertipPositions = FINGERTIP_INDICES.map((idx) => ({
      x: hand.landmarks[idx].x,
      y: hand.landmarks[idx].y,
    }));

    const newState: HandState = {
      lastWristPosition: wristPosition,
      lastFingertipPositions: fingertipPositions,
      lastTimestamp: timestamp,
      smoothedIntensity,
      smoothedArticulation,
      smoothedSpread,
    };

    return {
      features: {
        intensity: smoothedIntensity,
        articulation: smoothedArticulation,
        spread: smoothedSpread,
        isTracked: true,
        wristPosition,
      },
      newState,
    };
  }

  /**
   * Compute hand movement intensity based on velocity.
   * Combines wrist velocity (60%) with fingertip velocities (40%).
   */
  private computeIntensity(
    hand: HandLandmarks,
    state: HandState,
    timestamp: number
  ): number {
    if (!state.lastWristPosition || state.lastTimestamp === 0) {
      return 0;
    }

    const dt = (timestamp - state.lastTimestamp) / 1000; // Convert to seconds
    if (dt <= 0) {
      return 0;
    }

    // Wrist velocity
    const wrist = hand.landmarks[HAND_LANDMARKS.WRIST];
    const wristDx = wrist.x - state.lastWristPosition.x;
    const wristDy = wrist.y - state.lastWristPosition.y;
    const wristVelocity = Math.sqrt(wristDx * wristDx + wristDy * wristDy) / dt;

    // Fingertip velocities
    let fingertipVelocity = 0;
    if (state.lastFingertipPositions) {
      for (let i = 0; i < FINGERTIP_INDICES.length; i++) {
        const tipIdx = FINGERTIP_INDICES[i];
        const tip = hand.landmarks[tipIdx];
        const lastTip = state.lastFingertipPositions[i];

        const tipDx = tip.x - lastTip.x;
        const tipDy = tip.y - lastTip.y;
        fingertipVelocity += Math.sqrt(tipDx * tipDx + tipDy * tipDy) / dt;
      }
      fingertipVelocity /= FINGERTIP_INDICES.length;
    }

    // Combine wrist (60%) and fingertip (40%) velocities
    const combinedVelocity = wristVelocity * 0.6 + fingertipVelocity * 0.4;

    // Normalize to 0-1
    return Math.min(1, combinedVelocity / this.config.maxVelocity);
  }

  /**
   * Compute finger articulation (how bent/curled the fingers are).
   * Returns 0 (fingers extended) to 1 (fingers fully curled/fist).
   * Uses angle between finger segments.
   */
  private computeArticulation(hand: HandLandmarks): number {
    const fingers = [
      // Index finger
      [HAND_LANDMARKS.INDEX_MCP, HAND_LANDMARKS.INDEX_PIP, HAND_LANDMARKS.INDEX_DIP, HAND_LANDMARKS.INDEX_TIP],
      // Middle finger
      [HAND_LANDMARKS.MIDDLE_MCP, HAND_LANDMARKS.MIDDLE_PIP, HAND_LANDMARKS.MIDDLE_DIP, HAND_LANDMARKS.MIDDLE_TIP],
      // Ring finger
      [HAND_LANDMARKS.RING_MCP, HAND_LANDMARKS.RING_PIP, HAND_LANDMARKS.RING_DIP, HAND_LANDMARKS.RING_TIP],
      // Pinky finger
      [HAND_LANDMARKS.PINKY_MCP, HAND_LANDMARKS.PINKY_PIP, HAND_LANDMARKS.PINKY_DIP, HAND_LANDMARKS.PINKY_TIP],
    ];

    let totalCurl = 0;
    let fingerCount = 0;

    for (const fingerIndices of fingers) {
      const [mcpIdx, pipIdx, _dipIdx, tipIdx] = fingerIndices;
      const mcp = hand.landmarks[mcpIdx];
      const pip = hand.landmarks[pipIdx];
      const tip = hand.landmarks[tipIdx];

      // Vector from MCP to PIP
      const v1 = { x: pip.x - mcp.x, y: pip.y - mcp.y };
      // Vector from PIP to TIP
      const v2 = { x: tip.x - pip.x, y: tip.y - pip.y };

      // Calculate angle using dot product
      const dot = v1.x * v2.x + v1.y * v2.y;
      const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
      const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

      if (mag1 > 0.001 && mag2 > 0.001) {
        const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
        const angle = Math.acos(cosAngle);

        // Convert angle to curl value
        // angle = PI (180 deg) means fully extended (curl = 0)
        // angle = 0 means fully curled (curl = 1)
        const curl = 1 - angle / Math.PI;
        totalCurl += curl;
        fingerCount++;
      }
    }

    // Also consider thumb (different geometry - distance from tip to wrist)
    const thumbTip = hand.landmarks[HAND_LANDMARKS.THUMB_TIP];
    const thumbCmc = hand.landmarks[HAND_LANDMARKS.THUMB_CMC];
    const wrist = hand.landmarks[HAND_LANDMARKS.WRIST];

    const thumbDist = Math.sqrt(
      Math.pow(thumbTip.x - wrist.x, 2) + Math.pow(thumbTip.y - wrist.y, 2)
    );
    const cmcDist = Math.sqrt(
      Math.pow(thumbCmc.x - wrist.x, 2) + Math.pow(thumbCmc.y - wrist.y, 2)
    );

    // Normalize thumb curl (thumb extended = ~2.5x CMC distance from wrist)
    const thumbExtension = thumbDist / (cmcDist * 2.5);
    const thumbCurl = 1 - Math.min(1, thumbExtension);
    totalCurl += thumbCurl;
    fingerCount++;

    return fingerCount > 0 ? totalCurl / fingerCount : 0;
  }

  /**
   * Compute finger spread (how far apart the fingers are).
   * Returns 0 (fingers together) to 1 (fingers fully spread).
   * Measures distances between adjacent fingertips.
   */
  private computeSpread(hand: HandLandmarks): number {
    const tips = FINGERTIP_INDICES.map((idx) => hand.landmarks[idx]);

    // Calculate distances between adjacent fingertips
    let totalDistance = 0;
    let pairCount = 0;

    for (let i = 0; i < tips.length - 1; i++) {
      const tip1 = tips[i];
      const tip2 = tips[i + 1];

      const dx = tip2.x - tip1.x;
      const dy = tip2.y - tip1.y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
      pairCount++;
    }

    if (pairCount === 0) return 0;

    const avgDistance = totalDistance / pairCount;

    // Normalize based on expected spread range
    // Typical fingertip spacing: 0.02-0.03 (closed) to 0.08-0.12 (spread)
    const minSpread = 0.02;
    const maxSpread = 0.10;
    const normalizedSpread = (avgDistance - minSpread) / (maxSpread - minSpread);

    return Math.max(0, Math.min(1, normalizedSpread));
  }

  /**
   * Reset the extractor state.
   */
  reset(): void {
    this.leftHandState = this.createInitialState();
    this.rightHandState = this.createInitialState();
  }
}

// ============================================
// Singleton Instance
// ============================================

let handFeatureExtractorInstance: HandFeatureExtractor | null = null;

export function getHandFeatureExtractor(): HandFeatureExtractor {
  if (!handFeatureExtractorInstance) {
    handFeatureExtractorInstance = new HandFeatureExtractor();
  }
  return handFeatureExtractorInstance;
}

export function resetHandFeatureExtractor(): void {
  handFeatureExtractorInstance?.reset();
  handFeatureExtractorInstance = null;
}
