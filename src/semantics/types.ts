/**
 * Movement Semantics Types
 *
 * Comprehensive type definitions for high-dimensional body tracking,
 * movement quality analysis, and expressive mapping inspired by:
 * - Laban Movement Analysis (Effort, Shape, Space)
 * - Dance theory and embodied interaction research
 * - Digital musical instrument design principles
 */

// ============================================
// Core Vector Types
// ============================================

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Vector3WithMagnitude extends Vector3 {
  magnitude: number;
}

// ============================================
// Kinematic Features (per joint)
// ============================================

/**
 * Complete kinematic state for a single tracked joint/landmark.
 * Includes derivatives up to jerk for capturing movement quality.
 */
export interface JointKinematics {
  /** Joint identifier (e.g., 'rightWrist', 'nose', 'leftEyeOuter') */
  jointId: string;

  /** Current position (normalized 0-1) */
  position: Vector3;

  /** First derivative: velocity (units/second) */
  velocity: Vector3WithMagnitude;

  /** Second derivative: acceleration (units/second²) */
  acceleration: Vector3WithMagnitude;

  /** Third derivative: jerk (units/second³) - captures abruptness */
  jerk: Vector3WithMagnitude;

  /** Trajectory curvature at current point */
  curvature: number;

  /** Trajectory torsion (3D twist of path) */
  torsion: number;

  /** Detection confidence (0-1) */
  confidence: number;

  /** Timestamp */
  timestamp: number;
}

/**
 * Ring buffer for storing joint position history
 */
export interface JointHistory {
  positions: Array<{ position: Vector3; timestamp: number }>;
  maxLength: number;
  currentIndex: number;
}

// ============================================
// Body Configuration Features
// ============================================

/**
 * Spatial relationships between body parts
 */
export interface BodyConfiguration {
  /** Distance between hands (0-1 normalized to arm span) */
  handSpread: number;

  /** Distance between elbows */
  elbowSpread: number;

  /** Shoulder width (current vs rest) */
  shoulderExpansion: number;

  /** Height of hands relative to shoulders */
  handElevation: { left: number; right: number };

  /** Forward/backward lean of torso (radians) */
  torsoLean: { pitch: number; roll: number; yaw: number };

  /** Symmetry score between left and right side (0=asymmetric, 1=symmetric) */
  bilateralSymmetry: number;

  /** Overall body expansion/contraction (0=contracted, 1=expanded) */
  expansionLevel: number;

  /** Body twist (rotation of shoulders relative to hips) */
  spinalTwist: number;

  /** Head orientation relative to torso */
  headOrientation: { pitch: number; roll: number; yaw: number };
}

/**
 * Posture archetype classifications
 */
export type PostureArchetype =
  | 'open'        // Arms spread, expansive
  | 'closed'      // Arms close, contracted
  | 'reaching'    // Extending outward
  | 'gathering'   // Pulling inward
  | 'ascending'   // Upward orientation
  | 'descending'  // Downward orientation
  | 'twisting'    // Rotational tension
  | 'tilting'     // Off-balance lean
  | 'grounded'    // Stable, centered
  | 'suspended'   // Light, floating
  | 'neutral';    // Relaxed default

// ============================================
// Facial Expression Features
// ============================================

/**
 * Extracted facial expression metrics
 */
export interface FacialExpression {
  /** Smile intensity (0-1) */
  smileIntensity: number;

  /** Smile curvature (asymmetry: -1 left, 0 centered, +1 right) */
  smileCurvature: number;

  /** Mouth openness (0-1) */
  mouthOpenness: number;

  /** Mouth width (0-1) */
  mouthWidth: number;

  /** Left eyebrow height (0-1) */
  leftBrowHeight: number;

  /** Right eyebrow height (0-1) */
  rightBrowHeight: number;

  /** Combined brow raise (0-1) */
  browRaise: number;

  /** Brow furrow/frown intensity (0-1) */
  browFurrow: number;

  /** Left eye openness (0-1) */
  leftEyeOpen: number;

  /** Right eye openness (0-1) */
  rightEyeOpen: number;

  /** Eye squint intensity (0-1) */
  eyeSquint: number;

  /** Nose wrinkle (0-1) */
  noseWrinkle: number;

  /** Cheek puff (0-1) */
  cheekPuff: number;

  /** Jaw clench (0-1) */
  jawClench: number;
}

// ============================================
// Eye Gaze Features
// ============================================

/**
 * Eye gaze tracking data
 */
export interface GazeData {
  /** Gaze direction vector (normalized) */
  direction: Vector3;

  /** Estimated gaze target in normalized space */
  target: Vector3;

  /** Which body part is gaze directed at (if any) */
  targetBodyPart: string | null;

  /** Is gaze fixated (stable) or saccading (moving) */
  isFixated: boolean;

  /** Fixation duration in ms (0 if not fixated) */
  fixationDuration: number;

  /** Pupil dilation (if available, normalized 0-1) */
  pupilDilation: number;

  /** Confidence of gaze estimation */
  confidence: number;
}

// ============================================
// Laban Movement Quality Features
// ============================================

