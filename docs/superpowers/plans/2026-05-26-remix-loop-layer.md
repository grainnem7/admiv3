# Remix Loop-Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tempo-synced drum-loop layer to the Remix screen: a dedicated loop baton brings a pitch-preservingly time-stretched backing loop in/out, with X selecting among 3–4 curated loops and Y setting volume.

**Architecture:** A new `LoopLayer` (implementing the existing `RemixLayer` interface, kind `'loop'`) owns one `Tone.GrainPlayer` per curated loop, each stretched to song BPM via `playbackRate` and gain-gated so exactly one is audible. All players `sync().start(0)` so they stay phase-locked with the stems. A pure `RemixLoopBaton` maps a calibrated baton centroid to `{present, loopIndex, volume}` with boundary hysteresis. The engine builds the layer from a small `loops.json` manifest (BPM parsed from filenames; no-BPM loops dropped) and routes the baton output to it.

**Tech Stack:** TypeScript (strict), Tone.js v15 (`GrainPlayer`, `Transport`), Web Audio `GainNode`, Vitest + jsdom. Loop audio is git-ignored, local-only.

---

## File structure

**Create:**
- `src/remix/layers/loopManifest.ts` — pure: `LoopDef` type, `parseBpmFromFilename`, `parseLoopManifest`.
- `src/remix/layers/loadLoopManifest.ts` — `loadLoopManifest()`: fetch `loops.json` + parse + drop no-BPM, returns `[]` on any failure.
- `src/remix/layers/LoopLayer.ts` — the `LoopLayer` class (kind `'loop'`).
- `src/remix/RemixLoopBaton.ts` — `selectLoopZone` (pure) + `RemixLoopBaton` mapper + `RemixLoopBatonOutput`.
- `src/__tests__/loopManifest.test.ts`
- `src/__tests__/LoopLayer.test.ts`
- `src/__tests__/RemixLoopBaton.test.ts`
- `public/samples/drums/loops/loops.json` — committed manifest (3–4 entries).
- `public/samples/drums/loops/.gitkeep` — committed; documents folder.

**Modify:**
- `src/remix/layers/RemixLayer.ts` — add `SyncedRemixLayer` interface + `isSyncedLayer` guard.
- `src/remix/RemixEngine.ts` — build `LoopLayer` in `loadSong`; sync in `play`/`stop`; add `selectLoop`, `getLoopInfo`, `applyLoopBaton`.
- `src/remix/remixKeyMap.ts` — add `cycleLoop` action on `L`.
- `src/__tests__/remixKeyMap.test.ts` — cover `cycleLoop`.
- `src/__tests__/RemixEngine.test.ts` — mock `GrainPlayer` + `loadLoopManifest`; cover loop wiring.
- `src/ui/screens/RemixScreen.tsx` — loop baton colour, per-frame routing, facilitator toggle, visual readout, `cycleLoop` key.
- `public/samples/drums/SAMPLE_SOURCES.md` — document the loop manifest + folder.

---

## Task 1: Loop manifest parsing (pure)

**Files:**
- Create: `src/remix/layers/loopManifest.ts`
- Test: `src/__tests__/loopManifest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/loopManifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseBpmFromFilename, parseLoopManifest } from '../remix/layers/loopManifest';

describe('parseBpmFromFilename', () => {
  it('parses "124bpm"', () => {
    expect(parseBpmFromFilename('drumloop_124bpm.wav')).toBe(124);
  });
  it('parses "130 BPM" with space and uppercase', () => {
    expect(parseBpmFromFilename('Ed HiHat1 Loop_130 BPM.wav')).toBe(130);
  });
  it('returns null when no bpm present', () => {
    expect(parseBpmFromFilename('break_unknown.wav')).toBeNull();
  });
});

describe('parseLoopManifest', () => {
  it('keeps entries with parseable bpm and attaches it', () => {
    const out = parseLoopManifest([
      { file: 'drumloop_124bpm.wav', name: 'Boom Bap' },
      { file: 'houseloop_126bpm.wav', name: 'Four-on-the-Floor' },
    ]);
    expect(out).toEqual([
      { file: 'drumloop_124bpm.wav', name: 'Boom Bap', bpm: 124 },
      { file: 'houseloop_126bpm.wav', name: 'Four-on-the-Floor', bpm: 126 },
    ]);
  });
  it('drops entries whose filename has no bpm', () => {
    const out = parseLoopManifest([
      { file: 'good_90bpm.wav', name: 'Half-Time' },
      { file: 'nobpm.wav', name: 'Mystery' },
    ]);
    expect(out).toEqual([{ file: 'good_90bpm.wav', name: 'Half-Time', bpm: 90 }]);
  });
  it('returns [] for non-array / empty input', () => {
    expect(parseLoopManifest(undefined)).toEqual([]);
    expect(parseLoopManifest([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- loopManifest`
Expected: FAIL — `loopManifest` module not found / exports undefined.

- [ ] **Step 3: Write minimal implementation**

Create `src/remix/layers/loopManifest.ts`:

```ts
/**
 * loopManifest — pure helpers for the Remix loop layer's manifest.
 * A loop is only usable if its source BPM is known, and we read the BPM
 * from the filename (e.g. "drumloop_124bpm.wav", "Loop_130 BPM.wav").
 * Loops with no parseable BPM are dropped — they can't be time-stretched
 * to the song tempo correctly.
 */

/** A manifest entry as authored in loops.json (BPM not stored — parsed). */
export interface LoopManifestEntry {
  file: string;
  name: string;
}

/** A usable loop: manifest entry plus its parsed source BPM. */
export interface LoopDef {
  file: string;
  name: string;
  bpm: number;
}

/** Extract a BPM (2–3 digits) from a filename, or null if absent. */
export function parseBpmFromFilename(file: string): number | null {
  const m = /(\d{2,3})\s?bpm/i.exec(file);
  return m ? Number(m[1]) : null;
}

/** Validate + enrich raw manifest entries, dropping any without a BPM. */
export function parseLoopManifest(raw: unknown): LoopDef[] {
  if (!Array.isArray(raw)) return [];
  const out: LoopDef[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry.file !== 'string' || typeof entry.name !== 'string') continue;
    const bpm = parseBpmFromFilename(entry.file);
    if (bpm === null) continue;
    out.push({ file: entry.file, name: entry.name, bpm });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- loopManifest`
Expected: PASS (all cases).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/remix/layers/loopManifest.ts src/__tests__/loopManifest.test.ts
git commit -m "feat(remix): loop manifest BPM-parse + filter"
```

---

## Task 2: Loop-zone selection with hysteresis (pure)

**Files:**
- Create: `src/remix/RemixLoopBaton.ts` (the `selectLoopZone` function only in this task)
- Test: `src/__tests__/RemixLoopBaton.test.ts` (zone cases only in this task)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/RemixLoopBaton.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectLoopZone } from '../remix/RemixLoopBaton';

const H = 0.04;

describe('selectLoopZone', () => {
  it('snaps directly to the zone when current is -1 (uninitialised)', () => {
    expect(selectLoopZone(0.1, 3, -1, H)).toBe(0);
    expect(selectLoopZone(0.5, 3, -1, H)).toBe(1);
    expect(selectLoopZone(0.9, 3, -1, H)).toBe(2);
  });
  it('returns 0 when there is only one loop', () => {
    expect(selectLoopZone(0.9, 1, -1, H)).toBe(0);
  });
  it('switches up only after crossing the boundary by the hysteresis margin', () => {
    // n=3 → boundary between zone 0 and 1 is at 0.333.
    expect(selectLoopZone(0.34, 3, 0, H)).toBe(0); // within margin → stay
    expect(selectLoopZone(0.40, 3, 0, H)).toBe(1); // past boundary+H → switch
  });
  it('does not flip back and forth while drifting on a boundary', () => {
    // current=1, boundary down at 0.333; staying just below it shouldn't drop.
    expect(selectLoopZone(0.32, 3, 1, H)).toBe(1);
    expect(selectLoopZone(0.28, 3, 1, H)).toBe(0); // clearly past → drop
  });
  it('clamps to valid zone range', () => {
    expect(selectLoopZone(1.5, 3, -1, H)).toBe(2);
    expect(selectLoopZone(-0.5, 3, -1, H)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- RemixLoopBaton`
Expected: FAIL — `selectLoopZone` not exported.

- [ ] **Step 3: Write minimal implementation**

Create `src/remix/RemixLoopBaton.ts`:

```ts
/**
 * RemixLoopBaton — maps the loop baton's calibrated centroid to a loop
 * selection + volume. X picks among N equally-wide zones (one per loop)
 * with boundary hysteresis so a drifting hand doesn't flicker between
 * loops; Y is the loop volume; presence brings the layer in/out.
 */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Pick a loop index from a 0–1 X value across `n` equal zones.
 * @param current the previously-selected index, or -1 to snap directly.
 * @param hysteresis margin past a zone boundary required to switch.
 */
export function selectLoopZone(x: number, n: number, current: number, hysteresis: number): number {
  if (n <= 1) return 0;
  const cx = clamp01(x);
  const direct = Math.min(n - 1, Math.max(0, Math.floor(cx * n)));
  if (current < 0 || current > n - 1) return direct;
  const lower = current / n;
  const upper = (current + 1) / n;
  if (cx > upper + hysteresis) return direct;
  if (cx < lower - hysteresis) return direct;
  return current;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- RemixLoopBaton`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/remix/RemixLoopBaton.ts src/__tests__/RemixLoopBaton.test.ts
git commit -m "feat(remix): loop-zone selection with hysteresis"
```

---

## Task 3: RemixLoopBaton mapper (centroid → output)

**Files:**
- Modify: `src/remix/RemixLoopBaton.ts`
- Test: `src/__tests__/RemixLoopBaton.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/RemixLoopBaton.test.ts`:

```ts
import { RemixLoopBaton } from '../remix/RemixLoopBaton';

