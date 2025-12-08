# ADMIv3 Upgrade Plan - Multi-Modal Accessibility Instrument

## Overview

This plan outlines the migration from single-modality pose tracking to a full multi-modal system with pose, hands, and face tracking, user-defined input profiles, and enhanced mapping architecture.

---

## Phase 1: Core Types & Unified Tracking Frame

### 1.1 Extend `src/state/types.ts`

**Add new interfaces:**

```typescript
// Hand landmarks (21 per hand)
interface HandLandmarks {
  landmarks: NormalizedLandmark[];
  handedness: 'Left' | 'Right';
  confidence: number;
}

// Face landmarks (478 from MediaPipe)
interface FaceLandmarks {
  landmarks: NormalizedLandmark[];
  blendshapes?: FaceBlendshape[]; // For expression detection
}

// Unified tracking frame - THE core interface
interface TrackingFrame {
  pose: PoseLandmarks | null;
  leftHand: HandLandmarks | null;
  rightHand: HandLandmarks | null;
  face: FaceLandmarks | null;
  timestamp: number;
}

// Input profile (replaces AccessibilityMode)
interface InputProfile {
  id: string;
  name: string;
  description?: string;

  // Which modalities are active
  activeModalities: {
    pose: boolean;
    leftHand: boolean;
    rightHand: boolean;
    face: boolean;
  };

  // Which specific features to track (by landmark index)
  trackedFeatures: TrackedFeature[];

  // Movement processing settings
  movementSettings: {
    smoothingLevel: 'light' | 'medium' | 'heavy';
    velocityThreshold: number;
    stabilityFrames: number;
    dwellEnabled: boolean;
    dwellTimeMs: number;
  };

  // Preset flag (non-editable if true... actually still editable)
  isPreset: boolean;
}

interface TrackedFeature {
  id: string;
  name: string;
  modality: 'pose' | 'leftHand' | 'rightHand' | 'face';
  landmarkIndex: number;
  role: 'continuous' | 'trigger' | 'ignored';
  axis?: 'x' | 'y' | 'z' | 'distance' | 'angle';
}

// Gesture types for discrete detection
interface GestureDefinition {
  id: string;
  name: string;
  type: 'pinch' | 'blink' | 'browRaise' | 'mouthOpen' | 'thumbToFinger' | 'custom';
  threshold: number;
  cooldownMs: number;
}
```

### 1.2 Create `src/tracking/HandDetector.ts` (NEW FILE)

MediaPipe HandLandmarker wrapper following PoseDetector pattern.

### 1.3 Create `src/tracking/FaceDetector.ts` (NEW FILE)

MediaPipe FaceLandmarker wrapper with blendshape support.

### 1.4 Create `src/tracking/TrackingManager.ts` (NEW FILE)

Orchestrates all detectors, produces unified TrackingFrame.

```typescript
class TrackingManager {
  private poseDetector: PoseDetector;
  private handDetector: HandDetector;
  private faceDetector: FaceDetector;

  // Produces unified TrackingFrame on each video frame
  async detectAll(video: HTMLVideoElement): Promise<TrackingFrame>;

  // Enable/disable modalities based on input profile
  setActiveModalities(modalities: InputProfile['activeModalities']): void;
}
```

### 1.5 Update `src/utils/constants.ts`

Add landmark indices for hands and face:

```typescript
export const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

export const FACE_LANDMARKS = {
  // Key landmarks for expression detection
  LEFT_EYE_UPPER: 159, LEFT_EYE_LOWER: 145,
  RIGHT_EYE_UPPER: 386, RIGHT_EYE_LOWER: 374,
  LEFT_EYEBROW_INNER: 107, LEFT_EYEBROW_OUTER: 70,
  RIGHT_EYEBROW_INNER: 336, RIGHT_EYEBROW_OUTER: 300,
  UPPER_LIP: 13, LOWER_LIP: 14,
  NOSE_TIP: 1,
  // ... more as needed
};
```

---

## Phase 2: Input Profile System (Non-Prescriptive)

### 2.1 Create `src/profiles/InputProfileManager.ts` (NEW FILE)

```typescript
class InputProfileManager {
  // CRUD for input profiles
  createProfile(profile: InputProfile): void;
  loadProfile(id: string): InputProfile | null;
  saveProfile(profile: InputProfile): void;
  deleteProfile(id: string): void;
  listProfiles(): InputProfile[];

  // Preset profiles (editable copies)
  getPresets(): InputProfile[];
  clonePreset(presetId: string, newName: string): InputProfile;
}
```

### 2.2 Create `src/profiles/presets.ts` (NEW FILE)

Default profiles that users can clone and modify:

