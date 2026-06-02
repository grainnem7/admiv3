# Surface Press Mode — Stage 1 Spec

**Date:** 2026-06-02
**Status:** Awaiting review (Stage 1 only; Stage 2 Piano Genie is scaffold-only)
**Co-designer:** Tim (button-controller player; doesn't naturally watch the screen; relies on sound)

---

## 1. The interaction

A new **opt-in, default-off** interaction mode for the Song Preset performance screen.

The webcam is placed **low and tilted down across the table** — in front of Tim, or to one
side, but **not overhead**. Because the camera looks across the surface at an oblique angle,
an object's **height above the table** maps to its **vertical position in the image**: lifting
a baton/button moves its image-point up (smaller `y`), setting it down moves it toward the
calibrated **surface line** (larger `y`).

Tim's coloured objects lying on the table become **press triggers**. A press fires when the
tracked point — the **bottom of the object's colour blob**, or optionally a **fingertip** —
descends to the calibrated surface line for that object's `x`. Each press plays **one note**
on a chosen **sampled instrument**, constrained to the **song's current chord** and (optionally)
**snapped to the beat**, through the existing audio pipeline. Releasing the object (lifting it
clear of a higher release line) ends the note.

The camera angle (front vs. side) is a **physical setup choice only** — it is never baked into
class names, mode names, calibration maths, or thresholds. The surface line is *derived from the
points the user touches*, so any oblique angle works.

### Non-negotiable design values (from CLAUDE.md research context)
- **Tolerance over precision** — wide hysteresis band; never punish imprecise placement.
- **Musical agency** — every press is intentional and expressive (velocity from descent speed).
- **Latency < 20 ms** gesture-to-sound — detection is O(buttons) per frame; press triggers
  the sampler immediately (unless beat-snap defers to the next beat by design).
- **Every threshold calibratable per user** — no magic numbers in the hot path.
- **Visual feedback for the facilitator AND a clear sonic result** — Tim relies on sound.

---

## 2. Architecture decision (resolved with commissioner)

`MusicEventEmitter` (the named global bus) carries **frequency-based** events consumed only by
`AudioEngine`'s oscillators. The **sampled instruments, current chord, beat grid, and beat-snap**
machinery all live inside `SongPresetEngine`, which uses neither event bus.

**Chosen approach — "Engine consumer + event mirror":**
- `SurfacePressMode` (tracking layer) detects presses/releases and emits **typed press/release
  events** — it produces no audio.
- A new `SongPresetEngine` entry point consumes them, uses a **`NoteSource`** to pick a chord
  tone from `currentChord`, and plays it on a **reused sampled voice** with beat-snap.
- The press is **mirrored** as a typed musical event for facilitator visual feedback and future
  MIDI parity — but the audible sampled note comes from the engine's voice layer.

This honours "reuse the sampled voices / chord / beat-snap", preserves gesture→event→audio
separation, and does not route audio through the oscillator bus.

---

## 3. Components & data flow

```
ColorTracker (+ optional HandDetector)
   │  blobs[] now carry optional bottomY;  fingertips optional
   ▼
SurfacePressMode  (NEW, src/tracking/SurfacePressMode.ts — sibling of ThereminMode)
   │  pure: surface model + per-button hysteresis state machine
   │  emits SurfacePressEvent / SurfaceReleaseEvent  (typed, no audio)
   ▼
SongPresetScreen  (wires detector → engine, owns toggle + calibration UI + overlay)
   │  engine.pressSurfaceButton(buttonId, velocity)
   │  engine.releaseSurfaceButton(buttonId)
   ▼
SongPresetEngine  (NEW methods)
   ├─ NoteSource.noteForPress(buttonId, currentChord) → MIDI       (Stage 2 seam)
   ├─ beat-snap via existing nextBeatAfter(song.beats, t)
   ├─ SurfacePressVoice (sampled; reuses SamplerPlayer + SAMPLE_CONFIGS)
   └─ mirrors a typed note event for visual feedback / future MIDI
```

### 3.1 `ColorBlob.bottomY` (additive, non-breaking)
`findColorBlob` currently accumulates a centroid only. Add bounding-box tracking
(`minY/maxY`) during the existing pixel scan and expose:

```ts
export interface ColorBlob {
  colorId: string;
  x: number; y: number;     // centroid (unchanged)
  area: number;
  found: boolean;
  bottomY?: number;         // NEW: normalised max-y of matched pixels (0 top … 1 bottom)
}
```

`bottomY` is smoothed with the same alpha as `x/y`. It is **optional** — every existing consumer
ignores it, so the baton path is untouched. (The mirrored `ColorLandmarks` type in
`state/types.ts` is left as-is; `SurfacePressMode` reads `ColorBlob` directly from the tracker.)

### 3.2 Surface model — perspective line in image space
The table edge in the image is a **line**, not a constant `y`, because the camera is oblique.
The user touches **K ≥ 2 points** along the surface (clicks on the mirrored video). We fit a
line by least squares:

```
surfaceY(x) = a·x + b          // a,b from the touched points
```

(With exactly 2 points it's the straight line through them; with more it's the best fit, which
tolerates an imprecise touch.) Stored as `{ a, b, points: {x,y}[] }`.

### 3.3 Press/release detection (hysteresis)
For each registered button, the tracked point each frame is its blob's `bottomY` (fallback to
centroid `y` if `bottomY` is absent), or a fingertip `y` if fingertip mode is on.

