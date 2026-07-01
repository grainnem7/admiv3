# Board Sequencer — In-app Help + Facilitator Cheat Sheet

- **Date:** 2026-06-30
- **Status:** Approved design, ready for implementation plan
- **Branch:** `feat/board-sequencer-mode`

## Problem

Three new board-sequencer features shipped this session (Variation, Ping-pong, Loop
bank), plus looser piece detection. There's no in-app guidance, and facilitators have
nothing to reference at the board. Two small, self-contained documentation surfaces
fix this, sharing one wording so they never drift.

## Decisions locked during brainstorming

- **On-screen help = a "How to play" collapsible `<Section>`** in the controls rail
  (the recommended option), collapsed by default, placed first for discoverability.
- **Facilitator-facing, static content** — shows all features regardless of which
  toggles are on (a reference, not context-sensitive). Players act physically; the
  facilitator reads the screen/paper.
- **Content lives in a new component** `src/ui/components/board/BoardHelp.tsx`, not
  inline, since `BoardSequencerScreen.tsx` is already large.
- **Cheat sheet = a printable markdown doc** mirroring the same content.

## Deliverable 1 — On-screen "How to play" section

- New presentational component `src/ui/components/board/BoardHelp.tsx` (no props, or a
  single `cols`/`rows`-free static body) rendering concise how-tos grouped as:
  - **Basics** — calibrate the four corners; add a colour by clicking a piece; press Start.
  - **Pieces not detected?** — lower the "Min fill" slider.
  - **Variation** — shove a piece to its square's edge → plays every other pass (dashed
    ring; A/B cue).
  - **Ping-pong** — playhead sweeps → then ← (watch the → / ← arrow); doubles the phrase.
  - **Loop bank** — bottom row = save/recall slots: drop a counter on an empty slot to
    save, remove to pause, replace to resume, Clear (mini-view) to re-record; loops layer.
- Rendered inside a `<Section title="How to play">` in the controls rail, **first
  section, collapsed by default** (the existing `Section` component already supports
  `open`/`onToggle`; wire it to the existing `openSection` state the other sections use).
- Follow the existing controls styling (font sizes/opacity used by other sections'
  hints). No new state beyond the section's own open flag.

## Deliverable 2 — Facilitator cheat sheet

- `docs/board-sequencer-cheat-sheet.md`: one page, print-friendly, scannable
  "gesture → what it does" layout, mirroring the BoardHelp wording. Sections: Setup,
  Detection, Variation, Ping-pong, Loop bank, plus a one-line note that the three
  toggles are independent and off by default. Pure documentation — no code.

## Architecture / testing

- `BoardHelp.tsx` is a pure presentational component — no logic, no Tone.js, no state.
- No unit test (static JSX with no branching). Verified by `npm run lint` (`tsc
  --noEmit`) + the full suite staying green (no regressions).
- The screen change is limited to importing `BoardHelp` and adding one `<Section>` with
  an `openSection` key.

## Scope guards / out of scope

- No context-sensitivity (help does not react to which toggles are on).
- No modal/overlay, no "?" button.
- No i18n / translations.
- Wording is kept identical between the component and the cheat sheet by authoring both
  from the same short source list in this spec.

## Content source (single source of wording for both surfaces)

- **Basics:** "Line up the four board corners, click a piece to add its colour, then
  press Start. A playhead sweeps left→right; a piece sounds when the playhead reaches
  its column. Higher rows = higher notes."
- **Pieces not detected?** "Lower 'Min fill' in Colours & detection — a piece no longer
  has to sit dead-centre."
- **Variation:** "Shove a piece firmly to the edge of its square → it plays every OTHER
  time round (dashed ring). The A/B letter shows the current lap."
- **Ping-pong:** "Turn on Ping-pong: the playhead runs → then ← for a longer, there-and-
  back phrase. The → / ← arrow shows direction. Edge-shoved pieces play on the way back."
- **Loop bank:** "Turn on Loop bank: the bottom row becomes save slots. Drop a counter
  on an empty slot to SAVE the pattern above; it keeps looping. Remove to PAUSE, replace
  to RESUME. Loops layer. Clear (on a mini-view) empties a slot to re-record. Note: the
  bottom row is slots, not notes, while this is on."
