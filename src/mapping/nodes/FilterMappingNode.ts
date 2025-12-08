/**
 * Filter Mapping Node
 *
 * Maps input values to filter parameters (cutoff, resonance).
 * Useful for expressive timbral control.
 *
 * Emits ControlChangeEvents for filter_cutoff parameter.
 * @see mapping_requirements.md Section 7.4
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame } from '../../state/types';
import { createControlChangeEvent, type MusicalEvent } from '../events';

export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

export interface FilterMappingConfig extends MappingNodeConfig {
  /** Filter type */
  filterType: FilterType;
  /** Minimum cutoff frequency in Hz */
  cutoffMin: number;
  /** Maximum cutoff frequency in Hz */
  cutoffMax: number;
  /** Base resonance (Q factor) */
  resonance: number;
  /** Whether to also map resonance from a secondary input */
  mapResonance: boolean;
  /** Smoothing time for cutoff changes in ms */
  smoothingTime: number;
  /**
   * Whether to emit ControlChangeEvents.
   * When true, emits filter_cutoff events each frame when active.
   * @default true
   */
  emitEvents: boolean;
  /**
   * Minimum change threshold to emit an event (0-1).
   * Prevents flooding with events when value barely changes.
   * @default 0.001
   */
  eventThreshold: number;
}

const DEFAULT_CONFIG: Omit<FilterMappingConfig, 'id' | 'name' | 'inputs'> = {
  enabled: true,
  filterType: 'lowpass',
  cutoffMin: 200,
  cutoffMax: 8000,
  resonance: 1,
  mapResonance: false,
  smoothingTime: 50,
  emitEvents: true,
  eventThreshold: 0.001,
};

export class FilterMappingNode extends MappingNode {
  private filterConfig: FilterMappingConfig;
  private currentCutoff: number;
  private lastTimestamp: number = 0;
  /** Last normalized value emitted as event (for threshold comparison) */
  private lastEmittedNormalized: number = -1;

  constructor(config: Partial<FilterMappingConfig> & Pick<MappingNodeConfig, 'id' | 'name'>) {
    const fullConfig: FilterMappingConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.filterConfig = fullConfig;
    this.currentCutoff = fullConfig.cutoffMin;
  }

  /**
   * Process frame and output filter cutoff frequency.
   *
   * Emits ControlChangeEvent for filter_cutoff when:
   * - emitEvents is enabled
   * - The node has active input
   * - The normalized value has changed by more than eventThreshold
   *
   * @see mapping_requirements.md Section 7.4
   */
  process(frame: ProcessedFrame): MappingNodeOutput {
    if (!this.enabled) {
      return {
        nodeId: this.id,
        value: this.filterConfig.cutoffMin,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    const inputValue = this.getInputValue(frame);
    const isActive = this.hasActiveInput(frame);

    // Calculate delta time for smoothing
    const deltaTime = this.lastTimestamp > 0 ? frame.timestamp - this.lastTimestamp : 16;
    this.lastTimestamp = frame.timestamp;

    // Map input to cutoff range (exponential for perceptual linearity)
    const minLog = Math.log(this.filterConfig.cutoffMin);
    const maxLog = Math.log(this.filterConfig.cutoffMax);
    const targetCutoff = Math.exp(minLog + inputValue * (maxLog - minLog));

    // Apply smoothing
    if (this.filterConfig.smoothingTime > 0) {
      const smoothingFactor = Math.min(1, deltaTime / this.filterConfig.smoothingTime);
      this.currentCutoff += (targetCutoff - this.currentCutoff) * smoothingFactor;
    } else {
      this.currentCutoff = targetCutoff;
    }

    // Build events array
    const events: MusicalEvent[] = [];

    // Emit ControlChangeEvent if enabled and value changed significantly
    if (this.filterConfig.emitEvents && isActive) {
      // Normalize cutoff to 0-1 for the event
      const normalizedValue = (Math.log(this.currentCutoff) - minLog) / (maxLog - minLog);
      const clampedNormalized = Math.max(0, Math.min(1, normalizedValue));

      // Only emit if change exceeds threshold
      if (
        this.lastEmittedNormalized < 0 ||
        Math.abs(clampedNormalized - this.lastEmittedNormalized) >= this.filterConfig.eventThreshold
      ) {
        events.push(
          createControlChangeEvent('filter_cutoff', clampedNormalized, frame.timestamp)
        );
        this.lastEmittedNormalized = clampedNormalized;
      }
    }

    return {
      nodeId: this.id,
      value: this.currentCutoff,
      active: isActive,
      timestamp: frame.timestamp,
      events,
    };
  }

  /**
   * Set cutoff range
   */
  setRange(min: number, max: number): void {
    this.filterConfig.cutoffMin = Math.max(20, Math.min(20000, min));
    this.filterConfig.cutoffMax = Math.max(20, Math.min(20000, max));
  }

  /**
   * Set filter type
   */
  setFilterType(type: FilterType): void {
    this.filterConfig.filterType = type;
  }

  /**
   * Set resonance
   */
  setResonance(q: number): void {
    this.filterConfig.resonance = Math.max(0.1, Math.min(30, q));
  }

  /**
   * Set smoothing time
   */
  setSmoothingTime(ms: number): void {
    this.filterConfig.smoothingTime = Math.max(0, ms);
  }

  /**
   * Get current cutoff frequency
   */
  getCurrentCutoff(): number {
    return this.currentCutoff;
  }

  /**
   * Get filter config
   */
  getFilterConfig(): FilterMappingConfig {
    return { ...this.filterConfig };
  }

  /**
   * Reset filter to minimum cutoff
   */
  reset(): void {
    this.currentCutoff = this.filterConfig.cutoffMin;
    this.lastTimestamp = 0;
    this.lastEmittedNormalized = -1;
  }
}
