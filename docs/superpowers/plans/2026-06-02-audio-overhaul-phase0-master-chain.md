# Audio Overhaul — Phase 0: Shared Studio Master Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable master-bus processing chain (EQ → glue compressor → soft saturation → brickwall limiter) and a send-style space reverb, and route both the Song Present and Remix engines through them, so both modes immediately sound fuller, warmer, louder, and less harsh/dry.

**Architecture:** Two new framework-agnostic classes in `src/audio/` (`MasterChain`, `SpaceReverb`) that take the raw `AudioContext`, expose **raw `GainNode`** I/O, and build their processing internally from Tone.js nodes. If any Tone constructor is unavailable (e.g. under a minimal test mock), they **degrade to a dry pass-through** using only raw Web Audio — so existing engine tests stay green without mock changes. Each engine owns its own instances (separate signal nodes; shared code + tuning). All tunables live in `src/audio/audioConfig.ts`.

**Tech Stack:** TypeScript (strict, no `any`), Tone.js ^15.1.22, Web Audio API, Vitest (jsdom, `vi.mock('tone')`).

**Spec:** `docs/superpowers/specs/2026-06-02-song-remix-audio-overhaul-design.md`

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/audio/audioConfig.ts` | Create | All master-chain + reverb tunables (EQ curve, comp, saturation drive, reverb, limiter ceiling). |
| `src/audio/MasterChain.ts` | Create | EQ3 → Compressor → WaveShaper saturation → Limiter → destination. Raw `input` GainNode. Pass-through fallback. |
| `src/audio/SpaceReverb.ts` | Create | Send-style reverb. Raw `send` GainNode → Tone.Reverb → output node. Pass-through fallback. |
| `src/__tests__/MasterChain.test.ts` | Create | Unit tests: full chain built, pass-through fallback, dispose. |
| `src/__tests__/SpaceReverb.test.ts` | Create | Unit tests: reverb wired, send-level, pass-through, dispose. |
| `src/songs/SongPresetEngine.ts` | Modify | Route `masterGainNode` through a `MasterChain` instead of straight to destination; dispose it. |
| `src/remix/RemixEngine.ts` | Modify | Route `master` through a `MasterChain`; add a `SpaceReverb` send off the mix; dispose both. |

**Design note (why no test-mock edits):** `MasterChain`/`SpaceReverb` only touch Tone inside a guarded `try`. Their raw `input`/`send`/output are plain `GainNode`s from `ctx.createGain()`. Under the engine tests' minimal `tone` mocks (which lack `EQ3`, `Compressor`, etc.), construction throws inside the `try`, the catch wires a dry pass-through with raw Web Audio, and nothing else changes. Do **not** edit `RemixEngine.test.ts`, `SongPresetEngine.headBop.test.ts`, or `SongPresetEngine.walk.test.ts`.

---

## Task 1: Audio config constants

**Files:**
- Create: `src/audio/audioConfig.ts`

- [ ] **Step 1: Create the config module**

```typescript
// src/audio/audioConfig.ts
//
// All tunable numbers for the shared studio master chain + space reverb.
// Centralised here per the project rule: every audible threshold must be
// adjustable in one place (facilitator calibration can later read/write these).

/** EQ3 settings (gains in dB). Low-shelf adds body; high band tames harshness. */
export interface EqConfig {
  low: number;
  mid: number;
  high: number;
  lowFrequency: number;
  highFrequency: number;
}

/** Glue compressor. Web Audio DynamicsCompressor has zero lookahead → 0 ms latency. */
export interface CompConfig {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
}

export interface SaturationConfig {
  /** tanh drive; higher = warmer/more coloured. ~1–3 is gentle. */
  drive: number;
}

export interface LimiterConfig {
  /** Output ceiling in dB. ~-0.3 = loud but clip-proof. */
  ceilingDb: number;
}

export interface ReverbConfig {
  decay: number;
  preDelay: number;
  /** Parallel send level (0–1) from the mix into the reverb. */
  sendLevel: number;
}

export interface MasterChainConfig {
  eq: EqConfig;
  comp: CompConfig;
  saturation: SaturationConfig;
  limiter: LimiterConfig;
}

export const DEFAULT_MASTER_CHAIN: MasterChainConfig = {
  eq: { low: 2, mid: 0, high: -1.5, lowFrequency: 250, highFrequency: 3500 },
  comp: { threshold: -18, ratio: 2, attack: 0.02, release: 0.18, knee: 6 },
  saturation: { drive: 1.5 },
  limiter: { ceilingDb: -0.3 },
};

