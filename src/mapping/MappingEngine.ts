/**
 * Mapping Engine
 *
 * Orchestrates all mapping nodes to transform ProcessedFrame data
 * into musical parameters. This is the central hub that connects
 * movement detection to sound generation.
 *
 * @see mapping_requirements.md Section 4
 */

import type { ProcessedFrame, MappingResult, InputProfile, TrackingFrame, UserProfile } from '../state/types';
import { MappingNode, type MappingNodeOutput } from './MappingNode';
import type { MusicalEvent } from './events';
import {
  PitchMappingNode,
  VolumeMappingNode,
  TriggerMappingNode,
  FilterMappingNode,
  ChordMappingNode,
  HandExpressionNode,
  DEFAULT_HAND_MAPPINGS,
  type ChordOutput,
  ThereminNode,
  ColorExpressionNode,
  type ColorAutoMode,
  type ColorExpressionMapping,
} from './nodes';

export interface MappingEngineConfig {
  /** Enable automatic node creation from profile */
  autoCreateNodes: boolean;
}

const DEFAULT_CONFIG: MappingEngineConfig = {
  autoCreateNodes: true,
};

/** Minimum span per axis after floor expansion (prevents instability from very narrow calibrations) */
const MOVEMENT_RANGE_MIN_SPAN = 0.1;

type MovementRange = UserProfile['movementRange'];
type AxisRange = { min: number; max: number };

/**
 * Resolve calibrated movement range into per-axis input ranges with a safety floor.
 * - If range is absent/null, returns full 0-1 for both axes.
 * - If an axis span is below MOVEMENT_RANGE_MIN_SPAN, the range is expanded
 *   symmetrically around its midpoint until the span reaches MIN_SPAN.
 *   A console.warn is logged when this happens.
 */
function resolveAxisRanges(
  movementRange: MovementRange | null | undefined,
): { x: AxisRange; y: AxisRange } {
  if (!movementRange) {
    return {
      x: { min: 0, max: 1 },
      y: { min: 0, max: 1 },
    };
  }

  return {
    x: applyMinSpan(movementRange.minX, movementRange.maxX, 'X'),
    y: applyMinSpan(movementRange.minY, movementRange.maxY, 'Y'),
  };
}

function applyMinSpan(min: number, max: number, axisLabel: string): AxisRange {
  const span = max - min;
  if (span >= MOVEMENT_RANGE_MIN_SPAN) {
    return { min, max };
  }
  const mid = (min + max) / 2;
  const half = MOVEMENT_RANGE_MIN_SPAN / 2;
  console.warn(
    `[MappingEngine] Movement range on ${axisLabel} axis (${min.toFixed(4)}–${max.toFixed(4)}, ` +
      `span ${span.toFixed(4)}) below floor of ${MOVEMENT_RANGE_MIN_SPAN}; ` +
      `expanded to ${(mid - half).toFixed(4)}–${(mid + half).toFixed(4)}.`,
  );
  return { min: mid - half, max: mid + half };
}

/**
 * Callback type for MusicalEvent subscriptions.
 */
export type MusicalEventCallback = (event: MusicalEvent) => void;

export interface MappingEngineOutput {
  /** All node outputs keyed by node ID */
  nodeOutputs: Map<string, MappingNodeOutput>;
  /** Combined mapping result for sound engine (backward compatibility) */
  result: MappingResult;
  /**
   * All MusicalEvents emitted this frame, aggregated from all nodes.
   * @see mapping_requirements.md Section 3
   */
  events: MusicalEvent[];
  /** Timestamp */
  timestamp: number;
}

export class MappingEngine {
  private nodes: Map<string, MappingNode> = new Map();
  private config: MappingEngineConfig;
  private currentProfile: InputProfile | null = null;

  // Named node references for quick access
  private pitchNode: PitchMappingNode | null = null;
  private volumeNode: VolumeMappingNode | null = null;
  private filterNode: FilterMappingNode | null = null;
  private chordNode: ChordMappingNode | null = null;
  private handExpressionNode: HandExpressionNode | null = null;
  private colorExpressionNode: ColorExpressionNode | null = null;
  private triggerNodes: Map<string, TriggerMappingNode> = new Map();
  private thereminNode: ThereminNode | null = null;
  private thereminModeEnabled: boolean = false;

