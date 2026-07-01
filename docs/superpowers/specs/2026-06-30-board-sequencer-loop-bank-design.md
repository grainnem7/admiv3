# Board Sequencer — Loop Bank (tangible save / recall / layer)

- **Date:** 2026-06-30
- **Status:** Approved design, ready for implementation plan
- **Branch:** `feat/board-sequencer-mode`
- **Roadmap:** This is **slice 3 (tangible recall)** of the loop-lengthening roadmap,
  brought ahead of slice 2b (spatial halves) at the user's request. Slices done: 1
  (variation), 2a (ping-pong). 2b (spatial halves) still pending after this.

## Problem

The board plays one live pattern. There's a screen-button "pages" mechanism that
captures the board and chains snapshots **sequentially** (a longer song). What's
missing is a **tangible, layered loop-station**: capture loops with the counters,
**pause and bring them back**, and **layer** several saved loops at once — build a
small library, then be creative combining them. This is different from pages in two
ways: it is **counter-driven** (not a screen button) and it **layers** loops
simultaneously rather than sequencing them.

## Decisions locked during brainstorming

- **Workflow: one fluid loop-station** (not a two-phase Build→Perform mode). The
  board is always the live pattern; a bank captures + layers + toggles saved loops
  with no mode switch. "Setup then layer" emerges naturally.
- **Bank location: the bottom row** of the board (chosen for reach — easier for Tim
  than the top). Consequence: with the bank on, the pattern loses its bottom row, so
  the lowest pitch / kick-drum row shifts up by one. Accepted tradeoff.
