# Remix Layer Framework + Percussion (remove stutter) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the stutter mechanism from Remix and replace it with a reusable added-sound Layer framework whose first member is a percussion layer — high-quality sampled drum one-shots fired by head-nod (beat-aware), shake, and the keyboard `S` key.

**Architecture:** Delete `StutterScheduler` and all stutter code from `RemixEngine`/`RemixBaton`/`RemixScreen`. Add a `RemixLayer` interface + a `layersBus` in `RemixEngine` (parallel to the stem path). A `DrumKit` loads CC0 drum WAVs as `Tone.Player`s; a `PercussionLayer` implements `RemixLayer` and picks the beat-appropriate drum via the existing `pickHeadBopDrum`. The freed head-nod / shake / `S` gestures route to `engine.triggerPercussion(...)`.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Tone.js v15, Vitest + jsdom. Bundled CC0/CC-BY drum WAVs (human-placed). No new npm deps.

**Spec:** [../specs/2026-05-26-remix-percussion-layer-design.md](../specs/2026-05-26-remix-percussion-layer-design.md)

---

## File Map

| Path | New / Modified | Responsibility |
|---|---|---|
| `src/remix/StutterScheduler.ts` | **Delete** | (removed — stutter gone) |
| `src/__tests__/StutterScheduler.test.ts` | **Delete** | (removed) |
| `src/remix/RemixEngine.ts` | Modified | Remove all stutter code; add `layersBus`, layer map + API, `triggerPercussion`, percussion-on-load, layer dispose. |
| `src/remix/RemixBaton.ts` | Modified | Rename `RemixBatonOutput.stutter` → `shake` (the gesture stays; consumer changes). |
| `src/remix/remixKeyMap.ts` | Modified | Rename the `S` action `{kind:'stutter'}` → `{kind:'percussion'}`. |
| `src/remix/layers/RemixLayer.ts` | New | The `RemixLayer` interface + `RemixLayerKind`. |
| `src/remix/layers/DrumKit.ts` | New | Loads 4 drum WAVs as `Tone.Player`s; `play(drum, velocity)`. |
| `src/remix/layers/PercussionLayer.ts` | New | `RemixLayer` of kind `'percussion'`; owns a `DrumKit`; `hit(timeSec, velocity)` via `pickHeadBopDrum`. |
| `public/samples/drums/default/` | New (assets) | `kick.wav`, `snare.wav`, `hat.wav`, `crash.wav` (human-placed CC0/CC-BY). |
| `public/samples/drums/SAMPLE_SOURCES.md` | New | Kit source + licence + placement instructions. |
| `src/ui/screens/RemixScreen.tsx` | Modified | Remove stutter UI; route head-nod/shake/`S` → `triggerPercussion`; "Add percussion" enable + volume; drum-name flash. |
| `src/__tests__/DrumKit.test.ts` | New | Kit load + play + dispose (Tone mocked). |
| `src/__tests__/PercussionLayer.test.ts` | New | Enable/volume/beat-aware hit. |
| `src/__tests__/RemixEngine.test.ts` | Modified | Remove stutter tests; add layer + percussion tests. |
| `src/__tests__/RemixBaton.test.ts` | Modified | `stutter`→`shake` rename. |
| `src/__tests__/remixKeyMap.test.ts` | Modified | `S` → `percussion`. |

`HeadBopKit.ts` (the synth kit + `pickHeadBopDrum` + `HeadBopDrum` type) is **kept untouched** — Song Preset still uses it; Remix reuses only `pickHeadBopDrum` and the `HeadBopDrum` type.

Dependency order: rename helpers (1–3) → remove stutter from engine (4) → layer framework + drum infra (5–7) → engine wiring (8) → screen (9) → samples doc/assets (10) → verification (11).

---

## Task 1: Rename `RemixBatonOutput.stutter` → `shake`

**Files:** Modify `src/remix/RemixBaton.ts`, `src/__tests__/RemixBaton.test.ts`.

- [ ] **Step 1: Update the failing test**

In `src/__tests__/RemixBaton.test.ts`, find the test that asserts a fast move sets `stutter` (the one named like "fires a stutter on a fast move and not on a dwell"). Rename its assertions from `.stutter` to `.shake` and rename the test to "fires a shake on a fast move and not on a dwell". For example the fast-move assertion becomes:

```ts
    const out = b.update({ x: 0.9, y: 0.5, found: true }, 16);
    expect(out.shake).toBe(true);
```
and the still-hold assertion's `anyStutter` becomes `anyShake` checking `.shake`.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixBaton.test.ts`
Expected: FAIL — `out.shake` is `undefined` (field is still named `stutter`).

- [ ] **Step 3: Rename the field**

