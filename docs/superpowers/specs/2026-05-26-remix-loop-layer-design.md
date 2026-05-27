# Remix loop-layer design

**Date:** 2026-05-26
**Status:** Approved (design)
**Roadmap step:** 4 of the Remix Added-Sound Library ("tempo-synced loop layers")

## Goal

Add a tempo-synced drum-**loop** layer to the Remix screen. A dedicated loop
baton brings a backing drum loop in and out under the song; the loop is
pitch-preservingly time-stretched to the song's BPM so it stays in time. The
baton's X axis picks among a small curated set of loops, Y sets the loop's
volume, and the baton's presence brings the layer in/out.

This is the fourth `RemixLayer` (after `percussion`), mixing into the engine's
`layersBus` alongside the four stems. It uses the LANDR drum loops already
staged locally (git-ignored, see `public/samples/drums/SAMPLE_SOURCES.md`).

## Locked decisions

- **Eligibility:** only loops whose **filename contains a parseable BPM** are
  usable (regex `/(\d{2,3})\s?bpm/i`, matching `124bpm`, `130 BPM`, etc.).
  Loops with no parseable BPM are excluded — we cannot time-stretch them
  correctly without a known source tempo.
- **Set size:** a curated **3–4 loops**, with **one playing at a time**.
  Stacking multiple loops is explicitly deferred to the separate "layer-stack"
  roadmap step.
- **Control mapping:** dedicated loop-baton colour.
  - **Presence** → layer enabled/disabled (brings the loop in/out).
  - **X** (calibrated 0–1) → one of N equal zones → selects which loop is active.
  - **Y** (calibrated 0–1) → loop volume.
- **Tempo match:** pitch-preserving time-stretch via `Tone.GrainPlayer`,
  `playbackRate = songBpm / loopBpm`.

## Approach (chosen: A — per-loop GrainPlayer, gain-gated)

Each curated loop gets its own `Tone.GrainPlayer`, each stretched to song BPM
and looping its whole-bar buffer. All players `sync().start(0)` so they run **in
phase** with each other and with the stems (which already start at transport 0).
Selecting a loop raises that one's sub-gain and drops the others, with a short
(~30 ms) crossfade. Only the active loop is audible.

**Why over the alternatives:**

- **B — single GrainPlayer, swap buffer + rate on change.** One voice, least
  CPU, but re-aligning phase after a mid-transport buffer swap needs offset math
  and tends to glitch on *every* X-zone change. Since Tim's hand will drift
  across zone boundaries, a per-switch glitch is unacceptable. Rejected.
- **C — offline pre-stretch to song BPM, then plain looping Players.** Web Audio
  has no built-in pitch-preserving stretch, so we'd implement granular/WSOLA
  offline ourselves. Far more effort for marginal gain. Rejected.

Approach A's cost is 3–4 short grain players decoding and running at once, which
is fine at this scale, and buys guaranteed phase-lock and instant glitch-free
switching.

## Components

### 1. Loop manifest — `public/samples/drums/loops/loops.json`

A small JSON listing the curated 3–4 chosen loop files plus a display name:

```json
[
  { "file": "drumloop_124bpm.wav", "name": "Boom Bap" },
  { "file": "break_90bpm.wav",     "name": "Half-Time Break" },
  { "file": "houseloop_126bpm.wav","name": "Four-on-the-Floor" }
]
```

- BPM is **not** stored here — it is parsed from each `file` name at load.
- An entry whose filename has no parseable BPM is dropped with a
  `console.warn`. If fewer than one loop remains, the layer is empty and
  no-ops.
- Loop audio binaries stay **git-ignored** (existing `*.wav` rule). A
  `loops/.gitkeep` and a `SAMPLE_SOURCES.md` note document the folder, the
  manifest, and the same redistribution/licensing caveat as the one-shots.
- The manifest itself (`loops.json`) and `.gitkeep` are committed; the WAVs are
  not.

### 2. `src/remix/layers/LoopLayer.ts`

Implements `RemixLayer` (kind `'loop'`) plus an optional `SyncedRemixLayer`
extension for transport alignment.

```ts
export interface SyncedRemixLayer extends RemixLayer {
  syncStart(): void;
  syncStop(): void;
}
export function isSyncedLayer(l: RemixLayer): l is SyncedRemixLayer;
```

Construction: `new LoopLayer(ctx, loops: LoopDef[], songBpm)` where
`LoopDef = { file: string; name: string; bpm: number }` (bpm already parsed).

Audio graph: one `GrainPlayer` per loop → its own sub-`GainNode` → the layer
`GainNode` → `connect(dest)` into `layersBus`. Each player:

- `url` = `samples/drums/loops/<file>`, `loop = true`.
- `playbackRate = songBpm / bpm`, pitch preserved (GrainPlayer granular).
- counts toward `isReady()` via `onload` (same pattern as `DrumKit`).

Interface methods:

- `setEnabled(on)` / `isEnabled()` — layer gain 0 when disabled (opt-in,
  matches `PercussionLayer`).
- `setVolume(v)` (0–1, clamped) — layer gain when enabled.
- `isReady()` — true once all players have loaded.
- `dispose()` — dispose players, disconnect gains.

Loop-specific methods:

- `selectLoop(i)` — active loop's sub-gain → 1, others → 0, with ~30 ms
  crossfade (`setTargetAtTime`). In phase because all players started at 0.
