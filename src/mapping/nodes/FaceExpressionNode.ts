/**
 * Face Expression Mapping Node
 *
 * Maps face blendshapes to musical parameters for expressive control.
 *
 * Supported mappings:
 * - jawOpen → filter cutoff / volume
 * - browInnerUp → pitch bend / octave shift
 * - mouthSmileLeft/Right → harmonic richness
 * - eyeSquintLeft/Right → attack time
 * - mouthPucker → formant / filter resonance
 *
 * Emits ControlChangeEvents for continuous parameter control.
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame, FaceBlendshape } from '../../state/types';
import { createControlChangeEvent, type MusicalEvent, type ControlParameter } from '../events';
import { FACE_BLENDSHAPES } from '../../utils/constants';

/** Face expression to parameter mapping definition */
export interface FaceExpressionMapping {
  /** Blendshape name to read from */
  blendshape: string;
  /** Target musical parameter */
  parameter: ControlParameter;
  /** Minimum output value (0-1) */
  min: number;
  /** Maximum output value (0-1) */
  max: number;
  /** Whether to invert the mapping */
  invert: boolean;
  /** Threshold below which the blendshape is considered inactive */
  threshold: number;
  /** Smoothing factor (0-1, higher = more smoothing) */
  smoothing: number;
}

export interface FaceExpressionConfig extends MappingNodeConfig {
  /** Expression mappings to apply */
  mappings: FaceExpressionMapping[];
  /** Global sensitivity multiplier */
  sensitivity: number;
  /** Minimum change threshold to emit events */
  eventThreshold: number;
}

/** Default expression mappings */
export const DEFAULT_FACE_MAPPINGS: FaceExpressionMapping[] = [
  {
    blendshape: FACE_BLENDSHAPES.JAW_OPEN,
    parameter: 'filter_cutoff',
    min: 0.2,
    max: 1.0,
    invert: false,
    threshold: 0.1,
    smoothing: 0.3,
  },
  {
    blendshape: FACE_BLENDSHAPES.BROW_INNER_UP,
    parameter: 'pitch',
    min: 0.3,
    max: 0.7,
    invert: false,
    threshold: 0.15,
    smoothing: 0.4,
  },
  {
    blendshape: FACE_BLENDSHAPES.MOUTH_SMILE_LEFT,
    parameter: 'harmonic_richness',
    min: 0.0,
    max: 1.0,
    invert: false,
    threshold: 0.1,
    smoothing: 0.3,
  },
  {
    blendshape: FACE_BLENDSHAPES.EYE_SQUINT_LEFT,
    parameter: 'attack',
    min: 0.0,
    max: 0.5,
    invert: true, // More squint = faster attack
    threshold: 0.1,
    smoothing: 0.5,
  },
  {
    blendshape: FACE_BLENDSHAPES.MOUTH_PUCKER,
    parameter: 'filter_resonance',
    min: 0.0,
    max: 0.8,
    invert: false,
    threshold: 0.1,
    smoothing: 0.3,
  },
];

const DEFAULT_CONFIG: Omit<FaceExpressionConfig, 'id' | 'name' | 'inputs'> = {
  enabled: true,
  mappings: DEFAULT_FACE_MAPPINGS,
  sensitivity: 1.0,
  eventThreshold: 0.01,
};

export class FaceExpressionNode extends MappingNode {
  private expressionConfig: FaceExpressionConfig;
  /** Smoothed values for each mapping */
  private smoothedValues: Map<string, number> = new Map();
  /** Last emitted values for threshold comparison */
  private lastEmittedValues: Map<string, number> = new Map();

  constructor(config: Partial<FaceExpressionConfig> & Pick<MappingNodeConfig, 'id' | 'name'>) {
    const fullConfig: FaceExpressionConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.expressionConfig = fullConfig;
  }

