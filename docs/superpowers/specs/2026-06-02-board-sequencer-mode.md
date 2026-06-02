# Slide & Settle Board Sequencer — Design Spec

**Date:** 2026-06-02
**Status:** Draft for review
**Scope:** Recognition Level 1 (occupancy) + Level 2 (colour, **red only**). Black pieces and Scrabble-letter (Level 3) recognition are OUT of scope; documented seams are left for them.
**Co-designer:** Tim (button-based controllers, tangible objects, small low-region hand movement, does not naturally look at the screen).

---

## 0. Summary

A NEW, standalone, opt-in interaction mode for the ADMI, living on its **own dedicated screen** (`BoardSequencerScreen`), OFF by default and isolated from all existing modes (baton, ColorExpression, theremin, Song Preset, SurfacePress).

A webcam views a physical draughts board at an **oblique** angle. The facilitator clicks the four board corners once per session; a perspective homography warps the board to a flat top-down grid. Tim slides **red** draughts pieces onto a contiguous block of cells. A piece only enters the music once it has **stopped moving** (slide-and-settle). The board is read as a **looping step sequencer** with its **own internal tempo**: columns are beats, rows are a **fixed pentatonic scale**, so every placement is always consonant. Settled cells play a **sampled instrument** (electric piano) routed through the existing shared effects bus. An optional **confirmation tick** sounds the instant a piece is accepted as settled.

### Deviations from the original commission (explicitly approved by the user)

The commission's literal wording assumed a song-coupled, chord-locked design. The user chose a simpler standalone design. These deviations are deliberate and approved:

1. **Standalone, not song-coupled.** The board has its own internal tempo/metronome and does **not** ride on `SongPresetEngine`, does **not** call `chordLookup`/`getChordAtTime`, and does **not** require any song to be loaded.
2. **Rows = fixed pentatonic scale, not chord tones.** Four ascending pentatonic pitches (bottom→top), independent of any chord progression, so any combination of placements sounds consonant.
3. **Grid = a contiguous 4×4 block of board cells regardless of square colour** (not white-squares-only). Red pieces read reliably on both light and dark squares, and a real draughts board has no contiguous 4×4 block of a single colour.
4. **Routing via the shared effects bus directly, not via `MusicEventEmitter`.** Investigation confirmed `MusicEventEmitter` only carries frequency-based events to the oscillator synth and cannot reach the *sampled* instrument layer. The sampled path (`SamplerPlayer` → `filterNode` → bus) is what the brief actually wants; we reuse it the way `SurfacePressVoice` does, connecting into `EffectChainManager.getInput()` (the song-independent shared effects bus).
5. **Dedicated screen, not an input-method panel entry.** The user chose a separate `BoardSequencerScreen` rather than registering inside the performance screen's input-method list.

Everything else follows the commission: manual four-corner homography (no OpenCV.js), per-cell red classification, slide-and-settle activation, sequencer (next-loop-pass) semantics, the confirmation tick, the recognition dial seam, every threshold calibratable, and no reuse of the `found === false` mute semantic.

---

## 1. Integration seams (confirmed by investigation)

| Concern | Existing code (template / reuse) |
|---|---|
| Sibling tracking-mode class (pure, audio-free, frame-stepped) | `src/tracking/SurfacePressMode.ts`, `src/tracking/ThereminMode.ts` |
| Colour reading (HSV, hue/sat/min-area, **red/skin-tone exclusion already tuned**) | `src/tracking/ColorTracker.ts` (`rgbToHsv`, `matchesColor`, `getImageData` downscale pipeline) |
| Camera frame access | `CameraManager.getVideoElement()` → caller creates its own canvas + `getImageData` |
| Sampled voice from the curated palette (NOT new synthesis, NOT the oscillator) | `src/songs/voices/SurfacePressVoice.ts` → `SamplerPlayer` + `SAMPLE_CONFIGS` + `getInstrumentEntry` |
| Beat-snap / scheduling parity | `src/songs/surfacePressTiming.ts` (`PendingPressQueue`, `nextBeatAfter`) — pattern reference; the board uses an internal clock |
| Per-user config persistence (own localStorage key, sanitised on load, exposed via `InputProfileManager`) | `src/profiles/SurfacePressConfig.ts` (`admi-surface-press`), `BatonAssignments` |
| Shared effects bus (song-independent) | `src/effects/EffectChainManager.ts` — `initialize()`, `getInput()`, `masterGain.toDestination()` |
| Screen registration / routing | `Screen` union `src/state/types.ts:473`; `currentScreen` + `setCurrentScreen` in `src/state/store.ts`; `switch (screen)` in `src/ui/App.tsx:93` |
| `found === false` baton mute semantic (MUST NOT reuse/alter) | `src/remix/RemixBaton.ts:135-149`; `ColorBlob.found` in `ColorTracker.ts` |

