/**
 * MovementEventDetector - Detects semantic movement events
 *
 * Ported from v2's MovementResponseEngine.
 * Detects meaningful movement events for mapping to musical actions:
 * - motionOnset: Movement starts (velocity crosses threshold)
 * - motionOffset: Movement stops (velocity drops below threshold)
 * - motionBurst: Sudden high-energy spike
 * - motionDrift: Slow, sustained motion
 * - motionSteady: Consistent motion for a duration
 */

import type { FeatureValue } from '../state/types';

// ============================================
// Types
// ============================================

export type MovementEventType =
  | 'motionOnset'
  | 'motionOffset'
  | 'motionBurst'
  | 'motionDrift'
  | 'motionSteady';

export interface MovementEvent {
  type: MovementEventType;
  featureId: string;
  /** Normalized 0-1 intensity/magnitude of the event */
  intensity: number;
  /** Direction vector (if applicable) */
  direction?: { x: number; y: number };
  timestamp: number;
}

export interface MovementEventConfig {
  /** Velocity threshold to trigger motion onset (default: 0.015) */
  onsetThreshold?: number;
  /** Velocity threshold for motion offset (default: 0.008) */
  offsetThreshold?: number;
  /** Velocity threshold for burst detection (default: 0.25) */
  burstThreshold?: number;
  /** Maximum velocity for drift detection (default: 0.08) */
  driftMaxVelocity?: number;
  /** Minimum velocity for drift detection (default: 0.01) */
  driftMinVelocity?: number;
  /** Minimum duration (ms) for steady motion (default: 200) */
  steadyMinDuration?: number;
  /** Cooldown between events of same type (ms, default: 100) */
  eventCooldown?: number;
}

interface FeatureState {
  isMoving: boolean;
  motionStartTime: number;
  lastEventTime: Map<MovementEventType, number>;
  velocityHistory: { magnitude: number; timestamp: number }[];
}

const DEFAULT_CONFIG: Required<MovementEventConfig> = {
  onsetThreshold: 0.015,
  offsetThreshold: 0.008,
  burstThreshold: 0.25,
  driftMaxVelocity: 0.08,
  driftMinVelocity: 0.01,
  steadyMinDuration: 200,
  eventCooldown: 100,
};

const VELOCITY_HISTORY_MAX = 30;
const VELOCITY_HISTORY_DURATION_MS = 500;

// ============================================
// MovementEventDetector Class
// ============================================

export class MovementEventDetector {
  private config: Required<MovementEventConfig>;
  private featureStates: Map<string, FeatureState> = new Map();
  private listeners: Set<(event: MovementEvent) => void> = new Set();