```typescript
export const DEFAULT_PRESETS: InputProfile[] = [
  {
    id: 'preset-full-body',
    name: 'Full Body',
    description: 'Uses pose tracking with both hands',
    activeModalities: { pose: true, leftHand: true, rightHand: true, face: false },
    trackedFeatures: [
      { id: 'rw', name: 'Right Wrist', modality: 'pose', landmarkIndex: 16, role: 'continuous', axis: 'y' },
      { id: 'lw', name: 'Left Wrist', modality: 'pose', landmarkIndex: 15, role: 'continuous', axis: 'y' },
    ],
    movementSettings: { smoothingLevel: 'medium', velocityThreshold: 0.01, stabilityFrames: 3, dwellEnabled: false, dwellTimeMs: 500 },
    isPreset: true,
  },
  {
    id: 'preset-hands-only',
    name: 'Hands Only',
    description: 'Detailed hand and finger tracking',
    activeModalities: { pose: false, leftHand: true, rightHand: true, face: false },
    trackedFeatures: [
      { id: 'rh-index', name: 'Right Index', modality: 'rightHand', landmarkIndex: 8, role: 'continuous', axis: 'y' },
      { id: 'rh-pinch', name: 'Right Pinch', modality: 'rightHand', landmarkIndex: -1, role: 'trigger' }, // Special gesture
    ],
    movementSettings: { smoothingLevel: 'light', velocityThreshold: 0.005, stabilityFrames: 2, dwellEnabled: false, dwellTimeMs: 500 },
    isPreset: true,
  },
  {
    id: 'preset-face-control',
    name: 'Face Control',
    description: 'Uses facial expressions and head movement',
    activeModalities: { pose: false, leftHand: false, rightHand: false, face: true },
    trackedFeatures: [
      { id: 'head-y', name: 'Head Tilt', modality: 'face', landmarkIndex: 1, role: 'continuous', axis: 'y' },
      { id: 'blink', name: 'Blink', modality: 'face', landmarkIndex: -1, role: 'trigger' },
      { id: 'brow', name: 'Eyebrow Raise', modality: 'face', landmarkIndex: -1, role: 'trigger' },
    ],
    movementSettings: { smoothingLevel: 'heavy', velocityThreshold: 0.002, stabilityFrames: 5, dwellEnabled: true, dwellTimeMs: 300 },
    isPreset: true,
  },
  {
    id: 'preset-dwell',
    name: 'Dwell Control',
    description: 'Activate sounds by holding position',
    activeModalities: { pose: true, leftHand: false, rightHand: false, face: false },
    trackedFeatures: [
      { id: 'head', name: 'Head Position', modality: 'pose', landmarkIndex: 0, role: 'continuous', axis: 'y' },
    ],
    movementSettings: { smoothingLevel: 'heavy', velocityThreshold: 0.001, stabilityFrames: 10, dwellEnabled: true, dwellTimeMs: 800 },
    isPreset: true,
  },
];
```

### 2.3 Update `src/state/store.ts`

Add input profile state and actions:

```typescript
// New state fields
activeInputProfile: InputProfile | null;
availableInputProfiles: InputProfile[];

// New actions
setActiveInputProfile: (profile: InputProfile) => void;
saveInputProfile: (profile: InputProfile) => void;
deleteInputProfile: (id: string) => void;
```

### 2.4 Remove/Deprecate AccessibilityMode

The `AccessibilityMode` enum is replaced by `InputProfile`. We keep backward compatibility by mapping old profiles.

---

## Phase 3: Movement Layer Upgrade

### 3.1 Create `src/movement/FeatureExtractor.ts` (NEW FILE)

Extracts movement data from any tracked feature:

```typescript
class FeatureExtractor {
  // Extract position/velocity for a specific feature from TrackingFrame
  extract(frame: TrackingFrame, feature: TrackedFeature): FeatureValue | null;
}

interface FeatureValue {
  featureId: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number; magnitude: number };
  isActive: boolean;
  confidence: number;
}
```

### 3.2 Create `src/movement/GestureDetector.ts` (NEW FILE)

Detects discrete gestures from TrackingFrame:

```typescript
class GestureDetector {
  // Register gesture definitions
  registerGesture(gesture: GestureDefinition): void;

  // Detect all registered gestures from frame
  detect(frame: TrackingFrame): DetectedGesture[];

  // Built-in gesture detectors
  detectPinch(hand: HandLandmarks): boolean;
  detectBlink(face: FaceLandmarks): boolean;
  detectBrowRaise(face: FaceLandmarks): boolean;
  detectMouthOpen(face: FaceLandmarks): number; // 0-1 openness
}

interface DetectedGesture {
  gestureId: string;
  type: GestureDefinition['type'];
  value: number; // 0-1 for continuous, 1 for triggered
  timestamp: number;
}
```

### 3.3 Create `src/movement/MultiModalProcessor.ts` (NEW FILE)

