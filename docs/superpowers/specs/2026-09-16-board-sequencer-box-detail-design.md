# Board Sequencer — Box detail & two counters (project E)

- **Date:** 2026-09-16
- **Status:** Design, from the 2026-09-15 brainstorm decisions. Branch `feat/board-sequencer-mode`.
- **Roadmap:** project **E**. Depends on project 1 (per-colour centroids, offset from the physical
  square, conditional latched at settle) and project A (held cells).

## Problem

A counter is either in a box or not: everything about *where* it sits is thrown away except the
Variation shove. Two counters in the same box are worse than useless — the second one is invisible,
because each cell reports a single colour.

The player asked for both: position inside the box as an expressive parameter, and two counters in
one box meaning something.

## Decisions locked (from the brainstorm)

1. **Position in the box.** Up–down = **loudness** (an accent). Left–right = **timing** (the "and").
   **Optional and off by default** — it must never surprise someone whose aim is unsteady.
2. **Two counters in one box.** Start with **both play**. The meaning is chosen per session.
3. Everything is per player, calibratable, and reported in words as well as position.

## Experience

### Box detail (Play → Groove → More feel, and Set up → Colours → Detection sensitivity)

- **Switch: "Where the counter sits matters"** (`boxDetailEnabled`, default off).
- With it on, for each settled counter:
  - **Higher in its square = louder**, lower = softer, within `boxLoudnessAmount` (default 0.5 →
    ±50% of the base velocity). Dead centre is exactly the base velocity.
  - **Right of centre = later** ("the and"), left = earlier, within `boxTimingAmount` × half a step
    (default 0.35). Nothing is ever pushed earlier than the engine's look-ahead allows.
  - Both are measured from the **physical square** centre when the grid divides the board, exactly
    as Variation is, so a coarse grid doesn't read a normal placement as an extreme.
- **Latched at settle**, like Variation: the median over the settle window. Jitter under a resting
  counter can never change how loud it is.
- **A dead zone** (`BOX_DEAD_ZONE` = 0.15 of the square) around the centre reads as exactly centred,
  so "in the middle" is reachable.
- **Feedback.** The legend and Describe board say it in words: "Red row 2 step 3, louder, late".
  `BoardView` draws a small up/down arrow for loudness and a ‹/› for timing — never colour alone.
- **Variation still owns the big shove.** Box detail uses the offset *within* the dead-zone-to-edge
  range; a counter shoved past the Variation threshold is still a Variation counter, and its
  loudness and timing are taken from the same measurement.

### Two counters in one box

- **Switch: "Two counters in a box"** (`twoCounterMode`, default `off`):
  - **`off`** — today's behaviour: the strongest colour wins the box.
  - **`both`** — both counters play. This is the starting choice from the brainstorm.
- With `both`, a cell reports up to `MAX_CELL_COLOURS` (2) colours that each pass the minimum
  coverage, in priority order. Each becomes its own settled cell, so the engine plays both without
  knowing anything new.
- Detection cost is unchanged: `sampleRegion` already returns a fraction and a centroid per colour.
- Each colour in the box keeps **its own** position, so with box detail on, two counters in one box
  can be two different loudnesses.
- The board view draws the box split: the two swatches side by side, each with its contrast ring.
- **Loop slots, pages and the knock guard** keep working: they are lists of cells with colours, and
  a box with two counters is simply two entries.

## Settings (per player, sanitised)

| Setting | Default | Range |
|---|---|---|
| `boxDetailEnabled` | false | on/off |
| `boxLoudnessAmount` | 0.5 | 0–1 |
| `boxTimingAmount` | 0.35 | 0–1 |
| `twoCounterMode` | `'off'` | `off` · `both` |

## Architecture

- **`src/tracking/boxDetail.ts` (pure).**
  ```ts
  export interface BoxPosition { up: number; side: number }   // −1…1, 0 = centred
  export function boxPosition(centroid, row, col, ctx): BoxPosition;
  export function velocityFor(base: number, up: number, amount: number): number;
  export function timingBeatsFor(side: number, amount: number): number;  // fraction of a step
  export function describeBox(pos: BoxPosition, opts): string;           // "louder, late"
  ```
- **`CellReading`** gains `colours?: ColourId[]` (priority order, capped at `MAX_CELL_COLOURS`).
- **`ActiveCell`** gains `velocity?: number` and `timingBeats?: number`, both absent when box detail
  is off, so nothing downstream changes for existing users.
- **`BoardSequencerMode`** keys its cell state by `row,col,colour` when `twoCounterMode === 'both'`,
  and latches the box position with the conditional flag.
- **`BoardSequencerEngine.fireStep`** uses `cell.velocity ?? this.cfg.velocity` and schedules at
  `time + (cell.timingBeats ?? 0) × secondsPerStep`, clamped to never precede `now`.

## Testing

- `boxPosition` on a dividing and a non-dividing grid; the dead zone; clamping.
- `velocityFor` and `timingBeatsFor` at the extremes and at zero amount.
- The mode latches loudness and timing at settle, and jitter afterwards doesn't change them.
- With `twoCounterMode: 'both'`, two colours in one cell settle independently and both appear in
  `activeCells`; with `off`, only the strongest does.
- The engine (Tone mock) fires two notes for a shared box, uses the per-cell velocity, and never
  schedules before now.

## Out of scope

- Depth or tilt, more than two counters in a box, and per-colour timing curves.
