/**
 * Trigger Mapping Node
 *
 * Maps gesture triggers to discrete events (note on/off, chord triggers).
 * Supports one-shot triggers and toggle mode.
 *
 * Emits NoteEvent or StructuralEvent based on configuration.
 * @see mapping_requirements.md Section 4.3 (TriggerMappingNode)
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame } from '../../state/types';
import {
  createNoteEvent,
  createStructuralEvent,
  type MusicalEvent,
  type StructuralAction,
} from '../events';

export type TriggerMode = 'oneshot' | 'toggle' | 'gate';

/**
 * What action to perform when triggered.
 */
export type TriggerAction = 'note' | 'structural';

/**
 * Structural actions that can be triggered.
 */
export type TriggerStructuralAction = Extract<
  StructuralAction,
  'toggleLayer' | 'nextChord' | 'previousChord' | 'switchMode' | 'switchPreset'
>;

export interface TriggerMappingConfig extends MappingNodeConfig {
  /** The gesture ID that triggers this node */
  triggerGestureId: string;
  /** Trigger mode: oneshot (pulse), toggle (flip), or gate (held) */
  mode: TriggerMode;
  /** Value when triggered/on */
  onValue: number;
  /** Value when off */
  offValue: number;
  /** Minimum time between triggers in ms (debounce) */
  debounceMs: number;
  /** For gate mode: how long to hold the trigger in ms */
  gateHoldMs: number;

  // Event emission configuration
  /**
   * Whether to emit MusicalEvents.
   * @default true
   */
  emitEvents: boolean;
  /**
   * What type of action to emit.
   * - 'note': Emit NoteEvent (noteOn/noteOff)
   * - 'structural': Emit StructuralEvent (nextChord, toggleLayer, etc.)
   * @default 'note'
   */
  triggerAction: TriggerAction;
  /**
   * For 'note' action: MIDI note number to trigger.
   * @default 60 (C4)
   */
  midiNote: number;
  /**
   * For 'note' action: Velocity when triggered (0-1).
   * @default 0.8
   */
  velocity: number;
  /**
   * For 'structural' action: Which structural action to emit.
   * @default 'nextChord'
   */
  structuralAction: TriggerStructuralAction;
  /**
   * For 'structural' action: Target ID (e.g., layer ID, preset ID).
   */
  structuralTargetId?: string;
}

const DEFAULT_CONFIG: Omit<TriggerMappingConfig, 'id' | 'name' | 'inputs' | 'triggerGestureId'> = {
  enabled: true,
  mode: 'oneshot',
  onValue: 1,
  offValue: 0,
  debounceMs: 100,
  gateHoldMs: 200,
  // Event defaults
  emitEvents: true,
  triggerAction: 'note',
  midiNote: 60,
  velocity: 0.8,
  structuralAction: 'nextChord',
};

export class TriggerMappingNode extends MappingNode {
  private triggerConfig: TriggerMappingConfig;
  private isOn: boolean = false;
  private lastTriggerTime: number = 0;
  private gateEndTime: number = 0;
  /** Events to emit this frame (populated by handleTrigger) */
  private pendingEvents: MusicalEvent[] = [];
  /** Track previous on state for edge detection */
  private wasOn: boolean = false;