In `src/remix/RemixBaton.ts`:
- In the `RemixBatonOutput` interface, rename `stutter: boolean` to `shake: boolean` (keep the doc comment, update it to "True only on the frame a shake gesture fired.").
- In `update()`, the local that holds the shake-detector result is currently assigned to the returned `stutter`; rename the returned property to `shake` (e.g. `const shake = this.shake.update(...)` then `return { ..., shake, ... }`). Update both the `!found` early-return object (`stutter: false` → `shake: false`) and the main return.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixBaton.test.ts`
Expected: PASS (all existing RemixBaton tests, with the renamed field).

- [ ] **Step 5: Commit**

```bash
git add src/remix/RemixBaton.ts src/__tests__/RemixBaton.test.ts
git commit -m "refactor(remix): rename baton output stutter→shake (gesture kept, stutter going)"
```

Note: this will leave `RemixEngine.applyBaton` and `RemixScreen` referencing `out.stutter` — they're updated in Tasks 4 and 9. The full suite may not be green until then; that's expected mid-rename. Run only the targeted test here.

---

## Task 2: Rename `remixKeyMap` `stutter` action → `percussion`

**Files:** Modify `src/remix/remixKeyMap.ts`, `src/__tests__/remixKeyMap.test.ts`.

- [ ] **Step 1: Update the failing test**

In `src/__tests__/remixKeyMap.test.ts`, change the `S`/`s` expectations from `{ kind: 'stutter' }` to `{ kind: 'percussion' }`:

```ts
    expect(keyToRemixAction('s')).toEqual({ kind: 'percussion' });
    expect(keyToRemixAction('S')).toEqual({ kind: 'percussion' });
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/remixKeyMap.test.ts`
Expected: FAIL — still returns `{ kind: 'stutter' }`.

- [ ] **Step 3: Rename in the map**

In `src/remix/remixKeyMap.ts`: in the `RemixKeyAction` union replace `| { kind: 'stutter' }` with `| { kind: 'percussion' }`; in `keyToRemixAction`, change the `'s'`/`'S'` cases to `return { kind: 'percussion' };`.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/remixKeyMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/remix/remixKeyMap.ts src/__tests__/remixKeyMap.test.ts
git commit -m "refactor(remix): keyboard S action stutter→percussion"
```

Note: `RemixScreen`'s key handler still has a `'stutter'` arm — updated in Task 9. Targeted test only here.

---

## Task 3: `RemixLayer` interface

**Files:** Create `src/remix/layers/RemixLayer.ts`. (Type-only — no test; consumed by Tasks 6–7.)

- [ ] **Step 1: Create the interface**

Create `src/remix/layers/RemixLayer.ts`:

