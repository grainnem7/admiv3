# ADMI Technical Reference — Supervisor Meeting Prep

Quick-reference doc covering three subsystems supervisors are most likely to ask about: **colour tracking**, **the sound engine**, and **chord analysis / play-along**. Use the tables to navigate; each section ends with likely questions and short answers.

---

## 0. The Stack — Libraries & Frameworks

### Runtime dependencies (from `package.json`)

| Library | Version | Role in ADMI | Why this one |
|---|---|---|---|
| **`@mediapipe/tasks-vision`** | ^0.10.22 | Pose, hand, and face landmark detection from webcam. Provides `PoseLandmarker`, `HandLandmarker`, `FaceLandmarker` | Google's successor to `@mediapipe/pose`. Runs as a WASM module in the browser with optional GPU delegate. Accurate, low-latency, no server round-trip, cross-platform |
| **`tone`** (Tone.js) | ^15.1.22 | All audio synthesis, effects, and scheduling | High-level wrapper over Web Audio API. Gives me `PolySynth`, `MonoSynth`, `FMSynth`, `AMSynth`, `Reverb`, `FeedbackDelay`, `Chorus`, `Vibrato`, `Filter`, `Transport`, and musical time notation (`'8n.'` = dotted eighth). Writing this from scratch would be months of DSP work irrelevant to the research question |
| **`react`** | ^19.2.1 | UI framework (component tree, hooks, state effects) | Ecosystem familiarity; hooks model fits the per-frame tracking loop (`useEffect` + `requestAnimationFrame`). React 19 for the stable concurrent features |
| **`react-dom`** | ^19.2.1 | DOM renderer for React | — |
| **`zustand`** | ^5.0.9 | Global state management (music settings, mapping config, calibration, UI mode) | Lighter than Redux, no boilerplate, selective subscription prevents re-renders when only audio params change. Non-React code (e.g. `SoundEngine`) can read the store directly |

### Build & dev tooling

| Tool | Version | Role |
|---|---|---|
| **Vite** | ^5.4.0 | Dev server (sub-100 ms HMR), production bundler. Chosen over CRA/Webpack for speed |
| **TypeScript** | ^5.5.0 | Strict-mode type checking. `npm run lint` = `tsc --noEmit` (no `any` types permitted per `CLAUDE.md`) |
| **Vitest** | ^2.1.9 | Test runner. Mocks Tone.js and MediaPipe via `vi.mock` for deterministic audio/tracking tests |
| **@vitest/coverage-v8** | ^2.1.9 | Code coverage via V8's built-in profiler |
| **jsdom** | ^25.0.1 | Browser DOM simulation for Vitest |
| **@vitejs/plugin-react** | ^4.3.0 | React Fast Refresh in Vite |

### Browser Web APIs (no npm package)

| API | Used for |
|---|---|
| **Web Audio API** | Under Tone.js; also directly in `SongPresetEngine` for `AudioBufferSourceNode`, `GainNode`, `BiquadFilterNode` (rawer control for song stem playback) |
| **Canvas 2D (`<canvas>`, `getImageData`)** | Colour tracking pixel-by-pixel HSV analysis |
| **`getUserMedia` / MediaStream** | Webcam capture |
| **`requestAnimationFrame`** | Colour tracking loop, mapping engine tick |
| **Web MIDI API** | External MIDI output to DAW/hardware synths (via `MIDIManager`) |
| **Device Motion** | Optional phone-in-hand input (`DeviceMotionTracker`) |

### External Python-side tooling (not shipped in the browser)

| Tool | Role |
|---|---|
| **librosa** | Offline audio analysis — beat/downbeat detection for song `analysis.json` files |
| **ChordMini** (or equivalent CNN) | Offline chord recognition — labels like `F#m7`, `C#7` with timestamps, consumed by `analysisLoader.ts` |

The Python pipeline is a **one-time offline step per song**. The browser only loads the generated `analysis.json` — no ML inference on the audio happens at runtime.