```
pressLineY(x)   = surfaceY(x) − pressGap      // small gap above table; default ~0
releaseLineY(x) = surfaceY(x) − releaseGap    // releaseGap > pressGap  → hysteresis band

state idle:    pointY ≥ pressLineY(x)         → fire PRESS,   state = down
state down:    pointY ≤ releaseLineY(x)       → fire RELEASE, state = idle
```

`y` increases downward, so "descends to the line" = `pointY` rising to `pressLineY`. The band
`releaseGap − pressGap` prevents chatter. `pressGap`, `releaseGap`, and a per-button
`minBlobArea` (reject noise) are **all calibratable per user**; defaults live in a constants
block, never inline in the loop.

A press is only considered when the button's blob is `found` **and** above `minBlobArea` — but
note this is *not* the baton `found===false` mute semantic: a deliberate press is an event, a
disappearance is ignored (no release fired on blob loss unless `releaseOnLost` is enabled).

### 3.4 Velocity
Press velocity = clamp(descentSpeed / `descentForFullVelocity`, vMin, 1), where descentSpeed is
the smoothed Δ`pointY`/frame just before contact (same idea as `HeadBopDetector` amplitude→vel).
Falls back to a calibratable default velocity when descent can't be measured.

### 3.5 Engine playback path
```ts
// SongPresetEngine — new public API
pressSurfaceButton(buttonId: string, velocity?: number): void
releaseSurfaceButton(buttonId: string): void
setSurfacePressEnabled(enabled: boolean): void
setSurfacePressConfig(cfg: SurfacePressConfig): void   // buttons → instrumentKey etc.
```

- On press: `midi = noteSource.noteForPress(buttonId, this.currentChord)`. If `beatSnap` and
  `song.beats` exist and playing, defer to `nextBeatAfter(beats, currentTime)` (pending press,
  flushed in `update()` — same pattern as `InstrumentVoice`); a release before the beat cancels
  the pending press. Otherwise play immediately (< 20 ms).
- Sound: a **`SurfacePressVoice`** per button (lazy) — a thin sampled voice that **reuses
  `SamplerPlayer` + `SAMPLE_CONFIGS`** (no new synthesis): `press(midi, vel)` → `triggerAttack`,
  `release()` → `releaseAll`. Connected to the existing `generatedBus`; feeds `triggerSidechain()`
  like other note-triggering voices.
- Mirror: emit a typed `createNoteEvent('noteOn'|'noteOff', midi, vel, ts)` through a small
  engine-level event hook the screen subscribes to for the facilitator overlay (and future MIDI).
- Engine keeps `Map<buttonId, { voice, midi }>` so a release stops the correct note.

