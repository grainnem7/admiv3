# Board Sequencer Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, opt-in "Slide & Settle" board-sequencer mode on its own screen: a webcam reads red draughts pieces on a 4×4 cell block via a four-corner homography, slide-and-settle activation drives a looping pentatonic step sequencer through the existing sampled-voice + shared-effects layer.

**Architecture:** Pure, unit-tested core (homography math, piece recognition, slide-and-settle state machine, pentatonic scale/scheduling) feeds an impure `BoardReader` (camera pixels) and a `BoardSequencerEngine` (internal Web-Audio-clock scheduler + sampled voices + confirmation tick) routed into `EffectChainManager.getInput()`. A dedicated `BoardSequencerScreen` owns the lifecycle. No song/`chordLookup` coupling, no `Tone.Transport`, no reuse of the `found===false` mute semantic, no new heavy dependencies.

**Tech Stack:** React 19 + TypeScript (strict) + Vite, Tone.js (sampled voices via existing `SamplerPlayer`), MediaPipe-free (colour-only reading), Vitest. Lint = `npm run lint` (`tsc --noEmit`). Tests = `npm run test:run` (vitest). Single file: `npx vitest run <path>`.

**Spec:** `docs/superpowers/specs/2026-06-02-board-sequencer-mode.md`

---

## File Structure

**New (pure / testable core):**
- `src/utils/homography.ts` — 4-point DLT homography + point apply + unit-square cell-centre helper.
- `src/tracking/PieceRecognizer.ts` — recognition dial (L1 occupancy, L2 red; black/identity documented stubs) + colour→instrument map.
- `src/tracking/BoardSequencerMode.ts` — pure slide-and-settle state machine.
- `src/songs/boardSequencerScale.ts` — pentatonic row→MIDI + per-step note selection + clock step index.

**New (persistence):**
- `src/profiles/BoardSequencerConfig.ts` — localStorage persistence (mirrors `SurfacePressConfig`).

**New (impure glue):**
- `src/tracking/BoardReader.ts` — video → canvas → per-cell red fraction + centroid (reuses ColorTracker HSV).
- `src/songs/voices/BoardSequencerVoice.ts` — sampled voice (SamplerPlayer + palette).
- `src/songs/BoardSequencerEngine.ts` — clock + scheduler + tick + active-matrix + bus wiring.

**New (UI):**
- `src/ui/screens/BoardSequencerScreen.tsx` — screen lifecycle (camera, calibration, frame loop, controls).
- `src/ui/components/board/BoardCalibrationOverlay.tsx` — four-corner click capture.
- `src/ui/components/board/WarpedBoardView.tsx` — facilitator warped grid + active cells + playhead.

**Edited (additive, non-breaking):**
- `src/state/types.ts` — extend `Screen` union with `'boardSequencer'`.
- `src/ui/App.tsx` — add screen case + import.
- `src/ui/screens/index.ts` — export `BoardSequencerScreen`.
- `src/ui/screens/WelcomeScreen.tsx` — add a nav entry to reach the Board screen.
- `src/profiles/InputProfileManager.ts` — delegate board-config get/save/clear.

**Tests:** `src/__tests__/homography.test.ts`, `PieceRecognizer.test.ts`, `BoardSequencerMode.test.ts`, `boardSequencerScale.test.ts`, `BoardSequencerConfig.test.ts`, `BoardReader.test.ts`.

---

## Task 1: Homography utility

**Files:**
- Create: `src/utils/homography.ts`
- Test: `src/__tests__/homography.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/homography.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeHomography,
  applyHomography,
  cellCentreUnit,
  UNIT_SQUARE,
  type Point,
} from '../utils/homography';

const close = (a: Point, b: Point, eps = 1e-6) =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

describe('homography', () => {
  it('maps the unit square to a scaled square (identity-like)', () => {
    const dst: Point[] = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ];
    const h = computeHomography(UNIT_SQUARE, dst);
    expect(close(applyHomography(h, { x: 0.5, y: 0.5 }), { x: 50, y: 50 }, 1e-3)).toBe(true);
  });

  it('maps each unit-square corner exactly onto an oblique (trapezoid) target', () => {
    // Oblique camera view: top edge narrower than bottom edge.
    const dst: Point[] = [
      { x: 120, y: 80 },  // TL
      { x: 520, y: 80 },  // TR
      { x: 600, y: 400 }, // BR
      { x: 40, y: 400 },  // BL
    ];
    const h = computeHomography(UNIT_SQUARE, dst);
    expect(close(applyHomography(h, { x: 0, y: 0 }), dst[0], 1e-3)).toBe(true);
    expect(close(applyHomography(h, { x: 1, y: 0 }), dst[1], 1e-3)).toBe(true);
    expect(close(applyHomography(h, { x: 1, y: 1 }), dst[2], 1e-3)).toBe(true);
    expect(close(applyHomography(h, { x: 0, y: 1 }), dst[3], 1e-3)).toBe(true);
  });

  it('cellCentreUnit places centres at the middle of each cell', () => {
    expect(cellCentreUnit(0, 0, 4, 4)).toEqual({ x: 0.125, y: 0.125 });
    expect(cellCentreUnit(3, 3, 4, 4)).toEqual({ x: 0.875, y: 0.875 });
  });

  it('round-trips a cell centre grid→image and back to the right cell', () => {
    const dst: Point[] = [
      { x: 120, y: 80 }, { x: 520, y: 80 }, { x: 600, y: 400 }, { x: 40, y: 400 },
    ];
    const h = computeHomography(UNIT_SQUARE, dst);
    const c = cellCentreUnit(1, 2, 4, 4); // row 1, col 2
    const img = applyHomography(h, c);
    // image point lies strictly inside the trapezoid bounding box
    expect(img.x).toBeGreaterThan(40);
    expect(img.x).toBeLessThan(600);
    expect(img.y).toBeGreaterThan(80);
    expect(img.y).toBeLessThan(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/homography.test.ts`
Expected: FAIL — cannot resolve `../utils/homography`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/homography.ts
/**
 * Four-point perspective homography (DLT) with minimal dependencies.
 *
 * computeHomography(src, dst) returns the 3x3 matrix (row-major, 9 numbers)
 * mapping src points → dst points. For the board we pass src = UNIT_SQUARE
 * (warped grid space) and dst = the four clicked image corners, so
 * applyHomography(H, gridPoint) yields the image pixel to sample.
 */

export interface Point {
  x: number;
  y: number;
}

export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

/** Unit-square corners in TL, TR, BR, BL order. */
export const UNIT_SQUARE: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Solve a square linear system A x = b via Gaussian elimination (partial pivot). */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Augmented matrix
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Partial pivot
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (pivot !== col) {
      const tmp = m[col];
      m[col] = m[pivot];
      m[pivot] = tmp;
    }
    const pv = m[col][col];
    if (Math.abs(pv) < 1e-12) {
      throw new Error('homography: degenerate corner configuration');
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / pv;
      for (let c = col; c <= n; c++) {
        m[r][c] -= factor * m[col][c];
      }
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

export function computeHomography(src: Point[], dst: Point[]): Mat3 {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error('homography: need exactly 4 point correspondences');
  }
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const h = solveLinear(A, b); // 8 unknowns; h33 = 1
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(h: Mat3, p: Point): Point {
  const denom = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / denom,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / denom,
  };
}