### What's *not* here (by deliberate choice)

- **No Redux / MobX / Recoil** — Zustand covers the complexity
- **No classifier frameworks (TensorFlow.js / ONNX Runtime)** — earlier ADMI versions used TF.js for gesture classification; v3 moved to rule-based feature extraction (`MovementSemanticsExtractor`, `HandFeatureExtractor`) because deterministic rules are easier to debug, calibrate per-user, and reason about musically
- **No server** — everything runs client-side in the browser; no install, no account, no latency from round-trips
- **No OpenCV.js** for colour tracking — the centroid-of-matching-pixels algorithm is simple enough that pulling in OpenCV (~8 MB) wasn't justified

---

## 1. Colour Tracking

### Where it lives
`src/tracking/ColorTracker.ts` — a single class, no external dependencies beyond the browser's `<canvas>` API. Singleton accessible via `getColorTracker()`.

### Libraries used
- **Pure vanilla JavaScript** — no npm dependencies for colour tracking itself
- **Browser APIs:** `HTMLCanvasElement`, `CanvasRenderingContext2D` (`getImageData`), `HTMLVideoElement`, `requestAnimationFrame`
- Runs alongside MediaPipe (`@mediapipe/tasks-vision`) trackers in the same `TrackingManager`, but is independent — doesn't use any ML model

### What it does (one paragraph)
Colour tracking is the **alternative input modality** to MediaPipe pose tracking. A musician holds a brightly coloured object (or wears one), clicks on it in the video feed to "calibrate", and then the centroid of that colour's largest blob is streamed as a normalised `(x, y)` position. This is critical for users whose skeletal pose is unreliable (low light, occlusion, atypical body configurations, wheelchairs masking joints).

### Pipeline — how one frame becomes a position

| Step | What happens | Why |
|---|---|---|
| 1. **Downscale** | Copy video frame to an offscreen `<canvas>` at ¼ resolution (default `downscaleFactor: 4`) | Processing 160×120 instead of 640×480 is ~16× faster |
| 2. **Frame skip** | Only process every 2nd frame | Keeps CPU budget free for MediaPipe + Tone.js |
| 3. **Per-pixel HSV** | For each pixel convert RGB → HSV | Hue is lighting-invariant; RGB isn't |
| 4. **Match test** | Reject pixels whose saturation/value/hue fall outside the calibrated tolerance | Filters background noise |
| 5. **Centroid** | Average the `(x,y)` of all matching pixels → blob centre | Cheap, smooth, no need for connected-component labelling |
| 6. **Smooth** | Exponential moving average with α = 0.3 | Stops position from jittering between adjacent pixels |
| 7. **Emit** | Call all subscribed callbacks with `{blobs, primaryBlob, isTracking}` | Downstream consumers are mapping nodes / voices |

### Click-to-calibrate

When the user clicks on a pixel in the video, `calibrateFromPixel()`:

1. Samples an 11×11 pixel patch around the click (for averaging)
2. Converts the average RGB → HSV → stores the target hue
3. **Dynamically tightens tolerances** based on the hue:
   - If hue is in the **orange/red band (0–40° or 340–360°)** — where skin tones live — it uses a tighter hue tolerance (9° vs 16°) and a much higher saturation floor (62%+)
   - Other hues get a relaxed tolerance

This is why red/orange objects actually work in practice. Without this, vivid red tracking would constantly false-positive on hands, lips, and warm-toned walls.

### Key parameters (what you might be asked to justify)

| Parameter | Default | Reason |
|---|---|---|
| `downscaleFactor` | 4 | Balance of accuracy vs CPU |
| `frameSkip` | 2 | ~30Hz position updates, adequate for musical gestures |
| `smoothing` | 0.3 | Prev weight; feels responsive without jitter |
| `minArea` | 0.002 (0.2% of frame) | Rejects small stray blobs |
| `hueTolerance` | 9–16 (dynamic) | Narrow for skin-adjacent colours, wider otherwise |

