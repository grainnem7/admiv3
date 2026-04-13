/**
 * Color Expression Mapping Node
 *
 * Maps color blob position and area to musical parameters.
 * MusiKraken-style: each tracked color can independently control
 * any parameter (pitch, volume, filter, effects, etc.).
 *
 * Supports auto modes for user-friendly presets:
 * - Theremin: one color → pitch (X) + volume (Y)
 * - Mixer: each color → different parameter
 * - XY Pad: one color → pitch (X) + filter (Y) + volume (area)
 * - Simple: one color → pitch (Y)
 *
 * Emits ControlChangeEvents for continuous parameter control.
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame } from '../../state/types';
import { createControlChangeEvent, type MusicalEvent, type ControlParameter } from '../events';
import type { ColorBlob, ColorTrackingOutput } from '../../tracking/ColorTracker';

// ============================================
// Types
// ============================================

/** What aspect of the color blob to read */
export type ColorExpressionSource =
  | 'position_x'    // Blob X position (0-1)
  | 'position_y'    // Blob Y position (0-1)
  | 'area'          // Blob area (0-1, larger object = higher value)
  | 'velocity'      // Movement speed of blob between frames
  | 'distance';     // Distance from screen center (0 = center, 1 = edge)

/** Per-color mapping definition */
export interface ColorExpressionMapping {
  /** Which color blob to read ('red', 'green', 'primary', 'custom-1', etc.) */
  colorId: string;
  /** What to read from the blob */
  source: ColorExpressionSource;
  /** Target musical parameter */
  parameter: ControlParameter;
  /** Output range min (0-1) */
  min: number;
  /** Output range max (0-1) */
  max: number;
  /** Flip direction */
  invert: boolean;
  /** Smoothing factor (0-1, higher = more smoothing) */
  smoothing: number;
  /** Curve exponent: 1 = linear, 2 = exponential, 0.5 = logarithmic */
  curve: number;
}

export interface ColorExpressionConfig extends MappingNodeConfig {
  /** Expression mappings to apply */
  mappings: ColorExpressionMapping[];
  /** Global sensitivity multiplier (0.1 - 3.0) */
  sensitivity: number;
  /** Min change to emit ControlChangeEvent (default 0.02) */
  eventThreshold: number;
  /** Edge dead zone (default 0.05) */
  deadZone: number;
}

// ============================================
// Auto Mode Presets
// ============================================

/** Available auto modes for quick setup */
export type ColorAutoMode = 'theremin' | 'mixer' | 'xy-pad' | 'single';

export interface ColorAutoModeDefinition {
  name: string;
  description: string;
  mappings: ColorExpressionMapping[];
}

export const COLOR_AUTO_MODES: Record<ColorAutoMode, ColorAutoModeDefinition> = {
  theremin: {
    name: 'Theremin',
    description: 'One color controls pitch (X) and volume (Y) \u2014 hold one object and play!',
    mappings: [
      { colorId: 'primary', source: 'position_x', parameter: 'pitch', min: 0, max: 1, invert: false, smoothing: 0.2, curve: 1 },
      { colorId: 'primary', source: 'position_y', parameter: 'volume', min: 0, max: 1, invert: true, smoothing: 0.3, curve: 1.5 },
    ],
  },
  mixer: {
    name: 'Color Mixer',
    description: 'Each color controls a different parameter \u2014 use up to 4 objects',
    mappings: [
      { colorId: 'red', source: 'position_y', parameter: 'pitch', min: 0, max: 1, invert: true, smoothing: 0.2, curve: 1 },
      { colorId: 'green', source: 'position_y', parameter: 'volume', min: 0, max: 1, invert: true, smoothing: 0.3, curve: 1.5 },
      { colorId: 'blue', source: 'position_y', parameter: 'filter_cutoff', min: 0.1, max: 1, invert: true, smoothing: 0.4, curve: 1 },
      { colorId: 'yellow', source: 'position_y', parameter: 'reverb_mix', min: 0, max: 0.8, invert: true, smoothing: 0.5, curve: 1 },
    ],
  },
  'xy-pad': {
    name: 'XY Pad',
    description: 'One color: X = pitch, Y = filter. Area = volume (bigger object = louder)',
    mappings: [
      { colorId: 'primary', source: 'position_x', parameter: 'pitch', min: 0, max: 1, invert: false, smoothing: 0.2, curve: 1 },
      { colorId: 'primary', source: 'position_y', parameter: 'filter_cutoff', min: 0.1, max: 1, invert: true, smoothing: 0.3, curve: 1 },
      { colorId: 'primary', source: 'area', parameter: 'volume', min: 0.2, max: 1, invert: false, smoothing: 0.4, curve: 1 },
    ],
  },
  single: {
    name: 'Simple',
    description: 'One color, one parameter \u2014 move up/down to change pitch. Great for getting started!',
    mappings: [
      { colorId: 'primary', source: 'position_y', parameter: 'pitch', min: 0, max: 1, invert: true, smoothing: 0.25, curve: 1 },
    ],
  },
};

// ============================================
// Default Config
// ============================================

const DEFAULT_CONFIG: Omit<ColorExpressionConfig, 'id' | 'name' | 'inputs'> = {
  enabled: false,
  mappings: COLOR_AUTO_MODES.theremin.mappings,
  sensitivity: 1.0,
  eventThreshold: 0.02,
  deadZone: 0.05,
};

// ============================================
// ColorExpressionNode
// ============================================