/** Centre of grid cell (row, col) in unit-square coords; row 0 = top, col 0 = left. */
export function cellCentreUnit(row: number, col: number, rows: number, cols: number): Point {
  return { x: (col + 0.5) / cols, y: (row + 0.5) / rows };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/homography.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/homography.ts src/__tests__/homography.test.ts
git commit -m "feat(board-sequencer): four-corner homography utility"
```

---

## Task 2: PieceRecognizer (recognition dial)

**Files:**
- Create: `src/tracking/PieceRecognizer.ts`
- Test: `src/__tests__/PieceRecognizer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/PieceRecognizer.test.ts
import { describe, it, expect } from 'vitest';
import {
  OccupancyRecognizer,
  RedColourRecognizer,
  COLOUR_INSTRUMENT,
} from '../tracking/PieceRecognizer';

describe('PieceRecognizer', () => {
  it('OccupancyRecognizer: occupied iff filledFraction >= threshold, colour always null', () => {
    const r = new OccupancyRecognizer(0.25);
    expect(r.classify({ filledFraction: 0.1, redFraction: 0.1 })).toEqual({ occupied: false, colour: null });
    expect(r.classify({ filledFraction: 0.25, redFraction: 0 })).toEqual({ occupied: true, colour: null });
    expect(r.level).toBe('occupancy');
  });

  it('RedColourRecognizer: red iff occupied and redFraction >= threshold', () => {
    const r = new RedColourRecognizer(0.25);
    expect(r.classify({ filledFraction: 0.1, redFraction: 0.1 })).toEqual({ occupied: false, colour: null });
    expect(r.classify({ filledFraction: 0.4, redFraction: 0.1 })).toEqual({ occupied: true, colour: null });
    expect(r.classify({ filledFraction: 0.4, redFraction: 0.4 })).toEqual({ occupied: true, colour: 'red' });
    expect(r.level).toBe('colour');
  });

  it('exposes a red→instrument hook', () => {
    expect(COLOUR_INSTRUMENT.red).toBe('electricPiano');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/PieceRecognizer.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tracking/PieceRecognizer.ts
/**
 * Recognition dial for a warped board cell crop.
 *
 *   Level 1 OCCUPANCY — filled or empty (implemented).
 *   Level 2 COLOUR    — red now (implemented); black documented below.
 *   Level 3 IDENTITY  — Scrabble letters (future; documented insertion point only).
 *
 * The camera-facing BoardReader produces a CellSample (fractions); the
 * recognizer turns it into a CellClassification. Swapping the recognizer
 * changes the recognition level without touching the slide-and-settle core.
 */

export type RecognitionLevel = 'occupancy' | 'colour' | 'identity';

export interface CellSample {
  /** Fraction of sampled pixels that are "occupied" (here: same as redFraction for red-only). */
  filledFraction: number;
  /** Fraction of sampled pixels matching the calibrated red band. */
  redFraction: number;
}

export interface CellClassification {
  occupied: boolean;
  colour: 'red' | 'black' | null;
  /** LEVEL 3 (future): Scrabble-letter identity. Never set today. */
  identity?: string;
}

export interface PieceRecognizer {
  readonly level: RecognitionLevel;
  classify(sample: CellSample): CellClassification;
}

/** Level 1: occupancy only. */
export class OccupancyRecognizer implements PieceRecognizer {
  readonly level: RecognitionLevel = 'occupancy';
  constructor(private readonly minFilledFraction: number) {}
  classify(sample: CellSample): CellClassification {
    return { occupied: sample.filledFraction >= this.minFilledFraction, colour: null };
  }
}

/** Level 2: red colour. */
export class RedColourRecognizer implements PieceRecognizer {
  readonly level: RecognitionLevel = 'colour';
  constructor(private readonly minFilledFraction: number) {}
  classify(sample: CellSample): CellClassification {
    const occupied = sample.filledFraction >= this.minFilledFraction;
    const colour: CellClassification['colour'] =
      occupied && sample.redFraction >= this.minFilledFraction ? 'red' : null;
    // LEVEL 2 (future, black): add a low-value/low-saturation test on a
    // separate blackFraction → colour: 'black'. Out of scope now.
    // LEVEL 3 (future, identity): OCR the cell crop → classification.identity.
    return { occupied, colour };
  }
}

/**
 * Colour → instrument palette key. Only 'red' is wired today; adding
 * `black: 'bassElectric'` later (with a black recognizer) is the seam for a
 * second colour selecting a second instrument.
 */
export const COLOUR_INSTRUMENT: Partial<Record<'red' | 'black', string>> = {
  red: 'electricPiano',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/PieceRecognizer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tracking/PieceRecognizer.ts src/__tests__/PieceRecognizer.test.ts
git commit -m "feat(board-sequencer): PieceRecognizer dial (L1 occupancy, L2 red)"
```

---

## Task 3: BoardSequencerMode (slide-and-settle core)

**Files:**
- Create: `src/tracking/BoardSequencerMode.ts`
- Test: `src/__tests__/BoardSequencerMode.test.ts`

This is the heart of the mode. Velocity is in unit-square units per ms. Tests use `velocitySmoothing: 1` (instantaneous) for deterministic asserts.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/BoardSequencerMode.test.ts
import { describe, it, expect } from 'vitest';
import { BoardSequencerMode, type CellReading } from '../tracking/BoardSequencerMode';

const cfg = {
  settleWindowMs: 600,
  velocityFloor: 0.0005, // unit-square units / ms
  velocitySmoothing: 1,  // instantaneous for deterministic tests
  occupancyGraceMs: 150,
};

const redAt = (row: number, col: number, x: number, y: number): CellReading => ({
  row, col, occupied: true, colour: 'red', centroid: { x, y },
});
const empty = (row: number, col: number): CellReading => ({
  row, col, occupied: false, colour: null, centroid: null,
});

describe('BoardSequencerMode slide-and-settle', () => {
  it('a piece in transit never fires', () => {
    const m = new BoardSequencerMode(cfg);
    let x = 0.1;
    let res = m.step([redAt(0, 0, x, 0.5)], 16, 0); // first frame: no prior centroid
    for (let t = 16; t < 2000; t += 16) {
      x += 0.01; // 0.01 / 16ms ≈ 0.000625 > floor → moving
      res = m.step([redAt(0, 0, x, 0.5)], 16, t);
    }
    expect(res.activeCells).toHaveLength(0);
  });

  it('a still piece becomes active exactly once after the settle window', () => {
    const m = new BoardSequencerMode(cfg);
    m.step([redAt(0, 0, 0.5, 0.5)], 16, 0); // arrival frame (treated as moving)
    let res = m.step([redAt(0, 0, 0.5, 0.5)], 16, 16);
    expect(res.activeCells).toHaveLength(0); // still < 600ms
    let settledCount = 0;
    for (let t = 32; t <= 1000; t += 16) {
      res = m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
      settledCount += res.justSettled.length;
    }
    expect(res.activeCells).toEqual([{ row: 0, col: 0 }]);
    expect(settledCount).toBe(1); // fires once, not every frame
  });

  it('moving a settled piece deactivates the old cell immediately', () => {
    const m = new BoardSequencerMode(cfg);
    // settle on (0,0)
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.2, 0.2)], 16, t);
    // now jump (piece leaves (0,0), arrives (0,1)) — big move → velocity high
    const res = m.step([empty(0, 0), redAt(0, 1, 0.7, 0.2)], 16, 816);
    expect(res.justDeactivated).toContainEqual({ row: 0, col: 0 });
    expect(res.activeCells).not.toContainEqual({ row: 0, col: 0 });
  });

  it('the destination cell activates after settling', () => {
    const m = new BoardSequencerMode(cfg);
    let res = m.step([empty(0, 0), redAt(0, 1, 0.7, 0.2)], 16, 0); // arrival
    for (let t = 16; t <= 800; t += 16) {
      res = m.step([empty(0, 0), redAt(0, 1, 0.7, 0.2)], 16, t);
    }
    expect(res.activeCells).toEqual([{ row: 0, col: 1 }]);
  });

  it('a single dropped frame does not deactivate a settled cell', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
    // one frame the blob is briefly lost (finger occlusion)
    let res = m.step([empty(0, 0)], 16, 816);
    expect(res.activeCells).toEqual([{ row: 0, col: 0 }]); // within grace
    // re-appears next frame, still settled
    res = m.step([redAt(0, 0, 0.5, 0.5)], 16, 832);
    expect(res.activeCells).toEqual([{ row: 0, col: 0 }]);
  });

  it('sustained occupancy loss deactivates after the grace window', () => {
    const m = new BoardSequencerMode(cfg);
    for (let t = 0; t <= 800; t += 16) m.step([redAt(0, 0, 0.5, 0.5)], 16, t);
    let res = { activeCells: [{ row: 0, col: 0 }] } as ReturnType<BoardSequencerMode['step']>;
    for (let t = 816; t <= 1100; t += 16) res = m.step([empty(0, 0)], 16, t);
    expect(res.activeCells).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/BoardSequencerMode.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tracking/BoardSequencerMode.ts
/**
 * Slide-and-settle: the pure heart of the board sequencer. No audio, no DOM.
 * Sibling of SurfacePressMode.
 *
 * A cell becomes SETTLED_ACTIVE only when occupied by a red piece whose
 * velocity has stayed below `velocityFloor` for `settleWindowMs`. A piece in
 * transit (velocity >= floor) never accumulates still-time, so it never fires.
 * Movement of a settled piece deactivates its cell immediately; brief blob
 * loss (occlusion) is absorbed for `occupancyGraceMs` before deactivating.
 *
 * This deliberately does NOT use the baton `found === false` mute semantic:
 * occupancy comes from the recognizer's filled fraction, and a single dropped
 * frame does not mute.
 */

export interface Point {
  x: number;
  y: number;
}

export interface CellReading {
  row: number;
  col: number;
  occupied: boolean;
  colour: 'red' | 'black' | null;
  centroid: Point | null;
}

export interface CellRef {
  row: number;
  col: number;
}

export interface BoardStepResult {
  activeCells: CellRef[];
  justSettled: CellRef[];
  justDeactivated: CellRef[];
}

export interface BoardSettleConfig {
  settleWindowMs: number;
  /** Unit-square units per millisecond below which a piece counts as "still". */
  velocityFloor: number;
  /** Velocity low-pass factor 0..1 (1 = instantaneous). */
  velocitySmoothing: number;
  /** A settled cell tolerates this much occupancy loss before deactivating. */
  occupancyGraceMs: number;
}

interface CellState {
  lastCentroid: Point | null;
  velocity: number;
  stillMs: number;
  lostMs: number;
  phase: 'idle' | 'settled';
}

const keyOf = (row: number, col: number): string => `${row},${col}`;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class BoardSequencerMode {
  private readonly states = new Map<string, CellState>();

  constructor(private readonly cfg: BoardSettleConfig) {}

  reset(): void {
    this.states.clear();
  }

  step(readings: CellReading[], dtMs: number, _nowMs: number): BoardStepResult {
    const { settleWindowMs, velocityFloor, velocitySmoothing, occupancyGraceMs } = this.cfg;
    const justSettled: CellRef[] = [];
    const justDeactivated: CellRef[] = [];

    for (const r of readings) {
      const k = keyOf(r.row, r.col);
      let st = this.states.get(k);
      if (!st) {
        st = { lastCentroid: null, velocity: 0, stillMs: 0, lostMs: 0, phase: 'idle' };
        this.states.set(k, st);
      }

      const isRed = r.occupied && r.colour === 'red' && r.centroid !== null;

      if (isRed && r.centroid) {
        st.lostMs = 0;
        if (st.lastCentroid) {
          const inst = dist(r.centroid, st.lastCentroid) / Math.max(dtMs, 1e-6);
          st.velocity = st.velocity + velocitySmoothing * (inst - st.velocity);
        } else {
          // First frame on this cell: velocity unknown → treat as moving so it
          // can't settle instantly.
          st.velocity = velocityFloor;
        }
        st.lastCentroid = r.centroid;

        if (st.velocity < velocityFloor) {
          st.stillMs += dtMs;
        } else {
          st.stillMs = 0;
          if (st.phase === 'settled') {
            st.phase = 'idle';
            justDeactivated.push({ row: r.row, col: r.col });
          }
        }

        if (st.phase === 'idle' && st.stillMs >= settleWindowMs) {
          st.phase = 'settled';
          justSettled.push({ row: r.row, col: r.col });
        }
      } else {
        // Not occupied-red this frame.
        st.lastCentroid = null;
        st.velocity = 0;
        st.stillMs = 0;
        if (st.phase === 'settled') {
          st.lostMs += dtMs;
          if (st.lostMs >= occupancyGraceMs) {
            st.phase = 'idle';
            st.lostMs = 0;
            justDeactivated.push({ row: r.row, col: r.col });
          }
        }
      }
    }

    const activeCells: CellRef[] = [];
    for (const [k, st] of this.states) {
      if (st.phase === 'settled') {
        const [row, col] = k.split(',').map(Number);
        activeCells.push({ row, col });
      }
    }

    return { activeCells, justSettled, justDeactivated };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/BoardSequencerMode.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/tracking/BoardSequencerMode.ts src/__tests__/BoardSequencerMode.test.ts
git commit -m "feat(board-sequencer): pure slide-and-settle state machine"
```

---

## Task 4: Pentatonic scale + step scheduling helpers

**Files:**
- Create: `src/songs/boardSequencerScale.ts`
- Test: `src/__tests__/boardSequencerScale.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/boardSequencerScale.test.ts
import { describe, it, expect } from 'vitest';
import { cellMidi, notesForStep, stepIndexAt } from '../songs/boardSequencerScale';
import type { CellRef } from '../tracking/BoardSequencerMode';

const ROWS = 4;
const ROOT = 60;
const PENTA = [0, 2, 4, 7]; // C major pentatonic offsets, ascending from bottom

describe('boardSequencerScale', () => {
  it('bottom row is lowest pitch, top row highest', () => {
    expect(cellMidi(3, ROWS, ROOT, PENTA)).toBe(60); // bottom row → semitones[0]
    expect(cellMidi(2, ROWS, ROOT, PENTA)).toBe(62);
    expect(cellMidi(1, ROWS, ROOT, PENTA)).toBe(64);
    expect(cellMidi(0, ROWS, ROOT, PENTA)).toBe(67); // top row → semitones[3]
  });

  it('notesForStep returns pitches only for active cells in that column', () => {
    const active: CellRef[] = [
      { row: 3, col: 0 }, // C4
      { row: 0, col: 0 }, // G4
      { row: 2, col: 2 }, // D4 (different column)
    ];
    expect(notesForStep(active, 0, ROWS, ROOT, PENTA).sort()).toEqual([60, 67]);
    expect(notesForStep(active, 2, ROWS, ROOT, PENTA)).toEqual([62]);
    expect(notesForStep(active, 1, ROWS, ROOT, PENTA)).toEqual([]);
  });

  it('stepIndexAt advances one step per beat and wraps over the loop', () => {
    const secPerBeat = 0.5; // 120 BPM
    const steps = 4;
    expect(stepIndexAt(0, 0, secPerBeat, steps)).toBe(0);
    expect(stepIndexAt(0.5, 0, secPerBeat, steps)).toBe(1);
    expect(stepIndexAt(1.0, 0, secPerBeat, steps)).toBe(2);
    expect(stepIndexAt(2.0, 0, secPerBeat, steps)).toBe(0); // wrapped
    expect(stepIndexAt(2.5, 0, secPerBeat, steps)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/boardSequencerScale.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/songs/boardSequencerScale.ts
/**
 * Pure pitch + scheduling helpers for the standalone board sequencer.
 *
 * Rows map to a FIXED pentatonic scale (no chord/song coupling): the BOTTOM
 * grid row is the lowest pitch. Columns are the loop's beats/steps. notesForStep
 * selects the pitches that should sound at a given step; the "next loop pass"
 * semantic is emergent — the engine reads the CURRENT active set each time the
 * playhead reaches a column, so a cell settled after the playhead passed only
 * sounds on the following pass.
 */

import type { CellRef } from '../tracking/BoardSequencerMode';

/**
 * MIDI for a cell. row 0 = top (highest), row (rows-1) = bottom (lowest).
 * semitones is ascending from the bottom row.
 */
export function cellMidi(
  row: number,
  rows: number,
  rootMidi: number,
  semitones: number[],
): number {
  const levelFromBottom = rows - 1 - row;
  return rootMidi + semitones[levelFromBottom];
}

/** Pitches to trigger at `step` (column): one per active cell in that column. */
export function notesForStep(
  active: CellRef[],
  step: number,
  rows: number,
  rootMidi: number,
  semitones: number[],
): number[] {
  return active
    .filter((c) => c.col === step)
    .map((c) => cellMidi(c.row, rows, rootMidi, semitones));
}

/** Which step the playhead is on at `nowSec`, given loop start, beat length, and step count. */
export function stepIndexAt(
  nowSec: number,
  startSec: number,
  secPerBeat: number,
  totalSteps: number,
): number {
  const beats = Math.floor((nowSec - startSec) / secPerBeat);
  return ((beats % totalSteps) + totalSteps) % totalSteps;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/boardSequencerScale.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/songs/boardSequencerScale.ts src/__tests__/boardSequencerScale.test.ts
git commit -m "feat(board-sequencer): pentatonic row mapping + step scheduling helpers"
```

---

## Task 5: BoardSequencerConfig persistence + InputProfileManager delegation

**Files:**
- Create: `src/profiles/BoardSequencerConfig.ts`
- Modify: `src/profiles/InputProfileManager.ts`
- Test: `src/__tests__/BoardSequencerConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/BoardSequencerConfig.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadBoardSequencerConfig,
  saveBoardSequencerConfig,
  clearBoardSequencerConfig,
  DEFAULT_BOARD_SEQUENCER_CONFIG,
  type BoardSequencerStored,
} from '../profiles/BoardSequencerConfig';

describe('BoardSequencerConfig', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is stored', () => {
    expect(loadBoardSequencerConfig()).toBeNull();
  });

  it('round-trips a valid config', () => {
    const cfg: BoardSequencerStored = { ...DEFAULT_BOARD_SEQUENCER_CONFIG, bpm: 110 };
    saveBoardSequencerConfig(cfg);
    const loaded = loadBoardSequencerConfig();
    expect(loaded?.bpm).toBe(110);
    expect(loaded?.rows).toBe(4);
    expect(loaded?.scaleSemitones).toEqual([0, 2, 4, 7]);
  });

  it('falls back to defaults for missing/garbage numeric fields', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ bpm: 'fast', corners: 'nope' }));
    const loaded = loadBoardSequencerConfig();
    expect(loaded).not.toBeNull();
    expect(loaded?.bpm).toBe(DEFAULT_BOARD_SEQUENCER_CONFIG.bpm);
    expect(loaded?.corners).toEqual(DEFAULT_BOARD_SEQUENCER_CONFIG.corners);
  });

  it('clear removes the stored config', () => {
    saveBoardSequencerConfig(DEFAULT_BOARD_SEQUENCER_CONFIG);
    clearBoardSequencerConfig();
    expect(loadBoardSequencerConfig()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/profiles/BoardSequencerConfig.ts
/**
 * Board-sequencer configuration persistence.
 *
 * Mirrors the SurfacePressConfig / BatonAssignments pattern: a dedicated
 * localStorage key, sanitised on load (a corrupt store yields null and the
 * screen falls back to "not yet calibrated"), exposed via InputProfileManager.
 * No change to UserProfile.
 */

import type { TrackedColor } from '../tracking/ColorTracker';

const STORAGE_KEY = 'admi-board-sequencer';

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardSequencerStored {
  enabled: boolean;
  /** Four board corners (normalised image coords) in TL, TR, BR, BL order. */
  corners: [BoardPoint, BoardPoint, BoardPoint, BoardPoint];
  rows: number;
  cols: number;
  scaleRootMidi: number;
  scaleSemitones: number[];
  bpm: number;
  settleWindowMs: number;
  velocityFloor: number;
  velocitySmoothing: number;
  occupancyGraceMs: number;
  redColour: TrackedColor;
  minFilledFraction: number;
  noteLengthBeats: number;
  velocity: number;
  tickEnabled: boolean;
  instrumentKey: string;
}

const ZERO_CORNERS: [BoardPoint, BoardPoint, BoardPoint, BoardPoint] = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
];

const DEFAULT_RED: TrackedColor = {
  id: 'board-red',
  hue: 0,
  hueTolerance: 12,
  minSaturation: 62,
  minValue: 40,
  minArea: 0.0005,
};

export const DEFAULT_BOARD_SEQUENCER_CONFIG: BoardSequencerStored = {
  enabled: false,
  corners: ZERO_CORNERS,
  rows: 4,
  cols: 4,
  scaleRootMidi: 60,
  scaleSemitones: [0, 2, 4, 7],
  bpm: 90,
  settleWindowMs: 600,
  velocityFloor: 0.0008,
  velocitySmoothing: 0.5,
  occupancyGraceMs: 150,
  redColour: DEFAULT_RED,
  minFilledFraction: 0.25,
  noteLengthBeats: 0.9,
  velocity: 0.7,
  tickEnabled: true,
  instrumentKey: 'electricPiano',
};

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function num(v: unknown, fallback: number): number {
  return isNum(v) ? v : fallback;
}

function sanitizeCorners(v: unknown): [BoardPoint, BoardPoint, BoardPoint, BoardPoint] {
  if (!Array.isArray(v) || v.length !== 4) return ZERO_CORNERS;
  const pts = v.map((p) => {
    const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
    return { x: num(o.x, 0), y: num(o.y, 0) };
  });
  return [pts[0], pts[1], pts[2], pts[3]];
}

function sanitizeColour(v: unknown): TrackedColor {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  return {
    id: typeof o.id === 'string' ? o.id : DEFAULT_RED.id,
    hue: num(o.hue, DEFAULT_RED.hue),
    hueTolerance: num(o.hueTolerance, DEFAULT_RED.hueTolerance),
    minSaturation: num(o.minSaturation, DEFAULT_RED.minSaturation),
    minValue: num(o.minValue, DEFAULT_RED.minValue),
    minArea: num(o.minArea, DEFAULT_RED.minArea),
  };
}

function sanitize(input: unknown): BoardSequencerStored | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  const d = DEFAULT_BOARD_SEQUENCER_CONFIG;
  const semis = Array.isArray(o.scaleSemitones) && o.scaleSemitones.every(isNum)
    ? (o.scaleSemitones as number[])
    : d.scaleSemitones;
  return {
    enabled: o.enabled === true,
    corners: sanitizeCorners(o.corners),
    rows: num(o.rows, d.rows),
    cols: num(o.cols, d.cols),
    scaleRootMidi: num(o.scaleRootMidi, d.scaleRootMidi),
    scaleSemitones: semis,
    bpm: num(o.bpm, d.bpm),
    settleWindowMs: num(o.settleWindowMs, d.settleWindowMs),
    velocityFloor: num(o.velocityFloor, d.velocityFloor),
    velocitySmoothing: num(o.velocitySmoothing, d.velocitySmoothing),
    occupancyGraceMs: num(o.occupancyGraceMs, d.occupancyGraceMs),
    redColour: sanitizeColour(o.redColour),
    minFilledFraction: num(o.minFilledFraction, d.minFilledFraction),
    noteLengthBeats: num(o.noteLengthBeats, d.noteLengthBeats),
    velocity: num(o.velocity, d.velocity),
    tickEnabled: o.tickEnabled !== false,
    instrumentKey: typeof o.instrumentKey === 'string' ? o.instrumentKey : d.instrumentKey,
  };
}

export function loadBoardSequencerConfig(): BoardSequencerStored | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    return sanitize(JSON.parse(raw) as unknown);
  } catch (error) {
    console.warn('[BoardSequencerConfig] Failed to load:', error);
    return null;
  }
}

export function saveBoardSequencerConfig(config: BoardSequencerStored): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const clean = sanitize(config);
    if (!clean) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (error) {
    console.warn('[BoardSequencerConfig] Failed to save:', error);
  }
}

export function clearBoardSequencerConfig(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[BoardSequencerConfig] Failed to clear:', error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/BoardSequencerConfig.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add InputProfileManager delegation**

First re-read `src/profiles/InputProfileManager.ts` to find the SurfacePress delegation block (the `getSurfacePressConfig`/`saveSurfacePressConfig` methods) and its imports. Add an import and three methods alongside them:

```ts
// near the existing SurfacePressConfig import at the top of InputProfileManager.ts
import {
  loadBoardSequencerConfig,
  saveBoardSequencerConfig,
  clearBoardSequencerConfig,
  type BoardSequencerStored,
} from './BoardSequencerConfig';
```

```ts
// alongside the existing getSurfacePressConfig()/saveSurfacePressConfig() methods
getBoardSequencerConfig(): BoardSequencerStored | null {
  return loadBoardSequencerConfig();
}

saveBoardSequencerConfig(config: BoardSequencerStored): void {
  saveBoardSequencerConfig(config);
}

clearBoardSequencerConfig(): void {
  clearBoardSequencerConfig();
}
```

> Note: if the local method name shadows the imported function (TS will flag the recursive call), import the functions under aliases (e.g. `loadBoardSequencerConfig as loadBoardCfg`) and call the alias inside the method. Verify with lint in the next step.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors. (Fix shadowing via import aliases if reported.)

- [ ] **Step 7: Commit**

```bash
git add src/profiles/BoardSequencerConfig.ts src/__tests__/BoardSequencerConfig.test.ts src/profiles/InputProfileManager.ts
git commit -m "feat(board-sequencer): per-user config persistence + InputProfileManager delegation"
```

---

## Task 6: BoardReader (camera → per-cell red fraction + centroid)

**Files:**
- Create: `src/tracking/BoardReader.ts`
- Test: `src/__tests__/BoardReader.test.ts`

The pixel→fraction/centroid maths is pulled into a pure `sampleRegion` so it is testable without a DOM. `BoardReader` wraps it with a canvas.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/BoardReader.test.ts
import { describe, it, expect } from 'vitest';
import { sampleRegion, type RgbSampler } from '../tracking/BoardReader';
import type { TrackedColor } from '../tracking/ColorTracker';
import { UNIT_SQUARE, computeHomography } from '../utils/homography';

const RED: TrackedColor = {
  id: 'red', hue: 0, hueTolerance: 12, minSaturation: 50, minValue: 30, minArea: 0,
};

describe('BoardReader.sampleRegion', () => {
  // image is the unit square mapped to a 100x100 pixel grid
  const h = computeHomography(UNIT_SQUARE, [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ]);

  it('reports a high red fraction over an all-red region', () => {
    const allRed: RgbSampler = () => ({ r: 220, g: 10, b: 10 });
    const out = sampleRegion(allRed, h, 0, 0, 4, 4, RED, 3);
    expect(out.redFraction).toBeGreaterThan(0.9);
    expect(out.centroid).not.toBeNull();
  });

  it('reports ~zero red fraction over a white/empty region', () => {
    const white: RgbSampler = () => ({ r: 240, g: 240, b: 240 });
    const out = sampleRegion(white, h, 0, 0, 4, 4, RED, 3);
    expect(out.redFraction).toBeLessThan(0.1);
  });

  it('reports ~zero red fraction over a dark (black square) region', () => {
    const dark: RgbSampler = () => ({ r: 20, g: 20, b: 20 });
    const out = sampleRegion(dark, h, 0, 0, 4, 4, RED, 3);
    expect(out.redFraction).toBeLessThan(0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/BoardReader.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tracking/BoardReader.ts
/**
 * BoardReader — turns the live video into a per-cell board matrix.
 *
 * For each cell we map a small inset central region (grid→image via the
 * homography), sample a NxN dot pattern from a downscaled canvas, and count
 * pixels matching the calibrated red band. Reuses ColorTracker's HSV maths and
 * red/skin-tone exclusion. The pure pixel maths lives in sampleRegion() so it
 * is unit-testable without a DOM.
 */

import type { Mat3 } from '../utils/homography';
import { applyHomography } from '../utils/homography';
import type { TrackedColor } from './ColorTracker';
import { rgbToHsv, matchesTrackedColor } from './ColorTracker';
import type { CellReading } from './BoardSequencerMode';
import type { PieceRecognizer } from './PieceRecognizer';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Returns the RGB at integer image pixel (x, y). */
export type RgbSampler = (x: number, y: number) => Rgb;

export interface RegionSample {
  redFraction: number;
  /** Mean position of matching pixels in unit-square coords, or null if none. */
  centroid: { x: number; y: number } | null;
}

const INSET = 0.5; // sample the central 50% of each cell

/**
 * Sample the central region of cell (row, col) and return the red fraction +
 * unit-square centroid. `samplesPerAxis` dots are taken on each axis.
 */
export function sampleRegion(
  sampler: RgbSampler,
  h: Mat3,
  row: number,
  col: number,
  rows: number,
  cols: number,
  red: TrackedColor,
  samplesPerAxis: number,
): RegionSample {
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const x0 = col * cellW + cellW * (1 - INSET) / 2;
  const y0 = row * cellH + cellH * (1 - INSET) / 2;
  const stepX = (cellW * INSET) / Math.max(samplesPerAxis - 1, 1);
  const stepY = (cellH * INSET) / Math.max(samplesPerAxis - 1, 1);

  let matches = 0;
  let total = 0;
  let sumX = 0;
  let sumY = 0;

  for (let iy = 0; iy < samplesPerAxis; iy++) {
    for (let ix = 0; ix < samplesPerAxis; ix++) {
      const ux = x0 + ix * stepX;
      const uy = y0 + iy * stepY;
      const img = applyHomography(h, { x: ux, y: uy });
      const { r, g, b } = sampler(Math.round(img.x), Math.round(img.y));
      const hsv = rgbToHsv(r, g, b);
      total++;
      if (matchesTrackedColor(hsv, red)) {
        matches++;
        sumX += ux;
        sumY += uy;
      }
    }
  }

  const redFraction = total === 0 ? 0 : matches / total;
  const centroid = matches > 0 ? { x: sumX / matches, y: sumY / matches } : null;
  return { redFraction, centroid };
}

export interface BoardReaderOptions {
  homography: Mat3;
  rows: number;
  cols: number;
  red: TrackedColor;
  recognizer: PieceRecognizer;
  samplesPerAxis?: number;
  downscale?: number;
}

/**
 * Reads the full board matrix from a video element each frame. Owns its own
 * canvas (willReadFrequently) like ColorTracker.
 */
export class BoardReader {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('BoardReader: 2D context unavailable');
    this.ctx = ctx;
  }

  read(video: HTMLVideoElement, opts: BoardReaderOptions): CellReading[] {
    const downscale = opts.downscale ?? 4;
    const samples = opts.samplesPerAxis ?? 5;
    const w = Math.max(1, Math.floor(video.videoWidth / downscale));
    const h = Math.max(1, Math.floor(video.videoHeight / downscale));
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.drawImage(video, 0, 0, w, h);
    const data = this.ctx.getImageData(0, 0, w, h).data;

    // The homography maps unit square → FULL-resolution image; scale to the
    // downscaled canvas by dividing by `downscale`.
    const sampler: RgbSampler = (x, y) => {
      const sx = Math.min(w - 1, Math.max(0, Math.round(x / downscale)));
      const sy = Math.min(h - 1, Math.max(0, Math.round(y / downscale)));
      const i = (sy * w + sx) * 4;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    };

    const readings: CellReading[] = [];
    for (let row = 0; row < opts.rows; row++) {
      for (let col = 0; col < opts.cols; col++) {
        const { redFraction, centroid } = sampleRegion(
          sampler, opts.homography, row, col, opts.rows, opts.cols, opts.red, samples,
        );
        const cls = opts.recognizer.classify({ filledFraction: redFraction, redFraction });
        readings.push({ row, col, occupied: cls.occupied, colour: cls.colour, centroid });
      }
    }
    return readings;
  }
}
```

- [ ] **Step 4: Add the `matchesTrackedColor` helper to ColorTracker**

Re-read `src/tracking/ColorTracker.ts`. It already has a private `matchesColor(hsv, color)` and exports `rgbToHsv`? Verify both. If `rgbToHsv` is a private method, add a module-level export that mirrors it; if `matchesColor` is private, add an exported pure function `matchesTrackedColor(hsv, color)` with the same hue/sat/value + skin-tone logic. Add at module scope (not inside the class):

```ts
// src/tracking/ColorTracker.ts — add exported pure helpers (reuse existing logic verbatim)
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  let h = 0;
  const s = max === 0 ? 0 : (diff / max) * 100;
  const v = max * 100;
  if (diff !== 0) {
    switch (max) {
      case r: h = ((g - b) / diff) % 6; break;
      case g: h = (b - r) / diff + 2; break;
      default: h = (r - g) / diff + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

export function matchesTrackedColor(
  hsv: { h: number; s: number; v: number },
  color: TrackedColor,
): boolean {
  if (hsv.s < color.minSaturation || hsv.v < color.minValue) return false;
  if (color.hue <= 40 || color.hue >= 340) {
    const ph = hsv.h;
    if ((ph <= 32 || ph >= 345) && hsv.s < 60) return false;
  }
  let hueDiff = Math.abs(hsv.h - color.hue);
  if (hueDiff > 180) hueDiff = 360 - hueDiff;
  return hueDiff <= color.hueTolerance;
}
```

> If `ColorTracker` already exports equivalents, import those instead of duplicating, and update `BoardReader`'s import accordingly. Keep one source of truth.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/BoardReader.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Lint + full test run**

Run: `npm run lint` then `npm run test:run`
Expected: no errors; all tests green (including pre-existing).

- [ ] **Step 7: Commit**

```bash
git add src/tracking/BoardReader.ts src/__tests__/BoardReader.test.ts src/tracking/ColorTracker.ts
git commit -m "feat(board-sequencer): BoardReader per-cell red sampling + ColorTracker pure helpers"
```

---

## Task 7: BoardSequencerVoice (sampled voice)

**Files:**
- Create: `src/songs/voices/BoardSequencerVoice.ts`

No new unit test (audio path is covered by manual verification; mirrors the already-tested `SurfacePressVoice`). Re-read `src/songs/voices/SurfacePressVoice.ts` and `src/songs/voices/SamplerPlayer.ts` first to confirm `triggerAttackRelease(midi, durationSec, time?, velocity?)` and `getInstrumentEntry`/`SAMPLE_CONFIGS` signatures.

- [ ] **Step 1: Write the voice**

```ts
// src/songs/voices/BoardSequencerVoice.ts
/**
 * BoardSequencerVoice — a sampled voice driven by the board step sequencer.
 *
 * Reuses the existing sampler infrastructure (SamplerPlayer + the curated
 * instrument palette / SAMPLE_CONFIGS), like SurfacePressVoice. Sequencer
 * notes are short and scheduled, so it exposes play(midi, velocity, duration,
 * time) → triggerAttackRelease rather than press/release.
 */

import { ToneVoiceBase } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import type { Player } from './SynthPlayer';
import { getInstrumentEntry } from './presets/instrumentPalette';
import type { ChordEntry } from './chordLookup';

export class BoardSequencerVoice extends ToneVoiceBase {
  private player: Player;

  constructor(ctx: AudioContext, instrumentKey: string) {
    super(ctx);
    this.bypassFade = true;
    this.active = true;
    this.outputGain.gain.value = 1;
    const entry = getInstrumentEntry(instrumentKey);
    this.player = new SamplerPlayer(SAMPLE_CONFIGS[entry.sampleKey], this.filterNode);
  }

  /** Trigger one sequenced note. `time` is an audio-context time (Tone seconds). */
  play(midi: number, velocity: number, durationSec: number, time: number): void {
    if (!this.player.isReady()) return;
    this.player.triggerAttackRelease(midi, durationSec, time, velocity);
    this.onNoteTrigger?.();
  }

  /** Event-driven; not per-frame. */
  update(_playbackTime: number, _chord: ChordEntry | null, _velocity: number): void {
    /* no-op */
  }

  dispose(): void {
    this.player.dispose();
    this.disposeBase();
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors. (If `triggerAttackRelease` arg order differs from the assumption, fix the call to match the real `SamplerPlayer` signature found in Step 0.)

- [ ] **Step 3: Commit**

```bash
git add src/songs/voices/BoardSequencerVoice.ts
git commit -m "feat(board-sequencer): sampled BoardSequencerVoice"
```

---

## Task 8: BoardSequencerEngine (clock + scheduler + tick + bus)

**Files:**
- Create: `src/songs/BoardSequencerEngine.ts`

Re-read `src/effects/EffectChainManager.ts` (confirm `getInput()` and the singleton accessor — find how other code obtains the instance, e.g. `getEffectChainManager()` or an exported singleton) and `src/songs/voices/SurfacePressVoice.ts`'s connect usage before writing. Uses `Tone.getContext().rawContext` for the AudioContext and `Tone.now()` for scheduling — never `Tone.Transport`.

- [ ] **Step 1: Write the engine**

```ts
// src/songs/BoardSequencerEngine.ts
/**
 * BoardSequencerEngine — standalone audio engine for the board sequencer.
 *
 * Owns: an internal look-ahead step clock (off the audio-context clock, NOT
 * Tone.Transport, so it never clashes with a song), a sampled voice per row,
 * an optional confirmation tick, and the current active-cell matrix. Routes
 * into the shared effects bus (EffectChainManager.getInput()).
 *
 * The board is standalone: own tempo, fixed pentatonic scale, no song / no
 * chordLookup. "Next loop pass" semantics are emergent — each step reads the
 * CURRENT active set via notesForStep.
 */

import * as Tone from 'tone';
import { BoardSequencerVoice } from './voices/BoardSequencerVoice';
import { notesForStep, stepIndexAt } from './boardSequencerScale';
import type { CellRef } from '../tracking/BoardSequencerMode';
import { getEffectChainManager } from '../effects'; // confirm the real accessor name

export interface BoardEngineConfig {
  bpm: number;
  rows: number;
  cols: number;
  scaleRootMidi: number;
  scaleSemitones: number[];
  noteLengthBeats: number;
  velocity: number;
  tickEnabled: boolean;
  instrumentKey: string;
}

const LOOKAHEAD_SEC = 0.1;
const TICK_INTERVAL_MS = 25;

export class BoardSequencerEngine {
  private ctx: AudioContext;
  private cfg: BoardEngineConfig;
  private voices: BoardSequencerVoice[] = [];
  private tick: Tone.MembraneSynth | null = null;
  private active: CellRef[] = [];
  private startSec = 0;
  private lastScheduledStep = -1;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(cfg: BoardEngineConfig) {
    this.cfg = cfg;
    this.ctx = Tone.getContext().rawContext as unknown as AudioContext;
  }

  async init(): Promise<void> {
    const fx = getEffectChainManager();
    await fx.initialize();
    const dest = fx.getInput();
    // One voice per row keeps simultaneous column notes independent.
    for (let r = 0; r < this.cfg.rows; r++) {
      const v = new BoardSequencerVoice(this.ctx, this.cfg.instrumentKey);
      if (dest) v.connect(dest as unknown as AudioNode);
      this.voices.push(v);
    }
    if (this.cfg.tickEnabled) {
      this.tick = new Tone.MembraneSynth({
        pitchDecay: 0.008,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
        volume: -14,
      });
      if (dest) this.tick.connect(dest as unknown as Tone.InputNode);
    }
  }

  /** Called every frame by the screen with the latest settled cells. */
  setActiveCells(cells: CellRef[]): void {
    this.active = cells;
  }

  /** Confirmation tick the instant a cell is accepted (distinct from the note). */
  fireTick(): void {
    if (this.tick) this.tick.triggerAttackRelease('C2', 0.05, Tone.now());
  }

  start(): void {
    this.startSec = Tone.now();
    this.lastScheduledStep = -1;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.scheduleTick(), TICK_INTERVAL_MS);
  }

  private scheduleTick(): void {
    const secPerBeat = 60 / this.cfg.bpm;
    const now = Tone.now();
    const lookaheadStep = stepIndexAt(now + LOOKAHEAD_SEC, this.startSec, secPerBeat, this.cfg.cols);
    if (lookaheadStep === this.lastScheduledStep) return;
    this.lastScheduledStep = lookaheadStep;

    // Audio time of this step boundary.
    const beatsSinceStart = Math.round((now + LOOKAHEAD_SEC - this.startSec) / secPerBeat);
    const stepTime = this.startSec + beatsSinceStart * secPerBeat;

    const pitches = notesForStep(
      this.active, lookaheadStep, this.cfg.rows, this.cfg.scaleRootMidi, this.cfg.scaleSemitones,
    );
    const durSec = this.cfg.noteLengthBeats * secPerBeat;
    pitches.forEach((midi, i) => {
      const voice = this.voices[i % this.voices.length];
      voice.play(midi, this.cfg.velocity, durSec, stepTime);
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.stop();
    this.voices.forEach((v) => v.dispose());
    this.voices = [];
    this.tick?.dispose();
    this.tick = null;
  }
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors. Fix the `getEffectChainManager` import to the real accessor (from Step 0); adjust `connect` casts to satisfy strict types using the same pattern `SurfacePressVoice`/`SongPresetEngine` use.

- [ ] **Step 3: Commit**

```bash
git add src/songs/BoardSequencerEngine.ts
git commit -m "feat(board-sequencer): standalone clock + scheduler + tick engine"
```

---

## Task 9: Screen registration (types, route, export, nav)

**Files:**
- Modify: `src/state/types.ts:473`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/screens/index.ts`
- Modify: `src/ui/screens/WelcomeScreen.tsx`

- [ ] **Step 1: Extend the Screen union**

Re-read `src/state/types.ts:473`. Add `'boardSequencer'`:

```ts
export type Screen = 'welcome' | 'setup' | 'calibration' | 'performance' | 'betweenUs' | 'harmonicBlending' | 'songPreset' | 'remix' | 'boardSequencer' | 'settings' | 'info';
```

- [ ] **Step 2: Add the route to App.tsx**

Re-read `src/ui/App.tsx` around the `renderScreen` switch (~line 93). Add the import near the other screen imports and a case:

```tsx
import BoardSequencerScreen from './screens/BoardSequencerScreen';
```

```tsx
      case 'boardSequencer':
        return <BoardSequencerScreen />;
```

- [ ] **Step 3: Export the screen**

In `src/ui/screens/index.ts`:

```ts
export { default as BoardSequencerScreen } from './BoardSequencerScreen';
```

- [ ] **Step 4: Add a nav entry**

Re-read `src/ui/screens/WelcomeScreen.tsx` to find how it navigates (it calls `useAppStore`'s `setCurrentScreen`, or renders mode buttons). Add a button consistent with existing ones:

```tsx
// inside WelcomeScreen, alongside the other mode entries
<button
  type="button"
  className="welcome-mode-button"
  onClick={() => setCurrentScreen('boardSequencer')}
>
  Board Sequencer
</button>
```

> Match the existing button markup/classNames in WelcomeScreen exactly; the snippet above is illustrative. If WelcomeScreen has no such list, add the button in the same container used to reach `songPreset`/`remix`.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: errors only from the not-yet-created `BoardSequencerScreen` import — proceed to Task 10, which creates it, then re-lint.

- [ ] **Step 6: Commit (after Task 10 makes lint green)** — see Task 10.

---

## Task 10: BoardSequencerScreen + overlay + warped view

**Files:**
- Create: `src/ui/screens/BoardSequencerScreen.tsx`
- Create: `src/ui/components/board/BoardCalibrationOverlay.tsx`
- Create: `src/ui/components/board/WarpedBoardView.tsx`

Re-read an existing camera-using screen (e.g. `src/ui/screens/PerformanceScreen.tsx` or `RemixScreen`) to copy how `CameraManager` is started against a `<video ref>` and how `Tone.start()` is triggered on first user gesture.

- [ ] **Step 1: Calibration overlay**

```tsx
// src/ui/components/board/BoardCalibrationOverlay.tsx
import { useState } from 'react';
import type { BoardPoint } from '../../../profiles/BoardSequencerConfig';

const ORDER = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;

interface Props {
  width: number;
  height: number;
  onComplete: (corners: [BoardPoint, BoardPoint, BoardPoint, BoardPoint]) => void;
}

/** Click the four board corners in TL, TR, BR, BL order; stores normalised coords. */
export default function BoardCalibrationOverlay({ width, height, onComplete }: Props) {
  const [pts, setPts] = useState<BoardPoint[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    const next = [...pts, p];
    setPts(next);
    if (next.length === 4) {
      onComplete([next[0], next[1], next[2], next[3]]);
      setPts([]);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{ position: 'absolute', inset: 0, width, height, cursor: 'crosshair' }}
      role="button"
      tabIndex={0}
      aria-label={`Click the ${ORDER[pts.length] ?? 'four'} board corner`}
    >
      <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', background: '#000a', padding: '4px 8px' }}>
        {pts.length < 4 ? `Click the ${ORDER[pts.length]} corner (${pts.length}/4)` : 'Done'}
      </div>
      {pts.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`,
            width: 12, height: 12, marginLeft: -6, marginTop: -6,
            borderRadius: '50%', background: '#3cf', border: '2px solid #fff',
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Warped board view (facilitator feedback)**

```tsx
// src/ui/components/board/WarpedBoardView.tsx
import { useEffect, useRef } from 'react';
import type { CellRef } from '../../../tracking/BoardSequencerMode';

interface Props {
  rows: number;
  cols: number;
  active: CellRef[];
  playheadCol: number;
  size?: number;
}

/** Top-down warped grid: active cells highlighted, current beat column marked. */
export default function WarpedBoardView({ rows, cols, active, playheadCol, size = 240 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeSet = new Set(active.map((c) => `${c.row},${c.col}`));

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const w = cv.width;
    const h = cv.height;
    ctx.clearRect(0, 0, w, h);
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = activeSet.has(`${r},${c}`) ? '#e23' : '#1b1b22';
        ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
      }
    }
    // playhead column outline
    ctx.strokeStyle = '#3cf';
    ctx.lineWidth = 3;
    ctx.strokeRect(playheadCol * cw + 1, 1, cw - 2, h - 2);
  }, [rows, cols, playheadCol, activeSet]);

  return <canvas ref={ref} width={size} height={size} aria-label="Board state" />;
}
```

- [ ] **Step 3: The screen (camera + frame loop wiring)**

```tsx
// src/ui/screens/BoardSequencerScreen.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { useAppStore } from '../../state/store';
import { CameraManager } from '../../tracking/CameraManager';
import { BoardReader } from '../../tracking/BoardReader';
import { BoardSequencerMode, type CellRef } from '../../tracking/BoardSequencerMode';
import { RedColourRecognizer } from '../../tracking/PieceRecognizer';
import { BoardSequencerEngine } from '../../songs/BoardSequencerEngine';
import { computeHomography, UNIT_SQUARE, type Mat3 } from '../../utils/homography';
import { stepIndexAt } from '../../songs/boardSequencerScale';
import {
  loadBoardSequencerConfig, saveBoardSequencerConfig, DEFAULT_BOARD_SEQUENCER_CONFIG,
  type BoardSequencerStored, type BoardPoint,
} from '../../profiles/BoardSequencerConfig';
import BoardCalibrationOverlay from '../components/board/BoardCalibrationOverlay';
import WarpedBoardView from '../components/board/WarpedBoardView';

export default function BoardSequencerScreen() {
  const setCurrentScreen = useAppStore((s) => s.setCurrentScreen);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const readerRef = useRef<BoardReader | null>(null);
  const modeRef = useRef<BoardSequencerMode | null>(null);
  const engineRef = useRef<BoardSequencerEngine | null>(null);
  const homographyRef = useRef<Mat3 | null>(null);
  const rafRef = useRef<number>(0);

  const [config, setConfig] = useState<BoardSequencerStored>(
    () => loadBoardSequencerConfig() ?? DEFAULT_BOARD_SEQUENCER_CONFIG,
  );
  const [calibrating, setCalibrating] = useState(false);
  const [active, setActive] = useState<CellRef[]>([]);
  const [playheadCol, setPlayheadCol] = useState(0);
  const [running, setRunning] = useState(false);
  const startSecRef = useRef(0);

  // Start camera on mount, tear down on unmount.
  useEffect(() => {
    const cam = new CameraManager();
    cameraRef.current = cam;
    readerRef.current = new BoardReader();
    if (videoRef.current) void cam.start(videoRef.current);
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      cam.stop();
    };
  }, []);

  const isCalibrated = config.corners.some((p) => p.x !== p.y); // non-trivial corners

  const buildHomography = useCallback((corners: BoardPoint[], video: HTMLVideoElement) => {
    // Corners are normalised; homography maps unit square → full-res image px.
    const dst = corners.map((c) => ({ x: c.x * video.videoWidth, y: c.y * video.videoHeight }));
    return computeHomography(UNIT_SQUARE, dst);
  }, []);

  const handleCalibrated = useCallback(
    (corners: [BoardPoint, BoardPoint, BoardPoint, BoardPoint]) => {
      const next = { ...config, corners, enabled: true };
      setConfig(next);
      saveBoardSequencerConfig(next);
      if (videoRef.current) homographyRef.current = buildHomography(corners, videoRef.current);
      setCalibrating(false);
    },
    [config, buildHomography],
  );

  const start = useCallback(async () => {
    await Tone.start();
    if (videoRef.current && !homographyRef.current) {
      homographyRef.current = buildHomography(config.corners, videoRef.current);
    }
    modeRef.current = new BoardSequencerMode({
      settleWindowMs: config.settleWindowMs,
      velocityFloor: config.velocityFloor,
      velocitySmoothing: config.velocitySmoothing,
      occupancyGraceMs: config.occupancyGraceMs,
    });
    const engine = new BoardSequencerEngine({
      bpm: config.bpm, rows: config.rows, cols: config.cols,
      scaleRootMidi: config.scaleRootMidi, scaleSemitones: config.scaleSemitones,
      noteLengthBeats: config.noteLengthBeats, velocity: config.velocity,
      tickEnabled: config.tickEnabled, instrumentKey: config.instrumentKey,
    });
    await engine.init();
    engine.start();
    engineRef.current = engine;
    startSecRef.current = Tone.now();
    setRunning(true);

    const recognizer = new RedColourRecognizer(config.minFilledFraction);
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const video = videoRef.current;
      const reader = readerRef.current;
      const mode = modeRef.current;
      const h = homographyRef.current;
      if (video && reader && mode && h && video.videoWidth > 0) {
        const readings = reader.read(video, {
          homography: h, rows: config.rows, cols: config.cols, red: config.redColour, recognizer,
        });
        const res = mode.step(readings, dt, now);
        engine.setActiveCells(res.activeCells);
        if (res.justSettled.length > 0) engine.fireTick();
        setActive(res.activeCells);
        setPlayheadCol(
          stepIndexAt(Tone.now(), startSecRef.current, 60 / config.bpm, config.cols),
        );
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [config, buildHomography]);

  return (
    <div className="board-sequencer-screen" style={{ padding: 16 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" onClick={() => setCurrentScreen('welcome')}>← Back</button>
        <h1 style={{ fontSize: 18 }}>Board Sequencer</h1>
      </header>

      <div style={{ position: 'relative', width: 640, maxWidth: '100%' }}>
        <video
          ref={videoRef}
          autoPlay playsInline muted
          style={{ width: '100%', transform: 'scaleX(-1)' }}
        />
        {calibrating && (
          <BoardCalibrationOverlay width={640} height={480} onComplete={handleCalibrated} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={() => setCalibrating(true)}>
            {isCalibrated ? 'Recalibrate corners' : 'Calibrate corners'}
          </button>
          <button type="button" disabled={!isCalibrated || running} onClick={() => void start()}>
            Start
          </button>
          <label>
            Tempo {config.bpm} BPM
            <input
              type="range" min={50} max={140} value={config.bpm}
              onChange={(e) => {
                const next = { ...config, bpm: Number(e.target.value) };
                setConfig(next); saveBoardSequencerConfig(next);
              }}
            />
          </label>
          <label>
            <input
              type="checkbox" checked={config.tickEnabled}
              onChange={(e) => {
                const next = { ...config, tickEnabled: e.target.checked };
                setConfig(next); saveBoardSequencerConfig(next);
              }}
            />
            Confirmation tick
          </label>
        </div>
        <WarpedBoardView rows={config.rows} cols={config.cols} active={active} playheadCol={playheadCol} />
      </div>
    </div>
  );
}
```

> The control panel above is the minimum (tempo, tick, calibrate, start). Settle window, velocity floor, scale root, grid size, and red recalibration are config-backed and can be added as further sliders in the same pattern; they already persist through `saveBoardSequencerConfig`. Keep styling consistent with existing screens.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors (this resolves the Task 9 import). Fix any `CameraManager.start` signature / Tone type mismatches against the real APIs.

- [ ] **Step 5: Full test run**

Run: `npm run test:run`
Expected: all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/BoardSequencerScreen.tsx src/ui/components/board/ src/state/types.ts src/ui/App.tsx src/ui/screens/index.ts src/ui/screens/WelcomeScreen.tsx
git commit -m "feat(board-sequencer): dedicated screen, calibration overlay, warped board view + nav"
```

---

## Task 11: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Lint clean**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Full test suite green**

Run: `npm run test:run`
Expected: all tests pass, including the six new test files and all pre-existing tests.

- [ ] **Step 3: Manual smoke test (dev server)**

Run: `npm run dev`, open the app, and verify:
- The app opens on Welcome as before; **all existing modes/screens behave exactly as before** (open Performance, Song Preset, Remix, and confirm no regression).
- Navigate to Board Sequencer. Camera shows. Click "Calibrate corners", click TL→TR→BR→BL; the overlay closes and corners persist (reload → still calibrated).
- Click Start. Place a red piece on a cell: nothing sounds while sliding; after ~600 ms still, a confirmation tick fires and (on the next loop pass at that column) an electric-piano note plays. Bottom row sounds lower than top row.
- Move the piece: its note drops out immediately; it re-enters when settled on the new cell.
- Toggle the tick off; confirm only the musical note remains.
- The warped board view highlights settled cells and shows the moving playhead column.

- [ ] **Step 4: Confirm boundary rules**

Manually confirm (read-only): no existing mode file's behaviour changed; `found === false` (RemixBaton) untouched; no OSC/Max/OpenCV added (`git diff --stat main` shows only the new/edited files in this plan); no `package.json` dependency added.

- [ ] **Step 5: Final commit (if any verification fixes were made)**

```bash
git add -A
git commit -m "chore(board-sequencer): verification fixes"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** Interaction (Tasks 9–10), four-corner homography calibration (Tasks 1, 10), per-cell reading (Task 6), slide-and-settle (Task 3), sequencer mapping incl. pentatonic + next-loop-pass (Tasks 4, 8), confirmation tick (Task 8), recognition dial seam incl. black/identity stubs + colour→instrument hook (Task 2), persistence (Task 5), screen toggle/registration OFF-by-default (Tasks 9–10), acceptance criteria + boundary rules (Task 11). All spec sections map to a task.
- **Pentatonic override:** the brief's "chord tones from chordLookup" test is replaced by the pentatonic row-resolution test (Task 4), per the approved standalone decision. `chordLookup` is not used.
- **`found === false`:** never read or written by any new file; occupancy comes from filled fraction (Tasks 3, 6).
- **Type consistency:** `CellRef`/`CellReading`/`Point` defined in `BoardSequencerMode.ts` and imported elsewhere; `Mat3`/`Point`/`UNIT_SQUARE`/`cellCentreUnit` in `homography.ts`; `BoardSequencerStored`/`BoardPoint`/`DEFAULT_BOARD_SEQUENCER_CONFIG` in `BoardSequencerConfig.ts`; `cellMidi`/`notesForStep`/`stepIndexAt` signatures match between Task 4 (def) and Task 8 (use); `BoardSequencerVoice.play(midi, velocity, durationSec, time)` matches the engine call.
- **Verification-required external signatures** (re-read before coding the relevant task, fix calls to match reality): `SamplerPlayer.triggerAttackRelease` arg order (Tasks 7–8), `EffectChainManager` singleton accessor name + `getInput()` return type (Task 8), `CameraManager.start` signature (Task 10), `ColorTracker` existing `rgbToHsv`/`matchesColor` export status (Task 6), `WelcomeScreen` nav pattern (Task 9), `InputProfileManager` SurfacePress delegation block location (Task 5).
```