/**
 * Laban Effort qualities - the "how" of movement
 * Each quality exists on a spectrum between two poles.
 */
export interface LabanEffort {
  /**
   * Weight: Light (0) ←→ Strong (1)
   * Derived from: acceleration magnitude, muscle tension indicators
   */
  weight: number;

  /**
   * Time: Sustained (0) ←→ Quick/Sudden (1)
   * Derived from: velocity changes, jerk magnitude
   */
  time: number;

  /**
   * Space: Indirect/Flexible (0) ←→ Direct (1)
   * Derived from: path curvature, trajectory predictability
   */
  space: number;

  /**
   * Flow: Bound/Controlled (0) ←→ Free (1)
   * Derived from: movement continuity, hesitation patterns
   */
  flow: number;
}

/**
 * Abstract movement qualities derived from kinematic analysis
 */
export interface MovementQualities {
  /** Laban effort qualities */
  effort: LabanEffort;

  /** Overall energy/intensity (0-1) */
  energy: number;

  /** Smoothness of movement (0=jerky, 1=smooth) */
  fluidity: number;

  /** Tension in movement (0=relaxed, 1=tense) */
  tension: number;

  /** Impulse/attack strength of movement onsets */
  impulse: number;

  /** Recovery/decay after movement peaks */
  recovery: number;

  /** Primary direction of movement */
  directionality: Vector3;

  /** Angular momentum around body center */
  angularMomentum: Vector3;

  /** Overall movement complexity (entropy measure) */
  complexity: number;

  /** Repetitiveness/rhythmicity (0=random, 1=periodic) */
  rhythmicity: number;
}

// ============================================
// Complete Semantic Frame
// ============================================

/**
 * Complete movement semantics frame - all extracted features for one moment
 */
export interface MovementSemanticsFrame {
  /** Frame timestamp */
  timestamp: number;

  /** Kinematics for all tracked joints */
  joints: Map<string, JointKinematics>;

  /** Body configuration features */
  bodyConfig: BodyConfiguration;

  /** Current posture archetype */
  postureArchetype: PostureArchetype;

  /** Facial expression metrics */
  face: FacialExpression;

  /** Eye gaze data */
  gaze: GazeData;

  /** Abstract movement qualities */
  qualities: MovementQualities;

  /** Which modalities contributed to this frame */
  activeModalities: {
    pose: boolean;
    leftHand: boolean;
    rightHand: boolean;
    face: boolean;
    color: boolean;
  };

  /** Overall frame confidence */
  confidence: number;
}

// ============================================
// Mapping DSL Types
// ============================================

/**
 * Mapping curve types for value transformation
 */
export type MappingCurveType =
  | 'linear'
  | 'exponential'
  | 'logarithmic'
  | 'sigmoid'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'step'
  | 'custom';

/**
 * Quantization settings for pitch/rhythm
 */
export interface QuantizationConfig {
  /** Scale to quantize to */
  scale: string;

  /** Root note (MIDI or note name) */
  root: string | number;

  /** Octave range */
  octaveRange: { min: number; max: number };

  /** Enable/disable quantization */
  enabled: boolean;
}

/**
 * Condition for conditional mappings
 */
export interface MappingCondition {
  /** Source path (e.g., 'bodyConfig.torsoLean.yaw') */
  source: string;

  /** Comparison operator */
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'in' | 'between';

  /** Threshold value(s) */
  value: number | number[] | string;

  /** Duration condition must be true (ms) */
  durationMs?: number;

  /** Logical combination with other conditions */
  combineWith?: 'and' | 'or';
}

/**
 * A single continuous mapping definition
 */
export interface ContinuousMappingDef {
  type: 'continuous';

  /** Unique mapping ID */
  id: string;

  /** Human-readable name */
  name: string;

  /** Source path in MovementSemanticsFrame (e.g., 'joints.rightWrist.position.y') */
  source: string;

  /** Target parameter path (e.g., 'melody.pitch') */
  target: string;

  /** Input value range */
  inputRange: { min: number; max: number };

  /** Output value range */
  outputRange: { min: number; max: number };

  /** Mapping curve */
  curve: MappingCurveType;

  /** Custom curve function (for 'custom' curve type) */
  customCurve?: (x: number) => number;

  /** Invert the mapping */
  inverted: boolean;

  /** Smoothing factor (0-1, 0=no smoothing) */
  smoothing: number;

  /** Dead zone around center (0-1) */
  deadZone: number;

  /** Quantization settings (for pitch mappings) */
  quantization?: QuantizationConfig;

  /** Conditions that must be true for mapping to be active */
  conditions?: MappingCondition[];

  /** Priority when multiple mappings target same parameter */
  priority: number;

  /** Is this mapping currently enabled */
  enabled: boolean;
}

/**
 * Many-to-one mapping (multiple sources combine to one target)
 */
export interface ManyToOneMappingDef {
  type: 'manyToOne';

  id: string;
  name: string;

  /** Multiple source paths */
  sources: Array<{
    path: string;
    weight: number;
    curve: MappingCurveType;
    inputRange: { min: number; max: number };
  }>;

  /** Combination mode */
  combineMode: 'add' | 'multiply' | 'average' | 'max' | 'min' | 'custom';

