/**
 * Presence Detector - Detects when a participant is present and creates sound
 *
 * For "Between Us", sound activates when a person is detected in the frame,
 * creating an immediate connection between presence and sound.
 * This enables a low-threshold entry into musical participation.
 */

import type { TrackingFrame, PoseLandmarks } from '../state/types';
import { clamp, normalizeRange, midiToFrequency } from '../utils/math';

export interface PresenceState {
  /** Whether a person is currently detected */
  isPresent: boolean;
  /** Confidence of detection (0-1) */
  confidence: number;
  /** Position of primary interaction point (normalized 0-1) */
  position: { x: number; y: number };
  /** Velocity of movement */
  velocity: { x: number; y: number; magnitude: number };
  /** Overall activity level (0-1, based on movement) */
  activityLevel: number;
  /** Which body parts are visible */
  visibleParts: BodyPart[];
  /** Time since presence was first detected (ms) */
  presenceDuration: number;
  /** Derived musical parameters */
  musicalParams: MusicalParameters;
  /** Left hand position and visibility for sustained sound control */
  leftHand: { x: number; y: number; visible: boolean; raised: boolean };
  /** Right hand position and visibility */
  rightHand: { x: number; y: number; visible: boolean; raised: boolean };
}

export interface MusicalParameters {
  /** Frequency in Hz (derived from vertical position) */
  frequency: number;
  /** MIDI note number */
  midiNote: number;
  /** Velocity/intensity (0-1) */
  velocity: number;
  /** Suggested waveform based on movement quality */
  waveform: OscillatorType;
  /** Panning position (-1 to 1) */
  pan: number;
}

export type BodyPart = 'head' | 'shoulders' | 'arms' | 'hands' | 'torso' | 'legs';

export interface PresenceDetectorConfig {
  /** Minimum confidence for presence detection */
  minConfidence: number;
  /** MIDI note range for pitch mapping */
  noteRange: { min: number; max: number };
  /** Smoothing factor for position/velocity (0-1) */
  smoothing: number;
  /** Velocity threshold for activity detection */
  activityThreshold: number;
  /** Which landmarks to prioritize for position tracking */
  primaryLandmarks: number[];
  /** Time window for velocity calculation (ms) */
  velocityWindow: number;
}

const DEFAULT_CONFIG: PresenceDetectorConfig = {
  minConfidence: 0.3,
  noteRange: { min: 48, max: 84 }, // C3 to C6 (3 octaves)
  smoothing: 0.6,  // Higher = more responsive (less smoothing)
  activityThreshold: 0.02,
  primaryLandmarks: [0], // Just nose for direct head control
  velocityWindow: 80,    // Faster velocity response
};

// Pose landmark indices
const LANDMARK = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export type PresenceCallback = (state: PresenceState) => void;
export type PresenceChangeCallback = (isPresent: boolean) => void;

export class PresenceDetector {
  private config: PresenceDetectorConfig;
  private lastPosition: { x: number; y: number } = { x: 0.5, y: 0.5 };
  private lastVelocity: { x: number; y: number; magnitude: number } = { x: 0, y: 0, magnitude: 0 };
  private positionHistory: Array<{ x: number; y: number; time: number }> = [];
  private presenceStartTime: number | null = null;
  private wasPresent: boolean = false;
  private currentState: PresenceState | null = null;

  private presenceCallbacks: Set<PresenceCallback> = new Set();
  private presenceChangeCallbacks: Set<PresenceChangeCallback> = new Set();

