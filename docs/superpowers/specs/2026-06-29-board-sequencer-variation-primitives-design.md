# Board Sequencer — Variation Primitives (position-offset "sometimes" notes)

- **Date:** 2026-06-29
- **Status:** Approved design, ready for implementation plan
- **Branch:** `feat/board-sequencer-mode`
- **Roadmap slice:** 1 of 4 (see "Roadmap context" below)

## Problem

The board sequencer's repeated pattern is **quite short** — the loop length equals the
number of columns (default 8), so the playhead completes one left-to-right sweep
(~5 s at 90 BPM) and immediately repeats. It quickly sounds like a tape loop.

The engine already has two *length* mechanisms — **pages** (pattern chaining,
master loop = `numPages × cols`) and **polyrhythm** (per-role loop lengths) — but
both are screen-driven (capture buttons, sliders) and not tangible: you cannot see
or touch the rest of the pattern with the coloured counters. The goal of this work
is to make the pattern feel **longer and less repetitive using only the physical
coloured counters on the board**, keeping the whole evolving pattern visible.

## Roadmap context

Lengthening/enriching the loop was decomposed into four slices, each its own
spec → plan → build cycle. This document covers **slice 1 only**.

1. **Variation primitives** (this spec) — per-piece "sometimes" notes via position.
2. **More time** — spatial halves (bar 1 / bar 2) and/or ping-pong playhead.
3. **Tangible recall** — "scene" counters to capture / bring back / mute patterns.
4. **Generative AI (optional)** — an opt-in, phrase-level variation *assistant* that
   proposes a bar the player can accept or reject. Deferred because (a) it has
   nowhere to put its output until slices 1–3 exist, and (b) autonomous note
   injection risks the project's #1 principle (musical agency) and cannot live in
   the <20 ms gesture-to-sound path. Recorded here so the earlier slices leave room
   for it.

## Goal of this slice

Let a player mark an individual instrument piece as **"play me every other time
round"** by **shoving it to the edge of its square** — a gross-motor push, not fine
placement. A centred piece plays every pass; an edge-shoved piece plays every other
pass. This turns an 8-step loop into a breathing 16-step A/B phrase from the same
pieces, and it reuses (rather than fights) the recently-loosened off-centre piece
detection — off-centre now *means something* instead of being a detection failure.

### Why position-offset (and not a "variation colour")

A piece's colour already **is** its instrument/role. A standalone "variation colour"
piece would have no sound to make and no way to know which instrument it varies.
Position-offset avoids this entirely: a "sometimes" red-melody piece is *still a
red-melody piece* (instrument known from its colour) with an extra attribute
(off-centre) riding on top. No colour channel is consumed.

### Design decisions locked during brainstorming

- **Mechanism:** position-offset only (per-piece). Not a variation colour, not a
  modifier lane. (Those were considered and rejected — colour clashes with
  instrument; lane is precision-free but only per-column and costs a row of pitch.)
- **Feel:** deterministic **every-other-pass** (binary on/off), not probabilistic and
  not multi-band. Predictable; strongest musical agency; easiest to visualise.
- **Phase:** **global parity** — all conditional pieces fire on the same alternating
  laps (a coherent A/B feel), not per-piece phase. A freshly-shoved piece waits up to
  one lap (~5 s) to be *heard*, but is *seen* (its ring) instantly.

## Experience

- **The action.** Place an instrument piece normally. To make it conditional, shove it
  firmly toward any edge or corner of its square. Centre = every pass; edge = every
  other pass.
- **What you hear.** The board alternates two laps of the playhead:
  - **Lap A ("full"):** every centred piece plays.
  - **Lap B ("variation"):** centred pieces **plus** the edge-shoved ones.
  - → an 8-step loop becomes a 16-step A-then-B phrase that breathes.
- **Predictable A/B.** All conditional pieces share the B laps, so the result is a
  clean alternation, not a random scatter, and the variation lap is visible coming.

## Visual feedback (principle #5 — every audio event must be visible)

