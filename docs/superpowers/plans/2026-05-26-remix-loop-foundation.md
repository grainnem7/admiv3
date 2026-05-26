# Remix Loop Foundation + Keyboard + Tim Accessibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Remix playable, loop-able, and usable by Tim: convert stems to Transport-synced `Tone.Player`s (fix clock drift), add a bar-snapped loop region with nudge, a direct per-stem keyboard test mode, movement-range calibration with reach margins, and gross-motor triggers (baton-touch → cycle, head-nod → stutter).

**Architecture:** Pure helpers (`loopRegion`, `batonCalibration`, `BatonTouchDetector`, `remixKeyMap`) built and unit-tested first. Then `RemixEngine` moves onto `Tone.Transport` as the authoritative clock with `Tone.Player` stems, gaining loop/focus/calibration/head-nod/keyboard-facing APIs. `RemixBaton` applies calibration and gains toggleable dwell. `RemixScreen` wires the new controls + FaceDetector + baton-touch, reusing SongPresetScreen patterns.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Tone.js v15 + raw Web Audio, MediaPipe FaceDetector, Vitest + jsdom. No new dependencies.

**Spec:** [../specs/2026-05-26-remix-loop-foundation-design.md](../specs/2026-05-26-remix-loop-foundation-design.md)

---

## File Map

| Path | New / Modified | Responsibility |
|---|---|---|
| `src/remix/loopRegion.ts` | New | Pure bar-snap math: `computeLoopRegion`, `nudgeOrigin`. |
| `src/remix/batonCalibration.ts` | New | Pure `applyAxisCalibration(raw, range, margin)`. |
| `src/remix/BatonTouchDetector.ts` | New | Pure two-centroid proximity detector (rising-edge + cooldown). |
| `src/remix/remixKeyMap.ts` | New | Pure `keyToRemixAction(key)`. |
| `src/remix/RemixEngine.ts` | Modified | Tone.Player conversion; loop region; focused stem; keyboard setters; head-nod; stutter clock re-home + seam clamp. |
| `src/remix/RemixBaton.ts` | Modified | Apply calibration to input; `setDwellCycleEnabled`; expose `centroid()`. |
| `src/ui/screens/RemixScreen.tsx` | Modified | Loop controls + timeline, keyboard mode, range-calibration capture, baton-touch wiring, FaceDetector head-nod, trigger toggles, focused-stem UI. |
| `src/__tests__/loopRegion.test.ts` | New | `computeLoopRegion` / `nudgeOrigin` truth-tables. |
| `src/__tests__/batonCalibration.test.ts` | New | Calibration + margin behaviour. |
| `src/__tests__/BatonTouchDetector.test.ts` | New | Proximity rising-edge + cooldown. |
| `src/__tests__/remixKeyMap.test.ts` | New | Key → action mapping. |
| `src/__tests__/RemixEngine.test.ts` | Modified | Player conversion + loop + focus + head-nod + keyboard setters; existing tests stay green. |
| `src/__tests__/RemixBaton.test.ts` | Modified | Calibration applied; dwell-disable; existing tests stay green. |

Dependency order: pure helpers (1–4) → engine conversion (5) → engine features (6–10) → baton (11) → screen (12–16) → verification (17).

---

## Task 1: `loopRegion.ts` — bar-snap math

**Files:** Create `src/remix/loopRegion.ts`, `src/__tests__/loopRegion.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/loopRegion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeLoopRegion, nudgeOrigin } from '../remix/loopRegion';

// 9 downbeats → 8 bars (bar i = downbeats[i]..downbeats[i+1]); 2s per bar.
const DB = [0, 2, 4, 6, 8, 10, 12, 14, 16];

describe('computeLoopRegion', () => {
  it('returns a 4-bar window from the origin downbeat', () => {
    expect(computeLoopRegion(DB, 0, 4)).toEqual({ startSec: 0, endSec: 8 });
    expect(computeLoopRegion(DB, 2, 4)).toEqual({ startSec: 4, endSec: 12 });
  });

  it('returns an 8-bar window', () => {
    expect(computeLoopRegion(DB, 0, 8)).toEqual({ startSec: 0, endSec: 16 });
  });

  it('clamps the window end to the last downbeat', () => {
    // origin 6, 4 bars would end at bar 10 but only bar 8 exists → end at 16.
    expect(computeLoopRegion(DB, 6, 4)).toEqual({ startSec: 12, endSec: 16 });
  });

  it('returns null for Off (lengthBars <= 0)', () => {
    expect(computeLoopRegion(DB, 0, 0)).toBeNull();
  });

  it('returns null when there are fewer than 2 downbeats', () => {
    expect(computeLoopRegion([], 0, 4)).toBeNull();
    expect(computeLoopRegion([5], 0, 4)).toBeNull();
  });
});

describe('nudgeOrigin', () => {
  // barCount = DB.length - 1 = 8.
  it('steps the origin forward by the loop length', () => {
    expect(nudgeOrigin(0, 1, 4, 8)).toBe(4);
  });

  it('steps backward and clamps at 0', () => {
    expect(nudgeOrigin(4, -1, 4, 8)).toBe(0);
    expect(nudgeOrigin(0, -1, 4, 8)).toBe(0);
  });

  it('clamps forward so a full window stays in range', () => {
    // lastValidOrigin = barCount - lengthBars = 4. From 4, +4 would be 8 → clamp 4.
    expect(nudgeOrigin(4, 1, 4, 8)).toBe(4);
  });

  it('clamps to 0 when the window is larger than the song', () => {
    expect(nudgeOrigin(0, 1, 16, 8)).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/loopRegion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/loopRegion.ts`:

```ts
/**
 * loopRegion — pure bar-snap math for the Remix loop window.
 *
 * A "bar" is the span between consecutive downbeats. The loop window is
 * `lengthBars` bars starting at downbeat index `originBar`. All times are
 * downbeat timestamps, so loops are always musically aligned.
 */

export interface LoopRegion {
  startSec: number;
  endSec: number;
}

/**
 * The N-bar window starting at downbeat index `originBar`, clamped so the
 * end never exceeds the last downbeat. Returns null when there is no usable
 * window (fewer than 2 downbeats, or lengthBars <= 0 meaning "Off").
 */
export function computeLoopRegion(
  downbeats: readonly number[],
  originBar: number,
  lengthBars: number,
): LoopRegion | null {
  if (lengthBars <= 0) return null;
  if (downbeats.length < 2) return null;

  const lastBar = downbeats.length - 1; // index of the final downbeat
  const start = Math.max(0, Math.min(originBar, lastBar - 1));
  const end = Math.min(start + lengthBars, lastBar);
  return { startSec: downbeats[start], endSec: downbeats[end] };
}

/**
 * Step the origin downbeat index by `dir * lengthBars`, clamped to
 * [0, max(0, barCount - lengthBars)] so a full window stays in range.
 * `barCount` = number of bars = downbeats.length - 1.
 */
export function nudgeOrigin(
  originBar: number,
  dir: 1 | -1,
  lengthBars: number,
  barCount: number,
): number {
  const lastValidOrigin = Math.max(0, barCount - lengthBars);
  const next = originBar + dir * lengthBars;
  return Math.max(0, Math.min(next, lastValidOrigin));
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/loopRegion.test.ts`
Expected: PASS (all cases). Verify the clamp test: `computeLoopRegion(DB,6,4)` → start=min(6,7)=6, end=min(10,8)=8 → `{12,16}`. ✓

