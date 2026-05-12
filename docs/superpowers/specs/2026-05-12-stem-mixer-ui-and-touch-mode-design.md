# Stem Mixer UI Clarity + Touch Mode Input

**Status:** design approved, ready for implementation plan
**Date:** 2026-05-12

## Problem

Two related issues in Song Preset mode:

**1. The stem mixer is opaque.** The Blue object is the most consequential voice — it controls what the user actually hears from the recording — but it has the weakest feedback in the UI:
- No callout on the video when blue is active (red/green/yellow/orange all get one).
- The only stem-level readout is a tiny monospace block in the right panel labelled "Status", showing `vocals: 100%` / `drums: 30%` etc.
- For "mix-only" songs (3 of 4 in the current library, all the Blues Brothers tracks), those four numbers always move together because all four stem slots point at the same audio file. The display is technically correct but misleading.
- The X-axis zone (left / center / right blend) and the Y-axis filter brightness have no visualization on the video. Users can't tell which zone they're in or whether the filter is doing anything.
- Per-song zone semantics aren't surfaced. "Left zone" means "Vocals only" for Can't Help; "Silent" for the mix-only songs. The UI shows neither.

**2. There is no non-camera input option.** The current input is webcam color tracking, which assumes a setup with a camera pointing at colored objects in a space. That excludes:
- Users with iPads (the natural form factor for this app — touchscreen, portable, common in accessible-music settings) where the camera doesn't point at the user.
- Users for whom moving colored objects in 3D space is harder than touching a screen.
- Demo / facilitator scenarios where wiring up the camera is overhead.

A `keyboardMode` debug toggle exists but is a tester's tool — it forces a single mouse position to be shared across all "active" colors. It's not a real input model.

## Goals

1. Make it obvious, at a glance, **what the stem mixer is currently doing**: which zone is active, what stems are at what level, whether the filter is open or closed.
2. Match the visual language of the other voices so blue stops being the odd one out.
3. Adapt the display honestly to the per-song stem reality (true-stem vs mix-only).
4. Add a **touch input mode** for the stem mixer, suitable for iPad use, that respects the project's accessibility principles (tolerance over precision, single-finger interaction, no fine motor demand).

## Non-goals

- **No touch control of the accompaniment voices** (red/green/yellow/orange). Touch mode is stem-mixer-only — a focused "mix the song with your finger" experience. The four generated voices and their presets stay webcam-only.
- **No multitouch mixing console.** Vertical multitouch faders were considered and rejected — many target users (cerebral palsy, ABI) have limited fine-motor control and can't reliably coordinate multiple fingers.
- **No persistent input-mode setting.** Mode is chosen per session in the Song Preset screen; not stored in a global settings system.
- **No portrait-orientation optimisation.** Portrait must not break, but landscape is the primary iPad orientation we target.
- **No calibration in touch mode.** The screen is the range; calibration is meaningless.
- **No new music data.** No re-analyzing songs, no new chord progressions. Only the per-zone label (a short string per song) is added.

## Approach — why this shape

Two alternatives were considered and rejected:

- **Approach A (chosen):** Persistent stem-mixer feedback strip + a small blue puck callout + a touch mode that mirrors the blue object's X/Y model on a single big pad.
- **Approach B (rejected):** Full per-stem multitouch mixing console for touch mode. Closer to ThumbJam's "each finger plays" idiom, but contradicts the project's accessibility principle that no user-facing interaction should require fine motor coordination. Also asymmetric with webcam mode (where the blue object encodes mixing as zones, not per-stem levels).
- **Approach C (rejected):** Touch mode that mirrors all 5 voices, not just stems. The user clarified the intended scope is mixing the stems; the four generated accompaniment voices are not a touch-mode concern.

## Architecture changes

### Data model: per-zone labels in `StemMixerMapping`

The strip needs to show the *name* of the current zone ("Vocals only" / "Mid mix" / "Full mix" / "Volume"), and the names are per-song.

Extend `StemMixerMapping` in `src/songs/songLibrary.ts`:

```ts
export interface StemMixerMapping {
  label: string;                         // existing — overall mixer label
  leftZone: ZoneStemLevels;
  centerZone: ZoneStemLevels;
  rightZone: ZoneStemLevels;
  zoneLabels?: {                         // NEW — optional, sensible defaults if absent
    left: string;
    center: string;
    right: string;
  };
}
```

Default zone labels when `zoneLabels` is absent:
- Mix-only songs (detected by `label === 'Volume'` OR by stem-paths-all-equal): `'Silent'` / `'Half'` / `'Full'`.
- True-stem songs: `'Left zone'` / `'Mid zone'` / `'Right zone'` (generic — encourages explicit labelling).

Populate `zoneLabels` for the four library songs:
- *Can't Help Falling*: `'Vocals only'` / `'Vocals + light band'` / `'Full mix'`.
- The three Blues Brothers tracks (mix-only): `'Silent'` / `'Half volume'` / `'Full volume'`.

