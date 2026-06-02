# Surface Press Mode — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, default-off "surface press" mode where coloured objects on a table become press triggers — a press (blob bottom-edge or fingertip descending to a calibrated oblique surface line) plays one chord-constrained, beat-snappable sampled note through the existing Song Preset audio pipeline.

**Architecture:** A pure `SurfacePressMode` detector (sibling of `ThereminMode`) fits a perspective surface line and runs a per-button hysteresis state machine, emitting typed press/release events. The `SongPresetScreen` feeds it frames and routes its events into new `SongPresetEngine` methods, which pick a chord tone via a `NoteSource` seam, play it on a reused sampled `SurfacePressVoice`, and mirror a typed note event for facilitator visuals. No audio touches the oscillator `MusicEventEmitter` bus; the `found===false` baton mute semantic is untouched (surface buttons use their own `press-N` colour namespace).

**Tech Stack:** React 19, TypeScript (strict), Tone.js (via existing voice/sampler layer), MediaPipe (`@mediapipe/tasks-vision`), Vitest. Path aliases per repo. `npm run lint` = `tsc --noEmit`; `npm run test:run` = `vitest run`.

**Spec:** [docs/superpowers/specs/2026-06-02-surface-press-mode.md](../specs/2026-06-02-surface-press-mode.md)

---

## File structure

**Create**
- `src/tracking/SurfaceModel.ts` — pure: fit oblique surface line from touched points; evaluate `surfaceY(x)`.
- `src/tracking/SurfacePressMode.ts` — pure detector: per-button hysteresis state machine + velocity; emits press/release events. Sibling of `ThereminMode`.
- `src/songs/voices/NoteSource.ts` — `NoteSource` interface + deterministic `ChordToneNoteSource` (+ `buildChordLadder` helper). Stage-2 seam.
- `src/songs/surfacePressTiming.ts` — pure: `resolvePressTime` + `PendingPressQueue` (beat-snap deferral / cancel).
- `src/profiles/SurfacePressConfig.ts` — localStorage persistence (mirrors `BatonAssignments.ts`).
- `src/songs/voices/SurfacePressVoice.ts` — sampled press/sustain voice reusing `SamplerPlayer` + the instrument palette.
- Tests: `src/__tests__/SurfaceModel.test.ts`, `SurfacePressMode.test.ts`, `NoteSource.test.ts`, `surfacePressTiming.test.ts`, `SurfacePressConfig.test.ts`, `SongPresetEngine.surfacePress.test.ts`.

**Modify**
- `src/tracking/ColorTracker.ts` — add optional `bottomY` (blob bounding-box max-y) to `ColorBlob`.
- `src/songs/SongPresetEngine.ts` — `setSurfacePressEnabled` / `setSurfacePressConfig` / `pressSurfaceButton` / `releaseSurfaceButton`, beat-snap flush in `update()`, per-button voice map, `onSurfaceNote` event mirror.
- `src/profiles/InputProfileManager.ts` — expose surface-press config getters/setters.
- `src/ui/screens/SongPresetScreen.tsx` — toggle, calibration UI, detector wiring, overlay.

---

## Task 1: SurfaceModel (pure line fit + threshold)

**Files:**
- Create: `src/tracking/SurfaceModel.ts`
- Test: `src/__tests__/SurfaceModel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/SurfaceModel.test.ts
import { describe, it, expect } from 'vitest';
import { fitSurfaceLine, surfaceY } from '../tracking/SurfaceModel';

describe('SurfaceModel', () => {
  it('fits a straight line through two points (oblique surface)', () => {
    // Camera tilted: surface rises from y=0.8 at left to y=0.6 at right.
    const line = fitSurfaceLine([{ x: 0, y: 0.8 }, { x: 1, y: 0.6 }]);
    expect(surfaceY(line, 0)).toBeCloseTo(0.8, 6);
    expect(surfaceY(line, 1)).toBeCloseTo(0.6, 6);
    expect(surfaceY(line, 0.5)).toBeCloseTo(0.7, 6); // varies with x — not constant
  });

  it('least-squares fits a best line through >2 noisy points', () => {
    const line = fitSurfaceLine([
      { x: 0, y: 0.80 }, { x: 0.5, y: 0.69 }, { x: 1, y: 0.60 },
    ]);
    // Slope ≈ -0.2, intercept ≈ 0.797
    expect(line.a).toBeCloseTo(-0.2, 1);
    expect(surfaceY(line, 0.5)).toBeCloseTo(0.697, 2);
  });

  it('falls back to a horizontal line when points share an x (no slope)', () => {
    const line = fitSurfaceLine([{ x: 0.5, y: 0.7 }, { x: 0.5, y: 0.9 }]);
    expect(line.a).toBe(0);
    expect(surfaceY(line, 0.2)).toBeCloseTo(0.8, 6); // mean of ys
  });

  it('throws when given fewer than two points', () => {
    expect(() => fitSurfaceLine([{ x: 0.5, y: 0.7 }])).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/SurfaceModel.test.ts`
Expected: FAIL — `Cannot find module '../tracking/SurfaceModel'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tracking/SurfaceModel.ts
/**
 * SurfaceModel — the table surface as a line in normalised image space.
 *
 * The camera looks across the table at an oblique angle, so the surface
 * edge is a sloped line, not a constant y. We fit y = a·x + b from the
 * points the user touches during calibration. Works for any front/side
 * placement because the line comes entirely from the touched points.
 */

export interface SurfacePoint {
  /** Normalised image x (0 = left, 1 = right). */
  x: number;
  /** Normalised image y (0 = top, 1 = bottom). */
  y: number;
}

export interface SurfaceLine {
  /** Slope (Δy per unit x). */
  a: number;
  /** Intercept (y at x = 0). */
  b: number;
}

/**
 * Least-squares fit of a line through the touched surface points.
 * Requires at least two points. If every point shares the same x (no
 * horizontal spread to define a slope), falls back to a horizontal line
 * at the mean y.
 */
export function fitSurfaceLine(points: SurfacePoint[]): SurfaceLine {
  if (points.length < 2) {
    throw new Error('[SurfaceModel] need at least two points to fit a surface line');
  }

  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) * (p.x - meanX);
  }

  if (Math.abs(den) < 1e-9) {
    return { a: 0, b: meanY };
  }

  const a = num / den;
  const b = meanY - a * meanX;
  return { a, b };
}

/** Evaluate the surface y for a given x. */
export function surfaceY(line: SurfaceLine, x: number): number {
  return line.a * x + line.b;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/SurfaceModel.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tracking/SurfaceModel.ts src/__tests__/SurfaceModel.test.ts
git commit -m "feat(surface-press): SurfaceModel — fit oblique surface line from touched points"
```

---

## Task 2: surfacePressTiming (beat-snap deferral + cancel)

