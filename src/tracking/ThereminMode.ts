/**
 * ThereminMode - MusiKraken-style theremin control using hand tracking
 *
 * Based on MusiKraken's hand tracking approach:
 * - Tracks the MCP joint of middle finger (base of middle finger)
 * - X position (horizontal) → Pitch control (C2-C7, 5 octaves)
 * - Y position (vertical) → Volume control (hand height = loudness)
 * - Hand openness (finger spread) → Filter/expression control
 * - Works with just ONE hand - no need for both hands
 *
 * @see https://www.musikraken.com/handtracking.html
 */

import type { HandLandmarks, TrackingFrame } from '../state/types';

// MediaPipe hand landmark indices
const MIDDLE_FINGER_MCP = 9; // Base of middle finger - MusiKraken's tracked point
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const WRIST = 0;

export interface ThereminOutput {
  /** X position 0-1 (left to right) - typically mapped to pitch */
  x: number;
  /** Y position 0-1 (top to bottom in camera, but we invert: 0=bottom, 1=top) */
  y: number;
  /** Hand openness 0-1 (fist=0, spread fingers=1) */
  openness: number;
  /** Hand tilt/angle -1 to 1 */
  angle: number;
  /** Estimated hand size/distance 0-1 */
  size: number;
  /** Pitch value mapped from X (0-1) */
  pitch: number;
  /** Volume value mapped from openness or Y */
  volume: number;
  /** Whether a hand is being tracked */
  handActive: boolean;
  /** Which hand is being tracked */
  handedness: 'Left' | 'Right' | null;
  /** Raw landmark position for visualization */
  trackingPoint: { x: number; y: number } | null;
}

export interface ThereminConfig {
  /** Minimum pitch in MIDI notes (default: 48 = C3) */
  pitchMin: number;
  /** Maximum pitch in MIDI notes (default: 84 = C6) */
  pitchMax: number;
  /** Use X for pitch, Y for volume (true) or Y for pitch, X for volume (false) */
  xIsPitch: boolean;
  /** Volume source: 'y' = hand height, 'openness' = finger spread */
  volumeSource: 'y' | 'openness';
  /** Minimum volume threshold to play (0-1) */
  volumeThreshold: number;
  /** Smoothing factor (0-1, higher = smoother but more latency) */
  smoothing: number;
  /** Dead zone at edges (0-0.5) */
  deadZone: number;
}

const DEFAULT_CONFIG: ThereminConfig = {
  pitchMin: 36,  // C2
  pitchMax: 96,  // C7 (5 octaves)
  xIsPitch: true,
  volumeSource: 'y',
  volumeThreshold: 0.05,
  smoothing: 0.25,
  deadZone: 0.03,
};

interface SmoothState {
  x: number;
  y: number;
  openness: number;
  size: number;
  lastOutput: ThereminOutput | null;
}

function createSmoothState(): SmoothState {
  return { x: 0.5, y: 0.5, openness: 0, size: 0.5, lastOutput: null };
}

export interface DualThereminOutput {
  left: ThereminOutput;
  right: ThereminOutput;
}

export class ThereminMode {
  private config: ThereminConfig;
  // Legacy single-hand state (kept for backward compat with process())
  private smoothedX: number = 0.5;
  private smoothedY: number = 0.5;
  private smoothedOpenness: number = 0;
  private smoothedSize: number = 0.5;
  private lastOutput: ThereminOutput | null = null;
  // Per-hand smoothing state
  private handStates: Record<'left' | 'right', SmoothState> = {
    left: createSmoothState(),
    right: createSmoothState(),
  };

