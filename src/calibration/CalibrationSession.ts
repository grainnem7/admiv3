/**
 * Calibration Session - Orchestrates the creative calibration workflow
 */

import { CALIBRATION } from '../utils/constants';
import type {
  CalibrationPhase,
  GestureSample,
  CalibratedGesture,
  UserProfile,
  AccessibilityMode,
} from '../state/types';

export interface CalibrationConfig {
  /** Number of samples per gesture */
  samplesPerGesture?: number;
  /** Time to settle at rest position (ms) */
  restSettleTime?: number;
}

const DEFAULT_CONFIG: Required<CalibrationConfig> = {
  samplesPerGesture: CALIBRATION.SAMPLES_PER_GESTURE,
  restSettleTime: CALIBRATION.REST_SETTLE_TIME_MS,
};

type PhaseChangeCallback = (phase: CalibrationPhase, data?: unknown) => void;
type ProgressCallback = (progress: number) => void;

export class CalibrationSession {
  private config: Required<CalibrationConfig>;
  private phase: CalibrationPhase = 'idle';
  private samples: GestureSample[] = [];
  private restPosition: { x: number; y: number } | null = null;
  private movementRange = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
  private gestures: CalibratedGesture[] = [];
  private currentGestureId: string | null = null;
  private phaseCallbacks: Set<PhaseChangeCallback> = new Set();
  private progressCallbacks: Set<ProgressCallback> = new Set();

  constructor(config: CalibrationConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start calibration session
   */
  start(): void {
    this.reset();
    this.setPhase('awaitingStart');
  }

  /**
   * Begin recording rest position
   */
  startRestRecording(): void {
    if (this.phase !== 'awaitingStart') return;
    this.samples = [];
    this.setPhase('recordingRest');
  }

  /**
   * Add a sample during calibration
   */
  addSample(position: { x: number; y: number }): void {
    const sample: GestureSample = {
      position,
      timestamp: performance.now(),
    };

    this.samples.push(sample);

    // Update movement range
    this.movementRange.minX = Math.min(this.movementRange.minX, position.x);
    this.movementRange.maxX = Math.max(this.movementRange.maxX, position.x);
    this.movementRange.minY = Math.min(this.movementRange.minY, position.y);
    this.movementRange.maxY = Math.max(this.movementRange.maxY, position.y);

    // Notify progress
    const progress = this.samples.length / this.config.samplesPerGesture;
    this.notifyProgress(Math.min(progress, 1));

    // Check if phase is complete
    if (this.samples.length >= this.config.samplesPerGesture) {
      this.completeCurrentPhase();
    }
  }

  /**
   * Complete current calibration phase
   */
  private completeCurrentPhase(): void {
    switch (this.phase) {
      case 'recordingRest':
        this.completeRestRecording();
        break;
      case 'recordingGesture':
        this.completeGestureRecording();
        break;
    }
  }

  /**
   * Complete rest position recording
   */
  private completeRestRecording(): void {
    if (this.samples.length < CALIBRATION.MIN_SAMPLES) {
      return;
    }

    // Calculate average rest position
    const sum = this.samples.reduce(
      (acc, s) => ({ x: acc.x + s.position.x, y: acc.y + s.position.y }),
      { x: 0, y: 0 }
    );
    this.restPosition = {
      x: sum.x / this.samples.length,
      y: sum.y / this.samples.length,
    };

    this.samples = [];
    this.setPhase('awaitingStart'); // Ready for gesture recording
  }

  /**
   * Start recording a new gesture
   */
  startGestureRecording(gestureName: string): void {
    this.currentGestureId = `gesture_${Date.now()}`;
    this.samples = [];
    this.setPhase('recordingGesture', { gestureId: this.currentGestureId, name: gestureName });
  }

  /**
   * Complete gesture recording
   */
  private completeGestureRecording(): void {
    if (this.samples.length < CALIBRATION.MIN_SAMPLES || !this.currentGestureId) {
      return;
    }

    // Calculate gesture bounds
    const bounds = this.samples.reduce(
      (acc, s) => ({
        minX: Math.min(acc.minX, s.position.x),
        maxX: Math.max(acc.maxX, s.position.x),
        minY: Math.min(acc.minY, s.position.y),
        maxY: Math.max(acc.maxY, s.position.y),
      }),
      { minX: 1, maxX: 0, minY: 1, maxY: 0 }
    );

    // Calculate threshold based on gesture range
    const rangeX = bounds.maxX - bounds.minX;
    const rangeY = bounds.maxY - bounds.minY;
    const threshold = Math.max(rangeX, rangeY) * 0.3;

    const gesture: CalibratedGesture = {
      id: this.currentGestureId,
      name: `Gesture ${this.gestures.length + 1}`,
      samples: [...this.samples],
      bounds,
      threshold,
    };

    this.gestures.push(gesture);
    this.samples = [];
    this.currentGestureId = null;
    this.setPhase('awaitingStart'); // Ready for more gestures or testing
  }

  /**
   * Enter testing phase
   */
  startTesting(): void {
    if (this.gestures.length === 0 && !this.restPosition) {
      return;
    }
    this.setPhase('testing');
  }

  /**
   * Complete calibration and create profile
   */
  complete(profileName: string, mode: AccessibilityMode = 'standard'): UserProfile {
    const profile: UserProfile = {
      id: `profile_${Date.now()}`,
      name: profileName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      restPosition: this.restPosition ?? { x: 0.5, y: 0.5 },
      movementRange: this.movementRange,
      gestures: this.gestures,
      accessibilityMode: mode,
      sensitivity: 1.0,
      soundPreset: 'default',
    };

    this.setPhase('complete', profile);
    return profile;
  }

  /**
   * Reset calibration session
   */
  reset(): void {
    this.phase = 'idle';
    this.samples = [];
    this.restPosition = null;
    this.movementRange = { minX: 1, maxX: 0, minY: 1, maxY: 0 };
    this.gestures = [];
    this.currentGestureId = null;
  }

  /**
   * Get current phase
   */
  getPhase(): CalibrationPhase {
    return this.phase;
  }

  /**
   * Get rest position
   */
  getRestPosition(): { x: number; y: number } | null {
    return this.restPosition;
  }

  /**
   * Get recorded gestures
   */
  getGestures(): CalibratedGesture[] {
    return [...this.gestures];
  }

  /**
   * Remove a gesture
   */
  removeGesture(gestureId: string): void {
    this.gestures = this.gestures.filter((g) => g.id !== gestureId);
  }

  /**
   * Subscribe to phase changes
   */
  onPhaseChange(callback: PhaseChangeCallback): () => void {
    this.phaseCallbacks.add(callback);
    return () => this.phaseCallbacks.delete(callback);
  }

  /**
   * Subscribe to progress updates
   */
  onProgress(callback: ProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  /**
   * Set phase and notify listeners
   */
  private setPhase(phase: CalibrationPhase, data?: unknown): void {
    this.phase = phase;
    this.phaseCallbacks.forEach((cb) => {
      try {
        cb(phase, data);
      } catch (error) {
        console.error('Phase callback error:', error);
      }
    });
  }

  /**
   * Notify progress listeners
   */
  private notifyProgress(progress: number): void {
    this.progressCallbacks.forEach((cb) => {
      try {
        cb(progress);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    });
  }
}