- [ ] **Step 5: Commit**

```bash
git add src/remix/loopRegion.ts src/__tests__/loopRegion.test.ts
git commit -m "feat(remix): bar-snap loop region math"
```

---

## Task 2: `batonCalibration.ts` — range map + reach margin

**Files:** Create `src/remix/batonCalibration.ts`, `src/__tests__/batonCalibration.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/batonCalibration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyAxisCalibration, type AxisRange } from '../remix/batonCalibration';

describe('applyAxisCalibration', () => {
  it('passes raw through when range is null (uncalibrated)', () => {
    expect(applyAxisCalibration(0.3, null, 0.1)).toBeCloseTo(0.3, 5);
  });

  it('passes raw through for a degenerate range (min === max)', () => {
    expect(applyAxisCalibration(0.3, { min: 0.5, max: 0.5 }, 0.1)).toBeCloseTo(0.3, 5);
  });

  it('maps the calibrated min→0 and max→1', () => {
    const r: AxisRange = { min: 0.4, max: 0.6 };
    expect(applyAxisCalibration(0.4, r, 0)).toBeCloseTo(0, 5);
    expect(applyAxisCalibration(0.6, r, 0)).toBeCloseTo(1, 5);
    expect(applyAxisCalibration(0.5, r, 0)).toBeCloseTo(0.5, 5);
  });

  it('snaps the outer margin fraction to the extremes', () => {
    const r: AxisRange = { min: 0, max: 1 };
    // margin 0.1: normalised < 0.1 → 0, > 0.9 → 1, else rescaled.
    expect(applyAxisCalibration(0.05, r, 0.1)).toBe(0);
    expect(applyAxisCalibration(0.95, r, 0.1)).toBe(1);
    expect(applyAxisCalibration(0.5, r, 0.1)).toBeCloseTo(0.5, 5);
  });

  it('clamps out-of-range input', () => {
    const r: AxisRange = { min: 0.4, max: 0.6 };
    expect(applyAxisCalibration(0.2, r, 0)).toBe(0);
    expect(applyAxisCalibration(0.9, r, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/batonCalibration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/batonCalibration.ts`:

```ts
/**
 * batonCalibration — map a player's calibrated movement range onto the full
 * 0–1 control range, with a reach margin so the player needn't hit the exact
 * extremes to reach full / none. Pure; identity when uncalibrated.
 */

export interface AxisRange {
  min: number;
  max: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * @param raw    0–1 axis value from the tracker.
 * @param range  the player's calibrated [min,max] for this axis, or null.
 * @param margin outer fraction (each end) of the normalised range that snaps
 *               to 0 / 1. e.g. 0.1 → outer 10% reaches the extreme.
 */
export function applyAxisCalibration(
  raw: number,
  range: AxisRange | null,
  margin: number,
): number {
  if (!range || range.max - range.min < 1e-6) return raw;

  const normalised = clamp01((raw - range.min) / (range.max - range.min));

  const m = clamp01(margin);
  if (m <= 0) return normalised;
  if (normalised <= m) return 0;
  if (normalised >= 1 - m) return 1;
  // Rescale the inner band [m, 1-m] back to [0,1].
  return (normalised - m) / (1 - 2 * m);
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/batonCalibration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/remix/batonCalibration.ts src/__tests__/batonCalibration.test.ts
git commit -m "feat(remix): movement-range calibration + reach margin"
```

---

## Task 3: `BatonTouchDetector.ts` — two-baton proximity

**Files:** Create `src/remix/BatonTouchDetector.ts`, `src/__tests__/BatonTouchDetector.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/BatonTouchDetector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BatonTouchDetector } from '../remix/BatonTouchDetector';

const A = { x: 0.2, y: 0.5, found: true };
const NEAR = { x: 0.24, y: 0.5, found: true };  // dist 0.04 < radius 0.08
const FAR = { x: 0.6, y: 0.5, found: true };     // dist 0.4 > radius

describe('BatonTouchDetector', () => {
  it('fires once when the two centroids cross within touchRadius', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    expect(d.update(A, FAR, 0)).toBe(false);
    expect(d.update(A, NEAR, 16)).toBe(true);   // crossed in
  });

  it('does not re-fire while still within radius (needs separation)', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    expect(d.update(A, NEAR, 0)).toBe(true);
    expect(d.update(A, NEAR, 16)).toBe(false);
    expect(d.update(A, NEAR, 32)).toBe(false);
  });

  it('re-arms after separating beyond radius, respecting cooldown', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    expect(d.update(A, NEAR, 0)).toBe(true);
    d.update(A, FAR, 100);                       // separate (arms)
    expect(d.update(A, NEAR, 400)).toBe(false);  // within cooldown
    d.update(A, FAR, 700);
    expect(d.update(A, NEAR, 720)).toBe(true);   // past cooldown
  });

  it('requires both batons present', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    expect(d.update(A, { ...NEAR, found: false }, 0)).toBe(false);
  });

  it('reset() clears state', () => {
    const d = new BatonTouchDetector({ touchRadius: 0.08, cooldownMs: 600 });
    d.update(A, NEAR, 0);
    d.reset();
    expect(d.update(A, NEAR, 10)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/BatonTouchDetector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/BatonTouchDetector.ts`:

```ts
/**
 * BatonTouchDetector — fires once when two baton centroids come within
 * `touchRadius`, then requires them to separate beyond the radius AND a
 * cooldown to elapse before firing again. A gross-motor "bring the batons
 * together" trigger, far more reliable for limited motor control than a
 * still-hold or a fast shake. Pure; mirrors ShakeDetector's shape.
 */

export interface BatonPoint {
  x: number;
  y: number;
  found: boolean;
}

export interface BatonTouchConfig {
  touchRadius?: number;
  cooldownMs?: number;
}

const DEFAULTS: Required<BatonTouchConfig> = {
  touchRadius: 0.12,
  cooldownMs: 600,
};

export class BatonTouchDetector {
  private touchRadius: number;
  private cooldownMs: number;
  private wasWithin = false;
  private lastFireMs = Number.NEGATIVE_INFINITY;

  constructor(cfg: BatonTouchConfig = {}) {
    this.touchRadius = cfg.touchRadius ?? DEFAULTS.touchRadius;
    this.cooldownMs = cfg.cooldownMs ?? DEFAULTS.cooldownMs;
  }

  setTouchRadius(r: number): void {
    this.touchRadius = Math.max(0, r);
  }

  /** Feed both batons; returns true on the frame a touch fires. */
  update(a: BatonPoint, b: BatonPoint, nowMs: number): boolean {
    if (!a.found || !b.found) {
      this.wasWithin = false;
      return false;
    }
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const within = Math.sqrt(dx * dx + dy * dy) <= this.touchRadius;
    const risingEdge = within && !this.wasWithin;
    this.wasWithin = within;

    if (risingEdge && nowMs - this.lastFireMs >= this.cooldownMs) {
      this.lastFireMs = nowMs;
      return true;
    }
    return false;
  }

  reset(): void {
    this.wasWithin = false;
    this.lastFireMs = Number.NEGATIVE_INFINITY;
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/BatonTouchDetector.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/remix/BatonTouchDetector.ts src/__tests__/BatonTouchDetector.test.ts
git commit -m "feat(remix): BatonTouchDetector (gross-motor bring-together trigger)"
```

---

## Task 4: `remixKeyMap.ts` — keyboard mapping

**Files:** Create `src/remix/remixKeyMap.ts`, `src/__tests__/remixKeyMap.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/remixKeyMap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { keyToRemixAction } from '../remix/remixKeyMap';

describe('keyToRemixAction', () => {
  it('maps digits 1-4 to focusStem index 0-3', () => {
    expect(keyToRemixAction('1')).toEqual({ kind: 'focusStem', index: 0 });
    expect(keyToRemixAction('4')).toEqual({ kind: 'focusStem', index: 3 });
  });

  it('maps arrows to filter and loop nudge', () => {
    expect(keyToRemixAction('ArrowUp')).toEqual({ kind: 'filter', dir: 1 });
    expect(keyToRemixAction('ArrowDown')).toEqual({ kind: 'filter', dir: -1 });
    expect(keyToRemixAction('ArrowLeft')).toEqual({ kind: 'nudgeLoop', dir: -1 });
    expect(keyToRemixAction('ArrowRight')).toEqual({ kind: 'nudgeLoop', dir: 1 });
  });

  it('maps S to stutter, [ ] to loop length, space to togglePlay', () => {
    expect(keyToRemixAction('s')).toEqual({ kind: 'stutter' });
    expect(keyToRemixAction('S')).toEqual({ kind: 'stutter' });
    expect(keyToRemixAction('[')).toEqual({ kind: 'loopLen', dir: -1 });
    expect(keyToRemixAction(']')).toEqual({ kind: 'loopLen', dir: 1 });
    expect(keyToRemixAction(' ')).toEqual({ kind: 'togglePlay' });
  });

  it('returns null for unmapped keys', () => {
    expect(keyToRemixAction('q')).toBeNull();
    expect(keyToRemixAction('5')).toBeNull();
    expect(keyToRemixAction('Enter')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/remixKeyMap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/remixKeyMap.ts`:

```ts
/**
 * remixKeyMap — pure mapping from KeyboardEvent.key to a Remix action,
 * so the screen's key handler is a thin, testable switch.
 */

export type RemixKeyAction =
  | { kind: 'focusStem'; index: 0 | 1 | 2 | 3 }
  | { kind: 'filter'; dir: 1 | -1 }
  | { kind: 'stutter' }
  | { kind: 'nudgeLoop'; dir: 1 | -1 }
  | { kind: 'loopLen'; dir: 1 | -1 }
  | { kind: 'togglePlay' }
  | null;

export function keyToRemixAction(key: string): RemixKeyAction {
  switch (key) {
    case '1': return { kind: 'focusStem', index: 0 };
    case '2': return { kind: 'focusStem', index: 1 };
    case '3': return { kind: 'focusStem', index: 2 };
    case '4': return { kind: 'focusStem', index: 3 };
    case 'ArrowUp': return { kind: 'filter', dir: 1 };
    case 'ArrowDown': return { kind: 'filter', dir: -1 };
    case 'ArrowLeft': return { kind: 'nudgeLoop', dir: -1 };
    case 'ArrowRight': return { kind: 'nudgeLoop', dir: 1 };
    case 's':
    case 'S': return { kind: 'stutter' };
    case '[': return { kind: 'loopLen', dir: -1 };
    case ']': return { kind: 'loopLen', dir: 1 };
    case ' ': return { kind: 'togglePlay' };
    default: return null;
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/remixKeyMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/remix/remixKeyMap.ts src/__tests__/remixKeyMap.test.ts
git commit -m "feat(remix): keyboard action map"
```

---

## Task 5: RemixEngine — convert stems to Transport-synced `Tone.Player`

**Files:** Modify `src/remix/RemixEngine.ts`, `src/__tests__/RemixEngine.test.ts`.

This is the foundational refactor. The stem state, taper, latch, glide, and stutter-overlay behaviour are unchanged — only the source node type and clock ownership change.

- [ ] **Step 1: Update the test Tone mock + add a sync test**

In `src/__tests__/RemixEngine.test.ts`, extend the `vi.mock('tone', ...)` factory to add a `Player` constructor and Transport loop fields. Add to the mock's returned object:

```ts
    Player: vi.fn().mockImplementation((buffer: AudioBuffer) => ({
      buffer,
      sync: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      connect: vi.fn(),
      dispose: vi.fn(),
    })),
```

and extend the `Transport` object in the mock with:

```ts
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    scheduleOnce: vi.fn(),
    state: 'stopped',
```

Add a test:

```ts
  it('creates a synced Tone.Player per stem on load', async () => {
    const Tone = await import('tone');
    const e = new RemixEngine();
    await e.loadSong(song());
    // 4 stems → 4 Player constructions, each synced + started at 0.
    expect((Tone.Player as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(4);
    e.dispose();
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts -t 'synced Tone.Player'`
Expected: FAIL — engine still uses `createBufferSource`, `Tone.Player` never constructed.

- [ ] **Step 3: Convert the engine to Tone.Player + Transport clock**

In `src/remix/RemixEngine.ts`:

Change the `StemNodes` interface `source` field type:

```ts
interface StemNodes {
  buffer: AudioBuffer;
  player: Tone.Player | null;     // was: source: AudioBufferSourceNode | null
  gain: GainNode;
  filter: BiquadFilterNode;
  stutterSource: AudioBufferSourceNode | null;
  scheduler: StutterScheduler;
  pendingWindow: StutterWindow | null;
}
```