### 3.6 Stage 2 seam — `NoteSource`
```ts
// src/songs/voices/NoteSource.ts  (NEW)
export interface NoteSource {
  /** Pick the MIDI note for a press of `buttonId` given the current chord. */
  noteForPress(buttonId: string, chord: ChordEntry): number;
}

// Stage-1 implementation (deterministic, only one shipped this pass):
export class ChordToneNoteSource implements NoteSource { /* maps button index → chord tone */ }
```
`ChordToneNoteSource` maps each button to a chord tone deterministically (button index → index
into a sorted chord-tone ladder built from `chord.notes`, optionally octave-spread — reuse the
ladder logic shape from `InstrumentVoice.buildPitchLadder`). A future `PianoGenieNoteSource`
implements the same one-method interface and is selected where `ChordToneNoteSource` is
constructed. **No `@magenta/music`, model, weights, or worker in this pass.** A `// Stage 2:`
comment marks the single swap point.

---

## 4. Calibration & persistence
Reuse the **click-to-calibrate** path and the **profile-storage pattern** (the proven
`BatonAssignments.ts` model — a dedicated localStorage key, sanitised on load, exposed through
`InputProfileManager`).

**Calibration flow (in `SongPresetScreen`, reusing `ColorTracker.calibrateFromPixel`):**
1. **Touch surface points** — user clicks K points along the table edge on the video → fit
   `surfaceY(x)`.
2. **Register each button** — click the object → `calibrateFromPixel(video, rawX, rawY, "press-N")`
   captures its `TrackedColor`; record its resting `x`.
3. **(Optional) press-depth capture** — one sample press to auto-set `pressGap`/`releaseGap`,
   else use calibratable defaults.

**Persisted shape** (`src/profiles/SurfacePressConfig.ts`, key `'admi-surface-press'`):
```ts
interface SurfacePressConfig {
  enabled: boolean;
  surface: { a: number; b: number; points: { x: number; y: number }[] };
  pressGap: number; releaseGap: number;          // per-user thresholds
  descentForFullVelocity: number; defaultVelocity: number;
  useFingertip: boolean;                          // colour-blob bottom (default) vs HandDetector tip
  buttons: Array<{
    id: string;                                   // "press-1" … (own namespace, NOT baton roles)
    x: number;                                    // resting x for surfaceY(x)
    color: TrackedColor;                          // hue/tolerance/sat/val/minArea
    instrumentKey: string;                        // from instrument palette; default "piano"
    minBlobArea: number;
  }>;
}
```
Exposed via `InputProfileManager.getSurfacePressConfig()/saveSurfacePressConfig()/clear…`.
Surface buttons use **their own colour-id namespace** (`press-1…`), separate from the five baton
roles, so `ColorTracker` tracks both sets additively and the baton path is never affected.

---

## 5. The toggle (opt-in, default off)
- `SongPresetScreen` state `surfacePressEnabled` (default **false**), restored from
  `SurfacePressConfig.enabled`.
- A facilitator control toggles it (same pattern as the head-bop / beat-snap toggles), calling
  `engine.setSurfacePressEnabled(...)` and persisting.
- When **off**: zero behavioural change anywhere; `SurfacePressMode` isn't fed frames; no
  `press-N` colours are added; baton + ColorExpression paths are byte-for-byte unchanged.
- When **on**: the screen feeds blobs (and fingertips if enabled) to `SurfacePressMode` each
  frame and routes its events into the engine. The baton path continues independently for the
  five baton roles (different colour ids), so both can coexist or the facilitator can simply not
  assign baton colours.

---

## 6. Visual feedback (facilitator) — not the only feedback
Overlay on the existing video canvas:
- the fitted **surface line**,
- each button's marker coloured by **armed / pressed** state, with a **flash on press**.
Plus the mirrored note event is available to any existing visual-event layer. The **primary**
feedback for Tim is the **sampled note** itself.

---

## 7. Files touched / added

**Added**
- `src/tracking/SurfacePressMode.ts` — pure detector (surface model + per-button hysteresis,
  velocity, press/release events). Sibling of `ThereminMode`.