export const DEFAULT_SPACE_REVERB: ReverbConfig = {
  decay: 2.4,
  preDelay: 0.012,
  sendLevel: 0.12,
};
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: PASS (no errors). This file has no consumers yet, so it only needs to compile.

- [ ] **Step 3: Commit**

```bash
git add src/audio/audioConfig.ts
git commit -m "feat(audio): master-chain + space-reverb config constants"
```

---

## Task 2: MasterChain class

**Files:**
- Create: `src/audio/MasterChain.ts`
- Test: `src/__tests__/MasterChain.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/MasterChain.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const disposeSpy = vi.fn();
const connectSpy = vi.fn();
const chainSpy = vi.fn();
const toDestSpy = vi.fn();

vi.mock('tone', () => {
  const node = () => ({
    chain: chainSpy,
    toDestination: toDestSpy,
    dispose: disposeSpy,
    connect: vi.fn(),
    disconnect: vi.fn(),
    wet: { value: 1 },
    gain: { value: 1 },
  });
  return {
    EQ3: vi.fn(() => node()),
    Compressor: vi.fn(() => node()),
    WaveShaper: vi.fn(() => node()),
    Limiter: vi.fn(() => node()),
    connect: connectSpy,
    getDestination: vi.fn(() => node()),
  };
});

import { MasterChain } from '../audio/MasterChain';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}
function fakeCtx(): AudioContext {
  return {
    createGain: vi.fn(() => fakeNode()),
    destination: {},
  } as unknown as AudioContext;
}

beforeEach(() => vi.clearAllMocks());

describe('MasterChain', () => {
  it('exposes a raw input node from the context', () => {
    const ctx = fakeCtx();
    const mc = new MasterChain(ctx);
    expect(ctx.createGain).toHaveBeenCalled();
    expect(mc.input).toBeDefined();
  });

  it('builds the full Tone chain when Tone is available', async () => {
    const Tone = await import('tone');
    const mc = new MasterChain(fakeCtx());
    expect(Tone.EQ3).toHaveBeenCalledTimes(1);
    expect(Tone.Compressor).toHaveBeenCalledTimes(1);
    expect(Tone.WaveShaper).toHaveBeenCalledTimes(1);
    expect(Tone.Limiter).toHaveBeenCalledTimes(1);
    // raw input bridged into the first Tone node, and limiter → destination
    expect(connectSpy).toHaveBeenCalled();
    expect(toDestSpy).toHaveBeenCalled();
    mc.dispose();
  });

  it('disposes every Tone node it created', () => {
    const mc = new MasterChain(fakeCtx());
    mc.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(4); // eq, comp, shaper, limiter
  });

  it('falls back to a dry pass-through if a Tone constructor is missing', async () => {
    vi.resetModules();
    vi.doMock('tone', () => ({})); // no EQ3/Compressor/etc.
    const { MasterChain: MC } = await import('../audio/MasterChain');
    const ctx = fakeCtx();
    const input = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
    (ctx.createGain as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(input);
    const mc = new MC(ctx);
    // pass-through wires input straight to ctx.destination, no throw
    expect(input.connect).toHaveBeenCalledWith(ctx.destination);
    expect(() => mc.dispose()).not.toThrow();
    vi.doUnmock('tone');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/MasterChain.test.ts`
Expected: FAIL — "Cannot find module '../audio/MasterChain'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/audio/MasterChain.ts
import * as Tone from 'tone';
import { DEFAULT_MASTER_CHAIN, type MasterChainConfig } from './audioConfig';

/**
 * Shared master-bus processing reused by each engine.
 *
 *   input (raw GainNode) ─► EQ3 ─► Compressor ─► WaveShaper(sat) ─► Limiter ─► destination
 *
 * `input` is always a plain Web Audio GainNode, so callers connect into it
 * with native `.connect()`. The processing nodes are Tone.js. If Tone is
 * unavailable (e.g. a minimal test mock), the constructor degrades to a dry
 * pass-through (input → destination) instead of throwing.
 */
export class MasterChain {
  /** Connect engine output(s) here. Always a raw Web Audio node. */
  readonly input: GainNode;

  private toneNodes: { dispose: () => void }[] = [];
  private passthrough = false;