  constructor(config: Partial<ThereminConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setConfig(config: Partial<ThereminConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ThereminConfig {
    return { ...this.config };
  }

  /**
   * Process a tracking frame and extract theremin output.
   * Works with either hand - uses the first detected hand.
   */
  process(frame: TrackingFrame): ThereminOutput {
    // Find an active hand (prefer right, but use left if that's all we have)
    const hand = frame.rightHand ?? frame.leftHand;
    const handedness = frame.rightHand ? 'Right' : frame.leftHand ? 'Left' : null;

    if (!hand || !hand.landmarks || hand.landmarks.length < 21) {
      // No hand detected - return last known values with handActive=false
      return this.createInactiveOutput();
    }

    // Get the MCP joint of middle finger (MusiKraken's tracked point)
    const mcpPoint = hand.landmarks[MIDDLE_FINGER_MCP];

    // Raw X and Y (note: camera Y is inverted, 0=top, 1=bottom)
    const rawX = mcpPoint.x;
    const rawY = 1 - mcpPoint.y; // Invert so up = higher value

    // Calculate hand openness (distance from fingertips to thumb tip)
    const openness = this.calculateOpenness(hand);

    // Calculate hand angle/tilt
    const angle = this.calculateAngle(hand);

    // Calculate hand size (for distance estimation)
    const size = this.calculateSize(hand);

    // Apply smoothing
    const alpha = this.config.smoothing;
    this.smoothedX = alpha * this.smoothedX + (1 - alpha) * rawX;
    this.smoothedY = alpha * this.smoothedY + (1 - alpha) * rawY;
    this.smoothedOpenness = alpha * this.smoothedOpenness + (1 - alpha) * openness;
    this.smoothedSize = alpha * this.smoothedSize + (1 - alpha) * size;

    // Apply dead zone
    const x = this.applyDeadZone(this.smoothedX);
    const y = this.applyDeadZone(this.smoothedY);

    // Map to pitch and volume based on config
    const pitchSource = this.config.xIsPitch ? x : y;
    const pitch = pitchSource; // 0-1 range

    // Volume can come from Y position or hand openness
    let volume: number;
    if (this.config.volumeSource === 'openness') {
      volume = this.smoothedOpenness;
    } else {
      volume = this.config.xIsPitch ? y : x;
    }

    const output: ThereminOutput = {
      x,
      y,
      openness: this.smoothedOpenness,
      angle,
      size: this.smoothedSize,
      pitch,
      volume,
      handActive: true,
      handedness,
      trackingPoint: { x: mcpPoint.x, y: mcpPoint.y },
    };

    this.lastOutput = output;
    return output;
  }

  /**
   * Calculate hand "openness" - how spread the fingers are.
   * Measures distance from each fingertip to thumb tip.
   * MusiKraken: "the distance between each finger tip and the thumb tip"
   */
  private calculateOpenness(hand: HandLandmarks): number {
    const landmarks = hand.landmarks;
    const thumbTip = landmarks[THUMB_TIP];

    // Get all fingertip positions
    const fingerTips = [
      landmarks[INDEX_TIP],
      landmarks[MIDDLE_TIP],
      landmarks[RING_TIP],
      landmarks[PINKY_TIP],
    ];

    // Calculate average distance from thumb to each fingertip
    let totalDist = 0;
    for (const tip of fingerTips) {
      const dx = tip.x - thumbTip.x;
      const dy = tip.y - thumbTip.y;
      totalDist += Math.sqrt(dx * dx + dy * dy);
    }
    const avgDist = totalDist / 4;

    // Normalize: closed fist ~0.05, fully spread ~0.4
    // Map to 0-1 range
    const normalized = Math.min(1, Math.max(0, (avgDist - 0.05) / 0.35));
    return normalized;
  }

  /**
   * Calculate hand angle/rotation.
   * Based on the angle of the line from wrist to middle finger MCP.
   */
  private calculateAngle(hand: HandLandmarks): number {
    const wrist = hand.landmarks[WRIST];
    const mcp = hand.landmarks[MIDDLE_FINGER_MCP];

    const dx = mcp.x - wrist.x;
    const dy = mcp.y - wrist.y;

    // Angle in radians, convert to -1 to 1 range
    const angle = Math.atan2(dx, -dy); // -dy because Y is inverted
    return Math.max(-1, Math.min(1, angle / (Math.PI / 2)));
  }

  /**
   * Calculate hand size for distance estimation.
   * Uses distance from wrist to middle finger MCP.
   */
  private calculateSize(hand: HandLandmarks): number {
    const wrist = hand.landmarks[WRIST];
    const mcp = hand.landmarks[MIDDLE_FINGER_MCP];

    const dx = mcp.x - wrist.x;
    const dy = mcp.y - wrist.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Normalize: close to camera ~0.3, far ~0.1
    // Map to 0-1 range (closer = larger value)
    const normalized = Math.min(1, Math.max(0, (dist - 0.08) / 0.25));
    return normalized;
  }

  /**
   * Apply dead zone to a value
   */
  private applyDeadZone(value: number): number {
    const { deadZone } = this.config;
    if (value < deadZone) return 0;
    if (value > 1 - deadZone) return 1;
    return (value - deadZone) / (1 - 2 * deadZone);
  }

  /**
   * Create output when no hand is detected
   */
  private createInactiveOutput(): ThereminOutput {
    // Return last known pitch but with volume=0 and handActive=false
    return {
      x: this.smoothedX,
      y: this.smoothedY,
      openness: 0,
      angle: 0,
      size: this.smoothedSize,
      pitch: this.lastOutput?.pitch ?? 0.5,
      volume: 0,
      handActive: false,
      handedness: null,
      trackingPoint: null,
    };
  }

  /**
   * Convert pitch (0-1) to MIDI note number
   */
  pitchToMidi(pitch: number): number {
    const { pitchMin, pitchMax } = this.config;
    return Math.round(pitchMin + pitch * (pitchMax - pitchMin));
  }

  /**
   * Convert pitch (0-1) to frequency in Hz
   */
  pitchToFrequency(pitch: number): number {
    const midiNote = this.pitchToMidi(pitch);
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Check if volume is above threshold (should play sound)
   */
  shouldPlay(output: ThereminOutput): boolean {
    return output.handActive && output.volume >= this.config.volumeThreshold;
  }

  /**
   * Process both hands independently for dual-theremin mode.
   */
  processBothHands(frame: TrackingFrame): DualThereminOutput {
    return {
      left: this.processOneHand(frame.leftHand ?? null, 'left'),
      right: this.processOneHand(frame.rightHand ?? null, 'right'),
    };
  }

  /**
   * Process a single hand with per-hand smoothing state.
   */
  private processOneHand(
    hand: HandLandmarks | null | undefined,
    side: 'left' | 'right'
  ): ThereminOutput {
    const state = this.handStates[side];
    const handedness = side === 'left' ? 'Left' as const : 'Right' as const;

    if (!hand || !hand.landmarks || hand.landmarks.length < 21) {
      return {
        x: state.x,
        y: state.y,
        openness: 0,
        angle: 0,
        size: state.size,
        pitch: state.lastOutput?.pitch ?? 0.5,
        volume: 0,
        handActive: false,
        handedness: null,
        trackingPoint: null,
      };
    }

    const mcpPoint = hand.landmarks[MIDDLE_FINGER_MCP];
    const rawX = mcpPoint.x;
    const rawY = 1 - mcpPoint.y;

    const openness = this.calculateOpenness(hand);
    const angle = this.calculateAngle(hand);
    const size = this.calculateSize(hand);

    const alpha = this.config.smoothing;
    state.x = alpha * state.x + (1 - alpha) * rawX;
    state.y = alpha * state.y + (1 - alpha) * rawY;
    state.openness = alpha * state.openness + (1 - alpha) * openness;
    state.size = alpha * state.size + (1 - alpha) * size;

    const x = this.applyDeadZone(state.x);
    const y = this.applyDeadZone(state.y);

    const pitchSource = this.config.xIsPitch ? x : y;
    const pitch = pitchSource;

    let volume: number;
    if (this.config.volumeSource === 'openness') {
      volume = state.openness;
    } else {
      volume = this.config.xIsPitch ? y : x;
    }

    const output: ThereminOutput = {
      x, y,
      openness: state.openness,
      angle, size: state.size,
      pitch, volume,
      handActive: true,
      handedness,
      trackingPoint: { x: mcpPoint.x, y: mcpPoint.y },
    };

    state.lastOutput = output;
    return output;
  }

  /**
   * Reset state
   */
  reset(): void {
    this.smoothedX = 0.5;
    this.smoothedY = 0.5;
    this.smoothedOpenness = 0;
    this.smoothedSize = 0.5;
    this.lastOutput = null;
    this.handStates = { left: createSmoothState(), right: createSmoothState() };
  }
}

// Singleton
let thereminModeInstance: ThereminMode | null = null;

export function getThereminMode(): ThereminMode {
  if (!thereminModeInstance) {
    thereminModeInstance = new ThereminMode();
  }
  return thereminModeInstance;
}

export function resetThereminMode(): void {
  thereminModeInstance?.reset();
  thereminModeInstance = null;
}