- `src/songs/voices/NoteSource.ts` — `NoteSource` interface + `ChordToneNoteSource` (Stage-2 seam).
- `src/songs/voices/SurfacePressVoice.ts` — sampled press/sustain voice reusing `SamplerPlayer`.
- `src/profiles/SurfacePressConfig.ts` — persistence (BatonAssignments-style).
- Tests in `src/__tests__/` (see §8).

**Modified**
- `src/tracking/ColorTracker.ts` — add optional `bottomY` (bounding-box max-y) to `ColorBlob`.
- `src/songs/SongPresetEngine.ts` — `pressSurfaceButton` / `releaseSurfaceButton` /
  `setSurfacePressEnabled` / `setSurfacePressConfig`, pending-press beat-snap, voice map, event mirror.
- `src/profiles/InputProfileManager.ts` — expose surface-press config getters/setters.
- `src/ui/screens/SongPresetScreen.tsx` — toggle, calibration UI, detector wiring, overlay.
- `src/state/store.ts` / `types.ts` — only if a Zustand-persisted UI flag is needed beyond the
  config module (kept minimal).

---

## 8. Testing (Vitest, pure logic — no Tone/MediaPipe)
1. **Perspective surface line** — fit `surfaceY(x)` from sample points; assert threshold value at
   several `x` positions (oblique line, not constant).
2. **Press detection across x** — given a fitted line, a tracked point at various `(x, y)` fires
   PRESS exactly when it crosses `pressLineY(x)`.
3. **Release hysteresis** — a point hovering near the line does **not** chatter; RELEASE fires only
   above `releaseLineY(x)`.
4. **Chord-tone selection** — `ChordToneNoteSource.noteForPress(buttonId, chord)` returns the
   expected MIDI for given chords from `getChordAtTime` fixtures at given times.
5. **Beat-snap selection** — deferred press targets `nextBeatAfter(beats, t)`; release before the
   target cancels the pending press.

`npm run lint` (tsc --noEmit) and `npm run test:run` must pass; manually verify Song Preset +
baton modes behave exactly as before with the toggle off.

---

## 9. Acceptance criteria
- [ ] Mode is opt-in, default off; with it off, baton + ColorExpression behaviour is unchanged.
- [ ] Calibration captures an oblique surface line from touched points and registers each button's
      colour + x via the existing `calibrateFromPixel` path; persisted across sessions.
- [ ] A press (blob bottom, or fingertip) descending to `surfaceY(x)` plays exactly one sampled,
      chord-constrained note; releasing above the higher release line ends it; no chatter.
- [ ] Note is beat-snapped when beat-snap is on, immediate (< 20 ms) when off.
- [ ] All thresholds are per-user calibratable; none hardcoded in the per-frame path.
- [ ] Every press has facilitator visual feedback **and** an audible sampled result.
- [ ] Audio flows through the existing voice layer / `EffectChainManager`; no Tone.js calls from
      UI components; the `found===false` baton mute semantic is untouched.
- [ ] `NoteSource` seam exists with only the deterministic `ChordToneNoteSource` implemented; a
      documented single swap point for a future Piano Genie source; no ML dependency added.
- [ ] Lint + tests pass.

---

## 10. Defaults I will choose (yours to override — reported again at Stage-1 handoff, commission §7)
- **Camera placement:** documented default = low & in front, tilted down; side placement equally
  supported (no code difference).
- **Number of buttons:** default **4** (configurable 1–5).
- **Default instrument:** **piano** (Salamander; highest-quality entry in the palette).
- **Detection signal:** colour-blob **bottom edge** by default; fingertip optional per-config.
- **Beat-snap:** inherits the screen's existing beat-snap toggle (off by default).

## 11. Explicitly out of scope (Stage 2+)
- Piano Genie note chooser / any ML model, weights, or worker, or `@magenta/music`.
- Changing the baton/ColorExpression behaviour or the `found===false` mute semantic.
- New synthesis (only existing sampler reuse).