```ts
/**
 * RemixLayer — a sound source layered alongside the 4 stems on the Remix
 * screen (percussion, instrument, loop, pad). Each layer mixes into the
 * engine's layersBus with its own enable + volume. Trigger-type layers
 * (percussion) add their own trigger method; continuous layers add theirs.
 * The base interface is lifecycle + mix only.
 */
export type RemixLayerKind = 'percussion' | 'instrument' | 'loop' | 'pad';

export interface RemixLayer {
  readonly id: string;
  readonly kind: RemixLayerKind;
  /** Wire this layer's output into the engine's layers bus. */
  connect(dest: AudioNode): void;
  /** Bring the layer into / out of the mix. */
  setEnabled(on: boolean): void;
  /** The layer's own level, 0–1. */
  setVolume(v: number): void;
  /** True once the layer's samples are loaded and it can play. */
  isReady(): boolean;
  dispose(): void;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no new diagnostics (only the 12 pre-existing `src/__tests__/setup.ts` errors).

- [ ] **Step 3: Commit**

```bash
git add src/remix/layers/RemixLayer.ts
git commit -m "feat(remix): RemixLayer interface (added-sound layer framework)"
```

---

## Task 4: Remove stutter from `RemixEngine`

**Files:** Modify `src/remix/RemixEngine.ts`, `src/__tests__/RemixEngine.test.ts`. Delete `src/remix/StutterScheduler.ts`, `src/__tests__/StutterScheduler.test.ts`.

- [ ] **Step 1: Delete the stutter tests + scheduler tests**

In `src/__tests__/RemixEngine.test.ts`, delete the stutter-specific tests: the ones named (approximately) "ducks the main stem gain to 0 while a stutter burst owns the sound", "restores the stem gain after a stutter burst ends", "clamps a stutter burst end to the loop end", and "ends a stutter burst when the transport loops back past the burst start". Also delete `src/remix/StutterScheduler.ts` and `src/__tests__/StutterScheduler.test.ts`:

```bash
git rm src/remix/StutterScheduler.ts src/__tests__/StutterScheduler.test.ts
```

- [ ] **Step 2: Strip stutter code from RemixEngine**

In `src/remix/RemixEngine.ts`:
- Remove the import of `StutterScheduler` / `computeStutterWindow` / `StutterWindow`.
- In `RemixStemState`, remove the `stuttering` field → `{ filterNorm: number; targetFilterNorm: number; gain: number }`.
- In the `StemNodes` interface, remove `stutterSource`, `scheduler`, `pendingWindow`.
- In `loadSong`, where each stem's `StemNodes` is created, remove the `stutterSource: null`, `scheduler: new StutterScheduler()`, `pendingWindow: null` entries.
- Delete the methods `triggerStutter`, `triggerStutterFor`, `startOverlay`, `stopOverlay`.
- In `renderFrame`, remove the entire `if (n.pendingWindow) { ... }` block (the seam-clamp + wrap-end logic) and any reference to `state.stuttering`. The remaining `renderFrame` keeps the glide + `remixTaper` + gain/filter writes.
- Remove the `WRAP_EPSILON` constant (only the wrap-end used it).
- Remove `shakeStutterEnabled` field + `setShakeStutterEnabled` method.
- In `applyBaton`, remove the `if (out.stutter ...) this.triggerStutter(...)` line. (`applyBaton` no longer references stutter; with the Task 1 rename the field is `out.shake` and `applyBaton` simply ignores it — the screen routes shake to percussion.)
- In `stop()` and `dispose()`, remove any `n.scheduler.forceStop(...)` / `stopOverlay` / `pendingWindow`/`stuttering` resets.
- In `getStemStates`, the returned objects no longer include `stuttering`.

- [ ] **Step 3: Run, expect pass (stutter gone, rest green)**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: PASS — build-from-silence / latch / glide / loop / focused-stem / head-nod-presence tests remain. Any test still referencing `stuttering` or `triggerStutterFor` must be removed/updated in Step 1; if one slipped through, fix it now (the head-nod test from the loop-foundation asserted `triggerStutterFor` on the focused stem — update or remove it; head-nod is re-tested against percussion in Task 8, so delete that stutter-era head-nod test here).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new diagnostics. (RemixScreen still references removed symbols — Task 9 fixes it; if lint flags RemixScreen now, that's expected and resolved in Task 9. To keep this task's lint clean in isolation, you may temporarily leave RemixScreen's stutter refs; but DO NOT commit a broken full `tsc`. If `tsc` fails on RemixScreen, proceed to Task 9 before committing the engine change, OR stub the screen's `out.stutter`→`out.shake` + remove `setShakeStutterEnabled` call as part of this commit. Recommended: make the minimal RemixScreen edits needed for `tsc` to pass — change `out.stutter` reads to `out.shake`, remove the `engine.setShakeStutterEnabled(...)` effect and the `triggerStutterFor` key arm — and note them; Task 9 completes the screen UI.)

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: green (stutter tests gone; everything else passes).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(remix): remove stutter mechanism from engine (+ delete StutterScheduler)"
```

---

## Task 5: `DrumKit` — load drum WAVs as Tone.Players

**Files:** Create `src/remix/layers/DrumKit.ts`, `src/__tests__/DrumKit.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/DrumKit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const triggerSpy = vi.fn();
const disposeSpy = vi.fn();

vi.mock('tone', () => {
  const Player = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return {
      connect: vi.fn(),
      start: triggerSpy,
      stop: vi.fn(),
      dispose: disposeSpy,
      volume: { value: 0 },
    };
  });
  return { Player };
});

import { DrumKit } from '../remix/layers/DrumKit';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}
function fakeCtx(): AudioContext {
  return { createGain: vi.fn(() => fakeNode()) } as unknown as AudioContext;
}

beforeEach(() => vi.clearAllMocks());

describe('DrumKit', () => {
  it('loads a player per drum and is ready when all load', () => {
    const kit = new DrumKit(fakeCtx(), 'default');
    expect(kit.isReady()).toBe(true); // mock fires onload synchronously
  });

  it('plays the named drum', () => {
    const kit = new DrumKit(fakeCtx(), 'default');
    kit.connect(fakeNode() as unknown as AudioNode);
    kit.play('kick', 0.8);
    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it('kickCrash fires two players (kick + crash)', () => {
    const kit = new DrumKit(fakeCtx(), 'default');
    kit.play('kickCrash', 0.9);
    expect(triggerSpy).toHaveBeenCalledTimes(2);
  });

  it('no-ops play before ready', () => {
    // Force not-ready by making onload not fire.
    const kit = new DrumKit(fakeCtx(), 'default');
    // @ts-expect-error force the private ready flag false for the test
    kit.ready = false;
    kit.play('snare', 0.5);
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('dispose tears down all players', () => {
    const kit = new DrumKit(fakeCtx(), 'default');
    kit.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(4); // kick, snare, hat, crash
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/DrumKit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/layers/DrumKit.ts`:

```ts
/**
 * DrumKit — loads one Tone.Player per drum from public/samples/drums/<kitId>/
 * and plays a named drum on demand. One-shots are per-sample Players (not a
 * pitched Sampler). High-quality CC0/CC-BY WAVs are placed by the human (see
 * public/samples/drums/SAMPLE_SOURCES.md); until present, players never load
 * and play() silently no-ops.
 */

import * as Tone from 'tone';
import type { HeadBopDrum } from '../../songs/voices/HeadBopKit';

/** The single-drum components the kit holds a Player for. */
type DrumName = 'kick' | 'snare' | 'hat' | 'crash';
const DRUM_NAMES: readonly DrumName[] = ['kick', 'snare', 'hat', 'crash'];

export class DrumKit {
  private players = new Map<DrumName, Tone.Player>();
  private loaded = 0;
  private ready = false;

  constructor(_ctx: AudioContext, kitId: string) {
    const base = `samples/drums/${kitId}/`;
    for (const name of DRUM_NAMES) {
      const player = new Tone.Player({
        url: `${base}${name}.wav`,
        onload: () => {
          this.loaded += 1;
          if (this.loaded >= DRUM_NAMES.length) this.ready = true;
        },
      });
      this.players.set(name, player);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  connect(dest: AudioNode): void {
    for (const p of this.players.values()) p.connect(dest);
  }

  /** Play a (possibly compound) drum at velocity 0–1. No-op until ready. */
  play(drum: HeadBopDrum, velocity: number): void {
    if (!this.ready) return;
    const v = Math.max(0, Math.min(1, velocity));
    const gainDb = velToDb(v);
    if (drum === 'kickCrash') {
      this.fire('kick', gainDb);
      this.fire('crash', gainDb);
      return;
    }
    this.fire(drum, gainDb);
  }

  dispose(): void {
    for (const p of this.players.values()) p.dispose();
    this.players.clear();
    this.ready = false;
  }

  private fire(name: DrumName, gainDb: number): void {
    const p = this.players.get(name);
    if (!p) return;
    p.volume.value = gainDb;
    p.start();
  }
}

/** Map a 0–1 velocity to a dB gain (−24 dB … 0 dB) for Tone.Player.volume. */
function velToDb(v: number): number {
  return -24 + v * 24;
}
```

