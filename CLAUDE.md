ADMIv3 Claude Code Context

You are working on ADMIv3: an Accessible Digital Musical Instrument.
React 19 + TypeScript + Vite + Tone.js + MediaPipe.

The main instrument is now the **Board Sequencer**: coloured counters on a real board,
read by a camera (or a laptop board with no camera); each colour plays its own sound,
with loops, scenes and a live 7-minute performance. Ableton Live can be the sound
engine over MIDI. The original gesture instrument still exists ("Other ways to play").

## Where things are
- Board Sequencer: src/ui/screens/BoardSequencerScreen.tsx, src/ui/screens/boardSequencer/
  (setup/, play/), src/tracking/ (board and colour detection), src/songs/BoardSequencerEngine.ts,
  src/profiles/ (per-player profiles)
- Designs and plans: docs/superpowers/specs/ (what and why) and docs/superpowers/plans/
  (task by task). Read the relevant spec before changing a feature.
- Ableton: docs/ableton-integration-plan.md (the plan), docs/ableton-setup-guide.html, src/midi/
- Gesture instrument: src/core/MusicController.ts, src/mapping/ (MappingEngine, nodes),
  src/effects/, src/calibration/, src/hooks/

## Key Patterns
- State: Zustand stores (not Redux)
- Events: MusicEventEmitter typed event bus. All gesture-to-sound through here.
- Audio: all Tone.js through EffectChainManager. Never instantiate Tone in components.
- TypeScript strict mode, no any types
- npm run lint (tsc, app and e2e) · npm run test:run (Vitest) · npm run test:e2e (Playwright)
  · npm run build · npm run show (the user's own server on port 3001)

## Working rules
- Ask before committing. Never commit .claude/settings.local.json or public/rootCA.pem.
- Test servers: always set ADMI_DATA_DIR to a temporary folder. Never use port 3001 (the
  user's own running server). Never touch .admi-data.
- Subagents: Opus or Sonnet only, never Haiku.
- Test pictures (the repository is public): only people-free frames of the developer's own
  board, counters and hand may be committed, each checked by eye first. Frames from sessions
  with participants are never committed: they go in the git-ignored
  src/__tests__/fixtures/board-frames-local/, and only where consent/ethics approval covers it.
- Plain language in everything the user sees: they are a researcher and performer, not a
  programmer.

## Research Context
Instrument for musicians with cerebral palsy, acquired brain injury, sensory impairments.
The main player, Tim, has cerebral palsy and is left-handed.
1. Tolerance over precision - wide movement range, never punish imprecision
2. Musical agency - every gesture intentional and expressive
3. Latency under 20ms gesture-to-sound
4. Every user-facing threshold must be calibratable
5. Visual feedback for all audio events (deaf/HoH users)

## Tests
Tests in src/__tests__/ (Vitest, vi.mock for Tone.js and MediaPipe) and e2e/ (Playwright).