### Component split: extract a `StemMixerStrip` component

`SongPresetScreen.tsx` is already ~1450 lines and conflates camera, engine, transport, calibration, and rendering. The stem-mixer feedback is non-trivial (it adapts to song type, animates four bars in real time, listens to engine status, and is reused in touch mode). Pull it into its own component.

Path: `src/ui/screens/songPreset/StemMixerStrip.tsx`

```ts
interface StemMixerStripProps {
  song: SongConfig | null;
  status: SongPresetStatus | null;
  active: boolean;        // is blue currently driving the mixer (or touch mode equivalent)
}
```

Responsibilities:
- Render the zone label, big and centered.
- Render either four labelled bars (true-stem) or one big bar (mix-only), driven by `status.stemVolumes`.
- Render a vertical filter-brightness meter with "Bright"/"Warm" labels, driven by `status.filterHz` mapped to 0–1 via the existing `FILTER_MIN_HZ` / `FILTER_MAX_HZ`.
- Dim the whole strip when `active === false` (continuous-backing showing through).

Detecting mix-only inside the component: compare the four paths in `song.stems`. If all four are equal, it's mix-only — that's the existing convention from `mixOnlyStems()`. Avoids adding a `kind` field to `SongConfig`.

### Blue puck callout (webcam mode)

Today `drawMarker()` in `SongPresetScreen.tsx` explicitly skips the callout for blue: `if (isActive && role.id !== 'blue')`. Remove that exclusion. Add a `getRoleStateLines` branch for blue returning two lines:
- `Zone: <zoneLabel>` — from the new `zoneLabels` field via the resolved labels.
- `Filter: <pct>%` — from `status.filterHz` normalised against `FILTER_MIN_HZ..FILTER_MAX_HZ`.

This is the small in-the-moment confirmation that lives at the puck. The strip is the steady-state display.

### Right panel: remove the redundant stem readout

