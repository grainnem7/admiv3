# Remix Loop Foundation + Keyboard + Tim Accessibility — design

**Date:** 2026-05-26
**Author:** Grainne (with Claude)
**Status:** Draft — ready for plan

---

## Goal

Make the Remix screen actually playable, loop-able, and usable by Tim. Step 1 of the
Remix loop-station roadmap. It covers:

1. **Transport-as-clock foundation** — convert the stems from independent raw
   looping `AudioBufferSource`s to `Tone.Player`s synced to `Tone.Transport`, so the
   master clock is authoritative and the stems follow it sample-accurately. The
   current build runs the stems and the Transport as two separate clocks that drift
   apart after the first pass, making any loop untrustworthy.
2. **Bar-snapped loop region** — loop the whole mix over a window measured in bars
   (`Off / 4 / 8 / 16`), with forward/back nudge to step the window through the
   song. Also serves the "move to different sections" need without section metadata.
3. **Keyboard test mode** — drive the four stems directly from the keyboard so the
   screen is fully playable without a webcam and two batons.
4. **Tim accessibility** — the changes that make Remix usable for a player with
   limited motor control (the project's motivating user):
   - **Movement-range calibration** so Tim's actual reach maps to the full control
     range (the current build feeds raw tracker Y straight into the filter, so a
     narrow range can never reach full-open or the silent floor).
   - **Forgiving reach margins** so he needn't hit the exact extremes.
   - **Baton-touch → cycle stem**, a gross-motor replacement for the dwell-hold Tim
     can't reliably do.
   - **Head-nod → stutter**, reusing the existing `HeadBopDetector` (built precisely
     because Tim head-bops in time with music) as a gross-motor replacement for the
     fast-shake Tim can't do.
   - **Short default loop on song load** so Tim gets a graspable, repeating musical
     frame instead of the whole song flying past.

## Roadmap context (committed; each step its own spec → plan → build)

1. **Loop foundation + keyboard + Tim accessibility** ← this spec.
2. Sustained per-stem capture loops ("hold the groove").
3. Layer stack (stack/mute/clear multiple captured loops).
4. Record + overdub loop pedal.
5. Drum sequencer feeding the layer stack.

Steps 2–5 are out of scope here.

## Non-goals

- Per-stem capture loops, layer stack, overdub pedal, drum sequencer (roadmap 2–5).
- Named song sections (intro/verse/chorus) — `analysis.json` has none; bar-snapped
  nudge provides section-hopping without it.
- Camera/touch control of the loop window — loop controls are setup-style and live
  on the transport panel + keyboard, to protect the performer gesture budget.
- Removing the existing dwell-cycle / shake-stutter gestures — they stay for players
  who can do them. The Tim-accessible triggers are added alongside and the gesture
  triggers become individually toggleable, so a facilitator composes the scheme that
  fits each player.
- Changing the continuous Remix Core mechanics (Y `remixTaper`, latch, glide, the
  stutter overlay's audio behaviour) or the stem-tile / dwell-ring / cycle-flash
  feedback — all preserved; the clock beneath them changes and new trigger routes
  feed the same actions.

## Architecture: Transport-as-clock

Per stem, the chain changes from a raw looping source to a synced `Tone.Player`:

```
Tone.Player(stemBuffer).sync().start(0) → stemGain → stemFilter → masterGain → dest
```

- `loadStemBuffers` is unchanged — it still returns `Map<string, AudioBuffer>`; each
  buffer becomes `new Tone.Player(buffer)`. The Player connects into the existing raw
  `stemGain → stemFilter` graph via Tone→native connect (the bridge SongPresetEngine
  already uses).
- `.sync().start(0)` ties every stem to the Transport. Looping, seeking, pause/resume
  become Transport operations the stems follow sample-accurately. The beat dot and
  stutter read `Transport.seconds` — the same value that moves the audio. Drift gone.
- Lifecycle: `play()` → `Transport.start()`; `stop()` → `Transport.stop()` + reset to
  loop-window start; `togglePlay()` → pause/start by `Transport.state`; `dispose()`
  stops the Transport, disposes every `Tone.Player`, disconnects the stem/master nodes.
- **Preserved unchanged:** build-from-silence, the Y `remixTaper` filter+gain curve,
  latch, glide-takeover, duck-on-stutter. Only the source node type and clock
  ownership change.

**Files touched:**
- `src/remix/RemixEngine.ts` — Player conversion; loop region, focus, calibration, and
  trigger-enable APIs; head-nod detection; stutter-overlay clock re-home.
- `src/remix/loopRegion.ts` (new) — pure bar-snap math.
- `src/remix/remixKeyMap.ts` (new) — pure key→action mapper.
- `src/remix/batonCalibration.ts` (new) — pure range-map + reach-margin helper.
- `src/remix/BatonTouchDetector.ts` (new) — pure two-centroid proximity detector
  (rising-edge + cooldown, mirroring `ShakeDetector`).
- `src/remix/RemixBaton.ts` — apply calibration to incoming position; toggleable
  dwell; expose a centroid for touch detection.
- `src/ui/screens/RemixScreen.tsx` — loop controls, keyboard mode, range-calibration
  capture, baton-touch detection, FaceDetector for head-nod, timeline, focus UI.

`remixTaper`, `ShakeDetector`, `StutterScheduler`, `loadStemBuffers` keep their
current public contracts.

## Loop region: bar-snapped nudge

A Transport-backed loop window measured in bars, where a "bar" is the span between
consecutive `downbeats[]`.

- **Loop length:** `Off · 4 · 8 · 16` bars. `Off` → loop the whole song. N bars → loop
  the N-bar window from the current origin downbeat.
- **Nudge forward / back:** steps the origin downbeat by the window's own length,
  clamped to the song — the section-hopping mechanism.
- **Quantised takeover:** length/nudge changes take effect at the next downbeat so
  playback never lurches mid-bar; if the play position is outside the new window,
  playback jumps to its start on that downbeat (scheduled via `Transport.scheduleOnce`).
- **Short default loop on load:** when a song loads, default to an **8-bar** loop at
  the first downbeat (not `Off`) so Tim immediately has a graspable repeating frame.
  The facilitator can switch to `Off`/4/16.
- **No downbeats:** loop length forced to `Off`, controls disabled with a note (all
  four shipped songs have downbeats; defensive).

### Pure helper — `src/remix/loopRegion.ts`

```ts
export interface LoopRegion { startSec: number; endSec: number; }

/** N-bar window from downbeat index `originBar`, clamped to the song; null when
 *  no usable window (no downbeats, or lengthBars <= 0 = "Off"). */
export function computeLoopRegion(
  downbeats: readonly number[], originBar: number, lengthBars: number,
): LoopRegion | null;

/** Step the origin downbeat by dir*lengthBars, clamped to keep a full window in range. */
export function nudgeOrigin(
  originBar: number, dir: 1 | -1, lengthBars: number, barCount: number,
): number;
```

### Engine API (loop)

`setLoopLengthBars(n: 0|4|8|16)`, `nudgeLoop(dir: 1|-1)`,
`getLoopRegion(): { startSec; endSec; lengthBars; originBar } | null`.

## Movement-range calibration + forgiving margins

The current Remix passes raw ColorTracker position straight into the baton, so a
player whose reach covers only part of the frame can only reach part of the control
range. This makes the Y mechanic (including the silent floor = mute) physically
unreachable for Tim. Fix:

- **Per-baton range calibration.** Capture each baton's min/max X and Y over a short
  "move around" capture (a facilitator-triggered calibration step in RemixScreen,
  alongside the existing colour calibration). Store per `ColorRole`.
- **Apply + margin in a pure helper** `src/remix/batonCalibration.ts`:

```ts
export interface AxisRange { min: number; max: number; }

/** Map a raw 0–1 axis value through the player's calibrated [min,max] to 0–1,
 *  then apply a reach margin: the outer `margin` fraction at each end snaps to
 *  0 or 1, so the player needn't hit the exact extreme to reach full/none.
 *  Identity (raw passthrough) when range is uncalibrated/degenerate. */
export function applyAxisCalibration(raw: number, range: AxisRange | null, margin: number): number;
```

  Default `margin = 0.1` (outer 10% of the calibrated range snaps to the extreme).
  `RemixBaton` applies this to incoming `x`/`y` before computing `filterNorm`, so the
  filter taper, the silent floor, and (future) any X use all respect Tim's range. The
  margin is calibratable.

- RemixScreen reuses the existing per-colour calibration UI pattern and adds a
  range-capture affordance; calibration persists in component state for the session
  (profile persistence is out of scope for step 1).

## Tim-accessible triggers

Both hard-for-Tim gestures gain a gross-motor alternative. The existing gestures
remain for players who can use them; each trigger route is individually toggleable so
a facilitator composes a per-player scheme. All thresholds are calibratable
(CLAUDE.md principle 4).

### Baton-touch → cycle stem

- **Detection:** the two tracked baton centroids come within a calibratable distance
  `touchRadius` of each other. Fires once per touch (rising-edge + cooldown, like
  `ShakeDetector`) — re-arms only after the batons separate beyond `touchRadius`.
- **Action:** rebind the **primary baton** (the highest-priority present colour in
  `ROLE`/detection order) to its next stem in `STEM_CYCLE_ORDER`, latching the prior
  stem, and set `focusedStem` to it — i.e. exactly what a dwell-cycle does for that
  baton, just triggered by touch. The two-independent-baton model from Remix Core is
  otherwise unchanged (the other baton keeps shaping its own stem). This keeps "touch
  replaces dwell" a faithful 1:1 swap rather than a re-architecture.
- **Requires both batons present.** Pure detection from the two `{x,y,found}` inputs;
  lives in a small `BatonTouchDetector` (mirrors `ShakeDetector`'s rising-edge+cooldown
  shape) in `src/remix/`.
- **Dwell becomes toggleable:** `setDwellCycleEnabled(bool)` (default true). For Tim,
  the facilitator disables dwell (so his stillness never auto-cycles) and relies on
  baton-touch. `setBatonTouchEnabled(bool)` (default true) and
  `setTouchRadius(value)` expose the touch control.

### Head-nod → stutter

- **Detection:** reuse `HeadBopDetector` (from `src/mapping/nodes/HeadRhythmNode.ts`)
  — a deliberate down-then-up head reversal exceeding `minDownExcursion`, with a
  cooldown, rejecting tremor/drift. RemixEngine owns a `HeadBopDetector` and a
  `processFaceLandmarks(landmarks, timestampMs)` method (same shape SongPresetEngine
  already has).
- **Action:** fire a stutter burst on the **focused stem** (same one-shot burst the
  shake triggers).
- **Wiring:** RemixScreen adds a `FaceDetector` and a "Head nod → stutter" toggle,
  mirroring SongPresetScreen's head-bop wiring (start the detector when enabled, feed
  `result.face` + timestamp to the engine, dispose on unmount). Off by default
  (opt-in, like Song Preset's head-bop).
- **Calibratable:** `setHeadNodEnabled(bool)`, `setHeadNodSensitivity(minDownExcursion,
  cooldownMs)`. Shake-stutter stays available and gains `setShakeStutterEnabled(bool)`
  (default true) so the facilitator can turn it off for a player if needed.

### Focused stem

Head-nod and keyboard stutter need a target. A single `focusedStem: StemId` on the
engine:
- Keyboard `1–4` sets it explicitly.
- A baton cycle (dwell or touch) sets it to the newly-focused stem.
- Defaults to the first stem in `STEM_CYCLE_ORDER` on load.
The focused stem is shown in the UI (Section: Visual feedback).

## Stutter overlay under the new clock

Behaviourally identical (beat-synced one-bar slice ducking the main stem). Only its
clock references move: `computeStutterWindow` is fed `Transport.seconds`; the slice
offset is `Transport.seconds` directly (synced Players make that the true audio
position). Clamp the burst end to `min(startSec + burstDurSec, loopEnd)` so a burst
near the loop seam never bleeds past it. `StutterScheduler`'s API/maths unchanged.

## Keyboard test mode

A toggle (mirroring Song Preset's `keyboardMode`), active only while enabled and the
screen focused. Drives stems directly (not simulated batons).

| Key | Action |
|---|---|
| `1` `2` `3` `4` | Focus a stem (vocals / drums / bass / other) |
| `↑` / `↓` | Raise / lower the focused stem's filter (~0.1/press; bottom = silent) |
| `S` | Stutter the focused stem |
| `←` / `→` | Nudge the loop window back / forward |
| `[` / `]` | Loop length down / up (`Off → 4 → 8 → 16`) |
| `Space` | Play / pause transport |

- Pure mapper `src/remix/remixKeyMap.ts`:

```ts
export type RemixKeyAction =
  | { kind: 'focusStem'; index: 0|1|2|3 }
  | { kind: 'filter'; dir: 1|-1 }
  | { kind: 'stutter' }
  | { kind: 'nudgeLoop'; dir: 1|-1 }
  | { kind: 'loopLen'; dir: 1|-1 }
  | { kind: 'togglePlay' }
  | null;
export function keyToRemixAction(key: string): RemixKeyAction;
```

- Engine methods the handler and the UI buttons share:
  `setStemFilterNorm(stem, value)` (clamped, immediate non-gliding write),
  `triggerStutterFor(stem)` (public wrapper over the private stutter trigger),
  `setFocusedStem(stem)`, plus the loop methods and `togglePlay()`.
- Thin switch over `keyToRemixAction`; tracks the focused-stem index in state; scoped
  to the screen; avoids the app's global keys (`m`, debug); `preventDefault()` on the
  arrows/space it consumes. Independent of the camera/touch input mode.

## Visual feedback

Additions, consistent with the existing tiles/beat-dot and the never-colour-only rule:

- **Loop window bar:** a song timeline showing duration, the highlighted loop window,
  and the playhead, with a text label (`Loop: bars 9–16 (8)` / `Loop: off`).
- **Loop controls panel:** length selector (`Off/4/8/16`, `aria-pressed`), ◀/▶ nudge,
  play/pause — same engine methods as the keyboard.
- **Focused stem indicator:** the focused tile gets a ring + `▸`/text marker +
  `aria-label` "focused"; a key-hint legend shows while keyboard mode is on.
- **Trigger toggles panel (facilitator):** checkboxes for dwell-cycle, baton-touch,
  shake-stutter, head-nod, plus sliders for `touchRadius`, head-nod sensitivity, and
  reach margin — so a facilitator tunes the scheme to the player. Calibration capture
  button for movement range.
- **Baton-touch feedback:** when the batons are within `touchRadius`, a visible
  "linked" indicator between the two baton markers (+ a flash on the cycle it fires),
  so the touch trigger is visible.
- **Head-nod feedback:** a brief pulse on the focused tile when a nod fires (the
  stutter strobe already covers the audio-event visual).
- **Transport position text:** `m:ss / m:ss` beside the beat dot.

Remix Core stem-tile bars, STUTTER strobe, dwell ring, cycle flash, assignment badges
unchanged — now on a non-drifting clock.

## Testing

### Unit (pure, Vitest)

- `loopRegion.test.ts` — `computeLoopRegion` truth-table (4/8/16-bar windows, clamp at
  end, `Off`→null, no-downbeats→null); `nudgeOrigin` (step by length, clamp both ends).
- `remixKeyMap.test.ts` — every mapped key → correct action; unmapped → null.
- `batonCalibration.test.ts` — `applyAxisCalibration`: raw passthrough when
  uncalibrated; calibrated range maps min→0 / max→1; reach margin snaps the outer
  fraction to the extreme; clamps out-of-range input.
- `BatonTouchDetector.test.ts` — fires once when the two centroids cross within
  `touchRadius`; re-arms only after separation; respects cooldown; requires both
  present.

### Engine integration (mocked Tone + a stub HeadBopDetector/landmarks)

`RemixEngine.test.ts` grows: `loadSong` creates a synced `Tone.Player` per stem;
`setLoopLengthBars`/`nudgeLoop` set `Transport.loop/loopStart/loopEnd` from downbeats;
default 8-bar loop applied on load; `setStemFilterNorm` writes the right stem;
`triggerStutterFor`/`togglePlay`/`setFocusedStem` behave; `processFaceLandmarks` firing
a nod calls stutter on the focused stem; trigger-enable toggles gate their actions;
`dispose` disposes Players. Existing build-from-silence / latch / glide / stutter-duck
/ burst-restore tests stay green. `RemixBaton.test.ts` grows: calibration applied to
incoming position; dwell-disable suppresses dwell cycling; the existing cycle/latch/Y
tests stay green.

### Manual (documented)

Per shipped song, in keyboard mode: loops stay tight across many passes (drift fix),
nudge hops sections on the downbeat, default 8-bar loop on load, stutter lands/ducks,
play/pause works. Then with camera input as Tim would use it: calibrate a narrow
range and confirm full-open + silent-floor are reachable; disable dwell, enable
baton-touch and head-nod; confirm bringing the batons together cycles the stem and a
head nod stutters the focused stem; confirm tremor/drift don't false-fire at the
calibrated sensitivities; Remix Core tiles/dwell/flash unregressed.

## Risks and open questions

- **Tone.Player ↔ raw-node bridge** — proven in SongPresetEngine; manual pass must
  confirm no clicks at the Player→gain boundary.
- **Quantised-jump feel** — next-downbeat jump could feel laggy at slow tempo; an
  immediate-jump variant is a one-line change if needed.
- **Baton-touch false-fires** — two stems' batons that happen to pass near each other
  could cycle unintentionally. Mitigation: `touchRadius` small + rising-edge + cooldown
  + visible "linked" indicator; tune in session.
- **Head-nod with the camera also colour-tracking** — the FaceDetector runs alongside
  the ColorTracker (same pattern as Song Preset, which does both); manual pass must
  confirm acceptable performance on the target hardware.
- **Focused-stem ambiguity with two live batons** — head-nod stutters one stem (the
  focused one); if a facilitator expects it to hit a different stem, the focus rule
  (last-cycled / keyboard-set) must be visible — hence the focused-stem indicator.
- **Single-focus vs two-baton for Tim** — baton-touch rebinds the primary baton
  (1:1 dwell swap, two-baton model intact). It's possible Tim is better served by a
  simpler single-focus model (one stem at a time, touch advances it, either baton
  shapes it). That's a larger interaction change; this first version keeps the
  faithful swap and we validate the model with Tim in session, adjusting in a follow-up
  if single-focus proves better.
- **Scope** — this step grew to include the Tim-accessible triggers by request. It is
  still one cohesive "make Remix playable + accessible" step, but the plan should
  decompose it into many small tasks (each pure helper and each engine method its own
  TDD unit) to keep it manageable.