**Files:**
- Create: `src/songs/surfacePressTiming.ts`
- Test: `src/__tests__/surfacePressTiming.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/surfacePressTiming.test.ts
import { describe, it, expect, vi } from 'vitest';

// surfacePressTiming imports nextBeatAfter from InstrumentVoice, which pulls
// in Tone transitively. Mock the audio surface so module load is inert.
vi.mock('tone', () => ({
  Sampler: vi.fn(),
  Frequency: vi.fn(() => ({ toNote: () => 'A4', toFrequency: () => 440 })),
  now: vi.fn(() => 0),
}));

import { resolvePressTime, PendingPressQueue } from '../songs/surfacePressTiming';

describe('resolvePressTime', () => {
  const beats = [1.0, 2.0, 3.0, 4.0];

  it('returns currentTime immediately when beat-snap is off', () => {
    expect(resolvePressTime(beats, 1.3, false)).toBe(1.3);
  });

  it('returns currentTime when there is no beat data', () => {
    expect(resolvePressTime(null, 1.3, true)).toBe(1.3);
    expect(resolvePressTime([], 1.3, true)).toBe(1.3);
  });

  it('defers to the next beat after now when beat-snap is on', () => {
    expect(resolvePressTime(beats, 1.3, true)).toBe(2.0);
    expect(resolvePressTime(beats, 2.0, true)).toBe(3.0); // strictly after
  });
});

describe('PendingPressQueue', () => {
  it('flushes a scheduled press once its target time has passed', () => {
    const q = new PendingPressQueue();
    q.schedule('press-1', 64, 0.8, 2.0);
    expect(q.flushDue(1.9)).toEqual([]);                 // not due yet
    expect(q.flushDue(2.0)).toEqual([{ buttonId: 'press-1', midi: 64, velocity: 0.8 }]);
    expect(q.flushDue(2.1)).toEqual([]);                 // consumed
  });

  it('cancel removes a pending press before it fires (release before the beat)', () => {
    const q = new PendingPressQueue();
    q.schedule('press-1', 64, 0.8, 2.0);
    q.cancel('press-1');
    expect(q.flushDue(5.0)).toEqual([]);
  });

  it('a later schedule for the same button overwrites the earlier one', () => {
    const q = new PendingPressQueue();
    q.schedule('press-1', 60, 0.5, 2.0);
    q.schedule('press-1', 67, 0.9, 2.0);
    expect(q.flushDue(2.0)).toEqual([{ buttonId: 'press-1', midi: 67, velocity: 0.9 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/surfacePressTiming.test.ts`
Expected: FAIL — `Cannot find module '../songs/surfacePressTiming'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/songs/surfacePressTiming.ts
/**
 * Beat-snap timing for surface presses.
 *
 * Reuses the song's beat grid + the existing nextBeatAfter helper so a
 * press can be deferred to the next beat (Beat-Bopping parity with
 * InstrumentVoice). A press released before its target beat is cancelled
 * via PendingPressQueue.cancel — so it never sounds.
 */

import { nextBeatAfter } from './voices/InstrumentVoice';

/**
 * Resolve the time a press should actually sound.
 * - beat-snap off, or no beat data → fire immediately (currentTime).
 * - beat-snap on with beats → the next beat strictly after currentTime.
 */
export function resolvePressTime(
  beats: readonly number[] | null | undefined,
  currentTime: number,
  beatSnap: boolean,
): number {
  if (!beatSnap || !beats || beats.length === 0) return currentTime;
  return nextBeatAfter(beats, currentTime);
}

interface PendingPress {
  midi: number;
  velocity: number;
  targetTime: number;
}

export interface DuePress {
  buttonId: string;
  midi: number;
  velocity: number;
}

/**
 * Holds beat-snapped presses awaiting their target beat. One pending
 * press per button — a newer schedule overwrites the older (the last
 * aim before the beat is what plays), matching InstrumentVoice.
 */
export class PendingPressQueue {
  private pending = new Map<string, PendingPress>();

  schedule(buttonId: string, midi: number, velocity: number, targetTime: number): void {
    this.pending.set(buttonId, { midi, velocity, targetTime });
  }

  cancel(buttonId: string): void {
    this.pending.delete(buttonId);
  }

  /** Return and remove every pending press whose target time has arrived. */
  flushDue(currentTime: number): DuePress[] {
    const due: DuePress[] = [];
    for (const [buttonId, p] of this.pending) {
      if (currentTime >= p.targetTime) {
        due.push({ buttonId, midi: p.midi, velocity: p.velocity });
      }
    }
    for (const d of due) this.pending.delete(d.buttonId);
    return due;
  }

  clear(): void {
    this.pending.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/surfacePressTiming.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/songs/surfacePressTiming.ts src/__tests__/surfacePressTiming.test.ts
git commit -m "feat(surface-press): beat-snap timing — resolvePressTime + PendingPressQueue"
```

---

## Task 3: NoteSource + ChordToneNoteSource (Stage-2 seam)

**Files:**
- Create: `src/songs/voices/NoteSource.ts`
- Test: `src/__tests__/NoteSource.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/NoteSource.test.ts
import { describe, it, expect } from 'vitest';
import { ChordToneNoteSource, buildChordLadder } from '../songs/voices/NoteSource';
import type { ChordEntry } from '../songs/voices/chordLookup';

const dMajor: ChordEntry = { time: 0, notes: [50, 57, 62, 66], root: 50, name: 'D' }; // D3 A3 D4 F#4

describe('buildChordLadder', () => {
  it('sorts the chord tones and layers an octave above, deduped', () => {
    expect(buildChordLadder(dMajor)).toEqual([50, 57, 62, 66, 62 + 12, 57 + 12, 50 + 12, 66 + 12].sort((a, b) => a - b));
  });
});

describe('ChordToneNoteSource', () => {
  it('maps each button id to a distinct chord tone by its order index', () => {
    const src = new ChordToneNoteSource(['press-1', 'press-2', 'press-3']);
    const ladder = buildChordLadder(dMajor);
    expect(src.noteForPress('press-1', dMajor)).toBe(ladder[0]);
    expect(src.noteForPress('press-2', dMajor)).toBe(ladder[1]);
    expect(src.noteForPress('press-3', dMajor)).toBe(ladder[2]);
  });

  it('wraps around the ladder when there are more buttons than tones', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `press-${i + 1}`);
    const src = new ChordToneNoteSource(ids);
    const ladder = buildChordLadder(dMajor);
    expect(src.noteForPress('press-9', dMajor)).toBe(ladder[(9 - 1) % ladder.length]);
  });

  it('an unknown button id falls back to the lowest chord tone', () => {
    const src = new ChordToneNoteSource(['press-1']);
    expect(src.noteForPress('nope', dMajor)).toBe(buildChordLadder(dMajor)[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/NoteSource.test.ts`
Expected: FAIL — `Cannot find module '../songs/voices/NoteSource'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/songs/voices/NoteSource.ts
/**
 * NoteSource — decides which pitch a surface-button press plays, given
 * the song's current chord.
 *
 * This is the single seam for Stage 2. Stage 1 ships only the
 * deterministic ChordToneNoteSource. A future PianoGenieNoteSource
 * implements the same one-method interface and is swapped in where
 * ChordToneNoteSource is constructed (see SongPresetEngine.setSurfacePressConfig).
 *
 * Stage 2: add `PianoGenieNoteSource implements NoteSource` here and select
 * it in the engine. DO NOT add @magenta/music or any model in Stage 1.
 */

import type { ChordEntry } from './chordLookup';

export interface NoteSource {
  /** Pick the MIDI note for a press of `buttonId` given the current chord. */
  noteForPress(buttonId: string, chord: ChordEntry): number;
}

/**
 * Build a low→high, deduplicated pitch ladder from a chord's voicing,
 * layering the same voicing one octave higher for extra range. Shares the
 * shape used by InstrumentVoice.buildPitchLadder.
 */
export function buildChordLadder(chord: ChordEntry): number[] {
  if (chord.notes.length === 0) return [];
  const all = [...chord.notes, ...chord.notes.map((n) => n + 12)];
  return Array.from(new Set(all)).sort((a, b) => a - b);
}

/**
 * Deterministic note source: each button maps to a chord tone by its
 * index in `buttonOrder`, wrapping when there are more buttons than tones.
 * Unknown button ids fall back to the lowest chord tone.
 */
export class ChordToneNoteSource implements NoteSource {
  constructor(private readonly buttonOrder: readonly string[]) {}

  noteForPress(buttonId: string, chord: ChordEntry): number {
    const ladder = buildChordLadder(chord);
    if (ladder.length === 0) return chord.root;
    const idx = this.buttonOrder.indexOf(buttonId);
    const i = idx < 0 ? 0 : idx % ladder.length;
    return ladder[i];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/NoteSource.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/songs/voices/NoteSource.ts src/__tests__/NoteSource.test.ts
git commit -m "feat(surface-press): NoteSource seam + deterministic ChordToneNoteSource"
```