The "Status" section in the right panel currently shows per-stem percentages. Once the strip is in, these duplicate it (and they're harder to read). Drop the per-stem lines from the Status block; keep the non-stem lines (current chord, accomp volume, mixer zone label, distance).

### Mode picker

Add a small `InputModeContext` only inside `SongPresetScreen` — local React state, not Zustand, not global settings.

Top of the screen, before song selection: a two-button choice — "Webcam (5 instruments)" / "Touch (stem mixer)". After selecting, a small toggle persists in the header for the rest of the session.

Camera lifecycle: only initialise the camera when mode is `'webcam'`. In `'touch'` mode the camera is never started, no permissions are requested.

### Touch mode: `StemMixerTouchPad` component

Path: `src/ui/screens/songPreset/StemMixerTouchPad.tsx`

```ts
interface StemMixerTouchPadProps {
  song: SongConfig;
  isLoaded: boolean;
  // engine handle for sending positions, or a callback:
  onPosition: (pos: { x: number; y: number; held: boolean }) => void;
  onReset: () => void;
}
```

Behavior:
- Renders a large pad filling the available area. Single `<div>` with pointer events; uses `pointerdown`/`pointermove`/`pointerup` (covers touch + mouse + pen via the unified Pointer Events API).
- Draws axis labels onto the pad surface (resolved zone labels along X, "Bright"/"Warm" along Y).
- Renders a single puck at the current `(x, y)` position. Coordinate convention matches the existing engine: x=0 left → x=1 right, y=0 top → y=1 bottom.
- Initial state on mount: puck at `(0.5, 0.0)` (center X, top Y = filter open), `held = false`. With `held = false` the mixer falls back to "continuous backing" — same default as webcam mode when blue is invisible.
- **Interaction (Q7 = C, drag-while-held, persist-on-lift):**
  - On `pointerdown` inside the pad: capture the pointer, set `held = true`, update position to pointer location. From this moment on, the engine sees blue as "found" at the puck position.
  - On `pointermove` while pointer is down: update position continuously, `held` stays true.
  - On `pointerup` / `pointercancel`: release pointer capture, **`held` stays true**, puck stays at last position. The mix freezes at that position (the user's whole reason for picking option C).
  - The puck's `held` flag is what the engine sees as "blue found" — it stays true from the first touch until **Reset** is pressed.
- Reset button: returns the puck to `(0.5, 0.0)` **and** sets `held = false`. The mixer reverts to the default fallback (continuous backing if enabled, silence if not), matching the "no touch yet" initial state.
- Transport row beneath the pad: Play / Restart / Mute / Back, each with `min-width: 64px; min-height: 44px` (Apple HIG touch target floor).
- Strip from Part 1 sits above the pad.

### Engine wiring

In touch mode the screen feeds `engine.setAllPositions()` once per frame, with:
- `blue`: the touch pad's `{x, y}` and `found = padState.held`.
- All four others: `{ x: 0, y: 0, found: false }` — no accompaniment.

The engine doesn't need to know which input mode is active. Same draw loop, just a different source of `positions`.

### `SongPresetScreen` decomposition

This refactor is targeted, not "rewrite the screen." Three extractions:

1. `StemMixerStrip` — new component, both modes.
2. `StemMixerTouchPad` — new component, touch mode only.
3. `useInputMode()` — tiny hook with `mode` state + setter, lives in the screen file.

The existing camera/colortracker init lifts unchanged behind an `if (mode === 'webcam')` guard. The draw loop branches on `mode`. The right-panel sections (volume sliders, continuous backing, loop controls, etc.) stay as they are — they're useful in both modes.

## Data flow

```
                      ┌──────────────────────────┐
                      │  SongPresetScreen         │
                      │  useInputMode() → 'touch' │
                      └──────────────┬───────────┘
                                     │
                  ┌──────────────────┼─────────────────┐
                  │                  │                 │
        ┌─────────▼─────────┐  ┌─────▼──────┐    ┌────▼────────┐
        │ StemMixerTouchPad │  │ Strip      │    │ engine.set  │
        │  (pointer events) │  │ (read-only │    │ AllPositions│
        │                   │  │  status)   │    │ once/frame  │
        └─────────┬─────────┘  └─────▲──────┘    └─────────────┘
                  │                  │
                  │ setBluePos(x,y,h)│
                  └──────────────────┘
```

Webcam mode is identical to today, plus `Strip` is fed the same `status` it would have read from the engine anyway.

## Files touched

| File | Change |
|---|---|
| `src/songs/songLibrary.ts` | Add `zoneLabels?` to `StemMixerMapping`; populate for all 4 library songs. |
| `src/ui/screens/SongPresetScreen.tsx` | Mode picker, conditional camera init, render-tree split into webcam/touch branches, remove per-stem lines from right-panel Status, remove `role.id !== 'blue'` exclusion in `drawMarker`, add blue branch to `getRoleStateLines`, mount `StemMixerStrip` above the video/pad. |
| `src/ui/screens/songPreset/StemMixerStrip.tsx` | New. |
| `src/ui/screens/songPreset/StemMixerTouchPad.tsx` | New. |
| `src/songs/SongPresetEngine.ts` | No change expected — the strip reads existing `SongPresetStatus` fields. Confirm during implementation. |
| `src/songs/voices/StemMixerVoice.ts` | No change. |
| `src/__tests__/...` | New tests for `StemMixerStrip` (mix-only vs true-stem layouts, active/inactive dimming) and `StemMixerTouchPad` (pointer down/move/up sequence, persist-on-lift, reset). |

## Testing

- **`StemMixerStrip` unit tests** (Vitest + RTL):
  - Renders 4 bars for a song with distinct stem paths.
  - Renders 1 "Volume" bar for a song where all stem paths are identical.
  - Bar widths reflect `status.stemVolumes`.
  - Zone label shows resolved label (uses `zoneLabels` when present, falls back when absent).
  - Strip is visually dimmed when `active === false`.
- **`StemMixerTouchPad` unit tests** (Vitest + RTL with `@testing-library/user-event` pointer support):
  - Initial mount: `onPosition` (if called) reports `held=false` at `(0.5, 0.0)`.
  - Pointer down at (x, y) → `onPosition` called with `held=true` and matching normalised coords.
  - Pointer move while held → continuous `onPosition` calls, all with `held=true`.
  - Pointer up → puck stays at last position, **`held` remains true** (persist-on-lift). Subsequent `onPosition` reports the same position with `held=true`.
  - Reset button → `onReset` called; subsequent state reports `(0.5, 0.0)` with `held=false`.
- **No new tests for the camera path.** Behavior under webcam mode is unchanged except for the strip mount and the blue callout — both covered by component tests.
- **Manual verification on an iPad** before claiming complete: load the screen in touch mode, mix a song with one finger, verify the strip animates, verify the puck persists on lift, verify Reset works, verify accompaniment voices stay silent.

## Open questions resolved during brainstorming

- *What's unclear about the stem mixer?* → All of: missing zone label, missing per-stem levels, missing filter feedback. Whole feedback layer is missing for blue.
- *Where does the feedback live?* → Persistent strip on the video (Q2 = B), not a callout-only or panel-only solution.
- *How does it adapt to mix-only songs?* → Auto-detect, show 1 big "Volume" bar instead of 4 (Q3 = A).
- *Touch vs webcam relationship?* → Mode picker at start; touch replaces webcam, doesn't supplement (Q4 = A).
- *Touch is for stems or all voices?* → Stems only; accompaniment voices stay webcam-only (Q5-redo = A).
- *Touch interaction model?* → Single big X/Y pad, one finger — multitouch faders rejected as inaccessible.
- *Touch persistence?* → Drag-while-held, persist-on-lift, separate Reset button (Q7 = C).

## What this does NOT depend on

- The existing song-preset-sounds work (different feature, different branch).
- Any change to `MappingEngine` / `MappingNode` architecture.
- Any new Tone.js or MediaPipe behaviour — purely UI + data-model + input plumbing.
