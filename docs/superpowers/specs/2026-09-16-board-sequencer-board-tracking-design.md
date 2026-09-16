# Board Sequencer — Board tracking (project D)

- **Date:** 2026-09-16
- **Status:** Design, from the 2026-09-15 brainstorm decision: *"Make the canvas track the board
  automatically if it's nudged or moves"* → **follow small nudges silently, even while playing; show
  "Board moved?" for big moves.** Branch `feat/board-sequencer-mode`.
- **Roadmap:** project **D**. Depends on project A (the board watcher's learnt background, its watch
  grid and its `global` signal) and project 1 (corners, `handleCalibrated`, the `board-moved` nudge).

## Problem

The board gets knocked, leaned on and pushed while someone plays. A few millimetres is enough to put
the grid off the squares: counters read in the wrong box, or stop reading at all. Today the only
remedy is to stop and click the four corners again, which ends the music.

The research prototype for a full lattice re-detection was never completed, and a heavyweight
detector is the wrong tool here anyway: a nudge is a **small rigid move of a board we have already
seen**, not an unknown board to be found from scratch.

## Decisions

1. **Follow small nudges silently**, including while playing. No message, no announcement, nothing
   to press — the music must not stop.
2. **Refuse big moves.** Past a limit the app does not guess: it raises the existing "Board moved?"
   hint, which offers Find board.
3. **Never fight a hand.** Tracking is skipped while the hand guard holds anything, while the
   watcher reports a whole-picture change, and until it has a clear view.
4. **Never drift.** A correction is only taken when it measurably improves the match, and each
   correction is capped, so error can't accumulate into a slow slide.

## Experience

- The player nudges the board. The grid follows it; the music carries on. Nothing is announced.
- A bigger shove: the grid does not follow, and after the usual two seconds the **"Has the board
  moved?"** hint appears with **Find board**, exactly as it does today.
- **Set up → Board → Details** gains **"Follow small nudges"** (`boardTrackingEnabled`, default on).
  Off means today's behaviour.
- Corrections are saved to the player's corners, throttled, so the next session starts where the
  board actually is.

## Architecture

`src/tracking/handGuard/boardTrack.ts` (pure, no DOM):

```ts
export interface TrackOptions {
  maxShiftSquares: number;   // how far a nudge may be followed (default 0.6 of a square)
  minImprovement: number;    // fraction of the residual that must be removed (default 0.15)
  sensitivity: number;       // same scale as the watcher's, for the residual
}
export interface TrackResult {
  dx: number; dy: number;    // board-space shift, in units of the whole board
  scale: number;             // 1 = unchanged
  improved: boolean;         // false when nothing beat "leave it alone"
  before: number; after: number;
}
export function estimateBoardShift(grid: WatchGrid, bg: Float32Array, rgba, h: Mat3, frame, opts): TrackResult;
export function shiftCorners(corners: Corners, dx, dy, scale): Corners;
```

- The watcher already keeps a **learnt background of the empty board** sampled on a 48 × 48 board-space
  grid. Tracking asks one question of it: *which small rigid move of that grid best explains the
  picture now?*
- **Search.** A coarse-to-fine sweep over (dx, dy, scale): a 5 × 5 × 3 grid at ±`maxShiftSquares`,
  then one refinement at a fifth of the step. Each candidate re-projects the grid's board coordinates
  through the homography and scores the mean absolute difference from the background, with the same
  gain compensation the watcher uses.
- **Acceptance.** The best candidate must cut the residual by at least `minImprovement`, and must not
  be at the very edge of the search range (which means the true move is larger than we are willing to
  follow). Otherwise `improved: false` and nothing moves.
- **Applying.** `shiftCorners` maps the board-space move onto the four saved corners, so the
  homography, the watch grid, the sampling lattice and the overlay all follow from one write.

### Integration

- `useBoardRuntime` runs tracking at most every `TRACK_INTERVAL_MS` (500 ms), and only when:
  `boardTrackingEnabled`, the watcher is `ready`, nothing is held, and `global` is false.
- On an accepted correction it updates `homographyRef` and reports the new corners through a
  callback; the screen saves them, throttled to once every `TRACK_SAVE_MS` (3 s).
- When the search says the move is bigger than the limit, the existing `board-moved` nudge is left to
  do its job — no new message.
- The watcher's background is **not** re-learnt from a tracked move: the same board is still there,
  just in a slightly different place.

## Settings

| Setting | Default | Range |
|---|---|---|
| `boardTrackingEnabled` | true | on/off |
| `boardTrackMaxSquares` | 0.6 | 0.2–1.5 |

## Testing

- A synthetic board shifted by a known amount is recovered to within a tenth of a square, on both a
  fine and a coarse grid.
- A board shifted **beyond** the limit is refused (`improved: false`), so the hint takes over.
- An unmoved board returns no correction (no drift when nothing happens).
- A frame with a hand over it is never tracked (the runtime's guard), and a changed exposure alone
  produces no correction.
- `shiftCorners` composes: shifting by (a) then (b) equals shifting by (a + b), and a scale of 1
  with zero shift is the identity.
- Repeated small corrections on a still board don't accumulate (10 runs, total drift under a tenth
  of a square).

## Out of scope

- Rotation and perspective changes (a board turned on the table is a "Find board" job).
- Re-detecting a board from scratch — that is project C.