Orchestrates movement processing for all active features:

```typescript
class MultiModalProcessor {
  private smoother: SignalSmoother;
  private featureExtractor: FeatureExtractor;
  private gestureDetector: GestureDetector;
  private dwellDetector: DwellDetector;

  // Process a TrackingFrame according to InputProfile
  process(frame: TrackingFrame, profile: InputProfile): ProcessedFrame;
}

interface ProcessedFrame {
  features: Map<string, FeatureValue>;
  gestures: DetectedGesture[];
  dwellState?: DwellState;
  timestamp: number;
}
```

### 3.4 Update `src/movement/SignalSmoother.ts`

Extend to handle hand and face landmarks (already designed for this - just needs more landmark indices).

---

## Phase 4: Mapping Layer Upgrade (MusiKraken-inspired)

### 4.1 Create `src/mapping/MappingNode.ts` (NEW FILE)

Base class for all mapping nodes:

```typescript
abstract class MappingNode {
  id: string;
  name: string;
  enabled: boolean;

  // Input connections
  inputs: Map<string, MappingInput>;

  // Output value
  abstract process(frame: ProcessedFrame): MappingOutput;
}

interface MappingInput {
  sourceFeatureId: string;
  sourceAxis: 'x' | 'y' | 'z' | 'magnitude' | 'gesture';
  range: { min: number; max: number };
  curve: 'linear' | 'exponential' | 'logarithmic';
  inverted: boolean;
}

interface MappingOutput {
  nodeId: string;
  value: number; // Normalized 0-1
  timestamp: number;
}
```

### 4.2 Create specific mapping nodes in `src/mapping/nodes/`:

```
src/mapping/nodes/
├── PitchMappingNode.ts      - Maps input to MIDI pitch
├── VolumeMappingNode.ts     - Maps input to amplitude
├── FilterMappingNode.ts     - Maps input to filter cutoff
├── TriggerMappingNode.ts    - Maps gesture to note trigger
├── ChordMappingNode.ts      - Maps position to chord selection
├── ModulationMappingNode.ts - Maps input to LFO/mod parameters
└── index.ts
```

### 4.3 Create `src/mapping/MappingEngine.ts` (NEW FILE)

Orchestrates all mapping nodes:

```typescript
class MappingEngine {
  private nodes: Map<string, MappingNode>;

  addNode(node: MappingNode): void;
  removeNode(nodeId: string): void;

  // Process frame through all nodes
  process(frame: ProcessedFrame): MappingResult;

  // Get current state for visualization
  getState(): MappingState;
}

interface MappingResult {
  pitch?: number;
  volume?: number;
  filterCutoff?: number;
  triggers: string[];
  chord?: number[];
  modulation?: Map<string, number>;
}
```

### 4.4 Update `src/mapping/ContinuousMapper.ts`

Refactor to extend MappingNode, keep backward compatibility.

---

## Phase 5: Sound Layer Upgrade

### 5.1 Create `src/sound/VoiceManager.ts` (NEW FILE)

Manages polyphonic voices:

```typescript
class VoiceManager {
  private voices: Map<string, Voice>;
  private maxVoices: number = 8;

  // Allocate a new voice
  noteOn(frequency: number, velocity: number): string;
  noteOff(voiceId: string): void;

  // Chord support
  chordOn(frequencies: number[], velocity: number): string[];
  chordOff(voiceIds: string[]): void;

  // Modulation
  setParameter(voiceId: string, param: string, value: number): void;
  setGlobalParameter(param: string, value: number): void;
}
```

### 5.2 Create `src/sound/Voice.ts` (NEW FILE)

Single synthesizer voice:

```typescript
class Voice {
  private oscillator: OscillatorNode;
  private gainNode: GainNode;
  private filterNode: BiquadFilterNode;

  // ADSR envelope
  private attackTime: number;
  private decayTime: number;
  private sustainLevel: number;
  private releaseTime: number;

  noteOn(frequency: number, velocity: number): void;
  noteOff(): void;
  setParameter(param: string, value: number): void;
}
```

### 5.3 Update `src/sound/AudioEngine.ts`

Integrate VoiceManager, add modulation inputs.

---

## Phase 6: UI Upgrades

### 6.1 Create `src/ui/components/InputProfileEditor.tsx` (NEW FILE)

Full editor for creating/modifying input profiles:
- Toggle modalities
- Add/remove tracked features
- Configure movement settings
- Test features in real-time

### 6.2 Create `src/ui/components/MappingInspector.tsx` (NEW FILE)

Shows current mapping state:
- Which features are mapped
- Current control values
- Visual feedback of what's being affected

### 6.3 Create `src/ui/components/TrackingOverlay.tsx` (NEW FILE)

