# Board Sequencer — Spatial Halves (composed 2-bar loop)

- **Date:** 2026-06-30
- **Status:** Approved design, ready for implementation plan
- **Branch:** `feat/board-sequencer-mode`
- **Roadmap:** slice **2b** of the loop-lengthening roadmap — completes "more time"
  (2a was ping-pong). Done: 1 (variation), 2a (ping-pong), 3 (loop bank). After this,
  only slice 4 (optional generative AI) remains.

## Problem

Ping-pong (2a) gives a longer phrase but as a *mirror*; loop bank (3) *layers* loops.
Neither gives **two independently-composed sequential bars**. Spatial halves does: the
board splits into a top band (bar 1) and a bottom band (bar 2), played one after the
other, so you compose a 16-step, 2-bar loop on one board and see it all at once.

## Decisions locked during brainstorming

- **Per-band full pitch range.** Each band is a self-contained bar: its *own* bottom
  row is the lowest note, top row the highest — so both bars share a register. Cost:
  half the pitch resolution per bar (best on an **8-row** board → 4 pitches/bar; a hint
  suggests 8 rows when rows < 8).
- **Top band = bar 1, bottom band = bar 2** (reading order).
- **Spatial halves takes precedence** over the other new modes (v1 = one structure mode
  at a time): while it's on, **ping-pong is bypassed**, **loop bank is not fed**, and
  **variation is inert** (reusing its `Pages > 1` guard). Assumes `numPages = 1`. UI
  hints explain. Reconciling them is future work.
- **Larger slice** (~5–6 tasks); risky logic isolated in pure, tested helpers.

## Experience

Turn on **"Spatial halves"** (off by default). The board splits across the middle into
a top band and a bottom band; you lay out **two bars at once** (top = bar 1, bottom =
bar 2).

- The playhead sweeps the **top band for `cols` beats** (bar 1), then the **bottom band
  for `cols` beats** (bar 2), repeating — a **2×cols** (16-step) composed loop.
- **Each band is a full self-contained bar:** within a band, its own bottom row is the
  lowest note and its top row the highest, so both bars sit in the same register.
- Only the **active bar's band sounds** at a time. Colour = instrument, column = time,
  as always.

## Visual feedback

- A **divider line** across the middle separates the two bands.
- The **active bar is bright, the other dimmed** (swapping each bar), so with the
  sweeping playhead column you always see where you are in the 16 steps.
- A **"Bar 1 / Bar 2" indicator** near the existing A/B + arrow cues names the current bar.

## Mode coexistence (precedence + hints)

While Spatial halves is on:
- **Loop bank** and **Ping-pong** are ignored; a hint reads "Spatial halves is on — turn
  it off to use Loop bank / Ping-pong."
- **Variation** is inert (same as when `Pages > 1`).
- **Pages** assumed single (`numPages = 1`).

## Architecture

Per-band pitch needs **no new voicing code** — only a different `rows` value.

### 1. Config — `src/profiles/BoardSequencerConfig.ts`

`spatialHalves: boolean` (default **`false`**) added to `BoardSequencerStored`,
`DEFAULT_BOARD_SEQUENCER_CONFIG`, and `sanitize` (`o.spatialHalves === true`). No
`CONFIG_VERSION` bump.

### 2. Pure helpers — `src/songs/boardSequencerScale.ts`

```ts
export interface Band { start: number; end: number; } // inclusive row range

/**
 * Split `rows` into two bands (top = bar 1, bottom = bar 2). The bottom band gets
 * floor(rows/2) rows; the top band gets the remainder (the extra row when odd).
 */
export function bandBounds(rows: number): [Band, Band] {
  const bottomRows = Math.floor(Math.max(0, rows) / 2);
  const topRows = Math.max(0, rows) - bottomRows;
  return [
    { start: 0, end: topRows - 1 },
    { start: topRows, end: rows - 1 },
  ];
}

/** Which bar a GLOBAL beat falls on: 0 = top/bar 1, 1 = bottom/bar 2. Defensive on negatives. */
export function barIndexAt(beat: number, cols: number): number {
  if (cols < 1) return 0;
  const b = Math.floor(beat / cols);
  return ((b % 2) + 2) % 2;
}
```