**`found === false` confirmation:** This is the baton "object gone → mute it" semantic (`RemixBaton.update()` nulls `filterNorm` when the blob's `found` is false). The board sequencer **does not reuse or alter it.** A cell deactivates because a *settled piece left it*, never because a blob dropped for a frame; brief blob loss during finger/hand occlusion is absorbed with last-seen state (mirroring SurfacePress).

---

## 2. The interaction

1. Facilitator opens the Board screen and runs **Board Calibration** (once per session, or reuse a saved calibration).
2. Tim slides red pieces onto the 4×4 cell block.
3. While a piece is moving, nothing fires. When a piece **stops for the settle window (default 600 ms)**, its cell becomes **active**: a confirmation tick sounds immediately, and the cell's note joins the loop on the **next pass** at its column's beat.
4. Starting to move a piece **immediately deactivates** its old cell (its note drops out of the loop); the destination cell activates when the piece settles there.
5. The loop runs continuously at the internal tempo; the facilitator screen shows the warped board with active cells highlighted and a moving playhead.

---

## 3. Board calibration (homography)

- **Method (required):** manual four-corner click in fixed order **TL → TR → BR → BL** on the live (un-warped) video. No auto-detection.
- **Homography:** compute a 3×3 perspective transform mapping the **unit square (warped grid space) → source image pixels**, from the 4 clicked image points and the 4 unit-square corners. Standard 8-parameter Direct Linear Transform (solve an 8×8 linear system via Gaussian elimination). Works at oblique angles; no overhead rig required.
- **Implementation:** `src/utils/homography.ts` — pure, no dependencies.
  - `computeHomography(src: Point[4], dst: Point[4]): Mat3` (returns the 3×3 as a 9-tuple)
  - `applyHomography(h: Mat3, p: Point): Point`
  - To sample cell `(row, col)`: take the cell-centre (and an inset central region) in unit-square space, map through the homography to image pixels, sample there. (We map grid→image, so we never need to warp the whole frame — only sample points.)
- **Grid definition:** `rows × cols` (default 4×4) and the **cell block origin/extent** within the unit square. The block is contiguous and need not align to physical square colour. All of `corners`, `rows`, `cols`, and block placement are calibration values.
- **Persistence:** saved via `BoardSequencerConfig` (see §8). "Not yet calibrated" is a first-class state; the screen prompts for calibration.

---

## 4. Per-cell reading

Per processed frame, the **`BoardReader`** (impure) builds a board matrix:

1. For each cell, map a **central sampling region** (e.g. inner 50% of the cell) grid→image via the homography.
2. Sample pixels in that region from a downscaled canvas (reuse `ColorTracker`'s downscale + `getImageData` approach; `willReadFrequently`).
3. Convert each sample to HSV (`rgbToHsv`) and test against the calibrated **red colour band** (`matchesColor`-equivalent: hue ± tolerance, min saturation, min value, with the existing red/skin-tone exclusion).
4. Compute **filled fraction** = matching pixels / sampled pixels. Cell is **occupied-red** when `filledFraction ≥ minFilledFraction`.
5. Compute the **red centroid** within the cell (mean position of matching pixels, in unit-square coords) — used by the settle detector as the piece position for velocity.

The red colour band defaults to a sensible red (calibratable by clicking a red piece, reusing `ColorTracker.calibrateFromPixel`). `minFilledFraction` is a calibration value (default ≈ 0.25).

Classification is delegated to the **`PieceRecognizer`** abstraction (§7) so occupancy/colour/identity levels are swappable.

---

## 5. Slide-and-settle logic (pure core — the heart of the mode)

**File:** `src/tracking/BoardSequencerMode.ts`. Pure, no audio/DOM, fully unit-tested. Sibling of `SurfacePressMode`.

### Input per frame
```ts
interface CellReading {
  row: number;
  col: number;
  occupied: boolean;          // from PieceRecognizer (Level 1)
  colour: 'red' | null;       // from PieceRecognizer (Level 2)
  centroid: { x: number; y: number } | null; // unit-square coords, null if empty
}
step(readings: CellReading[], dtMs: number, nowMs: number): BoardStepResult
```
```ts
interface BoardStepResult {
  activeCells: CellRef[];      // currently SETTLED_ACTIVE cells
  justSettled: CellRef[];      // cells that became active THIS frame (→ confirmation tick)
  justDeactivated: CellRef[];  // cells that left active THIS frame
}
```

### Per-cell state machine
Each cell holds: `occupiedColour`, `lastCentroid`, low-passed `velocity`, `stillMs` (accumulated time below the velocity floor), and `phase ∈ { idle, settled }`.

- **Velocity** = `distance(centroid, lastCentroid) / dtMs`, low-pass smoothed. If the cell is unoccupied or has no centroid, treat as "no piece" (reset).
- **idle → settled** when: occupied-red **AND** `velocity < velocityFloor` continuously for `stillMs ≥ settleWindowMs`. On transition, the cell is emitted in `justSettled`.
- **settled → idle** (immediate) when: occupancy lost **OR** `velocity ≥ velocityFloor` (piece started moving). On transition, the cell is emitted in `justDeactivated`. Timer resets.
- A piece in transit keeps `velocity ≥ floor`, so `stillMs` never accumulates → **never fires**.
- Moving a settled piece off cell A raises A's velocity → A deactivates immediately; when the piece settles on cell B, B activates after the settle window.

**Config (all calibratable, no magic numbers in the hot path):** `settleWindowMs` (default 600), `velocityFloor` (unit-square units per ms; tuned default), velocity smoothing factor.

**`found === false` is not used here.** Occupancy comes from the recogniser's filled-fraction test, not from a colour-blob `found` flag, and a single dropped frame is absorbed by the smoothing/last-centroid rather than forcing a mute.

---

## 6. Musical mapping & the sequencer engine

**File:** `src/songs/BoardSequencerEngine.ts` — owns the clock, the sampled voice(s), the tick, and the current active-cell matrix.

### Internal transport (standalone)
- A look-ahead scheduler driven off the Web Audio / Tone context clock (`Tone.now()` / `ctx.currentTime`), **not** `Tone.Transport` (so it never clashes with a song's transport). BPM is a calibration value (default 90).
- One loop = `cols` beats (default 4 beats = 1 bar). The playhead advances one **step/beat** per beat and wraps.
- On each step `c`, for every **active** cell `(r, c)`, schedule a note: `pitch = pentatonic[r]`, at the step's audio time. This is **sequencer semantics** — a freshly-settled cell first sounds on the **next** time the playhead reaches its column, not instantly.

### Pitch mapping (fixed pentatonic)
- `pentatonic: number[]` (MIDI), length = `rows`, ascending; bottom row = lowest. Default C-major pentatonic `C4 D4 E4 G4` (MIDI 60, 62, 64, 67). Root, scale, and length are calibration values.
- Multiple active cells in the same column → a consonant cluster (pentatonic guarantees no dissonant clash).

### Sampled voice
**File:** `src/songs/voices/BoardSequencerVoice.ts` — extends `ToneVoiceBase`, owns a `SamplerPlayer(SAMPLE_CONFIGS[entry.sampleKey], this.filterNode)`, `bypassFade = true`. Method `play(midi, velocity, durationSec)` → `triggerAttackRelease` (short sequenced notes). Default instrument **electric piano** (`electricPiano` palette key). Note length default ≈ 0.9 beat; velocity default 0.7 (calibratable).
- Output routing: `voice.connect(EffectChainManager.getInput())` — the song-independent shared effects bus → master → destination. The engine ensures `EffectChainManager.initialize()` has run (after `Tone.start()` from a user gesture on the Board screen).
- A small voice pool (or one voice with retrigger) sized to `rows × cols` worst-case simultaneity per beat.

### Confirmation tick (§ separate from the musical note)
- Optional, default **on**, toggleable. Fires the instant a cell enters `justSettled` (acceptance feedback) — **before** and distinct from the musical note that arrives on the beat.
- Implemented as a short, soft percussive tick (a brief sampled/synth blip) routed to the bus, deliberately timbrally distinct from the electric piano. Because Tim does not watch the screen, this is his primary "accepted" cue.

---

## 7. Recognition dial seam (scaffold; build Level 1 + 2 red only)

**File:** `src/tracking/PieceRecognizer.ts`

```ts
export type RecognitionLevel = 'occupancy' | 'colour' | 'identity';

export interface CellSample {
  filledFraction: number;        // Level 1 signal
  redFraction: number;           // Level 2 (red) signal
  // future: hue histogram / crop pixels for black + identity
}

export interface CellClassification {
  occupied: boolean;
  colour: 'red' | 'black' | null; // 'black' documented-but-unimplemented
  identity?: string;              // Level 3 (Scrabble letters) — NOT implemented
}

export interface PieceRecognizer {
  readonly level: RecognitionLevel;
  classify(sample: CellSample): CellClassification;
}
```

- **Level 1 — `OccupancyRecognizer`** (implemented): `occupied = filledFraction ≥ minFilledFraction`; `colour = null`.
- **Level 2 — `RedColourRecognizer`** (implemented): `occupied` as L1, `colour = redFraction ≥ minFilledFraction ? 'red' : null`.
  - **Documented `black` branch:** a clear `// LEVEL 2 (future): add black via a low-value/low-saturation test → colour: 'black'` insertion point, not implemented.
- **Level 3 — identity:** a documented stub (`// LEVEL 3 (future): Scrabble-letter OCR on the cell crop → identity`), **not implemented**.

### Colour → instrument hook
```ts
// Only 'red' is wired now. Extensible map for a second colour later (e.g. black bass).
const COLOUR_INSTRUMENT: Partial<Record<'red' | 'black', string>> = { red: 'electricPiano' };
```
The engine resolves a settled cell's instrument via `COLOUR_INSTRUMENT[colour]`. Adding `black: 'bassElectric'` later is a one-line change plus a black recogniser.

---

## 8. Persistence (per-user calibration)

**File:** `src/profiles/BoardSequencerConfig.ts` — mirrors `SurfacePressConfig` exactly: dedicated localStorage key `admi-board-sequencer`, `load`/`save`/`clear`, `sanitize(unknown)` returning `null` on any corruption (never breaks loading), exposed via `InputProfileManager`. **No change to `UserProfile`.**

```ts
interface BoardSequencerStored {
  enabled: boolean;                 // OFF by default
  corners: [Point, Point, Point, Point]; // TL,TR,BR,BL in normalised image coords
  rows: number; cols: number;       // default 4,4
  block: { originRow: number; originCol: number }; // cell-block placement (default 0,0)
  scaleRootMidi: number;            // default 60 (C4)
  scaleSemitones: number[];         // pentatonic offsets, length = rows; default [0,2,4,7]
  bpm: number;                      // default 90
  settleWindowMs: number;           // default 600
  velocityFloor: number;            // tuned default
  redColour: TrackedColor;          // calibrated red band (hue/tol/minSat/minVal/minArea)
  minFilledFraction: number;        // default ~0.25
  noteLengthBeats: number;          // default 0.9
  velocity: number;                 // default 0.7
  tickEnabled: boolean;             // default true
  colourInstrument: Record<string, string>; // default { red: 'electricPiano' }
}
```

---

## 9. UI / screen registration

- Add `'boardSequencer'` to the `Screen` union (`src/state/types.ts`).
- Add `case 'boardSequencer': return <BoardSequencerScreen />;` to `src/ui/App.tsx`.
- Add a navigation entry to reach the screen (e.g. from the welcome/sidebar nav), consistent with how `songPreset`/`remix` are launched. **OFF by default:** initial `currentScreen` stays `'welcome'`; the board screen is only reached by explicit navigation, and `BoardSequencerStored.enabled` defaults false.
- **`BoardSequencerScreen`** (`src/ui/screens/`):
  - Mounts a `<video>` + `CameraManager`, starts the needed tracking (hand/finger landmarks are **not** required for occupancy reading — the board reads colour only — but a hand may be tracked later if we want finger-aware features; for Level 1+2 we only need the video frame).
  - **Calibration overlay:** click the four corners in order, with on-screen guidance and a "recalibrate" / "use saved" path.
  - **Facilitator warped-board view:** renders the warped grid, highlights `activeCells`, and shows the moving playhead — the visual feedback channel (also serves deaf/HoH users per the research constraints).
  - **Controls:** tempo, settle window, tick on/off, scale root, grid size, red recalibrate — all writing through `BoardSequencerConfig`.
- Ensures audio is unlocked (`Tone.start()` on first user gesture) and `EffectChainManager.initialize()` before scheduling.

### Wiring the frame loop
The Board screen runs its own per-frame loop (rAF or the existing tracking callback): `BoardReader.read(video) → BoardSequencerMode.step() → BoardSequencerEngine.setActiveCells(result.activeCells); result.justSettled → engine.fireTick()`. The engine's scheduler independently advances the loop and triggers notes. This loop exists **only on the Board screen**, so no other mode is touched.

A `MappingEngine.enableBoardSequencerMode(bool)` flag is optional and only used if we ever surface the mode outside its screen; for the dedicated-screen design the screen lifecycle (mount/unmount) is the on/off switch, and unmount disposes the engine, voices, camera, and scheduler.

---

## 10. File plan

**New:**
- `src/utils/homography.ts` — DLT homography + point apply (pure).
- `src/tracking/PieceRecognizer.ts` — recognition dial (L1, L2-red; L2-black/L3 documented stubs) + colour→instrument map.
- `src/tracking/BoardReader.ts` — impure per-frame cell sampling/classification (reuses ColorTracker HSV helpers).
- `src/tracking/BoardSequencerMode.ts` — **pure** slide-and-settle engine.
- `src/songs/voices/BoardSequencerVoice.ts` — sampled voice (SamplerPlayer + palette), `play(midi, vel, dur)`.
- `src/songs/BoardSequencerEngine.ts` — internal clock, scheduler, tick, active-matrix holder, bus wiring.
- `src/profiles/BoardSequencerConfig.ts` — persistence (mirrors SurfacePressConfig).
- `src/ui/screens/BoardSequencerScreen.tsx` (+ calibration overlay & warped-board view components under `src/ui/components/board/`).
- Tests under `src/__tests__/`.

**Edited (additive, non-breaking):**
- `src/state/types.ts` — extend `Screen` union.
- `src/ui/App.tsx` — add screen case.
- `src/ui/screens/index.ts` — export the screen.
- Navigation component — add an entry to reach the Board screen.
- `src/profiles/InputProfileManager.ts` — expose board config get/save/clear (delegation, like SurfacePress).

No existing mode files are modified beyond additive registration. Baton/ColorExpression/theremin/Song Preset/SurfacePress behaviour is untouched.

---

## 11. Testing (commission §6, adjusted for the pentatonic/standalone decision)

Unit tests (Vitest; `vi.mock` Tone.js where needed):

1. **Slide-and-settle (`BoardSequencerMode`):**
   - A piece with moving centroid (velocity above floor) produces **no** active cell, no matter how many frames.
   - A piece whose centroid is still for ≥ `settleWindowMs` becomes active exactly once (emitted in `justSettled`).
   - A settled piece that starts moving deactivates its old cell **immediately**; arriving and settling on a new cell activates the new cell after the window.
   - Occupancy loss deactivates immediately; a single dropped frame (still occupied next frame) does **not** spuriously deactivate.
2. **Cell classification (`PieceRecognizer`):** red vs empty against `minFilledFraction` (L1 occupancy and L2 red), including the `redFraction` threshold boundary.
3. **Homography mapping (`homography.ts`):** a warped grid point round-trips to the correct cell; cell-centre → image → (inverse) → cell-centre within tolerance; oblique (non-axis-aligned) corner sets map correctly.
4. **Pentatonic row resolution:** active cell at row `r` resolves to `pentatonic[r]` (replaces the brief's "chord tones from chordLookup", per the standalone decision); ascending order; root/length honoured from config.
5. **Sequencer semantics (engine, with a mocked clock):** a cell settled mid-bar first sounds at its column on the **next** loop pass, not immediately; deactivation removes it from subsequent passes.

Plus: `npm run lint` (`tsc --noEmit`) and `npm run test:run` must pass, and a manual check that **every existing mode still behaves exactly as before** (the Board screen is additive and self-contained).

---

## 12. Acceptance criteria

- New `BoardSequencerScreen`, reachable by explicit navigation, OFF by default, not touching any other mode.
- Four-corner calibration produces a working oblique-angle warp; calibration persists per user and survives reload.
- Red pieces on a 4×4 block are read as occupancy + red; empty cells read empty; works on both light and dark squares.
- A piece fires **only** after settling (≥ 600 ms still); pieces in transit never fire; moving a settled piece deactivates its old cell immediately and activates the new cell on settle.
- Settled cells drive a looping 1-bar sequencer at the internal tempo; rows map to the fixed pentatonic scale; placements are always consonant; notes join on the next loop pass.
- Sampled electric-piano notes play through the shared effects bus.
- Optional confirmation tick fires on settle, distinct from the note, default on.
- Facilitator sees the warped board with active cells + playhead highlighted.
- All thresholds (settle window, velocity floor, red band, min filled fraction, grid size, tempo, scale) are calibration values.
- `found === false` mute semantic untouched; no OSC/Max; no Tone.js in components; no OpenCV.js; no `lets-go` code copied.
- Lint + tests green.

---

## 13. Risks & mitigations

- **Single-camera depth blind spot:** a piece held just above a cell can't be distinguished from one resting on it. *Mitigation:* slide-and-settle relies on stillness + occupancy of the cell region, not height; this is the accepted single-camera limitation (same class as SurfacePress's documented blind spot).
- **Oblique warp accuracy:** corner-click imprecision skews the grid. *Mitigation:* central sampling region per cell (inset), recalibrate flow, and a visible warped-board overlay so the facilitator can verify alignment.
- **Lighting / red vs skin / dark squares:** *Mitigation:* reuse ColorTracker's already-tuned red/skin-tone exclusion; red band + min filled fraction are calibratable; sampling the inset centre avoids square edges.
- **Hand occlusion while sliding:** the hand covers the piece mid-slide. *Mitigation:* velocity smoothing + last-centroid; brief occlusion does not deactivate a settled cell, and a moving piece wasn't firing anyway.
- **Clock contention with a song's transport:** *Mitigation:* the board uses its own look-ahead scheduler off the context clock, never `Tone.Transport`.
- **Performance (per-frame pixel sampling):** *Mitigation:* sample only inset central regions of the configured cells on a downscaled canvas (not the whole frame), as ColorTracker does.

---

## 14. Out of scope (seams left, do not build now)

- Black-piece detection (Level 2 black) — documented branch in `PieceRecognizer`.
- Scrabble-letter / identity recognition (Level 3) — documented stub.
- Second colour → second instrument — `COLOUR_INSTRUMENT` map is the hook; only `red → electricPiano` is wired.

These will not be implemented until the red slide-and-settle mode is confirmed working with Tim.
