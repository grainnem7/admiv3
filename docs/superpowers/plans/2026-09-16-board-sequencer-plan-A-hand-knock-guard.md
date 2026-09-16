# Plan A — Hand & knock guard

Spec: `docs/superpowers/specs/2026-09-15-board-sequencer-hand-knock-guard-design.md`.
Depends on project 1 (all four plans), which is implemented.

## Task 1 — Settings

`BoardSequencerConfig`: `handGuardEnabled`, `handMarginSquares`, `handReleaseMs`, `settleAfterHandMs`,
`intruderSensitivity`, `restNudgeMs`, `knockGuardEnabled`, `knockMinCount`, `knockMinFraction`,
`knockWindowMs` — defaults and ranges from the spec's table, all sanitised and clamped, with tests.

## Task 2 — `tracking/handGuard/intruderMask.ts` (pure)

`buildWatchGrid(H, imgW, imgH, rows, cols, ringFrac)` and `stepWatcher(prev, grid, rgba, now, opts)`
exactly as the spec: gain-compensated deviation, ring seeds, flood fill, margin dilation, held cells
with release, background learn/update/freeze, global change, resting.

Tests: an interior counter never seeds; an arm crossing the edge always does; a 20% exposure dip
gives no mask; a camera bump sets `global` and holds nothing; a counter placed with hands away is
absorbed; `restNudgeMs` sets `resting`; `handReleaseMs` is respected; off-image handling.

## Task 3 — `tracking/handGuard/knockGuard.ts` (pure)

`stepKnock`, `releaseGhostsAt`, `letGo`, `ghostsForSave`. Tests: triggers at 3 cells and 40% inside
the window; not for 2 cells or spread over a second; held cells never count; control/Off/bank-row
ignored; a returning counter replaces its ghost; a second knock adds; Let go clears.

## Task 4 — Mode and frame

`BoardSequencerMode.restartSettle(cells)` and `setSettleWindow(ms)`.
`stepBoardFrame` takes `{ held, ghosts }`: the engine's cells are live ∪ ghosts (live wins), held
cells are excluded from counts, and capture needs no mask during the quiet window.

## Task 5 — Nudges

`playNudge` gains `something-resting` (hysteresis + Not now) and `knocked` (no dismiss), with the
priority `knocked` > `colour-matches-board` > `something-resting` > `board-moved`, and `board-moved`
fires without the minimum-piece rule while `global`.

## Task 6 — Runtime integration

`useBoardRuntime`: watcher and knock state in refs, grid rebuilt on homography/grid change, held
readings removed before `mode.step`, `restartSettle` on release, `settleAfterHandMs` while the
watcher is ready.

## Task 7 — UI

`BoardView` held (hatched) and ghost (double outline + ↺) states; status pill "✋ holding 3"; legend
"3 playing (2 held)"; the knock banner with **Let go** and **Save as loop**; the Hands settings group
with **Check my hand**; camera setup tips.

## Final verification

`npm run lint && npm run test:run`, `npm run build`, then the spec's manual checklist.
