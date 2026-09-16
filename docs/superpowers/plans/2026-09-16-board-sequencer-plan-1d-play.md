# Plan 1d — Play

Spec: `docs/superpowers/specs/2026-09-15-board-sequencer-redesign-design.md`
(sections "Play screen", "Nudges", "Board view", bug fix 5).

## Task 1 — `BoardView`

`components/BoardView.tsx` + pure `components/boardViewModel.ts` (tested).

- Canvas grid with rounded cells, row/step labels, the current step highlighted while playing.
- Pieces: detected = soft fill + dotted ring; settled = solid fill + ring; conditional = long-dash
  ring in `--bs-warn`. Every swatch gets the two-tone `swatchRingFor` ring.
- Note pops come **only** from `engine.drainFiredNotes()`; a pop runs from `audibleNow() ≥ audioTime`
  to `audioTime + max(durSec, 0.12)`, so it can never appear before its sound. Reduced motion gets a
  static outline instead of a scale.
- Playhead band with a direction arrow when ping-pong is on; loop-bank row with glyphs; page label.
- Throttled accessible name ("8 by 4 board, step 3 of 8, 5 pieces") and a **Describe board** button.

Pure `boardViewModel.ts`: `popsAt(fired, now)`, `describeBoard(cells, channels, rows, cols)`,
`boardSummary(rows, cols, step, pieces)`.

## Task 2 — Play tabs

`play/GrooveTab.tsx`, `play/SoundTab.tsx`, `play/LoopsTab.tsx`, ported from the old rail onto the
primitives. Live vs disabled-with-a-reason exactly as the spec's "While playing" list:
`playDisabledReason(kind, running)` is pure and tested.

## Task 3 — `PlayView`

Transport (▶/■, Mute), status pill ("Playing · 96 BPM · step 3" + beat dot + lap A/B), the reserved
nudge slot, board stage with camera PiP and legend, the "Now:" line, Describe board, and the tabs.
Handedness layout from `layoutFor`; stacked mode pins the transport to the bottom with
`scroll-padding-bottom` so focus is never hidden.

## Task 4 — Nudges

`useBoardRuntime` steps `playNudge` each camera frame and reports the signal; `PlayView` renders it
in the reserved slot with **Find board** / **Recalibrate <name>** / **Not now**, announced once.

## Task 5 — Big board and Space

`play/BigBoard.tsx`: fills the viewport, requests fullscreen, keeps ▶/■, Mute and Exit; follows
`fullscreenchange`; focus to the board on entry and back to ⤢ on exit.
Space toggles play/stop in Play and Big board only, never in Set up, and never when the target is a
control. Pure `spaceTogglesPlay(view, target)` is tested.

## Task 6 — Retire the old rail

Delete the rail markup and `WarpedBoardView`; rewrite `BoardHelp` and
`docs/board-sequencer-cheat-sheet.md` for the new flow.

## Final verification

`npm run lint && npm run test:run`, `npm run build`, and the spec's manual checklist.
