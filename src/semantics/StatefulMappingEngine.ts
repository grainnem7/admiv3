/**
 * Stateful Mapping Engine
 *
 * Advanced mapping system supporting:
 * - Continuous-to-continuous mappings with curves
 * - Many-to-one and one-to-many mappings
 * - Conditional mappings with duration requirements
 * - State machines for mode-based control
 * - Gaze-based routing
 * - Environmental musical fields
 *
 * This is the brain of the expressive ADMI mapping system.
 */

import type {
  MovementSemanticsFrame,
  Vector3,
  MappingDef,
  ContinuousMappingDef,
  ManyToOneMappingDef,
  OneToManyMappingDef,
  StateMachineDef,
  GazeRoutingDef,
  MusicalFieldDef,
  MappingCondition,
  MappingCurveType,
  MappingPreset,
  QuantizationConfig,
} from './types';

// ============================================
// Musical Output Types
// ============================================

/**
 * Output from the mapping engine - all musical parameters
 */
export interface MappingOutput {
  /** Continuous control values (0-1) */
  controls: Map<string, number>;

  /** Triggered events this frame */
  triggers: string[];

  /** Active state for each state machine */
  states: Map<string, string>;

  /** Which mappings are currently active */
  activeMappings: Set<string>;

  /** Which gaze route is active */
  activeGazeRoute: string | null;

  /** Which musical fields the body is in */
  activeFields: string[];

  /** Timestamp */
  timestamp: number;
}

/**
 * Musical scale definitions for quantization
 */
const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/**
 * Note name to MIDI number mapping
 */
const NOTE_TO_MIDI: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

// ============================================
// Utility Functions
// ============================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

/**
 * Utility function for remapping values between ranges (exported for external use)
 */
