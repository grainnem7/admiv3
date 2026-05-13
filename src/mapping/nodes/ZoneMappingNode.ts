/**
 * Zone Mapping Node
 *
 * Maps spatial zones to chord pads (MusiKraken-style).
 * Tracks feature position and emits ChordEvent when entering/exiting zones.
 *
 * @see mapping_requirements.md Section 4.3 (ZoneMappingNode)
 * @see mapping_requirements.md Section 7.3 (Hand Zones → Chord Pads)
 */

import { MappingNode, type MappingNodeConfig, type MappingNodeOutput } from '../MappingNode';
import type { ProcessedFrame } from '../../state/types';
import {
  createChordEvent,
  type MusicalEvent,
  type Zone,
} from '../events';

/**
 * What happens when entering a zone.
 */
export type ZoneEnterAction = 'playChord' | 'nothing';

/**
 * What happens when exiting a zone.
 */
export type ZoneExitAction = 'stopChord' | 'nothing';

/**
 * Mapping from zone ID to chord MIDI notes.
 */
export interface ZoneChordMapping {
  zoneId: string;
  /** MIDI notes for this zone's chord */
  midiNotes: number[];
  /** Human-readable voicing name */
  voicingName?: string;
}

export interface ZoneMappingConfig extends MappingNodeConfig {
  /** Zone definitions */
  zones: Zone[];
  /** What happens when entering a zone */
  onEnter: ZoneEnterAction;
  /** What happens when exiting a zone */
  onExit: ZoneExitAction;
  /** Zone-to-chord mappings */
  zoneMappings: ZoneChordMapping[];
  /** Default velocity for chord events */
  velocity: number;
  /**
   * Whether to emit MusicalEvents.
   * @default true
   */
  emitEvents: boolean;
  /**
   * Optional calibrated movement envelope.  When supplied, the raw
   * tracker position is remapped to envelope space (envelope min → 0,
   * envelope max → 1) before zone lookup — so the user's reachable
   * range covers the full zone grid rather than the literal frame
   * extremes.
   * @default null (no remapping; raw 0–1 frame coords are used)
   */
  inputRange: {
    x: { min: number; max: number };
    y: { min: number; max: number };
  } | null;
}

const DEFAULT_CONFIG: Omit<ZoneMappingConfig, 'id' | 'name' | 'inputs' | 'zones' | 'zoneMappings'> = {
  enabled: true,
  onEnter: 'playChord',
  onExit: 'stopChord',
  velocity: 0.7,
  emitEvents: true,
  inputRange: null,
};

/**
 * Default 4-quadrant zone layout.
 */
export const DEFAULT_QUAD_ZONES: Zone[] = [
  {
    id: 'zone-tl',
    name: 'Top Left',
    shape: 'rectangle',
    bounds: { x: 0, y: 0, width: 0.5, height: 0.5 },
    color: '#4CAF50', // Green
  },
  {
    id: 'zone-tr',
    name: 'Top Right',
    shape: 'rectangle',
    bounds: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
    color: '#2196F3', // Blue
  },
  {
    id: 'zone-bl',
    name: 'Bottom Left',
    shape: 'rectangle',
    bounds: { x: 0, y: 0.5, width: 0.5, height: 0.5 },
    color: '#FF9800', // Orange
  },
  {
    id: 'zone-br',
    name: 'Bottom Right',
    shape: 'rectangle',
    bounds: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    color: '#9C27B0', // Purple
  },
];

/**
 * Default chord mappings for 4-quadrant layout (I-V-vi-IV progression).
 */
export const DEFAULT_QUAD_CHORDS: ZoneChordMapping[] = [
  { zoneId: 'zone-tl', midiNotes: [60, 64, 67], voicingName: 'C Major' },      // C E G
  { zoneId: 'zone-tr', midiNotes: [67, 71, 74], voicingName: 'G Major' },      // G B D
  { zoneId: 'zone-bl', midiNotes: [69, 72, 76], voicingName: 'A Minor' },      // A C E
  { zoneId: 'zone-br', midiNotes: [65, 69, 72], voicingName: 'F Major' },      // F A C
];