---

## Task 4: SurfacePressMode detector (hysteresis + velocity)

**Files:**
- Create: `src/tracking/SurfacePressMode.ts`
- Test: `src/__tests__/SurfacePressMode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/SurfacePressMode.test.ts
import { describe, it, expect } from 'vitest';
import { SurfacePressMode, type SurfacePressConfigInput, type SurfaceTrackPoint } from '../tracking/SurfacePressMode';

// Horizontal surface at y=0.8 for simple cases; press gap 0, release gap 0.1.
const flatConfig = (): SurfacePressConfigInput => ({
  line: { a: 0, b: 0.8 },
  pressGap: 0,
  releaseGap: 0.1,
  descentForFullVelocity: 0.1,
  defaultVelocity: 0.6,
  buttons: [{ id: 'press-1', x: 0.5, minBlobArea: 0 }],
});

const pt = (y: number, found = true): SurfaceTrackPoint[] => [
  { id: 'press-1', x: 0.5, y, found, area: 1 },
];

describe('SurfacePressMode', () => {
  it('does NOT fire on the first frame even if the object starts on the surface (resting)', () => {
    const m = new SurfacePressMode();
    m.setConfig(flatConfig());
    expect(m.step(pt(0.85), 0)).toEqual([]); // starts below the line → armed as "down", silent
  });

  it('fires a press when the point descends to the surface line', () => {
    const m = new SurfacePressMode();
    m.setConfig(flatConfig());
    m.step(pt(0.5), 0);                      // lifted, idle
    const events = m.step(pt(0.82), 16);     // descends past pressLine (0.8)
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('press');
    expect(events[0].buttonId).toBe('press-1');
  });

  it('does not chatter: no release until the point rises above the higher release line', () => {
    const m = new SurfacePressMode();
    m.setConfig(flatConfig());
    m.step(pt(0.5), 0);
    m.step(pt(0.82), 16);                    // press
    expect(m.step(pt(0.78), 32)).toEqual([]); // above pressLine but inside hysteresis band → no release
    expect(m.step(pt(0.72), 48)).toEqual([]); // still inside band (release line = 0.7)
    const rel = m.step(pt(0.68), 64);        // above release line (0.7) → release
    expect(rel).toHaveLength(1);
    expect(rel[0].type).toBe('release');
  });

  it('press threshold follows the oblique surface line across x', () => {
    const m = new SurfacePressMode();
    m.setConfig({
      ...flatConfig(),
      line: { a: -0.2, b: 0.8 },             // surfaceY: 0.8 at x=0, 0.6 at x=1
      buttons: [{ id: 'press-1', x: 1, minBlobArea: 0 }],
    });
    m.step([{ id: 'press-1', x: 1, y: 0.4, found: true, area: 1 }], 0);   // lifted
    // At x=1 the surface line is 0.6; y=0.55 is above it → no press.
    expect(m.step([{ id: 'press-1', x: 1, y: 0.55, found: true, area: 1 }], 16)).toEqual([]);
    // y=0.62 descends past the line → press.
    const ev = m.step([{ id: 'press-1', x: 1, y: 0.62, found: true, area: 1 }], 32);
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('press');
  });

  it('a faster descent yields a higher press velocity', () => {
    const slow = new SurfacePressMode(); slow.setConfig(flatConfig());
    slow.step(pt(0.78), 0); const sEv = slow.step(pt(0.81), 16); // Δ0.03

    const fast = new SurfacePressMode(); fast.setConfig(flatConfig());
    fast.step(pt(0.5), 0); const fEv = fast.step(pt(0.95), 16);  // Δ0.45

    expect(fEv[0].velocity).toBeGreaterThan(sEv[0].velocity);
  });

  it('ignores a button whose blob is below minBlobArea', () => {
    const m = new SurfacePressMode();
    m.setConfig({ ...flatConfig(), buttons: [{ id: 'press-1', x: 0.5, minBlobArea: 0.01 }] });
    m.step(pt(0.5), 0);
    expect(m.step([{ id: 'press-1', x: 0.5, y: 0.9, found: true, area: 0.001 }], 16)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/SurfacePressMode.test.ts`
Expected: FAIL — `Cannot find module '../tracking/SurfacePressMode'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tracking/SurfacePressMode.ts
/**
 * SurfacePressMode — turns coloured objects on a table into press triggers.
 *
 * Pure (no audio, no DOM). Sibling of ThereminMode. Given a calibrated
 * surface line and one tracked point per button each frame (the bottom of
 * the object's colour blob, or a fingertip), it runs a per-button
 * hysteresis state machine and emits typed press/release events.
 *
 * "Descends to the surface line" = the point's y rises to pressLine(x).
 * Release requires rising clear of a higher releaseLine(x) — the gap
 * between them is the anti-chatter hysteresis band. All thresholds are
 * supplied by config (calibrated per user); none are hardcoded here.
 *
 * The camera angle (front/side/oblique) is irrelevant: the surface line
 * is whatever was fitted from the user's touched points.
 */

import { surfaceY, type SurfaceLine } from './SurfaceModel';

export interface SurfacePressButtonConfig {
  /** Stable button id, e.g. "press-1". Own namespace, NOT a baton ColorRole. */
  id: string;
  /** Resting image x, used to evaluate surfaceY(x) for this button. */
  x: number;
  /** Minimum blob area to accept (reject noise). 0 in fingertip mode. */
  minBlobArea: number;
}

export interface SurfacePressConfigInput {
  line: SurfaceLine;
  /** Gap above the surface at which a press fires (≥0). */
  pressGap: number;
  /** Larger gap above the surface at which a release fires (> pressGap). */
  releaseGap: number;
  /** Per-frame descent (Δy) mapping to full velocity. */
  descentForFullVelocity: number;
  /** Velocity used when descent can't be measured. */
  defaultVelocity: number;
  buttons: SurfacePressButtonConfig[];
}

/** One tracked point per button for the current frame. */
export interface SurfaceTrackPoint {
  id: string;
  x: number;
  /** Tracked y (0 top … 1 bottom): blob bottom-edge or fingertip. */
  y: number;
  found: boolean;
  /** Blob area (0..1); 0 for fingertips. */
  area: number;
}

export interface SurfacePressEvent {
  type: 'press' | 'release';
  buttonId: string;
  /** 0..1; release is always 0. */
  velocity: number;
  timestamp: number;
}

type Phase = 'idle' | 'down';

interface ButtonState {
  phase: Phase;
  lastY: number;
  initialised: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class SurfacePressMode {
  private config: SurfacePressConfigInput | null = null;
  private states = new Map<string, ButtonState>();

  setConfig(config: SurfacePressConfigInput): void {
    this.config = config;
    // Drop state for buttons that no longer exist.
    const ids = new Set(config.buttons.map((b) => b.id));
    for (const id of [...this.states.keys()]) {
      if (!ids.has(id)) this.states.delete(id);
    }
  }

  reset(): void {
    this.states.clear();
  }

  /** Process one frame; returns the press/release events fired this frame. */
  step(points: SurfaceTrackPoint[], timestamp: number): SurfacePressEvent[] {
    if (!this.config) return [];
    const events: SurfacePressEvent[] = [];

    for (const btn of this.config.buttons) {
      const pt = points.find((p) => p.id === btn.id);
      if (!pt || !pt.found || pt.area < btn.minBlobArea) continue;

      const sy = surfaceY(this.config.line, pt.x);
      const pressLine = sy - this.config.pressGap;     // larger y (lower in image)
      const releaseLine = sy - this.config.releaseGap; // smaller y (higher in image)

      let state = this.states.get(btn.id);
      if (!state || !state.initialised) {
        // First reading: arm without firing. If it's already resting on the
        // surface, start "down" silently so it must be lifted then pressed
        // before it makes a sound (mirrors the engine's start-muted rule).
        state = {
          phase: pt.y >= pressLine ? 'down' : 'idle',
          lastY: pt.y,
          initialised: true,
        };
        this.states.set(btn.id, state);
        continue;
      }

      if (state.phase === 'idle' && pt.y >= pressLine) {
        const descent = pt.y - state.lastY;
        const velocity =
          descent > 0
            ? clamp(descent / this.config.descentForFullVelocity, 0.1, 1)
            : this.config.defaultVelocity;
        events.push({ type: 'press', buttonId: btn.id, velocity, timestamp });
        state.phase = 'down';
      } else if (state.phase === 'down' && pt.y <= releaseLine) {
        events.push({ type: 'release', buttonId: btn.id, velocity: 0, timestamp });
        state.phase = 'idle';
      }

      state.lastY = pt.y;
    }

    return events;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/SurfacePressMode.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tracking/SurfacePressMode.ts src/__tests__/SurfacePressMode.test.ts
git commit -m "feat(surface-press): SurfacePressMode detector — hysteresis press/release + velocity"
```

