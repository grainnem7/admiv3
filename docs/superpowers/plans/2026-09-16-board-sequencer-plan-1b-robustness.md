# Plan 1b — Robustness: controls, hand-guard logic, detection clean-ups

Spec: `docs/superpowers/specs/2026-09-15-board-sequencer-redesign-design.md`
(sections "Safe control counters", "Hand-guard logic fixes", "Detection clean-ups").

No new screens. Every task is TDD: failing test → implementation → `npm run lint && npm run test:run` → commit.

## Task 1 — Config: control settings

**Files:** `src/profiles/BoardSequencerConfig.ts`, `src/__tests__/BoardSequencerConfig.test.ts`.

New player fields, all sanitised, no version bump:

```ts
export type FaderRole = 'volume' | 'reverb' | 'delay' | 'tone' | 'tempo';
export interface ControlRange { min: number; max: number }
export type ControlRemoval = 'hold' | 'zero' | 'default';

controlStillMs: number;                              // 150
controlGlideSec: number;                             // 0.3
controlRanges: Record<FaderRole, ControlRange>;      // tempo 60–160, volume 0.2–1, reverb/delay 0–0.6, tone 0–1
controlRemoval: Record<FaderRole, ControlRemoval>;   // all 'hold'
controlReturnMs: number;                             // 3000, used by 'default'
toggleAmount: number;                                // 0.35 (was hard-coded)
captureQuietMs: number;                              // 500
```

Tests: defaults; a partial/garbage `controlRanges` falls back per role and per bound; `controlRemoval` rejects unknown strings; clamps (`controlStillMs` 0–2000, `controlGlideSec` 0–2, `captureQuietMs` 0–5000, `toggleAmount` 0–1).

## Task 2 — Pure safe-control module

**Files:** create `src/tracking/controlCounters.ts`, test `src/__tests__/controlCounters.test.ts`.

```ts
export const CONTROL_HYSTERESIS = 0.05;
export const CONTROL_END_SNAP_SQUARES = 0.3;
export function faderPositionFromCentroid(centroid, axis, boardSquares): number  // end snaps applied
export function rawFaderPosition(readings: CellReading[], colour, cfg): number | null
export interface ControlState { byRole: Record<string, RoleState> }
export function initialControlState(): ControlState
export function stepControls(prev, readings, channels, cfg, dtMs): { state, values, toggles, held }
```

Rules (spec): position from the counter's **board position** along the fader axis (per-colour centroid),
`row` axis is inverted (top of the board = 1); end zones of 0.3 square snap to exactly 0/1;
hysteresis ±0.05; a change commits only after `controlStillMs` of stillness; a missing counter
follows `controlRemoval` (`hold` keeps, `zero` drops now, `default` returns after `controlReturnMs`);
committed values are mapped through `controlRanges`; toggles are presence-based with the same debounce.

Tests: continuous value on a 4×4 grid gives >20 distinct levels across the board; end snaps;
hysteresis rejects a 0.03 wobble; a 0.2 move commits only after 150 ms; hold/zero/default on removal;
ranges applied (volume 0.5 → 0.6); `held` lists roles whose counter is missing but whose value stands.

## Task 3 — Per-colour centroids, offset from the played colour

**Files:** `src/tracking/BoardReader.ts`, `src/tracking/BoardSequencerMode.ts` (`CellReading.centroids`),
tests `src/__tests__/boardReader.test.ts` (extend).

`sampleRegion` returns `centroids: Partial<Record<ColourId, Point>>` (sums already exist).
`BoardReader.read` computes `centroid`/`offset` from the **classified** colour, not the dominant one.

## Task 4 — One counter, one box (`suppressSpill`)

**Files:** `src/tracking/boardFrame.ts`, test `src/__tests__/suppressSpill.test.ts`.

Pure `suppressSpill(readings, ctx)`: for orthogonally adjacent cells both reading colour *c*,
fuse their centroids weighted by coverage; if the fused point lies inside one cell, clear *c* from
the other — unless combined coverage ≥ `SPILL_TWO_COUNTERS` (1.7) × the expected single-counter
coverage, which means two real counters.

Tests: a counter on a line gives exactly one cell on 8×8 and on 4×4; two real counters are kept;
diagonal neighbours untouched.

## Task 5 — Variation measured from the physical square

**Files:** `src/tracking/boardGrid.ts` (`offsetFromSquare`), `src/tracking/BoardReader.ts`, tests.

When `boardSquares % rows === 0 && boardSquares % cols === 0`, `offset` is the distance from the
**nearest physical square centre** in square units; otherwise the cell-centre offset as today.

Tests: centred counters on a 4×4 grid over 8×8 → offset ≈ 0 (not conditional); a real shove → ≥ threshold;
non-divisor grid keeps today's behaviour.

## Task 6 — Mode: colour hold, conditional latched, settle tick for new placements only

**Files:** `src/tracking/BoardSequencerMode.ts`, test `src/__tests__/BoardSequencerMode.hold.test.ts`.

1. A settled cell keeps its `colour`; a different colour must persist for `settleWindowMs`, then the
   cell goes lost → re-settle.
2. `conditional` is latched from the **median offset over the settle window**, not recomputed while settled.
3. `justSettled` only for genuinely new placements: a re-settle after an occlusion hold or a colour hold
   sets `justReSettled` instead, so the settle tick doesn't fire.

## Task 7 — Loop-bank capture guard

**Files:** `src/songs/loopBank.ts`, `src/tracking/boardFrame.ts`, test `src/__tests__/loopBank.guard.test.ts`.

Capture only when the pattern above the bank row has been unchanged for `captureQuietMs`; capture only
sequenced-role cells; a slot is triggered only by non-control colours. Clear stays the undo.

## Task 8 — Drum volume at play time

**Files:** `src/audio/instruments/RoundRobinDrumKit.ts`, test `src/__tests__/drumKitVolume.test.ts`.

`fire` uses `volume.setValueAtTime(gainDb, time)` when a time is given, so two quick hits keep their
own volumes instead of the later one overwriting the earlier.

## Task 9 — Wire it up: engine effect amount, one writer, legend

**Files:** `src/songs/BoardSequencerEngine.ts`, `src/ui/screens/boardSequencer/useBoardRuntime.ts`,
`src/ui/screens/BoardSequencerScreen.tsx`, engine tests.

- Engine gains `setControlValues(values)`; faders glide with `controlGlideSec` via `setTargetAtTime`.
- Reverb/delay drive an **effect amount** multiplying per-channel sends, never the raw bus gain twice.
- Tone **scales** each channel's tone rather than overwriting it.
- Tempo uses `controlRanges.tempo` (60–160) and the precedence in the spec.
- The runtime runs `stepControls` on raw readings each camera frame and hands the values to the engine.
- The screen disables an on-screen control owned by a counter, with a reason, and the legend shows the
  live value with a ‖ glyph while held.

## Final verification

`npm run lint && npm run test:run`, then the manual checks in the spec's "Controls" line.
