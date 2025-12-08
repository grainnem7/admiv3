/**
 * Volume Mapping Node
 *
 * Maps input values to volume/amplitude.
 * Can be driven by velocity, position, or gestures.
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame } from '../../state/types';
import { createControlChangeEvent, type MusicalEvent } from '../events';

export interface VolumeMappingConfig extends MappingNodeConfig {
  /** Minimum volume (0-1) */
  volumeMin: number;
  /** Maximum volume (0-1) */
  volumeMax: number;
  /** Attack time in ms (how fast volume rises) */
  attackTime: number;
  /** Release time in ms (how fast volume falls) */
  releaseTime: number;
  /** Whether to use velocity for volume */
  useVelocity: boolean;
  /**
   * Whether to emit ControlChangeEvents.
   * @default true
   */
  emitEvents: boolean;
  /**
   * Minimum change threshold to emit an event (0-1).
   * Prevents flooding with events when value barely changes.
   * @default 0.01
   */
  eventThreshold: number;
}

const DEFAULT_CONFIG: Omit<VolumeMappingConfig, 'id' | 'name' | 'inputs'> = {
  enabled: true,
  volumeMin: 0.0,
  volumeMax: 0.8,
  attackTime: 20,
  releaseTime: 100,
  useVelocity: true,
  emitEvents: true,
  eventThreshold: 0.01,
};

export class VolumeMappingNode extends MappingNode {
  private volumeConfig: VolumeMappingConfig;
  private currentVolume: number = 0;
  private lastTimestamp: number = 0;
  /** Last volume value emitted as event (for threshold comparison) */
  private lastEmittedVolume: number = -1;

  constructor(config: Partial<VolumeMappingConfig> & Pick<MappingNodeConfig, 'id' | 'name'>) {
    const fullConfig: VolumeMappingConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.volumeConfig = fullConfig;
  }

  /**
   * Process frame and output volume value.
   *
   * Emits ControlChangeEvent for volume when:
   * - emitEvents is enabled
   * - The volume has changed by more than eventThreshold
   */
  process(frame: ProcessedFrame): MappingNodeOutput {
    if (!this.enabled) {
      return {
        nodeId: this.id,
        value: 0,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    const isActive = this.hasActiveInput(frame);
    const deltaTime = this.lastTimestamp > 0 ? frame.timestamp - this.lastTimestamp : 16;
    this.lastTimestamp = frame.timestamp;

    // Calculate target volume
    let targetVolume: number;

    if (this.volumeConfig.useVelocity) {
      // Use velocity magnitude from inputs
      targetVolume = this.getVelocityValue(frame);
    } else {
      // Use position-based input value
      targetVolume = this.getInputValue(frame);
    }

    // Map to volume range
    targetVolume = this.volumeConfig.volumeMin +
      targetVolume * (this.volumeConfig.volumeMax - this.volumeConfig.volumeMin);

    // If not active, target is zero
    if (!isActive) {
      targetVolume = 0;
    }

    // Apply attack/release envelope
    if (targetVolume > this.currentVolume) {
      // Attack
      const attackRate = deltaTime / Math.max(1, this.volumeConfig.attackTime);
      this.currentVolume += (targetVolume - this.currentVolume) * Math.min(1, attackRate);
    } else {
      // Release
      const releaseRate = deltaTime / Math.max(1, this.volumeConfig.releaseTime);
      this.currentVolume += (targetVolume - this.currentVolume) * Math.min(1, releaseRate);
    }

    // Clamp to valid range
    this.currentVolume = Math.max(0, Math.min(1, this.currentVolume));

    // Build events array
    const events: MusicalEvent[] = [];

    // Emit ControlChangeEvent if enabled and volume changed significantly
    if (this.volumeConfig.emitEvents) {
      // Only emit if change exceeds threshold
      if (
        this.lastEmittedVolume < 0 ||
        Math.abs(this.currentVolume - this.lastEmittedVolume) >= this.volumeConfig.eventThreshold
      ) {
        events.push(
          createControlChangeEvent('volume', this.currentVolume, frame.timestamp)
        );
        this.lastEmittedVolume = this.currentVolume;
      }
    }

    return {
      nodeId: this.id,
      value: this.currentVolume,
      active: isActive && this.currentVolume > 0.01,
      timestamp: frame.timestamp,
      events,
    };
  }

  /**
   * Get velocity value from inputs
   */
  private getVelocityValue(frame: ProcessedFrame): number {
    let maxVelocity = 0;

    for (const input of this.inputs) {
      const featureValue = frame.features.get(input.sourceFeatureId);
      if (featureValue) {
        // Normalize velocity (typical range 0-0.1 per frame)
        const normalizedVelocity = Math.min(1, featureValue.velocity.magnitude * 10);
        maxVelocity = Math.max(maxVelocity, normalizedVelocity);
      }
    }

    return maxVelocity;
  }

  /**
   * Set volume range
   */
  setRange(min: number, max: number): void {
    this.volumeConfig.volumeMin = Math.max(0, Math.min(1, min));
    this.volumeConfig.volumeMax = Math.max(0, Math.min(1, max));
  }

  /**
   * Set attack time
   */
  setAttackTime(ms: number): void {
    this.volumeConfig.attackTime = Math.max(0, ms);
  }

  /**
   * Set release time
   */
  setReleaseTime(ms: number): void {
    this.volumeConfig.releaseTime = Math.max(0, ms);
  }

  /**
   * Set whether to use velocity
   */
  setUseVelocity(use: boolean): void {
    this.volumeConfig.useVelocity = use;
  }

  /**
   * Get current volume
   */
  getCurrentVolume(): number {
    return this.currentVolume;
  }

  /**
   * Get volume config
   */
  getVolumeConfig(): VolumeMappingConfig {
    return { ...this.volumeConfig };
  }

  /**
   * Reset volume to zero
   */
  reset(): void {
    this.currentVolume = 0;
    this.lastTimestamp = 0;
    this.lastEmittedVolume = -1;
  }
}
