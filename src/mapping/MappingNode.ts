/**
 * Mapping Node - Base class for modular mapping architecture
 *
 * Mapping nodes transform feature values into musical parameters.
 * This is the "MusiKraken-inspired" architecture that separates
 * WHAT is detected (movement events) from HOW it maps (musical function).
 *
 * @see mapping_requirements.md Section 4
 */

import type {
  ProcessedFrame,
  MappingInput,
  MappingCurve,
} from '../state/types';
import type { MusicalEvent } from './events';

/**
 * Output from a mapping node.
 *
 * Extended to include MusicalEvents per the mapping spec.
 * The `events` array contains discrete MusicalEvents emitted this frame.
 * The `value` field is retained for backward compatibility with
 * continuous parameter control.
 */
export interface MappingNodeOutput {
  nodeId: string;
  /** Primary output value (normalized 0-1 or specific range) */
  value: number;
  /** Whether this node is actively producing output */
  active: boolean;
  /** Timestamp of this output */
  timestamp: number;
  /**
   * MusicalEvents emitted by this node this frame.
   * @see mapping_requirements.md Section 3
   */
  events: MusicalEvent[];
}

/**
 * Base configuration for all mapping nodes
 */
export interface MappingNodeConfig {
  id: string;
  name: string;
  enabled: boolean;
  inputs: MappingInput[];
}

/**
 * Apply a mapping curve to transform a value
 */
export function applyCurve(value: number, curve: MappingCurve): number {
  // Clamp input to 0-1
  const clamped = Math.max(0, Math.min(1, value));

  switch (curve) {
    case 'linear':
      return clamped;

    case 'exponential':
      // Exponential curve for more control at lower values
      return clamped * clamped;

    case 'logarithmic':
      // Logarithmic curve for more control at higher values
      return Math.sqrt(clamped);

    case 'step':
      // Quantize to 8 steps
      return Math.round(clamped * 8) / 8;

    default:
      return clamped;
  }
}

/**
 * Normalize a value from input range to output range
 */
export function normalizeValue(
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number
): number {
  if (inputMax === inputMin) return outputMin;

  const normalized = (value - inputMin) / (inputMax - inputMin);
  const clamped = Math.max(0, Math.min(1, normalized));
  return outputMin + clamped * (outputMax - outputMin);
}

/**
 * Abstract base class for mapping nodes
 */
export abstract class MappingNode {
  protected config: MappingNodeConfig;

  constructor(config: MappingNodeConfig) {
    this.config = config;
  }

  /**
   * Get node ID
   */
  get id(): string {
    return this.config.id;
  }

  /**
   * Get node name
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Check if node is enabled
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable the node
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Get input configurations
   */
  get inputs(): MappingInput[] {
    return this.config.inputs;
  }

  /**
   * Process a frame and produce output
   */
  abstract process(frame: ProcessedFrame): MappingNodeOutput;

  /**
   * Get the combined input value from all inputs
   */
  protected getInputValue(frame: ProcessedFrame): number {
    if (this.config.inputs.length === 0) {
      return 0;
    }

    let totalValue = 0;
    let activeInputs = 0;

    for (const input of this.config.inputs) {
      const featureValue = frame.features.get(input.sourceFeatureId);
      if (!featureValue) continue;

      // Get raw value based on source type
      let rawValue: number;
      switch (input.sourceType) {
        case 'position':
          rawValue = featureValue.position.y; // Default to Y axis
          break;
        case 'velocity':
          rawValue = featureValue.velocity.magnitude;
          break;
        case 'gesture':
          // Look for matching gesture
          const gesture = frame.gestures.find(
            (g) => g.gestureId === input.sourceFeatureId
          );
          rawValue = gesture?.value ?? 0;
          break;
        default:
          rawValue = 0;
      }

      // Normalize to input range
      const normalized = normalizeValue(
        rawValue,
        input.inputRange.min,
        input.inputRange.max,
        0,
        1
      );

      // Apply curve
      const curved = applyCurve(normalized, input.curve);

      // Apply inversion
      const finalValue = input.inverted ? 1 - curved : curved;

      // Map to output range
      const outputValue = normalizeValue(
        finalValue,
        0,
        1,
        input.outputRange.min,
        input.outputRange.max
      );

      totalValue += outputValue;
      activeInputs++;
    }

    // Average if multiple inputs
    return activeInputs > 0 ? totalValue / activeInputs : 0;
  }

  /**
   * Check if any input is active
   */
  protected hasActiveInput(frame: ProcessedFrame): boolean {
    for (const input of this.config.inputs) {
      const featureValue = frame.features.get(input.sourceFeatureId);
      if (featureValue?.isActive) {
        return true;
      }
    }
    return false;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MappingNodeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add an input connection
   */
  addInput(input: MappingInput): void {
    this.config.inputs.push(input);
  }

  /**
   * Remove an input connection
   */
  removeInput(sourceFeatureId: string): void {
    this.config.inputs = this.config.inputs.filter(
      (i) => i.sourceFeatureId !== sourceFeatureId
    );
  }

  /**
   * Get configuration for serialization
   */
  getConfig(): MappingNodeConfig {
    return { ...this.config };
  }
}