In `loadSong`, where each stem's nodes are created, build a Player instead of leaving `source: null` — create it from the buffer and connect it into the existing `gain`:

```ts
      const player = new Tone.Player(buffer);
      player.connect(gain);
      this.nodes.set(stem, {
        buffer, player, gain, filter,
        stutterSource: null,
        scheduler: new StutterScheduler(),
        pendingWindow: null,
      });
```

(Keep the existing `gain`/`filter` creation and the `gain.connect(filter); filter.connect(this.master)` wiring from Remix Core's fixed topology.)

Replace `play()`:

```ts
  play(): void {
    if (this.playing) return;
    for (const n of this.nodes.values()) {
      n.player?.sync().start(0);
    }
    Tone.getTransport().start();
    this.playing = true;
  }
```

Replace `stop()`'s source-stopping block — players are stopped via the Transport, and we unsync them so a later `play()` re-syncs cleanly:

```ts
  stop(): void {
    for (const [stem, n] of this.nodes) {
      n.scheduler.forceStop(() => this.stopOverlay(n));
      try { n.player?.unsync().stop(); } catch { /* not started */ }
      n.pendingWindow = null;
      const state = this.states.get(stem);
      if (state) state.stuttering = false;
    }
    const t = Tone.getTransport();
    t.stop();
    t.seconds = this.loopRegion ? this.loopRegion.startSec : 0;
    this.playing = false;
  }
```

Add a `togglePlay`:

```ts
  togglePlay(): void {
    if (Tone.getTransport().state === 'started') {
      Tone.getTransport().pause();
      this.playing = false;
    } else {
      this.play();
    }
  }
```

In `dispose()`, dispose players instead of disconnecting raw sources — replace the per-node loop body to also `n.player?.dispose()`:

```ts
    for (const n of this.nodes.values()) {
      try { n.player?.unsync(); } catch { /* noop */ }
      n.player?.dispose();
      n.gain.disconnect();
      n.filter.disconnect();
    }
```

Add a `private loopRegion: { startSec: number; endSec: number } | null = null;` field (used by `stop()` above and Task 6).

Note: `Tone.Player.connect(gain)` connects a Tone node to a native `GainNode` — valid in Tone v15, the same Tone→native bridge SongPresetEngine uses. `unsync()` is required before re-`sync()` on a later play to avoid double-scheduling.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: all green — the new sync test passes and the existing build-from-silence / latch / glide / stutter-duck / burst-restore tests still pass (stem state + gain assertions are unchanged by the source swap). If the mock needs `unsync`, add `unsync: vi.fn().mockReturnThis()` to the Player mock.

- [ ] **Step 5: Run full suite + lint**

Run: `npx vitest run` then `npm run lint`
Expected: all green; no new diagnostics (only the 12 pre-existing `src/__tests__/setup.ts` errors).

- [ ] **Step 6: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "refactor(remix): stems as Transport-synced Tone.Players (fix clock drift)"
```

---

## Task 6: RemixEngine — bar-snapped loop region + default loop

**Files:** Modify `src/remix/RemixEngine.ts`, `src/__tests__/RemixEngine.test.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/RemixEngine.test.ts` (the `song()` helper already provides `downbeats: [0, 2.0]`; extend it to more downbeats for these tests by adding a dedicated song builder):

```ts
  function songWithBars(): SongConfig {
    const s = song();
    s.beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];
    s.downbeats = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // 8 bars, 1s each
    return s;
  }

  it('applies a default 8-bar loop on load and sets Transport loop points', async () => {
    const Tone = await import('tone');
    const t = Tone.getTransport();
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    expect(t.loop).toBe(true);
    expect(t.loopStart).toBe(0);
    expect(t.loopEnd).toBe(8); // 8 bars from origin 0
    expect(e.getLoopRegion()).toEqual({ startSec: 0, endSec: 8, lengthBars: 8, originBar: 0 });
    e.dispose();
  });

  it('setLoopLengthBars(4) tightens the window to 4 bars', async () => {
    const Tone = await import('tone');
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setLoopLengthBars(4);
    expect(Tone.getTransport().loopEnd).toBe(4);
    expect(e.getLoopRegion()).toEqual({ startSec: 0, endSec: 4, lengthBars: 4, originBar: 0 });
    e.dispose();
  });

  it('nudgeLoop steps the window forward and clamps at the end', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setLoopLengthBars(4);
    e.nudgeLoop(1);
    expect(e.getLoopRegion()).toEqual({ startSec: 4, endSec: 8, lengthBars: 4, originBar: 4 });
    e.nudgeLoop(1); // clamps (lastValidOrigin = 8-4 = 4)
    expect(e.getLoopRegion()?.originBar).toBe(4);
    e.dispose();
  });

  it('setLoopLengthBars(0) turns looping off (whole song)', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setLoopLengthBars(0);
    const r = e.getLoopRegion();
    expect(r).not.toBeNull();
    expect(r!.lengthBars).toBe(0);
    expect(r!.startSec).toBe(0);
    e.dispose();
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts -t 'loop'`
Expected: FAIL — `setLoopLengthBars`/`nudgeLoop`/`getLoopRegion` don't exist.

- [ ] **Step 3: Implement loop region**

In `src/remix/RemixEngine.ts`, import the helper:

```ts
import { computeLoopRegion, nudgeOrigin } from './loopRegion';
```

Add fields:

```ts
  private loopLengthBars: 0 | 4 | 8 | 16 = 8;
  private loopOriginBar = 0;
  private duration = 0;
  // loopRegion field already added in Task 5
```

In `loadSong`, after `this.downbeats` is set and before `Tone.getTransport().bpm.value = song.bpm;`, capture duration and apply the default loop:

```ts
    this.duration = Math.max(0, ...[...buffers.values()].map((b) => b.duration), 0);
    this.loopOriginBar = 0;
    this.loopLengthBars = this.downbeats.length >= 2 ? 8 : 0;
    this.applyLoop();
```

(`buffers` is the `Map<string, AudioBuffer>` already obtained from `loadStemBuffers` in `loadSong`.)

Add the methods:

```ts
  setLoopLengthBars(n: 0 | 4 | 8 | 16): void {
    this.loopLengthBars = this.downbeats.length >= 2 ? n : 0;
    // Keep the origin valid for the new length.
    const barCount = Math.max(0, this.downbeats.length - 1);
    this.loopOriginBar = Math.max(0, Math.min(this.loopOriginBar, Math.max(0, barCount - this.loopLengthBars)));
    this.applyLoop();
  }

  nudgeLoop(dir: 1 | -1): void {
    if (this.loopLengthBars <= 0) return;
    const barCount = Math.max(0, this.downbeats.length - 1);
    this.loopOriginBar = nudgeOrigin(this.loopOriginBar, dir, this.loopLengthBars, barCount);
    this.applyLoop();
  }

  getLoopRegion(): { startSec: number; endSec: number; lengthBars: number; originBar: number } | null {
    if (!this.loopRegion) return null;
    return {
      startSec: this.loopRegion.startSec,
      endSec: this.loopRegion.endSec,
      lengthBars: this.loopLengthBars,
      originBar: this.loopOriginBar,
    };
  }

  private applyLoop(): void {
    const t = Tone.getTransport();
    const region = this.loopLengthBars > 0
      ? computeLoopRegion(this.downbeats, this.loopOriginBar, this.loopLengthBars)
      : { startSec: 0, endSec: this.duration };
    this.loopRegion = region;
    if (!region) { t.loop = false; return; }
    t.loop = true;
    t.loopStart = region.startSec;
    t.loopEnd = region.endSec;
  }
```

Note: for `Off` (lengthBars 0) `getLoopRegion()` returns the whole-song region with `lengthBars: 0` (the UI reads `lengthBars === 0` as "Off"). The quantised-jump-to-window-on-nudge refinement (scheduleOnce at the next downbeat when the play position is outside the new window) is deferred to the manual-tuning pass; the loop points themselves are set immediately, which is correct and testable now.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: all loop tests pass; existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): bar-snapped loop region + default 8-bar loop"
```

---

## Task 7: RemixEngine — focused stem + keyboard-facing setters

**Files:** Modify `src/remix/RemixEngine.ts`, `src/__tests__/RemixEngine.test.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/RemixEngine.test.ts`:

```ts
  it('setStemFilterNorm writes the target for the named stem (clamped)', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setStemFilterNorm('drums', 1.5); // clamps to 1
    e.renderFrame(0);
    expect(e.getStemStates().drums.filterNorm).toBeGreaterThan(0.9);
    e.dispose();
  });

  it('setFocusedStem + triggerStutterFor(focused) starts a burst', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.play();
    e.setFocusedStem('bass');
    expect(e.getFocusedStem()).toBe('bass');
    e.triggerStutterFor(e.getFocusedStem());
    e.renderFrame(0);
    expect(e.getStemStates().bass.stuttering).toBe(true);
    e.dispose();
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts -t 'setStemFilterNorm|setFocusedStem'`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement**

In `src/remix/RemixEngine.ts` add a field `private focusedStem: StemId = STEM_CYCLE_ORDER[0];` and methods:

```ts
  setStemFilterNorm(stem: StemId, value: number): void {
    const state = this.states.get(stem);
    if (!state) return;
    state.targetFilterNorm = Math.max(0, Math.min(1, value));
    this.gliding.delete(stem); // direct control, no glide
  }

  getStemFilterNorm(stem: StemId): number {
    return this.states.get(stem)?.targetFilterNorm ?? 0;
  }

  setFocusedStem(stem: StemId): void {
    this.focusedStem = stem;
  }

  getFocusedStem(): StemId {
    return this.focusedStem;
  }

  /** Public wrapper over the private stutter trigger (keyboard/head-nod). */
  triggerStutterFor(stem: StemId): void {
    this.triggerStutter(stem);
  }
```

(`triggerStutter` is the existing private method.)

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): focused stem + keyboard-facing per-stem setters"
```

---

## Task 8: RemixEngine — stutter clock re-home + loop-seam clamp

**Files:** Modify `src/remix/RemixEngine.ts`, `src/__tests__/RemixEngine.test.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/RemixEngine.test.ts`:

```ts
  it('clamps a stutter burst end to the loop end (no bleed past the seam)', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setLoopLengthBars(4); // loopEnd = 4
    e.play();
    // Trigger near the loop end; burst would normally extend a full bar.
    // @ts-expect-error private — inspect the pending window for the test
    e.triggerStutter('drums');
    // @ts-expect-error private
    const n = e.nodes.get('drums');
    const win = n.pendingWindow;
    expect(win).not.toBeNull();
    expect(win.startSec + win.burstDurSec).toBeLessThanOrEqual(4 + 1e-6);
    e.dispose();
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts -t 'clamps a stutter burst'`
Expected: FAIL — burst end currently isn't clamped to the loop.

- [ ] **Step 3: Implement the clamp + clock source**

In `triggerStutter`, change the playback-now source to the Transport and clamp the burst to the loop end. The existing method computes `win` via `computeStutterWindow(playbackNow, this.beats, this.downbeats)`. Replace its body's window handling with:

```ts
  private triggerStutter(stem: StemId): void {
    const n = this.nodes.get(stem);
    const state = this.states.get(stem);
    if (!n || !state) return;
    if (n.scheduler.isActive()) return;

    const playbackNow = Tone.getTransport().seconds;
    const win = computeStutterWindow(playbackNow, this.beats, this.downbeats);
    // Clamp the burst so it never rings past the loop seam.
    if (this.loopRegion) {
      const maxDur = this.loopRegion.endSec - win.startSec;
      if (maxDur > 0 && win.burstDurSec > maxDur) {
        win.burstDurSec = maxDur;
      }
    }
    n.pendingWindow = win;
    state.stuttering = true;
    n.scheduler.begin(win, () => this.startOverlay(n, win));
  }
```

(Adjust to match the existing method's exact structure — the key changes are sourcing `playbackNow` from `Tone.getTransport().seconds` and the loop-end clamp. Keep `startOverlay`/`StutterScheduler` usage as-is.)

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: green (new clamp test + existing stutter tests).

- [ ] **Step 5: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): stutter on the authoritative clock + loop-seam clamp"
```

---

## Task 9: RemixEngine — head-nod → stutter (HeadBopDetector + face landmarks)

**Files:** Modify `src/remix/RemixEngine.ts`, `src/__tests__/RemixEngine.test.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/RemixEngine.test.ts` (a head nod = a down-then-up reversal in landmark Y; feed a synthetic sequence):

```ts
  function makeFace(y: number) {
    // FaceLandmarks shape: { landmarks: { y }[] }. Index 1 = nose tip.
    const landmarks = Array.from({ length: 2 }, () => ({ x: 0.5, y, z: 0 }));
    return { landmarks } as unknown as import('../state/types').FaceLandmarks;
  }

  it('a head nod fires a stutter on the focused stem when enabled', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.play();
    e.setFocusedStem('drums');
    e.setHeadNodEnabled(true);
    e.setHeadNodSensitivity(0.02, 100);
    // Down (y increasing) then up (y decreasing) = one bop. Excursion 0.1 > 0.02.
    let t = 0;
    e.processFaceLandmarks(makeFace(0.40), (t += 16));
    e.processFaceLandmarks(makeFace(0.45), (t += 16));
    e.processFaceLandmarks(makeFace(0.50), (t += 16));
    e.processFaceLandmarks(makeFace(0.45), (t += 16)); // reversal → bop
    e.renderFrame(0);
    expect(e.getStemStates().drums.stuttering).toBe(true);
    e.dispose();
  });

  it('head-nod does nothing when disabled', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.play();
    e.setFocusedStem('drums');
    // not enabled
    let t = 0;
    e.processFaceLandmarks(makeFace(0.40), (t += 16));
    e.processFaceLandmarks(makeFace(0.50), (t += 16));
    e.processFaceLandmarks(makeFace(0.45), (t += 16));
    e.renderFrame(0);
    expect(e.getStemStates().drums.stuttering).toBe(false);
    e.dispose();
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts -t 'head'`
Expected: FAIL — head-nod API doesn't exist.

- [ ] **Step 3: Implement**

In `src/remix/RemixEngine.ts`, import the detector + type:

```ts
import { HeadBopDetector } from '../mapping/nodes/HeadRhythmNode';
import type { FaceLandmarks } from '../state/types';
```

Add fields:

```ts
  private headNodEnabled = false;
  private headNodDetector = new HeadBopDetector(0.025, 200);
  private readonly headNodLandmarkIndex = 1; // nose tip
```

Add methods:

```ts
  setHeadNodEnabled(enabled: boolean): void {
    this.headNodEnabled = enabled;
    if (!enabled) this.headNodDetector.reset();
  }

  setHeadNodSensitivity(minDownExcursion: number, cooldownMs: number): void {
    this.headNodDetector.setConfig(minDownExcursion, cooldownMs);
  }

  /** Feed face landmarks; a detected nod stutters the focused stem. */
  processFaceLandmarks(landmarks: FaceLandmarks | null, timestampMs: number): void {
    if (!this.headNodEnabled || !landmarks) return;
    const lm = landmarks.landmarks[this.headNodLandmarkIndex];
    if (!lm) return;
    if (this.headNodDetector.step(lm.y, timestampMs)) {
      this.triggerStutterFor(this.focusedStem);
    }
  }
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: green. (HeadBopDetector is pure numeric — no mock needed.)

- [ ] **Step 5: Run full suite + lint**

Run: `npx vitest run` then `npm run lint`
Expected: green; no new diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): head-nod fires stutter on the focused stem"
```

---

## Task 10: RemixEngine — trigger-enable toggles (shake)

**Files:** Modify `src/remix/RemixEngine.ts`, `src/__tests__/RemixEngine.test.ts`.

Dwell + shake live on `RemixBaton` (Task 11 adds dwell-disable). The engine needs a shake-stutter enable that gates `applyBaton`'s stutter (so a facilitator can turn off shake for a player while leaving head-nod on).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/RemixEngine.test.ts`:

```ts
  it('setShakeStutterEnabled(false) ignores baton stutter output', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.play();
    e.setShakeStutterEnabled(false);
    e.applyBaton({ stem: 'drums', filterNorm: 1, cycled: false, stutter: true, dwellProgress: 0 });
    e.renderFrame(0);
    expect(e.getStemStates().drums.stuttering).toBe(false);
    e.dispose();
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts -t 'setShakeStutterEnabled'`
Expected: FAIL — method doesn't exist; stutter still fires.

- [ ] **Step 3: Implement**

Add field `private shakeStutterEnabled = true;`, method:

```ts
  setShakeStutterEnabled(enabled: boolean): void {
    this.shakeStutterEnabled = enabled;
  }
```

In `applyBaton`, gate the stutter line:

```ts
    if (out.stutter && this.shakeStutterEnabled) this.triggerStutter(out.stem);
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): shake-stutter enable toggle"
```

---

## Task 11: RemixBaton — apply calibration + toggleable dwell + expose centroid

**Files:** Modify `src/remix/RemixBaton.ts`, `src/__tests__/RemixBaton.test.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/RemixBaton.test.ts`:

```ts
  it('applies axis calibration so a narrow Y range reaches the full filter range', () => {
    const b = new RemixBaton('red');
    // Tim only reaches y in [0.4, 0.6]. Map it to full range, margin 0.
    b.setCalibration({ x: null, y: { min: 0.4, max: 0.6 } }, 0);
    // raw y=0.4 (top of his range) → calibrated 0 → filterNorm 1 (open).
    expect(b.update({ x: 0.5, y: 0.4, found: true }, 0).filterNorm).toBeCloseTo(1, 5);
    // raw y=0.6 (bottom of his range) → calibrated 1 → filterNorm 0 (silent).
    expect(b.update({ x: 0.5, y: 0.6, found: true }, 16).filterNorm).toBeCloseTo(0, 5);
  });

  it('does not cycle on dwell when dwell-cycle is disabled', () => {
    const b = new RemixBaton('red');
    b.setDwellCycleEnabled(false);
    let cycled = false;
    for (let i = 0; i < 40; i++) {
      if (b.update({ x: 0.5, y: 0.5, found: true }, i * 60).cycled) cycled = true;
    }
    expect(cycled).toBe(false);
  });

  it('exposes its last centroid for touch detection', () => {
    const b = new RemixBaton('red');
    b.update({ x: 0.3, y: 0.7, found: true }, 0);
    expect(b.centroid()).toEqual({ x: 0.3, y: 0.7, found: true });
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixBaton.test.ts -t 'calibration|dwell-cycle|centroid'`
Expected: FAIL — `setCalibration`/`setDwellCycleEnabled`/`centroid` don't exist.

- [ ] **Step 3: Implement**

In `src/remix/RemixBaton.ts`, import the calibration helper:

```ts
import { applyAxisCalibration, type AxisRange } from './batonCalibration';
```

Add fields + setters to the class:

```ts
  private calX: AxisRange | null = null;
  private calY: AxisRange | null = null;
  private reachMargin = 0.1;
  private dwellCycleEnabled = true;
  private lastInput: BatonInput = { x: 0.5, y: 0.5, found: false };

  setCalibration(cal: { x: AxisRange | null; y: AxisRange | null }, margin: number): void {
    this.calX = cal.x;
    this.calY = cal.y;
    this.reachMargin = margin;
  }

  setDwellCycleEnabled(enabled: boolean): void {
    this.dwellCycleEnabled = enabled;
    if (!enabled) this.dwell.reset();
  }

  centroid(): BatonInput {
    return { ...this.lastInput };
  }
```

In `update`, apply calibration to the incoming position at the top (after the `!found` early return), and store `lastInput`:

```ts
    // Calibrate the raw position to the player's reachable range.
    const cx = applyAxisCalibration(input.x, this.calX, this.reachMargin);
    const cy = applyAxisCalibration(input.y, this.calY, this.reachMargin);
    this.lastInput = { x: cx, y: cy, found: true };
    const calInput = this.lastInput;
```

Then replace subsequent uses of `input.x`/`input.y` in `update` with `calInput.x`/`calInput.y` (velocity calc, dwell update, and `filterNorm = 1 - clamp(calInput.y)`). In the `!found` branch, set `this.lastInput = { x: input.x, y: input.y, found: false }` before returning.

Gate the dwell cycle on the toggle — wrap the existing `if (dwellRes.state === 'triggered')` block so it only advances when `this.dwellCycleEnabled`:

```ts
    let cycled = false;
    if (this.dwellCycleEnabled && dwellRes.state === 'triggered') {
      // ... existing triggeredPending advance logic ...
    } else if (dwellRes.state !== 'triggered') {
      this.triggeredPending = false;
    }
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixBaton.test.ts`
Expected: green — new tests pass and the existing cycle/latch/Y/stutter tests still pass (they use an uncalibrated baton, so `applyAxisCalibration` is identity and behaviour is unchanged).

- [ ] **Step 5: Add an engine method to fan calibration to batons (used by the screen)**

The batons are owned by RemixScreen, not the engine — no engine change needed here. Confirm `RemixBaton`'s new public methods compile and are exported via the class.

- [ ] **Step 6: Commit**

```bash
git add src/remix/RemixBaton.ts src/__tests__/RemixBaton.test.ts
git commit -m "feat(remix): baton range-calibration + toggleable dwell + centroid"
```

---

## Task 12: RemixScreen — keyboard test mode + loop controls + timeline

**Files:** Modify `src/ui/screens/RemixScreen.tsx`.

UI integration; no unit test (covered by lint + manual). Read `src/ui/screens/SongPresetScreen.tsx` for the `keyboardMode` toggle + scoped `keydown` handler + loop-section UI patterns and follow them.

- [ ] **Step 1: Implement**

In `RemixScreen.tsx`:
1. Import `keyToRemixAction` from `../../remix/remixKeyMap`.
2. Add state: `keyboardMode: boolean`, `focusedStemIndex: 0|1|2|3` (kept in sync with `engine.setFocusedStem(STEM_CYCLE_ORDER[index])`), and read `engine.getLoopRegion()` each throttled render for the timeline.
3. Add a `keydown` effect (mirroring SongPresetScreen, scoped, active only when `keyboardMode`): map the event via `keyToRemixAction`; on `focusStem` → `setFocusedStemIndex` + `engine.setFocusedStem`; `filter` → `engine.setStemFilterNorm(focusedStem, clamp(engine.getStemFilterNorm(focusedStem) ± 0.1))`; `stutter` → `engine.triggerStutterFor(focusedStem)`; `nudgeLoop` → `engine.nudgeLoop(dir)`; `loopLen` → cycle `Off→4→8→16` via `engine.setLoopLengthBars`; `togglePlay` → `engine.togglePlay()`. `preventDefault()` on handled keys. Avoid `m`/debug keys (already unmapped by `keyToRemixAction`).
4. Add a transport/loop panel: a keyboard-mode toggle, length selector (`Off/4/8/16`, `aria-pressed`), ◀/▶ nudge buttons, play/pause — each calling the SAME engine methods as the keyboard.
5. Add a loop-window timeline bar: total duration, highlighted window from `getLoopRegion()`, playhead from `Tone.getTransport().seconds`, and a text label (`Loop: bars {originBar+1}–{originBar+lengthBars} ({lengthBars})` or `Loop: off` when `lengthBars===0`). A transport position text `m:ss / m:ss`.
6. Focused-stem indicator: ring + `▸`/text + `aria-label="focused"` on the focused tile; a key-hint legend while keyboard mode is on.

- [ ] **Step 2: Lint + suite**

Run: `npm run lint` → no new diagnostics. Run: `npx vitest run` → full suite green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): keyboard test mode + loop controls + timeline"
```

---

## Task 13: RemixScreen — movement-range calibration capture

**Files:** Modify `src/ui/screens/RemixScreen.tsx`.

- [ ] **Step 1: Implement**

1. Add per-role range state: `Map<ColorRole, { x: AxisRange; y: AxisRange }>` (import `AxisRange` from `../../remix/batonCalibration`) and a `reachMargin` state (default 0.1).
2. Add a "Calibrate range" affordance: while a capture is active for the tracked colours, accumulate min/max X/Y from the ColorTracker blobs over a few seconds (a Start/Stop button, or a fixed ~5s capture with a countdown). Store the captured ranges per role.
3. Each frame, before `baton.update(...)`, call `baton.setCalibration({ x: range?.x ?? null, y: range?.y ?? null }, reachMargin)` for that baton's role so calibration is live.
4. A reach-margin slider (0–0.3) wired to `reachMargin` + re-applied to the batons.
5. Persist in component state for the session (profile persistence is out of scope).

- [ ] **Step 2: Lint + suite**

Run: `npm run lint` → clean. Run: `npx vitest run` → green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): movement-range calibration capture for batons"
```