Note: `HeadBopDrum` is `'kick' | 'snare' | 'hat' | 'crash' | 'kickCrash'`; the `kickCrash` branch fans out to two `fire` calls (matching `HeadBopKit`'s compound behaviour), which is why the test expects 2 `start` calls.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/DrumKit.test.ts`
Expected: PASS (5 tests). The mock's `Player.start` is the shared `triggerSpy`; `kickCrash` calls it twice.

- [ ] **Step 5: Lint + commit**

Run: `npm run lint` → no new diagnostics.

```bash
git add src/remix/layers/DrumKit.ts src/__tests__/DrumKit.test.ts
git commit -m "feat(remix): DrumKit — drum one-shots as Tone.Players"
```

---

## Task 6: `PercussionLayer`

**Files:** Create `src/remix/layers/PercussionLayer.ts`, `src/__tests__/PercussionLayer.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/PercussionLayer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const playSpy = vi.fn();
vi.mock('../remix/layers/DrumKit', () => ({
  DrumKit: vi.fn().mockImplementation(() => ({
    isReady: () => true,
    connect: vi.fn(),
    play: playSpy,
    dispose: vi.fn(),
  })),
}));

import { PercussionLayer } from '../remix/layers/PercussionLayer';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setTargetAtTime: vi.fn() } };
}
function fakeCtx(): AudioContext {
  return { currentTime: 0, createGain: vi.fn(() => fakeNode()) } as unknown as AudioContext;
}

// 4/4 bar: downbeat at 0 and 2; beats every 0.5.
const BEATS = [0, 0.5, 1.0, 1.5, 2.0];
const DOWNBEATS = [0, 2.0];

beforeEach(() => vi.clearAllMocks());

describe('PercussionLayer', () => {
  function makeLayer() {
    const layer = new PercussionLayer(fakeCtx(), 'default');
    layer.setBeatGrid(BEATS, DOWNBEATS);
    layer.setEnabled(true);
    return layer;
  }

  it('has id and kind percussion', () => {
    const layer = new PercussionLayer(fakeCtx(), 'default');
    expect(layer.kind).toBe('percussion');
    expect(typeof layer.id).toBe('string');
  });

  it('hit() plays a beat-aware drum (downbeat → kickCrash)', () => {
    const layer = makeLayer();
    layer.hit(0.0, 0.8); // exactly on a downbeat → pickHeadBopDrum returns kickCrash
    expect(playSpy).toHaveBeenCalledWith('kickCrash', 0.8);
  });

  it('hit() on a backbeat plays a snare', () => {
    const layer = makeLayer();
    layer.hit(0.5, 0.7); // beat index 1 (backbeat) → snare
    expect(playSpy).toHaveBeenCalledWith('snare', 0.7);
  });

  it('ignores hit() when disabled', () => {
    const layer = makeLayer();
    layer.setEnabled(false);
    layer.hit(0.0, 0.8);
    expect(playSpy).not.toHaveBeenCalled();
  });
});
```

(The expected drum names follow `pickHeadBopDrum`'s real logic: beat 0 is a downbeat → `kickCrash`; beat 1 is a backbeat → `snare`. If the real picker returns different names for these exact inputs, adjust the expectations to match the picker — the intent is "beat-aware selection is wired", not specific drum names.)

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/PercussionLayer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/remix/layers/PercussionLayer.ts`:

```ts
/**
 * PercussionLayer — a RemixLayer of kind 'percussion'. Owns a DrumKit and
 * fires a beat-appropriate drum on hit(), chosen by pickHeadBopDrum from the
 * song's beat grid (kick on downbeats, snare on backbeats). Routed to by the
 * head-nod, shake, and keyboard-S gestures via the engine.
 */

import type { RemixLayer } from './RemixLayer';
import { DrumKit } from './DrumKit';
import { pickHeadBopDrum } from '../../songs/voices/HeadBopKit';

export class PercussionLayer implements RemixLayer {
  readonly id = 'percussion';
  readonly kind = 'percussion' as const;

  private kit: DrumKit;
  private gain: GainNode;
  private enabled = false;
  private volume = 0.8;
  private beats: readonly number[] = [];
  private downbeats: readonly number[] = [];

  constructor(ctx: AudioContext, kitId: string) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0; // disabled → silent
    this.kit = new DrumKit(ctx, kitId);
    this.kit.connect(this.gain);
  }

  connect(dest: AudioNode): void {
    this.gain.connect(dest);
  }

  setBeatGrid(beats: readonly number[], downbeats: readonly number[]): void {
    this.beats = beats;
    this.downbeats = downbeats;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.gain.gain.value = on ? this.volume : 0;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.enabled) this.gain.gain.value = this.volume;
  }

  isReady(): boolean {
    return this.kit.isReady();
  }

  /** Fire a beat-aware drum at the given playback time + velocity. */
  hit(timeSec: number, velocity: number): void {
    if (!this.enabled || !this.kit.isReady()) return;
    const drum = pickHeadBopDrum(timeSec, this.beats, this.downbeats);
    this.kit.play(drum, velocity);
  }

  dispose(): void {
    this.kit.dispose();
    this.gain.disconnect();
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/PercussionLayer.test.ts`
Expected: PASS. If the downbeat/backbeat drum names differ from the picker's real output, align the test expectations with `pickHeadBopDrum` (run it mentally against the fixtures or adjust).

- [ ] **Step 5: Lint + commit**

Run: `npm run lint` → no new diagnostics.

```bash
git add src/remix/layers/PercussionLayer.ts src/__tests__/PercussionLayer.test.ts
git commit -m "feat(remix): PercussionLayer — beat-aware sampled drum hits"
```

---

## Task 7: `RemixEngine` — layers bus + layer API

**Files:** Modify `src/remix/RemixEngine.ts`, `src/__tests__/RemixEngine.test.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/RemixEngine.test.ts`:

```ts
  it('adds a disabled percussion layer on load and exposes layer controls', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    // @ts-expect-error private — inspect the layers map
    const layer = e.layers.get('percussion');
    expect(layer).toBeTruthy();
    expect(layer.kind).toBe('percussion');
    // enable + volume pass-throughs don't throw
    expect(() => e.setLayerEnabled('percussion', true)).not.toThrow();
    expect(() => e.setLayerVolume('percussion', 0.5)).not.toThrow();
    e.dispose();
  });

  it('triggerPercussion fires the layer only when enabled', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    // @ts-expect-error private
    const layer = e.layers.get('percussion');
    const hitSpy = vi.spyOn(layer, 'hit');
    e.triggerPercussion(0, 0.8);            // disabled → no hit
    expect(hitSpy).not.toHaveBeenCalled();
    e.setLayerEnabled('percussion', true);
    e.triggerPercussion(0, 0.8);            // enabled → hit
    expect(hitSpy).toHaveBeenCalledWith(0, 0.8);
    e.dispose();
  });

  it('a head nod calls triggerPercussion when percussion is enabled', async () => {
    const e = new RemixEngine();
    await e.loadSong(songWithBars());
    e.setLayerEnabled('percussion', true);
    e.setHeadNodEnabled(true);
    e.setHeadNodSensitivity(0.02, 100);
    // @ts-expect-error private
    const layer = e.layers.get('percussion');
    const hitSpy = vi.spyOn(layer, 'hit');
    let t = 0;
    e.processFaceLandmarks(makeFace(0.40), (t += 16));
    e.processFaceLandmarks(makeFace(0.45), (t += 16));
    e.processFaceLandmarks(makeFace(0.50), (t += 16));
    e.processFaceLandmarks(makeFace(0.45), (t += 16)); // bop
    expect(hitSpy).toHaveBeenCalled();
    e.dispose();
  });