describe('RemixLoopBaton', () => {
  function make() {
    const b = new RemixLoopBaton();
    b.setLoopCount(3);
    return b;
  }

  it('absent centroid → present:false, latches last index + volume', () => {
    const b = make();
    b.process({ x: 0.9, y: 0.5 }); // present, sets index 2, volume 0.5
    const out = b.process(null);
    expect(out.present).toBe(false);
    expect(out.loopIndex).toBe(2);
    expect(out.volume).toBeCloseTo(0.5, 5);
  });

  it('present centroid → present:true, index from X, volume from Y', () => {
    const b = make();
    const out = b.process({ x: 0.1, y: 0.75 });
    expect(out.present).toBe(true);
    expect(out.loopIndex).toBe(0);
    expect(out.volume).toBeCloseTo(0.75, 5);
  });

  it('applies X calibration to loop selection', () => {
    const b = make();
    // Calibrate X so the player's reachable range is [0.25, 0.75] → maps to 0..1.
    b.setCalibration({ min: 0.25, max: 0.75 }, null);
    // raw x = 0.75 → normalised 1.0 → zone 2 of 3.
    const out = b.process({ x: 0.75, y: 0.5 });
    expect(out.loopIndex).toBe(2);
  });

  it('latches index 0 (not -1) before any present frame', () => {
    const b = make();
    const out = b.process(null);
    expect(out.loopIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- RemixLoopBaton`
Expected: FAIL — `RemixLoopBaton` class not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/remix/RemixLoopBaton.ts` (keep `selectLoopZone` above):

```ts
import { applyAxisCalibration, type AxisRange } from './batonCalibration';

export interface RemixLoopBatonOutput {
  present: boolean;
  loopIndex: number; // 0..count-1; latched when absent
  volume: number;    // 0..1
}

const REACH_MARGIN = 0.1;   // matches the stem batons' forgiving extremes
const ZONE_HYSTERESIS = 0.04;

export interface Centroid {
  x: number;
  y: number;
}

export class RemixLoopBaton {
  private loopCount = 1;
  private xRange: AxisRange | null = null;
  private yRange: AxisRange | null = null;
  private currentIndex = -1;
  private lastVolume = 0;

  setLoopCount(n: number): void {
    this.loopCount = Math.max(1, Math.floor(n));
    if (this.currentIndex > this.loopCount - 1) this.currentIndex = this.loopCount - 1;
  }

  setCalibration(x: AxisRange | null, y: AxisRange | null): void {
    this.xRange = x;
    this.yRange = y;
  }

  process(centroid: Centroid | null): RemixLoopBatonOutput {
    if (!centroid) {
      return {
        present: false,
        loopIndex: Math.max(0, this.currentIndex),
        volume: this.lastVolume,
      };
    }
    const x = applyAxisCalibration(centroid.x, this.xRange, REACH_MARGIN);
    const y = applyAxisCalibration(centroid.y, this.yRange, REACH_MARGIN);
    this.currentIndex = selectLoopZone(x, this.loopCount, this.currentIndex, ZONE_HYSTERESIS);
    this.lastVolume = y;
    return { present: true, loopIndex: this.currentIndex, volume: y };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- RemixLoopBaton`
Expected: PASS (zone + mapper blocks).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/remix/RemixLoopBaton.ts src/__tests__/RemixLoopBaton.test.ts
git commit -m "feat(remix): RemixLoopBaton centroid mapper"
```

---

## Task 4: SyncedRemixLayer interface

**Files:**
- Modify: `src/remix/layers/RemixLayer.ts`

- [ ] **Step 1: Add the interface + guard**

Append to `src/remix/layers/RemixLayer.ts` (after the existing `RemixLayer` interface):

```ts
/**
 * A RemixLayer that runs a continuous source synced to the transport
 * (vs. a trigger layer like percussion). The engine aligns these at
 * transport time 0 on a fresh play, and stops them on stop.
 */
export interface SyncedRemixLayer extends RemixLayer {
  syncStart(): void;
  syncStop(): void;
}

/** True when a layer participates in transport sync. */
export function isSyncedLayer(l: RemixLayer): l is SyncedRemixLayer {
  return (
    typeof (l as Partial<SyncedRemixLayer>).syncStart === 'function' &&
    typeof (l as Partial<SyncedRemixLayer>).syncStop === 'function'
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors (no consumers yet — type-only addition).

- [ ] **Step 3: Commit**

```bash
git add src/remix/layers/RemixLayer.ts
git commit -m "feat(remix): SyncedRemixLayer interface + guard"
```

---

## Task 5: LoopLayer

**Files:**
- Create: `src/remix/layers/LoopLayer.ts`
- Test: `src/__tests__/LoopLayer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/LoopLayer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture each GrainPlayer instance so we can assert per-loop state.
const grainInstances: Array<Record<string, unknown>> = [];
vi.mock('tone', () => ({
  GrainPlayer: vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    const inst = {
      playbackRate: 1,
      loop: false,
      connect: vi.fn(),
      sync: vi.fn().mockReturnThis(),
      start: vi.fn().mockReturnThis(),
      unsync: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      dispose: vi.fn(),
    };
    grainInstances.push(inst);
    return inst;
  }),
}));

import { LoopLayer } from '../remix/layers/LoopLayer';
import type { LoopDef } from '../remix/layers/loopManifest';

const gains: Array<{ gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> } }> = [];
function fakeGain() {
  const g = { value: 0, setTargetAtTime: vi.fn((v: number) => { g.value = v; }) };
  const node = { connect: vi.fn(), disconnect: vi.fn(), gain: g };
  gains.push(node as unknown as { gain: typeof g });
  return node;
}
function fakeCtx(): AudioContext {
  return { currentTime: 0, createGain: vi.fn(() => fakeGain()) } as unknown as AudioContext;
}

const LOOPS: LoopDef[] = [
  { file: 'a_120bpm.wav', name: 'A', bpm: 120 },
  { file: 'b_140bpm.wav', name: 'B', bpm: 140 },
];

beforeEach(() => {
  grainInstances.length = 0;
  gains.length = 0;
  vi.clearAllMocks();
});

describe('LoopLayer', () => {
  it('has id "loop" and kind "loop"', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(l.id).toBe('loop');
    expect(l.kind).toBe('loop');
  });

  it('sets playbackRate = songBpm / loopBpm per loop', () => {
    new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(grainInstances[0].playbackRate).toBeCloseTo(1.0, 5);   // 120/120
    expect(grainInstances[1].playbackRate).toBeCloseTo(120 / 140, 5);
  });

  it('isReady() true once all players loaded', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(l.isReady()).toBe(true);
  });

  it('getLoopCount / getLoopName / getActiveLoopIndex', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(l.getLoopCount()).toBe(2);
    expect(l.getLoopName(1)).toBe('B');
    expect(l.getActiveLoopIndex()).toBe(0); // first loop active by default
  });

  it('selectLoop gates exactly one sub-gain on, others off', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    // gains[0] = layer gain; gains[1..] = per-loop sub-gains in order.
    l.selectLoop(1);
    expect(l.getActiveLoopIndex()).toBe(1);
    expect(gains[1].gain.value).toBeCloseTo(0, 5); // loop 0 sub-gain off
    expect(gains[2].gain.value).toBeCloseTo(1, 5); // loop 1 sub-gain on
  });

  it('disabled layer is silent; setVolume applies when enabled', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    expect(gains[0].gain.value).toBeCloseTo(0, 5); // layer gain starts at 0
    l.setVolume(0.7);
    expect(gains[0].gain.value).toBeCloseTo(0, 5); // still disabled
    l.setEnabled(true);
    expect(gains[0].gain.value).toBeCloseTo(0.7, 5);
    l.setEnabled(false);
    expect(gains[0].gain.value).toBeCloseTo(0, 5);
  });

  it('syncStart starts every player at 0; syncStop stops them', () => {
    const l = new LoopLayer(fakeCtx(), LOOPS, 120);
    l.syncStart();
    for (const g of grainInstances) {
      expect(g.start).toHaveBeenCalledWith(0);
      expect(g.loop).toBe(true);
    }
    l.syncStop();
    for (const g of grainInstances) expect(g.stop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- LoopLayer`
Expected: FAIL — `LoopLayer` module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/remix/layers/LoopLayer.ts`:

```ts
/**
 * LoopLayer — a RemixLayer of kind 'loop'. Owns one Tone.GrainPlayer per
 * curated loop, each pitch-preservingly time-stretched to the song BPM
 * (playbackRate = songBpm / loopBpm) and looping its whole-bar buffer.
 * All players sync().start(0) so they stay phase-locked with the stems;
 * exactly one loop is audible at a time via per-loop sub-gains. Loop
 * audio is placed by the human (git-ignored, see SAMPLE_SOURCES.md);
 * until loaded, the layer no-ops gracefully.
 */

import * as Tone from 'tone';
import type { RemixLayer, SyncedRemixLayer } from './RemixLayer';
import type { LoopDef } from './loopManifest';

const SWITCH_TC = 0.03; // ~30ms crossfade when switching loops

interface LoopVoice {
  player: Tone.GrainPlayer;
  sub: GainNode;
}

export class LoopLayer implements SyncedRemixLayer {
  readonly id = 'loop';
  readonly kind = 'loop' as const;

  private ctx: AudioContext;
  private layerGain: GainNode;
  private voices: LoopVoice[] = [];
  private defs: LoopDef[];
  private enabled = false;
  private volume = 0.8;
  private activeIndex = 0;
  private loaded = 0;
  private ready = false;

  constructor(ctx: AudioContext, loops: LoopDef[], songBpm: number) {
    this.ctx = ctx;
    this.defs = loops;
    this.layerGain = ctx.createGain();
    this.layerGain.gain.value = 0; // disabled → silent

    loops.forEach((def, i) => {
      const sub = ctx.createGain();
      sub.gain.value = i === 0 ? 1 : 0; // first loop active by default
      sub.connect(this.layerGain);
      const player = new Tone.GrainPlayer({
        url: `samples/drums/loops/${def.file}`,
        loop: true,
        onload: () => {
          this.loaded += 1;
          if (this.loaded >= loops.length) this.ready = true;
        },
      });
      player.playbackRate = songBpm / def.bpm; // GrainPlayer preserves pitch
      player.connect(sub);
      this.voices.push({ player, sub });
    });

    if (loops.length === 0) this.ready = true; // empty layer is trivially "ready"
  }

  connect(dest: AudioNode): void {
    this.layerGain.connect(dest);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.layerGain.gain.value = on ? this.volume : 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.enabled) this.layerGain.gain.value = this.volume;
  }

  isReady(): boolean {
    return this.ready;
  }

  getLoopCount(): number {
    return this.defs.length;
  }

  getLoopName(i: number): string {
    return this.defs[i]?.name ?? '';
  }

  getActiveLoopIndex(): number {
    return this.activeIndex;
  }

  /** Make loop `i` the single audible loop (short crossfade). No-op if out of range. */
  selectLoop(i: number): void {
    if (i < 0 || i >= this.voices.length || i === this.activeIndex) return;
    const now = this.ctx.currentTime;
    this.voices.forEach((v, idx) => {
      v.sub.gain.setTargetAtTime(idx === i ? 1 : 0, now, SWITCH_TC);
    });
    this.activeIndex = i;
  }

  syncStart(): void {
    for (const v of this.voices) {
      v.player.loop = true;
      v.player.unsync().sync().start(0);
    }
  }

  syncStop(): void {
    for (const v of this.voices) {
      try { v.player.unsync().stop(); } catch { /* not started */ }
    }
  }

  dispose(): void {
    for (const v of this.voices) {
      v.player.dispose();
      v.sub.disconnect();
    }
    this.voices = [];
    this.layerGain.disconnect();
    this.ready = false;
  }
}
```

Note for the implementer: the test's `setTargetAtTime` mock writes the target straight to `.value`, so `selectLoop`'s crossfade is observable as a final value in tests. In real Web Audio the crossfade ramps over `SWITCH_TC`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- LoopLayer`
Expected: PASS (all cases).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/remix/layers/LoopLayer.ts src/__tests__/LoopLayer.test.ts
git commit -m "feat(remix): LoopLayer with per-loop GrainPlayer + gain-gating"
```

---

## Task 6: Loop manifest loader

**Files:**
- Create: `src/remix/layers/loadLoopManifest.ts`
- Test: extend `src/__tests__/loopManifest.test.ts` with a loader block

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/loopManifest.test.ts`:

```ts
import { loadLoopManifest } from '../remix/layers/loadLoopManifest';
import { vi, beforeEach, afterEach } from 'vitest';

describe('loadLoopManifest', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('fetches loops.json, parses bpm, drops no-bpm entries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { file: 'a_120bpm.wav', name: 'A' },
        { file: 'nobpm.wav', name: 'B' },
      ],
    }) as unknown as typeof fetch;
    const loops = await loadLoopManifest();
    expect(loops).toEqual([{ file: 'a_120bpm.wav', name: 'A', bpm: 120 }]);
  });

  it('returns [] when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('404')) as unknown as typeof fetch;
    expect(await loadLoopManifest()).toEqual([]);
  });

  it('returns [] when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await loadLoopManifest()).toEqual([]);
  });
});
```

(The `import { vi, beforeEach, afterEach }` line is additive — if `vi` is already imported at the top of the file, merge the names into the existing import instead of duplicating.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- loopManifest`
Expected: FAIL — `loadLoopManifest` module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/remix/layers/loadLoopManifest.ts`:

```ts
/**
 * loadLoopManifest — fetch the curated loop manifest from
 * public/samples/drums/loops/loops.json and return only the loops whose
 * filename encodes a BPM. Any failure (missing file, bad JSON) yields an
 * empty list so the loop layer simply doesn't appear — never an error.
 */

import { parseLoopManifest, type LoopDef } from './loopManifest';

const MANIFEST_URL = 'samples/drums/loops/loops.json';

export async function loadLoopManifest(): Promise<LoopDef[]> {
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) return [];
    return parseLoopManifest(await res.json());
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- loopManifest`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/remix/layers/loadLoopManifest.ts src/__tests__/loopManifest.test.ts
git commit -m "feat(remix): loop manifest loader"
```

---

## Task 7: Engine wiring

**Files:**
- Modify: `src/remix/RemixEngine.ts`
- Test: `src/__tests__/RemixEngine.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/RemixEngine.test.ts`, first extend the `tone` mock factory (inside `vi.mock('tone', ...)`'s returned object) to add a `GrainPlayer`, mirroring the existing `Player` mock:

```ts
    GrainPlayer: vi.fn().mockImplementation((opts: { onload?: () => void }) => {
      opts?.onload?.();
      return {
        playbackRate: 1,
        loop: false,
        sync: vi.fn().mockReturnThis(),
        start: vi.fn().mockReturnThis(),
        stop: vi.fn().mockReturnThis(),
        unsync: vi.fn().mockReturnThis(),
        connect: vi.fn(),
        dispose: vi.fn(),
      };
    }),
```

Then add a mock for the manifest loader near the top of the file (after the `vi.mock('tone', ...)` block):

```ts
vi.mock('../remix/layers/loadLoopManifest', () => ({
  loadLoopManifest: vi.fn().mockResolvedValue([
    { file: 'a_120bpm.wav', name: 'A', bpm: 120 },
    { file: 'b_140bpm.wav', name: 'B', bpm: 140 },
  ]),
}));
```

Then add a test block (use the existing helper that builds + loads an engine — mirror whatever the file already uses to call `loadSong`; the snippet below assumes a `makeEngine()`/`loadSong` pattern already present, adapt to the file's existing setup):

```ts
describe('RemixEngine loop layer', () => {
  it('builds a loop layer from the manifest after loadSong', async () => {
    const engine = new RemixEngine();
    await engine.loadSong(TEST_SONG); // reuse the file's existing test song fixture
    const info = engine.getLoopInfo();
    expect(info.count).toBe(2);
    expect(info.names).toEqual(['A', 'B']);
    expect(info.activeIndex).toBe(0);
  });

  it('applyLoopBaton enables + selects + sets volume when present', async () => {
    const engine = new RemixEngine();
    await engine.loadSong(TEST_SONG);
    engine.applyLoopBaton({ present: true, loopIndex: 1, volume: 0.5 });
    expect(engine.getLoopInfo().activeIndex).toBe(1);
    expect(engine.getLayer('loop')?.isEnabled()).toBe(true);
  });

  it('applyLoopBaton disables the layer when absent', async () => {
    const engine = new RemixEngine();
    await engine.loadSong(TEST_SONG);
    engine.applyLoopBaton({ present: true, loopIndex: 1, volume: 0.5 });
    engine.applyLoopBaton({ present: false, loopIndex: 1, volume: 0.5 });
    expect(engine.getLayer('loop')?.isEnabled()).toBe(false);
  });
});
```

If the file has no shared `TEST_SONG`, reuse the exact song object the existing `loadSong` tests pass.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- RemixEngine`
Expected: FAIL — `getLoopInfo` / `applyLoopBaton` not defined.

- [ ] **Step 3: Add imports**

In `src/remix/RemixEngine.ts`, add to the import block (near the existing layer imports at lines 22–23):

```ts
import { isSyncedLayer } from './layers/RemixLayer';
import { LoopLayer } from './layers/LoopLayer';
import { loadLoopManifest } from './layers/loadLoopManifest';
import type { RemixLoopBatonOutput } from './RemixLoopBaton';
```

- [ ] **Step 4: Build the loop layer in `loadSong`**

In `loadSong`, immediately after the percussion layer block (after `this.layers.set(percussion.id, percussion);`, currently line 129) and before the `this.loopOriginBar = 0;` line, insert:

```ts
    const loopDefs = await loadLoopManifest();
    if (loopDefs.length > 0) {
      const loop = new LoopLayer(this.ctx, loopDefs, song.bpm);
      loop.connect(this.layersBus);
      loop.setEnabled(false); // opt-in, brought in by the loop baton
      this.layers.set(loop.id, loop);
    }
```

- [ ] **Step 5: Sync synced layers in `play` and `stop`**

In `play()`, inside the `if (!resuming) { ... }` block, after the stem loop that syncs `n.player`, add:

```ts
      for (const l of this.layers.values()) {
        if (isSyncedLayer(l)) l.syncStart();
      }
```

In `stop()`, after the stem stop loop (after the `for (const n of this.nodes) { ... }` block), add:

```ts
    for (const l of this.layers.values()) {
      if (isSyncedLayer(l)) l.syncStop();
    }
```

- [ ] **Step 6: Add the pass-through methods**

In `src/remix/RemixEngine.ts`, after `setLayerVolume` (currently line 306), add:

```ts
  /** Make loop `i` the single audible loop. No-op if there's no loop layer. */
  selectLoop(i: number): void {
    const l = this.layers.get('loop');
    if (l instanceof LoopLayer) l.selectLoop(i);
  }

  /** Loop-layer summary for the UI. count 0 when there's no loop layer. */
  getLoopInfo(): { count: number; activeIndex: number; names: string[] } {
    const l = this.layers.get('loop');
    if (!(l instanceof LoopLayer)) return { count: 0, activeIndex: 0, names: [] };
    const names: string[] = [];
    for (let i = 0; i < l.getLoopCount(); i++) names.push(l.getLoopName(i));
    return { count: l.getLoopCount(), activeIndex: l.getActiveLoopIndex(), names };
  }

  /** Route the loop baton's per-frame output to the loop layer. */
  applyLoopBaton(out: RemixLoopBatonOutput): void {
    this.setLayerEnabled('loop', out.present);
    if (out.present) {
      this.selectLoop(out.loopIndex);
      this.setLayerVolume('loop', out.volume);
    }
  }
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test:run -- RemixEngine`
Expected: PASS (including pre-existing tests).

- [ ] **Step 8: Run the full suite + lint**

Run: `npm run test:run`
Expected: all green.
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): wire loop layer into engine (build, sync, baton route)"
```

---

## Task 8: Keyboard cycle-loop action

**Files:**
- Modify: `src/remix/remixKeyMap.ts`
- Test: `src/__tests__/remixKeyMap.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/remixKeyMap.test.ts` (mirror the existing test style in that file):

```ts
  it('maps L (either case) to cycleLoop', () => {
    expect(keyToRemixAction('l')).toEqual({ kind: 'cycleLoop' });
    expect(keyToRemixAction('L')).toEqual({ kind: 'cycleLoop' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- remixKeyMap`
Expected: FAIL — `cycleLoop` not produced.

- [ ] **Step 3: Implement**

In `src/remix/remixKeyMap.ts`, add `cycleLoop` to the union:

```ts
  | { kind: 'cycleLoop' }
```

and add the case in `keyToRemixAction` (before `default`):

```ts
    case 'l':
    case 'L': return { kind: 'cycleLoop' };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- remixKeyMap`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/remix/remixKeyMap.ts src/__tests__/remixKeyMap.test.ts
git commit -m "feat(remix): keyboard L cycles the active loop"
```

---

## Task 9: RemixScreen UI wiring

**Files:**
- Modify: `src/ui/screens/RemixScreen.tsx`

This task has no unit test (UI integration); correctness is verified by `npm run lint`, the now-passing `cycleLoop` keymap test, and manual browser check. Follow the screen's existing patterns: the per-stem baton colour handling, the `percussionEnabledRef`/`percussionVolumeRef` refs, the facilitator trigger panel, and the keyboard handler that consumes `keyToRemixAction`.

- [ ] **Step 1: Read the screen to find the insertion points**

Run (read the file): open `src/ui/screens/RemixScreen.tsx`. Identify:
- where baton colours are declared / tracked (stem batons),
- the per-frame tracking callback where centroids are produced and `engine.applyBaton(...)` is called,
- the facilitator panel JSX (percussion toggle),
- the keyboard handler `switch`/dispatch over `keyToRemixAction`,
- the `handleSelectSong`/song-load effect that re-applies percussion state via refs.

- [ ] **Step 2: Add the loop baton + refs**

Near the existing baton colour setup, add a loop-baton colour distinct from the four stem colours and percussion (pick an unused tracker colour already supported by the ColorTracker; if all are taken, reuse the head-nod/face path's spare colour — choose whichever the screen's tracker config exposes). Add:

```tsx
import { RemixLoopBaton, type Centroid } from '../../remix/RemixLoopBaton';
```

```tsx
const loopBatonRef = useRef(new RemixLoopBaton());
const loopInfoRef = useRef<{ count: number; activeIndex: number; names: string[] }>({
  count: 0, activeIndex: 0, names: [],
});
const [loopInfo, setLoopInfo] = useState<{ count: number; activeIndex: number; names: string[] }>({
  count: 0, activeIndex: 0, names: [],
});
const [loopPresent, setLoopPresent] = useState(false);
```

- [ ] **Step 3: Initialise loop baton count after song load**

In the song-load path (where percussion state is re-applied after `engine.loadSong`), add:

```tsx
const info = engineRef.current.getLoopInfo();
loopBatonRef.current.setLoopCount(Math.max(1, info.count));
loopInfoRef.current = info;
setLoopInfo(info);
```

- [ ] **Step 4: Route the loop baton each frame**

In the per-frame tracking callback, locate the loop-baton colour's centroid (the tracker reports a centroid per tracked colour; `null` when not visible). Convert it to a `Centroid | null` (the same `{x, y}` normalisation used for stem batons), then:

```tsx
const loopCentroid: Centroid | null = loopBlob ? { x: loopBlob.x, y: loopBlob.y } : null;
const loopOut = loopBatonRef.current.process(loopCentroid);
engineRef.current.applyLoopBaton(loopOut);
if (loopOut.present !== loopPresentRef.current) {
  loopPresentRef.current = loopOut.present;
  setLoopPresent(loopOut.present);
}
if (loopOut.present && loopOut.loopIndex !== loopInfoRef.current.activeIndex) {
  const next = { ...loopInfoRef.current, activeIndex: loopOut.loopIndex };
  loopInfoRef.current = next;
  setLoopInfo(next);
}
```

Add the supporting ref alongside the other refs:

```tsx
const loopPresentRef = useRef(false);
```

`loopBlob` is whatever the tracker callback already names the per-colour result for the loop colour — match the existing stem-baton destructuring. If calibration is captured for batons, feed the loop baton's calibrated ranges via `loopBatonRef.current.setCalibration(xRange, yRange)` in the same place stem calibration is applied.

- [ ] **Step 5: Facilitator panel control + visual readout**

In the facilitator trigger panel JSX, next to the percussion toggle, add a loop control (only render when `loopInfo.count > 0`):

```tsx
{loopInfo.count > 0 && (
  <div className="facilitator-row">
    <span>Loop layer</span>
    <span aria-live="polite">
      {loopPresent ? `▶ ${loopInfo.names[loopInfo.activeIndex] ?? ''}` : 'off'}
    </span>
  </div>
)}
```

This is the deaf/HoH visual feedback for the loop layer (active loop name + in/out state). Match the existing panel's class names and markup conventions rather than the placeholder class above.

- [ ] **Step 6: Handle the cycleLoop key**

In the keyboard dispatch over `keyToRemixAction(...)`, add a case:

```tsx
case 'cycleLoop': {
  const info = engineRef.current.getLoopInfo();
  if (info.count > 0) {
    const next = (info.activeIndex + 1) % info.count;
    engineRef.current.selectLoop(next);
    loopBatonRef.current.setLoopCount(info.count);
    const updated = { ...info, activeIndex: next };
    loopInfoRef.current = updated;
    setLoopInfo(updated);
    // keyboard test mode brings the loop layer in so you can hear it
    engineRef.current.setLayerEnabled('loop', true);
    setLoopPresent(true);
    loopPresentRef.current = true;
  }
  break;
}
```

- [ ] **Step 7: Lint + full test suite**

Run: `npm run lint`
Expected: no errors (no unused vars/imports — strict mode).
Run: `npm run test:run`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): loop baton + facilitator readout + keyboard cycle in RemixScreen"
```

---

## Task 10: Manifest data + docs

**Files:**
- Create: `public/samples/drums/loops/loops.json`
- Create: `public/samples/drums/loops/.gitkeep`
- Modify: `public/samples/drums/SAMPLE_SOURCES.md`

- [ ] **Step 1: Create the loops folder placeholder**

Create `public/samples/drums/loops/.gitkeep`:

```
# Place curated drum LOOP WAVs here (git-ignored, like the one-shots).
# Each filename MUST encode its source BPM, e.g. "drumloop_124bpm.wav",
# so the loop layer can time-stretch it to the song tempo. Loops without
# a parseable BPM are dropped. The chosen files are listed in loops.json.
# See ../SAMPLE_SOURCES.md.
```

- [ ] **Step 2: Create the manifest**

Create `public/samples/drums/loops/loops.json` listing the curated 3–4 loops the user has staged locally. Use the actual filenames present in `public/samples/drums/` (the LANDR loops whose names contain a BPM). Example shape (replace `file` values with real local filenames that contain a BPM):

```json
[
  { "file": "drumloop_124bpm.wav", "name": "Boom Bap" },
  { "file": "houseloop_126bpm.wav", "name": "Four-on-the-Floor" },
  { "file": "break_90bpm.wav", "name": "Half-Time Break" }
]
```

Note for the implementer: list `git status --porcelain --ignored public/samples/drums/` (or read the folder) to find the real loop filenames containing a BPM, prefer 3–4 whose BPM is close to the demo song's tempo (minimises GrainPlayer transient smear), and put those exact filenames in `file`. The JSON itself is committed; the WAVs stay git-ignored.

- [ ] **Step 3: Document in SAMPLE_SOURCES.md**

In `public/samples/drums/SAMPLE_SOURCES.md`, replace the existing "Drum LOOPS (for the future loop-layer feature)" section with:

```markdown
## Drum LOOPS (loop-layer feature)
The longer loop/break files are used by the tempo-synced **loop layer**
(`src/remix/layers/LoopLayer.ts`). The loop baton brings one of a curated set in
and out under the song; each loop is pitch-preservingly time-stretched to the
song BPM.

- The curated set is listed in `loops/loops.json` (committed): `{ "file", "name" }`
  per loop. The WAVs go in `loops/` and stay **git-ignored**.
- Each loop's **filename must contain its source BPM** (e.g. `drumloop_124bpm.wav`,
  `Loop_130 BPM.wav`). BPM is parsed from the filename; a loop with no parseable
  BPM is dropped.
- Curate loops whose BPM is **close to the song's tempo** — `GrainPlayer` granular
  stretch smears drum transients when the stretch ratio is far from 1.
- Same licensing/deployment caveat as the one-shots: deployment needs a
  redistributable (CC0) loop set.
```

- [ ] **Step 4: Verify the manifest is committable and WAVs are not**

Run: `git status --porcelain public/samples/drums/loops/`
Expected: `loops.json` and `.gitkeep` show as untracked/added; no `.wav` files appear (they're caught by `public/samples/drums/.gitignore`).

- [ ] **Step 5: Commit**

```bash
git add public/samples/drums/loops/loops.json public/samples/drums/loops/.gitkeep public/samples/drums/SAMPLE_SOURCES.md
git commit -m "docs(remix): loop manifest + loop-layer sample docs"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npm run test:run`
Expected: all green, including the new loop tests.

- [ ] **Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Manual browser check (human-in-the-loop)**

With loop WAVs present locally:
1. Open the Remix screen, load a song, press space to play.
2. Press `L` to cycle loops — confirm the active loop name updates, the loop is audible, in time, and pitch-correct.
3. Bring the loop baton colour into frame — confirm the layer comes in; move X across the frame to switch loops (no flicker on a steady hand near a boundary); move Y to change volume; remove the baton to bring the layer out.
4. Confirm the facilitator panel shows the active loop name + in/out state.
5. With loop WAVs **absent**, confirm the loop layer simply doesn't appear and nothing errors.
```
