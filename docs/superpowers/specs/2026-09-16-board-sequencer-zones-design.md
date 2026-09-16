# Board Sequencer — Zones & loop pads (project B)

- **Date:** 2026-09-16
- **Status:** Design, from the 2026-09-15 brainstorm decision: *"Control and loop counter
  placement — all options (Classic colour-anywhere, in-board row or column, Side-car card),
  **configurable per player**."* Branch `feat/board-sequencer-mode`.
- **Roadmap:** project **B**. Depends on project 1 (control counters, loop bank, per-player config)
  and benefits from A (held cells) and E (two counters in a box).

## Problem

Two placements are hard-wired today:

- A **control colour works anywhere**. That is flexible, but it means a volume counter parked in the
  middle of the pattern is also sitting on a note, and a player who wants "the volume lives *here*"
  can't have it.
- The **loop bank is always the bottom row**. For a player who sits at the low-notes edge, the
  loop pads are the row furthest from their hand, and the bottom row stops being notes at all.

Neither can be changed, and what suits one player doesn't suit the next.

## Decisions

1. **Three placements, per player**, for controls and for loop pads independently:
   - **Anywhere** (today's behaviour) — the colour is what matters, not the place.
   - **A row** — a chosen row is that job's lane.
   - **A column** — a chosen column is that job's lane.
2. **A lane is not notes.** Cells inside a control or loop lane never play the pattern, whatever
   colour sits on them, so a lane can't produce stray notes.
3. **A fader in a lane reads along the lane**, not across the whole board: a row lane reads
   left → right, a column lane bottom → top. Anywhere keeps today's fader axis.
4. **Loop pads get a mode**: **Hold** (today — the counter must stay for the loop to play) or
   **Toggle** (put it on to start, take it off and the loop keeps going; put it on again to stop).
   Toggle suits a player with few counters; Hold suits one who wants to see what is playing.
5. The **side-car card** is a printed sheet beside the board, and needs its own detection region —
   out of scope here, and noted as such. Everything else is in.

## Experience

- **Set up → Board → Details** and **Play → Loops** carry the same two pickers:
  - **Controls live:** Anywhere · A row · A column, with a row/step picker when it isn't Anywhere.
  - **Loop pads live:** Off · A row · A column, with the same picker, plus **Hold / Toggle**.
- The lanes are drawn on the board view with a tinted band **and a label** ("Controls" / "Loops"), so
  a lane is never a colour-only signal, and the legend says which row or column each lane is.
- Moving a lane while playing is allowed: it is a placement, not a calibration.
- The bottom-row loop bank becomes `loopZone = { mode: 'row', index: rows - 1 }` on migration, so
  nothing changes for anyone who already uses it.

## Architecture

`src/tracking/zones.ts` (pure):

```ts
export type ZoneMode = 'anywhere' | 'row' | 'col' | 'off';
export interface Zone { mode: ZoneMode; index: number }
export function zoneContains(zone: Zone, cell: { row: number; col: number }): boolean;
export function zoneSlotCount(zone: Zone, rows: number, cols: number): number;
export function zoneSlotOf(zone: Zone, cell): number;              // pad index along the lane
export function zonePosition(zone: Zone, centroid): number;         // 0…1 along the lane
export interface ZoneSplit<T> { pattern: T[]; controls: T[]; pads: T[] }
export function splitByZone<T extends { row: number; col: number }>(
  cells: T[], controlZone: Zone, loopZone: Zone,
): ZoneSplit<T>;
```

- **`stepBoardFrame`** uses `splitByZone` in place of its hard-coded bottom row: pattern cells are
  what is left after the lanes are taken out, pad presence comes from the loop lane, and the
  capture/trigger rules from project 1b are unchanged.
- **`controlCounters`** takes the control zone: in a lane, a fader's value is `zonePosition`, and a
  control counter outside its lane is ignored (so a stray volume counter in the pattern does
  nothing rather than something surprising).
- **Loop pads** gain `loopPadMode`. Hold is today's `present` rule; Toggle keeps a latched
  `playing[]` per slot, flipped on each rising edge.
- **`BoardView`** draws the lanes; the legend names them.

## Settings (per player)

| Setting | Default | Notes |
|---|---|---|
| `controlZone` | `{ mode: 'anywhere', index: 0 }` | |
| `loopZone` | from `loopBankEnabled` on migration | `off` when the bank was off |
| `loopPadMode` | `'hold'` | `hold` · `toggle` |

## Testing

- `zoneContains` / `zoneSlotOf` / `zonePosition` for rows and columns, including the inverted
  column direction (bottom = 0).
- `splitByZone` keeps a cell out of the pattern when it is in either lane, and both lanes can't
  claim the same cell (control wins, and the UI stops them being set the same).
- `stepBoardFrame` with a row lane behaves exactly as the old bottom-row bank did.
- A fader in a lane reads along the lane; a fader colour outside its lane is ignored.
- Toggle pads: a rising edge starts a loop, the counter can be removed, and the next rising edge
  stops it. Hold pads keep today's behaviour.
- Migration: `loopBankEnabled: true` becomes a bottom-row lane; `false` becomes `off`.

## Out of scope

- The printed side-car card (its own detection region outside the board).
- Per-lane colour restrictions, and more than one lane of each kind.