  /**
   * Event subscribers for MusicalEvents.
   * @see mapping_requirements.md Section 4.4
   */
  private eventSubscribers: Set<MusicalEventCallback> = new Set();

  constructor(config: Partial<MappingEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Subscribe to MusicalEvents emitted by this engine.
   * Returns an unsubscribe function.
   *
   * @see mapping_requirements.md Section 4.4
   */
  onMusicalEvent(callback: MusicalEventCallback): () => void {
    this.eventSubscribers.add(callback);
    return () => {
      this.eventSubscribers.delete(callback);
    };
  }

  /**
   * Emit events to all subscribers.
   */
  private emitEvents(events: MusicalEvent[]): void {
    for (const event of events) {
      for (const callback of this.eventSubscribers) {
        try {
          callback(event);
        } catch (error) {
          console.error('[MappingEngine] Error in event subscriber:', error);
        }
      }
    }
  }

  /**
   * Configure engine from an InputProfile.
   *
   * Optionally accepts the calibrated movement range from the user's
   * UserProfile so that position-driven mapping nodes use the user's
   * actual reachable range, not the full screen. The range is passed
   * as a plain value (not the full UserProfile) to keep the mapping
   * engine decoupled from the profile shape.
   */
  configureFromProfile(
    profile: InputProfile,
    movementRange?: MovementRange | null,
  ): void {
    this.currentProfile = profile;

    if (this.config.autoCreateNodes) {
      this.createDefaultNodes(profile, movementRange ?? null);
    }
  }

  /**
   * Create default mapping nodes based on profile
   *
   * Feature assignment strategy:
   * - Features with 'index' in ID → pitch control
   * - Features with 'middle' in ID → filter control
   * - Features with 'thumb' in ID → reverb/effects control
   * - Other features fallback to position-based assignment
   *
   * Position-driven nodes (pitch, chord) honour the calibrated
   * `movementRange` when supplied. `MappingNode.getInputValue`
   * extracts `position.y` for `sourceType: 'position'`, so the Y bounds
   * of the calibrated range apply. Filter, expression, and trigger
   * nodes intentionally keep the default 0–1 input range.
   */
  private createDefaultNodes(
    profile: InputProfile,
    movementRange?: MovementRange | null,
  ): void {
    const { y: yRange } = resolveAxisRanges(movementRange);
    // Clear existing nodes
    this.nodes.clear();
    this.triggerNodes.clear();

    // Find continuous features for pitch/volume mapping
    const continuousFeatures = profile.trackedFeatures.filter((f) => f.role === 'continuous');
    const triggerFeatures = profile.trackedFeatures.filter((f) => f.role === 'trigger');

    // Smart feature detection by name/id
    const indexFeature = continuousFeatures.find((f) => f.id.includes('index'));
    const middleFeature = continuousFeatures.find((f) => f.id.includes('middle'));
    const thumbFeature = continuousFeatures.find((f) => f.id.includes('thumb'));

    // Fallback to positional assignment if no named features
    const pitchFeature = indexFeature ?? continuousFeatures[0];
    const filterFeature = middleFeature ?? continuousFeatures[1];
    const reverbFeature = thumbFeature ?? continuousFeatures[2];

    // Create pitch mapping node if we have continuous input
    if (pitchFeature) {
      this.pitchNode = new PitchMappingNode({
        id: 'pitch-main',
        name: 'Main Pitch',
        inputs: [
          {
            sourceFeatureId: pitchFeature.id,
            sourceType: 'position',
            inputRange: { min: yRange.min, max: yRange.max },
            outputRange: { min: 0, max: 1 },
            curve: 'linear',
            inverted: false,
          },
        ],
      });
      this.nodes.set('pitch-main', this.pitchNode);

      // Create volume node using velocity from pitch feature
      this.volumeNode = new VolumeMappingNode({
        id: 'volume-main',
        name: 'Main Volume',
        useVelocity: true,
        inputs: [
          {
            sourceFeatureId: pitchFeature.id,
            sourceType: 'velocity',
            inputRange: { min: 0, max: 1 },
            outputRange: { min: 0, max: 1 },
            curve: 'linear',
            inverted: false,
          },
        ],
      });
      this.nodes.set('volume-main', this.volumeNode);
    }

    // Create filter mapping node - use middle finger if available
    this.filterNode = new FilterMappingNode({
      id: 'filter-main',
      name: 'Main Filter',
      inputs: filterFeature
        ? [
            {
              sourceFeatureId: filterFeature.id,
              sourceType: 'position',
              inputRange: { min: 0, max: 1 },
              outputRange: { min: 0, max: 1 },
              curve: 'exponential',
              inverted: false,
            },
          ]
        : [],
    });
    this.nodes.set('filter-main', this.filterNode);

    // Create reverb mapping node - use thumb if available
    // This is a new control channel for thumb → reverb
    if (reverbFeature) {
      // We don't have a dedicated ReverbMappingNode, but we can use the
      // feature value in MusicController to control reverb wet
      console.log(`[MappingEngine] Reverb feature assigned: ${reverbFeature.id}`);
    }

    // Create chord mapping node
    this.chordNode = new ChordMappingNode({
      id: 'chord-main',
      name: 'Main Chord',
      inputs: pitchFeature
        ? [
            {
              sourceFeatureId: pitchFeature.id,
              sourceType: 'position',
              inputRange: { min: yRange.min, max: yRange.max },
              outputRange: { min: 0, max: 1 },
              curve: 'linear',
              inverted: false,
            },
          ]
        : [],
    });
    this.nodes.set('chord-main', this.chordNode);

    // Create HandExpressionNode for MusiKraken-style continuous control
    // This maps hand positions and gestures to pitch, volume, filter, etc.
    this.handExpressionNode = new HandExpressionNode({
      id: 'hand-expression',
      name: 'Hand Expression',
      inputs: [],
      mappings: DEFAULT_HAND_MAPPINGS,
      sensitivity: 1.0,
      deadZone: 0.05,
      eventThreshold: 0.02, // Low threshold for responsive MIDI CC output
    });
    this.nodes.set('hand-expression', this.handExpressionNode);

    // Create ColorExpressionNode for color tracking
    // Starts disabled — enabled when color input method is activated
    this.colorExpressionNode = new ColorExpressionNode({
      id: 'color-expression',
      name: 'Color Expression',
      enabled: false,
    });
    this.nodes.set('color-expression', this.colorExpressionNode);

    // Create trigger nodes for gestures
    // Note: emitEvents is disabled because gesture sounds are handled by useGestureSounds.ts
    // This prevents duplicate noteOn events being sent through the MusicalEvents system
    for (const gesture of profile.gestures) {
      const triggerNode = new TriggerMappingNode({
        id: `trigger-${gesture.id}`,
        name: `Trigger: ${gesture.id}`,
        triggerGestureId: gesture.id,
        mode: 'oneshot',
        emitEvents: false, // Gesture sounds handled separately by useGestureSounds
      });
      this.triggerNodes.set(gesture.id, triggerNode);
      this.nodes.set(`trigger-${gesture.id}`, triggerNode);
    }

    // Create trigger nodes for trigger-role features
    for (const feature of triggerFeatures) {
      const triggerNode = new TriggerMappingNode({
        id: `trigger-${feature.id}`,
        name: `Trigger: ${feature.name}`,
        triggerGestureId: feature.id,
        mode: 'oneshot',
        emitEvents: false, // Gesture sounds handled separately by useGestureSounds
      });
      this.triggerNodes.set(feature.id, triggerNode);
      this.nodes.set(`trigger-${feature.id}`, triggerNode);
    }

    // Log final node configuration for debugging
    console.log('[MappingEngine] Nodes created:', {
      pitch: pitchFeature?.id ?? 'none',
      filter: filterFeature?.id ?? 'none',
      reverb: reverbFeature?.id ?? 'none',
      triggers: profile.gestures.map((g) => g.id),
    });
  }

  /**
   * Process a frame through all mapping nodes.
   *
   * This method:
   * 1. Processes all active nodes
   * 2. Collects MusicalEvents from each node
   * 3. Builds backward-compatible MappingResult
   * 4. Emits events to subscribers
   *
   * @see mapping_requirements.md Section 4.5
   */
  process(frame: ProcessedFrame): MappingEngineOutput {
    const nodeOutputs = new Map<string, MappingNodeOutput>();
    const allEvents: MusicalEvent[] = [];

    // In theremin mode, skip regular processing (use processThereminFrame instead)
    if (!this.thereminModeEnabled) {
      // Process all regular nodes and collect events
      for (const [id, node] of this.nodes) {
        const output = node.process(frame);
        nodeOutputs.set(id, output);

        // Collect events from this node
        if (output.events && output.events.length > 0) {
          allEvents.push(...output.events);
        }
      }
    }

    // Build combined mapping result (backward compatibility)
    const result = this.buildMappingResult(nodeOutputs, frame);

    // Emit all events to subscribers
    if (allEvents.length > 0) {
      this.emitEvents(allEvents);
    }

    return {
      nodeOutputs,
      result,
      events: allEvents,
      timestamp: frame.timestamp,
    };
  }

  /**
   * Build a MappingResult from node outputs
   */
  private buildMappingResult(
    outputs: Map<string, MappingNodeOutput>,
    _frame: ProcessedFrame
  ): MappingResult {
    const pitchOutput = outputs.get('pitch-main');
    const volumeOutput = outputs.get('volume-main');
    const filterOutput = outputs.get('filter-main');
    const chordOutput = outputs.get('chord-main') as ChordOutput | undefined;

    // Collect all triggered events
    const triggers: string[] = [];
    for (const [gestureId, triggerNode] of this.triggerNodes) {
      if (triggerNode.isTriggered()) {
        triggers.push(gestureId);
      }
    }

    return {
      pitch: pitchOutput?.value,
      volume: volumeOutput?.value,
      filterCutoff: filterOutput?.value,
      triggers,
      chord: chordOutput?.midiNotes,
      modulation: new Map(),
      timestamp: pitchOutput?.timestamp ?? Date.now(),
    };
  }

  /**
   * Add a mapping node
   */
  addNode(node: MappingNode): void {
    this.nodes.set(node.id, node);

    // Update quick-access references
    if (node instanceof PitchMappingNode) {
      this.pitchNode = node;
    } else if (node instanceof VolumeMappingNode) {
      this.volumeNode = node;
    } else if (node instanceof FilterMappingNode) {
      this.filterNode = node;
    } else if (node instanceof ChordMappingNode) {
      this.chordNode = node;
    } else if (node instanceof TriggerMappingNode) {
      const config = node.getTriggerConfig();
      this.triggerNodes.set(config.triggerGestureId, node);
    }
  }

  /**
   * Remove a mapping node
   */
  removeNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    this.nodes.delete(nodeId);

    // Clear quick-access references
    if (node === this.pitchNode) {
      this.pitchNode = null;
    } else if (node === this.volumeNode) {
      this.volumeNode = null;
    } else if (node === this.filterNode) {
      this.filterNode = null;
    } else if (node === this.chordNode) {
      this.chordNode = null;
    } else if (node instanceof TriggerMappingNode) {
      const config = node.getTriggerConfig();
      this.triggerNodes.delete(config.triggerGestureId);
    }

    return true;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): MappingNode | null {
    return this.nodes.get(nodeId) ?? null;
  }

