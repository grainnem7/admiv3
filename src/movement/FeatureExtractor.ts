/**
 * Feature Extractor
 *
 * Extracts movement data (position, velocity) from any tracked feature
 * defined in an InputProfile. Works with pose, hand, or face landmarks.
 */

import type {
  TrackingFrame,
  TrackedFeature,
  FeatureValue,
  FeatureModality,
} from '../state/types';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

interface FeatureHistory {
  position: { x: number; y: number; z: number };
  timestamp: number;
}

export class FeatureExtractor {
  private historyMap: Map<string, FeatureHistory[]> = new Map();
  private maxHistoryLength: number = 10;
  private maxHistoryAgeMs: number = 500;

  /**
   * Extract feature values from a tracking frame
   */
  extract(frame: TrackingFrame, feature: TrackedFeature): FeatureValue | null {
    const landmark = this.getLandmark(frame, feature.modality, feature.landmarkIndex);

    if (!landmark) {
      return null;
    }

    const position = {
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
    };

    // Get or create history for this feature
    let history = this.historyMap.get(feature.id);
    if (!history) {
      history = [];
      this.historyMap.set(feature.id, history);
    }

    // Add current position to history
    history.push({ position, timestamp: frame.timestamp });

    // Clean old history entries
    const cutoffTime = frame.timestamp - this.maxHistoryAgeMs;
    while (history.length > 0 && history[0].timestamp < cutoffTime) {
      history.shift();
    }
    while (history.length > this.maxHistoryLength) {
      history.shift();
    }

    // Calculate velocity
    const velocity = this.calculateVelocity(history, frame.timestamp);

    // Determine if feature is active based on velocity and visibility
    const visibility = landmark.visibility ?? 1;
    const isActive = velocity.magnitude > 0.001 && visibility > 0.5;

    return {
      featureId: feature.id,
      position,
      velocity,
      isActive,
      confidence: visibility,
      timestamp: frame.timestamp,
    };
  }

  /**
   * Extract multiple features at once
   */
  extractAll(frame: TrackingFrame, features: TrackedFeature[]): Map<string, FeatureValue> {
    const results = new Map<string, FeatureValue>();

    for (const feature of features) {
      if (feature.role === 'ignored') continue;

      const value = this.extract(frame, feature);
      if (value) {
        results.set(feature.id, value);
      }
    }

    return results;
  }

  /**
   * Get a specific landmark from the tracking frame
   */
  private getLandmark(
    frame: TrackingFrame,
    modality: FeatureModality,
    landmarkIndex: number
  ): NormalizedLandmark | null {
    // Handle special "computed" landmarks (index -1)
    if (landmarkIndex < 0) {
      return null; // Computed gestures don't have a single landmark
    }

    switch (modality) {
      case 'pose':
        return frame.pose?.landmarks[landmarkIndex] ?? null;

      case 'leftHand':
        return frame.leftHand?.landmarks[landmarkIndex] ?? null;

      case 'rightHand':
        return frame.rightHand?.landmarks[landmarkIndex] ?? null;

      case 'face':
        return frame.face?.landmarks[landmarkIndex] ?? null;

      case 'color': {
        if (!frame.color) return null;
        const blob = frame.color.blobs[landmarkIndex];
        if (!blob || !blob.found) return null;
        // Convert color blob to NormalizedLandmark-compatible shape
        // z = area (depth proxy), visibility = 1 when found
        return { x: blob.x, y: blob.y, z: blob.area, visibility: 1 } as NormalizedLandmark;
      }

      default:
        return null;
    }
  }

  /**
   * Calculate velocity from position history
   */
  private calculateVelocity(
    history: FeatureHistory[],
    _currentTime: number
  ): { x: number; y: number; z: number; magnitude: number } {
    if (history.length < 2) {
      return { x: 0, y: 0, z: 0, magnitude: 0 };
    }

    const current = history[history.length - 1];
    const previous = history[history.length - 2];

    const deltaTime = (current.timestamp - previous.timestamp) / 1000; // Convert to seconds
    if (deltaTime <= 0) {
      return { x: 0, y: 0, z: 0, magnitude: 0 };
    }

    const vx = (current.position.x - previous.position.x) / deltaTime;
    const vy = (current.position.y - previous.position.y) / deltaTime;
    const vz = (current.position.z - previous.position.z) / deltaTime;
    const magnitude = Math.sqrt(vx * vx + vy * vy + vz * vz);

    return { x: vx, y: vy, z: vz, magnitude };
  }

  /**
   * Get the primary axis value from a feature
   */
  getAxisValue(value: FeatureValue, axis: TrackedFeature['axis'], inverted: boolean = false): number {
    let result: number;

    switch (axis) {
      case 'x':
        result = value.position.x;
        break;
      case 'y':
        result = value.position.y;
        break;
      case 'z':
        result = value.position.z;
        break;
      case 'distance':
        // Distance from center (0.5, 0.5)
        const dx = value.position.x - 0.5;
        const dy = value.position.y - 0.5;
        result = Math.sqrt(dx * dx + dy * dy);
        break;
      case 'angle':
        // Angle from center
        result = Math.atan2(value.position.y - 0.5, value.position.x - 0.5) / Math.PI;
        break;
      default:
        result = value.position.y; // Default to Y axis
    }

    return inverted ? 1 - result : result;
  }

  /**
   * Reset history for a feature
   */
  resetFeature(featureId: string): void {
    this.historyMap.delete(featureId);
  }

  /**
   * Reset all feature history
   */
  reset(): void {
    this.historyMap.clear();
  }
}