### Potential questions & answers

**Q: Why HSV instead of RGB?**
Hue is lighting-invariant. A red ball in sunshine and shade has different RGB values but similar hue. Saturation/value filter out washed-out or dark pixels — the rest is just hue-distance.

**Q: Why not use a proper blob detector (OpenCV, connected components)?**
Overkill for a musical instrument. A simple centroid of all matching pixels is O(W×H) with zero allocations. Connected-component analysis would add latency and complexity for a marginal accuracy gain. If two blobs share a hue, we treat them as one — an acceptable trade in practice.

**Q: What happens when the object leaves the frame?**
The smoother decays the reported area by α=0.9 per frame. Once area drops below 0.0001, the blob is marked `found: false` and position defaults to (0.5, 0.5). The reason for decay rather than instant "gone" is to tolerate a single missed frame without silencing the instrument.

**Q: How does colour tracking interact with the rest of the system?**
It emits the same normalised `{x, y, area}` shape that MediaPipe hands/pose emit. Mapping nodes don't care which source they came from — both flow through the same `MusicEventEmitter` event bus.

**Q: Why no pre-defined colours?**
Early versions had red/blue/yellow/green defaults. They false-positived constantly on skin, hair, and clothing. Click-to-calibrate forces the hue/saturation floor to match the actual object under actual lighting — the only way to stay accurate across venues. See the comment `// No default colors — user must click-to-calibrate from the video feed.`

---

## 2. Sound Engine

### Where it lives
`src/sound/SoundEngine.ts` — wraps Tone.js. Singleton via `getSoundEngine()`. Never instantiated directly in components (per `CLAUDE.md` convention).

### Libraries used
- **Tone.js** (`tone` v15.1.22) — the entire synthesis + effects + scheduling layer
- **Web Audio API** — underneath Tone.js (Tone.js is a high-level wrapper; it compiles down to `AudioContext` + `AudioNode` graphs)

### Specific Tone.js classes used in `SoundEngine.ts`

| Tone.js class | Where in ADMI | Purpose |
|---|---|---|
| `Tone.PolySynth` (wrapping `Tone.Synth`) | melody, bass, chord voices | Polyphonic (multi-note) basic synth; max 16 voices each |
| `Tone.PolySynth` (wrapping `Tone.FMSynth`) | `accompPadSynth`, `accompMelodySynth` | FM (frequency-modulation) synthesis for warmer, more complex timbres |
| `Tone.PolySynth` (wrapping `Tone.AMSynth`) | `accompBassSynth` | AM (amplitude-modulation) synthesis — organ-like bass |
| `Tone.MonoSynth` | theremin left/right | Monophonic synth with built-in filter envelope, crucially supports **`portamento`** for smooth pitch glide |
| `Tone.Filter` | effects chain head | Multi-mode biquad filter (lowpass / highpass / bandpass) |
| `Tone.FeedbackDelay` | effects chain | Tempo-synced delay (e.g. `'8n.'` = dotted eighth note delay) |
| `Tone.Chorus` | effects chain | LFO-modulated short delay lines for harmonic thickening |
| `Tone.Reverb` | effects chain tail | Convolution reverb; `generate()` builds the impulse response at init |
| `Tone.Vibrato` | pre-filter effect | Cyclic pitch modulation shared across all voices |
| `Tone.Gain` | `masterGain` | Master volume; also used for mute by ramping to 0 |
| `Tone.context` | global | Shared `AudioContext`; `Tone.start()` must be called after user interaction |
| `Tone.now()` | scheduling | Current audio-clock time for scheduling future events |

### Architecture — what's inside

```
  Gesture synths (melody / bass / chord, all PolySynth)
  Theremin synths (MonoSynth × 2, one per hand, with portamento)
  Accompaniment synths (FM pad, AM bass, FM melody — richer timbres)
           │
           ▼
  Vibrato effect (shared)
           │
           ▼
  Filter (lowpass/highpass/bandpass, frequency 200–8000 Hz log scale)
           │
           ▼
  FeedbackDelay  →  Chorus  →  Reverb  →  Master Gain  →  Destination
```