  constructor(config: MovementEventConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a feature value and detect events.
   * Returns any events detected for this feature.
   */
  process(feature: FeatureValue): MovementEvent[] {
    const state = this.getOrCreateState(feature.featureId);
    const events: MovementEvent[] = [];
    const velocity = feature.velocity.magnitude;
    const timestamp = feature.timestamp;

    // Update velocity history
    this.updateVelocityHistory(state, velocity, timestamp);

    // Detect motion onset
    if (!state.isMoving && velocity > this.config.onsetThreshold) {
      if (this.canEmitEvent(state, 'motionOnset', timestamp)) {
        state.isMoving = true;
        state.motionStartTime = timestamp;
        events.push({
          type: 'motionOnset',
          featureId: feature.featureId,
          intensity: Math.min(1, velocity / this.config.burstThreshold),
          direction: this.normalizeDirection(feature.velocity),
          timestamp,
        });
        state.lastEventTime.set('motionOnset', timestamp);
      }
    }

    // Detect motion offset
    if (state.isMoving && velocity < this.config.offsetThreshold) {
      if (this.canEmitEvent(state, 'motionOffset', timestamp)) {
        state.isMoving = false;
        events.push({
          type: 'motionOffset',
          featureId: feature.featureId,
          intensity: 0,
          timestamp,
        });
        state.lastEventTime.set('motionOffset', timestamp);
      }
    }

    // Detect motion burst (sudden high-energy spike)
    if (velocity > this.config.burstThreshold) {
      if (this.canEmitEvent(state, 'motionBurst', timestamp)) {
        events.push({
          type: 'motionBurst',
          featureId: feature.featureId,
          intensity: Math.min(1, velocity / (this.config.burstThreshold * 2)),
          direction: this.normalizeDirection(feature.velocity),
          timestamp,
        });
        state.lastEventTime.set('motionBurst', timestamp);
      }
    }

    // Detect motion drift (slow, sustained motion)
    if (
      state.isMoving &&
      velocity >= this.config.driftMinVelocity &&
      velocity <= this.config.driftMaxVelocity
    ) {
      const motionDuration = timestamp - state.motionStartTime;
      if (motionDuration > this.config.steadyMinDuration) {
        if (this.canEmitEvent(state, 'motionDrift', timestamp)) {
          events.push({
            type: 'motionDrift',
            featureId: feature.featureId,
            intensity: velocity / this.config.driftMaxVelocity,
            direction: this.normalizeDirection(feature.velocity),
            timestamp,
          });
          state.lastEventTime.set('motionDrift', timestamp);
        }
      }
    }

    // Detect motion steady (consistent motion for a duration)
    if (state.isMoving && this.isVelocitySteady(state)) {
      const motionDuration = timestamp - state.motionStartTime;
      if (motionDuration >= this.config.steadyMinDuration) {
        if (this.canEmitEvent(state, 'motionSteady', timestamp)) {
          const avgVelocity = this.getAverageVelocity(state);
          events.push({
            type: 'motionSteady',
            featureId: feature.featureId,
            intensity: Math.min(1, avgVelocity / this.config.burstThreshold),
            direction: this.normalizeDirection(feature.velocity),
            timestamp,
          });
          state.lastEventTime.set('motionSteady', timestamp);
        }
      }
    }

    // Notify listeners
    for (const event of events) {
      this.notifyListeners(event);
    }

    return events;
  }

  /**
   * Process multiple features at once.
   */
  processAll(features: Map<string, FeatureValue>): MovementEvent[] {
    const allEvents: MovementEvent[] = [];

    features.forEach((feature) => {
      const events = this.process(feature);
      allEvents.push(...events);
    });

    return allEvents;
  }

  /**
   * Subscribe to movement events.
   */
  onEvent(callback: (event: MovementEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Check if a feature is currently in motion.
   */
  isFeatureMoving(featureId: string): boolean {
    return this.featureStates.get(featureId)?.isMoving ?? false;
  }

  /**
   * Get motion duration for a feature (ms).
   */
  getMotionDuration(featureId: string, currentTime: number): number {
    const state = this.featureStates.get(featureId);
    if (!state || !state.isMoving) return 0;
    return currentTime - state.motionStartTime;
  }

  /**
   * Reset state for a feature.
   */
  resetFeature(featureId: string): void {
    this.featureStates.delete(featureId);
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.featureStates.clear();
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<MovementEventConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================
  // Private Methods
  // ============================================

  private getOrCreateState(featureId: string): FeatureState {
    let state = this.featureStates.get(featureId);
    if (!state) {
      state = {
        isMoving: false,
        motionStartTime: 0,
        lastEventTime: new Map(),
        velocityHistory: [],
      };
      this.featureStates.set(featureId, state);
    }
    return state;
  }

  private updateVelocityHistory(
    state: FeatureState,
    magnitude: number,
    timestamp: number
  ): void {
    state.velocityHistory.push({ magnitude, timestamp });

    // Remove old entries
    const cutoff = timestamp - VELOCITY_HISTORY_DURATION_MS;
    while (state.velocityHistory.length > 0 && state.velocityHistory[0].timestamp < cutoff) {
      state.velocityHistory.shift();
    }

    // Limit size
    while (state.velocityHistory.length > VELOCITY_HISTORY_MAX) {
      state.velocityHistory.shift();
    }
  }

  private canEmitEvent(
    state: FeatureState,
    eventType: MovementEventType,
    timestamp: number
  ): boolean {
    const lastTime = state.lastEventTime.get(eventType) ?? 0;
    return timestamp - lastTime >= this.config.eventCooldown;
  }

  private isVelocitySteady(state: FeatureState): boolean {
    if (state.velocityHistory.length < 5) return false;

    const velocities = state.velocityHistory.map((v) => v.magnitude);
    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const variance =
      velocities.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / velocities.length;
    const stdDev = Math.sqrt(variance);

    // Consider steady if standard deviation is less than 30% of average
    return stdDev < avg * 0.3;
  }

  private getAverageVelocity(state: FeatureState): number {
    if (state.velocityHistory.length === 0) return 0;
    const sum = state.velocityHistory.reduce((acc, v) => acc + v.magnitude, 0);
    return sum / state.velocityHistory.length;
  }

  private normalizeDirection(velocity: { x: number; y: number; z: number }): { x: number; y: number } {
    const magnitude = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
    if (magnitude < 0.001) {
      return { x: 0, y: 0 };
    }
    return {
      x: velocity.x / magnitude,
      y: velocity.y / magnitude,
    };
  }

  private notifyListeners(event: MovementEvent): void {
    this.listeners.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('[MovementEventDetector] Listener error:', error);
      }
    });
  }
}

// ============================================
// Singleton Instance
// ============================================

let movementEventDetectorInstance: MovementEventDetector | null = null;

export function getMovementEventDetector(): MovementEventDetector {
  if (!movementEventDetectorInstance) {
    movementEventDetectorInstance = new MovementEventDetector();
  }
  return movementEventDetectorInstance;
}

export function resetMovementEventDetector(): void {
  movementEventDetectorInstance?.reset();
  movementEventDetectorInstance = null;
}