  /** Custom combination function */
  customCombine?: (values: number[]) => number;

  target: string;
  outputRange: { min: number; max: number };
  conditions?: MappingCondition[];
  priority: number;
  enabled: boolean;
}

/**
 * One-to-many mapping (one source controls multiple targets)
 */
export interface OneToManyMappingDef {
  type: 'oneToMany';

  id: string;
  name: string;

  source: string;
  inputRange: { min: number; max: number };

  /** Multiple targets with individual settings */
  targets: Array<{
    path: string;
    outputRange: { min: number; max: number };
    curve: MappingCurveType;
    offset: number;
    scale: number;
  }>;

  conditions?: MappingCondition[];
  priority: number;
  enabled: boolean;
}

/**
 * State machine state definition
 */
export interface StateMachineState {
  id: string;
  name: string;

  /** Actions to execute when entering this state */
  onEnter?: Array<{
    target: string;
    value: number | string;
  }>;

  /** Actions to execute when exiting this state */
  onExit?: Array<{
    target: string;
    value: number | string;
  }>;

  /** Mappings active only in this state */
  activeMappings?: string[];

  /** Transitions to other states */
  transitions: Array<{
    toState: string;
    conditions: MappingCondition[];
  }>;
}

/**
 * State machine for mode/gesture-based control
 */
export interface StateMachineDef {
  type: 'stateMachine';

  id: string;
  name: string;

  /** Initial state ID */
  initialState: string;

  /** All states */
  states: StateMachineState[];

  /** Global conditions that override state transitions */
  globalConditions?: Array<{
    conditions: MappingCondition[];
    action: 'reset' | 'pause' | 'resume' | { gotoState: string };
  }>;
}

/**
 * Gaze routing configuration
 */
export interface GazeRoutingDef {
  type: 'gazeRouting';

  id: string;
  name: string;

  /** Map of gaze targets to active controller assignments */
  routes: Array<{
    /** Body part that gaze must target */
    gazeTarget: string;

    /** Controller to activate when looking at this target */
    activateController: string;

    /** Minimum fixation time to activate (ms) */
    minFixationMs: number;

    /** Mappings to enable when this route is active */
    enableMappings: string[];

    /** Mappings to disable when this route is active */
    disableMappings: string[];
  }>;

  /** Default controller when not looking at any target */
  defaultController: string;

  enabled: boolean;
}

/**
 * Environmental musical field definition
 */
export interface MusicalFieldDef {
  type: 'musicalField';

  id: string;
  name: string;

  /** Field geometry */
  geometry:
    | { type: 'sphere'; center: Vector3; radius: number }
    | { type: 'box'; min: Vector3; max: Vector3 }
    | { type: 'cylinder'; center: Vector3; radius: number; height: number }
    | { type: 'plane'; point: Vector3; normal: Vector3 };

  /** Which joint triggers this field */
  triggerJoint: string;

  /** Musical parameters influenced by position within field */
  parameters: Array<{
    target: string;
    influence: 'distance' | 'angle' | 'height' | 'radial';
    range: { min: number; max: number };
    curve: MappingCurveType;
  }>;

  /** Blend mode when overlapping with other fields */
  blendMode: 'override' | 'add' | 'multiply' | 'average';

  /** Priority for overlap resolution */
  priority: number;

  enabled: boolean;
}

/**
 * Union type of all mapping definitions
 */
export type MappingDef =
  | ContinuousMappingDef
  | ManyToOneMappingDef
  | OneToManyMappingDef
  | StateMachineDef
  | GazeRoutingDef
  | MusicalFieldDef;

// ============================================
// Mapping Preset Configuration
// ============================================

/**
 * Complete mapping preset containing all mappings and state machines
 */
export interface MappingPreset {
  id: string;
  name: string;
  description: string;
  author?: string;
  version: string;

  /** All mapping definitions */
  mappings: MappingDef[];

  /** Initial state for any state machines */
  initialStates?: Record<string, string>;

  /** Default values for targets */
  defaults?: Record<string, number | string>;

  /** Musical configuration */
  musicalConfig: {
    /** Default scale */
    scale: string;
    /** Default root */
    root: string;
    /** Tempo (BPM) */
    tempo: number;
    /** Key signature */
    key: string;
    /** Mode (major, minor, etc.) */
    mode: string;
  };

  /** Tags for categorization */
  tags: string[];

  /** Whether this is a system preset (read-only) */
  isSystem: boolean;
}

// ============================================
// DSL Text Format Types
// ============================================

/**
 * Parsed DSL statement
 */
export interface DSLStatement {
  type: 'assignment' | 'conditional' | 'stateChange' | 'when' | 'if';

  /** Line number in source */
  line: number;

  /** Raw source text */
  source: string;

  /** Parsed content (varies by type) */
  content: unknown;
}

/**
 * DSL parsing result
 */
export interface DSLParseResult {
  success: boolean;
  mappings: MappingDef[];
  errors: Array<{
    line: number;
    message: string;
    source: string;
  }>;
  warnings: Array<{
    line: number;
    message: string;
  }>;
}