export function remapValue(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

/**
 * Apply mapping curve transformation
 */
function applyCurve(value: number, curve: MappingCurveType): number {
  const t = clamp(value, 0, 1);

  switch (curve) {
    case 'linear':
      return t;

    case 'exponential':
      return t * t;

    case 'logarithmic':
      return Math.sqrt(t);

    case 'sigmoid':
      return 1 / (1 + Math.exp(-12 * (t - 0.5)));

    case 'easeIn':
      return t * t * t;

    case 'easeOut':
      return 1 - Math.pow(1 - t, 3);

    case 'easeInOut':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    case 'step':
      return t < 0.5 ? 0 : 1;

    case 'custom':
      return t; // Custom curve handled separately

    default:
      return t;
  }
}

/**
 * Get value from object by path (e.g., 'joints.rightWrist.velocity.magnitude')
 */
function getValueByPath(obj: unknown, path: string): number | null {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return null;

    if (current instanceof Map) {
      current = current.get(part);
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  if (typeof current === 'number') return current;
  return null;
}

/**
 * Quantize a 0-1 value to a musical scale
 */
function quantizeToScale(
  value: number,
  config: QuantizationConfig
): number {
  if (!config.enabled) return value;

  const scale = SCALES[config.scale] ?? SCALES.major;
  const rootMidi = typeof config.root === 'string'
    ? NOTE_TO_MIDI[config.root] ?? 0
    : config.root;

  const { min: minOctave, max: maxOctave } = config.octaveRange;
  const totalNotes = scale.length * (maxOctave - minOctave + 1);

  // Map 0-1 to note index
  const noteIndex = Math.floor(value * totalNotes);
  const clampedIndex = clamp(noteIndex, 0, totalNotes - 1);

  // Convert to MIDI note
  const octave = Math.floor(clampedIndex / scale.length) + minOctave;
  const scaleIndex = clampedIndex % scale.length;
  const midiNote = rootMidi + octave * 12 + scale[scaleIndex];

  // Return as 0-1 normalized (C0=0, C8=1)
  return clamp(midiNote / 96, 0, 1);
}

// ============================================
// StatefulMappingEngine Class
// ============================================

export class StatefulMappingEngine {
  /** Currently loaded preset */
  private preset: MappingPreset | null = null;

  /** All mapping definitions indexed by ID */
  private mappings: Map<string, MappingDef> = new Map();

  /** Current state for each state machine */
  private stateMachineStates: Map<string, string> = new Map();

  /** Condition duration tracking (condition ID -> first true timestamp) */
  private conditionTimers: Map<string, number> = new Map();

  /** Current gaze route */
  private activeGazeRoute: string | null = null;

  /** Smoothed output values */
  private smoothedOutputs: Map<string, number> = new Map();

  /** Last frame for reference (used by external consumers) */
  private _lastFrame: MovementSemanticsFrame | null = null;

  /** Last output for diff detection (used by external consumers) */
  private _lastOutput: MappingOutput | null = null;

  constructor() {}

  /**
   * Load a mapping preset
   */
  loadPreset(preset: MappingPreset): void {
    this.preset = preset;
    this.mappings.clear();
    this.stateMachineStates.clear();
    this.conditionTimers.clear();

    // Index mappings by ID
    for (const mapping of preset.mappings) {
      this.mappings.set(mapping.id, mapping);

      // Initialize state machines
      if (mapping.type === 'stateMachine') {
        const sm = mapping as StateMachineDef;
        this.stateMachineStates.set(sm.id, preset.initialStates?.[sm.id] ?? sm.initialState);
      }
    }

    // Apply defaults
    if (preset.defaults) {
      for (const [key, value] of Object.entries(preset.defaults)) {
        if (typeof value === 'number') {
          this.smoothedOutputs.set(key, value);
        }
      }
    }

    console.log(`[StatefulMappingEngine] Loaded preset: ${preset.name} with ${this.mappings.size} mappings`);
  }

  /**
   * Process a movement semantics frame and produce mapping output
   */
  process(frame: MovementSemanticsFrame): MappingOutput {
    const timestamp = frame.timestamp;
    const controls = new Map<string, number>();
    const triggers: string[] = [];
    const activeMappings = new Set<string>();
    const activeFields: string[] = [];

    // Process gaze routing first (affects which mappings are active)
    this.processGazeRouting(frame);

    // Process state machines (can activate/deactivate mappings)
    this.processStateMachines(frame, timestamp);

    // Process musical fields
    const fieldOutputs = this.processMusicalFields(frame, activeFields);
    for (const [key, value] of fieldOutputs) {
      controls.set(key, value);
    }

    // Process continuous mappings
    for (const mapping of this.mappings.values()) {
      if (mapping.type === 'continuous') {
        const result = this.processContinuousMapping(
          mapping as ContinuousMappingDef,
          frame,
          timestamp
        );
        if (result !== null) {
          controls.set(mapping.id, result.value);
          if (result.active) activeMappings.add(mapping.id);
        }
      }
    }

    // Process many-to-one mappings
    for (const mapping of this.mappings.values()) {
      if (mapping.type === 'manyToOne') {
        const result = this.processManyToOneMapping(
          mapping as ManyToOneMappingDef,
          frame,
          timestamp
        );
        if (result !== null) {
          controls.set(mapping.id, result.value);
          if (result.active) activeMappings.add(mapping.id);
        }
      }
    }

    // Process one-to-many mappings
    for (const mapping of this.mappings.values()) {
      if (mapping.type === 'oneToMany') {
        const results = this.processOneToManyMapping(
          mapping as OneToManyMappingDef,
          frame,
          timestamp
        );
        for (const result of results) {
          controls.set(result.target, result.value);
        }
        if (results.length > 0) activeMappings.add(mapping.id);
      }
    }

    // Apply smoothing to outputs
    for (const [key, value] of controls) {
      const smoothed = this.smoothOutput(key, value);
      controls.set(key, smoothed);
    }

    this._lastFrame = frame;

    const output: MappingOutput = {
      controls,
      triggers,
      states: new Map(this.stateMachineStates),
      activeMappings,
      activeGazeRoute: this.activeGazeRoute,
      activeFields,
      timestamp,
    };

    this._lastOutput = output;
    return output;
  }

  /**
   * Process a continuous mapping
   */
  private processContinuousMapping(
    mapping: ContinuousMappingDef,
    frame: MovementSemanticsFrame,
    timestamp: number
  ): { value: number; active: boolean } | null {
    if (!mapping.enabled) return null;

    // Check conditions
    if (mapping.conditions && !this.evaluateConditions(mapping.conditions, frame, timestamp)) {
      return null;
    }

    // Get source value
    const sourceValue = getValueByPath(frame, mapping.source);
    if (sourceValue === null) return null;

    // Apply input range mapping
    let value = inverseLerp(mapping.inputRange.min, mapping.inputRange.max, sourceValue);

    // Apply dead zone
    if (mapping.deadZone > 0) {
      const center = 0.5;
      const distFromCenter = Math.abs(value - center);
      if (distFromCenter < mapping.deadZone / 2) {
        value = center;
      } else {
        // Rescale around dead zone
        const sign = value > center ? 1 : -1;
        value = center + sign * ((distFromCenter - mapping.deadZone / 2) / (0.5 - mapping.deadZone / 2)) * 0.5;
      }
    }

    // Apply curve
    if (mapping.customCurve) {
      value = mapping.customCurve(value);
    } else {
      value = applyCurve(value, mapping.curve);
    }

    // Apply inversion
    if (mapping.inverted) {
      value = 1 - value;
    }

    // Apply output range
    value = lerp(mapping.outputRange.min, mapping.outputRange.max, value);

    // Apply quantization
    if (mapping.quantization) {
      value = quantizeToScale(value, mapping.quantization);
    }

    return { value, active: true };
  }

  /**
   * Process a many-to-one mapping
   */
  private processManyToOneMapping(
    mapping: ManyToOneMappingDef,
    frame: MovementSemanticsFrame,
    timestamp: number
  ): { value: number; active: boolean } | null {
    if (!mapping.enabled) return null;

    if (mapping.conditions && !this.evaluateConditions(mapping.conditions, frame, timestamp)) {
      return null;
    }

    const values: number[] = [];

    for (const source of mapping.sources) {
      const rawValue = getValueByPath(frame, source.path);
      if (rawValue === null) continue;

      let value = inverseLerp(source.inputRange.min, source.inputRange.max, rawValue);
      value = applyCurve(value, source.curve);
      value *= source.weight;
      values.push(value);
    }

    if (values.length === 0) return null;

    let combined: number;
    switch (mapping.combineMode) {
      case 'add':
        combined = values.reduce((a, b) => a + b, 0);
        break;
      case 'multiply':
        combined = values.reduce((a, b) => a * b, 1);
        break;
      case 'average':
        combined = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'max':
        combined = Math.max(...values);
        break;
      case 'min':
        combined = Math.min(...values);
        break;
      case 'custom':
        combined = mapping.customCombine ? mapping.customCombine(values) : values[0];
        break;
      default:
        combined = values[0];
    }

    combined = clamp(combined, 0, 1);
    const output = lerp(mapping.outputRange.min, mapping.outputRange.max, combined);

    return { value: output, active: true };
  }

  /**
   * Process a one-to-many mapping
   */
  private processOneToManyMapping(
    mapping: OneToManyMappingDef,
    frame: MovementSemanticsFrame,
    timestamp: number
  ): Array<{ target: string; value: number }> {
    if (!mapping.enabled) return [];

    if (mapping.conditions && !this.evaluateConditions(mapping.conditions, frame, timestamp)) {
      return [];
    }

    const sourceValue = getValueByPath(frame, mapping.source);
    if (sourceValue === null) return [];

    const normalizedSource = inverseLerp(
      mapping.inputRange.min,
      mapping.inputRange.max,
      sourceValue
    );

    const results: Array<{ target: string; value: number }> = [];

    for (const target of mapping.targets) {
      let value = applyCurve(normalizedSource, target.curve);
      value = value * target.scale + target.offset;
      value = lerp(target.outputRange.min, target.outputRange.max, clamp(value, 0, 1));
      results.push({ target: target.path, value });
    }

    return results;
  }

  /**
   * Process state machines
   */
  private processStateMachines(frame: MovementSemanticsFrame, timestamp: number): void {
    for (const mapping of this.mappings.values()) {
      if (mapping.type !== 'stateMachine') continue;

      const sm = mapping as StateMachineDef;
      const currentStateId = this.stateMachineStates.get(sm.id);
      if (!currentStateId) continue;

      const currentState = sm.states.find((s) => s.id === currentStateId);
      if (!currentState) continue;

      // Check global conditions first
      if (sm.globalConditions) {
        for (const gc of sm.globalConditions) {
          if (this.evaluateConditions(gc.conditions, frame, timestamp)) {
            if (gc.action === 'reset') {
              this.stateMachineStates.set(sm.id, sm.initialState);
              break;
            } else if (typeof gc.action === 'object' && gc.action.gotoState) {
              this.executeStateTransition(sm, currentState, gc.action.gotoState);
              break;
            }
          }
        }
      }

      // Check state transitions
      for (const transition of currentState.transitions) {
        if (this.evaluateConditions(transition.conditions, frame, timestamp)) {
          this.executeStateTransition(sm, currentState, transition.toState);
          break;
        }
      }
    }
  }

  /**
   * Execute a state transition
   */
  private executeStateTransition(
    sm: StateMachineDef,
    fromState: { id: string; onExit?: Array<{ target: string; value: number | string }> },
    toStateId: string
  ): void {
    const toState = sm.states.find((s) => s.id === toStateId);
    if (!toState) return;

    console.log(`[StatefulMappingEngine] State transition: ${sm.id}: ${fromState.id} -> ${toStateId}`);

    // Execute onExit actions
    if (fromState.onExit) {
      for (const action of fromState.onExit) {
        if (typeof action.value === 'number') {
          this.smoothedOutputs.set(action.target, action.value);
        }
      }
    }

    // Update state
    this.stateMachineStates.set(sm.id, toStateId);

    // Execute onEnter actions
    if (toState.onEnter) {
      for (const action of toState.onEnter) {
        if (typeof action.value === 'number') {
          this.smoothedOutputs.set(action.target, action.value);
        }
      }
    }
  }

  /**
   * Process gaze routing
   */
  private processGazeRouting(frame: MovementSemanticsFrame): void {
    for (const mapping of this.mappings.values()) {
      if (mapping.type !== 'gazeRouting') continue;

      const gr = mapping as GazeRoutingDef;
      if (!gr.enabled) continue;

      const gaze = frame.gaze;
      let activeRoute: string | null = null;

      for (const route of gr.routes) {
        // Check if gaze is targeting this body part
        if (gaze.targetBodyPart === route.gazeTarget) {
          if (gaze.isFixated && gaze.fixationDuration >= route.minFixationMs) {
            activeRoute = route.activateController;
            break;
          }
        }
      }

      if (activeRoute !== this.activeGazeRoute) {
        console.log(`[StatefulMappingEngine] Gaze route changed: ${this.activeGazeRoute} -> ${activeRoute}`);
        this.activeGazeRoute = activeRoute ?? gr.defaultController;
      }
    }
  }

  /**
   * Process musical fields
   */
  private processMusicalFields(
    frame: MovementSemanticsFrame,
    activeFields: string[]
  ): Map<string, number> {
    const outputs = new Map<string, number>();

    for (const mapping of this.mappings.values()) {
      if (mapping.type !== 'musicalField') continue;

      const field = mapping as MusicalFieldDef;
      if (!field.enabled) continue;

      // Get trigger joint position
      const joint = frame.joints.get(field.triggerJoint);
      if (!joint) continue;

      const pos = joint.position;
      const inField = this.isPointInField(pos, field.geometry);

      if (inField) {
        activeFields.push(field.id);

        // Compute parameter values based on position in field
        for (const param of field.parameters) {
          const value = this.computeFieldInfluence(pos, field.geometry, param.influence);
          const curved = applyCurve(value, param.curve);
          const output = lerp(param.range.min, param.range.max, curved);
          outputs.set(param.target, output);
        }
      }
    }

    return outputs;
  }

  /**
   * Check if point is inside a field geometry
   */
  private isPointInField(
    point: Vector3,
    geometry:
      | { type: 'sphere'; center: Vector3; radius: number }
      | { type: 'box'; min: Vector3; max: Vector3 }
      | { type: 'cylinder'; center: Vector3; radius: number; height: number }
      | { type: 'plane'; point: Vector3; normal: Vector3 }
  ): boolean {
    switch (geometry.type) {
      case 'sphere': {
        const dx = point.x - geometry.center.x;
        const dy = point.y - geometry.center.y;
        const dz = point.z - geometry.center.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) <= geometry.radius;
      }

      case 'box':
        return (
          point.x >= geometry.min.x &&
          point.x <= geometry.max.x &&
          point.y >= geometry.min.y &&
          point.y <= geometry.max.y &&
          point.z >= geometry.min.z &&
          point.z <= geometry.max.z
        );

      case 'cylinder': {
        const dx = point.x - geometry.center.x;
        const dz = point.z - geometry.center.z;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        const verticalDist = Math.abs(point.y - geometry.center.y);
        return horizontalDist <= geometry.radius && verticalDist <= geometry.height / 2;
      }

      case 'plane':
        // For planes, we consider a thin slab
        const dx = point.x - geometry.point.x;
        const dy = point.y - geometry.point.y;
        const dz = point.z - geometry.point.z;
        const dist = Math.abs(
          dx * geometry.normal.x + dy * geometry.normal.y + dz * geometry.normal.z
        );
        return dist < 0.1;

      default:
        return false;
    }
  }

  /**
   * Compute influence value based on position within field
   */
  private computeFieldInfluence(
    point: Vector3,
    geometry:
      | { type: 'sphere'; center: Vector3; radius: number }
      | { type: 'box'; min: Vector3; max: Vector3 }
      | { type: 'cylinder'; center: Vector3; radius: number; height: number }
      | { type: 'plane'; point: Vector3; normal: Vector3 },
    influence: 'distance' | 'angle' | 'height' | 'radial'
  ): number {
    switch (influence) {
      case 'distance': {
        if (geometry.type === 'sphere') {
          const dx = point.x - geometry.center.x;
          const dy = point.y - geometry.center.y;
          const dz = point.z - geometry.center.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          return 1 - clamp(dist / geometry.radius, 0, 1);
        }
        return 0.5;
      }

      case 'height':
        return clamp(point.y, 0, 1);

      case 'angle': {
        if (geometry.type === 'sphere' || geometry.type === 'cylinder') {
          const dx = point.x - geometry.center.x;
          const dz = point.z - geometry.center.z;
          const angle = Math.atan2(dz, dx);
          return (angle + Math.PI) / (2 * Math.PI);
        }
        return 0.5;
      }

      case 'radial': {
        if (geometry.type === 'sphere' || geometry.type === 'cylinder') {
          const dx = point.x - geometry.center.x;
          const dz = point.z - geometry.center.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const maxDist = geometry.type === 'sphere' ? geometry.radius : geometry.radius;
          return clamp(dist / maxDist, 0, 1);
        }
        return 0.5;
      }

      default:
        return 0.5;
    }
  }

  /**
   * Evaluate a set of conditions
   */
  private evaluateConditions(
    conditions: MappingCondition[],
    frame: MovementSemanticsFrame,
    timestamp: number
  ): boolean {
    if (conditions.length === 0) return true;

    let result = true;
    let currentCombine: 'and' | 'or' = 'and';

    for (const condition of conditions) {
      const conditionResult = this.evaluateSingleCondition(condition, frame, timestamp);

      if (currentCombine === 'and') {
        result = result && conditionResult;
      } else {
        result = result || conditionResult;
      }

      currentCombine = condition.combineWith ?? 'and';
    }

    return result;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateSingleCondition(
    condition: MappingCondition,
    frame: MovementSemanticsFrame,
    timestamp: number
  ): boolean {
    const sourceValue = getValueByPath(frame, condition.source);
    if (sourceValue === null) return false;

    let matches = false;

    switch (condition.operator) {
      case '>':
        matches = sourceValue > (condition.value as number);
        break;
      case '<':
        matches = sourceValue < (condition.value as number);
        break;
      case '>=':
        matches = sourceValue >= (condition.value as number);
        break;
      case '<=':
        matches = sourceValue <= (condition.value as number);
        break;
      case '==':
        matches = sourceValue === condition.value;
        break;
      case '!=':
        matches = sourceValue !== condition.value;
        break;
      case 'in':
        matches = (condition.value as number[]).includes(sourceValue);
        break;
      case 'between':
        const [min, max] = condition.value as number[];
        matches = sourceValue >= min && sourceValue <= max;
        break;
    }

    // Handle duration requirement
    if (condition.durationMs && condition.durationMs > 0) {
      const conditionKey = `${condition.source}_${condition.operator}_${condition.value}`;

      if (matches) {
        const startTime = this.conditionTimers.get(conditionKey);
        if (startTime === undefined) {
          this.conditionTimers.set(conditionKey, timestamp);
          return false; // Duration not met yet
        }
        return timestamp - startTime >= condition.durationMs;
      } else {
        this.conditionTimers.delete(conditionKey);
        return false;
      }
    }

    return matches;
  }

  /**
   * Apply smoothing to output value
   */
  private smoothOutput(key: string, value: number): number {
    const current = this.smoothedOutputs.get(key);
    if (current === undefined) {
      this.smoothedOutputs.set(key, value);
      return value;
    }

    const smoothingFactor = 0.3;
    const smoothed = lerp(current, value, smoothingFactor);
    this.smoothedOutputs.set(key, smoothed);
    return smoothed;
  }

  /**
   * Get current state of a state machine
   */
  getState(stateMachineId: string): string | undefined {
    return this.stateMachineStates.get(stateMachineId);
  }

  /**
   * Get all current states
   */
  getAllStates(): Map<string, string> {
    return new Map(this.stateMachineStates);
  }

  /**
   * Get current gaze route
   */
  getActiveGazeRoute(): string | null {
    return this.activeGazeRoute;
  }

  /**
   * Get current preset
   */
  getPreset(): MappingPreset | null {
    return this.preset;
  }

  /**
   * Get a specific mapping by ID
   */
  getMapping(id: string): MappingDef | undefined {
    return this.mappings.get(id);
  }

  /**
   * Update a mapping dynamically
   */
  updateMapping(id: string, updates: Partial<MappingDef>): void {
    const existing = this.mappings.get(id);
    if (existing) {
      this.mappings.set(id, { ...existing, ...updates } as MappingDef);
    }
  }

  /**
   * Enable or disable a mapping
   */
  setMappingEnabled(id: string, enabled: boolean): void {
    const mapping = this.mappings.get(id);
    if (mapping && 'enabled' in mapping) {
      (mapping as { enabled: boolean }).enabled = enabled;
    }
  }

  /**
   * Get last processed frame
   */
  getLastFrame(): MovementSemanticsFrame | null {
    return this._lastFrame;
  }

  /**
   * Get last mapping output
   */
  getLastOutput(): MappingOutput | null {
    return this._lastOutput;
  }

  /**
   * Reset engine state
   */
  reset(): void {
    this.conditionTimers.clear();
    this.smoothedOutputs.clear();
    this._lastFrame = null;
    this._lastOutput = null;

    // Reset state machines to initial states
    if (this.preset) {
      for (const mapping of this.preset.mappings) {
        if (mapping.type === 'stateMachine') {
          const sm = mapping as StateMachineDef;
          this.stateMachineStates.set(
            sm.id,
            this.preset.initialStates?.[sm.id] ?? sm.initialState
          );
        }
      }
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let engineInstance: StatefulMappingEngine | null = null;

export function getStatefulMappingEngine(): StatefulMappingEngine {
  if (!engineInstance) {
    engineInstance = new StatefulMappingEngine();
  }
  return engineInstance;
}

export function resetStatefulMappingEngine(): void {
  engineInstance?.reset();
  engineInstance = null;
}