---

## Task 14: RemixScreen — baton-touch cycle wiring

**Files:** Modify `src/ui/screens/RemixScreen.tsx`.

- [ ] **Step 1: Implement**

1. Import `BatonTouchDetector` from `../../remix/BatonTouchDetector`. Hold one in a ref. Add `touchRadius` state (default 0.12) + an enable toggle (default on) + `dwellCycleEnabled` toggle (default on; when off, call `baton.setDwellCycleEnabled(false)` on every baton).
2. Each frame, gather the two highest-priority present baton centroids (via `baton.centroid()` for the tracked roles, in detection/priority order). If touch is enabled and the detector `update(a, b, performance.now())` returns true, advance the **primary** baton (the higher-priority of the two): call its cycle by feeding the engine a synthetic cycle — i.e. advance that baton's stem. Since cycling lives in `RemixBaton`, add the touch result into that baton's update path: simplest is for the screen to call a new `RemixBaton.forceCycle()` that advances the stem index and returns the new stem; then `engine.applyBaton({ stem: newStem, filterNorm: <primary baton's current calibrated y→filterNorm>, cycled: true, stutter: false, dwellProgress: 0 })` and `engine.setFocusedStem(newStem)`.

   Add `forceCycle()` to `RemixBaton` (small, mirrors the dwell advance):
   ```ts
   /** Advance to the next stem programmatically (e.g. baton-touch trigger). */
   forceCycle(): StemId {
     this.stemIndex = (this.stemIndex + 1) % STEM_CYCLE_ORDER.length;
     return this.assignedStem;
   }
   ```
   (This is a 1:1 swap for the dwell cycle. Commit it with this task; add a one-line `RemixBaton.test.ts` case asserting `forceCycle()` advances `assignedStem` through the cycle order and wraps.)