  /**
   * Get all nodes
   */
  getAllNodes(): MappingNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get the pitch mapping node
   */
  getPitchNode(): PitchMappingNode | null {
    return this.pitchNode;
  }

  /**
   * Get the volume mapping node
   */
  getVolumeNode(): VolumeMappingNode | null {
    return this.volumeNode;
  }

  /**
   * Get the filter mapping node
   */
  getFilterNode(): FilterMappingNode | null {
    return this.filterNode;
  }

  /**
   * Get the chord mapping node
   */
  getChordNode(): ChordMappingNode | null {
    return this.chordNode;
  }

  /**
   * Get a trigger node by gesture ID
   */
  getTriggerNode(gestureId: string): TriggerMappingNode | null {
    return this.triggerNodes.get(gestureId) ?? null;
  }

  /**
   * Enable or disable theremin mode
   * When enabled, hand tracking is converted to pitch/volume via ThereminNode
   */
  setThereminMode(enabled: boolean): void {
    this.thereminModeEnabled = enabled;

    if (enabled && !this.thereminNode) {
      this.thereminNode = new ThereminNode({
        emitCCs: true,
        volumeThreshold: 0.05,
      });
      console.log('[MappingEngine] Theremin mode enabled');
    } else if (!enabled && this.thereminNode) {
      this.thereminNode.reset();
      console.log('[MappingEngine] Theremin mode disabled');
    }
  }