---

## Task 5: SurfacePressConfig persistence

**Files:**
- Create: `src/profiles/SurfacePressConfig.ts`
- Test: `src/__tests__/SurfacePressConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/SurfacePressConfig.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSurfacePressConfig,
  saveSurfacePressConfig,
  clearSurfacePressConfig,
  type SurfacePressStored,
} from '../profiles/SurfacePressConfig';

const sample = (): SurfacePressStored => ({
  enabled: true,
  surface: { a: -0.2, b: 0.8, points: [{ x: 0, y: 0.8 }, { x: 1, y: 0.6 }] },
  pressGap: 0,
  releaseGap: 0.1,
  descentForFullVelocity: 0.1,
  defaultVelocity: 0.6,
  useFingertip: false,
  buttons: [
    {
      id: 'press-1', x: 0.3, minBlobArea: 0.0005, instrumentKey: 'piano',
      color: { id: 'press-1', hue: 200, hueTolerance: 12, minSaturation: 40, minValue: 35, minArea: 0.0005 },
    },
  ],
});

beforeEach(() => localStorage.clear());

describe('SurfacePressConfig persistence', () => {
  it('returns null when nothing is stored', () => {
    expect(loadSurfacePressConfig()).toBeNull();
  });

  it('round-trips a valid config', () => {
    const cfg = sample();
    saveSurfacePressConfig(cfg);
    expect(loadSurfacePressConfig()).toEqual(cfg);
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('admi-surface-press', '{not json');
    expect(loadSurfacePressConfig()).toBeNull();
  });

  it('drops buttons with an unknown instrument key by defaulting it', () => {
    const cfg = sample();
    cfg.buttons[0].instrumentKey = 'definitely-not-real';
    saveSurfacePressConfig(cfg);
    expect(loadSurfacePressConfig()!.buttons[0].instrumentKey).toBe('piano');
  });

  it('clear removes the stored config', () => {
    saveSurfacePressConfig(sample());
    clearSurfacePressConfig();
    expect(loadSurfacePressConfig()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/SurfacePressConfig.test.ts`
Expected: FAIL — `Cannot find module '../profiles/SurfacePressConfig'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/profiles/SurfacePressConfig.ts
/**
 * Surface-press configuration persistence.
 *
 * Stores the calibrated surface line, per-user thresholds, and per-button
 * colour + instrument under a dedicated localStorage key — mirroring the
 * BatonAssignments pattern (separate key, sanitised on load, exposed via
 * InputProfileManager). A corrupt store can never break loading: any
 * failure yields null and the screen falls back to "not yet calibrated".
 */

import type { TrackedColor } from '../tracking/ColorTracker';
import {
  DEFAULT_INSTRUMENT_KEY,
  INSTRUMENT_PALETTE_BY_KEY,
} from '../songs/voices/presets/instrumentPalette';

const STORAGE_KEY = 'admi-surface-press';

export interface SurfacePressButtonStored {
  id: string;
  x: number;
  minBlobArea: number;
  instrumentKey: string;
  color: TrackedColor;
}

export interface SurfacePressStored {
  enabled: boolean;
  surface: { a: number; b: number; points: { x: number; y: number }[] };
  pressGap: number;
  releaseGap: number;
  descentForFullVelocity: number;
  defaultVelocity: number;
  /** Colour-blob bottom edge (false) vs HandDetector fingertip (true). */
  useFingertip: boolean;
  buttons: SurfacePressButtonStored[];
}

export function loadSurfacePressConfig(): SurfacePressStored | null {
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return sanitize(parsed);
  } catch (error) {
    console.warn('[SurfacePressConfig] Failed to load:', error);
    return null;
  }
}

export function saveSurfacePressConfig(config: SurfacePressStored): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const clean = sanitize(config);
    if (!clean) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch (error) {
    console.warn('[SurfacePressConfig] Failed to save:', error);
  }
}

export function clearSurfacePressConfig(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[SurfacePressConfig] Failed to clear:', error);
  }
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function sanitize(input: unknown): SurfacePressStored | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;

  const surface = o.surface as Record<string, unknown> | undefined;
  if (!surface || !isNum(surface.a) || !isNum(surface.b) || !Array.isArray(surface.points)) {
    return null;
  }
  const points = surface.points
    .filter((p): p is { x: number; y: number } =>
      typeof p === 'object' && p !== null && isNum((p as Record<string, unknown>).x) && isNum((p as Record<string, unknown>).y))
    .map((p) => ({ x: p.x, y: p.y }));

  const buttonsRaw = Array.isArray(o.buttons) ? o.buttons : [];
  const buttons: SurfacePressButtonStored[] = [];
  for (const b of buttonsRaw) {
    if (typeof b !== 'object' || b === null) continue;
    const bo = b as Record<string, unknown>;
    const color = bo.color as Record<string, unknown> | undefined;
    if (typeof bo.id !== 'string' || !isNum(bo.x) || !color) continue;
    const key =
      typeof bo.instrumentKey === 'string' && INSTRUMENT_PALETTE_BY_KEY[bo.instrumentKey]
        ? bo.instrumentKey
        : DEFAULT_INSTRUMENT_KEY;
    buttons.push({
      id: bo.id,
      x: bo.x,
      minBlobArea: isNum(bo.minBlobArea) ? bo.minBlobArea : 0.0005,
      instrumentKey: key,
      color: {
        id: typeof color.id === 'string' ? color.id : bo.id,
        hue: isNum(color.hue) ? color.hue : 0,
        hueTolerance: isNum(color.hueTolerance) ? color.hueTolerance : 15,
        minSaturation: isNum(color.minSaturation) ? color.minSaturation : 30,
        minValue: isNum(color.minValue) ? color.minValue : 30,
        minArea: isNum(color.minArea) ? color.minArea : 0.0005,
      },
    });
  }

  return {
    enabled: o.enabled === true,
    surface: { a: surface.a, b: surface.b, points },
    pressGap: isNum(o.pressGap) ? o.pressGap : 0,
    releaseGap: isNum(o.releaseGap) ? o.releaseGap : 0.1,
    descentForFullVelocity: isNum(o.descentForFullVelocity) ? o.descentForFullVelocity : 0.1,
    defaultVelocity: isNum(o.defaultVelocity) ? o.defaultVelocity : 0.6,
    useFingertip: o.useFingertip === true,
    buttons,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/SurfacePressConfig.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/profiles/SurfacePressConfig.ts src/__tests__/SurfacePressConfig.test.ts
git commit -m "feat(surface-press): SurfacePressConfig localStorage persistence"
```

