/**
 * Signal Smoother - Smooths pose landmark data to reduce jitter
 */

import { OneEuroFilter } from '../utils/filters';
import type { PoseLandmarks } from '../state/types';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

interface LandmarkFilters {
  x: OneEuroFilter;
  y: OneEuroFilter;
  z: OneEuroFilter;
}

export interface SmootherConfig {
  /** Minimum cutoff frequency - higher = less smoothing at rest */
  minCutoff?: number;
  /** Speed coefficient - higher = less lag during fast movement */
  beta?: number;
  /** Derivative cutoff frequency */
  dCutoff?: number;
}

const DEFAULT_CONFIG: Required<SmootherConfig> = {
  minCutoff: 1.5,   // Higher = less smoothing at rest, more responsive
  beta: 0.5,        // Much higher = less lag during fast movement (was 0.007)
  dCutoff: 1.0,
};

export class SignalSmoother {
  private filters: Map<number, LandmarkFilters> = new Map();
  private config: Required<SmootherConfig>;

  constructor(config: SmootherConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Smooth a set of pose landmarks
   */
  smooth(landmarks: PoseLandmarks): PoseLandmarks {
    const smoothedLandmarks = landmarks.landmarks.map((landmark, index) =>
      this.smoothLandmark(landmark, index, landmarks.timestamp)
    );

    const smoothedWorldLandmarks = landmarks.worldLandmarks.map((landmark, index) =>
      this.smoothLandmark(landmark, index + 100, landmarks.timestamp) // Offset index for world landmarks
    );

    return {
      landmarks: smoothedLandmarks,
      worldLandmarks: smoothedWorldLandmarks,
      timestamp: landmarks.timestamp,
    };
  }

  /**
   * Smooth a single landmark
   */
  private smoothLandmark(
    landmark: NormalizedLandmark,
    index: number,
    timestamp: number
  ): NormalizedLandmark {
    let filters = this.filters.get(index);

    if (!filters) {
      filters = {
        x: new OneEuroFilter(this.config.minCutoff, this.config.beta, this.config.dCutoff),
        y: new OneEuroFilter(this.config.minCutoff, this.config.beta, this.config.dCutoff),
        z: new OneEuroFilter(this.config.minCutoff, this.config.beta, this.config.dCutoff),
      };
      this.filters.set(index, filters);
    }

    return {
      x: filters.x.filter(landmark.x, timestamp),
      y: filters.y.filter(landmark.y, timestamp),
      z: filters.z.filter(landmark.z, timestamp),
      visibility: landmark.visibility,
    };
  }

  /**
   * Reset all filters
   */
  reset(): void {
    this.filters.clear();
  }

  /**
   * Update smoother configuration
   */
  setConfig(config: Partial<SmootherConfig>): void {
    this.config = { ...this.config, ...config };
    // Reset filters to apply new config
    this.reset();
  }

  /**
   * Adjust smoothing for different accessibility modes
   */
  setAccessibilityMode(mode: 'standard' | 'lowMobility' | 'dwell' | 'singleSwitch'): void {
    switch (mode) {
      case 'lowMobility':
        // More smoothing for small movements, but still responsive
        this.setConfig({ minCutoff: 1.0, beta: 0.3 });
        break;
      case 'dwell':
        // More smoothing for stability detection
        this.setConfig({ minCutoff: 0.8, beta: 0.2 });
        break;
      case 'singleSwitch':
        // Minimal smoothing, maximum responsiveness
        this.setConfig({ minCutoff: 3.0, beta: 1.0 });
        break;
      default:
        // Standard settings
        this.setConfig(DEFAULT_CONFIG);
    }
  }
}