export class ZoneMappingNode extends MappingNode {
  private zoneConfig: ZoneMappingConfig;
  /** Currently active zone ID (null if not in any zone) */
  private currentZoneId: string | null = null;
  /** Events to emit this frame */
  private pendingEvents: MusicalEvent[] = [];

  constructor(
    config: Partial<ZoneMappingConfig> & Pick<MappingNodeConfig, 'id' | 'name'>
  ) {
    const fullConfig: ZoneMappingConfig = {
      ...DEFAULT_CONFIG,
      inputs: [],
      zones: config.zones ?? DEFAULT_QUAD_ZONES,
      zoneMappings: config.zoneMappings ?? DEFAULT_QUAD_CHORDS,
      ...config,
    };
    super(fullConfig);
    this.zoneConfig = fullConfig;
  }

  /**
   * Process frame and detect zone entry/exit.
   *
   * Emits ChordEvent when:
   * - Entering a zone: chordOn
   * - Exiting a zone: chordOff
   *
   * @see mapping_requirements.md Section 7.3
   */
  process(frame: ProcessedFrame): MappingNodeOutput {
    // Clear pending events from previous frame
    this.pendingEvents = [];

    if (!this.enabled) {
      return {
        nodeId: this.id,
        value: 0,
        active: false,
        timestamp: frame.timestamp,
        events: [],
      };
    }

    // Get position from first input feature
    const rawPosition = this.getPositionFromFrame(frame);
    const position = rawPosition && this.remapToEnvelope(rawPosition);
    if (!position) {
      // No position data - if we were in a zone, exit it
      if (this.currentZoneId) {
        this.handleZoneExit(this.currentZoneId, frame.timestamp);
        this.currentZoneId = null;
      }
      return {
        nodeId: this.id,
        value: 0,
        active: false,
        timestamp: frame.timestamp,
        events: this.pendingEvents,
      };
    }

    // Check which zone the position is in
    const newZoneId = this.findZoneAtPosition(position.x, position.y);

    // Handle zone transitions
    if (newZoneId !== this.currentZoneId) {
      // Exit old zone
      if (this.currentZoneId) {
        this.handleZoneExit(this.currentZoneId, frame.timestamp);
      }
      // Enter new zone
      if (newZoneId) {
        this.handleZoneEnter(newZoneId, frame.timestamp);
      }
      this.currentZoneId = newZoneId;
    }

    return {
      nodeId: this.id,
      value: newZoneId ? 1 : 0,
      active: newZoneId !== null,
      timestamp: frame.timestamp,
      events: this.pendingEvents,
    };
  }

  /**
   * Remap raw frame coordinates into the calibrated envelope so that
   * zones (defined in 0–1 normalised space) cover the user's actual
   * reachable range rather than the full frame.  Values outside the
   * envelope are clamped to 0/1 so the user's edges still register as
   * "in the zone closest to that edge".
   */
  private remapToEnvelope(
    position: { x: number; y: number },
  ): { x: number; y: number } {
    const range = this.zoneConfig.inputRange;
    if (!range) return position;
    return {
      x: clamp01(remapAxis(position.x, range.x.min, range.x.max)),
      y: clamp01(remapAxis(position.y, range.y.min, range.y.max)),
    };
  }

  /**
   * Get position from frame features.
   */
  private getPositionFromFrame(frame: ProcessedFrame): { x: number; y: number } | null {
    // Use first input configuration
    if (this.inputs.length === 0) {
      // Fall back to first feature in frame
      const firstFeature = frame.features.values().next().value;
      if (firstFeature?.isActive) {
        return { x: firstFeature.position.x, y: firstFeature.position.y };
      }
      return null;
    }

    // Use configured input
    const input = this.inputs[0];
    const feature = frame.features.get(input.sourceFeatureId);
    if (!feature?.isActive) {
      return null;
    }

    return { x: feature.position.x, y: feature.position.y };
  }

  /**
   * Find which zone contains the given position.
   */
  private findZoneAtPosition(x: number, y: number): string | null {
    for (const zone of this.zoneConfig.zones) {
      if (this.isPointInZone(x, y, zone)) {
        return zone.id;
      }
    }
    return null;
  }