---

## Task 6: ColorTracker — expose blob bottom edge (`bottomY`)

**Files:**
- Modify: `src/tracking/ColorTracker.ts`

No unit test (blob detection needs canvas/`getImageData`, which jsdom lacks; there is no existing ColorTracker test). Verified by `tsc` + the SurfacePressMode tests (which consume synthetic points) + manual run.

- [ ] **Step 1: Add `bottomY` to the `ColorBlob` interface**

In `src/tracking/ColorTracker.ts`, modify the `ColorBlob` interface (currently ~lines 29–40) to add the optional field at the end:

```ts
export interface ColorBlob {
  /** Color ID this blob matches */
  colorId: string;
  /** Center X position (0-1, normalized) */
  x: number;
  /** Center Y position (0-1, normalized) */
  y: number;
  /** Blob area (0-1, relative to frame) */
  area: number;
  /** Whether this blob was found this frame */
  found: boolean;
  /**
   * Normalised y (0 top … 1 bottom) of the LOWEST matched pixel — the
   * blob's bottom edge. Used by SurfacePressMode to detect an object
   * descending to the table. Optional and additive: existing consumers
   * (baton path) ignore it. Undefined when the blob is not found.
   */
  bottomY?: number;
}
```

- [ ] **Step 2: Track bottom edge in the smoothed-blob store**

Change the `smoothedBlobs` field declaration (currently ~line 93) to carry `bottomY`:

```ts
  private smoothedBlobs: Map<string, { x: number; y: number; area: number; bottomY: number }> = new Map();
```

- [ ] **Step 3: Compute and smooth `bottomY` in `findColorBlob`**

In `findColorBlob` (currently ~lines 329–405), add a `maxY` accumulator alongside the centroid sums, update it inside the matching-pixel branch, and include `bottomY` in every return + the smoothing. Replace the body so it reads:

```ts
  private findColorBlob(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    color: TrackedColor
  ): ColorBlob {
    let totalX = 0;
    let totalY = 0;
    let maxYpx = -1;            // lowest matched pixel row (bottom edge)
    let matchingPixels = 0;

    const totalPixels = width * height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const hsv = this.rgbToHsv(r, g, b);

        if (this.matchesColor(hsv, color)) {
          totalX += x;
          totalY += y;
          if (y > maxYpx) maxYpx = y;
          matchingPixels++;
        }
      }
    }

    const area = matchingPixels / totalPixels;

    // Check minimum area threshold
    if (matchingPixels === 0 || area < color.minArea) {
      const smoothed = this.smoothedBlobs.get(color.id);
      if (smoothed) {
        const alpha = 0.9;
        smoothed.area *= alpha;
        if (smoothed.area < 0.0001) {
          return { colorId: color.id, x: 0.5, y: 0.5, area: 0, found: false };
        }
        return { colorId: color.id, x: smoothed.x, y: smoothed.y, area: smoothed.area, found: false, bottomY: smoothed.bottomY };
      }
      return { colorId: color.id, x: 0.5, y: 0.5, area: 0, found: false };
    }

    const rawX = totalX / matchingPixels / width;
    const rawY = totalY / matchingPixels / height;
    const rawBottomY = maxYpx / height;

    const alpha = this.config.smoothing;
    const prev = this.smoothedBlobs.get(color.id);

    let smoothedX = rawX;
    let smoothedY = rawY;
    let smoothedArea = area;
    let smoothedBottomY = rawBottomY;

    if (prev) {
      smoothedX = alpha * prev.x + (1 - alpha) * rawX;
      smoothedY = alpha * prev.y + (1 - alpha) * rawY;
      smoothedArea = alpha * prev.area + (1 - alpha) * area;
      smoothedBottomY = alpha * prev.bottomY + (1 - alpha) * rawBottomY;
    }

    this.smoothedBlobs.set(color.id, { x: smoothedX, y: smoothedY, area: smoothedArea, bottomY: smoothedBottomY });

    return {
      colorId: color.id,
      x: smoothedX,
      y: smoothedY,
      area: smoothedArea,
      found: true,
      bottomY: smoothedBottomY,
    };
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run lint`
Expected: PASS (no type errors). Existing ColorTracker consumers are unaffected (`bottomY` is optional).

- [ ] **Step 5: Commit**

```bash
git add src/tracking/ColorTracker.ts
git commit -m "feat(surface-press): expose colour-blob bottom edge (bottomY) for press detection"
```

---

## Task 7: SurfacePressVoice (sampled press/sustain voice)

**Files:**
- Create: `src/songs/voices/SurfacePressVoice.ts`

No standalone unit test (it wraps Tone.Sampler); exercised via the engine task + manual run. Reuses `SamplerPlayer` + the instrument palette — no new synthesis.

- [ ] **Step 1: Implement the voice**

```ts
// src/songs/voices/SurfacePressVoice.ts
/**
 * SurfacePressVoice — a sampled voice driven by discrete surface presses.
 *
 * Reuses the existing sampler infrastructure (SamplerPlayer + the curated
 * instrument palette / SAMPLE_CONFIGS) — NOT new synthesis. Unlike the
 * position-driven InstrumentVoice, it exposes explicit press()/release()
 * for note-on at press and note-off at release.
 *
 * bypassFade is set so the voice is always at unit gain — the sampler's
 * own envelope shapes the note. One voice instance per registered button;
 * the engine releases the held note on a release event.
 */

import { ToneVoiceBase } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import type { Player } from './SynthPlayer';
import { getInstrumentEntry } from './presets/instrumentPalette';
import type { ChordEntry } from './chordLookup';

export class SurfacePressVoice extends ToneVoiceBase {
  private player: Player;
  private heldMidi: number | null = null;

  constructor(ctx: AudioContext, instrumentKey: string) {
    super(ctx);
    // Always-on gain; the sampler envelope handles dynamics.
    this.bypassFade = true;
    this.active = true;
    this.outputGain.gain.value = 1;
    const entry = getInstrumentEntry(instrumentKey);
    this.player = new SamplerPlayer(SAMPLE_CONFIGS[entry.sampleKey], this.filterNode);
  }

  /** Note-on for a press. */
  press(midi: number, velocity: number): void {
    if (!this.player.isReady()) return;
    // Release any previous note on this button before retriggering.
    if (this.heldMidi !== null) this.player.releaseAll();
    this.player.triggerAttack(midi, velocity);
    this.heldMidi = midi;
    this.onNoteTrigger?.();
  }

  /** Note-off for a release. */
  release(): void {
    if (this.heldMidi === null) return;
    this.player.releaseAll();
    this.heldMidi = null;
  }

  isHolding(): boolean {
    return this.heldMidi !== null;
  }

  /** Required by ToneVoiceBase; this voice is event-driven, not per-frame. */
  update(_playbackTime: number, _chord: ChordEntry | null, _velocity: number): void {
    /* no-op: presses are driven by the engine, not the frame loop */
  }

  onTransportStop(): void {
    this.release();
  }

  dispose(): void {
    this.player.releaseAll();
    this.player.dispose();
    this.disposeBase();
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/songs/voices/SurfacePressVoice.ts
git commit -m "feat(surface-press): SurfacePressVoice — sampled press/sustain voice (reuses SamplerPlayer)"
```

---

## Task 8: SongPresetEngine integration