  /**
   * Check if theremin mode is enabled
   */
  isThereminMode(): boolean {
    return this.thereminModeEnabled;
  }

  /**
   * Get the theremin node
   */
  getThereminNode(): ThereminNode | null {
    return this.thereminNode;
  }

  /**
   * Process a tracking frame through theremin mode.
   * This bypasses the standard ProcessedFrame pipeline for direct hand-to-sound mapping.
   * Returns the theremin result for external use (e.g., direct SoundEngine control).
   */
  processThereminFrame(frame: TrackingFrame): import('./nodes').ThereminProcessResult | null {
    if (!this.thereminModeEnabled || !this.thereminNode) {
      return null;
    }

    const result = this.thereminNode.process(frame);

    // Emit events to subscribers (for MIDI output)
    if (result.events.length > 0) {
      this.emitEvents(result.events);
    }

    return result;
  }

  /**
   * Process both hands through theremin mode for dual-theremin playback.
   */
  processDualThereminFrame(frame: TrackingFrame): import('./nodes').DualThereminProcessResult | null {
    if (!this.thereminModeEnabled || !this.thereminNode) {
      return null;
    }

    const result = this.thereminNode.processDual(frame);

    if (result.events.length > 0) {
      this.emitEvents(result.events);
    }

    return result;
  }