3. A "linked" visual indicator drawn between the two baton markers when they are within `touchRadius`, plus a brief flash on the cycled tile.
4. `touchRadius` slider wired to `detector.setTouchRadius`.

- [ ] **Step 2: Lint + suite**

Run: `npm run lint` → clean. Run: `npx vitest run` → green (incl. the new `forceCycle` test).

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx src/remix/RemixBaton.ts src/__tests__/RemixBaton.test.ts
git commit -m "feat(remix): baton-touch cycles the primary baton's stem"
```

---

## Task 15: RemixScreen — FaceDetector head-nod wiring

**Files:** Modify `src/ui/screens/RemixScreen.tsx`.

Read SongPresetScreen's head-bop wiring (`FaceDetector` ref, the enable effect that starts the detector and feeds `result.face`/`result.timestamp` to the engine, dispose on unmount) and mirror it.

- [ ] **Step 1: Implement**

1. Import `FaceDetector` from `../../tracking/FaceDetector`. Hold one in a ref.
2. Add `headNodEnabled` state + toggle (default off, opt-in like Song Preset). An effect that, when enabled, constructs/starts the `FaceDetector`, runs its detect loop, and calls `engine.setHeadNodEnabled(true)` + `engine.processFaceLandmarks(result.face, result.timestamp)` each face frame; when disabled, `engine.setHeadNodEnabled(false)` and stop the detector. Dispose the detector on unmount.
3. Head-nod sensitivity sliders (minDownExcursion, cooldownMs) wired to `engine.setHeadNodSensitivity`.
4. A brief pulse on the focused tile when a nod fires (the existing STUTTER strobe already covers the audio-event visual; the pulse is an extra affordance — optional, keep minimal).

- [ ] **Step 2: Lint + suite**

Run: `npm run lint` → clean. Run: `npx vitest run` → green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): head-nod stutter via FaceDetector"
```