```

(`makeFace` already exists from the loop-foundation head-nod test; reuse it. The percussion layer's `hit` is callable because the `PercussionLayer` real implementation is used — the `DrumKit` inside it will not be `ready` under the engine's Tone mock, so `hit` may early-return at the kit level, but `triggerPercussion`/`processFaceLandmarks` still *call* `layer.hit`, which the spy observes. The spy is on `hit` itself, so readiness doesn't matter for these assertions.)

Also: the engine's Tone mock needs a `Player` constructor (DrumKit uses `new Tone.Player`). Extend the engine test's `vi.mock('tone', ...)` to include the `Player` mock used in `DrumKit.test.ts` (a `vi.fn()` returning `{ connect, start, stop, dispose, volume:{value:0}, onload fired }`). Add it to the existing mock object.

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts -t 'layer|percussion|head nod'`
Expected: FAIL — `layers`, `setLayerEnabled`, `triggerPercussion` don't exist; `processFaceLandmarks` still calls the removed `triggerStutterFor`.

- [ ] **Step 3: Implement**

In `src/remix/RemixEngine.ts`:

Imports:
```ts
import type { RemixLayer } from './layers/RemixLayer';
import { PercussionLayer } from './layers/PercussionLayer';
```

Fields:
```ts
  private layersBus: GainNode | null = null;
  private layers = new Map<string, RemixLayer>();
```

In `loadSong`, after `this.master` is created and before/after the stem setup (anywhere the master gain exists), build the layers bus and the percussion layer:
```ts
    // Added-sound layers bus (parallel to the stem path).
    this.layersBus = this.ctx.createGain();
    this.layersBus.gain.value = 1;
    this.layersBus.connect(this.master);

    const percussion = new PercussionLayer(this.ctx, 'default');
    percussion.connect(this.layersBus);
    percussion.setBeatGrid(this.beats, this.downbeats);
    percussion.setEnabled(false); // opt-in
    this.layers.set(percussion.id, percussion);
```
(Place this after `this.beats`/`this.downbeats` are assigned so the grid is set. `this.ctx`/`this.master` exist from the existing engine.)

Methods:
```ts
  addLayer(layer: RemixLayer): void {
    this.layers.set(layer.id, layer);
  }
  getLayer(id: string): RemixLayer | undefined {
    return this.layers.get(id);
  }
  removeLayer(id: string): void {
    const l = this.layers.get(id);
    if (l) { l.dispose(); this.layers.delete(id); }
  }
  setLayerEnabled(id: string, on: boolean): void {
    this.layers.get(id)?.setEnabled(on);
  }
  setLayerVolume(id: string, v: number): void {
    this.layers.get(id)?.setVolume(v);
  }
  /** Fire the percussion layer (head-nod / shake / keyboard-S route here). */
  triggerPercussion(timeSec: number, velocity: number): void {
    const layer = this.layers.get('percussion');
    if (layer instanceof PercussionLayer) layer.hit(timeSec, velocity);
  }
```

Update `processFaceLandmarks`: replace the body's `this.triggerStutterFor(this.focusedStem)` call (removed in Task 4) with:
```ts
    if (this.headNodDetector.step(lm.y, timestampMs)) {
      const velocity = clampVel(this.headNodDetector.getLastBopAmplitude());
      this.triggerPercussion(Tone.getTransport().seconds, velocity);
    }
```
Add a small helper `function clampVel(amp: number): number { return Math.max(0.4, Math.min(1, 0.4 + amp * 6)); }` (maps nod amplitude to a musical velocity floor 0.4 → 1; tune later). If `clampVel` would be unused-flagged elsewhere, keep it module-local.

