# Remix Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated Remix screen where a user builds a 4-stem remix from silence with two batons: Y drives a per-stem filter+gain taper (floor = silent), a dwell gesture cycles a baton to the next stem, and a fast-shake gesture fires a one-shot beat-synced stutter burst.

**Architecture:** A standalone `RemixEngine` (per-stem `AudioBufferSource → GainNode → BiquadFilter → masterGain`, always-running sources, build-from-silence) driven by pure `RemixBaton` state machines. A single shared `loadStemBuffers` helper is extracted from SongPresetEngine. A new `RemixScreen` mirrors SongPresetScreen's camera/touch input plumbing. No change to SongPresetEngine behaviour.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Tone.js v15 + raw Web Audio, Vitest + jsdom. No new dependencies.

**Spec:** [../specs/2026-05-15-remix-core-design.md](../specs/2026-05-15-remix-core-design.md)

---

## File Map

| Path | New / Modified | Responsibility |
|---|---|---|
| `src/remix/loadStemBuffers.ts` | New | Fetch + `decodeAudioData` a `SongConfig.stems` map → `Map<string, AudioBuffer>`. Shared by RemixEngine and SongPresetEngine. |
| `src/remix/remixTaper.ts` | New | Pure `remixTaper(filterNorm)` → `{ cutoffHz, gain }` — the Y filter+gain curve. |
| `src/remix/ShakeDetector.ts` | New | Velocity-spike detector with threshold + cooldown. |
| `src/remix/StutterScheduler.ts` | New | Pure stutter-window math (`computeStutterWindow`) + a class that creates/tears down the overlay buffer source. |
| `src/remix/RemixBaton.ts` | New | Per-baton state machine. Owns `StemId`, `STEM_CYCLE_ORDER`, assigned stem, `DwellDetector` (cycle), `ShakeDetector` (stutter), Y→filterNorm. Pure logic, no Web Audio. |
| `src/remix/RemixEngine.ts` | New | Stem playback graph, per-stem state, render loop, latch, glide-takeover, stutter overlay, transport. |
| `src/songs/SongPresetEngine.ts` | Modified | `loadSong` stem-load loop calls `loadStemBuffers` (behaviour identical). |
| `src/state/types.ts` | Modified | Add `'remix'` to `Screen` and `PerformanceView` unions. |
| `src/ui/App.tsx` | Modified | Import + `case 'remix': return <RemixScreen />`. |
| `src/ui/components/performance/ModeSelector.tsx` | Modified | Add Remix mode entry + SCREEN_MODES mapping. |
| `src/ui/screens/RemixScreen.tsx` | New | Camera + touch input, mounts RemixEngine, feeds 2 batons, renders 4 stem tiles + feedback. |
| `src/__tests__/remixTaper.test.ts` | New | Taper truth-table. |
| `src/__tests__/ShakeDetector.test.ts` | New | Threshold + cooldown behaviour. |
| `src/__tests__/StutterScheduler.test.ts` | New | Window math. |
| `src/__tests__/RemixBaton.test.ts` | New | Cycle order, latch, gesture isolation, Y mapping. |
| `src/__tests__/RemixEngine.test.ts` | New | Build-from-silence, latch, glide, dispose. |

`StemId` and `STEM_CYCLE_ORDER` live in `RemixBaton.ts` (the baton owns cycling); `RemixEngine` imports the type from there. Dependency direction: `RemixBaton` depends on nothing in `src/remix/` except `ShakeDetector`/`remixTaper`/`StutterScheduler` types; `RemixEngine` depends on `RemixBaton`, `loadStemBuffers`, `StutterScheduler`, `remixTaper`.

---

## Task 1: Extract `loadStemBuffers` shared helper

**Files:**
- Create: `src/remix/loadStemBuffers.ts`
- Test: `src/__tests__/loadStemBuffers.test.ts`
- Modify: `src/songs/SongPresetEngine.ts` (the `loadSong` stem-load loop, ~lines 406–430)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/loadStemBuffers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadStemBuffers } from '../remix/loadStemBuffers';

function fakeCtx(): AudioContext {
  return {
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 5 } as AudioBuffer),
  } as unknown as AudioContext;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }) as unknown as typeof fetch;
});