export class ColorExpressionNode extends MappingNode {
  private expressionConfig: ColorExpressionConfig;
  /** Smoothed values for each mapping */
  private smoothedValues: Map<string, number> = new Map();
  /** Last emitted values for threshold comparison */
  private lastEmittedValues: Map<string, number> = new Map();
  /** Previous blob positions for velocity calculation */
  private previousPositions: Map<string, { x: number; y: number; timestamp: number }> = new Map();
  /** Injected color tracking output (set by MusicController or MappingEngine) */
  private colorOutput: ColorTrackingOutput | null = null;

  constructor(config: Partial<ColorExpressionConfig> & Pick<MappingNodeConfig, 'id' | 'name'>) {
    const fullConfig: ColorExpressionConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.expressionConfig = fullConfig;
  }

  /**
   * Inject color tracking output directly (called each frame by the pipeline).
   * This is the primary data source — the node doesn't read from ProcessedFrame features
   * because color blobs have richer data (colorId, area) than generic FeatureValues.
   */
  setColorOutput(output: ColorTrackingOutput | null): void {
    this.colorOutput = output;
  }

  /**
   * Process frame and output color expression-based control values.
   */
  process(frame: ProcessedFrame): MappingNodeOutput {
    const events: MusicalEvent[] = [];

    if (!this.enabled || !this.colorOutput) {
      return {
        nodeId: this.id,
        value: 0,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    const { blobs, primaryBlob } = this.colorOutput;
    const hasAnyBlob = blobs.some(b => b.found) || primaryBlob !== null;

    if (!hasAnyBlob) {
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

    for (const mapping of this.expressionConfig.mappings) {
      // Find the blob for this mapping
      const blob = this.findBlob(mapping.colorId, blobs, primaryBlob);
      if (!blob || !blob.found) continue;

      // Get raw value from source
      let rawValue = this.getSourceValue(blob, mapping.source, frame.timestamp);
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

      // Apply smoothing (EMA)
      const key = `${mapping.colorId}-${mapping.source}-${mapping.parameter}`;
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

  /**
   * Find the blob matching a colorId.
   * 'primary' is a special value = largest detected blob.
   */
  private findBlob(
    colorId: string,
    blobs: ColorBlob[],
    primaryBlob: ColorBlob | null
  ): ColorBlob | null {
    if (colorId === 'primary') {
      // Use primaryBlob, or fall back to first found blob
      if (primaryBlob && primaryBlob.found) return primaryBlob;
      return blobs.find(b => b.found) ?? null;
    }
    return blobs.find(b => b.colorId === colorId) ?? null;
  }

  /**
   * Get the source value from a color blob.
   */
  private getSourceValue(
    blob: ColorBlob,
    source: ColorExpressionSource,
    timestamp: number
  ): number | null {
    switch (source) {
      case 'position_x':
        return blob.x;

      case 'position_y':
        return blob.y;

      case 'area':
        // Scale area to 0-1 (raw area is typically 0-0.1)
        return Math.min(1, blob.area * 10);

      case 'velocity': {
        const prevKey = blob.colorId;
        const prev = this.previousPositions.get(prevKey);
        this.previousPositions.set(prevKey, { x: blob.x, y: blob.y, timestamp });

        if (!prev) return 0;
        const dt = (timestamp - prev.timestamp) / 1000;
        if (dt <= 0) return 0;

        const dx = blob.x - prev.x;
        const dy = blob.y - prev.y;
        const speed = Math.sqrt(dx * dx + dy * dy) / dt;
        // Normalize: ~2 units/sec = full velocity
        return Math.min(1, speed / 2);
      }

      case 'distance': {
        const dx = blob.x - 0.5;
        const dy = blob.y - 0.5;
        // Max distance from center to corner is ~0.707
        return Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      }

      default:
        return null;
    }
  }

  // ============================================
  // Configuration Methods
  // ============================================

  /**
   * Apply an auto mode preset
   */
  setAutoMode(mode: ColorAutoMode): void {
    const preset = COLOR_AUTO_MODES[mode];
    this.expressionConfig.mappings = [...preset.mappings];
    this.smoothedValues.clear();
    this.lastEmittedValues.clear();
    this.previousPositions.clear();
  }

  /**
   * Set custom expression mappings
   */
  setMappings(mappings: ColorExpressionMapping[]): void {
    this.expressionConfig.mappings = mappings;
    this.smoothedValues.clear();
    this.lastEmittedValues.clear();
    this.previousPositions.clear();
  }

  /**
   * Add a single mapping
   */
  addMapping(mapping: ColorExpressionMapping): void {
    this.expressionConfig.mappings.push(mapping);
  }

  /**
   * Remove mappings for a specific color and parameter
   */
  removeMapping(colorId: string, parameter: ControlParameter): void {
    this.expressionConfig.mappings = this.expressionConfig.mappings.filter(
      m => !(m.colorId === colorId && m.parameter === parameter)
    );
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
  getExpressionConfig(): ColorExpressionConfig {
    return { ...this.expressionConfig };
  }

  /**
   * Get current mappings
   */
  getMappings(): ColorExpressionMapping[] {
    return [...this.expressionConfig.mappings];
  }

  /**
   * Reset smoothed values and velocity history
   */
  reset(): void {
    this.smoothedValues.clear();
    this.lastEmittedValues.clear();
    this.previousPositions.clear();
    this.colorOutput = null;
  }
}