Each effect can be bypassed in config. The chain is always built **backwards** (reverb first, then each effect connects *forward* to the next).

### The voice system

| Voice | Synth type | Timbre | Purpose |
|---|---|---|---|
| `melody` | PolySynth (triangle) | Soft, bell-like | Gesture-triggered lead notes |
| `bass` | PolySynth (sine) | Warm, deep | Root-note support |
| `chord` | PolySynth (sine) | Sustained pads | Held chord tones |
| `theremin L/R` | MonoSynth (sawtooth) | Continuous pitch | Hand-distance → frequency, with portamento |
| `accompPad` | PolySynth (FMSynth) | String-like warmth | Backing pad for song mode |
| `accompBass` | PolySynth (AMSynth) | Organ-like | Backing bass |
| `accompMelody` | PolySynth (FMSynth, high harmonicity) | Bell/guitar | Arpeggio/backing melody |

**Why separate accompaniment synths?** Gesture voices need to be bright and percussive; accompaniment needs to sit *behind* them. Mixing them would force a compromise on both.

### The note lifecycle

1. A mapping node (e.g. `ZoneMappingNode`) decides "play C4 on melody voice with velocity 0.7"
2. It emits a `MusicalEvent` of type `noteOn` onto the event bus
3. `MusicController` receives the event and calls `soundEngine.noteOn('melody', 'C4', 0.7)`
4. The synth does `triggerAttack()`; velocity is first clamped to the configured **dynamics range** (user-calibratable — important for users with involuntary spasmodic movement who'd otherwise trigger max-velocity every note)
5. Signal flows synth → vibrato → filter → delay → chorus → reverb → master → speakers

### Theremin mode (the most specific case)

MonoSynth with `portamento = 0.03` by default. `thereminSetFrequency()` uses `frequency.rampTo()` rather than discrete note events — this is what gives the smooth glissando glide between hand positions. Two separate synths (left/right) so the user can play two-handed theremin-like continuous pitch.

### Music settings — what the user controls

`applyMusicSettings(settings: MusicSettings)` denormalises UI sliders (0–1) into real parameter values:

| UI slider | Real parameter | Range |
|---|---|---|
| Attack time | envelope.attack | 0.001–0.5 s |
| Release time | envelope.release | 0.1–2.0 s |
| Vibrato rate | vibrato freq | 1–10 Hz |
| Vibrato depth | vibrato depth | 0–1 |
| Portamento | theremin glide | 0–0.5 s |
| Dynamics range | velocity clamp | min/max 0–1 |
| Filter frequency | filter freq | 200–8000 Hz (log) |
| Reverb amount | reverb wet | 0–1 |
| Delay amount | delay wet | 0–1 |
| Harmonic richness | chorus wet | 0–1 |

### Potential questions & answers

**Q: Why Tone.js and not raw Web Audio?**
Tone.js gives me PolySynth, MonoSynth with built-in portamento, high-quality reverb, and musical time notation (`'8n.'` = dotted eighth). Writing these from scratch would be months of DSP work irrelevant to the research question.

**Q: Why a singleton?**
A single shared `AudioContext` is a browser hard-requirement — multiple contexts create glitches and duplicate output. The singleton also means mapping nodes in different parts of the UI all address the same audio graph.

**Q: What's the "dynamics range" for?**
Some users (cerebral palsy, involuntary movement) can't hit low velocities — every gesture registers at max force. Without clamping, the instrument becomes uniformly loud and inexpressive. The calibration session measures their natural range and clamps velocity inside it, remapping small differences back into a musically useful band.

**Q: Why a vibrato effect node AND per-synth portamento?**
Vibrato is cyclic pitch modulation (the oscillator wobble). Portamento is the glide between two target pitches. Different musical purposes — vibrato for expression on held notes, portamento for theremin-style continuous motion.

**Q: How's latency measured / controlled?**
`Tone.context.latencyHint = 'interactive'` (Tone.js default). Total gesture-to-sound is ~15–20 ms on a modern laptop. Main contributors: webcam capture (~10 ms), MediaPipe inference (~3 ms with WASM/GPU), Web Audio scheduling (~2 ms). The project brief in `CLAUDE.md` says under 20 ms, and that's the target.

**Q: What happens if audio initialisation fails?**
`initialize()` throws. The UI catches it and shows a message. Browsers block audio until user interaction, so `Tone.start()` is awaited inside a button click handler — this is why the app has a "Click to start" landing screen.

---

## 3. Chord Analysis & Play-Along

### Libraries used for this subsystem
- **Tone.js** — `Tone.Transport` drives song playback time; `Tone.Reverb`, `Tone.Gain`, `Tone.PolySynth(FMSynth/AMSynth)` for generated voices
- **Web Audio API (raw)** — `SongPresetEngine` and `ToneVoiceBase` use `AudioBufferSourceNode`, `GainNode`, `BiquadFilterNode` directly for stem playback (finer-grained scheduling than Tone.js offers out of the box)
- **No ML / chord-recognition library at runtime** — chord detection is done offline in Python (**librosa** for beats, **ChordMini** or similar for chord labels) and shipped as a static `analysis.json` per song
- **Pure TypeScript music-theory helpers** in `src/sound/MusicTheory.ts` — scales, intervals, quantisation; no external library needed

### The two chord systems

There are actually **two independent chord systems** in the codebase — important to keep them distinct in a meeting because their use cases are different.

| System | Lives in | Used for | Chord source |
|---|---|---|---|
| **A. HarmonyManager** | `src/accompaniment/` | Free improvisation with auto-generated backing | Degree-based templates resolved into whatever key the user picked |
| **B. SongPresetEngine** | `src/songs/` | Playing *along* with a recorded song | Pre-analysed chord timeline from the audio file |

### System A: HarmonyManager + AccompanimentEngine (free-play mode)

**Goal:** the user picks a key (say C major) and a mood ("contemplative", "ambient"), and the instrument generates a rolling chord backing that never clashes with their gestures.

**How chords are generated:**

1. Progressions are stored as **scale-degree templates**, not concrete notes:
   ```ts
   simple: [
     { degree: 0, suffix: '',  intervals: [0,4,7], mood: 'peaceful' },     // I
     { degree: 5, suffix: 'm', intervals: [0,3,7], mood: 'contemplative' }, // vi
     { degree: 3, suffix: '',  intervals: [0,4,7], mood: 'brightening' },   // IV
     { degree: 4, suffix: '',  intervals: [0,4,7], mood: 'resolved' },      // V
   ]
   ```
2. When the user sets the key, `resolveDegreeChord()` walks the scale and produces concrete chord tones (e.g. in C major: I=C, V=G, IV=F, vi=Am).
3. This means **any progression works in any key and scale type** — including pentatonic, dorian, blues, whole-tone. A minor-key progression in dorian mode produces different notes from the same progression in natural minor, for free.

**How accompaniment gets generated from the chord:**

`AccompanimentEngine.tick()` runs every frame. For each chord:

| Pattern | Voice type | Behaviour |
|---|---|---|
| `pad` | chord | Sustains all chord tones for the chord's duration |
| `drone` | bass | Holds root (+ fifth at high density) |
| `arpeggio` | melody | Plays chord tones sequentially; density controls subdivision |
| `bassline` | bass | Rhythmic root + approach tones |

Each pattern has `minSteps` and `maxSteps` definitions. The user's **density** slider interpolates between them — low density = fewer notes, high density = full voicing.

**Tension control:** when the user pushes tension above 0.5, there's a random chance a scale-degree shift happens (±1 semitone, re-quantized back onto the scale). This introduces extensions like 9ths/11ths without hard-coding them.

**Double-buffering:** when a chord changes, `regenerateBuffer()` precomputes all the scheduled note events for the next chord before releasing the old sustained notes. No audible gap.

**Note quantisation:** `HarmonyManager.quantizeNote(midi)` snaps any MIDI number to the nearest note in the active scale. The melody voice calls this on every triggered note, so **no note can ever sound "wrong"** against the current chord — a key accessibility principle (the user can play anywhere and it will fit).

### System B: SongPresetEngine (play-along with a real recording)

**Goal:** the user picks a song (currently "Can't Help Falling in Love"). The original recording plays as separated stems (vocals, drums, bass, other). The user adds layered synth voices *on top* that are automatically transposed to match whatever chord is playing *right now* in the recording.

**How the chord timeline is built:**

Two routes:

1. **Hand-coded** — the `CANT_HELP_CHORDS` array in `chordLookup.ts` lists every chord change with its timestamp:
   ```ts
   { time: 10.74, notes: [F#3, A3, C#4, F#4], root: F#2, name: 'F#m' }
   ```
2. **AI-analysed** — `analysisLoader.ts` can load an `analysis.json` produced by librosa or ChordMini (Python-side tools), which detects beats/downbeats/chord labels automatically. `parseChordLabel()` regexes labels like "F#m7" or "C#7" into root pitch class + quality, then `buildVoicing()` turns that into MIDI notes in the right octave.

**How the song stays in sync:**

- Tone.js `Transport` drives song playback time
- Every frame, `getChordAtTime(progression, Transport.seconds)` does a binary search (O(log n)) to find the currently active chord
- All four generated voices (ChordPad, Melodic, Arpeggio, BassSynth) read the same "current chord" and re-tune themselves accordingly

**The 5-colour voice system** — this is the clever part:

| Colour | Role | What the musician controls with position |
|---|---|---|
| Blue | Stem Mixer | Left/centre/right zone → balance of vocals/drums/bass/other |
| Red | Chord Pad | X = voicing spread (close/standard/wide); Y = filter brightness |
| Green | Melody | X = which note in the D major pentatonic band; Y = octave shift; crossing a band boundary triggers a note |
| Yellow | Arpeggio | Transport-locked cascading chord tones; position shapes density/pattern |
| Orange | Bass Synth | Rhythmic MonoSynth root hits |

**Constraint:** only **two colours are active at any time** (whichever two the camera can see). This prevents cognitive overload and means a musician with limited dexterity can still control the full arrangement — they just swap which objects are visible to the camera.

**Audio graph for this mode** (important — it's separate from the free-play SoundEngine):

```
Stems ── StemMixerVoice ── stemBus ── sidechainGain ──┐
                                                       ├── dryGain ────┐
ChordPad   ─┐                                          │               │
Melodic    ─┼── generatedBus ─────────────────────────┘               │── masterGain
Arpeggio   ─┤                                                          │
BassSynth  ─┘                                                          │
                  reverbSend ── Reverb ── reverbWetGain ──────────────┘
```

Sidechain ducking: when the drum stem hits a downbeat, it briefly dips the generated voices by ~3 dB so they sit in the pocket with the original recording.

### Why band-crossing triggers (not continuous) for green melody?

The pentatonic melody voice only triggers a new note when the hand **crosses a boundary** between bands. Holding still plays nothing new. This was a deliberate accessibility decision: otherwise involuntary micro-movements would retrigger the note constantly. Crossing a boundary is an intentional act; drifting within a band is not.

### Potential questions & answers

**Q: Why two separate chord systems — isn't that redundant?**
They solve different problems. HarmonyManager is for free improvisation where the user defines the key; SongPresetEngine is for playing along with a specific recording whose chords are fixed. A single abstraction would force one to be awkward.

**Q: How are the song chord timestamps produced?**
Either hand-transcribed (for the demo song, done from the BPM and bar structure) or auto-detected via librosa/ChordMini (a Python CNN for chord recognition) which outputs an analysis.json the browser loads.

**Q: What's "degree-based" about HarmonyManager?**
Instead of storing `[Cmaj7, Am7, Fmaj7, G7]` for one specific key, I store `[degree 0 maj7, degree 5 m7, degree 3 maj7, degree 4 dom7]`. When the user picks D minor, `resolveDegreeChord()` walks the D natural-minor scale and produces the concrete chords. Same progression template works in any key or mode.

**Q: How do you stop wrong notes?**
Two layers. (1) `quantizeToScale()` snaps every triggered MIDI note to the active scale. (2) Each chord in the progression has a `scaleDegreesForMelody` field listing which scale degrees sound particularly good over *that* chord — melodic mapping nodes prefer those.

**Q: Why does chord change trigger a full buffer rebuild?**
Because pattern notes (arpeggio degrees, bassline motion) are chord-relative. When the chord changes, the scheduled note events need to be re-resolved against the new chord. Double-buffering means the computation happens before the old chord finishes, so there's no dropout.

**Q: How does tension work musically?**
At tension > 0.5, there's a probability the generator shifts a chord tone by ±1 semitone and re-quantises. This produces jazz-style extensions (add9, #11) without hard-coding them — a 5th that gets bumped up is a #5, a 3rd that drifts up is a 4 (suspension). The quantisation keeps it from sounding *wrong*.

**Q: What's a sensible failure mode if chord detection fails for a new song?**
`parseChordLabel()` returns null for unrecognised labels and logs a warning. That chord is skipped — the previous chord keeps playing through the gap. Better than silence or a crash mid-song.

**Q: Can a musician perform the song without MediaPipe?**
Yes — that's precisely why colour tracking is the parallel input path. The SongPresetEngine voices read `VoicePosition {x, y, found}` which can come from either tracker.

---

## Cross-cutting principles (likely high-level questions)

| Principle | Where you'll see it |
|---|---|
| **Tolerance over precision** | Dynamics-range clamping; pentatonic quantisation; smoothing on colour tracking; band-crossing triggers |
| **Every threshold calibratable** | Click-to-calibrate colours; musical settings denormalisation; velocity range; zone sizes |
| **Latency ≤ 20 ms** | Frame-skipping in tracking; double-buffered accompaniment; direct Tone.js triggerAttack (no async queue) |
| **Visual feedback for every audio event** | TrackingOverlay, ColorTrackingOverlay, ExpressionVisualizer, AudioReactiveRing — deaf/HoH users can "see" the sound |
| **Browser-only, no install** | MediaPipe WASM, Tone.js, webcam API — no native binaries, no drivers |

## File-level cheat sheet (in case they ask "where's X?")

| Question | File |
|---|---|
| How does colour tracking work? | [src/tracking/ColorTracker.ts](src/tracking/ColorTracker.ts) |
| Where's the Tone.js sound engine? | [src/sound/SoundEngine.ts](src/sound/SoundEngine.ts) |
| How are chord progressions defined? | [src/accompaniment/HarmonyManager.ts](src/accompaniment/HarmonyManager.ts) |
| Where are accompaniment patterns (pad/drone/arpeggio)? | [src/accompaniment/AccompanimentPatterns.ts](src/accompaniment/AccompanimentPatterns.ts) |
| How is accompaniment scheduled each frame? | [src/accompaniment/AccompanimentEngine.ts](src/accompaniment/AccompanimentEngine.ts) |
| Where's the song play-along orchestrator? | [src/songs/SongPresetEngine.ts](src/songs/SongPresetEngine.ts) |
| How is the chord timeline for a song looked up? | [src/songs/voices/chordLookup.ts](src/songs/voices/chordLookup.ts) |
| How are AI-analysed chord files loaded? | [src/songs/analysisLoader.ts](src/songs/analysisLoader.ts) |
| How do scales + quantisation work? | [src/sound/MusicTheory.ts](src/sound/MusicTheory.ts) |
| Top-level orchestration? | [src/core/MusicController.ts](src/core/MusicController.ts) |