  /**
   * Get the hand expression node (for MusiKraken-style continuous control)
   */
  getHandExpressionNode(): HandExpressionNode | null {
    return this.handExpressionNode;
  }

  /**
   * Get the color expression node
   */
  getColorExpressionNode(): ColorExpressionNode | null {
    return this.colorExpressionNode;
  }

  /**
   * Enable or disable color expression processing
   */
  enableColorExpression(enabled: boolean): void {
    if (this.colorExpressionNode) {
      this.colorExpressionNode.setEnabled(enabled);
      if (!enabled) {
        this.colorExpressionNode.reset();
      }
    }
  }

  /**
   * Set color auto mode (theremin, mixer, xy-pad, single)
   */
  setColorAutoMode(mode: ColorAutoMode): void {
    if (this.colorExpressionNode) {
      this.colorExpressionNode.setAutoMode(mode);
    }
  }

  /**
   * Set custom color mappings
   */
  setColorMappings(mappings: ColorExpressionMapping[]): void {
    if (this.colorExpressionNode) {
      this.colorExpressionNode.setMappings(mappings);
    }
  }

  /**
   * Enable/disable a node
   */
  setNodeEnabled(nodeId: string, enabled: boolean): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.setEnabled(enabled);
    }
  }

  /**
   * Reset all nodes
   */
  reset(): void {
    for (const node of this.nodes.values()) {
      if ('reset' in node && typeof node.reset === 'function') {
        (node as { reset: () => void }).reset();
      }
    }
  }

  /**
   * Get current profile
   */
  getProfile(): InputProfile | null {
    return this.currentProfile;
  }

  /**
   * Get engine configuration
   */
  getConfig(): MappingEngineConfig {
    return { ...this.config };
  }
}

// Singleton instance
let engineInstance: MappingEngine | null = null;

export function getMappingEngine(): MappingEngine {
  if (!engineInstance) {
    engineInstance = new MappingEngine();
  }
  return engineInstance;
}
