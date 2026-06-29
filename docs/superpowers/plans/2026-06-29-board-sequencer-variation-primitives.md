# Board Sequencer — Variation Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player mark a single instrument piece as "play me every other time round" by shoving it to the edge of its grid square, turning a short loop into a breathing A/B phrase — using only the physical coloured counters.

**Architecture:** A normalised "how far off-centre" offset is measured per cell in `BoardReader`, carried through `BoardSequencerMode` as a `conditional` flag on each settled `ActiveCell`, and used by `BoardSequencerEngine` to skip conditional cells on alternate playhead laps. All decision logic lives in pure, unit-tested helpers in `boardSequencerScale.ts`. The screen renders dashed rings + an A/B cue and exposes a toggle + sensitivity slider. Off by default.

**Tech Stack:** React 19 + TypeScript (strict) + Vite + Tone.js + MediaPipe. Tests: Vitest (`npm run test:run`). Typecheck: `npm run lint` (= `tsc --noEmit`).

## Global Constraints

- TypeScript strict mode — **no `any` types** (copied from CLAUDE.md).
- All Tone.js access stays inside `BoardSequencerEngine`/`EffectChainManager`; never instantiate Tone in components.
- Latency budget: gesture-to-sound under 20 ms — the per-frame additions must be O(cells), no allocation-heavy work.
- Every user-facing threshold must be calibratable (principle #4) — the offset threshold is a persisted, slider-driven config value.
- Visual feedback for every audio event (principle #5) — conditional pieces and the current lap must be visible.
- Tolerance over precision (principle #1) — the offset threshold has a generous default dead-zone so ordinary imprecision plays every pass.
- New feature is **off by default** (`variationEnabled: false`); existing setups are unchanged until opted in.

**Spec:** `docs/superpowers/specs/2026-06-29-board-sequencer-variation-primitives-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/tracking/BoardReader.ts` | Pixels → per-cell colour + **offset** | Modify: add `offset` to `RegionSample`, compute in `sampleRegion`, propagate in `read()` |
| `src/tracking/BoardSequencerMode.ts` | Settle state machine; `CellReading`/`ActiveCell` types | Modify: `offset?` on `CellReading`; `conditional?` on `ActiveCell`; compute + emit conditional; `setVariation()` |
| `src/songs/boardSequencerScale.ts` | Pure pitch/scheduling helpers | Modify: add `conditionalFromOffset`, `lapIndex`, `firesThisLap`, `VARIATION_PARITY` |
| `src/songs/BoardSequencerEngine.ts` | Audio engine + step scheduler | Modify: gate conditional cells in `fireStep`; add `isVariationLap()` |
| `src/profiles/BoardSequencerConfig.ts` | Persisted config | Modify: add `variationEnabled` + `variationOffsetThreshold` (type, default, sanitize) |
| `src/ui/screens/BoardSequencerScreen.tsx` | Camera loop, overlay, controls | Modify: wire mode config, rings + A/B cue, toggle + slider |
| `src/__tests__/BoardReader.test.ts` | — | Add offset tests |
| `src/__tests__/boardSequencerScale.test.ts` | — | Add variation-helper tests |
| `src/__tests__/BoardSequencerMode.test.ts` | — | Add conditional-propagation tests |
| `src/__tests__/BoardSequencerConfig.test.ts` | — | Add persistence tests |

Tasks are ordered by dependency: 1 (offset) → 2 (pure helpers) → 3 (mode, needs 1+2) → 4 (engine, needs 2+3) → 5 (config) → 6 (screen, needs all).

---

### Task 1: Measure per-cell off-centre offset in BoardReader

**Files:**
- Modify: `src/tracking/BoardReader.ts` (`RegionSample` interface ~L27-34; `sampleRegion` return ~L102-110; `read()` ~L171-179)
- Modify: `src/tracking/BoardSequencerMode.ts` (`CellReading` interface L32-40)
- Test: `src/__tests__/BoardReader.test.ts`

**Interfaces:**
- Produces: `RegionSample.offset: number | null` — normalised box-offset of the dominant colour's centroid from the cell centre (0 = centre, 1 = cell edge), null when there is no centroid. `CellReading.offset?: number | null` — same value, per cell.

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/BoardReader.test.ts` inside the existing `describe('BoardReader.sampleRegion', ...)` block (it already defines `h`, `COLOURS`, and the `RgbSampler` import):

```ts
  it('a centred (uniform) red region has offset ≈ 0', () => {
    const allRed: RgbSampler = () => ({ r: 220, g: 10, b: 10 });
    const out = sampleRegion(allRed, h, 0, 0, 4, 4, COLOURS, 3);
    expect(out.offset ?? 1).toBeLessThan(0.1);
  });

  it('a red piece shoved to one side has a clearly non-zero offset', () => {
    // Cell (0,0) of a 4x4 grid spans image x∈[1.25,23.75] under `h`; sample
    // points (3/axis) land at rounded image x ≈ 1, 13, 24. Red only on the
    // right two → centroid pulled toward the edge.
    const rightSide: RgbSampler = (x) => (x > 6
      ? { r: 220, g: 10, b: 10 }
      : { r: 240, g: 240, b: 240 });
    const out = sampleRegion(rightSide, h, 0, 0, 4, 4, COLOURS, 3);
    expect(out.offset ?? 0).toBeGreaterThan(0.3);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/BoardReader.test.ts`
Expected: FAIL — `out.offset` is `undefined` (property does not exist yet), so the second assertion fails (`0` is not `> 0.3`) and TypeScript/Vitest reports `offset` missing on the result type.

- [ ] **Step 3: Add `offset` to `RegionSample` and compute it in `sampleRegion`**

In `src/tracking/BoardReader.ts`, extend the `RegionSample` interface:

```ts
export interface RegionSample {
  /** Fraction of sampled pixels matching each colour id (priority-first match). */
  fractions: Partial<Record<ColourId, number>>;
  /** The colour id with the most matching pixels (ties → earliest in priority), or null. */
  dominantId: ColourId | null;
  /** Mean position of the DOMINANT colour's matching pixels (unit-square coords), or null. */
  centroid: { x: number; y: number } | null;
  /**
   * Normalised box-offset of the centroid from the cell centre: 0 = dead centre,
   * 1 = at the cell edge (max over the two axes, so a shove toward any edge or
   * corner counts). null when there is no centroid. The reachable max is bounded
   * by INSET (sampling stops short of the true edge), so in practice ≲ 0.9.
   */
  offset: number | null;
}
```

Then in `sampleRegion`, replace the final centroid block + return (currently L102-109) with:

```ts
  let centroid: { x: number; y: number } | null = null;
  let offset: number | null = null;
  if (dominantId && dominantCount > 0) {
    centroid = {
      x: (sumX.get(dominantId) ?? 0) / dominantCount,
      y: (sumY.get(dominantId) ?? 0) / dominantCount,
    };
    const cx = (col + 0.5) / cols;
    const cy = (row + 0.5) / rows;
    const ox = Math.abs(centroid.x - cx) / (0.5 / cols);
    const oy = Math.abs(centroid.y - cy) / (0.5 / rows);
    offset = Math.min(1, Math.max(ox, oy));
  }
  return { fractions, dominantId, centroid, offset };
```

- [ ] **Step 4: Propagate `offset` onto `CellReading`**

In `src/tracking/BoardSequencerMode.ts`, add to the `CellReading` interface (after `fractions?`):

```ts
  /**
   * Normalised offset of the piece from its cell centre (0 = centre, 1 = edge),
   * or null when the cell is empty. Drives the "play every other pass" variation.
   */
  offset?: number | null;
```

In `src/tracking/BoardReader.ts` `read()`, update the destructure + push (currently L171-178):

```ts
        const { fractions, centroid, offset } = sampleRegion(
          sampler, opts.homography, row, col, opts.rows, opts.cols, opts.colours, samples,
        );
        const filledFraction = Math.max(0, ...Object.values(fractions).filter((v): v is number => v !== undefined));
        const cls = opts.recognizer.classify({ filledFraction, fractions });
        readings.push({
          row, col, occupied: cls.occupied, colour: cls.colour, centroid, fractions, offset,
        });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/BoardReader.test.ts`
Expected: PASS (all BoardReader tests, including the two new offset tests).

- [ ] **Step 6: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tracking/BoardReader.ts src/tracking/BoardSequencerMode.ts src/__tests__/BoardReader.test.ts
git commit -m "feat(board-sequencer): measure per-cell off-centre offset"
```

---

### Task 2: Pure variation helpers in boardSequencerScale

**Files:**
- Modify: `src/songs/boardSequencerScale.ts` (append new helpers)
- Test: `src/__tests__/boardSequencerScale.test.ts`

**Interfaces:**
- Produces:
  - `conditionalFromOffset(offset: number | null, enabled: boolean, threshold: number): boolean`
  - `lapIndex(beat: number, cols: number): number`
  - `firesThisLap(conditional: boolean, beat: number, cols: number): boolean`
  - `VARIATION_PARITY: number` (= 1)

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/boardSequencerScale.test.ts`. First add the imports to the second import block (L5-8) — add `conditionalFromOffset, lapIndex, firesThisLap`:

```ts
import {
  drumForRow, drumForRowChoice, drumsForStep, DEFAULT_DRUM_ROWS,
  loopLen, roleStep, strictlyAfter, pageIndexAt, faderValue,
  conditionalFromOffset, lapIndex, firesThisLap,
} from '../songs/boardSequencerScale';
```

Then add a new describe block at the end of the file:

```ts
describe('variation helpers', () => {
  it('conditionalFromOffset: enabled + offset at/over threshold → true', () => {
    expect(conditionalFromOffset(0.8, true, 0.6)).toBe(true);
    expect(conditionalFromOffset(0.6, true, 0.6)).toBe(true);
  });
  it('conditionalFromOffset: small offset (imprecision) stays every-pass', () => {
    expect(conditionalFromOffset(0.3, true, 0.6)).toBe(false);
  });
  it('conditionalFromOffset: disabled or empty cell → false', () => {
    expect(conditionalFromOffset(0.9, false, 0.6)).toBe(false);
    expect(conditionalFromOffset(null, true, 0.6)).toBe(false);
  });

  it('lapIndex: one lap = one full sweep of `cols` beats', () => {
    expect(lapIndex(0, 8)).toBe(0);
    expect(lapIndex(7, 8)).toBe(0);
    expect(lapIndex(8, 8)).toBe(1);
    expect(lapIndex(15, 8)).toBe(1);
  });

  it('firesThisLap: a non-conditional cell fires on every lap', () => {
    expect(firesThisLap(false, 3, 8)).toBe(true);
    expect(firesThisLap(false, 11, 8)).toBe(true);
  });
  it('firesThisLap: a conditional cell rests on lap A (even), fires on lap B (odd)', () => {
    expect(firesThisLap(true, 3, 8)).toBe(false); // lap 0 (A)
    expect(firesThisLap(true, 11, 8)).toBe(true); // lap 1 (B)
    expect(firesThisLap(true, 18, 8)).toBe(false); // lap 2 (A)
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/boardSequencerScale.test.ts`
Expected: FAIL — `conditionalFromOffset`/`lapIndex`/`firesThisLap` are not exported (import error).

- [ ] **Step 3: Implement the helpers**

Append to `src/songs/boardSequencerScale.ts`:

```ts
/**
 * Whether an off-centre piece counts as "conditional" (plays only every other
 * pass). `offset` is BoardReader's normalised box-offset (0 = centre, 1 = edge),
 * null when the cell is empty. The threshold's generous default keeps ordinary
 * imprecision (small offsets) playing every pass — tolerance over precision.
 */
export function conditionalFromOffset(
  offset: number | null,
  enabled: boolean,
  threshold: number,
): boolean {
  return enabled && offset !== null && offset >= threshold;
}

/** Variation laps are the ODD laps: lap 0 = full "A", lap 1 = variation "B". */
export const VARIATION_PARITY = 1;

/**
 * The lap index at a GLOBAL beat — one lap is one full left-to-right sweep of
 * the board (`cols` beats). Defensive on bad `cols`/negative beats.
 */
export function lapIndex(beat: number, cols: number): number {
  if (cols < 1) return 0;
  return Math.floor(beat / cols);
}

/**
 * Whether a cell sounds on the lap containing `beat`. Non-conditional cells
 * always sound; conditional (off-centre) cells sound only on variation laps, so
 * the board alternates a full lap (A) and a full-plus-variations lap (B).
 */
export function firesThisLap(conditional: boolean, beat: number, cols: number): boolean {
  if (!conditional) return true;
  const lap = lapIndex(beat, cols);
  return (((lap % 2) + 2) % 2) === VARIATION_PARITY;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/boardSequencerScale.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/songs/boardSequencerScale.ts src/__tests__/boardSequencerScale.test.ts
git commit -m "feat(board-sequencer): pure variation helpers (offset→conditional, lap gating)"
```

---

### Task 3: Carry the `conditional` flag through BoardSequencerMode

**Files:**
- Modify: `src/tracking/BoardSequencerMode.ts` (`ActiveCell` L47-50; `BoardSettleConfig` L58-68; `CellState` L70-79; constructor L90; `step()` L96-179)
- Test: `src/__tests__/BoardSequencerMode.test.ts`

**Interfaces:**
- Consumes: `CellReading.offset` (Task 1), `conditionalFromOffset` (Task 2).
- Produces:
  - `ActiveCell.conditional?: boolean` — present + `true` only when the settled piece is off-centre past the threshold; absent otherwise.
  - `BoardSettleConfig.variationEnabled?: boolean`, `BoardSettleConfig.variationOffsetThreshold?: number` (both optional, default off / 0.6).
  - `BoardSequencerMode.setVariation(enabled: boolean, offsetThreshold: number): void` — live calibration update.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/BoardSequencerMode.test.ts` (the file already imports `BoardSequencerMode`, `CellReading`, and defines `cfg`):

```ts
const redAtOff = (
  row: number, col: number, x: number, y: number, offset: number,
): CellReading => ({ row, col, occupied: true, colour: 'red', centroid: { x, y }, offset });

const settle = (
  m: BoardSequencerMode, reading: CellReading,
): ReturnType<BoardSequencerMode['step']> => {
  let res = m.step([reading], 16, 0);
  for (let t = 16; t <= 1000; t += 16) res = m.step([reading], 16, t);
  return res;
};

describe('BoardSequencerMode variation (off-centre = conditional)', () => {
  const varCfg = { ...cfg, variationEnabled: true, variationOffsetThreshold: 0.6 };

  it('a settled off-centre piece is marked conditional', () => {
    const m = new BoardSequencerMode(varCfg);
    const res = settle(m, redAtOff(0, 0, 0.5, 0.5, 0.8));
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red', conditional: true }]);
  });

  it('a centred piece carries no conditional flag', () => {
    const m = new BoardSequencerMode(varCfg);
    const res = settle(m, redAtOff(0, 0, 0.5, 0.5, 0.2));
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
  });

  it('variation disabled → an off-centre piece is not conditional', () => {
    const m = new BoardSequencerMode({ ...cfg, variationEnabled: false });
    const res = settle(m, redAtOff(0, 0, 0.5, 0.5, 0.9));
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
  });

  it('nudging a settled piece off-centre flips it conditional live (no re-settle)', () => {
    const m = new BoardSequencerMode(varCfg);
    let res = settle(m, redAtOff(0, 0, 0.5, 0.5, 0.1));
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red' }]);
    res = m.step([redAtOff(0, 0, 0.5, 0.5, 0.85)], 16, 1016);
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red', conditional: true }]);
  });

  it('setVariation updates the calibration live', () => {
    const m = new BoardSequencerMode({ ...cfg, variationEnabled: false });
    settle(m, redAtOff(0, 0, 0.5, 0.5, 0.9));
    m.setVariation(true, 0.6);
    const res = m.step([redAtOff(0, 0, 0.5, 0.5, 0.9)], 16, 1016);
    expect(res.activeCells).toEqual([{ row: 0, col: 0, colour: 'red', conditional: true }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/BoardSequencerMode.test.ts`
Expected: FAIL — `setVariation` does not exist; `activeCells` lack `conditional`; `BoardSettleConfig` rejects `variationEnabled`/`variationOffsetThreshold`.

- [ ] **Step 3: Extend the interfaces**

In `src/tracking/BoardSequencerMode.ts`:

Add the import near the top (after the `boardColours` import):

```ts
import { conditionalFromOffset } from '../songs/boardSequencerScale';
```

Extend `ActiveCell`:

```ts
/** A settled cell plus the colour of the piece occupying it. */
export interface ActiveCell extends CellRef {
  colour: PieceColour;
  /** True only when shoved off-centre → plays every other pass. Absent = every pass. */
  conditional?: boolean;
}
```

Extend `BoardSettleConfig` (add at the end of the interface, before the closing brace):

```ts
  /** Variation: when true, a piece shoved past the offset threshold plays every other pass. */
  variationEnabled?: boolean;
  /** Normalised centroid offset (0=centre, 1=edge) at/above which a piece is conditional. */
  variationOffsetThreshold?: number;
```

Extend `CellState` (add field):

```ts
  /** Whether the occupying piece is currently off-centre past the threshold. */
  conditional: boolean;
```

- [ ] **Step 4: Store calibration, add `setVariation`, compute + emit `conditional`**

Replace the constructor (L90) with one that captures the calibration into mutable fields:

```ts
  private variationEnabled: boolean;
  private variationOffsetThreshold: number;

  constructor(private readonly cfg: BoardSettleConfig) {
    this.variationEnabled = cfg.variationEnabled ?? false;
    this.variationOffsetThreshold = cfg.variationOffsetThreshold ?? 0.6;
  }

  /** Live-update the variation calibration (safe to call while running). */
  setVariation(enabled: boolean, offsetThreshold: number): void {
    this.variationEnabled = enabled;
    this.variationOffsetThreshold = offsetThreshold;
  }
```

In `step()`, initialise `conditional` when creating a new `CellState` (the `if (!st)` block, ~L107-110):

```ts
        st = {
          lastCentroid: null, velocity: 0, stillMs: 0, movingMs: 0, lostMs: 0, phase: 'idle',
          colour: 'red', conditional: false,
        };
```

Inside the `if (isPiece && r.centroid && r.colour)` branch, right after `st.colour = r.colour;` (~L117), add:

```ts
        st.conditional = conditionalFromOffset(
          r.offset ?? null, this.variationEnabled, this.variationOffsetThreshold,
        );
```

Update the active-cell emission loop (L170-176) to attach the flag only when true:

```ts
    const activeCells: ActiveCell[] = [];
    for (const [k, st] of this.states) {
      if (st.phase === 'settled') {
        const [row, col] = k.split(',').map(Number);
        const cell: ActiveCell = { row, col, colour: st.colour };
        if (st.conditional) cell.conditional = true;
        activeCells.push(cell);
      }
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/BoardSequencerMode.test.ts`
Expected: PASS (the new variation tests plus all pre-existing settle tests, which still see plain `{row,col,colour}` active cells because `conditional` is omitted when false).

- [ ] **Step 6: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tracking/BoardSequencerMode.ts src/__tests__/BoardSequencerMode.test.ts
git commit -m "feat(board-sequencer): carry off-centre 'conditional' flag through settle"
```

---

### Task 4: Gate conditional cells to variation laps in the engine

**Files:**
- Modify: `src/songs/BoardSequencerEngine.ts` (import L16; `fireStep` ~L477-548; add `isVariationLap()` near `getPlayheadCol` ~L262-269)

**Interfaces:**
- Consumes: `ActiveCell.conditional` (Task 3), `firesThisLap` (Task 2).
- Produces: `BoardSequencerEngine.isVariationLap(): boolean` — true when the current lap is a variation (B) lap; for the overlay cue.

**Note on testing:** the engine is audio-bound (Tone.js, voices, AudioContext) and has no unit-test harness in this repo. The *decision* logic — `firesThisLap` — is fully unit-tested in Task 2. This task only wires that pure function into the scheduler and exposes `isVariationLap()`, both verified by `npm run lint` and the manual checklist in Task 6. Do not add a new engine test file.

- [ ] **Step 1: Import the helper**

In `src/songs/BoardSequencerEngine.ts`, add `firesThisLap` to the existing `boardSequencerScale` import (L16):

```ts
import { voicingForCells, degreeMidi, chordDegreeMidi, drumForRow, DEFAULT_DRUM_ROWS, loopLen, roleStep, strictlyAfter, pageIndexAt, faderValue, firesThisLap } from './boardSequencerScale';
```

- [ ] **Step 2: Gate conditional cells in `fireStep`**

In `fireStep`, find the per-role polyrhythm column check (currently L510-511):

```ts
      const cat = this.loopCategory(role);
      if (cell.col !== roleStep(beat, this.rawLoop(cat), this.cfg.cols)) continue;
```

Immediately after it, add the variation gate:

```ts
      // Variation: an off-centre ("conditional") cell plays only on variation laps,
      // so the loop alternates a full pass and a full-plus-variations pass.
      if (!firesThisLap(cell.conditional ?? false, beat, this.cfg.cols)) continue;
```

- [ ] **Step 3: Add `isVariationLap()`**

Add this method just after `getPlayheadCol` (after L269):

```ts
  /** Whether the current lap is a variation (B) lap — drives the overlay A/B cue. */
  isVariationLap(): boolean {
    const beat = this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((Tone.now() - this.startSec) / (60 / this.cfg.bpm));
    return firesThisLap(true, beat, this.cfg.cols);
  }
```

- [ ] **Step 4: Typecheck + full test run**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS (no regressions; engine has no unit tests, so this confirms the wiring typechecks and nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add src/songs/BoardSequencerEngine.ts
git commit -m "feat(board-sequencer): play off-centre cells only on variation laps"
```

---

### Task 5: Persist the variation calibration

**Files:**
- Modify: `src/profiles/BoardSequencerConfig.ts` (`BoardSequencerStored` interface ~L34-87; `DEFAULT_BOARD_SEQUENCER_CONFIG` ~L99-132; `sanitize` ~L228-262)
- Test: `src/__tests__/BoardSequencerConfig.test.ts`

**Interfaces:**
- Produces: `BoardSequencerStored.variationEnabled: boolean` (default `false`), `BoardSequencerStored.variationOffsetThreshold: number` (default `0.6`).

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('BoardSequencerConfig', ...)` block in `src/__tests__/BoardSequencerConfig.test.ts`:

```ts
  it('round-trips the variation calibration', () => {
    const cfg: BoardSequencerStored = {
      ...DEFAULT_BOARD_SEQUENCER_CONFIG, variationEnabled: true, variationOffsetThreshold: 0.55,
    };
    saveBoardSequencerConfig(cfg);
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.variationEnabled).toBe(true);
    expect(loaded?.variationOffsetThreshold).toBeCloseTo(0.55);
  });

  it('defaults variation OFF and threshold to 0.6 when absent', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 90, channels: [] }));
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.variationEnabled).toBe(false);
    expect(loaded?.variationOffsetThreshold).toBe(0.6);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: FAIL — `variationEnabled`/`variationOffsetThreshold` are `undefined` on the loaded config (and TypeScript flags the unknown properties on the `BoardSequencerStored` literal).

- [ ] **Step 3: Add the fields, defaults, and sanitisation**

In `src/profiles/BoardSequencerConfig.ts`:

Add to the `BoardSequencerStored` interface, right after the `minFilledFraction: number;` line:

```ts
  /** Variation: off-centre pieces play every other pass when enabled. */
  variationEnabled: boolean;
  /** Normalised offset (0=centre, 1=edge) at/above which a piece is conditional. */
  variationOffsetThreshold: number;
```

Add to `DEFAULT_BOARD_SEQUENCER_CONFIG`, right after the `minFilledFraction: 0.1,` line:

```ts
  variationEnabled: false,
  variationOffsetThreshold: 0.6,
```

Add to the object returned by `sanitize`, right after the `minFilledFraction: num(o.minFilledFraction, d.minFilledFraction),` line:

```ts
    variationEnabled: o.variationEnabled === true,
    variationOffsetThreshold: num(o.variationOffsetThreshold, d.variationOffsetThreshold),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: PASS (new tests plus all existing config tests).

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/profiles/BoardSequencerConfig.ts src/__tests__/BoardSequencerConfig.test.ts
git commit -m "feat(board-sequencer): persist variation enabled + offset threshold"
```

---

### Task 6: Wire the screen — overlay rings, A/B cue, toggle + sensitivity slider

**Files:**
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (imports; `drawOverlay` ~L280-336; rAF loop body ~L383-412; mode construction ~L499-505; controls section ~L900-906)

**Interfaces:**
- Consumes: `cfg.variationEnabled`/`cfg.variationOffsetThreshold` (Task 5), `conditionalFromOffset` (Task 2), `CellReading.offset` (Task 1), `modeRef.current.setVariation` (Task 3), `engineRef.current.isVariationLap()` (Task 4).

**Note on testing:** this is React/canvas UI with no unit-test harness in this repo. Verify with `npm run lint` + `npm run test:run` (no regressions) and the manual checklist in Step 6. The variation *logic* is already unit-tested in Tasks 1–3.

- [ ] **Step 1: Import the helper**

Add near the other `tracking`/`songs` imports at the top of `src/ui/screens/BoardSequencerScreen.tsx`:

```ts
import { conditionalFromOffset } from '../../songs/boardSequencerScale';
```

- [ ] **Step 2: Pass the calibration into the mode at construction**

In the mode construction (~L499-505), add the two fields:

```ts
    modeRef.current = new BoardSequencerMode({
      settleWindowMs: cfg.settleWindowMs,
      velocityFloor: cfg.velocityFloor,
      velocitySmoothing: cfg.velocitySmoothing,
      occupancyGraceMs: cfg.occupancyGraceMs,
      motionConfirmMs: cfg.motionConfirmMs,
      variationEnabled: cfg.variationEnabled,
      variationOffsetThreshold: cfg.variationOffsetThreshold,
    });
```

- [ ] **Step 3: Compute the conditional set + lap cue each frame and push live calibration**

In the rAF loop, locate where `readings` is produced and `occupied`/`byColour` are built (~L387-398). Right after that loop (before the `let activeArr` block ~L399), add:

```ts
          // Variation: keep the mode's calibration live, and mark off-centre
          // pieces for the overlay (computed from the live readings so the ring
          // shows the instant a piece is shoved, before it even settles).
          modeRef.current?.setVariation(cfg.variationEnabled, cfg.variationOffsetThreshold);
          const conditional = new Set<string>();
          if (cfg.variationEnabled) {
            for (const rd of readings) {
              if (rd.occupied && conditionalFromOffset(
                rd.offset ?? null, cfg.variationEnabled, cfg.variationOffsetThreshold,
              )) {
                conditional.add(`${rd.row},${rd.col}`);
              }
            }
          }
```

Then update the `drawOverlay` call (currently L412). Replace it with:

```ts
          const isVarLap = runningRef.current && engineRef.current
            ? engineRef.current.isVariationLap()
            : false;
          drawOverlay(occupied, activeMap, cfg, playCol, swatchById, conditional, isVarLap);
```

- [ ] **Step 4: Render the rings + A/B cue in `drawOverlay`**

Update the `drawOverlay` callback signature (L280-287) to accept the two new params:

```ts
  const drawOverlay = useCallback(
    (
      occupied: Map<string, PieceColour>,
      activeMap: Map<string, PieceColour>,
      cfg: BoardSequencerStored,
      playCol: number,
      swatchById: Map<ColourId, string>,
      conditional: Set<string>,
      isVarLap: boolean,
    ) => {
```

Inside the cell loop, right after the existing `ctx.stroke();` that closes each cell (currently L331), add the dashed ring:

```ts
          if (conditional.has(key)) {
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = isVarLap ? 'rgba(255,210,80,0.95)' : 'rgba(255,210,80,0.5)';
            ctx.stroke(); // re-stroke the current cell quad, dashed
            ctx.restore();
          }
```

After the row/col `for` loops close (just before the end of the function, after L333), add the A/B cue:

```ts
      if (runningRef.current) {
        ctx.save();
        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = isVarLap ? 'rgba(255,210,80,0.95)' : 'rgba(80,200,255,0.85)';
        ctx.fillText(isVarLap ? 'B' : 'A', 12, 30);
        ctx.restore();
      }
```

(`drawOverlay`'s dependency array stays `[]` — it already reads `runningRef`/`overlayRef`/`videoRef` as refs.)

- [ ] **Step 5: Add the toggle + sensitivity slider**

In the controls, right after the existing "Min fill" `<label>…</label>` block (ends ~L906), add:

```tsx
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox" checked={config.variationEnabled}
                onChange={(e) => update({ variationEnabled: e.target.checked })}
              />
              Variation — shove a piece to its edge = every other pass
            </label>
            {config.variationEnabled && (
              <label>
                Shove needed {Math.round(config.variationOffsetThreshold * 100)}%
                <input
                  type="range" min={30} max={85}
                  value={Math.round(config.variationOffsetThreshold * 100)}
                  onChange={(e) => update({ variationOffsetThreshold: Number(e.target.value) / 100 })}
                />
              </label>
            )}
```

- [ ] **Step 6: Typecheck, test, and manually verify**

Run: `npm run lint`
Expected: no errors.

Run: `npm run test:run`
Expected: PASS (all suites, no regressions).

Manual verification (run `npm run dev`, open the Board Sequencer, calibrate a colour, press start):
- [ ] With **Variation off** (default): behaviour is unchanged — every piece plays every pass; no rings; no A/B letter.
- [ ] Turn **Variation on**. A centred piece still plays every pass and shows **no** dashed ring.
- [ ] **Shove a piece to its square's edge** → a dashed yellow ring appears immediately; it now sounds only on alternate laps.
- [ ] The **A / B letter** (top-left) alternates each lap; the dashed-ring piece is bright on **B**, dim on **A**, and is audible only on **B**.
- [ ] Drag **"Shove needed"** down → a smaller nudge triggers the ring; drag up → only a big shove does. Tune until it feels right on the real board.
- [ ] Reload the page → the toggle + slider value persist.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/BoardSequencerScreen.tsx
git commit -m "feat(board-sequencer): variation rings, A/B lap cue, toggle + sensitivity"
```

---

## Self-Review

**Spec coverage:**
- Position-offset mechanism → Task 1 (measure) + Task 3 (flag). ✓
- Deterministic every-other-pass, global parity → Task 2 (`firesThisLap`, `VARIATION_PARITY`) + Task 4 (gate). ✓
- Generous calibratable dead-zone → Task 2 (`conditionalFromOffset` threshold) + Task 5 (persist) + Task 6 (slider). ✓
- Master on/off, off by default → Task 5 (`variationEnabled: false`) + Task 6 (toggle). ✓
- Visual feedback (dashed ring + A/B cue, live on placement) → Task 6. ✓
- Instrument-safe (piece keeps its colour) → inherent: offset rides on the existing piece; no colour consumed. ✓
- Scope guards (pages/polyrhythm deferred; binary; global parity) → lap counting is against `cols` only (Task 2/4); snapshot page cells have no `conditional` so they play every pass (acceptable for v1). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code and exact commands. ✓

**Type consistency:** `offset: number | null` (RegionSample) → `offset?: number | null` (CellReading) → `conditionalFromOffset(offset, enabled, threshold)` → `ActiveCell.conditional?: boolean` → `firesThisLap(cell.conditional ?? false, beat, cols)`. `setVariation(enabled, offsetThreshold)` matches its call in Task 6. `isVariationLap()` defined in Task 4, called in Task 6. Config keys `variationEnabled`/`variationOffsetThreshold` identical across Tasks 5 and 6. ✓

**Known v1 limitation (documented, intentional):** "every other pass" counts against the base board sweep; interaction with `numPages` and per-role polyrhythm loop lengths is deferred to roadmap slices 2–3. Captured page snapshots do not carry `conditional` (they replay every pass).