  constructor(
    private readonly ctx: AudioContext,
    cfg: MasterChainConfig = DEFAULT_MASTER_CHAIN,
  ) {
    this.input = ctx.createGain();
    try {
      const eq = new Tone.EQ3(cfg.eq);
      const comp = new Tone.Compressor(cfg.comp);
      const drive = Math.max(0.0001, cfg.saturation.drive);
      const norm = Math.tanh(drive);
      const shaper = new Tone.WaveShaper((x: number) => Math.tanh(drive * x) / norm);
      const limiter = new Tone.Limiter(cfg.limiter.ceilingDb);

      // raw input → first Tone node (bridge), then series, then to speakers.
      Tone.connect(this.input, eq);
      eq.chain(comp, shaper, limiter);
      limiter.toDestination();

      this.toneNodes = [eq, comp, shaper, limiter];
    } catch {
      // Tone not fully available — wire a transparent dry path so audio
      // still reaches the speakers and tests don't crash.
      this.passthrough = true;
      this.input.connect(this.ctx.destination);
    }
  }

  dispose(): void {
    for (const n of this.toneNodes) {
      try {
        n.dispose();
      } catch {
        /* ignore */
      }
    }
    this.toneNodes = [];
    try {
      this.input.disconnect();
    } catch {
      /* already gone */
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/MasterChain.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/audio/MasterChain.ts src/__tests__/MasterChain.test.ts
git commit -m "feat(audio): MasterChain (EQ/glue-comp/saturation/limiter) with pass-through fallback"
```

---

## Task 3: SpaceReverb class

**Files:**
- Create: `src/audio/SpaceReverb.ts`
- Test: `src/__tests__/SpaceReverb.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/SpaceReverb.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const disposeSpy = vi.fn();
const connectSpy = vi.fn();

vi.mock('tone', () => {
  const node = () => ({
    dispose: disposeSpy,
    connect: vi.fn(),
    disconnect: vi.fn(),
    wet: { value: 0 },
  });
  return {
    Reverb: vi.fn(() => node()),
    connect: connectSpy,
  };
});

import { SpaceReverb } from '../audio/SpaceReverb';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}
function fakeCtx(): AudioContext {
  return { createGain: vi.fn(() => fakeNode()), destination: {} } as unknown as AudioContext;
}

beforeEach(() => vi.clearAllMocks());

describe('SpaceReverb', () => {
  it('exposes a raw send node and wires send → reverb → output', async () => {
    const Tone = await import('tone');
    const output = fakeNode() as unknown as AudioNode;
    const sr = new SpaceReverb(fakeCtx(), output);
    expect(sr.send).toBeDefined();
    expect(Tone.Reverb).toHaveBeenCalledTimes(1);
    // send bridged into reverb, reverb bridged into output (2 Tone.connect calls)
    expect(connectSpy).toHaveBeenCalledTimes(2);
    sr.dispose();
  });

  it('setSendLevel updates the send gain', () => {
    const sr = new SpaceReverb(fakeCtx(), fakeNode() as unknown as AudioNode);
    sr.setSendLevel(0.5);
    expect(sr.send.gain.value).toBe(0.5);
  });

  it('disposes the reverb', () => {
    const sr = new SpaceReverb(fakeCtx(), fakeNode() as unknown as AudioNode);
    sr.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a no-op send if Reverb is missing', async () => {
    vi.resetModules();
    vi.doMock('tone', () => ({}));
    const { SpaceReverb: SR } = await import('../audio/SpaceReverb');
    const sr = new SR(fakeCtx(), fakeNode() as unknown as AudioNode);
    expect(sr.send).toBeDefined();
    expect(() => sr.dispose()).not.toThrow();
    vi.doUnmock('tone');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/SpaceReverb.test.ts`
Expected: FAIL — "Cannot find module '../audio/SpaceReverb'".

- [ ] **Step 3: Write the implementation**

```typescript
// src/audio/SpaceReverb.ts
import * as Tone from 'tone';
import { DEFAULT_SPACE_REVERB, type ReverbConfig } from './audioConfig';

/**
 * Send-style reverb for depth/space.
 *
 *   send (raw GainNode) ─► Tone.Reverb (wet=1) ─► output
 *
 * Callers route their mix into `send` (native `.connect()`); the wet signal
 * is summed into `output` (typically a MasterChain's `input`) so reverb gets
 * glued by the master chain. Degrades to an unconnected (silent) send if Tone
 * is unavailable.
 */
export class SpaceReverb {
  /** Route mix into here. Always a raw Web Audio node. */
  readonly send: GainNode;

  private reverb: { dispose: () => void } | null = null;

  constructor(
    ctx: AudioContext,
    output: AudioNode,
    cfg: ReverbConfig = DEFAULT_SPACE_REVERB,
  ) {
    this.send = ctx.createGain();
    this.send.gain.value = cfg.sendLevel;
    try {
      const reverb = new Tone.Reverb({ decay: cfg.decay, preDelay: cfg.preDelay });
      reverb.wet.value = 1;
      Tone.connect(this.send, reverb);   // raw → Tone
      Tone.connect(reverb, output);      // Tone → raw output
      this.reverb = reverb;
    } catch {
      // No reverb in this environment; send stays unconnected (silent).
    }
  }

  setSendLevel(level: number): void {
    this.send.gain.value = level;
  }

  dispose(): void {
    try {
      this.reverb?.dispose();
    } catch {
      /* ignore */
    }
    this.reverb = null;
    try {
      this.send.disconnect();
    } catch {
      /* already gone */
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/SpaceReverb.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/audio/SpaceReverb.ts src/__tests__/SpaceReverb.test.ts
git commit -m "feat(audio): SpaceReverb send with pass-through fallback"
```

---

## Task 4: Route Song Present through the master chain

**Files:**
- Modify: `src/songs/SongPresetEngine.ts` (import; `masterChainNode` field; `buildRouting` line ~865; `dispose` line ~1592)

**Context:** Today `buildRouting()` does `this.masterGainNode.connect(ctx.destination)` ([SongPresetEngine.ts:865](../../src/songs/SongPresetEngine.ts#L865)). We insert a `MasterChain` between `masterGainNode` and the speakers. The engine's existing internal reverb already sums into `masterGainNode`, so it automatically flows through the new chain too (bonus glue). No other routing changes in this phase.

- [ ] **Step 1: Add the import**

Near the other `src/audio`-less imports at the top of the file (after the `import * as Tone from 'tone';` on line 26), add:

```typescript
import { MasterChain } from '../audio/MasterChain';
```

- [ ] **Step 2: Add the field**

Next to `private masterGainNode: GainNode | null = null;` (line 259), add:

```typescript
  private masterChain: MasterChain | null = null;
```

- [ ] **Step 3: Insert the chain in `buildRouting`**

Replace exactly:

```typescript
    // Master output gain → destination (no compressor/limiter — avoids distortion)
    this.masterGainNode = ctx.createGain();
    this.masterGainNode.gain.value = 0.8;
    this.masterGainNode.connect(ctx.destination);
```

with:

```typescript
    // Master output gain → shared studio MasterChain → destination.
    this.masterGainNode = ctx.createGain();
    this.masterGainNode.gain.value = 0.8;
    this.masterChain = new MasterChain(ctx);
    this.masterGainNode.connect(this.masterChain.input);
```

- [ ] **Step 4: Dispose the chain**

In `dispose()`, replace exactly:

```typescript
    this.masterGainNode?.disconnect();
```

with:

```typescript
    this.masterGainNode?.disconnect();
    this.masterChain?.dispose();
```

and next to `this.masterGainNode = null;` (line 1601) add on the following line:

```typescript
    this.masterChain = null;
```

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Run the Song Present engine tests**

Run: `npx vitest run src/__tests__/SongPresetEngine.headBop.test.ts src/__tests__/SongPresetEngine.walk.test.ts`
Expected: PASS (unchanged). These tests don't call `loadSong`/`buildRouting`, and even if a path constructs `MasterChain`, the pass-through fallback keeps them green.

- [ ] **Step 7: Commit**

```bash
git add src/songs/SongPresetEngine.ts
git commit -m "feat(songs): route Song Present master through shared MasterChain"
```

---

## Task 5: Route Remix through the master chain + add space reverb

**Files:**
- Modify: `src/remix/RemixEngine.ts` (imports; `masterChain`/`spaceReverb` fields; `loadSong` lines ~87-89 and after `layersBus`; `dispose` lines ~309-312)

**Context:** Today `loadSong()` does `this.master.connect(this.ctx.destination)` ([RemixEngine.ts:89](../../src/remix/RemixEngine.ts#L89)) and Remix has **no reverb**. We route `master` through a `MasterChain`, then add a parallel `SpaceReverb` send tapped off `master` whose wet returns into the master chain's input. `master` is a raw `GainNode` and `MasterChain.input` is raw, so the connection is plain Web Audio — no Tone bridge needed.

- [ ] **Step 1: Add imports**

After `import * as Tone from 'tone';` (line 12), add:

```typescript
import { MasterChain } from '../audio/MasterChain';
import { SpaceReverb } from '../audio/SpaceReverb';
```

- [ ] **Step 2: Add fields**

Next to `private master: GainNode | null = null;` (line 57), add:

```typescript
  private masterChain: MasterChain | null = null;
  private spaceReverb: SpaceReverb | null = null;
```

- [ ] **Step 3: Insert the chain + reverb in `loadSong`**

Replace exactly:

```typescript
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(this.ctx.destination);
```

with:

```typescript
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    // Shared studio chain: master → EQ/comp/sat/limiter → destination.
    this.masterChain = new MasterChain(this.ctx);
    this.master.connect(this.masterChain.input);
    // Parallel space reverb: tap the full mix, return wet into the master chain.
    this.spaceReverb = new SpaceReverb(this.ctx, this.masterChain.input);
    this.master.connect(this.spaceReverb.send);
```

- [ ] **Step 4: Dispose both**

In `dispose()`, replace exactly:

```typescript
    this.master?.disconnect();
    this.master = null;
```

with:

```typescript
    this.master?.disconnect();
    this.spaceReverb?.dispose();
    this.spaceReverb = null;
    this.masterChain?.dispose();
    this.masterChain = null;
    this.master = null;
```

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Run the Remix engine tests**

Run: `npx vitest run src/__tests__/RemixEngine.test.ts`
Expected: PASS (unchanged). The mock lacks `EQ3`/`Compressor`/`Reverb`/`Tone.connect`, so both new objects take the pass-through path; the "8 Player constructions" and "dispose does not throw" assertions still hold (no new `Tone.Player`s are created).

- [ ] **Step 7: Commit**

```bash
git add src/remix/RemixEngine.ts
git commit -m "feat(remix): route master through MasterChain + add SpaceReverb send"
```

---

## Task 6: Full regression + manual A/B verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm run test:run`
Expected: PASS — all pre-existing test files plus the two new ones (`MasterChain.test.ts`, `SpaceReverb.test.ts`). Zero failures.

- [ ] **Step 2: Type-check the whole project**

Run: `npm run lint`
Expected: PASS (no `any`, strict mode clean).

- [ ] **Step 3: Manual A/B in the running app**

Use the `run` skill (or `npm run dev`) to launch the app. For **both** Song Present and Remix:
- Confirm audio still plays and nothing is silent or distorted.
- Compare against the pre-Phase-0 build (e.g. `git stash` or a second checkout): the output should be **louder, fuller (more low-end body), less harsh in the 3–6 kHz range**, and Remix should now have audible **space/depth** (reverb) where it was previously bone-dry.
- Verify gesture-to-sound still feels immediate (no perceptible added latency). Optionally log `Tone.getContext().lookAhead` and confirm it is unchanged.

- [ ] **Step 4: Note the result**

Record in the commit/PR description that Phase 0 is verified working, with a one-line before/after impression per mode. (No code commit in this task unless the manual pass surfaced a fix.)

---

## Self-Review

**Spec coverage:**
- Shared `src/audio/` layer (MasterChain, SpaceReverb, audioConfig) → Tasks 1–3. ✅
- Signal chain EQ → comp → saturation → limiter → destination → Task 2. ✅
- Space reverb send glued into master → Task 3 + Task 5. ✅
- Wire into both engines → Tasks 4 (Song Present) & 5 (Remix). ✅
- Latency < 20 ms (zero-lookahead comp; Limiter is DynamicsCompressor-based, no lookahead) → Task 1 config + Task 6 Step 3 verification. ✅
- Calibratable thresholds in one place → Task 1 (`audioConfig.ts`). ✅
- Tests with `vi.mock` Tone; full suite stays green → Tasks 2, 3, 6. ✅
- Pass-through resilience → Tasks 2 & 3 (fallback tests). ✅
- Song Present reverb fold-in and all sample/timbre work are **out of scope for Phase 0** (Phases 1–2), as the spec sequences them. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step shows the exact command + expected result. ✅

**Type consistency:** `MasterChain(ctx, cfg?)` with `.input: GainNode` and `.dispose()`; `SpaceReverb(ctx, output, cfg?)` with `.send: GainNode`, `.setSendLevel()`, `.dispose()`. Config interfaces (`MasterChainConfig`, `ReverbConfig`) and constants (`DEFAULT_MASTER_CHAIN`, `DEFAULT_SPACE_REVERB`) are defined in Task 1 and consumed unchanged in Tasks 2–5. ✅
