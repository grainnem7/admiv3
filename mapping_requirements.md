# ADMI v3 Mapping Layer Specification

> **Version:** 1.0
> **Status:** Draft
> **Last Updated:** 2024-12-07

## Table of Contents

1. [Conceptual Role of the Mapping Layer](#1-conceptual-role-of-the-mapping-layer)
2. [Inputs: MovementEvents](#2-inputs-movementevents)
3. [Outputs: MusicalEvents](#3-outputs-musicalevents)
4. [Mapping Nodes and Engine](#4-mapping-nodes-and-engine)
5. [Modes, Presets, and Profiles](#5-modes-presets-and-profiles)
6. [Accessibility Principles](#6-accessibility-principles)
7. [Example Mappings](#7-example-mappings)
8. [Implementation Notes](#8-implementation-notes)

---

## 1. Conceptual Role of the Mapping Layer

The mapping layer is the **translation engine** of ADMI v3. It sits between movement detection and sound generation, transforming detected movements into musical actions. This separation of concerns is critical for accessibility and flexibility.

### Architectural Position

```
┌──────────────────────────────────────────────────────────────────┐
│                         ADMI v3 Pipeline                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────┐                                            │
│   │  TRACKING LAYER │  Raw pose/hands/face landmarks             │
│   │  (MediaPipe)    │  TrackingFrame { pose, hands, face }       │
│   └────────┬────────┘                                            │
│            │                                                     │
│            ▼                                                     │
│   ┌─────────────────┐                                            │
│   │  MOVEMENT LAYER │  Higher-level MovementEvents               │
│   │  (Feature       │  • Continuous values (position, velocity)  │
│   │   Extraction,   │  • Discrete gestures (pinch, blink, nod)   │
│   │   Gesture       │  • Zone events (enter/exit regions)        │
│   │   Detection)    │  • Motion events (onset, burst, steady)    │
│   └────────┬────────┘                                            │
│            │                                                     │
│            ▼                                                     │
│   ┌─────────────────┐                                            │
│   │  MAPPING LAYER  │  MusicalEvents for sound engine            │
│   │  (This Spec)    │  • Note/chord events (on/off)              │
│   │                 │  • Continuous control changes              │
│   │                 │  • Structural events (mode/preset switch)  │
│   │                 │  • Safety events (mute, panic)             │
│   └────────┬────────┘                                            │
│            │                                                     │
│            ▼                                                     │
│   ┌─────────────────┐                                            │
│   │   SOUND LAYER   │  Audio synthesis via Tone.js               │
│   │   (AudioEngine) │                                            │
│   └─────────────────┘                                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Key Responsibilities

1. **Subscribe** to MovementEvents from the movement layer
2. **Transform** movement data into musical parameters using configurable mapping nodes
3. **Emit** MusicalEvents to the sound engine
4. **Respect** the active InputProfile (only process movements from enabled sources)
5. **Provide** a modular, data-driven architecture that supports future UI-based editing

### Design Principles

- **Separation of concerns**: What is detected (movement) is separate from what it does (music)
- **Modularity**: Mapping nodes are independent, composable units
- **Non-prescriptive**: The system never assumes or infers user ability
- **Data-driven**: All mappings are representable as serializable configuration
- **Accessibility-first**: Every mapping decision prioritizes user agency and control

---

## 2. Inputs: MovementEvents

MovementEvents are the semantic outputs of the movement layer. They abstract raw landmark data into meaningful movement descriptions that the mapping layer can act upon.

### 2.1 MovementEvent Base Type

```typescript
/**
 * Base interface for all movement events.
 * All events carry source identification and timing.
 */
interface MovementEventBase {
  /** Unique event ID */
  id: string;
  /** Feature ID that generated this event */
  featureId: string;
  /** Modality source (pose, leftHand, rightHand, face) */
  modality: FeatureModality;
  /** Event timestamp */
  timestamp: number;
}
```

### 2.2 Continuous Control Events

Continuous events represent smoothly varying values derived from body position, velocity, or other continuous measurements.

```typescript
/**
 * Continuous control value from tracked feature.
 * Used for smooth parameter control (pitch, filter, volume).
 */
interface ContinuousMovementEvent extends MovementEventBase {
  type: 'continuous';

  /** Normalized position (0-1 range, calibrated to user's movement range) */
  position: {
    x: number;
    y: number;
    z: number;
  };

  /** Velocity vector with magnitude */
  velocity: {
    x: number;
    y: number;
    z: number;
    magnitude: number;
  };

  /** Whether the feature is currently active (above noise threshold) */
  isActive: boolean;

  /** Detection confidence (0-1) */
  confidence: number;
}

/**
 * Examples of continuous sources:
 * - Hand height (y position) → pitch
 * - Hand horizontal position (x) → pan or filter sweep
 * - Finger spread distance → filter cutoff or harmonic richness
 * - Mouth openness (0-1) → volume or vowel formant
 * - Head tilt angle → vibrato depth or stereo field
 */
```

### 2.3 Discrete Gesture Events

Discrete events represent momentary actions that trigger specific musical responses.

```typescript
/**
 * Discrete gesture detection event.
 * Used for triggering notes, chords, or mode switches.
 */
interface DiscreteGestureEvent extends MovementEventBase {
  type: 'gesture';

  /** Gesture type identifier */
  gestureType:
    | 'pinch'           // Thumb-index contact
    | 'release'         // Pinch release
    | 'blink'           // Eye closure
    | 'wink_left'       // Left eye only
    | 'wink_right'      // Right eye only
    | 'brow_raise'      // Eyebrow elevation
    | 'brow_furrow'     // Eyebrow lowering
    | 'mouth_open'      // Mouth opening past threshold
    | 'mouth_close'     // Mouth closing
    | 'head_nod'        // Vertical head movement
    | 'head_shake'      // Horizontal head movement
    | 'thumb_up'        // Thumb extension
    | 'fist'            // Hand closure
    | 'point'           // Index extension
    | 'custom';         // User-defined gesture

  /** Gesture intensity (0-1) for gestures with variable strength */
  intensity: number;

  /** Whether this is the onset (true) or offset (false) of the gesture */
  isOnset: boolean;

  /** Optional custom gesture ID for user-defined gestures */
  customGestureId?: string;
}

/**
 * Examples of discrete gesture uses:
 * - Blink → trigger next chord in progression
 * - Eyebrow raise → toggle drone layer on/off
 * - Pinch → note attack, release → note release
 * - Head nod → confirm/activate hovered selection
 */
```

### 2.4 Zone-Based Events

Zone events occur when tracked features enter or exit defined spatial regions.

```typescript
/**
 * Zone definition for spatial triggering.
 */
interface Zone {
  id: string;
  name: string;

  /** Zone shape */
  shape: 'rectangle' | 'circle' | 'polygon';

  /** Normalized coordinates (0-1 range) */
  bounds: {
    // For rectangle
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    // For circle
    centerX?: number;
    centerY?: number;
    radius?: number;
    // For polygon
    points?: { x: number; y: number }[];
  };

  /** Visual feedback color */
  color?: string;
}

/**
 * Zone entry/exit event.
 * Used for MusiKraken-style chord pads and spatial instruments.
 */
interface ZoneEvent extends MovementEventBase {
  type: 'zone';

  /** Zone identifier */
  zoneId: string;

  /** Event subtype */
  action: 'enter' | 'exit' | 'dwell';

  /** Position within zone (normalized to zone bounds) */
  positionInZone?: { x: number; y: number };

  /** Time spent in zone (for dwell events) */
  dwellTimeMs?: number;
}

/**
 * Examples of zone-based uses:
 * - Screen divided into 4 quadrants → 4 chord pads
 * - Vertical strips → scale degrees
 * - Circular regions → drone activators
 */
```

### 2.5 Motion Quality Events

Motion quality events describe the character of movement rather than position.

```typescript
/**
 * Motion quality/pattern event.
 * Ported from v2's MovementResponseEngine.
 */
interface MotionQualityEvent extends MovementEventBase {
  type: 'motion';

  /** Motion quality type */
  motionType:
    | 'onset'    // Movement starts
    | 'offset'   // Movement stops
    | 'burst'    // Sudden high-energy spike
    | 'drift'    // Slow, sustained motion
    | 'steady';  // Consistent motion maintained

  /** Event intensity (0-1) */
  intensity: number;

  /** Direction of motion (if applicable) */
  direction?: { x: number; y: number };
}

/**
 * Examples of motion quality uses:
 * - Motion burst → accent/sforzando
 * - Motion onset → note attack
 * - Motion drift → legato, slow filter sweep
 * - Motion steady → sustain confirmation
 */
```

### 2.6 Dwell/Confirm Events

Dwell events enable intentional activation through sustained presence.

```typescript
/**
 * Dwell confirmation event.
 * Triggered when a feature remains stable in a region for a defined duration.
 */
interface DwellEvent extends MovementEventBase {
  type: 'dwell';

  /** Dwell progress (0-1, where 1 = confirmed) */
  progress: number;

  /** Whether dwell has been confirmed */
  confirmed: boolean;

  /** Target zone or region ID (if applicable) */
  targetId?: string;

  /** Position where dwell is occurring */
  position: { x: number; y: number };
}

/**
 * Dwell is critical for:
 * - Users who cannot make quick, precise gestures
 * - Confirming intentional actions vs incidental movement
 * - Accessible UI navigation (dwell-to-click)
 */
```

### 2.7 Union Type

```typescript
/**
 * Union of all MovementEvent types.
 */
type MovementEvent =
  | ContinuousMovementEvent
  | DiscreteGestureEvent
  | ZoneEvent
  | MotionQualityEvent
  | DwellEvent;
```

---

## 3. Outputs: MusicalEvents

MusicalEvents are the mapping layer's output to the sound engine. They represent specific musical actions to be performed.

### 3.1 Note Events

```typescript
/**
 * Single note event.
 */
interface NoteEvent {
  type: 'note';

  /** Note subtype */
  action: 'noteOn' | 'noteOff';

  /** MIDI note number (0-127) */
  midiNote: number;

  /** Velocity (0-1) */
  velocity: number;

  /** Optional voice ID for polyphonic tracking */
  voiceId?: string;

  /** Timestamp */
  timestamp: number;
}

/**
 * Chord event (multiple simultaneous notes).
 */
interface ChordEvent {
  type: 'chord';

  /** Chord subtype */
  action: 'chordOn' | 'chordOff';

  /** Array of MIDI notes */
  midiNotes: number[];

  /** Velocity for all notes (0-1) */
  velocity: number;

  /** Chord voicing name (for display) */
  voicingName?: string;

  /** Optional voice IDs */
  voiceIds?: string[];

  /** Timestamp */
  timestamp: number;
}
```

### 3.2 Continuous Control Events

```typescript
/**
 * Continuous parameter control.
 * Maps to synthesizer parameters, effects, or modulation.
 */
interface ControlChangeEvent {
  type: 'control';

  /** Parameter being controlled */
  parameter:
    | 'pitch'           // Pitch bend or continuous pitch
    | 'volume'          // Amplitude
    | 'filter_cutoff'   // Low-pass filter frequency
    | 'filter_resonance'// Filter Q
    | 'pan'             // Stereo position
    | 'reverb_mix'      // Reverb send
    | 'delay_mix'       // Delay send
    | 'attack'          // Envelope attack time
    | 'release'         // Envelope release time
    | 'vibrato_rate'    // Vibrato LFO speed
    | 'vibrato_depth'   // Vibrato intensity
    | 'harmonic_richness' // Oscillator mix or overtone content
    | 'formant'         // Vowel formant position
    | 'custom';         // User-defined parameter

  /** Normalized value (0-1) */
  value: number;

  /** Optional custom parameter ID */
  customParameterId?: string;

  /** Timestamp */
  timestamp: number;
}
```

### 3.3 Structural Events

```typescript
/**
 * Structural/mode-switching events.
 * Control higher-level musical organization.
 */
interface StructuralEvent {
  type: 'structural';

  /** Structural action */
  action:
    | 'toggleLayer'      // Enable/disable a sound layer
    | 'switchMode'       // Change mapping mode (e.g., melodic → chord pad)
    | 'switchPreset'     // Change sound preset
    | 'switchScale'      // Change musical scale
    | 'transposeUp'      // Shift pitch up
    | 'transposeDown'    // Shift pitch down
    | 'nextChord'        // Advance chord progression
    | 'previousChord'    // Reverse chord progression
    | 'startRecording'   // Begin loop recording
    | 'stopRecording'    // End loop recording
    | 'toggleLoop';      // Enable/disable loop playback

  /** Target ID (layer, preset, mode, etc.) */
  targetId?: string;

  /** Optional value (e.g., transpose amount) */
  value?: number;

  /** Timestamp */
  timestamp: number;
}
```

### 3.4 Safety Events

```typescript
/**
 * Safety and emergency events.
 * Critical for accessibility and user control.
 */
interface SafetyEvent {
  type: 'safety';

  /** Safety action */
  action:
    | 'muteOn'    // Mute all audio
    | 'muteOff'   // Unmute audio
    | 'panic'     // Kill all notes immediately
    | 'reset';    // Reset all state to defaults

  /** Timestamp */
  timestamp: number;
}
```

### 3.5 Union Type

```typescript
/**
 * Union of all MusicalEvent types.
 */
type MusicalEvent =
  | NoteEvent
  | ChordEvent
  | ControlChangeEvent
  | StructuralEvent
  | SafetyEvent;
```

---

## 4. Mapping Nodes and Engine

### 4.1 Mapping Node Concept

A **mapping node** is a modular unit that:
1. Subscribes to specific MovementEvents
2. Transforms movement data according to its configuration
3. Emits specific MusicalEvents

Mapping nodes are inspired by the MusiKraken architecture, where movement-to-music mappings are discrete, configurable units rather than hard-coded relationships.

### 4.2 Base Mapping Node Interface

```typescript
/**
 * Base configuration for all mapping nodes.
 */
interface MappingNodeConfig {
  /** Unique node identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Whether node is currently active */
  enabled: boolean;

  /** Input connections from movement features */
  inputs: MappingInput[];

  /** Node-specific parameters */
  parameters: Record<string, number | string | boolean>;
}

/**
 * Input connection definition.
 */
interface MappingInput {
  /** Source feature ID from InputProfile */
  sourceFeatureId: string;

  /** What aspect of the feature to use */
  sourceType: 'position' | 'velocity' | 'gesture';

  /** Which axis for position/velocity */
  axis?: 'x' | 'y' | 'z' | 'magnitude';

  /** Input value range (for normalization) */
  inputRange: { min: number; max: number };

  /** Output value range (after mapping) */
  outputRange: { min: number; max: number };

  /** Mapping curve */
  curve: 'linear' | 'exponential' | 'logarithmic' | 'step';

  /** Invert the mapping */
  inverted: boolean;

  /** Dead zone (values below this are treated as 0) */
  deadZone?: number;
}

/**
 * Abstract mapping node interface.
 */
interface MappingNode {
  readonly id: string;
  readonly name: string;
  enabled: boolean;

  /** Process a movement frame and emit musical events */
  process(frame: ProcessedFrame): MusicalEvent[];

  /** Get current configuration */
  getConfig(): MappingNodeConfig;

  /** Update configuration */
  setConfig(config: Partial<MappingNodeConfig>): void;

  /** Reset internal state */
  reset(): void;
}
```

### 4.3 Core Mapping Node Types

#### ContinuousMappingNode

Maps continuous movement values to continuous musical parameters.

```typescript
/**
 * Maps continuous input (position/velocity) to continuous output (pitch/filter/volume).
 */
interface ContinuousMappingNodeConfig extends MappingNodeConfig {
  type: 'continuous';

  /** Target musical parameter */
  targetParameter:
    | 'pitch'
    | 'volume'
    | 'filter_cutoff'
    | 'filter_resonance'
    | 'pan'
    | 'reverb_mix'
    | 'vibrato_depth'
    | 'harmonic_richness'
    | 'custom';

  /** Smoothing factor (0 = none, 1 = maximum) */
  smoothing: number;

  /** Rate limiting (max change per second) */
  rateLimit?: number;

  /** Custom parameter ID if targetParameter is 'custom' */
  customParameterId?: string;
}

/**
 * Example: Hand height → Pitch
 * - Input: right wrist Y position
 * - Output: Pitch value 0-1 (mapped to scale by sound engine)
 * - Curve: Linear
 * - Smoothing: 0.3 (light smoothing for responsive but not jittery control)
 */
```

#### TriggerMappingNode

Maps discrete gestures or zone events to note/chord triggers.

```typescript
/**
 * Maps discrete events to triggered musical actions.
 */
interface TriggerMappingNodeConfig extends MappingNodeConfig {
  type: 'trigger';

  /** Trigger mode */
  mode:
    | 'oneshot'     // Trigger on onset, no sustain
    | 'gate'        // Sustain while gesture held, release on offset
    | 'toggle'      // Toggle on/off with each trigger
    | 'latch';      // Sustain until next trigger

  /** What to trigger */
  triggerAction:
    | 'note'
    | 'chord'
    | 'structural'
    | 'safety';

  /** For note/chord: MIDI note or chord root */
  midiNote?: number;

  /** For chord: voicing to use */
  chordVoicing?: string;

  /** For structural: action to perform */
  structuralAction?: StructuralEvent['action'];

  /** Velocity when triggered */
  velocity: number;

  /** Attack ramp time (ms) */
  attackTime?: number;

  /** Release ramp time (ms) */
  releaseTime?: number;
}

/**
 * Example: Blink → Next Chord
 * - Input: Blink gesture
 * - Mode: oneshot
 * - Action: structural/nextChord
 */
```

#### ZoneMappingNode

Maps spatial zones to musical regions (chord pads, scale positions, etc.).

```typescript
/**
 * Maps zone events to musical actions.
 * Enables MusiKraken-style spatial instruments.
 */
interface ZoneMappingNodeConfig extends MappingNodeConfig {
  type: 'zone';

  /** Zone definitions */
  zones: Zone[];

  /** What happens when entering a zone */
  onEnter:
    | 'playChord'
    | 'playNote'
    | 'startDrone'
    | 'enableEffect'
    | 'switchMode';

  /** What happens when exiting a zone */
  onExit:
    | 'stopChord'
    | 'stopNote'
    | 'stopDrone'
    | 'disableEffect'
    | 'nothing';

  /** Zone-to-chord/note mapping */
  zoneMappings: {
    zoneId: string;
    midiNotes?: number[];        // For chord/note
    chordVoicing?: string;       // Named voicing
    effectId?: string;           // For effects
    modeId?: string;             // For mode switching
  }[];

  /** Whether zones require dwell to activate */
  requireDwell: boolean;

  /** Dwell time if required (ms) */
  dwellTimeMs?: number;

  /** Whether position within zone affects parameters */
  continuousWithinZone: boolean;

  /** If continuous: which parameter */
  withinZoneParameter?: 'velocity' | 'volume' | 'filter' | 'pitch_bend';
}

/**
 * Example: 4-Quadrant Chord Pad
 * - Zones: top-left, top-right, bottom-left, bottom-right
 * - OnEnter: playChord
 * - OnExit: stopChord
 * - Mappings: C major, G major, A minor, F major
 */
```

#### GestureMappingNode (Future)

For complex multi-gesture patterns and sequences.

```typescript
/**
 * Maps gesture sequences or patterns to actions.
 * FUTURE: For advanced gesture recognition.
 */
interface GestureMappingNodeConfig extends MappingNodeConfig {
  type: 'gesture_pattern';

  /** Gesture sequence to detect */
  pattern: {
    gestures: DiscreteGestureEvent['gestureType'][];
    maxIntervalMs: number;  // Max time between gestures
  };

  /** Action when pattern completed */
  action: StructuralEvent['action'];

  /** Target for action */
  targetId?: string;
}

/**
 * Example: Double-blink → Toggle mute
 * - Pattern: [blink, blink] within 500ms
 * - Action: structural/toggleMute
 */
```

### 4.4 Mapping Engine

The mapping engine orchestrates all mapping nodes:

```typescript
/**
 * Central mapping engine.
 * Receives ProcessedFrame from movement layer, outputs MusicalEvents for sound layer.
 */
interface MappingEngine {
  /** Add a mapping node */
  addNode(node: MappingNode): void;

  /** Remove a mapping node */
  removeNode(nodeId: string): boolean;

  /** Get a node by ID */
  getNode(nodeId: string): MappingNode | null;

  /** Get all nodes */
  getAllNodes(): MappingNode[];

  /** Enable/disable a node */
  setNodeEnabled(nodeId: string, enabled: boolean): void;

  /** Process a frame through all active nodes */
  process(frame: ProcessedFrame): MappingEngineOutput;

  /** Configure from an InputProfile */
  configureFromProfile(profile: InputProfile): void;

  /** Subscribe to MusicalEvents */
  onMusicalEvent(callback: (event: MusicalEvent) => void): () => void;

  /** Reset all nodes */
  reset(): void;
}

interface MappingEngineOutput {
  /** All node outputs keyed by node ID */
  nodeOutputs: Map<string, MappingNodeOutput>;

  /** Combined result for sound engine */
  result: MappingResult;

  /** All emitted MusicalEvents this frame */
  events: MusicalEvent[];

  /** Timestamp */
  timestamp: number;
}
```

### 4.5 Processing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Mapping Engine                             │
│                                                                 │
│   ProcessedFrame (from Movement Layer)                          │
│        │                                                        │
│        ▼                                                        │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │ Continuous  │  │  Trigger    │  │    Zone     │  ...       │
│   │   Node 1    │  │   Node 1    │  │   Node 1    │            │
│   │ (pitch)     │  │ (blink→ch.) │  │ (quad pads) │            │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│          │                │                │                    │
│          ▼                ▼                ▼                    │
│   ┌─────────────────────────────────────────────────┐          │
│   │              Event Aggregator                    │          │
│   │  • Collect all MusicalEvents from nodes          │          │
│   │  • Resolve conflicts (e.g., simultaneous notes)  │          │
│   │  • Apply global modifiers (master volume, etc.)  │          │
│   └─────────────────────────────────────────────────┘          │
│                          │                                      │
│                          ▼                                      │
│              MusicalEvents[] → Sound Engine                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Modes, Presets, and Profiles

### 5.1 Mapping Preset

A **mapping preset** is a named, saveable collection of mapping nodes and their configurations.

```typescript
/**
 * A complete mapping configuration.
 */
interface MappingPreset {
  id: string;
  name: string;
  description?: string;

  /** Mapping nodes in this preset */
  nodes: MappingNodeConfig[];

  /** Which musical mode this preset is designed for */
  mode: MappingMode;

  /** Sound preset to use with this mapping */
  soundPresetId?: string;

  /** Whether this is a system preset (read-only) */
  isSystemPreset: boolean;

  /** Timestamp */
  createdAt: number;
  updatedAt: number;
}
```

### 5.2 Mapping Mode

A **mapping mode** represents a distinct way of playing the instrument.

```typescript
/**
 * High-level mapping mode.
 */
type MappingMode =
  | 'continuous_pitch'   // Continuous melodic control (theremin-style)
  | 'chord_pad'          // Zone-based chord triggering
  | 'drone_fx'           // Drone layers with effect control
  | 'percussion'         // Trigger-based percussion
  | 'scale_steps'        // Quantized scale positions
  | 'expression_only'    // Only control expression (volume, filter, etc.)
  | 'face_only'          // Optimized for face-only control
  | 'hybrid'             // Custom combination
  | 'custom';            // User-defined mode

/**
 * Mode definitions with default mappings.
 */
interface MappingModeDefinition {
  mode: MappingMode;
  name: string;
  description: string;

  /** Which input types this mode uses */
  primaryInputs: ('continuous' | 'gesture' | 'zone' | 'motion')[];

  /** Default node configurations for this mode */
  defaultNodes: MappingNodeConfig[];

  /** Recommended sound presets */
  recommendedSoundPresets: string[];
}
```

### 5.3 Input Profiles

An **InputProfile** defines which movement sources are available for mapping. The mapping layer MUST respect the active profile.

```typescript
/**
 * How InputProfile interacts with mapping:
 *
 * 1. User/facilitator selects an InputProfile
 * 2. Profile defines which modalities are active (pose, hands, face)
 * 3. Profile defines which specific features are tracked
 * 4. Mapping engine filters MovementEvents to only those from active features
 * 5. Mapping nodes only receive events matching their input configuration
 *
 * The profile acts as a GATE, not a definition of ability.
 */

interface InputProfileMappingIntegration {
  /**
   * When profile changes:
   * 1. Filter mapping nodes to those compatible with profile
   * 2. Disable nodes whose required inputs are not available
   * 3. Reconfigure continuous mappings to use available features
   */
  onProfileChange(profile: InputProfile): void;

  /**
   * Check if a mapping node is compatible with the current profile.
   */
  isNodeCompatible(node: MappingNode, profile: InputProfile): boolean;

  /**
   * Get available features for a given input type.
   */
  getAvailableFeatures(profile: InputProfile, inputType: 'continuous' | 'gesture'): TrackedFeature[];
}
```

### 5.4 Profile Interaction Example

```
┌─────────────────────────────────────────────────────────────────┐
│                  Profile: "Face Control"                        │
│                                                                 │
│  Active Modalities: { pose: false, hands: false, face: true }   │
│                                                                 │
│  Tracked Features:                                              │
│    - head_y: Head vertical position (continuous)               │
│    - mouth_openness: Mouth aperture (continuous)               │
│    - blink: Blink detection (trigger)                          │
│    - brow_raise: Eyebrow raise (trigger)                       │
│                                                                 │
│  Movement Settings:                                             │
│    - smoothingLevel: heavy                                      │
│    - dwellEnabled: true                                         │
│    - dwellTimeMs: 600                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Compatible Mapping Nodes:                          │
│                                                                 │
│  ✓ ContinuousMappingNode (head_y → pitch)                      │
│  ✓ ContinuousMappingNode (mouth_openness → volume)             │
│  ✓ TriggerMappingNode (blink → next_chord)                     │
│  ✓ TriggerMappingNode (brow_raise → toggle_layer)              │
│                                                                 │
│  ✗ ZoneMappingNode (requires hand tracking) — DISABLED         │
│  ✗ ContinuousMappingNode (hand_height) — DISABLED              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Accessibility Principles

### 6.1 Non-Prescriptive Design

**The mapping system MUST NOT infer mobility level or ability from movement data.**

```
❌ WRONG:
   - "Detected limited range of motion, switching to low-mobility mode"
   - "User appears to have difficulty with gestures, simplifying interface"
   - "Auto-adjusting sensitivity based on movement capability"

✓ CORRECT:
   - User or facilitator explicitly selects input profile
   - Profile defines which movements are available for mapping
   - All configuration is intentional, not inferred
```

### 6.2 User/Facilitator Agency

All mapping decisions are made by the user or their facilitator:

1. **Profile Selection**: Which body parts/features to use
2. **Feature Configuration**: Sensitivity, thresholds, dead zones
3. **Mapping Assignment**: Which movement controls which parameter
4. **Mode Selection**: How the instrument behaves

### 6.3 Full Spectrum Support

The mapping system MUST support the full spectrum of use cases:

| Use Case | Input Sources | Example Mapping |
|----------|--------------|-----------------|
| Full-body expressive | Pose + hands + face | Whole-body theremin with gestural triggers |
| Upper body only | Pose (upper) + hands | Arm height for pitch, gestures for chords |
| Single arm | One hand/arm | Single-axis pitch with velocity dynamics |
| Head only | Head position + face | Head tilt for pitch, blink for triggers |
| Face only | Facial expressions | Mouth for volume, brows for mode, blinks for notes |
| Eye gaze + blink | Face (eyes only) | Gaze position for selection, blink for activation |

### 6.4 Intentional vs Unintentional Movement

The system must distinguish intentional musical gestures from incidental movement:

```typescript
/**
 * Intentionality detection mechanisms:
 */

interface IntentionalityConfig {
  /** Dead zones: movement below threshold is ignored */
  deadZone: {
    position: number;  // Normalized position dead zone
    velocity: number;  // Minimum velocity for onset
  };

  /** Stability windows: require sustained presence before triggering */
  stabilityWindow: {
    enabled: boolean;
    durationMs: number;  // How long to wait
    tolerance: number;   // How much drift is allowed
  };

  /** Dwell confirmation: hold position to confirm intention */
  dwellConfirm: {
    enabled: boolean;
    dwellTimeMs: number;
    visualFeedback: boolean;  // Show dwell progress to user
  };

  /** Velocity gating: require deliberate speed for triggers */
  velocityGating: {
    enabled: boolean;
    minVelocity: number;  // For trigger onset
    maxVelocity: number;  // Reject if too fast (spasm protection)
  };

  /** Cooldowns: prevent rapid re-triggering */
  cooldowns: {
    globalCooldownMs: number;    // Between any triggers
    perGestureCooldownMs: number; // Between same gesture
  };
}
```

### 6.5 Configurable Thresholds

Every threshold in the system should be user-configurable:

- Gesture detection thresholds
- Zone boundary margins
- Dwell timing
- Velocity requirements
- Dead zone sizes
- Smoothing levels
- Stability requirements

---

## 7. Example Mappings

### 7.1 Head Vertical Position → Continuous Pitch

**Scenario**: A user with limited hand mobility uses head movement for melodic control.

```typescript
const headPitchMapping: ContinuousMappingNodeConfig = {
  id: 'head-pitch',
  name: 'Head Height → Pitch',
  type: 'continuous',
  enabled: true,

  inputs: [{
    sourceFeatureId: 'head-y',
    sourceType: 'position',
    axis: 'y',
    inputRange: { min: 0.3, max: 0.7 },  // Calibrated to user's comfortable range
    outputRange: { min: 0, max: 1 },
    curve: 'linear',
    inverted: false,
    deadZone: 0.02,
  }],

  parameters: {
    targetParameter: 'pitch',
    smoothing: 0.4,  // Medium smoothing for expressive but stable control
    rateLimit: 2.0,  // Max 2 octaves per second to prevent jumps
  },
};
```

**MovementEvents Used:**
- `ContinuousMovementEvent` from head position tracking (face modality)

**MusicalEvents Produced:**
- `ControlChangeEvent` with `parameter: 'pitch'`, continuously updated

**Why Accessible:**
- Works with head movement alone
- Dead zone prevents jitter
- Smoothing provides stable output
- Rate limiting prevents jarring jumps from involuntary movements

---

### 7.2 Blink / Eyebrow Raise → Chord Changes & Layer Toggles

**Scenario**: A user navigates through chord progressions using facial gestures.

```typescript
const blinkChordMapping: TriggerMappingNodeConfig = {
  id: 'blink-chord',
  name: 'Blink → Next Chord',
  type: 'trigger',
  enabled: true,

  inputs: [{
    sourceFeatureId: 'blink-gesture',
    sourceType: 'gesture',
    inputRange: { min: 0, max: 1 },
    outputRange: { min: 0, max: 1 },
    curve: 'linear',
    inverted: false,
  }],

  parameters: {
    mode: 'oneshot',
    triggerAction: 'structural',
    structuralAction: 'nextChord',
    velocity: 0.8,
  },
};

const browLayerMapping: TriggerMappingNodeConfig = {
  id: 'brow-layer',
  name: 'Eyebrow Raise → Toggle Pad Layer',
  type: 'trigger',
  enabled: true,

  inputs: [{
    sourceFeatureId: 'brow-raise-gesture',
    sourceType: 'gesture',
    inputRange: { min: 0, max: 1 },
    outputRange: { min: 0, max: 1 },
    curve: 'linear',
    inverted: false,
  }],

  parameters: {
    mode: 'toggle',
    triggerAction: 'structural',
    structuralAction: 'toggleLayer',
    targetId: 'pad-layer',
    velocity: 1.0,
  },
};
```

**MovementEvents Used:**
- `DiscreteGestureEvent` with `gestureType: 'blink'`
- `DiscreteGestureEvent` with `gestureType: 'brow_raise'`

**MusicalEvents Produced:**
- `StructuralEvent` with `action: 'nextChord'` (on blink)
- `StructuralEvent` with `action: 'toggleLayer'` (on eyebrow raise)

**Why Accessible:**
- No hand movement required
- Clear, discrete actions (not continuous control)
- Toggle mode means user doesn't need to hold gesture
- Cooldowns prevent accidental double-triggers

---

### 7.3 Hand Zones → Chord Pads (MusiKraken-Style)

**Scenario**: The user plays chords by moving their hand into screen regions.

```typescript
const chordPadMapping: ZoneMappingNodeConfig = {
  id: 'chord-pads',
  name: 'Hand Position → Chord Pads',
  type: 'zone',
  enabled: true,

  inputs: [{
    sourceFeatureId: 'right-wrist',
    sourceType: 'position',
    inputRange: { min: 0, max: 1 },
    outputRange: { min: 0, max: 1 },
    curve: 'linear',
    inverted: false,
  }],

  parameters: {
    zones: [
      { id: 'zone-tl', shape: 'rectangle', bounds: { x: 0, y: 0, width: 0.5, height: 0.5 }, color: '#4CAF50' },
      { id: 'zone-tr', shape: 'rectangle', bounds: { x: 0.5, y: 0, width: 0.5, height: 0.5 }, color: '#2196F3' },
      { id: 'zone-bl', shape: 'rectangle', bounds: { x: 0, y: 0.5, width: 0.5, height: 0.5 }, color: '#FF9800' },
      { id: 'zone-br', shape: 'rectangle', bounds: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }, color: '#9C27B0' },
    ],
    onEnter: 'playChord',
    onExit: 'stopChord',
    zoneMappings: [
      { zoneId: 'zone-tl', midiNotes: [60, 64, 67], chordVoicing: 'C Major' },
      { zoneId: 'zone-tr', midiNotes: [67, 71, 74], chordVoicing: 'G Major' },
      { zoneId: 'zone-bl', midiNotes: [69, 72, 76], chordVoicing: 'A Minor' },
      { zoneId: 'zone-br', midiNotes: [65, 69, 72], chordVoicing: 'F Major' },
    ],
    requireDwell: false,
    continuousWithinZone: true,
    withinZoneParameter: 'volume',
  },
};
```

**MovementEvents Used:**
- `ZoneEvent` with `action: 'enter'` / `action: 'exit'`
- `ContinuousMovementEvent` for position within zone

**MusicalEvents Produced:**
- `ChordEvent` with `action: 'chordOn'` on zone entry
- `ChordEvent` with `action: 'chordOff'` on zone exit
- `ControlChangeEvent` with `parameter: 'volume'` based on position in zone

**Why Accessible:**
- Large target areas (no precision required)
- Visual feedback with colored zones
- Optional dwell for users who need more time
- Continuous control within zone for added expression

---

### 7.4 Finger Spread → Filter Cutoff / Harmonic Richness

**Scenario**: A user with good hand mobility uses finger spread for timbral control.

```typescript
const fingerSpreadMapping: ContinuousMappingNodeConfig = {
  id: 'finger-spread-filter',
  name: 'Finger Spread → Filter Cutoff',
  type: 'continuous',
  enabled: true,

  inputs: [{
    sourceFeatureId: 'right-hand-spread',
    sourceType: 'position',
    axis: 'magnitude',  // Distance between fingers
    inputRange: { min: 0.1, max: 0.4 },  // Calibrated finger spread range
    outputRange: { min: 0, max: 1 },
    curve: 'exponential',  // More control at lower values (closed hand)
    inverted: false,
    deadZone: 0.02,
  }],

  parameters: {
    targetParameter: 'filter_cutoff',
    smoothing: 0.2,  // Light smoothing for responsive control
  },
};
```

**MovementEvents Used:**
- `ContinuousMovementEvent` from computed finger spread feature

**MusicalEvents Produced:**
- `ControlChangeEvent` with `parameter: 'filter_cutoff'`

**Why Accessible:**
- Uses hand capability when available
- Exponential curve gives fine control in common range
- Dead zone prevents unintended changes at rest position

---

### 7.5 Mouth Openness → Volume or Vowel Timbre

**Scenario**: A user with limited limb mobility uses mouth opening for expressive dynamics.

```typescript
const mouthVolumeMapping: ContinuousMappingNodeConfig = {
  id: 'mouth-volume',
  name: 'Mouth Openness → Volume',
  type: 'continuous',
  enabled: true,

  inputs: [{
    sourceFeatureId: 'mouth-aperture',
    sourceType: 'position',
    inputRange: { min: 0.05, max: 0.4 },  // Normalized mouth openness
    outputRange: { min: 0.1, max: 1.0 },  // Never fully silent
    curve: 'logarithmic',  // More control at lower volumes
    inverted: false,
    deadZone: 0.02,
  }],

  parameters: {
    targetParameter: 'volume',
    smoothing: 0.15,  // Quick response for dynamics
  },
};
```

**MovementEvents Used:**
- `ContinuousMovementEvent` from face landmark mouth aperture calculation

**MusicalEvents Produced:**
- `ControlChangeEvent` with `parameter: 'volume'`

**Why Accessible:**
- Works without any limb movement
- Logarithmic curve matches human perception of loudness
- Minimum output prevents unexpected silence
- Natural, intuitive mapping (open = louder)

---

## 8. Implementation Notes

### 8.1 Architectural Considerations

**Mapping Logic Outside React**

The mapping engine and nodes should be implemented as pure TypeScript classes, not React components:

```typescript
// ✓ CORRECT: Pure class, no React
class PitchMappingNode extends MappingNode {
  process(frame: ProcessedFrame): MusicalEvent[] { ... }
}

// ✗ WRONG: Don't couple mapping to React
function PitchMappingComponent() {
  const [pitch, setPitch] = useState(0);
  useEffect(() => { /* mapping logic */ }, []);
}
```

React components should only:
- Display mapping state (visualization)
- Handle user configuration input
- Connect to mapping engine via hooks/context

### 8.2 Data-Driven Configuration

All mapping configurations must be serializable as JSON:

```typescript
// Configuration can be saved/loaded
const presetJson = JSON.stringify(mappingPreset);
const loadedPreset = JSON.parse(presetJson) as MappingPreset;

// Engine can be configured from data
mappingEngine.configureFromPreset(loadedPreset);
```

This enables:
- Saving user presets to localStorage
- Sharing presets between users
- Cloud sync of configurations
- Import/export functionality

### 8.3 Future UI: Mapping Inspector

The architecture should support a future visual mapping editor:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Mapping Inspector                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input Sources                    Mapping Nodes                 │
│  ┌──────────────┐                ┌──────────────────────────┐  │
│  │ ○ Head Y     │───────────────▶│ Pitch                    │  │
│  │   [====●===] │                │ Range: C3-C5             │  │
│  │              │                │ Curve: Linear            │  │
│  └──────────────┘                └──────────────────────────┘  │
│  ┌──────────────┐                ┌──────────────────────────┐  │
│  │ ○ Mouth Open │───────────────▶│ Volume                   │  │
│  │   [=●======] │                │ Range: 10%-100%          │  │
│  │              │                │ Curve: Logarithmic       │  │
│  └──────────────┘                └──────────────────────────┘  │
│  ┌──────────────┐                ┌──────────────────────────┐  │
│  │ ● Blink      │───────────────▶│ Next Chord               │  │
│  │   [DETECTED] │                │ Mode: Oneshot            │  │
│  └──────────────┘                └──────────────────────────┘  │
│                                                                 │
│  [ + Add Node ]  [ Save Preset ]  [ Load Preset ]              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.4 Performance Considerations

- Mapping nodes should be lightweight (process < 1ms per frame)
- Use object pooling for frequent event objects
- Minimize allocations in hot paths
- Consider Web Workers for complex gesture pattern matching (future)

### 8.5 Testing Strategy

```typescript
// Unit test mapping nodes in isolation
describe('PitchMappingNode', () => {
  it('should map input position to pitch value', () => {
    const node = new PitchMappingNode(config);
    const frame = createMockFrame({ headY: 0.5 });
    const events = node.process(frame);
    expect(events[0].value).toBeCloseTo(0.5);
  });
});

// Integration test full pipeline
describe('MappingEngine', () => {
  it('should process frame and emit correct events', () => {
    const engine = new MappingEngine();
    engine.addNode(pitchNode);
    engine.addNode(triggerNode);
    const output = engine.process(mockFrame);
    expect(output.events).toHaveLength(2);
  });
});
```

---

## Appendix: Type Definitions Summary

```typescript
// Core MovementEvent types
type MovementEvent =
  | ContinuousMovementEvent
  | DiscreteGestureEvent
  | ZoneEvent
  | MotionQualityEvent
  | DwellEvent;

// Core MusicalEvent types
type MusicalEvent =
  | NoteEvent
  | ChordEvent
  | ControlChangeEvent
  | StructuralEvent
  | SafetyEvent;

// Mapping node types
type MappingNodeType =
  | 'continuous'
  | 'trigger'
  | 'zone'
  | 'gesture_pattern';

// Mapping modes
type MappingMode =
  | 'continuous_pitch'
  | 'chord_pad'
  | 'drone_fx'
  | 'percussion'
  | 'scale_steps'
  | 'expression_only'
  | 'face_only'
  | 'hybrid'
  | 'custom';
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-12-07 | System Design | Initial specification |

---

*This specification is a living document and will evolve as ADMI v3 development progresses.*
