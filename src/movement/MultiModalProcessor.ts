/**
 * Multi-Modal Processor
 *
 * Orchestrates movement processing for all active features defined
 * in an InputProfile. Combines feature extraction, gesture detection,
 * signal smoothing, and dwell detection into a unified ProcessedFrame.
 */

import type {
  TrackingFrame,
  InputProfile,
  ProcessedFrame,
  FeatureValue,
  DetectedGesture,
  SmoothingLevel,
} from '../state/types';
import { FeatureExtractor } from './FeatureExtractor';
import { GestureDetector } from './GestureDetector';
import { SignalSmoother, type SmootherConfig } from './SignalSmoother';
import { DwellDetector } from './DwellDetector';

export interface MultiModalProcessorConfig {
  /** Enable signal smoothing */
  enableSmoothing?: boolean;
  /** Enable dwell detection */
  enableDwell?: boolean;
}

const DEFAULT_CONFIG: Required<MultiModalProcessorConfig> = {
  enableSmoothing: true,
  enableDwell: true,
};

/**
 * Map smoothing level to filter parameters
 * Higher beta = less lag during fast movement
 * Higher minCutoff = less smoothing at rest
 */
const SMOOTHING_PRESETS: Record<SmoothingLevel, SmootherConfig> = {
  none: { minCutoff: 10, beta: 0, dCutoff: 1 },
  light: { minCutoff: 3.0, beta: 0.8, dCutoff: 1 },    // Very responsive
  medium: { minCutoff: 1.5, beta: 0.5, dCutoff: 1 },   // Balanced (default)
  heavy: { minCutoff: 0.8, beta: 0.2, dCutoff: 1 },    // More stable but still responsive
};

export class MultiModalProcessor {
  private featureExtractor: FeatureExtractor;
  private gestureDetector: GestureDetector;
  private smoother: SignalSmoother;
  private dwellDetector: DwellDetector;
  private config: Required<MultiModalProcessorConfig>;

  private currentProfile: InputProfile | null = null;
  private lastProcessedFrame: ProcessedFrame | null = null;

  constructor(config: MultiModalProcessorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.featureExtractor = new FeatureExtractor();
    this.gestureDetector = new GestureDetector();
    this.smoother = new SignalSmoother();
    this.dwellDetector = new DwellDetector();
  }

  /**
   * Set the input profile for processing
   */
  setProfile(profile: InputProfile): void {
    this.currentProfile = profile;

    // Register gestures from profile
    this.gestureDetector.clearGestures();
    this.gestureDetector.registerGestures(profile.gestures);

    // Configure smoother
    const smoothingConfig = SMOOTHING_PRESETS[profile.movementSettings.smoothingLevel];
    this.smoother.setConfig(smoothingConfig);

    // Configure dwell detector
    if (profile.movementSettings.dwellEnabled) {
      this.dwellDetector.setConfig({
        dwellTimeMs: profile.movementSettings.dwellTimeMs,
        dwellRadius: profile.movementSettings.velocityThreshold * 3, // Use velocity as radius proxy
      });
    }

    // Reset state
    this.reset();
  }

  /**
   * Process a tracking frame according to the current profile
   */
  process(frame: TrackingFrame): ProcessedFrame | null {
    if (!this.currentProfile) {
      return null;
    }

    const profile = this.currentProfile;

    // Step 1: Apply smoothing to raw landmarks if enabled
    let processedFrame = frame;
    if (this.config.enableSmoothing && frame.pose) {
      const smoothedPose = this.smoother.smooth(frame.pose);
      processedFrame = { ...frame, pose: smoothedPose };
    }

    // Step 2: Extract features
    const features = this.featureExtractor.extractAll(
      processedFrame,
      profile.trackedFeatures.filter((f) => f.role !== 'ignored')
    );

    // Step 3: Apply sensitivity multiplier
    for (const value of features.values()) {
      value.velocity.magnitude *= profile.sensitivity;
    }

    // Step 4: Detect gestures
    const gestures = this.gestureDetector.detect(processedFrame);

    // Step 5: Apply dwell detection if enabled
    if (this.config.enableDwell && profile.movementSettings.dwellEnabled) {
      this.processDwell(features, processedFrame.timestamp);
    }

    // Step 6: Apply velocity threshold
    for (const value of features.values()) {
      const threshold = profile.movementSettings.velocityThreshold * profile.sensitivity;
      if (value.velocity.magnitude < threshold) {
        value.isActive = false;
      }
    }

    // Step 7: Apply stability check
    // Features need to maintain velocity for stabilityFrames to be truly active
    // This is handled by the velocity history in FeatureExtractor

    const result: ProcessedFrame = {
      features,
      gestures,
      timestamp: frame.timestamp,
    };

    this.lastProcessedFrame = result;
    return result;
  }

  /**
   * Process dwell detection for continuous features
   */
  private processDwell(features: Map<string, FeatureValue>, timestamp: number): void {
    // Use the first continuous feature for dwell detection
    const continuousFeatures = this.currentProfile?.trackedFeatures.filter(
      (f) => f.role === 'continuous'
    );

    if (!continuousFeatures || continuousFeatures.length === 0) return;

    const primaryFeature = features.get(continuousFeatures[0].id);
    if (!primaryFeature) return;

    // Feed position to dwell detector
    const dwellState = this.dwellDetector.update(
      { x: primaryFeature.position.x, y: primaryFeature.position.y },
      timestamp
    );

    // Update feature active state based on dwell
    if (dwellState.state === 'triggered') {
      primaryFeature.isActive = true;
    }
  }

  /**
   * Get the last processed frame
   */
  getLastFrame(): ProcessedFrame | null {
    return this.lastProcessedFrame;
  }

  /**
   * Get the primary feature value (first continuous feature)
   */
  getPrimaryFeature(): FeatureValue | null {
    if (!this.lastProcessedFrame || !this.currentProfile) return null;

    const continuousFeatures = this.currentProfile.trackedFeatures.filter(
      (f) => f.role === 'continuous'
    );

    if (continuousFeatures.length === 0) return null;

    return this.lastProcessedFrame.features.get(continuousFeatures[0].id) ?? null;
  }

  /**
   * Get value from a specific feature
   */
  getFeatureValue(featureId: string): FeatureValue | null {
    return this.lastProcessedFrame?.features.get(featureId) ?? null;
  }

  /**
   * Check if a gesture was triggered in the last frame
   */
  wasGestureTriggered(gestureId: string): boolean {
    if (!this.lastProcessedFrame) return false;

    const gesture = this.lastProcessedFrame.gestures.find((g) => g.gestureId === gestureId);
    return gesture?.triggered ?? false;
  }

  /**
   * Get all triggered gestures from the last frame
   */
  getTriggeredGestures(): DetectedGesture[] {
    if (!this.lastProcessedFrame) return [];
    return this.lastProcessedFrame.gestures.filter((g) => g.triggered);
  }

  /**
   * Get the current profile
   */
  getProfile(): InputProfile | null {
    return this.currentProfile;
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.featureExtractor.reset();
    this.gestureDetector.reset();
    this.smoother.reset();
    this.dwellDetector.reset();
    this.lastProcessedFrame = null;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MultiModalProcessorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
let processorInstance: MultiModalProcessor | null = null;

export function getMultiModalProcessor(): MultiModalProcessor {
  if (!processorInstance) {
    processorInstance = new MultiModalProcessor();
  }
  return processorInstance;
}