  constructor(
    config: Partial<TriggerMappingConfig> & Pick<MappingNodeConfig, 'id' | 'name'> & { triggerGestureId: string }
  ) {
    const fullConfig: TriggerMappingConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      ...config,
    };
    super(fullConfig);
    this.triggerConfig = fullConfig;
  }

  /**
   * Process frame and output trigger state.
   *
   * Emits MusicalEvents based on triggerAction:
   * - 'note': NoteEvent (noteOn when triggered, noteOff when released for gate/toggle)
   * - 'structural': StructuralEvent (on trigger)
   *
   * @see mapping_requirements.md Section 4.3 (TriggerMappingNode)
   */
  process(frame: ProcessedFrame): MappingNodeOutput {
    // Clear pending events from previous frame
    this.pendingEvents = [];

    if (!this.enabled) {
      return {
        nodeId: this.id,
        value: this.triggerConfig.offValue,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    // Remember previous state for edge detection
    this.wasOn = this.isOn;

    // Find the trigger gesture in the frame
    const gesture = frame.gestures.find(
      (g) => g.gestureId === this.triggerConfig.triggerGestureId
    );

    // Check for new trigger (with debounce)
    const timeSinceLast = frame.timestamp - this.lastTriggerTime;
    const canTrigger = timeSinceLast >= this.triggerConfig.debounceMs;

    if (gesture?.triggered && canTrigger) {
      this.lastTriggerTime = frame.timestamp;
      this.handleTrigger(frame.timestamp);
    }

    // Update gate state
    if (this.triggerConfig.mode === 'gate' && this.isOn) {
      if (frame.timestamp >= this.gateEndTime) {
        this.isOn = false;
      }
    }

    // Emit noteOff event when transitioning from on to off (for gate/toggle modes)
    if (this.wasOn && !this.isOn && this.triggerConfig.emitEvents) {
      if (this.triggerConfig.triggerAction === 'note') {
        this.pendingEvents.push(
          createNoteEvent('noteOff', this.triggerConfig.midiNote, 0, frame.timestamp)
        );
      }
    }

    const value = this.isOn ? this.triggerConfig.onValue : this.triggerConfig.offValue;

    return {
      nodeId: this.id,
      value,
      active: this.isOn,
      timestamp: frame.timestamp,
      events: this.pendingEvents,
    };
  }

  /**
   * Handle a trigger event based on mode.
   * Emits appropriate MusicalEvents.
   */
  private handleTrigger(timestamp: number): void {
    const previousState = this.isOn;

    switch (this.triggerConfig.mode) {
      case 'oneshot':
        // Pulse: briefly on then off (handled by consumer)
        this.isOn = true;
        // Auto-off after one frame is handled by checking triggered state
        setTimeout(() => {
          this.isOn = false;
        }, 16); // ~1 frame at 60fps
        break;

      case 'toggle':
        // Flip state
        this.isOn = !this.isOn;
        break;

      case 'gate':
        // Hold for specified duration
        this.isOn = true;
        this.gateEndTime = timestamp + this.triggerConfig.gateHoldMs;
        break;
    }

    // Emit events if enabled
    if (!this.triggerConfig.emitEvents) return;

    // Emit based on action type
    if (this.triggerConfig.triggerAction === 'note') {
      // For oneshot mode: always emit noteOn (brief note)
      // For toggle mode: emit noteOn when turning on, noteOff handled in process()
      // For gate mode: emit noteOn when triggered, noteOff handled in process()
      if (this.triggerConfig.mode === 'oneshot') {
        // Emit both noteOn and noteOff for oneshot (brief percussive hit)
        this.pendingEvents.push(
          createNoteEvent('noteOn', this.triggerConfig.midiNote, this.triggerConfig.velocity, timestamp)
        );
        // Note: For oneshot, we could also schedule a noteOff, but typically
        // the sound engine handles short notes with triggerAttackRelease
      } else if (this.isOn && !previousState) {
        // Turning on: emit noteOn
        this.pendingEvents.push(
          createNoteEvent('noteOn', this.triggerConfig.midiNote, this.triggerConfig.velocity, timestamp)
        );
      }
    } else if (this.triggerConfig.triggerAction === 'structural') {
      // Structural events are always emitted on trigger (not state-dependent)
      this.pendingEvents.push(
        createStructuralEvent(
          this.triggerConfig.structuralAction,
          timestamp,
          this.triggerConfig.structuralTargetId
        )
      );
    }
  }

  /**
   * Set trigger mode
   */
  setMode(mode: TriggerMode): void {
    this.triggerConfig.mode = mode;
  }

  /**
   * Set on/off values
   */
  setValues(onValue: number, offValue: number): void {
    this.triggerConfig.onValue = onValue;
    this.triggerConfig.offValue = offValue;
  }

  /**
   * Set debounce time
   */
  setDebounceMs(ms: number): void {
    this.triggerConfig.debounceMs = Math.max(0, ms);
  }

  /**
   * Set gate hold time
   */
  setGateHoldMs(ms: number): void {
    this.triggerConfig.gateHoldMs = Math.max(0, ms);
  }

  /**
   * Check if currently triggered/on
   */
  isTriggered(): boolean {
    return this.isOn;
  }

  /**
   * Get trigger config
   */
  getTriggerConfig(): TriggerMappingConfig {
    return { ...this.triggerConfig };
  }

  /**
   * Manually set the on state (for external control)
   */
  setOn(on: boolean): void {
    this.isOn = on;
  }

  /**
   * Reset trigger state
   */
  reset(): void {
    this.isOn = false;
    this.wasOn = false;
    this.lastTriggerTime = 0;
    this.gateEndTime = 0;
    this.pendingEvents = [];
  }
}
