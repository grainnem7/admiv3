ADMIv3 Claude Code Context

You are working on ADMIv3: an Accessible Digital Musical Instrument.
React 19 + TypeScript + Vite + Tone.js + MediaPipe.

## Architecture
src/core/ - MusicController.ts - top-level coordinator
src/mapping/ - MappingEngine.ts, MappingNode.ts, MusicEventEmitter.ts
src/mapping/nodes/ - ZoneMappingNode, PitchMappingNode, ChordMappingNode,
                     ThereminNode, TriggerMappingNode, FilterMappingNode,
                     VolumeMappingNode, HandExpressionNode, FaceExpressionNode
src/mapping/events/ - MovementEvents.ts, MusicalEvents.ts
src/effects/ - EffectChainManager.ts + presets/
src/calibration/ - CalibrationSession.ts, ProfileManager.ts
src/tracking/ - MediaPipe gesture/pose detection
src/midi/ - MIDIManager.ts, MIDIOutput.ts
src/hooks/ - useGestureSounds.ts, useZoneCollision.ts
src/ui/ - components/, screens/, design-system/, facilitator/
src/utils/ - constants.ts, math.ts, filters.ts, timing.ts

## Key Patterns
- State: Zustand stores (not Redux)
- Events: MusicEventEmitter typed event bus. All gesture-to-sound through here.
- Mapping nodes: each extends MappingNode base class
- Audio: all Tone.js through EffectChainManager. Never instantiate Tone in components.
- TypeScript strict mode, no any types
- npm run lint = tsc --noEmit. npm run test:run = vitest run.

## Research Context
Instrument for musicians with cerebral palsy, acquired brain injury, sensory impairments.
1. Tolerance over precision - wide movement range, never punish imprecision
2. Musical agency - every gesture intentional and expressive
3. Latency under 20ms gesture-to-sound
4. Every user-facing threshold must be calibratable
5. Visual feedback for all audio events (deaf/HoH users)

## Tests
Tests in src/__tests__/. Use Vitest with vi.mock for Tone.js and MediaPipe.