  /**
   * Process frame and output expression-based control values.
   * Reads face blendshapes directly from the ProcessedFrame.
   */
  process(frame: ProcessedFrame): MappingNodeOutput {
    const events: MusicalEvent[] = [];

    if (!this.enabled) {
      return {
        nodeId: this.id,
        value: 0,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    // Get face blendshapes from the frame
    // The ProcessedFrame may have face data in its source TrackingFrame
    const blendshapes = this.getBlendshapes(frame);

    if (!blendshapes || blendshapes.length === 0) {
      return {
        nodeId: this.id,
        value: 0,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    let hasActiveExpression = false;
    const outputValues: Record<string, number> = {};

    // Process each mapping
    for (const mapping of this.expressionConfig.mappings) {
      const blendshape = blendshapes.find(b => b.categoryName === mapping.blendshape);
      if (!blendshape) continue;

      let rawValue = blendshape.score * this.expressionConfig.sensitivity;

      // Apply threshold
      if (rawValue < mapping.threshold) {
        rawValue = 0;
      } else {
        // Remap to 0-1 after threshold
        rawValue = (rawValue - mapping.threshold) / (1 - mapping.threshold);
        hasActiveExpression = true;
      }

      // Clamp
      rawValue = Math.max(0, Math.min(1, rawValue));

      // Apply inversion
      if (mapping.invert) {
        rawValue = 1 - rawValue;
      }

      // Apply smoothing
      const key = `${mapping.blendshape}-${mapping.parameter}`;
      const prevSmoothed = this.smoothedValues.get(key) ?? rawValue;
      const smoothed = prevSmoothed + (rawValue - prevSmoothed) * (1 - mapping.smoothing);
      this.smoothedValues.set(key, smoothed);

      // Map to output range
      const outputValue = mapping.min + smoothed * (mapping.max - mapping.min);
      outputValues[mapping.parameter] = outputValue;

      // Emit event if value changed significantly
      const lastEmitted = this.lastEmittedValues.get(key) ?? -1;
      if (Math.abs(outputValue - lastEmitted) >= this.expressionConfig.eventThreshold) {
        events.push(
          createControlChangeEvent(mapping.parameter, outputValue, frame.timestamp)
        );
        this.lastEmittedValues.set(key, outputValue);
      }
    }

    // Return primary value (filter_cutoff for backwards compatibility)
    const primaryValue = outputValues['filter_cutoff'] ?? 0;

    return {
      nodeId: this.id,
      value: primaryValue,
      active: hasActiveExpression,
      timestamp: frame.timestamp,
      events,
    };
  }

  /**
   * Extract blendshapes from the processed frame
   * Face blendshapes are stored in a special feature with ID 'face-blendshapes'
   * or can be accessed via the source tracking frame
   */
  private getBlendshapes(frame: ProcessedFrame): FaceBlendshape[] | null {
    // Check for face blendshapes stored as a special feature
    // The MultiModalProcessor should store these when face tracking is active
    const faceBlendshapesFeature = frame.features.get('face-blendshapes');
    if (faceBlendshapesFeature) {
      // Blendshapes are encoded in the feature's position/velocity as a workaround
      // This is a temporary solution until we add proper metadata support
      return null; // Will be implemented when processor is updated
    }

    // For now, return null - the FaceExpressionNode will need to be
    // integrated with direct access to face blendshapes from the tracking frame
    return this.blendshapesFromSource;
  }

  /** Blendshapes injected from external source */
  private blendshapesFromSource: FaceBlendshape[] | null = null;

  /**
   * Set blendshapes directly (called by the performance screen
   * which has access to the full TrackingFrame)
   */
  setBlendshapes(blendshapes: FaceBlendshape[] | null): void {
    this.blendshapesFromSource = blendshapes;
  }

  /**
   * Set expression mappings
   */
  setMappings(mappings: FaceExpressionMapping[]): void {
    this.expressionConfig.mappings = mappings;
    this.smoothedValues.clear();
    this.lastEmittedValues.clear();
  }

  /**
   * Add a single mapping
   */
  addMapping(mapping: FaceExpressionMapping): void {
    this.expressionConfig.mappings.push(mapping);
  }

  /**
   * Remove a mapping by blendshape name
   */
  removeMapping(blendshape: string): void {
    this.expressionConfig.mappings = this.expressionConfig.mappings.filter(
      m => m.blendshape !== blendshape
    );
  }

  /**
   * Set sensitivity multiplier
   */
  setSensitivity(sensitivity: number): void {
    this.expressionConfig.sensitivity = Math.max(0.1, Math.min(3.0, sensitivity));
  }

  /**
   * Get current configuration
   */
  getExpressionConfig(): FaceExpressionConfig {
    return { ...this.expressionConfig };
  }

  /**
   * Reset smoothed values
   */
  reset(): void {
    this.smoothedValues.clear();
    this.lastEmittedValues.clear();
  }
}
