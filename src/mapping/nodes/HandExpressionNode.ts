/**
 * Hand Expression Mapping Node
 *
 * Maps hand position and articulation to musical parameters.
 * Enables theremin-style continuous control.
 *
 * Supported mappings:
 * - Hand X position → pitch (left to right)
 * - Hand Y position → volume or pitch (top to bottom)
 * - Hand articulation (fist) → filter cutoff
 * - Hand spread (open hand) → reverb mix
 * - Hand distance from body → expression/dynamics
 *
 * Emits ControlChangeEvents for continuous parameter control.
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame, FeatureValue } from '../../state/types';
import { createControlChangeEvent, type MusicalEvent, type ControlParameter } from '../events';

/** Hand expression source type */
export type HandExpressionSource =
  | 'position_x'      // Hand X position (0-1)
  | 'position_y'      // Hand Y position (0-1)
  | 'velocity'        // Movement velocity
  | 'articulation'    // Fist/curl level (0=open, 1=fist)
  | 'spread'          // Finger spread (0=closed, 1=spread)
  | 'distance';       // Distance from body center

/** Hand expression to parameter mapping */
export interface HandExpressionMapping {
  /** Which hand to use */
  hand: 'left' | 'right' | 'either';
  /** Source value to read */
  source: HandExpressionSource;
  /** Target musical parameter */
  parameter: ControlParameter;
  /** Minimum output value (0-1) */
  min: number;
  /** Maximum output value (0-1) */
  max: number;
  /** Whether to invert the mapping */
  invert: boolean;
  /** Smoothing factor (0-1, higher = more smoothing) */
  smoothing: number;
  /** Curve exponent for non-linear mapping (1 = linear) */
  curve: number;
}

export interface HandExpressionConfig extends MappingNodeConfig {
  /** Expression mappings to apply */
  mappings: HandExpressionMapping[];
  /** Global sensitivity multiplier */
  sensitivity: number;
  /** Minimum change threshold to emit events */
  eventThreshold: number;
  /** Dead zone at edges (0-0.2) */
  deadZone: number;
}

/** Default hand expression mappings (theremin-style) */
export const DEFAULT_HAND_MAPPINGS: HandExpressionMapping[] = [
  {
    hand: 'right',
    source: 'position_y',
    parameter: 'pitch',
    min: 0.0,
    max: 1.0,
    invert: true, // Higher hand = higher pitch
    smoothing: 0.2,
    curve: 1.0,
  },
  {
    hand: 'left',
    source: 'position_y',
    parameter: 'volume',
    min: 0.0,
    max: 1.0,
    invert: true, // Higher hand = louder
    smoothing: 0.3,
    curve: 1.5, // Exponential for natural volume feel
  },
  {
    hand: 'right',
    source: 'articulation',
    parameter: 'filter_cutoff',
    min: 0.2,
    max: 1.0,
    invert: true, // Open hand = bright, fist = muted
    smoothing: 0.4,
    curve: 1.0,
  },
  {
    hand: 'left',
    source: 'spread',
    parameter: 'reverb_mix',
    min: 0.0,
    max: 0.8,
    invert: false, // Spread fingers = more reverb
    smoothing: 0.5,
    curve: 1.0,
  },
];

const DEFAULT_CONFIG: Omit<HandExpressionConfig, 'id' | 'name' | 'inputs'> = {
  enabled: true,
  mappings: DEFAULT_HAND_MAPPINGS,
  sensitivity: 1.0,
  eventThreshold: 0.01,
  deadZone: 0.05,
};

export class HandExpressionNode extends MappingNode {
  private expressionConfig: HandExpressionConfig;
  /** Smoothed values for each mapping */
  private smoothedValues: Map<string, number> = new Map();
  /** Last emitted values for threshold comparison */
  private lastEmittedValues: Map<string, number> = new Map();

  constructor(config: Partial<HandExpressionConfig> & Pick<MappingNodeConfig, 'id' | 'name'>) {
    const fullConfig: HandExpressionConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.expressionConfig = fullConfig;
  }

  /**
   * Process frame and output hand expression-based control values.
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

    // Get hand features from the frame
    const leftHand = this.getHandFeatures(frame, 'left');
    const rightHand = this.getHandFeatures(frame, 'right');

    const hasHand = leftHand !== null || rightHand !== null;

    if (!hasHand) {
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
      // Select the appropriate hand
      let handFeatures: HandFeatures | null = null;
      if (mapping.hand === 'right') {
        handFeatures = rightHand;
      } else if (mapping.hand === 'left') {
        handFeatures = leftHand;
      } else {
        // 'either' - use whichever is available, prefer right
        handFeatures = rightHand ?? leftHand;
      }

      if (!handFeatures) continue;

      // Get the source value
      let rawValue = this.getSourceValue(handFeatures, mapping.source);
      if (rawValue === null) continue;

      hasActiveExpression = true;

      // Apply sensitivity
      rawValue *= this.expressionConfig.sensitivity;

      // Apply dead zone
      const deadZone = this.expressionConfig.deadZone;
      if (rawValue < deadZone) {
        rawValue = 0;
      } else if (rawValue > 1 - deadZone) {
        rawValue = 1;
      } else {
        // Remap to 0-1 after dead zone
        rawValue = (rawValue - deadZone) / (1 - 2 * deadZone);
      }

      // Clamp
      rawValue = Math.max(0, Math.min(1, rawValue));

      // Apply curve
      if (mapping.curve !== 1) {
        rawValue = Math.pow(rawValue, mapping.curve);
      }

      // Apply inversion
      if (mapping.invert) {
        rawValue = 1 - rawValue;
      }

      // Apply smoothing
      const key = `${mapping.hand}-${mapping.source}-${mapping.parameter}`;
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

    // Return primary value (pitch for theremin-style control)
    const primaryValue = outputValues['pitch'] ?? outputValues['volume'] ?? 0;

    return {
      nodeId: this.id,
      value: primaryValue,
      active: hasActiveExpression,
      timestamp: frame.timestamp,
      events,
    };
  }

  /** Hand features injected from external source */
  private handFeaturesFromSource: { left: HandFeatures | null; right: HandFeatures | null } = {
    left: null,
    right: null,
  };