- **Loop-pedal one-gesture semantics** (dwell-free, since some players can't hold):
  drop a counter on an empty slot = capture; remove = pause; re-place = resume; a
  screen **Clear** re-arms a slot. Capture uses the existing settle debounce (~0.6 s).
- **Bank cells don't sound** — a bottom-row cell is a trigger, excluded from note
  playback. This keeps the rest of the engine untouched (pattern cells keep their
  natural pitch; they just can't use the bottom row — no pitch/drum remap).
- **Larger slice** — implemented as ~5–6 tasks. The risky logic is isolated in one
  pure, unit-tested state machine.

## Experience

Turn on **"Loop bank"** (off by default). The bottom row becomes slots (one per
column); the rows above stay the live pattern.

- Lay out a pattern, drop a counter on an **empty** slot → it captures that pattern
  and loops it (layered). Placing = settling, so it's a clean tap, no hold.
- Sweep the pattern off, lay a new one, save to the next slot → layered on top. The
  first loop keeps playing from its snapshot.
- **Remove** a slot's counter → that loop **pauses** (snapshot kept). **Put one back**
  → it **resumes**. The counters in the bottom row *are* the live mix.
- Loops are **saved across sessions** — build a library today, layer it later.
- Everything rides the one playhead, so saved loops stay in sync and inherit
  ping-pong + variation.
- Right after capture the pattern is both live *and* saved, so it doubles until you
  physically sweep the live one away to build the next (normal loop-pedal behaviour).

## Slot mechanics

Each slot (column `i` of the bottom row) has: **saved loop** (empty / full) and
**counter present** (physical, never persisted).

| Slot state | Action | Result |
|---|---|---|
| empty | counter placed (settles) | **Capture** current pattern → slot full, loop plays |
| full | counter removed | Loop **pauses** — snapshot kept |
| full | counter placed | Loop **resumes** (recall) — no re-record |
| full | **Clear** (screen) | Slot → empty, ready to re-record |

- **Captured content:** the settled pattern cells *above* the bank row — each cell's
  `row, col, colour`, and its slice-1 `conditional` flag — so a loop replays exactly,
  including variation.
- **Layering:** every active slot's cells play at their columns each step, summed with
  the live pattern and the other active slots. Pitch is per-row-absolute, so layers
  never fight over voicing.
- **Empty board + counter on empty slot** → captures an empty loop (harmless no-op).

## Visual feedback (principle #5)

- **Overlay:** bank slots read distinctly — **empty** = thin outline; **full/paused**
  = dim fill; **active** = bright fill that pulses on its playhead hits.
- **On-screen mini-views:** a thumbnail grid per saved slot (coloured dots for its
  pattern), bordered/lit when active, dimmed when paused — so every layer stays
  visible even though the physical grid only shows the live pattern. Each mini-view
  carries the **Clear** button.

## Architecture

### 1. Pure state machine — `src/songs/loopBank.ts` (new) + `src/__tests__/loopBank.test.ts`

A loop cell reuses the existing `ActiveCell` shape (`{ row, col, colour, conditional? }`).

```ts
import type { ActiveCell } from '../tracking/BoardSequencerMode';

export interface LoopBankState {
  /** Saved loop per slot; null = empty. Index = slot (bottom-row column). */
  saved: (ActiveCell[] | null)[];
  /** Whether a counter was on each slot last frame (for rising-edge capture). */
  present: boolean[];
}

export interface LoopBankStep {
  state: LoopBankState;
  /** Snapshots of currently active (present + full) slots, to layer. */
  active: ActiveCell[][];
  /** Slot indices that captured this frame (rising edge on an empty slot). */
  captured: number[];
}

/**
 * Advance the loop bank one frame. `present[i]` = a settled counter sits on slot i
 * now; `patternCells` = the current settled pattern (already excluding the bank
 * row). Capture fires only on a rising edge (absent→present) of an EMPTY slot; a
 * full slot with a counter is active (recall), removal pauses (snapshot kept).
 */
export function stepLoopBank(
  prev: LoopBankState,
  present: boolean[],
  patternCells: ActiveCell[],
  slotCount: number,
): LoopBankStep;

/** Empty a slot (the screen Clear button); returns a new state. */
export function clearLoopSlot(state: LoopBankState, slot: number): LoopBankState;

/** A fresh, all-empty state for `slotCount` slots. */
export function emptyLoopBank(slotCount: number): LoopBankState;
```

Rules per slot `i`: `rising = present[i] && !prev.present[i]`. If `rising && prev.saved[i] == null` → capture (`saved[i] = [...patternCells]`, add to `captured`); else `saved[i]` unchanged. Active when `present[i] && saved[i] != null`. New `state.present = present`.

### 2. Engine layering — `src/songs/BoardSequencerEngine.ts`

- Add `setActiveLoops(loops: ActiveCell[][]): void` storing the active snapshots.
- In `fireStep`, play the live/page cells **and** every active loop's cells through
  the same per-step path — i.e. run the existing per-cell logic over
  `[...pageCells, ...activeLoops.flat()]`. Voicing is per-row-absolute, so the concat
  is safe. Loops thus ride the shared playhead (ping-pong, beat) and honour the
  existing `firesThisLapPaged` variation gate via each cell's `conditional`.

### 3. Persistence — `src/profiles/BoardSequencerConfig.ts`

- `loopBankEnabled: boolean` (default **`false`**).
- `loopSlots: StoredLoopCell[][]` (default `[]`), where `StoredLoopCell` is
  `{ row, col, colour, conditional? }` (like `StoredBoardCell` plus the flag) — a new
  `sanitizeLoopSlots` mirrors `sanitizePages` but preserves `conditional`.
- No `CONFIG_VERSION` bump (new fields default via sanitize).

### 4. Screen — `src/ui/screens/BoardSequencerScreen.tsx`

When `loopBankEnabled` and running: each frame partition `res.activeCells` into
**pattern** (`row < rows-1`) and **bank presence** (`present[i]` = occupied at
`(rows-1, i)`); run `stepLoopBank`; on `captured`/Clear, persist `loopSlots`; feed the
engine `setActiveCells(patternCells)` + `setActiveLoops(step.active)`; draw the bank
overlay states + mini-views + Clear; add the toggle. When the bank is **off**,
behaviour is exactly as today (bottom row is normal pattern).

### 5. Tests

- **`loopBank.test.ts`** — capture on rising edge of an empty slot; pause on removal
  (snapshot retained, not active); resume on re-place with no re-record; no capture
  when placing on a full slot; `clearLoopSlot` empties; slots independent;
  `conditional` preserved in a captured cell.
- **`BoardSequencerConfig.test.ts`** — `loopBankEnabled` + `loopSlots` round-trip
  (including `conditional`); default off / empty when absent.
- **Engine / screen** — no harness; verified by `npm run lint` + full suite.

## Scope guards / out of scope (this slice)

- **Single page only** (`numPages = 1`) — interaction with Pages is deferred, as
  variation's was.
- **Bank = bottom row, fixed** — not configurable; slot count = `cols`.
- **No per-slot niceties** — no naming, per-loop volume, reordering, or crossfades.
- **Bank cells never sound** — colour on a bank counter is ignored (trigger only).
- Loops **ride the shared playhead** — they ping-pong and vary along with everything;
  no independent per-loop tempo/length in v1.

## Future / next slice

- Per-slot volume / mute-groups / naming; a "clear via gesture"; independent loop
  lengths; the two-phase Build→Perform performance rig (brainstormed as Option B).
- Back to roadmap **slice 2b (spatial halves)**, and **slice 4 (optional generative AI)**.