  constructor(config: Partial<PresenceDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a tracking frame and return presence state
   */
  detect(frame: TrackingFrame | null): PresenceState {
    // Check if we have valid pose data
    const hasValidPose = frame?.pose && this.hasMinimumVisibility(frame.pose);

    const isPresent = hasValidPose;
    const now = Date.now();

    // Handle presence change
    if (isPresent && !this.wasPresent) {
      this.presenceStartTime = now;
      this.notifyPresenceChange(true);
    } else if (!isPresent && this.wasPresent) {
      this.presenceStartTime = null;
      this.notifyPresenceChange(false);
    }
    this.wasPresent = isPresent ?? false;

    if (!isPresent || !frame?.pose) {
      // Return empty state when no one present
      this.currentState = this.createEmptyState();
      this.notifyPresence(this.currentState);
      return this.currentState;
    }

    // Calculate position from visible landmarks
    const position = this.calculatePosition(frame.pose);

    // Calculate velocity
    const velocity = this.calculateVelocity(position, now);

    // Smooth values
    const smoothedPosition = this.smoothPosition(position);
    const smoothedVelocity = this.smoothVelocity(velocity);

    // Calculate activity level
    const activityLevel = this.calculateActivityLevel(smoothedVelocity);

    // Determine visible body parts
    const visibleParts = this.getVisibleParts(frame.pose);

    // Calculate confidence
    const confidence = this.calculateConfidence(frame.pose);

    // Derive musical parameters
    const musicalParams = this.deriveMusicalParams(
      smoothedPosition,
      smoothedVelocity,
      activityLevel
    );

    // Get hand states
    const leftHand = this.getHandState(frame.pose, 'left');
    const rightHand = this.getHandState(frame.pose, 'right');

    // Build state
    this.currentState = {
      isPresent: true,
      confidence,
      position: smoothedPosition,
      velocity: smoothedVelocity,
      activityLevel,
      visibleParts,
      presenceDuration: this.presenceStartTime ? now - this.presenceStartTime : 0,
      musicalParams,
      leftHand,
      rightHand,
    };

    // Update history
    this.lastPosition = smoothedPosition;
    this.lastVelocity = smoothedVelocity;

    this.notifyPresence(this.currentState);
    return this.currentState;
  }

  /**
   * Check if pose has minimum required visibility
   */
  private hasMinimumVisibility(pose: PoseLandmarks): boolean {
    const landmarks = pose.landmarks;
    // Need at least nose and one shoulder visible
    const noseVisible = (landmarks[LANDMARK.NOSE]?.visibility ?? 0) > this.config.minConfidence;
    const leftShoulderVisible = (landmarks[LANDMARK.LEFT_SHOULDER]?.visibility ?? 0) > this.config.minConfidence;
    const rightShoulderVisible = (landmarks[LANDMARK.RIGHT_SHOULDER]?.visibility ?? 0) > this.config.minConfidence;

    return noseVisible && (leftShoulderVisible || rightShoulderVisible);
  }

  /**
   * Calculate primary position from landmarks
   */
  private calculatePosition(pose: PoseLandmarks): { x: number; y: number } {
    const landmarks = pose.landmarks;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    // Use weighted average of primary landmarks
    for (const idx of this.config.primaryLandmarks) {
      const landmark = landmarks[idx];
      if (landmark && (landmark.visibility ?? 0) > this.config.minConfidence) {
        // Weight by visibility
        const weight = landmark.visibility ?? 1;
        sumX += landmark.x * weight;
        sumY += landmark.y * weight;
        count += weight;
      }
    }

    if (count === 0) {
      return this.lastPosition;
    }

    return {
      x: clamp(sumX / count, 0, 1),
      y: clamp(sumY / count, 0, 1),
    };
  }

  /**
   * Calculate velocity from position history
   */
  private calculateVelocity(
    position: { x: number; y: number },
    now: number
  ): { x: number; y: number; magnitude: number } {
    // Add to history
    this.positionHistory.push({ x: position.x, y: position.y, time: now });

    // Remove old entries
    const cutoff = now - this.config.velocityWindow;
    this.positionHistory = this.positionHistory.filter((p) => p.time >= cutoff);

    if (this.positionHistory.length < 2) {
      return { x: 0, y: 0, magnitude: 0 };
    }

    // Calculate velocity from oldest to newest
    const oldest = this.positionHistory[0];
    const newest = this.positionHistory[this.positionHistory.length - 1];
    const dt = (newest.time - oldest.time) / 1000; // seconds

    if (dt === 0) {
      return { x: 0, y: 0, magnitude: 0 };
    }

    const vx = (newest.x - oldest.x) / dt;
    const vy = (newest.y - oldest.y) / dt;
    const magnitude = Math.sqrt(vx * vx + vy * vy);

    return { x: vx, y: vy, magnitude };
  }

  /**
   * Apply smoothing to position
   */
  private smoothPosition(position: { x: number; y: number }): { x: number; y: number } {
    const s = this.config.smoothing;
    return {
      x: this.lastPosition.x + (position.x - this.lastPosition.x) * s,
      y: this.lastPosition.y + (position.y - this.lastPosition.y) * s,
    };
  }

  /**
   * Apply smoothing to velocity
   */
  private smoothVelocity(
    velocity: { x: number; y: number; magnitude: number }
  ): { x: number; y: number; magnitude: number } {
    const s = this.config.smoothing;
    return {
      x: this.lastVelocity.x + (velocity.x - this.lastVelocity.x) * s,
      y: this.lastVelocity.y + (velocity.y - this.lastVelocity.y) * s,
      magnitude: this.lastVelocity.magnitude + (velocity.magnitude - this.lastVelocity.magnitude) * s,
    };
  }

  /**
   * Calculate activity level from velocity
   */
  private calculateActivityLevel(velocity: { magnitude: number }): number {
    // Map velocity to 0-1 range with soft saturation
    const normalized = velocity.magnitude / 2; // Assuming max useful velocity ~2
    return clamp(normalized, 0, 1);
  }

  /**
   * Get hand position and state
   */
  private getHandState(
    pose: PoseLandmarks,
    side: 'left' | 'right'
  ): { x: number; y: number; visible: boolean; raised: boolean } {
    const landmarks = pose.landmarks;
    const wristIdx = side === 'left' ? LANDMARK.LEFT_WRIST : LANDMARK.RIGHT_WRIST;
    const shoulderIdx = side === 'left' ? LANDMARK.LEFT_SHOULDER : LANDMARK.RIGHT_SHOULDER;
    const elbowIdx = side === 'left' ? LANDMARK.LEFT_ELBOW : LANDMARK.RIGHT_ELBOW;

    const wrist = landmarks[wristIdx];
    const shoulder = landmarks[shoulderIdx];
    const elbow = landmarks[elbowIdx];

    const visible = (wrist?.visibility ?? 0) > this.config.minConfidence;

    if (!visible || !wrist) {
      return { x: 0.5, y: 0.5, visible: false, raised: false };
    }

    // Hand is "raised" if wrist is above shoulder
    const shoulderY = shoulder?.y ?? 1;
    const elbowY = elbow?.y ?? 1;
    const raised = wrist.y < shoulderY && wrist.y < elbowY;

    return {
      x: wrist.x,
      y: wrist.y,
      visible,
      raised,
    };
  }

  /**
   * Determine which body parts are visible
   */
  private getVisibleParts(pose: PoseLandmarks): BodyPart[] {
    const landmarks = pose.landmarks;
    const parts: BodyPart[] = [];
    const threshold = this.config.minConfidence;

    // Head
    if ((landmarks[LANDMARK.NOSE]?.visibility ?? 0) > threshold) {
      parts.push('head');
    }

    // Shoulders
    if (
      (landmarks[LANDMARK.LEFT_SHOULDER]?.visibility ?? 0) > threshold ||
      (landmarks[LANDMARK.RIGHT_SHOULDER]?.visibility ?? 0) > threshold
    ) {
      parts.push('shoulders');
    }

    // Arms (elbows)
    if (
      (landmarks[LANDMARK.LEFT_ELBOW]?.visibility ?? 0) > threshold ||
      (landmarks[LANDMARK.RIGHT_ELBOW]?.visibility ?? 0) > threshold
    ) {
      parts.push('arms');
    }

    // Hands (wrists)
    if (
      (landmarks[LANDMARK.LEFT_WRIST]?.visibility ?? 0) > threshold ||
      (landmarks[LANDMARK.RIGHT_WRIST]?.visibility ?? 0) > threshold
    ) {
      parts.push('hands');
    }

    // Torso (hips)
    if (
      (landmarks[LANDMARK.LEFT_HIP]?.visibility ?? 0) > threshold ||
      (landmarks[LANDMARK.RIGHT_HIP]?.visibility ?? 0) > threshold
    ) {
      parts.push('torso');
    }

    // Legs
    if (
      (landmarks[LANDMARK.LEFT_KNEE]?.visibility ?? 0) > threshold ||
      (landmarks[LANDMARK.RIGHT_KNEE]?.visibility ?? 0) > threshold
    ) {
      parts.push('legs');
    }

    return parts;
  }

  /**
   * Calculate overall confidence from pose
   */
  private calculateConfidence(pose: PoseLandmarks): number {
    let sum = 0;
    let count = 0;

    for (const landmark of pose.landmarks) {
      if (landmark?.visibility !== undefined) {
        sum += landmark.visibility;
        count++;
      }
    }

    return count > 0 ? sum / count : 0;
  }

  /**
   * Derive musical parameters from presence state
   */
  private deriveMusicalParams(
    position: { x: number; y: number },
    _velocity: { x: number; y: number; magnitude: number },
    activityLevel: number
  ): MusicalParameters {
    // Invert Y for pitch (up = higher)
    const yInverted = 1 - position.y;

    // Map Y to MIDI note
    const midiNote = Math.round(
      normalizeRange(
        yInverted,
        0,
        1,
        this.config.noteRange.min,
        this.config.noteRange.max
      )
    );

    const frequency = midiToFrequency(midiNote);

    // Velocity from activity level, with minimum
    const velocityValue = clamp(0.3 + activityLevel * 0.7, 0.3, 1);

    // Choose waveform based on activity
    let waveform: OscillatorType = 'sine';
    if (activityLevel > 0.7) {
      waveform = 'sawtooth';
    } else if (activityLevel > 0.4) {
      waveform = 'triangle';
    }

    // Pan from X position
    const pan = (position.x - 0.5) * 2; // -1 to 1

    return {
      frequency,
      midiNote,
      velocity: velocityValue,
      waveform,
      pan,
    };
  }

  /**
   * Create empty state when no one is present
   */
  private createEmptyState(): PresenceState {
    return {
      isPresent: false,
      confidence: 0,
      position: { x: 0.5, y: 0.5 },
      velocity: { x: 0, y: 0, magnitude: 0 },
      activityLevel: 0,
      visibleParts: [],
      presenceDuration: 0,
      musicalParams: {
        frequency: 0,
        midiNote: 0,
        velocity: 0,
        waveform: 'sine',
        pan: 0,
      },
      leftHand: { x: 0.5, y: 0.5, visible: false, raised: false },
      rightHand: { x: 0.5, y: 0.5, visible: false, raised: false },
    };
  }

  /**
   * Subscribe to presence updates
   */
  onPresence(callback: PresenceCallback): () => void {
    this.presenceCallbacks.add(callback);
    return () => this.presenceCallbacks.delete(callback);
  }

  /**
   * Subscribe to presence change events (enter/exit)
   */
  onPresenceChange(callback: PresenceChangeCallback): () => void {
    this.presenceChangeCallbacks.add(callback);
    return () => this.presenceChangeCallbacks.delete(callback);
  }

  /**
   * Notify presence callbacks
   */
  private notifyPresence(state: PresenceState): void {
    this.presenceCallbacks.forEach((cb) => {
      try {
        cb(state);
      } catch (e) {
        console.error('Error in presence callback:', e);
      }
    });
  }

  /**
   * Notify presence change callbacks
   */
  private notifyPresenceChange(isPresent: boolean): void {
    this.presenceChangeCallbacks.forEach((cb) => {
      try {
        cb(isPresent);
      } catch (e) {
        console.error('Error in presence change callback:', e);
      }
    });
  }

  /**
   * Get current presence state
   */
  getCurrentState(): PresenceState | null {
    return this.currentState;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<PresenceDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set note range for pitch mapping
   */
  setNoteRange(min: number, max: number): void {
    this.config.noteRange = {
      min: clamp(min, 21, 108),
      max: clamp(max, 21, 108),
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.positionHistory = [];
    this.presenceStartTime = null;
    this.wasPresent = false;
    this.currentState = null;
    this.lastPosition = { x: 0.5, y: 0.5 };
    this.lastVelocity = { x: 0, y: 0, magnitude: 0 };
  }
}

// Singleton instance
let presenceDetectorInstance: PresenceDetector | null = null;

export function getPresenceDetector(): PresenceDetector {
  if (!presenceDetectorInstance) {
    presenceDetectorInstance = new PresenceDetector();
  }
  return presenceDetectorInstance;
}