---

## Task 16: RemixScreen — facilitator trigger-toggles panel + shake gate

**Files:** Modify `src/ui/screens/RemixScreen.tsx`.

- [ ] **Step 1: Implement**

Add a "Triggers (facilitator)" panel collecting the per-player scheme controls into one place: checkboxes for dwell-cycle (→ every `baton.setDwellCycleEnabled`), baton-touch (→ touch detector enable), shake-stutter (→ `engine.setShakeStutterEnabled`), head-nod (→ `engine.setHeadNodEnabled`); plus the `touchRadius`, head-nod sensitivity, and reach-margin sliders (relocate the sliders added in Tasks 13–15 here if cleaner). Each control reflects + sets the state already wired in the previous tasks. Label the panel so a facilitator understands it composes the player's trigger scheme (e.g. "For Tim: dwell off, baton-touch on, head-nod on, shake off"). All controls keyboard-focusable with labels.

- [ ] **Step 2: Lint + suite**

Run: `npm run lint` → clean. Run: `npx vitest run` → green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): facilitator trigger-scheme panel"
```

---

## Task 17: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite** — Run: `npm run test:run` → all green (existing 294 + loopRegion + batonCalibration + BatonTouchDetector + remixKeyMap + the new RemixEngine/RemixBaton cases).
- [ ] **Step 2: Type check** — Run: `npm run lint` → only the 12 pre-existing `src/__tests__/setup.ts` diagnostics.
- [ ] **Step 3: Manual (documented; not automated)** — Run `npm run dev`, open Remix:
  1. Keyboard mode: `1–4` focus stems, `↑/↓` shape the focused stem, `S` stutters it, `←/→` nudge the loop, `[`/`]` change loop length, `Space` play/pause. Confirm loops stay tight across many passes (drift fix), nudge hops sections on the downbeat, default 8-bar loop on load.
  2. Camera as Tim would use it: calibrate a deliberately narrow range, confirm full-open AND the silent floor are reachable; set the facilitator scheme to dwell-off / baton-touch-on / head-nod-on / shake-off; confirm bringing the batons together cycles the primary baton's stem (with the "linked" indicator) and a head nod stutters the focused stem; confirm tremor/drift don't false-fire at the calibrated sensitivities.
  3. Confirm Remix Core feedback (stem tiles, dwell ring, cycle flash, assignment badges) is unregressed and now driven by a non-drifting clock.
  Return to the owning task for any failure.
- [ ] **Step 4: Clean tree** — `git status` clean.

---

## Self-Review

Checked against [../specs/2026-05-26-remix-loop-foundation-design.md](../specs/2026-05-26-remix-loop-foundation-design.md):

**Spec coverage:**
- Transport-as-clock (Tone.Player synced) — Task 5
- Bar-snapped loop region + nudge + default 8-bar — Tasks 1, 6
- Quantised-jump refinement — deferred to manual tuning (noted in Task 6; loop points set immediately, which is correct/testable)
- Keyboard test mode (map + handler + controls) — Tasks 4, 12
- Movement-range calibration + reach margin — Tasks 2, 11, 13
- Baton-touch → cycle (primary baton) — Tasks 3, 14
- Head-nod → stutter (HeadBopDetector + FaceDetector) — Tasks 9, 15
- Focused stem — Task 7
- Trigger toggles (dwell/shake/touch/head-nod) — Tasks 10 (shake), 11 (dwell), 14 (touch), 15 (head-nod), 16 (panel)
- Stutter clock re-home + loop-seam clamp — Task 8
- Visual feedback (timeline, focus indicator, linked indicator, position text) — Tasks 12, 14
- Out of scope (capture loops/layers/overdub/sequencer) — no tasks (correct)

**Placeholder scan:** none — pure-helper and engine tasks carry full code; UI tasks specify concrete wiring against named, already-built engine/baton methods and an existing reference screen.

**Type consistency:** `StemId`, `RemixBatonOutput`, `AxisRange`, `LoopRegion`, `RemixKeyAction` defined once and consumed consistently. Engine methods (`setLoopLengthBars`/`nudgeLoop`/`getLoopRegion`/`setStemFilterNorm`/`getStemFilterNorm`/`setFocusedStem`/`getFocusedStem`/`triggerStutterFor`/`togglePlay`/`setHeadNodEnabled`/`setHeadNodSensitivity`/`processFaceLandmarks`/`setShakeStutterEnabled`) and baton methods (`setCalibration`/`setDwellCycleEnabled`/`centroid`/`forceCycle`) named identically in their defining task and their UI consumers. `Tone.Player` mock fields (`sync`/`start`/`stop`/`unsync`/`connect`/`dispose`) and Transport fields (`loop`/`loopStart`/`loopEnd`/`scheduleOnce`/`state`/`seconds`) are consistent across Tasks 5–8.
