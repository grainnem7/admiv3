/**
 * ThereminNode - MusiKraken-style theremin processor
 *
 * Processes hand tracking into theremin control output using MusiKraken's approach:
 * - X position → Pitch
 * - Y position (hand height) → Volume
 * - Hand openness → Filter/expression control
 * - Single hand operation (no need for both hands)
 */

import { getThereminMode, type ThereminOutput } from '../../tracking';
import type { TrackingFrame } from '../../state/types';
import { createControlChangeEvent, type MusicalEvent } from '../events';

export interface ThereminNodeConfig {
  /** Whether to emit CC messages for MIDI output (default: true) */
  emitCCs: boolean;
  /** Minimum volume threshold to produce sound (default: 0.05) */
  volumeThreshold: number;
}

export interface ThereminProcessResult {
  /** Musical events generated (control change events) */
  events: MusicalEvent[];
  /** Pitch value 0-1 */
  pitch: number;
  /** Volume value 0-1 */
  volume: number;
  /** Frequency in Hz */
  frequency: number;
  /** Hand openness 0-1 */
  openness: number;
  /** Whether hand is being tracked */
  handActive: boolean;
  /** Whether sound should play (hand active + volume above threshold) */
  shouldPlay: boolean;
  /** Tracking point for visualization */
  trackingPoint: { x: number; y: number } | null;
  /** Full theremin output for UI */
  thereminOutput: ThereminOutput;
}

const DEFAULT_CONFIG: ThereminNodeConfig = {
  emitCCs: true,
  volumeThreshold: 0.05,
};

export class ThereminNode {
  private config: ThereminNodeConfig;
  private lastPitchValue: number = -1;
  private lastVolumeValue: number = -1;

  constructor(config: Partial<ThereminNodeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a tracking frame and generate control events
   */
  process(frame: TrackingFrame): ThereminProcessResult {
    const events: MusicalEvent[] = [];
    const thereminMode = getThereminMode();
    const timestamp = frame.timestamp;

    // Process through theremin mode
    const thereminOutput = thereminMode.process(frame);
    const frequency = thereminMode.pitchToFrequency(thereminOutput.pitch);

    // Determine if we should be playing
    const shouldPlay = thereminMode.shouldPlay(thereminOutput);

    // Generate MIDI CC events for external software
    if (this.config.emitCCs && thereminOutput.handActive) {
      // Pitch CC (use pitch bend or CC for pitch)
      const pitchValue = thereminOutput.pitch;
      if (Math.abs(pitchValue - this.lastPitchValue) > 0.005) {
        events.push(createControlChangeEvent('pitch', pitchValue, timestamp));
        this.lastPitchValue = pitchValue;
      }

      // Volume CC
      const volumeValue = thereminOutput.volume;
      if (Math.abs(volumeValue - this.lastVolumeValue) > 0.01) {
        events.push(createControlChangeEvent('volume', volumeValue, timestamp));
        this.lastVolumeValue = volumeValue;
      }

      // Openness as filter control
      events.push(createControlChangeEvent('filter_cutoff', thereminOutput.openness, timestamp));
    }

    return {
      events,
      pitch: thereminOutput.pitch,
      volume: thereminOutput.volume,
      frequency,
      openness: thereminOutput.openness,
      handActive: thereminOutput.handActive,
      shouldPlay,
      trackingPoint: thereminOutput.trackingPoint,
      thereminOutput,
    };
  }

  setConfig(config: Partial<ThereminNodeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ThereminNodeConfig {
    return { ...this.config };
  }

  reset(): void {
    this.lastPitchValue = -1;
    this.lastVolumeValue = -1;
    getThereminMode().reset();
  }
}

// Singleton
let thereminNodeInstance: ThereminNode | null = null;

export function getThereminNode(): ThereminNode {
  if (!thereminNodeInstance) {
    thereminNodeInstance = new ThereminNode();
  }
  return thereminNodeInstance;
}

export function resetThereminNode(): void {
  thereminNodeInstance?.reset();
  thereminNodeInstance = null;
}