  /**
   * Set hand features directly (called by the MusicController
   * which has access to HandFeatureExtractor output)
   * Accepts the external format from HandFeatureExtractor and converts it
   */
  setHandFeatures(hand: 'left' | 'right', features: ExternalHandFeatures | null): void {
    if (features === null) {
      this.handFeaturesFromSource[hand] = null;
      return;
    }

    // Convert from external format (HandFeatureExtractor) to internal format
    this.handFeaturesFromSource[hand] = {
      position: { x: features.wristPosition.x, y: features.wristPosition.y },
      velocity: { x: 0, y: 0, magnitude: features.intensity }, // Use intensity as velocity magnitude
      articulation: features.articulation,
      spread: features.spread,
      intensity: features.intensity,
    };
  }

  /**
   * Get hand features from processed frame
   */
  private getHandFeatures(frame: ProcessedFrame, hand: 'left' | 'right'): HandFeatures | null {
    // First check if we have injected hand features
    if (this.handFeaturesFromSource[hand]) {
      return this.handFeaturesFromSource[hand];
    }

    // Look for hand features in the frame
    // Note: Due to video mirroring, left/right may be swapped
    const featureId = hand === 'right' ? 'rightHand' : 'leftHand';
    const feature = frame.features.get(featureId);

    if (!feature || !feature.isActive) {
      // Try alternate naming
      const altFeatureId = hand === 'right' ? 'right-hand' : 'left-hand';
      const altFeature = frame.features.get(altFeatureId);
      if (!altFeature || !altFeature.isActive) {
        return null;
      }
      return this.extractHandFeatures(altFeature);
    }

    return this.extractHandFeatures(feature);
  }

  /**
   * Extract hand features from a feature value
   * Uses basic position/velocity - articulation and spread need to be
   * injected via setHandFeatures for full functionality
   */
  private extractHandFeatures(feature: FeatureValue): HandFeatures {
    return {
      position: feature.position,
      velocity: feature.velocity,
      articulation: 0, // Will be 0 unless injected via setHandFeatures
      spread: 0.5,     // Default middle value
      intensity: feature.velocity.magnitude,
    };
  }

  /**
   * Get the source value from hand features
   */
  private getSourceValue(hand: HandFeatures, source: HandExpressionSource): number | null {
    switch (source) {
      case 'position_x':
        return hand.position.x;
      case 'position_y':
        return hand.position.y;
      case 'velocity':
        return Math.min(1, hand.velocity.magnitude * 5); // Scale velocity
      case 'articulation':
        return hand.articulation;
      case 'spread':
        return hand.spread;
      case 'distance':
        // Distance from center (0.5, 0.5)
        const dx = hand.position.x - 0.5;
        const dy = hand.position.y - 0.5;
        return Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      default:
        return null;
    }
  }

  /**
   * Set expression mappings
   */
  setMappings(mappings: HandExpressionMapping[]): void {
    this.expressionConfig.mappings = mappings;
    this.smoothedValues.clear();
    this.lastEmittedValues.clear();
  }

  /**
   * Add a single mapping
   */
  addMapping(mapping: HandExpressionMapping): void {
    this.expressionConfig.mappings.push(mapping);
  }

  /**
   * Set sensitivity multiplier
   */
  setSensitivity(sensitivity: number): void {
    this.expressionConfig.sensitivity = Math.max(0.1, Math.min(3.0, sensitivity));
  }

  /**
   * Set dead zone
   */
  setDeadZone(deadZone: number): void {
    this.expressionConfig.deadZone = Math.max(0, Math.min(0.2, deadZone));
  }

  /**
   * Get current configuration
   */
  getExpressionConfig(): HandExpressionConfig {
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

/** Hand features interface (internal format) */
interface HandFeatures {
  position: { x: number; y: number; z?: number };
  velocity: { x: number; y: number; z?: number; magnitude: number };
  articulation: number;
  spread: number;
  intensity: number;
}

/** External hand features format from HandFeatureExtractor */
export interface ExternalHandFeatures {
  intensity: number;
  articulation: number;
  spread: number;
  isTracked: boolean;
  wristPosition: { x: number; y: number };
}