**Files:**
- Modify: `src/songs/SongPresetEngine.ts`
- Test: `src/__tests__/SongPresetEngine.surfacePress.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/SongPresetEngine.surfacePress.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', () => ({
  Sampler: vi.fn(),
  Frequency: vi.fn(() => ({ toNote: () => 'A4', toFrequency: () => 440 })),
  now: vi.fn(() => 0),
  start: vi.fn(async () => undefined),
  loaded: vi.fn(async () => undefined),
  connect: vi.fn(),
  Reverb: vi.fn(() => ({ connect: vi.fn(), dispose: vi.fn() })),
  getContext: vi.fn(() => ({ rawContext: {} })),
  getTransport: vi.fn(() => ({
    bpm: { value: 120 }, start: vi.fn(), stop: vi.fn(), pause: vi.fn(),
    cancel: vi.fn(), seconds: 0, scheduleOnce: vi.fn(),
  })),
}));

import { SongPresetEngine } from '../songs/SongPresetEngine';

describe('SongPresetEngine surface press', () => {
  it('setSurfacePressEnabled and config are safe no-ops before a song loads', () => {
    const engine = new SongPresetEngine();
    expect(() => {
      engine.setSurfacePressEnabled(true);
      engine.setSurfacePressConfig({ buttons: [{ id: 'press-1', instrumentKey: 'piano' }] });
      engine.pressSurfaceButton('press-1', 0.8); // no chord/voice yet → must not throw
      engine.releaseSurfaceButton('press-1');
    }).not.toThrow();
  });

  it('mirrors a noteOff only when a note was actually held', () => {
    const engine = new SongPresetEngine();
    const events: string[] = [];
    engine.onSurfaceNote = (e) => events.push(e.action);
    engine.setSurfacePressEnabled(true);
    engine.setSurfacePressConfig({ buttons: [{ id: 'press-1', instrumentKey: 'piano' }] });
    // No chord loaded → press produces no note → release must not emit a noteOff.
    engine.pressSurfaceButton('press-1', 0.8);
    engine.releaseSurfaceButton('press-1');
    expect(events).not.toContain('noteOff');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/SongPresetEngine.surfacePress.test.ts`
Expected: FAIL — `engine.setSurfacePressEnabled is not a function`.

- [ ] **Step 3: Add imports**

At the top of `src/songs/SongPresetEngine.ts`, with the other voice imports, add:

```ts
import { SurfacePressVoice } from './voices/SurfacePressVoice';
import { ChordToneNoteSource, type NoteSource } from './voices/NoteSource';
import { resolvePressTime, PendingPressQueue } from './surfacePressTiming';
import { createNoteEvent, type NoteEvent } from '../mapping/events';
```

- [ ] **Step 4: Add fields**

Inside the `SongPresetEngine` class, near the other private state (e.g. after the head-bop fields), add:

```ts
  // ---- Surface press mode (opt-in; default off) ----
  private surfacePressEnabled = false;
  /** Per-button sampled voices, keyed by button id (e.g. "press-1"). */
  private surfacePressVoices = new Map<string, SurfacePressVoice>();
  /** MIDI note currently held per button (for release + mirror correctness). */
  private surfaceHeldMidi = new Map<string, number>();
  private surfaceNoteSource: NoteSource = new ChordToneNoteSource([]);
  private surfacePressQueue = new PendingPressQueue();

  /** Mirror of surface note-on/off as typed events (facilitator visuals / future MIDI). */
  onSurfaceNote?: (event: NoteEvent) => void;
```

- [ ] **Step 5: Add the public API methods**

Add these methods to the class (e.g. just before `// ---- Head Bopping`):

```ts
  // ---- Surface press mode ----

  setSurfacePressEnabled(enabled: boolean): void {
    this.surfacePressEnabled = enabled;
    if (!enabled) {
      // Release everything and drop pending beat-snapped presses.
      for (const [buttonId] of this.surfaceHeldMidi) {
        this.surfacePressVoices.get(buttonId)?.release();
      }
      this.surfaceHeldMidi.clear();
      this.surfacePressQueue.clear();
    }
  }

  isSurfacePressEnabled(): boolean {
    return this.surfacePressEnabled;
  }

  /**
   * Configure the surface-press buttons (id + instrument). Builds one
   * sampled voice per button and a deterministic NoteSource ordered by
   * the button ids. Safe to call before a song loads (voices that need a
   * context are built lazily once ctx exists).
   */
  setSurfacePressConfig(config: { buttons: { id: string; instrumentKey: string }[] }): void {
    this.surfaceNoteSource = new ChordToneNoteSource(config.buttons.map((b) => b.id));

    // Dispose voices for buttons no longer present.
    const ids = new Set(config.buttons.map((b) => b.id));
    for (const [id, voice] of [...this.surfacePressVoices]) {
      if (!ids.has(id)) {
        voice.disconnect();
        voice.dispose();
        this.surfacePressVoices.delete(id);
        this.surfaceHeldMidi.delete(id);
      }
    }

    // Build/refresh voices (only possible once we have an audio context).
    if (this.ctx && this.generatedBus) {
      for (const b of config.buttons) {
        const existing = this.surfacePressVoices.get(b.id);
        if (existing) {
          existing.setPreset(b.instrumentKey);
        } else {
          const voice = new SurfacePressVoice(this.ctx, b.instrumentKey);
          voice.onNoteTrigger = () => this.triggerSidechain();
          voice.connect(this.generatedBus);
          this.surfacePressVoices.set(b.id, voice);
        }
      }
    }
  }

  /**
   * Handle a press from SurfacePressMode. Picks a chord tone via the
   * NoteSource and plays it on the button's sampled voice — immediately,
   * or deferred to the next beat when beat-snap is on. No chord or no
   * voice → silent no-op (never throws).
   */
  pressSurfaceButton(buttonId: string, velocity = 0.7): void {
    if (!this.surfacePressEnabled || !this.currentChord) return;
    const voice = this.surfacePressVoices.get(buttonId);
    if (!voice) return;

    const midi = this.surfaceNoteSource.noteForPress(buttonId, this.currentChord);
    const targetTime = resolvePressTime(this.song?.beats, this.getCurrentTime(), this.beatSnap);

    if (this.beatSnap && this.song?.beats && this.song.beats.length > 0 && this.isPlayingState) {
      this.surfacePressQueue.schedule(buttonId, midi, velocity, targetTime);
    } else {
      this.playSurfaceNote(buttonId, midi, velocity);
    }
  }

  /** Handle a release: cancel any pending press and stop a held note. */
  releaseSurfaceButton(buttonId: string): void {
    this.surfacePressQueue.cancel(buttonId);
    const voice = this.surfacePressVoices.get(buttonId);
    if (!voice) return;
    const held = this.surfaceHeldMidi.get(buttonId);
    if (held === undefined) return;       // nothing sounding → no mirror
    voice.release();
    this.surfaceHeldMidi.delete(buttonId);
    this.onSurfaceNote?.(createNoteEvent('noteOff', held, 0, performance.now()));
  }

  private playSurfaceNote(buttonId: string, midi: number, velocity: number): void {
    const voice = this.surfacePressVoices.get(buttonId);
    if (!voice) return;
    voice.press(midi, velocity);
    this.surfaceHeldMidi.set(buttonId, midi);
    this.onSurfaceNote?.(createNoteEvent('noteOn', midi, velocity, performance.now()));
  }
```

- [ ] **Step 6: Flush beat-snapped presses in the frame loop**

In `update()`, immediately after the head-bop pending flush block (the `if (this.headBopPending && ...)` lines near the top of `update`), add:

```ts
    // Flush any beat-snapped surface presses whose target beat has arrived.
    if (this.surfacePressEnabled) {
      for (const due of this.surfacePressQueue.flushDue(currentTime)) {
        this.playSurfaceNote(due.buttonId, due.midi, due.velocity);
      }
    }
```

- [ ] **Step 7: Dispose surface voices in `disposeAudio()`**

In `disposeAudio()`, after the head-bop kit teardown, add:

```ts
    for (const voice of this.surfacePressVoices.values()) {
      voice.disconnect();
      voice.dispose();
    }
    this.surfacePressVoices.clear();
    this.surfaceHeldMidi.clear();
    this.surfacePressQueue.clear();
```

- [ ] **Step 8: Rebuild surface voices after a song loads**

At the end of `buildVoices()`, add a rebuild so voices get a live context after `loadSong`:

```ts
    // Rebuild surface-press voices now that ctx + generatedBus exist.
    if (this.surfacePressVoices.size === 0 && this.surfaceNoteSourceButtonIds().length > 0) {
      this.setSurfacePressConfig({
        buttons: this.surfaceNoteSourceButtonIds().map((id) => ({
          id,
          instrumentKey: this.surfacePressInstrumentKeys.get(id) ?? 'piano',
        })),
      });
    }
```

Add the supporting field + helper. With the other surface fields (Step 4) add:

```ts
  /** Remembered instrument key per button so voices can be rebuilt on song load. */
  private surfacePressInstrumentKeys = new Map<string, string>();
```

Add this private helper near the other surface methods:

```ts
  private surfaceNoteSourceButtonIds(): string[] {
    return [...this.surfacePressInstrumentKeys.keys()];
  }
```

And in `setSurfacePressConfig`, record the keys at the top (after building the NoteSource):

```ts
    this.surfacePressInstrumentKeys = new Map(config.buttons.map((b) => [b.id, b.instrumentKey]));
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/SongPresetEngine.surfacePress.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 10: Run the full suite + lint**

Run: `npm run test:run` then `npm run lint`
Expected: all tests PASS; no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/songs/SongPresetEngine.ts src/__tests__/SongPresetEngine.surfacePress.test.ts
git commit -m "feat(surface-press): SongPresetEngine press/release, beat-snap flush, event mirror"
```

---

## Task 9: Expose surface-press config via InputProfileManager

**Files:**
- Modify: `src/profiles/InputProfileManager.ts`

- [ ] **Step 1: Add imports**

Near the `BatonAssignments` import in `src/profiles/InputProfileManager.ts`, add:

```ts
import {
  loadSurfacePressConfig,
  saveSurfacePressConfig,
  clearSurfacePressConfig,
  type SurfacePressStored,
} from './SurfacePressConfig';
```

- [ ] **Step 2: Add delegating methods**

Next to the existing `getBatonAssignments` / `saveBatonAssignments` / `clearBatonAssignments` methods, add:

```ts
  getSurfacePressConfig(): SurfacePressStored | null {
    return loadSurfacePressConfig();
  }

  saveSurfacePressConfig(config: SurfacePressStored): void {
    saveSurfacePressConfig(config);
  }

  clearSurfacePressConfig(): void {
    clearSurfacePressConfig();
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/profiles/InputProfileManager.ts
git commit -m "feat(surface-press): expose surface-press config via InputProfileManager"
```

---

## Task 10: SongPresetScreen wiring (toggle, calibration, detector, overlay)

**Files:**
- Modify: `src/ui/screens/SongPresetScreen.tsx`

UI integration — no unit test (verified by `npm run lint` + manual run). Re-read the file before editing (pre-flight). Use the existing head-bop toggle and `handleCalibrateColor` / `handleVideoAreaClick` blocks as the structural template; keep all additions behind the `surfacePressEnabled` flag so the baton path is untouched when off.

- [ ] **Step 1: Imports + refs + state**

Add imports:

```tsx
import { SurfacePressMode, type SurfaceTrackPoint } from '../../tracking/SurfacePressMode';
import { fitSurfaceLine } from '../../tracking/SurfaceModel';
import { getInputProfileManager } from '../../profiles/InputProfileManager';
import type { SurfacePressStored } from '../../profiles/SurfacePressConfig';
```

Add a ref + state near the other refs/state (`colorTrackerRef`, `headBopEnabled`):

```tsx
const surfacePressModeRef = useRef<SurfacePressMode | null>(null);
const surfaceConfigRef = useRef<SurfacePressStored | null>(
  getInputProfileManager().getSurfacePressConfig(),
);
const [surfacePressEnabled, setSurfacePressEnabled] = useState<boolean>(
  surfaceConfigRef.current?.enabled ?? false,
);
```

- [ ] **Step 2: Push config into the engine + detector when enabled changes**

Add an effect (modeled on the head-bop effect):

```tsx
useEffect(() => {
  const engine = engineRef.current;
  engine.setSurfacePressEnabled(surfacePressEnabled);

  const cfg = surfaceConfigRef.current;
  if (surfacePressEnabled && cfg) {
    // Build the detector from persisted calibration.
    if (!surfacePressModeRef.current) surfacePressModeRef.current = new SurfacePressMode();
    surfacePressModeRef.current.setConfig({
      line: { a: cfg.surface.a, b: cfg.surface.b },
      pressGap: cfg.pressGap,
      releaseGap: cfg.releaseGap,
      descentForFullVelocity: cfg.descentForFullVelocity,
      defaultVelocity: cfg.defaultVelocity,
      buttons: cfg.buttons.map((b) => ({ id: b.id, x: b.x, minBlobArea: b.minBlobArea })),
    });
    engine.setSurfacePressConfig({
      buttons: cfg.buttons.map((b) => ({ id: b.id, instrumentKey: b.instrumentKey })),
    });
    // Register each button's calibrated colour with the tracker (own namespace).
    for (const b of cfg.buttons) colorTrackerRef.current?.addColor(b.color);
  } else {
    surfacePressModeRef.current?.reset();
  }

  // Persist the enabled flag.
  if (cfg) {
    getInputProfileManager().saveSurfacePressConfig({ ...cfg, enabled: surfacePressEnabled });
  }
}, [surfacePressEnabled]);
```

- [ ] **Step 3: Feed frames to the detector inside the existing rAF `loop`**

Inside the main rAF `loop` (where `engineRef.current.setAllPositions(positions)` is called), after that call add:

```tsx
    // Surface press: feed blob bottom-edges (or fingertips) to the detector.
    if (surfacePressEnabled && surfacePressModeRef.current && surfaceConfigRef.current) {
      const cfg = surfaceConfigRef.current;
      const blobs = blobsRef.current;
      const pts: SurfaceTrackPoint[] = cfg.buttons.map((b) => {
        const blob = blobs.find((bl) => bl.colorId === b.id);
        const yRaw = blob?.bottomY ?? blob?.y ?? 0.5;
        return {
          id: b.id,
          x: blob ? 1 - blob.x : b.x,          // mirror X to match the mirrored video
          y: yRaw,
          found: blob?.found ?? false,
          area: blob?.area ?? 0,
        };
      });
      for (const ev of surfacePressModeRef.current.step(pts, performance.now())) {
        if (ev.type === 'press') engineRef.current.pressSurfaceButton(ev.buttonId, ev.velocity);
        else engineRef.current.releaseSurfaceButton(ev.buttonId);
      }
    }
```

