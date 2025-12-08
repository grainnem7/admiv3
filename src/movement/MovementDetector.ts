/**
 * Movement Detector - Detects and classifies movement from pose landmarks
 */

import { MOVEMENT, LANDMARKS } from '../utils/constants';
import { velocity2D, velocityMagnitude, angleBetween, distance2D } from '../utils/math';
import type { PoseLandmarks, ProcessedMovement, AccessibilityMode } from '../state/types';

export interface MovementConfig {
  /** Which landmark to track (default: right wrist) */
  trackedLandmark?: number;
  /** Minimum velocity to register as movement */
  minVelocity?: number;
  /** Number of frames for stability detection */
  stabilityFrames?: number;
  /** Sensitivity multiplier */
  sensitivity?: number;
}

const DEFAULT_CONFIG: Required<MovementConfig> = {
  trackedLandmark: LANDMARKS.RIGHT_WRIST,
  minVelocity: MOVEMENT.MIN_VELOCITY,
  stabilityFrames: MOVEMENT.STABILITY_FRAMES,
  sensitivity: 1.0,
};

interface PositionHistory {
  x: number;
  y: number;
  timestamp: number;
}

export class MovementDetector {
  private config: Required<MovementConfig>;
  private history: PositionHistory[] = [];
  private stableFrameCount: number = 0;
  private lastActiveState: boolean = false;
  private restPosition: { x: number; y: number } | null = null;
  private accessibilityMode: AccessibilityMode = 'standard';

  constructor(config: MovementConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process landmarks and detect movement
   */
  detect(landmarks: PoseLandmarks): ProcessedMovement | null {
    const landmark = landmarks.landmarks[this.config.trackedLandmark];

    if (!landmark || (landmark.visibility ?? 0) < 0.5) {
      return null;
    }

    const currentPosition = { x: landmark.x, y: landmark.y };
    const currentTime = landmarks.timestamp;

    // Add to history
    this.history.push({ ...currentPosition, timestamp: currentTime });

    // Keep only recent history
    const maxHistoryMs = 500;
    this.history = this.history.filter(
      (h) => currentTime - h.timestamp < maxHistoryMs
    );

    if (this.history.length < 2) {
      return this.createResult(currentPosition, null, landmark.visibility ?? 0);
    }

    // Calculate velocity
    const previousPosition = this.history[this.history.length - 2];
    const deltaTime = (currentTime - previousPosition.timestamp) / 1000;
    const vel = velocity2D(previousPosition, currentPosition, deltaTime);
    const speed = velocityMagnitude(vel);
    const direction = angleBetween(previousPosition, currentPosition);

    const velocity = {
      x: vel.x,
      y: vel.y,
      magnitude: speed,
      direction,
    };

    // Determine if movement is active
    const adjustedThreshold = this.getAdjustedThreshold();
    const isMoving = speed > adjustedThreshold;

    // Stability detection
    if (isMoving) {
      this.stableFrameCount++;
    } else {
      this.stableFrameCount = Math.max(0, this.stableFrameCount - 1);
    }

    const isStable = this.stableFrameCount >= this.config.stabilityFrames;

    // Apply hysteresis to prevent flickering
    const isActive = this.applyHysteresis(isMoving, isStable);

    return this.createResult(currentPosition, velocity, landmark.visibility ?? 0, isActive, isStable);
  }

  /**
   * Set the rest position for the user
   */
  setRestPosition(position: { x: number; y: number }): void {
    this.restPosition = position;
  }

  /**
   * Set accessibility mode
   */
  setAccessibilityMode(mode: AccessibilityMode): void {
    this.accessibilityMode = mode;
    this.reset();
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MovementConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set sensitivity multiplier
   */
  setSensitivity(sensitivity: number): void {
    this.config.sensitivity = Math.max(0.1, Math.min(5, sensitivity));
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.history = [];
    this.stableFrameCount = 0;
    this.lastActiveState = false;
  }

  /**
   * Get adjusted threshold based on mode and sensitivity
   */
  private getAdjustedThreshold(): number {
    let baseThreshold = this.config.minVelocity;

    // Adjust for accessibility mode
    switch (this.accessibilityMode) {
      case 'lowMobility':
        baseThreshold *= 0.3; // Much more sensitive
        break;
      case 'singleSwitch':
        baseThreshold *= 0.5; // More sensitive
        break;
      case 'dwell':
        baseThreshold *= 0.2; // Very sensitive for position detection
        break;
    }

    // Apply user sensitivity
    return baseThreshold / this.config.sensitivity;
  }

  /**
   * Apply hysteresis to prevent state flickering
   */
  private applyHysteresis(isMoving: boolean, isStable: boolean): boolean {
    if (this.accessibilityMode === 'singleSwitch') {
      // Binary mode: any movement = active
      return isMoving;
    }

    if (this.lastActiveState) {
      // Currently active - need significant reduction to deactivate
      const shouldDeactivate = !isMoving && !isStable;
      if (shouldDeactivate) {
        this.lastActiveState = false;
      }
    } else {
      // Currently inactive - need stable movement to activate
      const shouldActivate = isStable;
      if (shouldActivate) {
        this.lastActiveState = true;
      }
    }

    return this.lastActiveState;
  }

  /**
   * Create a ProcessedMovement result
   */
  private createResult(
    position: { x: number; y: number },
    velocity: { x: number; y: number; magnitude: number; direction: number } | null,
    confidence: number,
    isActive: boolean = false,
    isStable: boolean = false
  ): ProcessedMovement {
    return {
      position,
      velocity: velocity ?? { x: 0, y: 0, magnitude: 0, direction: 0 },
      isActive,
      isStable,
      confidence,
    };
  }

  /**
   * Calculate distance from rest position (for zone-based mapping)
   */
  getDistanceFromRest(position: { x: number; y: number }): number {
    if (!this.restPosition) return 0;
    return distance2D(this.restPosition, position);
  }

  /**
   * Get relative position from rest (normalized -1 to 1)
   */
  getRelativePosition(position: { x: number; y: number }): { x: number; y: number } {
    if (!this.restPosition) {
      return { x: 0, y: 0 };
    }
    return {
      x: (position.x - this.restPosition.x) * 2,
      y: (position.y - this.restPosition.y) * 2,
    };
  }
}