### 3. Engine `fireStep` — `src/songs/BoardSequencerEngine.ts`

Add `spatialHalves?: boolean` to `BoardEngineConfig` (optional — read as
`this.cfg.spatialHalves ?? false` so the screen constructor need not change until its
task) + a `setSpatialHalves(on)` setter + `getCurrentBar(cols): number` (via
`barIndexAt`, mirroring `getPlayheadCol`'s beat derivation).

When spatial is on, inside `fireStep`:
- `const bar = barIndexAt(beat, this.cfg.cols); const band = bandBounds(this.cfg.rows)[bar];`
- `const pitchRows = band.end + 1;` — because degree is `rows-1-row`, using `band.end+1`
  makes the band's own bottom row degree 0 (per-band full range, same register).
- **Restrict to the active band:** the melodic voicing is computed over only the active
  band's melodic cells, and the play loop **skips any cell with `row < band.start || row >
  band.end`**.
- Replace `this.cfg.rows` with `pitchRows` in the four pitch sites: `voicingForCells(...,
  pitchRows)`; bass `degree = pitchRows - 1 - cell.row`; the chord stack (pass `pitchRows`
  into `chordStack`, which currently hardcodes `this.cfg.rows`); `drumForRow(cell.row,
  pitchRows, ...)`.
- **Ping-pong bypass:** the column check uses `playheadStep(beat, rawLoop, cols,
  this.cfg.spatialHalves ? false : (this.cfg.pingPong ?? false))`.
- **Variation inert:** the gate uses `firesThisLapPaged(cell.conditional ?? false, beat,
  cols, this.cfg.spatialHalves ? 2 : this.cfg.numPages)` — a `2` makes it inert exactly
  as `Pages > 1` already does. No new variation logic.

When spatial is off, every one of these expressions reduces to today's behaviour (a true
no-op).

### 4. Screen — `src/ui/screens/BoardSequencerScreen.tsx`

- **Spatial halves toggle**; pass `spatialHalves` into the engine construction; call
  `setSpatialHalves` live.
- **Precedence:** when spatial is on, do NOT run the loop-bank partition — feed
  `setActiveCells(res.activeCells)` + `setActiveLoops([])` (loop-bank off), and show the
  conflict hints. Ping-pong/variation precedence is handled engine-side.
- **Visuals:** draw the mid-board divider, dim the inactive band (active bar from
  `engine.getCurrentBar(cols)`), and a "Bar 1 / Bar 2" indicator. Show a "works best with
  8 rows" hint when `rows < 8`.

### 5. Tests

- `boardSequencerScale.test.ts` — `bandBounds` (even rows split evenly; odd rows → top
  gets the extra; the two ranges are contiguous and cover `[0, rows-1]`); `barIndexAt`
  (bar 0 for beats `[0, cols)`, bar 1 for `[cols, 2cols)`, wraps, negative-defensive).
- `BoardSequencerConfig.test.ts` — `spatialHalves` round-trip + default false.
- Engine / screen — no harness; verified by `npm run lint` + full suite.

## Scope guards / out of scope (this slice)

- **Exactly two bands** (halves), not configurable N.
- **One structure mode at a time** — spatial halves takes precedence; it does not combine
  with loop bank / ping-pong / Pages, and variation is inert while it's on.
- **No per-band independent length/tempo**; both bars are `cols` beats.
- Reconciling spatial halves with variation (variation across two bars) and with the other
  modes is future work.

## Future / next slice

- Reconcile variation-across-bars and multi-mode combos; configurable band count.
- Roadmap **slice 4 (optional generative AI)** — the last roadmap item.