In `dispose()`, dispose layers + the bus:
```ts
    for (const l of this.layers.values()) l.dispose();
    this.layers.clear();
    this.layersBus?.disconnect();
    this.layersBus = null;
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: green (new layer/percussion/head-nod tests + remaining engine tests).

- [ ] **Step 5: Full suite + lint**

Run: `npx vitest run` → green. Run: `npm run lint` → no new diagnostics (RemixScreen may still be mid-update from Task 4's minimal edits; if `tsc` flags it, complete Task 9 before this commit, or ensure the minimal screen edits keep `tsc` green).

- [ ] **Step 6: Commit**

```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): layers bus + percussion layer wiring + head-nod→drums"
```

---

## Task 8: `RemixScreen` — route gestures + percussion controls + remove stutter UI

**Files:** Modify `src/ui/screens/RemixScreen.tsx`. UI — no unit test (lint + suite + manual).

- [ ] **Step 1: Implement**

In `src/ui/screens/RemixScreen.tsx`:

1. **Remove stutter UI + state:**
   - Delete `shakeStutterEnabled` state and the `useEffect` calling `engine.setShakeStutterEnabled` (method removed).
   - In the per-stem tile render, remove the `stuttering` lookup, the STUTTER strobe `opacity`/`transition` logic, the `, stuttering` aria-label fragment, and the `{stuttering && <span>STUTTER</span>}` element.
   - In the facilitator panel, remove the "Stutter" sub-heading + the shake-stutter toggle.
   - `getStemStates()` no longer returns `stuttering`; remove any reference. The initial `stemStates` seed object (`{ filterNorm:0, targetFilterNorm:0, gain:0, stuttering:false }`) drops `stuttering`.

2. **Route the freed gestures to percussion:**
   - **Shake:** where baton outputs are processed each frame, when `out.shake` is true and percussion is enabled, call `engineRef.current.triggerPercussion(Tone.getTransport().seconds, 0.9)` (accent velocity). (Replace the old `out.stutter`→engine path.)
   - **Keyboard `S`:** in the key handler, replace the `action.kind === 'stutter'` arm (which called `engine.triggerStutterFor(...)`) with `action.kind === 'percussion'` → `engineRef.current.triggerPercussion(Tone.getTransport().seconds, 0.8)`.
   - **Head-nod:** already routed in the engine (Task 7) — no screen change beyond keeping the FaceDetector wiring. (Relabel the head-nod toggle text/aria from "stutter" to "drums": e.g. "Head nod → drums".)

3. **Percussion controls (facilitator panel):**
   - Add an "Add percussion" enable toggle: `engineRef.current.setLayerEnabled('percussion', next)` + a `percussionEnabled` state (default false), `aria-pressed`.
   - Add a percussion volume slider (0–1, step 0.05) → `engineRef.current.setLayerVolume('percussion', v)` + `percussionVolume` state (default 0.8), labelled.
   - Gate the shake/`S` `triggerPercussion` calls on `percussionEnabledRef.current` (use a ref to avoid stale reads in the RAF/keyboard handler), OR rely on the engine's own enabled-gate (the engine's `triggerPercussion` → `layer.hit` already no-ops when disabled). Relying on the engine gate is simplest — no extra ref needed; just always call `triggerPercussion`.

4. **Drum-name flash (replaces STUTTER strobe):** when a percussion hit fires, show a brief flash with the drum name near the percussion control. Simplest: track a `lastDrumFlashRef`/state timestamp set whenever the screen calls `triggerPercussion` (shake/S) — for head-nod (engine-driven) you won't know the drum name in the screen, so keep this lightweight: a generic "♪ hit" pulse on the percussion control when enabled and a hit was triggered this frame is acceptable. Do not over-build; a small enabled-state indicator is fine. (Per-drum naming can come with a later engine callback.)

5. **Focused-stem indicator:** change `isFocused = (keyboardMode || headNodEnabled) && …` back to `isFocused = keyboardMode && …` — head-nod no longer targets a stem (it fires drums), so the focused indicator is a keyboard-mode concept again.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new diagnostics; all removed-symbol references (`stuttering`, `setShakeStutterEnabled`, `triggerStutterFor`, `out.stutter`) are gone.

- [ ] **Step 3: Full suite**

Run: `npx vitest run`
Expected: green (no test targets this UI file).

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/RemixScreen.tsx
git commit -m "feat(remix): route head-nod/shake/S to percussion; remove stutter UI; percussion controls"
```

---

## Task 9: Bundle the drum kit assets + SAMPLE_SOURCES

**Files:** Create `public/samples/drums/SAMPLE_SOURCES.md`; create the `public/samples/drums/default/` folder with `kick.wav`, `snare.wav`, `hat.wav`, `crash.wav`.

**IMPORTANT — human-in-the-loop:** the coding agent cannot reliably download/commit licensed binary audio. This task documents the requirement and places the files; **a human must obtain the WAVs** (the code already no-ops gracefully until they exist, so nothing breaks before then).

- [ ] **Step 1: Write the sources doc**

Create `public/samples/drums/SAMPLE_SOURCES.md`:

```markdown
# Remix drum-kit samples

The Remix percussion layer (`src/remix/layers/DrumKit.ts`) loads one-shot WAVs from
`public/samples/drums/<kitId>/`. The default kit id is `default`, expecting:

- `kick.wav`
- `snare.wav`
- `hat.wav`
- `crash.wav`

## Requirements
- Openly licensed: **CC0** (preferred) or **CC-BY** (record attribution below).
- One-shots, trimmed, mono or stereo, 44.1 kHz, ideally < ~150 KB each.

## Recommended source
Pick a CC0 acoustic/electronic drum one-shot set (e.g. a CC0 pack from freesound.org
or a CC0 kit such as those bundled with open drum-machine projects). Download the four
hits, rename to the filenames above, and place them in `public/samples/drums/default/`.

## Attribution (fill in if CC-BY)
- kick: <source/author/licence>
- snare: <source/author/licence>
- hat: <source/author/licence>
- crash: <source/author/licence>

Until the WAVs are present, `DrumKit.isReady()` stays false and percussion silently
no-ops — the app still runs.
```

- [ ] **Step 2: Place the WAVs (human step)**

Obtain four CC0/CC-BY one-shots and save them as `public/samples/drums/default/{kick,snare,hat,crash}.wav`. Fill in attribution in `SAMPLE_SOURCES.md` if CC-BY. (If running this plan via subagents, the controller should surface this as a manual action for the human; the subagent should NOT fabricate binary files.)

- [ ] **Step 3: Commit**

```bash
git add public/samples/drums/SAMPLE_SOURCES.md public/samples/drums/default/
git commit -m "assets(remix): drum-kit sample folder + sourcing doc"
```

(If the WAVs aren't placed yet, commit just the `SAMPLE_SOURCES.md` and the empty-folder placeholder, and leave the audio for the human — note it in the commit body.)

---

## Task 10: Full verification

**Files:** none.

- [ ] **Step 1: Full suite** — Run: `npm run test:run` → all green (stutter tests removed; new DrumKit + PercussionLayer + engine layer tests added).
- [ ] **Step 2: Lint** — Run: `npm run lint` → only the 12 pre-existing `src/__tests__/setup.ts` diagnostics.
- [ ] **Step 3: Manual (documented)** — Run `npm run dev`, open Remix, load a song:
  1. Confirm **stutter is gone**: no STUTTER strobe on tiles, no shake-stutter toggle, no glitch on shake/head-nod.
  2. With the drum WAVs placed: enable **Add percussion**, set a volume; **head-nod** → a beat-aware drum hit lands in time (kick on downbeats, snare on backbeats) using the high-quality samples; **shake** a baton → an accent hit; keyboard **`S`** → a drum hit. Without the WAVs: percussion is silent (graceful no-op) — confirm no errors.
  3. Confirm the loop / keyboard mode / calibration / baton-touch features are unregressed.
  Return to the owning task on any failure.
- [ ] **Step 4: Clean tree** — `git status` clean (aside from any human-pending WAV placement noted in Task 9).

---

## Self-Review

Checked against [../specs/2026-05-26-remix-percussion-layer-design.md](../specs/2026-05-26-remix-percussion-layer-design.md):

**Spec coverage:**
- Remove stutter (engine + scheduler + UI + tests) — Tasks 4, 8
- Keep+repurpose gestures: baton `stutter`→`shake` — Task 1; head-nod→percussion — Task 7; keyboard `S`→percussion — Tasks 2, 8; shake→percussion — Task 8
- RemixLayer framework + layers bus — Tasks 3, 7
- DrumKit (Tone.Players, kickCrash compound, no-op until ready) — Task 5
- PercussionLayer (RemixLayer, beat-aware hit via pickHeadBopDrum, enable/volume) — Task 6
- Engine API (setLayerEnabled/Volume, triggerPercussion, percussion-on-load disabled, dispose) — Task 7
- Percussion controls + drum flash + remove stutter UI — Task 8
- Bundled CC0 kit + SAMPLE_SOURCES + graceful-until-present — Tasks 5 (no-op), 9
- Out of scope (beat-gating, instrument/loop/pad, sample uplift, recording) — correctly absent

**Placeholder scan:** none in code steps. Task 9's `SAMPLE_SOURCES.md` has attribution blanks by design (filled when the human places files) — that's content, not a plan placeholder. The human-WAV step is explicitly flagged, not hidden.

**Type consistency:** `RemixLayer`/`RemixLayerKind` (Task 3) consumed in Tasks 6,7. `HeadBopDrum` reused from HeadBopKit in Tasks 5,6. `DrumKit.play(drum, velocity)` defined Task 5, called Task 6. `PercussionLayer.hit/setEnabled/setVolume/setBeatGrid` defined Task 6, called Task 7. Engine `triggerPercussion(timeSec, velocity)`/`setLayerEnabled`/`setLayerVolume` defined Task 7, called Task 8. `RemixBatonOutput.shake` (Task 1) consumed Task 8. `remixKeyMap` `percussion` action (Task 2) consumed Task 8. Consistent.