  /**
   * Check if a point is inside a zone.
   */
  private isPointInZone(x: number, y: number, zone: Zone): boolean {
    const { bounds } = zone;

    switch (zone.shape) {
      case 'rectangle':
        return (
          x >= (bounds.x ?? 0) &&
          x < (bounds.x ?? 0) + (bounds.width ?? 0) &&
          y >= (bounds.y ?? 0) &&
          y < (bounds.y ?? 0) + (bounds.height ?? 0)
        );

      case 'circle':
        const dx = x - (bounds.centerX ?? 0.5);
        const dy = y - (bounds.centerY ?? 0.5);
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= (bounds.radius ?? 0.25);

      case 'polygon':
        // Simple ray casting for polygon
        if (!bounds.points || bounds.points.length < 3) return false;
        return this.isPointInPolygon(x, y, bounds.points);

      default:
        return false;
    }
  }

  /**
   * Ray casting algorithm for polygon containment.
   */
  private isPointInPolygon(x: number, y: number, points: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Handle entering a zone.
   */
  private handleZoneEnter(zoneId: string, timestamp: number): void {
    if (this.zoneConfig.onEnter === 'nothing') return;
    if (!this.zoneConfig.emitEvents) return;

    const mapping = this.zoneConfig.zoneMappings.find((m) => m.zoneId === zoneId);
    if (!mapping) return;

    this.pendingEvents.push(
      createChordEvent(
        'chordOn',
        mapping.midiNotes,
        this.zoneConfig.velocity,
        timestamp,
        mapping.voicingName
      )
    );
  }

  /**
   * Handle exiting a zone.
   */
  private handleZoneExit(zoneId: string, timestamp: number): void {
    if (this.zoneConfig.onExit === 'nothing') return;
    if (!this.zoneConfig.emitEvents) return;

    const mapping = this.zoneConfig.zoneMappings.find((m) => m.zoneId === zoneId);
    if (!mapping) return;

    this.pendingEvents.push(
      createChordEvent(
        'chordOff',
        mapping.midiNotes,
        0,
        timestamp,
        mapping.voicingName
      )
    );
  }

  // ============================================
  // Configuration Methods
  // ============================================

  /**
   * Set zones.
   */
  setZones(zones: Zone[]): void {
    this.zoneConfig.zones = zones;
  }

  /**
   * Set zone-to-chord mappings.
   */
  setZoneMappings(mappings: ZoneChordMapping[]): void {
    this.zoneConfig.zoneMappings = mappings;
  }

  /**
   * Set velocity for chord events.
   */
  setVelocity(velocity: number): void {
    this.zoneConfig.velocity = Math.max(0, Math.min(1, velocity));
  }

  /**
   * Get current zone ID.
   */
  getCurrentZone(): string | null {
    return this.currentZoneId;
  }

  /**
   * Get all zones.
   */
  getZones(): Zone[] {
    return [...this.zoneConfig.zones];
  }

  /**
   * Get zone mappings.
   */
  getZoneMappings(): ZoneChordMapping[] {
    return [...this.zoneConfig.zoneMappings];
  }

  /**
   * Get zone config.
   */
  getZoneConfig(): ZoneMappingConfig {
    return { ...this.zoneConfig };
  }

  /**
   * Set (or clear) the calibrated movement envelope.  When set, raw
   * positions are remapped into 0–1 zone space before lookup; when
   * cleared (passing null), the node falls back to raw frame coords.
   */
  setInputRange(range: ZoneMappingConfig['inputRange']): void {
    this.zoneConfig.inputRange = range;
  }

  /**
   * Reset zone state.
   */
  reset(): void {
    this.currentZoneId = null;
    this.pendingEvents = [];
  }
}

// ============================================
// Helpers (file-local; not exported)
// ============================================

function remapAxis(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return value;
  return (value - min) / span;
}

// Clamp to [0, 1).  The trailing open boundary matters because zone
// containment uses half-open intervals (`p >= min && p < max`) — clamping
// raw positions that overshoot the envelope to exactly 1.0 would leave
// them in no zone at all on the right/bottom edge.
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value >= 1) return 0.9999;
  return value;
}