- `getActiveLoopIndex()`, `getLoopCount()`, `getLoopName(i)` — for UI.

Synced methods:

- `syncStart()` — `player.unsync().sync().start(0)` for every player (mirrors
  the stem start logic; idempotent across play cycles).
- `syncStop()` — `player.unsync().stop()` for every player.

Whole-bar assumption: a curated loop is expected to be a whole number of bars,
so stretching to song BPM keeps it bar-aligned and it loops in phase with the
downbeats. Documented as a curation requirement.

### 3. `src/remix/RemixLoopBaton.ts`

A small, pure-ish per-baton mapper (separate from the stem-cycle-oriented
`RemixBaton`). Takes the loop baton's centroid + axis calibration; outputs:

```ts
interface RemixLoopBatonOutput {
  present: boolean;
  loopIndex: number; // 0..count-1, last value latched when absent
  volume: number;    // 0..1
}
```

- Uses `applyAxisCalibration` (from `batonCalibration.ts`) for X and Y, with the
  same reach margins as the stem batons.
- X (calibrated 0–1) → one of N equal zones → `loopIndex`. **Hysteresis** at
  zone boundaries: a zone change requires crossing past the boundary by a small
  margin, so a hand drifting on a boundary does not flicker between two loops.
- Y (calibrated 0–1) → `volume`.
- Absent (baton not seen) → `present: false`; `loopIndex`/`volume` latch.

### 4. Engine wiring — `src/remix/RemixEngine.ts`

- `loadSong`: after building the percussion layer, build a `LoopLayer` from the
  manifest (fetch `loops.json`, parse BPM per file, drop no-BPM entries),
  connect to `layersBus`, `setEnabled(false)` (opt-in). Store under id `'loop'`.
  If the manifest is missing or empty, skip the layer (no-op, no error).
- `play()` / `stop()`: in addition to syncing the stem players, iterate layers
  and call `syncStart()` / `syncStop()` on any layer where `isSyncedLayer(l)`.
  Fresh-start only (same resume guard as stems — don't re-sync on pause/resume).
- Pass-throughs: `selectLoop(i)`, `getLoopInfo()` → `{ count, activeIndex,
  names }`.
- `applyLoopBaton(out: RemixLoopBatonOutput)`:
  `setLayerEnabled('loop', out.present)`; if present, `selectLoop(out.loopIndex)`
  and `setLayerVolume('loop', out.volume)`.

### 5. UI / facilitator — `src/ui/screens/RemixScreen.tsx`

- Assign the loop-baton colour (a colour not already used by the four stem
  batons / percussion); feed its centroid to a `RemixLoopBaton`; call
  `engine.applyLoopBaton(...)` each frame.
- Facilitator trigger panel: a loop-layer toggle (enable/disable) and a readout
  of the active loop name + count.
- Keyboard test mode: a key to cycle the active loop (e.g. `L` → next loop,
  wrapping) added to `remixKeyMap.ts`; reuse the existing volume affordance for
  loop volume when the loop layer is focused.
- **Visual feedback (deaf/HoH requirement):** show the active loop's name and a
  presence indicator (loop in/out) on screen, consistent with the existing
  per-stem and percussion visual cues.
- Refs to avoid stale closures for loop enabled-state/volume, mirroring the
  existing `percussionEnabledRef` / `percussionVolumeRef` pattern;
  re-apply loop layer state after `loadSong` on song change.

### 6. Testing — `src/__tests__/`

Vitest with the existing Tone/MediaPipe mocks:

- **Manifest/BPM parse:** parses `124bpm`, `130 BPM`; **rejects** files with no
  BPM; empty/missing manifest → empty layer that no-ops.
- **playbackRate:** `songBpm / loopBpm` computed per loop.
- **selectLoop:** gates exactly one sub-gain on (others 0); switching moves the
  gate.
- **Hysteresis:** an X value drifting at a zone boundary does not flip
  `loopIndex` back and forth.
- **syncStart:** starts all players at transport 0; resume does not re-sync.
- **Disabled = silent** (layer gain 0); **no-op until `isReady()`**.
- **RemixLoopBaton:** absent → `present:false` + latch; X→zone mapping; Y→volume
  with calibration.

## Accessibility notes

- Wide X zones (3–4 only) + boundary hysteresis keep loop selection reachable
  for limited, drifting horizontal motion — the same concern that drove the
  movement-range calibration work. (X selection was the user's explicit choice
  despite needing some horizontal precision; hysteresis is the mitigation.)
- Presence-based in/out is a gross-motor trigger (no dwell-hold, no fast-shake),
  consistent with Tim's constraints.
- All loop state changes have on-screen visual feedback.

## Risks

- **Transient smear under large stretch.** `GrainPlayer` granular stretch smears
  drum transients when `playbackRate` is far from 1. Mitigation: curate loops
  whose BPM is close to the song's tempo; document this as a curation
  requirement in `SAMPLE_SOURCES.md`.
- **CPU.** 3–4 grain players run simultaneously. Acceptable at this scale; if it
  ever matters, fall back to approach B for the inactive loops.
- **Licensing/deployment.** Loop audio is git-ignored and local-only; a deployed
  build needs a redistributable (CC0) loop set, same caveat as the one-shots.

## Out of scope (deferred)

- Stacking multiple loops simultaneously (layer-stack roadmap step).
- Loops without an encoded BPM.
- Per-loop trim/quantise editing.