- **Conditional pieces look different:** a **dashed / double ring** over the cell,
  versus the solid fill of an every-pass piece. Appears the instant the piece reads as
  edge-shoved (updates live as you nudge), giving immediate confirmation.
- **The variation lap is announced:** a small **A / B indicator** (and/or a tint on the
  playhead column) shows the current lap. On the B lap the dashed-ring pieces **light
  up** as they fire; on the A lap they sit **dimmed**.

## Calibration & accessibility (principles #1 tolerance, #4 calibratable)

- **Generous dead-zone by default.** A piece counts as conditional only once its
  centroid sits in the **outer band** of the cell. Ordinary imprecision stays "every
  pass" — imprecision is not punished.
- **"Variation sensitivity" slider** (beside "Min fill"): sets how big a shove is
  needed. Shaky aim → bigger deliberate shove required; precise player → hair-trigger.
- **"Variation" master toggle:** a facilitator can switch the whole behaviour off, so
  off-centre means nothing again and pieces just play every pass (today's behaviour).
  **Off by default** — nothing changes for existing users until they opt in.
- Both settings persist in the board config.

## Architecture

No new modules. One new field is threaded through the existing pipeline and one new
gate is added in the engine.

```
video → BoardReader → CellReading[] → BoardSequencerMode → ActiveCell[] → Engine + Overlay
                         (+offset)        (+conditional)                   (lap gate / rings)
```

### 1. Offset measurement — `BoardReader` ([src/tracking/BoardReader.ts](../../../src/tracking/BoardReader.ts))

`sampleRegion` already returns `centroid` (mean unit-square position of the dominant
colour's matched pixels). In `BoardReader.read`, for each cell compute a normalised
**box (Chebyshev) offset** of the centroid from the cell centre:

```
cx = (col + 0.5) / cols          cy = (row + 0.5) / rows      // cell centre
hx = 0.5 / cols                  hy = 0.5 / rows              // cell half-extent
offset = clamp( max( |gx - cx| / hx, |gy - cy| / hy ), 0, 1 ) // 0 = centre, 1 = edge
```

`max(...)` (not hypot) so a shove toward *any* edge or corner counts equally. Add
`offset: number | null` to `CellReading` (null when there is no centroid / cell empty).

**Geometry note for tuning (important):** `centroid` is the *mean* of matched pixels
inside the sampled region, which is itself inset (`INSET = 0.9`, so pixels are sampled
over 5 %–95 % of the cell). Consequences the implementation/plan must account for:
- The reachable maximum offset is bounded by `INSET` (~0.9), not 1.0.
- Because it is a *mean*, a piece must be **mostly** in the outer part of the cell to
  push the centroid far — e.g. a piece occupying roughly the outer ~30 % of the cell
  yields offset ≈ 0.7. So the threshold is genuinely a "big shove," as intended.
- Exact numbers depend on piece-size-vs-cell-size and must be **tuned on real
  hardware during verification**. Treat the defaults below as starting points.

### 2. Conditional flag — `BoardSequencerMode` ([src/tracking/BoardSequencerMode.ts](../../../src/tracking/BoardSequencerMode.ts))

- Extend `BoardSettleConfig` with `variationEnabled: boolean` and
  `variationOffsetThreshold: number`.
- Extend `CellState` with `conditional: boolean`.
- Each occupied frame, update `st.conditional =
  variationEnabled && r.offset !== null && r.offset >= variationOffsetThreshold`.
  Updating every frame (not only at settle) means nudging an already-settled piece to
  the edge flips it live — the ring responds immediately.
- Add `conditional: boolean` to `ActiveCell`; populate it from `st.conditional` when
  emitting settled cells.

### 3. Every-other-pass gate — `BoardSequencerEngine` ([src/songs/BoardSequencerEngine.ts](../../../src/songs/BoardSequencerEngine.ts))

- In `fireStep(beat, …)`, the lap index is `lap = Math.floor(beat / cols)`. A cell whose
  `conditional` is true plays **only when `lap % 2 === VARIATION_PARITY`** (parity `1`,
  i.e. the B lap). Non-conditional cells are unaffected. This sits alongside the
  existing per-role polyrhythm `roleStep` column check (the conditional gate is an
  *additional* skip, applied after the column match).
- For the overlay A/B indicator, add `isVariationLap(): boolean`, computed from the
  current clock the same way `getPlayheadCol` derives the beat (and from
  `lastBeatIndex` when locked to a song), returning `floor(beat / cols) % 2 === VARIATION_PARITY`.
- `cols` is already in `BoardEngineConfig`; no new engine config needed beyond the
  conditional flag arriving on `ActiveCell`.

### 4. Visuals + controls — `BoardSequencerScreen` ([src/ui/screens/BoardSequencerScreen.tsx](../../../src/ui/screens/BoardSequencerScreen.tsx))

- `drawOverlay`: draw the dashed/double ring for cells whose reading/active state is
  conditional; dim vs glow them based on `engine.isVariationLap()`; draw the A/B
  indicator.
- Add the **"Variation" toggle** and **"Variation sensitivity" slider** to the controls
  (near "Min fill"), wired through `update(...)` like the other config fields. Build the
  `BoardSettleConfig` passed to `BoardSequencerMode` with the two new fields.

### 5. Persistence — `BoardSequencerConfig` ([src/profiles/BoardSequencerConfig.ts](../../../src/profiles/BoardSequencerConfig.ts))

Add to `BoardSequencerStored`, `DEFAULT_BOARD_SEQUENCER_CONFIG`, and `sanitize`:

- `variationEnabled: boolean` — default **`false`**.
- `variationOffsetThreshold: number` — default **`0.6`** (starting point; calibratable;
  tune live). Sanitised with `num(...)` and the boolean with the `!== false` / `=== true`
  idiom already used for other flags.

No `CONFIG_VERSION` bump is required: new numeric/boolean fields fall back to defaults
via `sanitize`, so older stored configs load cleanly (variation simply starts off).

## Testing (Vitest, mirroring existing suites)

- **`BoardReader.test.ts`** — offset: a centred all-one-colour sampler → offset ≈ 0; a
  sampler that fills only the right (or a corner) of the cell → offset close to the
  INSET-bounded max; empty cell → `offset === null`.
- **`BoardSequencerMode.test.ts`** — a reading with `offset ≥ threshold` and
  `variationEnabled` → `ActiveCell.conditional === true`; below threshold, or disabled,
  or `offset === null` → `false`; nudging a settled cell past the threshold flips it live.
- **`BoardSequencerEngine`** (or its existing engine test) — across several laps, a
  conditional cell sounds only on variation laps; a normal cell sounds every lap. Assert
  via spies on the voice/drum `play` calls, mocking Tone as the suite already does.
- **`BoardSequencerConfig.test.ts`** — the two new fields round-trip; missing fields fall
  back to defaults; a corrupt store still yields a usable config.

## Scope guards / out of scope (this slice)

- **Pages & polyrhythm interaction deferred.** "Every other pass" counts against one
  full single-board sweep (`cols`). How conditional gating composes with `numPages` and
  per-role loop lengths is a slice-2/3 concern and intentionally not solved here.
- **Binary only.** No multi-band ("every 4th") and no probabilistic mode in v1. Both are
  documented future extensions, not built now.
- **Global parity only.** No per-piece phase / immediate-play-on-placement in v1
  (visual ring covers the confirmation gap).
- **No generative AI** in this slice (roadmap slice 4).

## Future extensions (recorded, not built)

- Probabilistic mode (offset → firing chance) — smoother, more "alive," and the natural
  bridge to slice 4's AI assistant.
- Multi-band periods (every 2nd / 4th) via offset magnitude.
- Direction encoding (offset up = accent/fill, offset down = drop) once precision allows.
- Defining conditional behaviour against page / polyrhythm loops rather than the base sweep.