Enhanced overlay showing all modalities:
- Pose skeleton
- Hand landmarks with finger connections
- Face mesh (simplified)
- Active feature highlights

### 6.4 Update `src/ui/screens/CalibrationScreen.tsx`

Enhanced calibration flow:
- Select input profile or create new
- Configure active regions
- Set thresholds and dwell times
- Visual feedback during calibration

### 6.5 Update `src/ui/screens/PerformanceScreen.tsx`

- Integrate TrackingOverlay
- Show MappingInspector
- Profile switcher
- Enhanced visual feedback

### 6.6 Update `src/ui/facilitator/DebugPanel.tsx`

- Show all modality data
- Activated zones visualization
- Mapping state display
- Gesture detection feedback

---

## Implementation Order

### Iteration 1: Core Types & Tracking
1. Extend `src/state/types.ts` with new interfaces
2. Update `src/utils/constants.ts` with hand/face landmarks
3. Create `src/tracking/HandDetector.ts`
4. Create `src/tracking/FaceDetector.ts`
5. Create `src/tracking/TrackingManager.ts`
6. Update `src/tracking/index.ts`

### Iteration 2: Input Profiles
1. Create `src/profiles/InputProfileManager.ts`
2. Create `src/profiles/presets.ts`
3. Update `src/state/store.ts` with profile state
4. Create `src/profiles/index.ts`

### Iteration 3: Movement Layer
1. Create `src/movement/FeatureExtractor.ts`
2. Create `src/movement/GestureDetector.ts`
3. Create `src/movement/MultiModalProcessor.ts`
4. Update `src/movement/index.ts`

### Iteration 4: Mapping Layer
1. Create `src/mapping/MappingNode.ts`
2. Create mapping nodes in `src/mapping/nodes/`
3. Create `src/mapping/MappingEngine.ts`
4. Update `src/mapping/index.ts`

### Iteration 5: Sound Layer
1. Create `src/sound/Voice.ts`
2. Create `src/sound/VoiceManager.ts`
3. Update `src/sound/AudioEngine.ts`

### Iteration 6: UI Integration
1. Create `src/ui/components/TrackingOverlay.tsx`
2. Create `src/ui/components/InputProfileEditor.tsx`
3. Create `src/ui/components/MappingInspector.tsx`
4. Update `src/ui/components/WebcamView.tsx`
5. Update `src/ui/screens/PerformanceScreen.tsx`
6. Update `src/ui/screens/CalibrationScreen.tsx`
7. Update `src/ui/facilitator/DebugPanel.tsx`

---

## Files Summary

### New Files (18)
- `src/tracking/HandDetector.ts`
- `src/tracking/FaceDetector.ts`
- `src/tracking/TrackingManager.ts`
- `src/profiles/InputProfileManager.ts`
- `src/profiles/presets.ts`
- `src/profiles/index.ts`
- `src/movement/FeatureExtractor.ts`
- `src/movement/GestureDetector.ts`
- `src/movement/MultiModalProcessor.ts`
- `src/mapping/MappingNode.ts`
- `src/mapping/MappingEngine.ts`
- `src/mapping/nodes/PitchMappingNode.ts`
- `src/mapping/nodes/VolumeMappingNode.ts`
- `src/mapping/nodes/TriggerMappingNode.ts`
- `src/mapping/nodes/index.ts`
- `src/sound/Voice.ts`
- `src/sound/VoiceManager.ts`
- `src/ui/components/TrackingOverlay.tsx`
- `src/ui/components/InputProfileEditor.tsx`
- `src/ui/components/MappingInspector.tsx`

### Modified Files (12)
- `src/state/types.ts` - Add new interfaces
- `src/state/store.ts` - Add profile state
- `src/utils/constants.ts` - Add hand/face landmarks
- `src/tracking/index.ts` - Export new modules
- `src/movement/index.ts` - Export new modules
- `src/mapping/index.ts` - Export new modules
- `src/mapping/ContinuousMapper.ts` - Refactor to MappingNode
- `src/sound/AudioEngine.ts` - Integrate VoiceManager
- `src/ui/components/WebcamView.tsx` - Use TrackingManager
- `src/ui/screens/PerformanceScreen.tsx` - Integrate new components
- `src/ui/screens/CalibrationScreen.tsx` - Enhanced flow
- `src/ui/facilitator/DebugPanel.tsx` - Enhanced visualization

---

## Backward Compatibility

- Existing UserProfile still works (contains old movementRange, gestures)
- AccessibilityMode maps to default InputProfiles
- Existing sound presets preserved
- LocalStorage migration for profiles

---

## Testing Strategy

1. Unit tests for new detectors (mock MediaPipe)
2. Integration tests for TrackingManager
3. Component tests for UI
4. End-to-end tests for full pipeline
5. Accessibility testing with screen readers