describe('loadStemBuffers', () => {
  it('decodes every stem URL into a buffer map keyed by stem id', async () => {
    const ctx = fakeCtx();
    const map = await loadStemBuffers(ctx, {
      vocals: 'a/vocals.wav',
      drums: 'a/drums.wav',
    });
    expect([...map.keys()].sort()).toEqual(['drums', 'vocals']);
    expect(map.get('vocals')).toEqual({ duration: 5 });
  });

  it('reports progress as each stem finishes', async () => {
    const ctx = fakeCtx();
    const progress: Array<[number, number]> = [];
    await loadStemBuffers(
      ctx,
      { vocals: 'a/v.wav', drums: 'a/d.wav', bass: 'a/b.wav', other: 'a/o.wav' },
      (loaded, total) => progress.push([loaded, total]),
    );
    expect(progress.length).toBe(4);
    expect(progress[progress.length - 1]).toEqual([4, 4]);
  });

  it('throws when a stem URL fails to fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }) as unknown as typeof fetch;
    await expect(
      loadStemBuffers(fakeCtx(), { vocals: 'missing.wav' }),
    ).rejects.toThrow('missing.wav');
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run src/__tests__/loadStemBuffers.test.ts`
Expected: FAIL — `Cannot find module '../remix/loadStemBuffers'`.

- [ ] **Step 3: Create the helper**

Create `src/remix/loadStemBuffers.ts`:

```ts
/**
 * loadStemBuffers — fetch + decode a song's stem files into AudioBuffers.
 *
 * Shared by RemixEngine and SongPresetEngine so the fetch/decode/progress
 * logic lives in one place. Returns a map keyed by stem id; callers build
 * their own gain/filter graph from the buffers.
 */
export async function loadStemBuffers(
  ctx: AudioContext,
  stems: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Map<string, AudioBuffer>> {
  const stemIds = Object.keys(stems);
  const total = stemIds.length;
  let loaded = 0;
  const result = new Map<string, AudioBuffer>();

  await Promise.all(
    stemIds.map(async (stemId) => {
      const url = stems[stemId];
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load ${url}: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      result.set(stemId, audioBuffer);
      loaded++;
      onProgress?.(loaded, total);
    }),
  );

  return result;
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run src/__tests__/loadStemBuffers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor SongPresetEngine to use the helper**

In `src/songs/SongPresetEngine.ts`, add the import near the other voice imports:

```ts
import { loadStemBuffers } from '../remix/loadStemBuffers';
```

Replace the stem-load block in `loadSong` (the `const loadPromises = stemIds.map(async (stemId) => { ... }); await Promise.all(loadPromises);` section, ~lines 406–430) with:

```ts
    // Load all stems via the shared helper, then build per-stem gain nodes.
    const buffers = await loadStemBuffers(
      this.ctx!,
      song.stems,
      (loaded, total) => {
        this.stemsLoaded = loaded;
        this.onLoadProgress?.(loaded, total);
      },
    );
    for (const [stemId, audioBuffer] of buffers) {
      const gainNode = this.ctx!.createGain();
      gainNode.gain.value = 0;
      this.stems.set(stemId, {
        id: stemId,
        buffer: audioBuffer,
        sourceNode: null,
        gainNode,
        currentGain: 0,
        targetGain: 0,
      });
    }
```

Leave the surrounding code (`const stemIds = Object.keys(song.stems); this.stemsTotal = stemIds.length; this.stemsLoaded = 0;` above, and the analysis-loading block below) unchanged.

- [ ] **Step 6: Run the full suite, expect no regressions**

Run: `npx vitest run`
Expected: All previously-passing tests pass (263 + 3 new = 266). SongPresetEngine tests still green because the helper performs the same fetch/decode the inline loop did, and the engine still builds its own gain nodes.

- [ ] **Step 7: Run lint**

Run: `npm run lint`
Expected: No new diagnostics (pre-existing `src/__tests__/setup.ts` errors are unchanged).

- [ ] **Step 8: Commit**

```bash
git add src/remix/loadStemBuffers.ts src/__tests__/loadStemBuffers.test.ts src/songs/SongPresetEngine.ts
git commit -m "refactor(remix): extract shared loadStemBuffers helper

Fetch/decode/progress logic for song stems moves into one helper.
SongPresetEngine.loadSong now calls it and builds its gain nodes
from the returned buffers — behaviour identical, all tests green."
```

---

## Task 2: `remixTaper` — the Y filter+gain curve

**Files:**
- Create: `src/remix/remixTaper.ts`
- Test: `src/__tests__/remixTaper.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/remixTaper.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { remixTaper } from '../remix/remixTaper';

describe('remixTaper', () => {
  it('is true-silent in the dead-zone (filterNorm 0 .. 0.08)', () => {
    expect(remixTaper(0).gain).toBe(0);
    expect(remixTaper(0.04).gain).toBe(0);
    expect(remixTaper(0.0799).gain).toBe(0);
  });

  it('ramps gain 0 → 1 across the fade band (0.08 .. 0.20)', () => {
    expect(remixTaper(0.08).gain).toBeCloseTo(0, 2);
    expect(remixTaper(0.14).gain).toBeCloseTo(0.5, 1);
    expect(remixTaper(0.20).gain).toBeCloseTo(1, 2);
  });

  it('holds gain at 1 above the fade band', () => {
    expect(remixTaper(0.21).gain).toBe(1);
    expect(remixTaper(0.5).gain).toBe(1);
    expect(remixTaper(1).gain).toBe(1);
  });

  it('opens the cutoff monotonically from 80 Hz to 18 kHz', () => {
    const low = remixTaper(0.10).cutoffHz;
    const mid = remixTaper(0.20).cutoffHz;
    const high = remixTaper(1).cutoffHz;
    expect(low).toBeGreaterThanOrEqual(80);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBeCloseTo(18000, -2);
  });

  it('clamps out-of-range input', () => {
    expect(remixTaper(-1).gain).toBe(0);
    expect(remixTaper(2)).toEqual(remixTaper(1));
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/remixTaper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/remixTaper.ts`:

```ts
/**
 * remixTaper — maps a 0–1 filterNorm (derived from baton Y) to a
 * combined lowpass cutoff + stem gain.
 *
 *   0.00 – 0.08  silent dead-zone   gain 0          (a bare 80 Hz
 *                                                     lowpass still
 *                                                     leaks bass, so
 *                                                     gain must fall too)
 *   0.08 – 0.20  fade band          cutoff 80→250Hz, gain 0→1 linear
 *   0.20 – 1.00  tone-shaping       cutoff 250Hz→18kHz log, gain 1
 *
 * Pure function — the Y mechanic's single source of truth. Sweeping to
 * the floor is mute; there is no separate mute control.
 */

const DEAD_ZONE_TOP = 0.08;
const FADE_TOP = 0.20;
const CUTOFF_MIN_HZ = 80;
const CUTOFF_FADE_TOP_HZ = 250;
const CUTOFF_MAX_HZ = 18000;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface RemixTaperPoint {
  cutoffHz: number;
  gain: number;
}

export function remixTaper(filterNorm: number): RemixTaperPoint {
  const n = clamp01(filterNorm);

  if (n < DEAD_ZONE_TOP) {
    return { cutoffHz: CUTOFF_MIN_HZ, gain: 0 };
  }

  if (n < FADE_TOP) {
    const t = (n - DEAD_ZONE_TOP) / (FADE_TOP - DEAD_ZONE_TOP); // 0..1
    const cutoffHz =
      CUTOFF_MIN_HZ + t * (CUTOFF_FADE_TOP_HZ - CUTOFF_MIN_HZ);
    return { cutoffHz, gain: t };
  }

  // Logarithmic cutoff sweep 250 Hz → 18 kHz across 0.20 .. 1.0
  const t = (n - FADE_TOP) / (1 - FADE_TOP); // 0..1
  const logMin = Math.log(CUTOFF_FADE_TOP_HZ);
  const logMax = Math.log(CUTOFF_MAX_HZ);
  const cutoffHz = Math.exp(logMin + t * (logMax - logMin));
  return { cutoffHz, gain: 1 };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/remixTaper.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/remix/remixTaper.ts src/__tests__/remixTaper.test.ts
git commit -m "feat(remix): Y filter+gain taper (floor = true silence)"
```

---

## Task 3: `ShakeDetector`

**Files:**
- Create: `src/remix/ShakeDetector.ts`
- Test: `src/__tests__/ShakeDetector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/ShakeDetector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ShakeDetector } from '../remix/ShakeDetector';

describe('ShakeDetector', () => {
  it('fires once when velocity crosses the threshold', () => {
    const d = new ShakeDetector({ threshold: 0.5, cooldownMs: 600 });
    expect(d.update(0.2, 0)).toBe(false);
    expect(d.update(0.6, 16)).toBe(true);   // crossed
  });

  it('does not re-fire while still above threshold (needs a fresh crossing)', () => {
    const d = new ShakeDetector({ threshold: 0.5, cooldownMs: 600 });
    expect(d.update(0.6, 0)).toBe(true);
    expect(d.update(0.7, 16)).toBe(false);  // still high, no new crossing
    expect(d.update(0.8, 32)).toBe(false);
  });

  it('respects the cooldown after firing', () => {
    const d = new ShakeDetector({ threshold: 0.5, cooldownMs: 600 });
    expect(d.update(0.6, 0)).toBe(true);
    d.update(0.1, 100);                     // drop below
    expect(d.update(0.6, 400)).toBe(false); // within cooldown
    expect(d.update(0.1, 700)).toBe(false); // below, but past cooldown — arms
    expect(d.update(0.6, 720)).toBe(true);  // fresh crossing after cooldown
  });

  it('reset() clears state', () => {
    const d = new ShakeDetector({ threshold: 0.5, cooldownMs: 600 });
    d.update(0.6, 0);
    d.reset();
    expect(d.update(0.6, 10)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/ShakeDetector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/ShakeDetector.ts`:

```ts
/**
 * ShakeDetector — fires once on a rising velocity crossing above a
 * threshold, then requires the velocity to drop back below threshold
 * AND a cooldown to elapse before it can fire again.
 *
 * "Fast shake" is the Remix stutter trigger; the rising-edge + cooldown
 * design stops a single sustained fast move from spraying triggers.
 */

export interface ShakeConfig {
  /** Smoothed velocity (0–1) above which a shake fires. */
  threshold?: number;
  /** Minimum gap (ms) between fires. */
  cooldownMs?: number;
}

const DEFAULTS: Required<ShakeConfig> = {
  threshold: 0.55,
  cooldownMs: 600,
};

export class ShakeDetector {
  private threshold: number;
  private cooldownMs: number;
  private wasAbove = false;
  private lastFireMs = Number.NEGATIVE_INFINITY;

  constructor(cfg: ShakeConfig = {}) {
    this.threshold = cfg.threshold ?? DEFAULTS.threshold;
    this.cooldownMs = cfg.cooldownMs ?? DEFAULTS.cooldownMs;
  }

  /** Feed smoothed velocity; returns true on the frame a shake fires. */
  update(velocity: number, nowMs: number): boolean {
    const above = velocity >= this.threshold;
    const risingEdge = above && !this.wasAbove;
    this.wasAbove = above;

    if (risingEdge && nowMs - this.lastFireMs >= this.cooldownMs) {
      this.lastFireMs = nowMs;
      return true;
    }
    return false;
  }

  reset(): void {
    this.wasAbove = false;
    this.lastFireMs = Number.NEGATIVE_INFINITY;
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/ShakeDetector.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/remix/ShakeDetector.ts src/__tests__/ShakeDetector.test.ts
git commit -m "feat(remix): ShakeDetector (rising-edge velocity trigger + cooldown)"
```

---

## Task 4: `StutterScheduler` window math

**Files:**
- Create: `src/remix/StutterScheduler.ts`
- Test: `src/__tests__/StutterScheduler.test.ts`

This task implements only the **pure window math** (`computeStutterWindow`). The node-creating class shell is added but its audio method is a thin wrapper exercised later in the RemixEngine integration test.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/StutterScheduler.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeStutterWindow } from '../remix/StutterScheduler';

const BEATS = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
const DOWNBEATS = [0, 2.0, 4.0]; // a bar every 2 s

describe('computeStutterWindow', () => {
  it('starts on the next beat at or after now', () => {
    const w = computeStutterWindow(1.2, BEATS, DOWNBEATS);
    expect(w.startSec).toBe(1.5);
  });

  it('uses half a beat as the slice duration', () => {
    const w = computeStutterWindow(1.2, BEATS, DOWNBEATS);
    // local beat interval = 0.5 → slice = 0.25
    expect(w.sliceDurSec).toBeCloseTo(0.25, 5);
  });

  it('uses one bar (downbeat-to-downbeat) as the burst duration', () => {
    const w = computeStutterWindow(1.2, BEATS, DOWNBEATS);
    expect(w.burstDurSec).toBeCloseTo(2.0, 5);
  });

  it('falls back to 4 beats when downbeats are absent', () => {
    const w = computeStutterWindow(1.2, BEATS, []);
    expect(w.burstDurSec).toBeCloseTo(2.0, 5); // 4 * 0.5
  });

  it('extrapolates a beat past the end for tail triggers', () => {
    const w = computeStutterWindow(3.7, BEATS, DOWNBEATS);
    expect(w.startSec).toBe(4.0);
    expect(w.sliceDurSec).toBeGreaterThan(0);
  });

  it('returns now-aligned window when there are no beats', () => {
    const w = computeStutterWindow(2.3, [], []);
    expect(w.startSec).toBe(2.3);
    expect(w.sliceDurSec).toBeGreaterThan(0);
    expect(w.burstDurSec).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/StutterScheduler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/StutterScheduler.ts`:

```ts
/**
 * StutterScheduler — beat-synced one-shot slice re-trigger for one stem.
 *
 * The window math is pure (computeStutterWindow). The class wraps a
 * dedicated short looping AudioBufferSource that overlays the stem for
 * one bar; the stem's main source never stops, so playback is still
 * sample-aligned when the overlay ends (no re-sync needed).
 */

export interface StutterWindow {
  /** Playback-seconds at which the burst begins (next beat boundary). */
  startSec: number;
  /** Length of one repeated slice (≈ half a beat). */
  sliceDurSec: number;
  /** Total burst length (one bar; fallback 4 beats). */
  burstDurSec: number;
}

const DEFAULT_BEAT_DUR_SEC = 0.5;

/** Next beat strictly-or-equal at/after `nowSec`; extrapolates past end. */
function nextBeatAtOrAfter(beats: readonly number[], nowSec: number): number {
  if (beats.length === 0) return nowSec;
  for (let i = 0; i < beats.length; i++) {
    if (beats[i] >= nowSec) return beats[i];
  }
  const interval =
    beats.length >= 2
      ? beats[beats.length - 1] - beats[beats.length - 2]
      : DEFAULT_BEAT_DUR_SEC;
  return beats[beats.length - 1] + interval;
}

/** Local beat interval near `nowSec` (gap to the following beat). */
function localBeatInterval(beats: readonly number[], nowSec: number): number {
  if (beats.length < 2) return DEFAULT_BEAT_DUR_SEC;
  for (let i = 0; i < beats.length - 1; i++) {
    if (beats[i + 1] > nowSec) return beats[i + 1] - beats[i];
  }
  return beats[beats.length - 1] - beats[beats.length - 2];
}

/** One bar = downbeat-to-downbeat spanning startSec; fallback 4 beats. */
function barDuration(
  downbeats: readonly number[],
  beatInterval: number,
  startSec: number,
): number {
  if (downbeats.length >= 2) {
    for (let i = 0; i < downbeats.length - 1; i++) {
      if (downbeats[i + 1] > startSec) {
        return downbeats[i + 1] - downbeats[i];
      }
    }
    return downbeats[downbeats.length - 1] - downbeats[downbeats.length - 2];
  }
  return beatInterval * 4;
}

export function computeStutterWindow(
  nowSec: number,
  beats: readonly number[],
  downbeats: readonly number[],
): StutterWindow {
  const startSec = nextBeatAtOrAfter(beats, nowSec);
  const beatInterval = localBeatInterval(beats, nowSec);
  const sliceDurSec = beatInterval / 2;
  const burstDurSec = barDuration(downbeats, beatInterval, startSec);
  return { startSec, sliceDurSec, burstDurSec };
}

/**
 * Owns the overlay buffer source for an in-flight burst on one stem.
 * Construction is deferred to RemixEngine which has the AudioContext,
 * the stem buffer, and the stem gain node.
 */
export class StutterScheduler {
  private active = false;

  isActive(): boolean {
    return this.active;
  }

  /**
   * Begin a burst. `onEnd` is invoked (by the engine's frame loop or a
   * timer) once `playbackNow >= startSec + burstDurSec`. Returns false
   * if a burst is already in flight (one per stem at a time).
   */
  begin(
    win: StutterWindow,
    startOverlay: (win: StutterWindow) => void,
  ): boolean {
    if (this.active) return false;
    this.active = true;
    startOverlay(win);
    return true;
  }

  /** Call each frame with current playback seconds; ends the burst. */
  tick(
    playbackNowSec: number,
    win: StutterWindow,
    stopOverlay: () => void,
  ): void {
    if (!this.active) return;
    if (playbackNowSec >= win.startSec + win.burstDurSec) {
      stopOverlay();
      this.active = false;
    }
  }

  forceStop(stopOverlay: () => void): void {
    if (!this.active) return;
    stopOverlay();
    this.active = false;
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/StutterScheduler.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/remix/StutterScheduler.ts src/__tests__/StutterScheduler.test.ts
git commit -m "feat(remix): StutterScheduler window math + burst lifecycle"
```

---

## Task 5: `RemixBaton` state machine

**Files:**
- Create: `src/remix/RemixBaton.ts`
- Test: `src/__tests__/RemixBaton.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/RemixBaton.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RemixBaton, STEM_CYCLE_ORDER } from '../remix/RemixBaton';

const STILL = { x: 0.5, y: 0.5, found: true };

function holdStill(b: RemixBaton, fromMs: number, frames: number, stepMs = 60) {
  let cycled = false;
  for (let i = 0; i < frames; i++) {
    const out = b.update(STILL, fromMs + i * stepMs);
    if (out.cycled) cycled = true;
  }
  return cycled;
}

describe('RemixBaton', () => {
  it('starts assigned to the first stem in the cycle order', () => {
    const b = new RemixBaton('red');
    expect(b.update(STILL, 0).stem).toBe(STEM_CYCLE_ORDER[0]);
  });

  it('maps Y to filterNorm (top of frame = open, bottom = silent)', () => {
    const b = new RemixBaton('red');
    // posY 0 = top of frame → filterNorm 1; posY 1 = bottom → 0
    expect(b.update({ x: 0.5, y: 0, found: true }, 0).filterNorm).toBeCloseTo(1, 5);
    expect(b.update({ x: 0.5, y: 1, found: true }, 16).filterNorm).toBeCloseTo(0, 5);
  });

  it('writes null filterNorm when the baton is absent (latch)', () => {
    const b = new RemixBaton('red');
    expect(b.update({ x: 0, y: 0, found: false }, 0).filterNorm).toBeNull();
  });

  it('cycles to the next stem after a sustained dwell, latching the prior', () => {
    const b = new RemixBaton('red');
    const cycled = holdStill(b, 0, 40); // > dwellTimeMs at 60ms/frame
    expect(cycled).toBe(true);
    expect(b.update(STILL, 5000).stem).toBe(STEM_CYCLE_ORDER[1]);
  });

  it('wraps the cycle order back to the first stem', () => {
    const b = new RemixBaton('red');
    let t = 0;
    for (let i = 0; i < STEM_CYCLE_ORDER.length; i++) {
      holdStill(b, t, 40);
      t += 40 * 60 + 2000; // advance well past cooldown
    }
    expect(b.update(STILL, t).stem).toBe(STEM_CYCLE_ORDER[0]);
  });

  it('fires a stutter on a fast move and not on a dwell', () => {
    const b = new RemixBaton('red');
    // Big position jump between frames → high velocity → shake.
    b.update({ x: 0.1, y: 0.5, found: true }, 0);
    const out = b.update({ x: 0.9, y: 0.5, found: true }, 16);
    expect(out.stutter).toBe(true);
    // A still hold never reports stutter.
    const b2 = new RemixBaton('red');
    let anyStutter = false;
    for (let i = 0; i < 40; i++) {
      if (b2.update(STILL, i * 60).stutter) anyStutter = true;
    }
    expect(anyStutter).toBe(false);
  });

  it('reports dwell progress 0..1 while holding still', () => {
    const b = new RemixBaton('red');
    b.update(STILL, 0);
    const mid = b.update(STILL, 600);
    expect(mid.dwellProgress).toBeGreaterThan(0);
    expect(mid.dwellProgress).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixBaton.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/RemixBaton.ts`:

```ts
/**
 * RemixBaton — per-baton state machine for the Remix screen.
 *
 * One baton owns one stem at a time and cycles through the four stems
 * with a dwell gesture. While present it writes its stem's filterNorm
 * from Y; a fast-shake fires a one-shot stutter. Absent → writes null
 * (the engine latches the stem). Pure logic; no Web Audio.
 */

import type { ColorRole } from '../songs/songLibrary';
import { DwellDetector } from '../movement/DwellDetector';
import { ShakeDetector } from './ShakeDetector';

export type StemId = 'vocals' | 'drums' | 'bass' | 'other';

/** Fixed cycle order; wraps. */
export const STEM_CYCLE_ORDER: readonly StemId[] = [
  'vocals',
  'drums',
  'bass',
  'other',
];

export interface BatonInput {
  x: number;
  y: number;
  found: boolean;
}

export interface RemixBatonOutput {
  /** The stem this baton currently controls. */
  stem: StemId;
  /** filterNorm 0–1 to write to that stem, or null when absent (latch). */
  filterNorm: number | null;
  /** True only on the frame a cycle fired (engine applies glide-takeover). */
  cycled: boolean;
  /** True only on the frame a stutter should fire. */
  stutter: boolean;
  /** Dwell ring progress 0–1 for visual feedback. */
  dwellProgress: number;
}

/** Frame-to-frame travel scaled to ~0–1, matching SongPresetEngine. */
function normalizedVelocity(
  px: number,
  py: number,
  x: number,
  y: number,
): number {
  const dx = x - px;
  const dy = y - py;
  const raw = Math.sqrt(dx * dx + dy * dy);
  return Math.min(1, raw * 15);
}

export class RemixBaton {
  readonly role: ColorRole;
  private stemIndex = 0;
  private dwell = new DwellDetector({
    dwellRadius: 0.05,
    dwellTimeMs: 1200,
    cooldownMs: 600,
  });
  private shake = new ShakeDetector({ threshold: 0.55, cooldownMs: 600 });

  private prevX = 0.5;
  private prevY = 0.5;
  private smoothVel = 0;

  constructor(role: ColorRole) {
    this.role = role;
  }

  get assignedStem(): StemId {
    return STEM_CYCLE_ORDER[this.stemIndex];
  }

  update(input: BatonInput, nowMs: number): RemixBatonOutput {
    const stem = this.assignedStem;

    if (!input.found) {
      // Absent → detectors idle, nothing written, stem latches.
      this.smoothVel = this.smoothVel * 0.7;
      this.dwell.reset();
      return {
        stem,
        filterNorm: null,
        cycled: false,
        stutter: false,
        dwellProgress: 0,
      };
    }

    // Velocity (smoothed) for the shake detector.
    const inst = normalizedVelocity(this.prevX, this.prevY, input.x, input.y);
    this.smoothVel = this.smoothVel + (inst - this.smoothVel) * 0.4;
    this.prevX = input.x;
    this.prevY = input.y;

    const stutter = this.shake.update(this.smoothVel, nowMs);

    const dwellRes = this.dwell.update({ x: input.x, y: input.y }, nowMs);
    let cycled = false;
    if (dwellRes.state === 'triggered') {
      this.stemIndex = (this.stemIndex + 1) % STEM_CYCLE_ORDER.length;
      cycled = true;
    }

    // posY: 0 = top of frame → open (filterNorm 1); 1 = bottom → 0.
    const filterNorm = 1 - Math.min(1, Math.max(0, input.y));

    return {
      stem: cycled ? this.assignedStem : stem,
      filterNorm,
      cycled,
      stutter,
      dwellProgress: dwellRes.progress,
    };
  }

  reset(): void {
    this.stemIndex = 0;
    this.dwell.reset();
    this.shake.reset();
    this.smoothVel = 0;
    this.prevX = 0.5;
    this.prevY = 0.5;
  }
}
```

Note: on a cycle frame the output's `stem` is the **new** stem (so the engine binds the baton's Y to the newly-focused stem immediately and glides it); the prior stem simply stops being written and latches. `filterNorm` is still reported on the cycle frame so the new stem begins gliding toward the live Y.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixBaton.test.ts`
Expected: PASS (7 tests). If the dwell-frame-count math needs tuning (DwellDetector triggers then enters cooldown), adjust the `holdStill` frame counts in the test rather than the detector — `dwellTimeMs:1200` at 60 ms/frame ⇒ ~20 frames to trigger; 40 frames is comfortably enough.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no new diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/remix/RemixBaton.ts src/__tests__/RemixBaton.test.ts
git commit -m "feat(remix): RemixBaton state machine (cycle/latch/Y/stutter)"
```

---

## Task 6: `RemixEngine` — stem graph, state, render, latch, glide

**Files:**
- Create: `src/remix/RemixEngine.ts`
- Test: `src/__tests__/RemixEngine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/RemixEngine.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('tone', () => {
  const Transport = {
    bpm: { value: 120 },
    seconds: 0,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
  };
  return {
    start: vi.fn().mockResolvedValue(undefined),
    getContext: vi.fn(() => ({ rawContext: makeRawCtx() })),
    getTransport: vi.fn(() => Transport),
    now: vi.fn(() => 0),
  };
});

function makeParam() {
  return {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}
function makeNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: makeParam(),
    frequency: makeParam(),
    Q: makeParam(),
    type: 'lowpass',
  };
}
function makeRawCtx() {
  return {
    currentTime: 0,
    state: 'running',
    createGain: vi.fn(() => makeNode()),
    createBiquadFilter: vi.fn(() => makeNode()),
    createBufferSource: vi.fn(() => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null,
    })),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 8 }),
    destination: {},
  };
}

import { RemixEngine } from '../remix/RemixEngine';
import type { SongConfig } from '../songs/songLibrary';

function song(): SongConfig {
  return {
    id: 't', title: 'T', artist: 'A', key: 'C', bpm: 120,
    timeSignature: '4/4',
    stems: { vocals: 'v.wav', drums: 'd.wav', bass: 'b.wav', other: 'o.wav' },
    stemMixer: {
      label: 'm',
      leftZone: { vocals: 1, drums: 0, bass: 0, other: 0 },
      centerZone: { vocals: 1, drums: 0.5, bass: 0.5, other: 0.5 },
      rightZone: { vocals: 1, drums: 1, bass: 1, other: 1 },
    },
    beats: [0, 0.5, 1.0, 1.5, 2.0],
    downbeats: [0, 2.0],
  };
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }) as unknown as typeof fetch;
});

describe('RemixEngine', () => {
  it('loads all four stems silent (build-from-silence)', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    const st = e.getStemStates();
    for (const id of ['vocals', 'drums', 'bass', 'other'] as const) {
      expect(st[id].gain).toBe(0);
      expect(st[id].filterNorm).toBe(0);
    }
    e.dispose();
  });

  it('raising a baton Y brings its stem in; absence latches it', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());

    // Baton writes vocals filterNorm = 1 (open).
    e.applyBaton({ stem: 'vocals', filterNorm: 1, cycled: false, stutter: false, dwellProgress: 0 });
    e.renderFrame(0);
    expect(e.getStemStates().vocals.filterNorm).toBeGreaterThan(0);

    // Baton absent → null filterNorm → stem latches (state unchanged).
    const before = e.getStemStates().vocals.filterNorm;
    e.applyBaton({ stem: 'vocals', filterNorm: null, cycled: false, stutter: false, dwellProgress: 0 });
    e.renderFrame(16);
    expect(e.getStemStates().vocals.filterNorm).toBeCloseTo(before, 2);
    e.dispose();
  });

  it('glide-takeover ramps a re-focused stem rather than snapping', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    // Latch drums at a low value.
    e.applyBaton({ stem: 'drums', filterNorm: 0.2, cycled: false, stutter: false, dwellProgress: 0 });
    e.renderFrame(0);
    // Re-focus drums with cycled=true and a high Y; one frame must NOT jump fully.
    e.applyBaton({ stem: 'drums', filterNorm: 1, cycled: true, stutter: false, dwellProgress: 0 });
    e.renderFrame(16);
    const v = e.getStemStates().drums.filterNorm;
    expect(v).toBeGreaterThan(0.2);
    expect(v).toBeLessThan(1); // still gliding, not snapped
    e.dispose();
  });

  it('dispose tears down without throwing', async () => {
    const e = new RemixEngine();
    await e.loadSong(song());
    expect(() => e.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/RemixEngine.ts`:

```ts
/**
 * RemixEngine — stem playback for the Remix screen.
 *
 * Per stem: AudioBufferSource → stemGain → stemFilter → masterGain.
 * Sources always run (looped); silence is gain 0, never stop, so all
 * stems stay sample-aligned for the whole session. Build-from-silence:
 * every stem starts inaudible. A RemixBaton writes filterNorm; the
 * engine renders state → audio each frame, smoothing so imprecise Y
 * never zippers and a re-focused stem glides instead of snapping.
 */

import * as Tone from 'tone';
import type { SongConfig } from '../songs/songLibrary';
import { loadStemBuffers } from './loadStemBuffers';
import { loadSongAnalysis } from '../songs/analysisLoader';
import { remixTaper } from './remixTaper';
import {
  StutterScheduler,
  computeStutterWindow,
  type StutterWindow,
} from './StutterScheduler';
import type { StemId, RemixBatonOutput } from './RemixBaton';
import { STEM_CYCLE_ORDER } from './RemixBaton';

export interface RemixStemState {
  filterNorm: number;
  targetFilterNorm: number;
  gain: number;
  stuttering: boolean;
}

interface StemNodes {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  filter: BiquadFilterNode;
  stutterSource: AudioBufferSourceNode | null;
  scheduler: StutterScheduler;
  pendingWindow: StutterWindow | null;
}

const SMOOTH_TC = 0.05;       // filter/gain setTargetAtTime time-constant
const GLIDE_LERP = 0.12;      // per-frame glide toward target (~250ms)
const NORMAL_LERP = 0.35;     // per-frame follow when actively controlled

export class RemixEngine {
  private ctx: AudioContext | null = null;
  private song: SongConfig | null = null;
  private master: GainNode | null = null;
  private nodes = new Map<StemId, StemNodes>();
  private states = new Map<StemId, RemixStemState>();
  private gliding = new Set<StemId>();
  private beats: number[] = [];
  private downbeats: number[] = [];
  private playing = false;

  async loadSong(song: SongConfig): Promise<void> {
    this.dispose();
    this.song = song;
    await Tone.start();
    this.ctx = Tone.getContext().rawContext as AudioContext;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    const buffers = await loadStemBuffers(this.ctx, song.stems);

    for (const stem of STEM_CYCLE_ORDER) {
      const buffer = buffers.get(stem);
      if (!buffer) continue;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 80;
      filter.Q.value = 0.7;
      filter.connect(gain);
      gain.connect(this.master);
      this.nodes.set(stem, {
        buffer,
        source: null,
        gain,
        filter,
        stutterSource: null,
        scheduler: new StutterScheduler(),
        pendingWindow: null,
      });
      this.states.set(stem, {
        filterNorm: 0,
        targetFilterNorm: 0,
        gain: 0,
        stuttering: false,
      });
    }

    if (song.analysisUrl) {
      try {
        const a = await loadSongAnalysis(song.analysisUrl);
        this.beats = a.beats;
        this.downbeats = a.downbeats;
      } catch {
        this.beats = song.beats ?? [];
        this.downbeats = song.downbeats ?? [];
      }
    } else {
      this.beats = song.beats ?? [];
      this.downbeats = song.downbeats ?? [];
    }

    Tone.getTransport().bpm.value = song.bpm;
  }

  play(): void {
    if (!this.ctx || this.playing) return;
    for (const n of this.nodes.values()) {
      const src = this.ctx.createBufferSource();
      src.buffer = n.buffer;
      src.loop = true;
      src.connect(n.filter);
      src.start(0, 0);
      n.source = src;
    }
    Tone.getTransport().seconds = 0;
    Tone.getTransport().start();
    this.playing = true;
  }

  stop(): void {
    for (const n of this.nodes.values()) {
      n.scheduler.forceStop(() => this.stopOverlay(n));
      if (n.source) {
        try { n.source.stop(); } catch { /* already stopped */ }
        n.source.disconnect();
        n.source = null;
      }
    }
    Tone.getTransport().stop();
    this.playing = false;
  }

  /** Apply one baton's output for this frame. */
  applyBaton(out: RemixBatonOutput): void {
    const state = this.states.get(out.stem);
    if (!state) return;
    if (out.filterNorm === null) return; // absent → latch (no write)

    state.targetFilterNorm = out.filterNorm;
    if (out.cycled) this.gliding.add(out.stem);

    if (out.stutter) this.triggerStutter(out.stem);
  }

  /** Render all stem state → audio nodes. `playbackNowSec` from transport. */
  renderFrame(playbackNowSec: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    for (const [stem, state] of this.states) {
      const n = this.nodes.get(stem)!;

      // Smooth filterNorm toward target: gentle glide right after a
      // cycle (re-focused stem sweeps in), faster follow otherwise.
      const lerp = this.gliding.has(stem) ? GLIDE_LERP : NORMAL_LERP;
      state.filterNorm += (state.targetFilterNorm - state.filterNorm) * lerp;
      if (
        this.gliding.has(stem) &&
        Math.abs(state.targetFilterNorm - state.filterNorm) < 0.01
      ) {
        this.gliding.delete(stem);
      }

      const { cutoffHz, gain } = remixTaper(state.filterNorm);
      state.gain = gain;
      n.filter.frequency.setTargetAtTime(cutoffHz, now, SMOOTH_TC);
      // Stutter overlay owns the gain while bursting.
      if (!state.stuttering) {
        n.gain.gain.setTargetAtTime(gain, now, SMOOTH_TC);
      }

      // End an in-flight burst once its window elapses.
      if (n.pendingWindow) {
        n.scheduler.tick(playbackNowSec, n.pendingWindow, () =>
          this.stopOverlay(n),
        );
        if (!n.scheduler.isActive()) {
          n.pendingWindow = null;
          state.stuttering = false;
        }
      }
    }
  }

  getStemStates(): Record<StemId, RemixStemState> {
    const out = {} as Record<StemId, RemixStemState>;
    for (const [stem, s] of this.states) out[stem] = { ...s };
    return out;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    this.stop();
    for (const n of this.nodes.values()) {
      n.gain.disconnect();
      n.filter.disconnect();
    }
    this.nodes.clear();
    this.states.clear();
    this.gliding.clear();
    this.master?.disconnect();
    this.master = null;
    this.ctx = null;
    this.song = null;
  }

  // ---- internal ----

  private triggerStutter(stem: StemId): void {
    if (!this.ctx) return;
    const n = this.nodes.get(stem);
    const state = this.states.get(stem);
    if (!n || !state) return;

    const playbackNow = Tone.getTransport().seconds;
    const win = computeStutterWindow(playbackNow, this.beats, this.downbeats);
    const began = n.scheduler.begin(win, (w) => this.startOverlay(n, w));
    if (began) {
      n.pendingWindow = win;
      state.stuttering = true;
    }
  }

  private startOverlay(n: StemNodes, win: StutterWindow): void {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = n.buffer;
    src.loop = true;
    const offset = win.startSec % n.buffer.duration;
    src.loopStart = offset;
    src.loopEnd = offset + win.sliceDurSec;
    src.connect(n.filter);
    // Duck the main stem; overlay carries the sound during the burst.
    const now = this.ctx.currentTime;
    n.gain.gain.setTargetAtTime(remixTaper(this.stateGain(n)), now, 0.01);
    src.start(now, offset);
    n.stutterSource = src;
  }

  private stateGain(n: StemNodes): number {
    // Find the stem id for these nodes to read its current gain.
    for (const [stem, nodes] of this.nodes) {
      if (nodes === n) return this.states.get(stem)!.filterNorm;
    }
    return 0;
  }

  private stopOverlay(n: StemNodes): void {
    if (n.stutterSource) {
      try { n.stutterSource.stop(); } catch { /* already stopped */ }
      n.stutterSource.disconnect();
      n.stutterSource = null;
    }
  }
}
```

Note: `startOverlay` keeps the stem's filter line live (the overlay routes through the same `filter`), and `renderFrame` skips writing `n.gain` while `state.stuttering` so the overlay's own scheduling owns the burst; when the burst ends `stuttering` clears and the normal taper resumes on the next frame. The main `source` never stops, so playback is still sample-aligned.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: PASS (4 tests). If the glide test is flaky, the assertion only requires `0.2 < v < 1` after one frame at `GLIDE_LERP = 0.12` — that holds (`0.2 + (1-0.2)*0.12 = 0.296`).

- [ ] **Step 5: Run full suite + lint**

Run: `npx vitest run`
Expected: all green.
Run: `npm run lint`
Expected: no new diagnostics.

- [ ] **Step 6: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): RemixEngine — stem graph, build-from-silence, latch, glide, stutter overlay"
```

---

## Task 7: Screen + type wiring

**Files:**
- Modify: `src/state/types.ts:473` (`Screen` union) and `:476` (`PerformanceView` union)
- Modify: `src/ui/App.tsx` (import + `renderScreen` switch)
- Modify: `src/ui/components/performance/ModeSelector.tsx` (mode entry + SCREEN_MODES)

This task wires routing to a placeholder screen so navigation is testable before the full UI lands.

- [ ] **Step 1: Add `'remix'` to the unions**

In `src/state/types.ts`, replace line 473:

```ts
export type Screen = 'welcome' | 'setup' | 'calibration' | 'performance' | 'betweenUs' | 'harmonicBlending' | 'songPreset' | 'remix' | 'settings' | 'info';
```

and line 476:

```ts
export type PerformanceView = 'standard' | 'betweenUs' | 'harmonicBlending' | 'songPreset' | 'remix' | 'minimal';
```

- [ ] **Step 2: Create a minimal `RemixScreen` placeholder**

Create `src/ui/screens/RemixScreen.tsx`:

```tsx
/**
 * RemixScreen — placeholder shell. Full camera/touch UI lands in the
 * next task; this makes routing compile and navigable first.
 */
export default function RemixScreen() {
  return (
    <div id="main-content" style={{ padding: 24, color: '#a1a1b8' }}>
      <h1 style={{ color: '#e5e5f0' }}>Remix</h1>
      <p>Remix mode is loading…</p>
    </div>
  );
}
```

- [ ] **Step 3: Route it in App.tsx**

In `src/ui/App.tsx`, add the import alongside the other screen imports (after the `SongPresetScreen` import line):

```ts
import RemixScreen from './screens/RemixScreen';
```

and add a case in the `renderScreen` switch, immediately after the `case 'songPreset':` block:

```tsx
      case 'remix':
        return <RemixScreen />;
```

- [ ] **Step 4: Add the ModeSelector entry**

In `src/ui/components/performance/ModeSelector.tsx`, add to the `MODES` array after the `songPreset` entry:

```ts
  { id: 'remix', label: 'Remix' },
```

and add to `SCREEN_MODES`:

```ts
const SCREEN_MODES: Partial<Record<PerformanceView, 'betweenUs' | 'harmonicBlending' | 'songPreset' | 'remix'>> = {
  betweenUs: 'betweenUs',
  harmonicBlending: 'harmonicBlending',
  songPreset: 'songPreset',
  remix: 'remix',
};
```

- [ ] **Step 5: Run lint + full suite**

Run: `npm run lint`
Expected: no new diagnostics (the widened unions compile; `ModeSelector`'s `SCREEN_MODES` value type now includes `'remix'`).
Run: `npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/state/types.ts src/ui/App.tsx src/ui/components/performance/ModeSelector.tsx src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): route a Remix screen (placeholder shell)"
```

---

## Task 8: `RemixScreen` — camera + touch input and the render loop

**Files:**
- Modify: `src/ui/screens/RemixScreen.tsx` (replace the placeholder)

This task is UI integration. It mirrors `SongPresetScreen`'s ColorTracker + touch plumbing. No unit test (UI/canvas); covered by lint, the existing suite, and manual verification in Task 10. Read `src/ui/screens/SongPresetScreen.tsx` for the established ColorTracker setup, video element wiring, `usePadState` touch hook, and song-picker patterns, and follow them.

- [ ] **Step 1: Implement the screen**

Replace `src/ui/screens/RemixScreen.tsx` with a component that:

1. Holds a `RemixEngine` in a `useRef`, and a `Map<ColorRole, RemixBaton>` in a ref (lazily created per detected colour).
2. Mirrors `SongPresetScreen`'s camera setup: a `<video>` element, a `ColorTracker` in a ref started on mount, and the existing colour-calibration UI path (reuse the same calibration affordance SongPresetScreen exposes — call the same `colorTracker.calibrateFromPixel` flow).
3. Adds a touch path via `usePadState` (import from `./songPreset/usePadState`): one pointer → one baton (use a fixed `ColorRole`, e.g. `'red'`, for the touch baton).
4. Per animation frame:
   - Build `{ x, y, found }` for each tracked colour (camera: from `ColorTracker` blobs; touch: from `usePadState`).
   - For each, get/create its `RemixBaton`, call `baton.update(input, performance.now())`.
   - Call `engine.applyBaton(output)` for each.
   - Call `engine.renderFrame(Tone.getTransport().seconds)` once.
5. Renders a song picker (reuse `SONG_LIBRARY` from `../../songs/songLibrary`); on select, `await engine.loadSong(song)` then `engine.play()`.
6. Renders minimal transport controls: Play / Pause (call `engine.stop()` for pause-to-silence is acceptable for core) / Restart (stop + play).
7. Renders the **4 stem tiles** visual feedback from `engine.getStemStates()` each frame:
   - Tile fill height/brightness = `state.filterNorm`.
   - Warm→bright tint by `filterNorm`.
   - Assignment badge: which baton colour's `assignedStem === tile`.
   - Dwell ring: from the baton's last `dwellProgress`.
   - Stutter strobe: pulse while `state.stuttering`.
   - A global beat dot derived from `Tone.getTransport().seconds` vs the song's `beats` (visible even at full silence).
   - Latched (no baton on it) = solid; baton-controlled = "live" outline.
   - Never colour-only: include a level bar + text label per tile.
8. Cleans up on unmount: `colorTracker.stop()/.dispose()`, `engine.dispose()`, cancel the animation frame.

Keep the file focused on wiring + presentational rendering; all audio/gesture logic already lives in `RemixEngine`/`RemixBaton`. If the file exceeds ~400 lines, that is expected for a screen of this scope (SongPresetScreen is larger); do not split mid-task.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new diagnostics.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: all green (no test targets this UI file; nothing else regresses).

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): RemixScreen — camera + touch input, stem-tile feedback"
```

---

## Task 9: Wire the per-baton dwell/stutter feedback through to the screen

**Files:**
- Modify: `src/ui/screens/RemixScreen.tsx`

Task 8 renders engine-owned state. This task ensures the **baton-owned** transient signals (dwell progress, the cycle flash, the stutter trigger frame) are surfaced, since they live on `RemixBatonOutput`, not `RemixEngine`.

- [ ] **Step 1: Track latest baton outputs**

In `RemixScreen.tsx`, keep a ref `Map<ColorRole, RemixBatonOutput>` updated each frame with the latest `baton.update(...)` result. Use it in the render to draw:
- a dwell progress ring around each baton marker (`output.dwellProgress`),
- a brief flash overlay on the frame where `output.cycled` is true (a short-lived timestamp ref; fade over ~300 ms),
- the baton marker positioned on its `output.stem` tile.

- [ ] **Step 2: Lint + suite**

Run: `npm run lint` → no new diagnostics.
Run: `npx vitest run` → all green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): surface dwell ring + cycle flash from baton output"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm run test:run`
Expected: all suites pass — existing 263 + loadStemBuffers(3) + remixTaper(5) + ShakeDetector(4) + StutterScheduler(6) + RemixBaton(7) + RemixEngine(4) = 292, all green.

- [ ] **Step 2: Type check**

Run: `npm run lint`
Expected: only the pre-existing `src/__tests__/setup.ts` diagnostics; nothing new.

- [ ] **Step 3: Manual verification (documented; not automated)**

Run: `npm run dev`. Navigate to Remix via the mode selector. For each shipped song in `SONG_LIBRARY`:

1. Screen loads silent — confirm the beat dot pulses with the song even though all 4 tiles are empty.
2. With one baton: raise Y → assigned stem fades in and brightens; sweep Y to the floor → stem goes truly silent (no bass leak).
3. Hold still ~1.2 s → dwell ring fills, cycle flash fires, baton marker hops to the next stem tile in `vocals→drums→bass→other→vocals`; the prior stem keeps playing at its last setting (latch).
4. Re-cycle back to a playing stem → it glides (no click/jump) toward the new Y over ~¼ s.
5. Fast shake → that stem stutters in time on the next beat for one bar, then returns seamlessly; a second shake mid-burst does nothing.
6. Two batons (camera): both shape different stems independently; both markers + dwell rings render.
7. Touch mode: one pointer reproduces filter / dwell-cycle / shake on one stem.
8. Every audible change has a matching visual change (deaf/HoH check).

If any step fails, return to the owning task; do not mark this step done.

- [ ] **Step 4: Confirm clean tree**

Run: `git status`
Expected: clean (all work committed). No commit needed unless a manual-verification fix was required.

---

## Self-Review

Checked against [../specs/2026-05-15-remix-core-design.md](../specs/2026-05-15-remix-core-design.md):

**Spec coverage:**
- Separate Remix screen + routing — Task 7, 8
- Camera + touch input — Task 8
- Two batons, fixed cycle order `vocals→drums→bass→other` — Task 5 (`STEM_CYCLE_ORDER`), tested
- Build-from-silence — Task 6 (`RemixEngine` initial state), tested
- Y → filter+gain taper, floor = true silence (mute), solo emergent — Task 2 (`remixTaper`), tested
- Dwell → cycle, latch prior stem — Task 5, tested
- Glide-takeover ~250 ms on re-focus — Task 6 (`GLIDE_LERP`), tested
- Fast-shake → one-shot beat-synced stutter, one bar, one-per-stem, ignore mid-burst — Task 3 (`ShakeDetector`) + Task 4 (`computeStutterWindow`) + Task 6 (overlay), tested
- Latch = absence of write — Task 6, tested
- Always-running sources, sample-aligned — Task 6 (`play()` loops sources; overlay never stops main)
- Smoothing so imprecise Y never zippers — Task 6 (`setTargetAtTime`, `SMOOTH_TC`)
- Visual feedback for every audio event incl. silent-start beat pulse — Task 8, 9
- Shared `loadStemBuffers`, SongPresetEngine still green — Task 1, tested
- Looper / saved arrangement / pitch / time-stretch / reverse — explicitly out, no tasks (correct)

**Placeholder scan:** none — every code step has complete code; Task 8's UI step describes concrete wiring against named, already-built APIs (`engine.applyBaton`, `engine.renderFrame`, `engine.getStemStates`, `baton.update`) and an existing reference screen, not "TBD".

**Type consistency:** `StemId`, `STEM_CYCLE_ORDER`, `RemixBatonOutput` defined in Task 5 and consumed unchanged in Task 6/8/9. `RemixStemState` defined in Task 6 and read via `getStemStates()` in Task 8. `StutterWindow`/`computeStutterWindow`/`StutterScheduler` defined in Task 4, consumed in Task 6. `loadStemBuffers` signature defined in Task 1, consumed in Task 6. `remixTaper` signature defined Task 2, consumed Task 6. Consistent throughout.