(Note: the baton `buildPositions`/`setAllPositions` path is untouched — surface buttons use `press-N` colour ids, never the baton roles, so they don't appear in the baton position map.)

- [ ] **Step 4: Add the facilitator toggle**

In the facilitator/controls panel (next to the head-bop / beat-snap toggles), add a control bound to `surfacePressEnabled`:

```tsx
<label className="toggle-row">
  <input
    type="checkbox"
    checked={surfacePressEnabled}
    disabled={!surfaceConfigRef.current}
    onChange={(e) => setSurfacePressEnabled(e.target.checked)}
  />
  <span>Surface press mode {surfaceConfigRef.current ? '' : '(calibrate first)'}</span>
</label>
```

- [ ] **Step 5: Add a minimal calibration flow**

Add a "Calibrate surface" button + click handlers that (a) collect surface touch points, then (b) register each button's colour via `calibrateFromPixel`, then persist. Add state:

```tsx
const [surfaceCalStage, setSurfaceCalStage] = useState<'idle' | 'surface' | 'buttons'>('idle');
const surfacePointsRef = useRef<{ x: number; y: number }[]>([]);
const surfaceButtonsRef = useRef<SurfacePressStored['buttons']>([]);
const SURFACE_BUTTON_COUNT = 4;            // default; commissioner-overridable
const SURFACE_DEFAULT_INSTRUMENT = 'piano';
```

Add a start handler:

```tsx
const startSurfaceCalibration = useCallback(() => {
  surfacePointsRef.current = [];
  surfaceButtonsRef.current = [];
  setSurfaceCalStage('surface');
}, []);
```

Extend the existing `handleVideoAreaClick` (or add a dedicated handler bound to the same video click target) so that while calibrating it routes clicks. Add at the top of the click handler body, before the existing colour-cal logic:

```tsx
  if (surfaceCalStage === 'surface') {
    const rect = videoEl.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;
    surfacePointsRef.current.push({ x: 1 - sx, y: sy }); // store raw (unmirrored) coords
    if (surfacePointsRef.current.length >= 2) setSurfaceCalStage('buttons');
    return;
  }
  if (surfaceCalStage === 'buttons') {
    const rect = videoEl.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width;
    const sy = (e.clientY - rect.top) / rect.height;
    const rawX = 1 - sx;
    const id = `press-${surfaceButtonsRef.current.length + 1}`;
    const color = colorTrackerRef.current?.calibrateFromPixel(videoEl, rawX, sy, id);
    if (color) {
      surfaceButtonsRef.current.push({
        id, x: rawX, minBlobArea: 0.0005, instrumentKey: SURFACE_DEFAULT_INSTRUMENT, color,
      });
    }
    if (surfaceButtonsRef.current.length >= SURFACE_BUTTON_COUNT) {
      const line = fitSurfaceLine(surfacePointsRef.current);
      const cfg: SurfacePressStored = {
        enabled: true,
        surface: { a: line.a, b: line.b, points: surfacePointsRef.current },
        pressGap: 0, releaseGap: 0.1, descentForFullVelocity: 0.1, defaultVelocity: 0.6,
        useFingertip: false,
        buttons: surfaceButtonsRef.current,
      };
      surfaceConfigRef.current = cfg;
      getInputProfileManager().saveSurfacePressConfig(cfg);
      setSurfaceCalStage('idle');
      setSurfacePressEnabled(true);
    }
    return;
  }
```

Add the button + a small status line in the panel:

```tsx
<button onClick={startSurfaceCalibration}>Calibrate surface press</button>
{surfaceCalStage === 'surface' && <span>Click {2 - surfacePointsRef.current.length} more point(s) along the table edge…</span>}
{surfaceCalStage === 'buttons' && <span>Click each object on the table ({surfaceButtonsRef.current.length}/{SURFACE_BUTTON_COUNT})…</span>}
```

- [ ] **Step 6: Add the facilitator overlay (surface line + button state)**

Where the screen draws the video overlay (the canvas draw block in `loop`), add a draw of the surface line and each button marker when enabled:

```tsx
    // Surface-press overlay (facilitator feedback; Tim relies on sound).
    if (surfacePressEnabled && surfaceConfigRef.current && overlayCtx) {
      const cfg = surfaceConfigRef.current;
      const W = canvasEl.width, H = canvasEl.height;
      overlayCtx.strokeStyle = 'rgba(0,200,255,0.8)';
      overlayCtx.beginPath();
      // surface line is in raw coords; the canvas is mirrored like the video.
      overlayCtx.moveTo((1 - 0) * W, (cfg.surface.a * 0 + cfg.surface.b) * H);
      overlayCtx.lineTo((1 - 1) * W, (cfg.surface.a * 1 + cfg.surface.b) * H);
      overlayCtx.stroke();
      for (const b of cfg.buttons) {
        const blob = blobsRef.current.find((bl) => bl.colorId === b.id);
        const down = engineRef.current.isSurfacePressEnabled() && (blob?.bottomY ?? 1) >= (cfg.surface.a * b.x + cfg.surface.b - cfg.pressGap);
        overlayCtx.fillStyle = down ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.6)';
        overlayCtx.beginPath();
        overlayCtx.arc((1 - b.x) * W, (blob?.bottomY ?? b.x) * H, down ? 12 : 8, 0, Math.PI * 2);
        overlayCtx.fill();
      }
    }
```

(Use the screen's existing overlay canvas context variable name in place of `overlayCtx`/`canvasEl` — match what the surrounding draw code already uses.)

- [ ] **Step 7: Verify it compiles**

Run: `npm run lint`
Expected: PASS. Fix any name mismatches against the actual variable names in `SongPresetScreen` (overlay context, canvas ref, click-handler signature).

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, open the Song Preset screen.
- With surface mode OFF: confirm baton mode behaves exactly as before (assign a baton colour, move it, hear the existing voice; calibration + stillness gate unchanged).
- Calibrate surface: click 2 points along the table edge, then click each object; toggle turns on automatically.
- Lower an object to the table → hear one chord-tone sampled note; lift it → note ends. No chatter when hovering near the line. Toggle beat-snap → presses land on the beat.

- [ ] **Step 9: Commit**

```bash
git add src/ui/screens/SongPresetScreen.tsx
git commit -m "feat(surface-press): SongPresetScreen wiring — toggle, calibration, detector, overlay"
```

---

## Task 11: Full verification + regression

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`
Expected: all tests PASS, including the 5 new surface-press suites.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no type errors.

- [ ] **Step 3: Manual regression of existing modes**

Run: `npm run dev`. Confirm with surface mode OFF:
- Baton position → voice mapping, stillness gate, calibration, head-bop, beat-snap all behave exactly as before.
- ColorExpression / baton colours unaffected by the new `bottomY` field.

- [ ] **Step 4: Commit (if any fixups were needed)**

```bash
git add -A
git commit -m "test(surface-press): verification + regression fixups"
```

---

## Self-review notes

**Spec coverage:**
- §1 interaction / §2 architecture → Tasks 4, 7, 8 (engine consumer + event mirror).
- §3.1 `bottomY` → Task 6. §3.2 surface line → Task 1. §3.3 hysteresis → Task 4. §3.4 velocity → Task 4. §3.5 engine playback/beat-snap/mirror → Tasks 2, 7, 8. §3.6 NoteSource seam → Task 3.
- §4 calibration + persistence → Tasks 5, 9, 10. §5 toggle → Task 10. §6 visual feedback → Task 10 overlay + Task 8 mirror.
- §8 tests → Tasks 1–5, 8 (surface line across x, hysteresis, chord tone, beat-snap). §9 acceptance → Task 11.
- §10 defaults (4 buttons, piano, blob-bottom) → Task 10 constants. §11 out-of-scope → no `@magenta`/model anywhere; NoteSource has only `ChordToneNoteSource`.

**Type consistency:** `SurfacePressEvent`, `SurfaceTrackPoint`, `SurfacePressConfigInput` (Task 4) consumed verbatim in Task 10. `SurfacePressStored`/`SurfacePressButtonStored` (Task 5) consumed in Tasks 9–10. `NoteSource`/`ChordToneNoteSource` (Task 3) consumed in Task 8. `PendingPressQueue`/`resolvePressTime` (Task 2) consumed in Task 8. `bottomY` (Task 6) consumed in Task 10. Engine `onSurfaceNote: (e: NoteEvent) => void` matches `createNoteEvent` return type.

**Known UI caveat:** Task 10 step paths reference `SongPresetScreen`'s existing overlay-canvas and click-handler variable names — the implementer must match the actual identifiers in the file (flagged in Step 7). This is wiring, not new logic.
