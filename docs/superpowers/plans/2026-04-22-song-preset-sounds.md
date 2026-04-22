# Song Preset Sounds — Quality & Variety Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Song Preset mode's aging FluidR3_GM soundfont presets with a curated mix of Salamander, nbrosowsky/tonejs-instruments, and Tone.js native synthesis — expanding from 16 to 27 presets across the 4 colored accompaniment voices while extracting preset catalogs into dedicated per-voice files.

**Architecture:** Introduce a `Player` interface and a new `SynthPlayer` class that parallels `SamplerPlayer`, letting voices swap between sampled and synthesised presets through one interface. Each voice's preset catalog moves into `src/songs/voices/presets/*Presets.ts` as a discriminated union keyed by `kind: 'sampled' | 'synth'`. Existing inline `OscillatorNode` fallback code in each voice is deleted (synths replace it).

**Tech Stack:** TypeScript, React 19, Vite, Tone.js v15, Vitest. Samples CDN-hosted at `nbrosowsky.github.io` and `tonejs.github.io/audio/salamander/`.

**Spec:** [docs/superpowers/specs/2026-04-22-song-preset-sounds-design.md](../specs/2026-04-22-song-preset-sounds-design.md)

---

## Context for the implementer

You're working in `src/songs/`. Key files to know before starting:

- [src/songs/voices/ToneVoiceBase.ts](../../../src/songs/voices/ToneVoiceBase.ts) — abstract base class each voice extends. Owns `filterNode` (BiquadFilter, lowpass) and `outputGain` (GainNode). Players connect to `this.filterNode`.
- [src/songs/voices/SamplerPlayer.ts](../../../src/songs/voices/SamplerPlayer.ts) — existing Tone.Sampler wrapper. Its public API shape (`isReady`, `triggerAttack`, `triggerAttackRelease`, `releaseAll`, `dispose`) is exactly what `Player` will require.
- [src/songs/voices/ChordPadVoice.ts](../../../src/songs/voices/ChordPadVoice.ts), [MelodicVoice.ts](../../../src/songs/voices/MelodicVoice.ts), [ArpeggioVoice.ts](../../../src/songs/voices/ArpeggioVoice.ts), [BassSynthVoice.ts](../../../src/songs/voices/BassSynthVoice.ts) — each has an inline `PRESETS` record and ~20–30 lines of oscillator fallback code that will be deleted.
- [src/songs/SongPresetEngine.ts](../../../src/songs/SongPresetEngine.ts) — top-level engine. Holds default preset keys at lines 192–197.
- [src/__tests__/setup.ts](../../../src/__tests__/setup.ts) — Vitest setup. Has minimal AudioContext mock. Tests that mock Tone.js directly work best.

**Scripts:**
- `npm run lint` = `tsc --noEmit` (type-check only, no runtime tests)
- `npm run test:run` = `vitest run` (Vitest suite)

**Commit convention:** look at recent commits (`git log --oneline -20`) — the project uses conventional-commit-ish short messages. Use `feat:`, `refactor:`, `test:`, `chore:` prefixes. Co-author footer is already configured by project conventions.

---

## File structure after this plan

**New files:**
```
src/songs/voices/SynthPlayer.ts          # Player interface + SynthPlayer class
src/songs/voices/presets/chordPadPresets.ts
src/songs/voices/presets/melodyPresets.ts
src/songs/voices/presets/arpeggioPresets.ts
src/songs/voices/presets/bassPresets.ts
src/__tests__/SynthPlayer.test.ts
src/__tests__/presetCatalogs.test.ts
scripts/verify-sample-cdn.mjs
```

**Modified files:**
```
src/songs/voices/SamplerPlayer.ts         # Swap FluidR3 for nbrosowsky; implement Player
src/songs/voices/ChordPadVoice.ts         # Import catalog; delete osc fallback
src/songs/voices/MelodicVoice.ts          # Import catalog; delete osc fallback
src/songs/voices/ArpeggioVoice.ts         # Import catalog; delete osc fallback
src/songs/voices/BassSynthVoice.ts        # Import catalog; delete osc fallback
src/songs/SongPresetEngine.ts             # Update default preset keys
package.json                              # Add verify:samples script
```

---

## Task 1: Create the `Player` interface and `SynthPlayer` class

**Files:**
- Create: `src/songs/voices/SynthPlayer.ts`
- Test: `src/__tests__/SynthPlayer.test.ts`

- [ ] **Step 1.1: Write the failing unit test**

Create `src/__tests__/SynthPlayer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tone.js — we don't need a real audio context, just assertions about calls.
vi.mock('tone', () => {
  const disposeFn = vi.fn();
  const connectFn = vi.fn();
  const startFn = vi.fn();
  const triggerAttackFn = vi.fn();
  const triggerAttackReleaseFn = vi.fn();
  const releaseAllFn = vi.fn();
  const triggerReleaseFn = vi.fn();

  const mkSynth = () => ({
    connect: connectFn,
    dispose: disposeFn,
    triggerAttack: triggerAttackFn,
    triggerAttackRelease: triggerAttackReleaseFn,
    releaseAll: releaseAllFn,
    triggerRelease: triggerReleaseFn,
    set: vi.fn(),
    maxPolyphony: 8,
  });

  const PolySynth = vi.fn().mockImplementation(mkSynth);
  const FMSynth = vi.fn().mockImplementation(mkSynth);
  const AMSynth = vi.fn().mockImplementation(mkSynth);
  const MonoSynth = vi.fn().mockImplementation(mkSynth);
  const DuoSynth = vi.fn().mockImplementation(mkSynth);
  const Synth = vi.fn().mockImplementation(mkSynth);

  const Chorus = vi.fn().mockImplementation(() => ({
    start: startFn.mockReturnThis(),
    connect: connectFn,
    dispose: disposeFn,
  }));

  return {
    PolySynth, FMSynth, AMSynth, MonoSynth, DuoSynth, Synth, Chorus,
    Frequency: vi.fn(() => ({ toFrequency: () => 440, toNote: () => 'A4' })),
    now: vi.fn(() => 0),
    __mocks: { disposeFn, connectFn, triggerAttackFn, triggerAttackReleaseFn, releaseAllFn, triggerReleaseFn },
  };
});

import * as Tone from 'tone';
import { SynthPlayer, type Player } from '../songs/voices/SynthPlayer';

const fakeDestination = {} as AudioNode;

describe('SynthPlayer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is always ready immediately after construction', () => {
    const p = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    expect(p.isReady()).toBe(true);
  });

  it('constructs a PolySynth for kind="poly"', () => {
    new SynthPlayer({ kind: 'poly' }, fakeDestination);
    expect(Tone.PolySynth).toHaveBeenCalledOnce();
  });

  it('constructs an FMSynth for kind="fm"', () => {
    new SynthPlayer({ kind: 'fm' }, fakeDestination);
    expect(Tone.FMSynth).toHaveBeenCalledOnce();
  });

  it('constructs an AMSynth for kind="am"', () => {
    new SynthPlayer({ kind: 'am' }, fakeDestination);
    expect(Tone.AMSynth).toHaveBeenCalledOnce();
  });

  it('constructs a MonoSynth for kind="mono"', () => {
    new SynthPlayer({ kind: 'mono' }, fakeDestination);
    expect(Tone.MonoSynth).toHaveBeenCalledOnce();
  });

  it('constructs a DuoSynth for kind="duo"', () => {
    new SynthPlayer({ kind: 'duo' }, fakeDestination);
    expect(Tone.DuoSynth).toHaveBeenCalledOnce();
  });

  it('inserts a Chorus when chorusDepth > 0', () => {
    new SynthPlayer({ kind: 'fm', chorusDepth: 0.5 }, fakeDestination);
    expect(Tone.Chorus).toHaveBeenCalledOnce();
  });

  it('skips Chorus when chorusDepth is absent or 0', () => {
    new SynthPlayer({ kind: 'fm' }, fakeDestination);
    expect(Tone.Chorus).not.toHaveBeenCalled();
  });

  it('triggerAttack forwards to the underlying synth', () => {
    const p = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    p.triggerAttack(60, 0.7);
    const { triggerAttackFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    expect(triggerAttackFn).toHaveBeenCalledOnce();
  });

  it('triggerAttackRelease forwards to the underlying synth', () => {
    const p = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    p.triggerAttackRelease(60, 0.5, 0, 0.8);
    const { triggerAttackReleaseFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    expect(triggerAttackReleaseFn).toHaveBeenCalledOnce();
  });

  it('releaseAll calls releaseAll on PolySynth', () => {
    const p = new SynthPlayer({ kind: 'poly' }, fakeDestination);
    p.releaseAll();
    const { releaseAllFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    expect(releaseAllFn).toHaveBeenCalledOnce();
  });

  it('releaseAll calls triggerRelease on monophonic synths', () => {
    const p = new SynthPlayer({ kind: 'mono' }, fakeDestination);
    p.releaseAll();
    const { triggerReleaseFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    expect(triggerReleaseFn).toHaveBeenCalledOnce();
  });

  it('dispose marks player as not ready and disposes the synth', () => {
    const p = new SynthPlayer({ kind: 'fm', chorusDepth: 0.5 }, fakeDestination);
    p.dispose();
    expect(p.isReady()).toBe(false);
    const { disposeFn } = (Tone as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> }).__mocks;
    // Synth + Chorus both disposed
    expect(disposeFn).toHaveBeenCalledTimes(2);
  });

  it('dispose is idempotent', () => {
    const p = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    p.dispose();
    expect(() => p.dispose()).not.toThrow();
  });

  it('Player interface is satisfied by SynthPlayer', () => {
    const p: Player = new SynthPlayer({ kind: 'fm' }, fakeDestination);
    expect(typeof p.isReady).toBe('function');
    expect(typeof p.triggerAttack).toBe('function');
    expect(typeof p.triggerAttackRelease).toBe('function');
    expect(typeof p.releaseAll).toBe('function');
    expect(typeof p.dispose).toBe('function');
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `npm run test:run -- SynthPlayer`

Expected: FAIL — `Cannot find module '../songs/voices/SynthPlayer'` or similar.

- [ ] **Step 1.3: Create SynthPlayer.ts with the Player interface and class**

Create `src/songs/voices/SynthPlayer.ts`:

```ts
/**
 * SynthPlayer.ts — Tone.js synthesis wrapper that implements the shared Player
 * interface alongside SamplerPlayer.
 *
 * Voices treat SamplerPlayer and SynthPlayer interchangeably — they both
 * expose the same trigger/release/dispose methods. Synth presets have no
 * loading phase (isReady() === true immediately), so the oscillator fallback
 * code previously needed per-voice is no longer required.
 */

import * as Tone from 'tone';

// ============================================
// Shared Player interface
// ============================================

export interface Player {
  /** True when the player can receive trigger calls without being ignored. */
  isReady(): boolean;
  /** Sustain-mode attack — used by chord pads. Call releaseAll() to stop. */
  triggerAttack(midi: number, velocity?: number): void;
  /** Trigger a note with a scheduled release — used by melody, arp, bass. */
  triggerAttackRelease(midi: number, duration: number, time?: number, velocity?: number): void;
  /** Release all currently held notes. */
  releaseAll(): void;
  /** Dispose of all audio nodes. */
  dispose(): void;
}

// ============================================
// SynthPlayer types
// ============================================

export type SynthKind = 'poly' | 'fm' | 'am' | 'mono' | 'duo';

export interface SynthConfig {
  kind: SynthKind;
  /** Polyphony for 'poly' kind (default 8). Ignored for monophonic kinds. */
  polyphony?: number;
  /** Inner voice type for 'poly' kind (default Tone.Synth). */
  polyVoice?: 'synth' | 'fm' | 'am';
  /** Options forwarded to the underlying Tone constructor. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any;
  /** If > 0, inserts a Tone.Chorus between synth and destination (0..1). */
  chorusDepth?: number;
}

// Internal — union of the Tone synth types SynthPlayer can wrap.
type AnyToneSynth =
  | Tone.PolySynth
  | Tone.FMSynth
  | Tone.AMSynth
  | Tone.MonoSynth
  | Tone.DuoSynth;

// ============================================
// SynthPlayer
// ============================================

export class SynthPlayer implements Player {
  private synth: AnyToneSynth;
  private chorus: Tone.Chorus | null = null;
  private disposed = false;

  constructor(config: SynthConfig, destination: AudioNode) {
    this.synth = this.createSynth(config);

    let terminal: Tone.ToneAudioNode = this.synth;
    if (config.chorusDepth && config.chorusDepth > 0) {
      this.chorus = new Tone.Chorus({
        frequency: 1.5,
        delayTime: 3.5,
        depth: config.chorusDepth,
        feedback: 0.1,
        spread: 180,
      }).start();
      this.synth.connect(this.chorus);
      terminal = this.chorus;
    }
    // Tone.js accepts AudioNode as connect target in v15.
    terminal.connect(destination);
  }

  private createSynth(config: SynthConfig): AnyToneSynth {
    switch (config.kind) {
      case 'poly': {
        const inner =
          config.polyVoice === 'fm' ? Tone.FMSynth :
          config.polyVoice === 'am' ? Tone.AMSynth :
          Tone.Synth;
        // Use .set() — PolySynth constructor's second-arg options differs
        // between Tone.js versions; .set() is stable across v14/v15.
        const poly = new Tone.PolySynth(inner);
        if (config.options) poly.set(config.options);
        if (config.polyphony) poly.maxPolyphony = config.polyphony;
        return poly;
      }
      case 'fm':   return new Tone.FMSynth(config.options);
      case 'am':   return new Tone.AMSynth(config.options);
      case 'mono': return new Tone.MonoSynth(config.options);
      case 'duo':  return new Tone.DuoSynth(config.options);
    }
  }

  isReady(): boolean { return !this.disposed; }

  triggerAttack(midi: number, velocity = 0.8): void {
    if (this.disposed) return;
    const freq = Tone.Frequency(midi, 'midi').toFrequency();
    this.synth.triggerAttack(freq, Tone.now(), velocity);
  }

  triggerAttackRelease(midi: number, duration: number, time?: number, velocity = 0.8): void {
    if (this.disposed) return;
    const freq = Tone.Frequency(midi, 'midi').toFrequency();
    this.synth.triggerAttackRelease(freq, duration, time ?? Tone.now(), velocity);
  }

  releaseAll(): void {
    if (this.disposed) return;
    // PolySynth has releaseAll(); monophonic synths use triggerRelease().
    if ('releaseAll' in this.synth && typeof this.synth.releaseAll === 'function') {
      (this.synth as Tone.PolySynth).releaseAll();
    } else {
      (this.synth as Tone.MonoSynth).triggerRelease(Tone.now());
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.synth.dispose();
    this.chorus?.dispose();
  }
}
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `npm run test:run -- SynthPlayer`

Expected: PASS — all 14 tests green.

- [ ] **Step 1.5: Run type-check**

Run: `npm run lint`

Expected: No errors.

- [ ] **Step 1.6: Commit**

```bash
git add src/songs/voices/SynthPlayer.ts src/__tests__/SynthPlayer.test.ts
git commit -m "$(cat <<'EOF'
feat: add SynthPlayer wrapping Tone.js synths + shared Player interface

Introduces a unified Player interface so SamplerPlayer and the new
SynthPlayer can be used interchangeably by voices. Supports poly/fm/am/
mono/duo synth kinds with optional Tone.Chorus insert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update `SamplerPlayer` — implement `Player`, swap FluidR3 for nbrosowsky

**Files:**
- Modify: `src/songs/voices/SamplerPlayer.ts`

Existing public API of `SamplerPlayer` already matches the `Player` interface shape. This task makes the relationship explicit and replaces the FluidR3 sample URL map.

- [ ] **Step 2.1: Declare `implements Player` on SamplerPlayer**

In `src/songs/voices/SamplerPlayer.ts`, update the import and class signature.

Replace the top imports (around line 10):

```ts
import * as Tone from 'tone';
import type { Player } from './SynthPlayer';
```

Replace the class declaration (around line 29):

```ts
export class SamplerPlayer implements Player {
```

- [ ] **Step 2.2: Rewrite the CDN base and SAMPLE_CONFIGS**

Replace the entire block from `// CDN base URLs` onward (lines 80 to end) with:

```ts
// ============================================
// CDN base URLs
// ============================================

export const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';

const nbrosowskyBase = (instrument: string): string =>
  `https://nbrosowsky.github.io/tonejs-instruments/samples/${instrument}/`;

// ============================================
// Shared note URL maps (relative to base URL)
// ============================================

const A_NOTES_3_4_5: Record<string, string> = { A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3' };
const A_NOTES_2_3_4: Record<string, string> = { A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3' };
const A_NOTES_3_4:   Record<string, string> = { A3: 'A3.mp3', A4: 'A4.mp3' };
const A_NOTES_1_2:   Record<string, string> = { A1: 'A1.mp3', A2: 'A2.mp3' };

// ============================================
// Per-instrument sample configs
//
// Every entry here is used by exactly one preset in a presets/*Presets.ts file.
// Adding a new entry: just append below.  Removing: delete here AND from any
// catalog that references it (the catalog is discriminated-union typed so the
// compiler will flag unreferenced keys).
// ============================================

export const SAMPLE_CONFIGS = {
  // Piano (Salamander — kept, best-in-class)
  piano:       { urls: A_NOTES_3_4_5, baseUrl: SALAMANDER_BASE,               attack: 0.005, release: 1.5 },

  // Strings section (nbrosowsky)
  violin:      { urls: A_NOTES_3_4_5, baseUrl: nbrosowskyBase('violin'),      attack: 0.1,   release: 0.4 },
  cello:       { urls: A_NOTES_2_3_4, baseUrl: nbrosowskyBase('cello'),       attack: 0.15,  release: 0.5 },
  contrabass:  { urls: A_NOTES_1_2,   baseUrl: nbrosowskyBase('contrabass'),  attack: 0.05,  release: 0.4 },

  // Winds (nbrosowsky)
  clarinet:    { urls: A_NOTES_3_4,   baseUrl: nbrosowskyBase('clarinet'),    attack: 0.08,  release: 0.3 },
  frenchHorn:  { urls: A_NOTES_3_4,   baseUrl: nbrosowskyBase('french-horn'), attack: 0.1,   release: 0.4 },
  tuba:        { urls: A_NOTES_1_2,   baseUrl: nbrosowskyBase('tuba'),        attack: 0.08,  release: 0.4 },

  // Plucked (nbrosowsky)
  harp:        { urls: A_NOTES_3_4_5, baseUrl: nbrosowskyBase('harp'),        attack: 0.005, release: 0.8 },
  guitarNylon: { urls: A_NOTES_3_4_5, baseUrl: nbrosowskyBase('guitar-nylon'),attack: 0.005, release: 0.3 },

  // Keys (nbrosowsky)
  organ:       { urls: A_NOTES_2_3_4, baseUrl: nbrosowskyBase('organ'),       attack: 0.01,  release: 0.3 },
} as const satisfies Record<string, SamplerPlayerOptions>;

// Convenience: legal sample config keys.
export type SampleConfigKey = keyof typeof SAMPLE_CONFIGS;
```

**Deleted:** every `fluidR3Base(...)` call and every FluidR3-sourced entry (`ePiano`, `stabPad`, `strings`, `bell`, `warmPad`, `pizz`, `flute`, `guitar`, `vibes`, `aBass`, `eBass`, `slapBass`, `pickBass`). The old `fluidR3Base` helper is gone too.

- [ ] **Step 2.3: Run type-check**

Run: `npm run lint`

Expected: **errors** — the voice files still reference removed keys like `sampleKey: 'bell'` and `sampleKey: 'aBass'`. That's fine, we fix each voice in subsequent tasks. The `Player` interface declaration and the new SAMPLE_CONFIGS shape should type-check cleanly on their own. If there are errors inside `SamplerPlayer.ts` itself (not in consumer files), fix them now.

- [ ] **Step 2.4: Commit**

Commit even though consumer files still break — this is a deliberate mid-refactor checkpoint. The next four tasks each fix one consumer voice.

```bash
git add src/songs/voices/SamplerPlayer.ts
git commit -m "$(cat <<'EOF'
refactor: swap FluidR3 samples for nbrosowsky; SamplerPlayer implements Player

Replaces the General MIDI soundfont URLs with the significantly higher
quality nbrosowsky/tonejs-instruments library. Salamander-sourced
piano stays. Removed configs (bell, ePiano, stabPad, strings, flute, pizz,
guitar, vibes, aBass, eBass, slapBass, pickBass) are now synthesised in
their respective preset catalogs instead of sampled.

Voice files still reference removed keys and will not compile — fixed in
the next four commits (one per voice).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Chord Pad — create catalog, refactor ChordPadVoice

**Files:**
- Create: `src/songs/voices/presets/chordPadPresets.ts`
- Modify: `src/songs/voices/ChordPadVoice.ts`

- [ ] **Step 3.1: Create the chord pad preset catalog**

Create `src/songs/voices/presets/chordPadPresets.ts`:

```ts
/**
 * Chord Pad presets (🔴 Red voice).
 *
 * Each preset is a discriminated union on `kind`:
 *   - 'sampled': plays via SamplerPlayer using a SAMPLE_CONFIGS entry
 *   - 'synth':   plays via SynthPlayer using a SynthConfig
 *
 * Voice-specific playback params (sustained, decayTC, gainPerNote) are on
 * BOTH variants — they control how the voice triggers and releases notes
 * and are independent of whether the sound comes from a sample or a synth.
 */

import type { SampleConfigKey } from '../SamplerPlayer';
import type { SynthConfig } from '../SynthPlayer';

// ============================================
// Types
// ============================================

interface PadPresetCommon {
  name: string;
  /** If true, voice holds notes until release; if false, notes decay. */
  sustained: boolean;
  /** setTargetAtTime time constant for the decay envelope when !sustained. */
  decayTC: number;
  /** Base gain applied per-note before velocity scaling. */
  gainPerNote: number;
}

export type PadPreset =
  | (PadPresetCommon & { kind: 'sampled'; sampleKey: SampleConfigKey })
  | (PadPresetCommon & { kind: 'synth';   synthConfig: SynthConfig });

// ============================================
// Presets
// ============================================

export const PAD_PRESETS: Record<string, PadPreset> = {
  warmPad: {
    kind: 'synth',
    name: 'Warm Pad',
    sustained: true, decayTC: 0, gainPerNote: 0.12,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'synth',
      options: {
        oscillator: { type: 'sawtooth', spread: 20, count: 3 },
        envelope: { attack: 0.6, decay: 0.2, sustain: 0.9, release: 2 },
      },
      chorusDepth: 0.4,
    },
  },
  rhodesEP: {
    kind: 'synth',
    name: 'Rhodes EP',
    sustained: true, decayTC: 0, gainPerNote: 0.16,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'fm',
      options: {
        harmonicity: 3,
        modulationIndex: 10,
        envelope: { attack: 0.005, decay: 2.0, sustain: 0.3, release: 1.5 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 0.5 },
      },
      chorusDepth: 0.5,
    },
  },
  strings: {
    kind: 'synth',
    name: 'Strings',
    sustained: true, decayTC: 0, gainPerNote: 0.10,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'synth',
      options: {
        oscillator: { type: 'sawtooth', spread: 30, count: 5 },
        envelope: { attack: 1.2, decay: 0.3, sustain: 0.8, release: 2.5 },
      },
      chorusDepth: 0.3,
    },
  },
  choir: {
    kind: 'synth',
    name: 'Choir',
    sustained: true, decayTC: 0, gainPerNote: 0.13,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'am',
      options: {
        harmonicity: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.8, decay: 0.4, sustain: 0.9, release: 2 },
        modulation: { type: 'sine' },
      },
      chorusDepth: 0.5,
    },
  },
  glassPad: {
    kind: 'synth',
    name: 'Glass Pad',
    sustained: true, decayTC: 0, gainPerNote: 0.11,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'fm',
      options: {
        harmonicity: 8,
        modulationIndex: 4,
        envelope: { attack: 0.4, decay: 0.4, sustain: 0.7, release: 3 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 1 },
      },
      chorusDepth: 0.4,
    },
  },
  organ: {
    kind: 'sampled',
    name: 'Organ',
    sustained: true, decayTC: 0, gainPerNote: 0.14,
    sampleKey: 'organ',
  },
  stab: {
    kind: 'synth',
    name: 'Stab',
    sustained: false, decayTC: 0.15, gainPerNote: 0.18,
    synthConfig: {
      kind: 'poly', polyphony: 8, polyVoice: 'synth',
      options: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.3 },
      },
    },
  },
};

export const PAD_PRESET_LIST: { key: string; name: string }[] =
  Object.entries(PAD_PRESETS).map(([key, p]) => ({ key, name: p.name }));
```

- [ ] **Step 3.2: Refactor ChordPadVoice to use the catalog and Player interface**

Open `src/songs/voices/ChordPadVoice.ts`. This is a substantial rewrite of the file. Below is the full replacement content — delete everything in the file and write this in:

```ts
/**
 * ChordPadVoice.ts — Red object: chord pad with event-based triggering.
 *
 * Retriggers on velocity threshold crossing, chord change, or object re-entry.
 * Instrument preset (sampled or synthesised) controls tone colour; voice-level
 * params (sustained, decayTC, gainPerNote) control how notes are triggered.
 *
 * Controls:
 *   Horizontal (X): Voicing spread (close → standard → wide)
 *   Vertical (Y):   Filter cutoff (brightness) + continuous volume swell
 *   Velocity:       Attack time + loudness
 */

import type { ChordEntry } from './chordLookup';
import {
  ToneVoiceBase,
  lerp,
  logFreq,
  clamp,
  FILTER_MIN_HZ,
  FILTER_MAX_HZ,
  LEFT_THRESHOLD,
  RIGHT_THRESHOLD,
} from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import { SynthPlayer, type Player } from './SynthPlayer';
import { PAD_PRESETS, PAD_PRESET_LIST, type PadPreset } from './presets/chordPadPresets';

export { PAD_PRESET_LIST };

// ============================================
// Constants
// ============================================

const FILTER_LERP = 0.18;
const MIN_RETRIGGER_INTERVAL = 0.25;

function xZone(posX: number): 'left' | 'center' | 'right' {
  if (posX < LEFT_THRESHOLD) return 'left';
  if (posX > RIGHT_THRESHOLD) return 'right';
  return 'center';
}

// ============================================
// ChordPadVoice
// ============================================

export class ChordPadVoice extends ToneVoiceBase {
  private currentChordName: string | null = null;
  private filterCutoff = FILTER_MAX_HZ;
  private lastRetriggerTime = 0;
  private currentPreset: PadPreset = PAD_PRESETS['warmPad'];
  private player: Player;

  private currentZone: 'left' | 'center' | 'right' = 'center';

  /** Swell gain inserted between filterNode and outputGain. */
  private swellGain: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);

    this.swellGain = ctx.createGain();
    this.swellGain.gain.value = 1;
    this.filterNode.disconnect();
    this.filterNode.connect(this.swellGain);
    this.swellGain.connect(this.outputGain);

    this.player = this.createPlayer(this.currentPreset);
  }

  override setPreset(key: string): void {
    const preset = PAD_PRESETS[key];
    if (!preset) return;
    this.currentPreset = preset;
    this.player.dispose();
    this.player = this.createPlayer(preset);
  }

  private createPlayer(preset: PadPreset): Player {
    return preset.kind === 'sampled'
      ? new SamplerPlayer(SAMPLE_CONFIGS[preset.sampleKey], this.filterNode)
      : new SynthPlayer(preset.synthConfig, this.filterNode);
  }

  update(_playbackTime: number, chord: ChordEntry | null, velocity: number): void {
    if (!chord) return;
    if (this.isSilent() && !this.active) return;

    const now = this.ctx.currentTime;
    let shouldRetrigger = false;

    if (chord.name !== this.currentChordName) {
      this.currentChordName = chord.name;
      shouldRetrigger = true;
    }

    const zone = xZone(this.posX);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      shouldRetrigger = true;
    }

    if (shouldRetrigger && (now - this.lastRetriggerTime) >= MIN_RETRIGGER_INTERVAL) {
      this.retriggerChord(chord, velocity);
      this.lastRetriggerTime = now;
    }

    // Y axis → continuous volume swell (top = full, bottom = ~20%)
    const swellTarget = clamp(0.2 + (1 - this.posY) * 0.8, 0.2, 1.0);
    this.swellGain.gain.value = lerp(this.swellGain.gain.value, swellTarget, 0.1);

    // Y axis → filter brightness (brighter at top)
    const filterNorm = 1 - this.posY;
    const targetHz = logFreq(filterNorm, FILTER_MIN_HZ, FILTER_MAX_HZ);
    this.filterCutoff = lerp(this.filterCutoff, targetHz, FILTER_LERP);
    this.filterNode.frequency.value = this.filterCutoff;
  }

  onTransportStop(): void {
    this.releaseAll();
    this.currentChordName = null;
    this.lastRetriggerTime = 0;
  }

  dispose(): void {
    this.player.dispose();
    this.releaseAll();
    this.swellGain.disconnect();
    this.disposeBase();
  }

  // ---- Internal ----

  private retriggerChord(chord: ChordEntry, velocity: number): void {
    const p = this.currentPreset;
    const noteVelocity = clamp(0.3 + velocity * 0.7, 0.3, 1.0);
    const voicedNotes = this.applyVoicing(chord.notes);

    if (!this.player.isReady()) return;

    this.player.releaseAll();
    for (const midi of voicedNotes) {
      if (p.sustained) {
        this.player.triggerAttack(midi, noteVelocity);
      } else {
        this.player.triggerAttackRelease(midi, 0.4, undefined, noteVelocity);
      }
    }
    this.onNoteTrigger?.();
  }

  private releaseAll(): void {
    this.player.releaseAll();
  }

  private applyVoicing(notes: number[]): number[] {
    if (notes.length === 0) return notes;

    if (this.posX < LEFT_THRESHOLD) {
      const base = notes[0];
      return notes.map((note) => {
        let n = note;
        while (n - base >= 12) n -= 12;
        return n;
      });
    } else if (this.posX > RIGHT_THRESHOLD) {
      return notes.map((note, i) => {
        if (i === 0) return note;
        return note + Math.floor(i / 2) * 12;
      });
    }
    return [...notes];
  }
}
```

**Deleted:** ~60 lines of oscillator fallback (`createNoteOsc`, `activeNoteNodes`, per-note GainNode management). Synth presets handle envelope themselves via `SynthConfig.options.envelope`.

- [ ] **Step 3.3: Run type-check**

Run: `npm run lint`

Expected: Still has errors from the other three voices (MelodicVoice, ArpeggioVoice, BassSynthVoice) referencing removed SAMPLE_CONFIGS keys. ChordPadVoice and its new catalog should be error-free. If the lint output shows errors *inside* ChordPadVoice.ts or chordPadPresets.ts, fix them before continuing.

- [ ] **Step 3.4: Commit**

```bash
git add src/songs/voices/presets/chordPadPresets.ts src/songs/voices/ChordPadVoice.ts
git commit -m "$(cat <<'EOF'
refactor(chord-pad): extract preset catalog; unify on Player interface

Adds presets/chordPadPresets.ts with 7 presets (was 4): Warm Pad,
Rhodes EP, Strings, Choir, Glass Pad, Organ, Stab. 6 are synthesised
via new SynthPlayer; Organ uses nbrosowsky sample.

ChordPadVoice now swaps SamplerPlayer and SynthPlayer through the
shared Player interface. ~60 lines of oscillator fallback deleted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Melody — create catalog, refactor MelodicVoice

**Files:**
- Create: `src/songs/voices/presets/melodyPresets.ts`
- Modify: `src/songs/voices/MelodicVoice.ts`

- [ ] **Step 4.1: Create the melody preset catalog**

Create `src/songs/voices/presets/melodyPresets.ts`:

```ts
/**
 * Melody presets (🟢 Green voice).
 *
 * Triggered on pentatonic band-crossing. Single-voice line, so most presets
 * use a monophonic synth shape; the poly case (celesta) is harmless and
 * keeps overlap sound correct.
 */

import type { SampleConfigKey } from '../SamplerPlayer';
import type { SynthConfig } from '../SynthPlayer';

interface MelodyPresetCommon {
  name: string;
  /** Nominal note duration in seconds (used for triggerAttackRelease). */
  duration: number;
}

export type MelodyPreset =
  | (MelodyPresetCommon & { kind: 'sampled'; sampleKey: SampleConfigKey })
  | (MelodyPresetCommon & { kind: 'synth';   synthConfig: SynthConfig });

export const MELODY_PRESETS: Record<string, MelodyPreset> = {
  celesta: {
    kind: 'synth',
    name: 'Celesta',
    duration: 1.8,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 5,
        modulationIndex: 6,
        envelope: { attack: 0.005, decay: 1.5, sustain: 0, release: 0.6 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.3 },
      },
      chorusDepth: 0.25,
    },
  },
  violin:     { kind: 'sampled', name: 'Violin',      duration: 2.5, sampleKey: 'violin' },
  cello:      { kind: 'sampled', name: 'Cello',       duration: 2.5, sampleKey: 'cello' },
  clarinet:   { kind: 'sampled', name: 'Clarinet',    duration: 2.0, sampleKey: 'clarinet' },
  frenchHorn: { kind: 'sampled', name: 'French Horn', duration: 2.2, sampleKey: 'frenchHorn' },
  nylonPluck: { kind: 'sampled', name: 'Nylon Pluck', duration: 1.5, sampleKey: 'guitarNylon' },
  musicBox: {
    kind: 'synth',
    name: 'Music Box',
    duration: 1.6,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 7,
        modulationIndex: 3,
        envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 0.4 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.2 },
      },
      chorusDepth: 0.2,
    },
  },
};

export const MELODY_PRESET_LIST: { key: string; name: string }[] =
  Object.entries(MELODY_PRESETS).map(([key, p]) => ({ key, name: p.name }));
```

- [ ] **Step 4.2: Refactor MelodicVoice**

Read `src/songs/voices/MelodicVoice.ts` in full first to understand its note-trigger logic. Then edit to replace the PRESETS block, player management, and fallback code.

Update the imports at the top:

```ts
import type { ChordEntry } from './chordLookup';
import { noteToFrequency, D_MAJOR_PENTATONIC } from './chordLookup';
import { EighthNoteQuantizer } from './quantizer';
import { ToneVoiceBase, clamp } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import { SynthPlayer, type Player } from './SynthPlayer';
import { MELODY_PRESETS, MELODY_PRESET_LIST, type MelodyPreset } from './presets/melodyPresets';

export { MELODY_PRESET_LIST };
```

Delete the entire inline `PRESETS` record, the `MELODY_PRESET_LIST` export, and the `MelodyPreset` interface near the top of the file.

Update the class members and constructor:

```ts
export class MelodicVoice extends ToneVoiceBase {
  private quantizer: EighthNoteQuantizer;
  private currentPreset: MelodyPreset = MELODY_PRESETS['celesta'];
  private player: Player;

  private currentZoneIndex = -1;
  private currentOctaveShift = 0;
  private pendingNote: number | null = null;
  private nextTriggerTime = 0;
  private lastTriggeredTime = 0;
  private referenceTime = 0;

  constructor(ctx: AudioContext, bpm: number) {
    super(ctx);
    this.quantizer = new EighthNoteQuantizer(bpm);
    this.player = this.createPlayer(this.currentPreset);
  }

  override setPreset(key: string): void {
    const preset = MELODY_PRESETS[key];
    if (!preset) return;
    this.currentPreset = preset;
    this.player.dispose();
    this.player = this.createPlayer(preset);
  }

  private createPlayer(preset: MelodyPreset): Player {
    return preset.kind === 'sampled'
      ? new SamplerPlayer(SAMPLE_CONFIGS[preset.sampleKey], this.filterNode)
      : new SynthPlayer(preset.synthConfig, this.filterNode);
  }
```

For the `triggerNote` method (wherever it exists — it was calling `samplerPlayer.triggerAttackRelease` or building oscillators), replace it with a single call through `this.player`. Find the method (look for `triggerAttackRelease` or the oscillator-creation code — the file has a private method around the middle). Replace its body with:

```ts
  private triggerNote(midi: number, velocity: number, time?: number): void {
    if (!this.player.isReady()) return;
    const noteVelocity = clamp(0.4 + velocity * 0.6, 0.4, 1.0);
    this.player.triggerAttackRelease(midi, this.currentPreset.duration, time, noteVelocity);
    this.onNoteTrigger?.();
  }
```

**Preserve existing logic for:** note selection (5-band pentatonic → midi), octave shift from Y, quantizer timing, `setReferenceTime`, `setBpm`, `setBeatTimestamps`. Only the preset config lookup and the note-playing machinery change.

**Delete:** any `vibratoLfo`, `vibratoGain`, oscillator-building helpers, and the `PRESETS` and `MelodyPreset` local type.

`dispose()` becomes:

```ts
  dispose(): void {
    this.player.dispose();
    this.disposeBase();
  }
```

- [ ] **Step 4.3: Run type-check on just the modified files**

Run: `npm run lint`

Expected: Still errors in ArpeggioVoice and BassSynthVoice. MelodicVoice and melodyPresets should be clean.

- [ ] **Step 4.4: Commit**

```bash
git add src/songs/voices/presets/melodyPresets.ts src/songs/voices/MelodicVoice.ts
git commit -m "$(cat <<'EOF'
refactor(melody): extract preset catalog; unify on Player interface

Adds presets/melodyPresets.ts with 7 presets (was 4): Celesta, Violin,
Cello, Clarinet, French Horn, Nylon Pluck, Music Box. 5 sampled via
nbrosowsky, 2 synthesised. Generic "Bell" replaced by FM-synth Celesta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Arpeggio — create catalog, refactor ArpeggioVoice

**Files:**
- Create: `src/songs/voices/presets/arpeggioPresets.ts`
- Modify: `src/songs/voices/ArpeggioVoice.ts`

- [ ] **Step 5.1: Create the arpeggio preset catalog**

Create `src/songs/voices/presets/arpeggioPresets.ts`:

```ts
/**
 * Arpeggio presets (🟡 Yellow voice).
 *
 * Triggered step-by-step on the 8th-note grid. Short notes — decay, not sustain.
 */

import type { SampleConfigKey } from '../SamplerPlayer';
import type { SynthConfig } from '../SynthPlayer';

interface ArpPresetCommon {
  name: string;
  /** Nominal step note duration in seconds. */
  duration: number;
}

export type ArpPreset =
  | (ArpPresetCommon & { kind: 'sampled'; sampleKey: SampleConfigKey })
  | (ArpPresetCommon & { kind: 'synth';   synthConfig: SynthConfig });

export const ARP_PRESETS: Record<string, ArpPreset> = {
  piano:       { kind: 'sampled', name: 'Piano',         duration: 0.6, sampleKey: 'piano' },
  harp:        { kind: 'sampled', name: 'Harp',          duration: 0.8, sampleKey: 'harp' },
  nylonGuitar: { kind: 'sampled', name: 'Nylon Guitar',  duration: 0.5, sampleKey: 'guitarNylon' },
  vibes: {
    kind: 'synth',
    name: 'Vibes',
    duration: 1.2,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 4,
        modulationIndex: 2,
        envelope: { attack: 0.003, decay: 1.5, sustain: 0, release: 0.6 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.003, decay: 0.8, sustain: 0, release: 0.3 },
      },
      chorusDepth: 0.35,
    },
  },
  marimba: {
    kind: 'synth',
    name: 'Marimba',
    duration: 0.4,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 3,
        modulationIndex: 8,
        envelope: { attack: 0.003, decay: 0.3, sustain: 0, release: 0.2 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.003, decay: 0.15, sustain: 0, release: 0.1 },
      },
    },
  },
  musicBox: {
    kind: 'synth',
    name: 'Music Box',
    duration: 1.0,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 7,
        modulationIndex: 3,
        envelope: { attack: 0.005, decay: 0.9, sustain: 0, release: 0.3 },
        modulation: { type: 'triangle' },
        modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0, release: 0.2 },
      },
      chorusDepth: 0.2,
    },
  },
  pluckedSynth: {
    kind: 'synth',
    name: 'Plucked Synth',
    duration: 0.5,
    synthConfig: {
      kind: 'am',
      options: {
        harmonicity: 2,
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.003, decay: 0.4, sustain: 0, release: 0.2 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.003, decay: 0.3, sustain: 0, release: 0.1 },
      },
    },
  },
};

export const ARP_PRESET_LIST: { key: string; name: string }[] =
  Object.entries(ARP_PRESETS).map(([key, p]) => ({ key, name: p.name }));
```

- [ ] **Step 5.2: Refactor ArpeggioVoice**

Open `src/songs/voices/ArpeggioVoice.ts`. Update imports:

```ts
import type { ChordEntry } from './chordLookup';
import { noteToFrequency } from './chordLookup';
import {
  ToneVoiceBase,
  clamp,
  LEFT_THRESHOLD,
  RIGHT_THRESHOLD,
} from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import { SynthPlayer, type Player } from './SynthPlayer';
import { ARP_PRESETS, ARP_PRESET_LIST, type ArpPreset } from './presets/arpeggioPresets';

export { ARP_PRESET_LIST };
```

Delete the inline `PRESETS`, `ARP_PRESET_LIST`, and `ArpPreset` interface at the top of the file.

Update class members and constructor:

```ts
export class ArpeggioVoice extends ToneVoiceBase {
  private bpm: number;
  private currentPreset: ArpPreset = ARP_PRESETS['piano'];
  private player: Player;

  private patternNotes: number[] = [];
  private stepIndex = 0;
  private nextStepTime = 0;
  private currentChordName: string | null = null;
  private running = false;

  constructor(ctx: AudioContext, bpm: number) {
    super(ctx);
    this.bpm = bpm;
    this.player = this.createPlayer(this.currentPreset);
  }

  override setPreset(key: string): void {
    const preset = ARP_PRESETS[key];
    if (!preset) return;
    this.currentPreset = preset;
    this.player.dispose();
    this.player = this.createPlayer(preset);
  }

  private createPlayer(preset: ArpPreset): Player {
    return preset.kind === 'sampled'
      ? new SamplerPlayer(SAMPLE_CONFIGS[preset.sampleKey], this.filterNode)
      : new SynthPlayer(preset.synthConfig, this.filterNode);
  }
```

Find the step-scheduling method (look for `scheduledStops` or the place where `OscillatorNode` is created per step). Replace the per-step note playback with:

```ts
  private playStep(midi: number, velocity: number, time: number): void {
    if (!this.player.isReady()) return;
    const noteVelocity = clamp(0.5 + velocity * 0.5, 0.5, 1.0);
    this.player.triggerAttackRelease(midi, this.currentPreset.duration, time, noteVelocity);
  }
```

**Delete:** `scheduledStops` array, the `OscillatorNode` / `GainNode` creation loop, `decayMode`, `decayFactor`, `fixedTC`, `attack` fields (they were per-preset and are now baked into the synth/sampler envelopes). Keep: density logic (X position), range logic (Y position), chromatic elaboration logic (velocity), the `update()` scheduling loop itself.

`dispose()` becomes:

```ts
  dispose(): void {
    this.player.dispose();
    this.disposeBase();
  }
```

- [ ] **Step 5.3: Run type-check**

Run: `npm run lint`

Expected: Only BassSynthVoice errors remain. ArpeggioVoice and arpeggioPresets clean.

- [ ] **Step 5.4: Commit**

```bash
git add src/songs/voices/presets/arpeggioPresets.ts src/songs/voices/ArpeggioVoice.ts
git commit -m "$(cat <<'EOF'
refactor(arpeggio): extract preset catalog; unify on Player interface

Adds presets/arpeggioPresets.ts with 7 presets (was 4): Piano, Harp,
Nylon Guitar, Vibes, Marimba, Music Box, Plucked Synth. Harp and Nylon
Guitar upgraded from FluidR3 to nbrosowsky samples.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Bass — create catalog, refactor BassSynthVoice

**Files:**
- Create: `src/songs/voices/presets/bassPresets.ts`
- Modify: `src/songs/voices/BassSynthVoice.ts`

- [ ] **Step 6.1: Create the bass preset catalog**

Create `src/songs/voices/presets/bassPresets.ts`:

```ts
/**
 * Bass presets (🟠 Orange voice).
 *
 * Rhythmic bass hits. Monophonic by nature — mono synth is the right fit
 * for synth presets.
 */

import type { SampleConfigKey } from '../SamplerPlayer';
import type { SynthConfig } from '../SynthPlayer';

interface BassPresetCommon {
  name: string;
  /** Nominal hit duration in seconds. */
  duration: number;
}

export type BassPreset =
  | (BassPresetCommon & { kind: 'sampled'; sampleKey: SampleConfigKey })
  | (BassPresetCommon & { kind: 'synth';   synthConfig: SynthConfig });

export const BASS_PRESETS: Record<string, BassPreset> = {
  upright: { kind: 'sampled', name: 'Upright Bass', duration: 0.5, sampleKey: 'contrabass' },
  electric: {
    kind: 'synth',
    name: 'Electric Bass',
    duration: 0.4,
    synthConfig: {
      kind: 'mono',
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.2 },
        filter: { Q: 1, type: 'lowpass', rolloff: -12 },
        filterEnvelope: { attack: 0.002, decay: 0.15, sustain: 0.2, release: 0.2, baseFrequency: 200, octaves: 2.5 },
      },
    },
  },
  sub: {
    kind: 'synth',
    name: 'Sub Bass',
    duration: 0.6,
    synthConfig: {
      kind: 'mono',
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.4, sustain: 0.3, release: 0.3 },
        filter: { Q: 1, type: 'lowpass', rolloff: -24 },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.2, baseFrequency: 120, octaves: 1.5 },
      },
    },
  },
  fm: {
    kind: 'synth',
    name: 'FM Bass',
    duration: 0.4,
    synthConfig: {
      kind: 'fm',
      options: {
        harmonicity: 2,
        modulationIndex: 12,
        envelope: { attack: 0.003, decay: 0.3, sustain: 0.1, release: 0.15 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.003, decay: 0.1, sustain: 0, release: 0.1 },
      },
    },
  },
  moog: {
    kind: 'synth',
    name: 'Moog',
    duration: 0.5,
    synthConfig: {
      kind: 'mono',
      options: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.005, decay: 0.35, sustain: 0.2, release: 0.25 },
        filter: { Q: 6, type: 'lowpass', rolloff: -24 },
        filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: 100, octaves: 3 },
      },
    },
  },
  tuba:    { kind: 'sampled', name: 'Tuba', duration: 0.8, sampleKey: 'tuba' },
};

export const BASS_PRESET_LIST: { key: string; name: string }[] =
  Object.entries(BASS_PRESETS).map(([key, p]) => ({ key, name: p.name }));
```

- [ ] **Step 6.2: Refactor BassSynthVoice**

Open `src/songs/voices/BassSynthVoice.ts`. Replace imports:

```ts
import type { ChordEntry } from './chordLookup';
import { noteToFrequency } from './chordLookup';
import {
  ToneVoiceBase,
  lerp,
  clamp,
  FILTER_MIN_HZ,
  FILTER_MAX_HZ,
  LEFT_THRESHOLD,
  RIGHT_THRESHOLD,
} from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import { SynthPlayer, type Player } from './SynthPlayer';
import { BASS_PRESETS, BASS_PRESET_LIST, type BassPreset } from './presets/bassPresets';

export { BASS_PRESET_LIST };
```

Delete the inline `PRESETS`, `BASS_PRESET_LIST`, and `BassPreset` interface.

Update class members and constructor:

```ts
export class BassSynthVoice extends ToneVoiceBase {
  private bpm: number;
  private filterCutoff = FILTER_MAX_HZ;
  private currentPreset: BassPreset = BASS_PRESETS['upright'];
  private player: Player;

  private currentRoot = 0;
  private currentChordName: string | null = null;
  private walkingStep = 0;
  private lastStepTime = 0;
  private lastHalfBarTime = 0;

  private getStemBassGain: (() => number) | null = null;

  constructor(ctx: AudioContext, bpm: number) {
    super(ctx);
    this.bpm = bpm;
    this.player = this.createPlayer(this.currentPreset);
  }

  override setPreset(key: string): void {
    const preset = BASS_PRESETS[key];
    if (!preset) return;
    this.currentPreset = preset;
    this.player.dispose();
    this.player = this.createPlayer(preset);
  }

  private createPlayer(preset: BassPreset): Player {
    return preset.kind === 'sampled'
      ? new SamplerPlayer(SAMPLE_CONFIGS[preset.sampleKey], this.filterNode)
      : new SynthPlayer(preset.synthConfig, this.filterNode);
  }
```

Find the hit-playing method (look for `triggerAttackRelease` or oscillator-creation on a step). Replace the note-playing machinery with:

```ts
  private playHit(midi: number, velocity: number, time: number): void {
    if (!this.player.isReady()) return;
    const noteVelocity = clamp(0.5 + velocity * 0.5, 0.5, 1.0);
    this.player.triggerAttackRelease(midi, this.currentPreset.duration, time, noteVelocity);
    this.onNoteTrigger?.();
  }
```

**Delete:** per-hit oscillator builder, attack/decay/filter-envelope code (synth envelopes now live inside `SynthConfig.options`). **Keep:** rhythm pattern logic (X position → beats-1-only / 1-and-3 / walking), Y → filter cutoff, velocity → loudness, stem-bass-gain ducking callback.

`dispose()`:

```ts
  dispose(): void {
    this.player.dispose();
    this.disposeBase();
  }
```

- [ ] **Step 6.3: Run full type-check**

Run: `npm run lint`

Expected: **PASS** — all voice refactors are complete. If errors remain, they will come from either the engine's outdated default preset keys (next task) or references in the UI. Fix any errors before proceeding.

- [ ] **Step 6.4: Commit**

```bash
git add src/songs/voices/presets/bassPresets.ts src/songs/voices/BassSynthVoice.ts
git commit -m "$(cat <<'EOF'
refactor(bass): extract preset catalog; unify on Player interface

Adds presets/bassPresets.ts with 6 presets (was 4): Upright Bass,
Electric Bass, Sub Bass, FM Bass, Moog, Tuba. Slap Bass and Pick Bass
retired. Upright upgraded to nbrosowsky contrabass; Electric/Sub/FM/
Moog synthesised via new SynthPlayer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update engine defaults + catalog integrity tests

**Files:**
- Modify: `src/songs/SongPresetEngine.ts:192-197`
- Create: `src/__tests__/presetCatalogs.test.ts`

- [ ] **Step 7.1: Write the catalog integrity test first**

Create `src/__tests__/presetCatalogs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PAD_PRESETS } from '../songs/voices/presets/chordPadPresets';
import { MELODY_PRESETS } from '../songs/voices/presets/melodyPresets';
import { ARP_PRESETS } from '../songs/voices/presets/arpeggioPresets';
import { BASS_PRESETS } from '../songs/voices/presets/bassPresets';
import { SAMPLE_CONFIGS } from '../songs/voices/SamplerPlayer';

const catalogs = {
  pad: PAD_PRESETS,
  melody: MELODY_PRESETS,
  arp: ARP_PRESETS,
  bass: BASS_PRESETS,
};

const validSynthKinds = new Set(['poly', 'fm', 'am', 'mono', 'duo']);

describe('preset catalog integrity', () => {
  for (const [name, catalog] of Object.entries(catalogs)) {
    describe(`${name} catalog`, () => {
      it('is non-empty', () => {
        expect(Object.keys(catalog).length).toBeGreaterThan(0);
      });

      for (const [key, preset] of Object.entries(catalog)) {
        describe(`preset "${key}"`, () => {
          it('has a non-empty display name', () => {
            expect(preset.name).toBeTruthy();
          });

          it('has a valid kind discriminator', () => {
            expect(['sampled', 'synth']).toContain(preset.kind);
          });

          if (preset.kind === 'sampled') {
            it('references an existing SAMPLE_CONFIGS entry', () => {
              expect(SAMPLE_CONFIGS).toHaveProperty(preset.sampleKey);
            });
          } else {
            it('has a valid synth kind', () => {
              expect(validSynthKinds).toContain(preset.synthConfig.kind);
            });

            it('chorusDepth (if present) is within 0..1', () => {
              if (preset.synthConfig.chorusDepth !== undefined) {
                expect(preset.synthConfig.chorusDepth).toBeGreaterThanOrEqual(0);
                expect(preset.synthConfig.chorusDepth).toBeLessThanOrEqual(1);
              }
            });
          }
        });
      }
    });
  }

  it('expected preset totals match the design', () => {
    expect(Object.keys(PAD_PRESETS).length).toBe(7);
    expect(Object.keys(MELODY_PRESETS).length).toBe(7);
    expect(Object.keys(ARP_PRESETS).length).toBe(7);
    expect(Object.keys(BASS_PRESETS).length).toBe(6);
  });
});
```

- [ ] **Step 7.2: Run the catalog test**

Run: `npm run test:run -- presetCatalogs`

Expected: **PASS** — all catalogs already created by tasks 3–6. If any test fails, fix the catalog entry.

- [ ] **Step 7.3: Update engine default preset keys**

Open `src/songs/SongPresetEngine.ts` around line 192. The existing block looks like:

```ts
  // Voice instrument presets (persist across song loads)
  private voicePresets: Map<ColorRole, string> = new Map([
    ['red', 'warmPad'],
    ['green', 'bell'],
    ['yellow', 'sparkle'],
    ['orange', 'sub'],
  ]);
```

Replace the initialization values with the new defaults. `'warmPad'` is still a valid key in the new catalog (kept as synth), so red needs updating only by intent — the new default is `'rhodesEP'`. Green and yellow and orange all use keys that no longer exist.

```ts
  // Voice instrument presets (persist across song loads)
  private voicePresets: Map<ColorRole, string> = new Map([
    ['red',    'rhodesEP'],     // was 'warmPad'
    ['green',  'clarinet'],     // was 'bell'
    ['yellow', 'nylonGuitar'],  // was 'sparkle'
    ['orange', 'upright'],      // was 'sub'
  ]);
```

Also update the hardcoded fallback strings in `buildVoices()` around lines 670, 677, 688, 694. Find each of these calls:

```ts
padVoice.setPreset(this.voicePresets.get('red') ?? 'warmPad');
melodyVoice.setPreset(this.voicePresets.get('green') ?? 'bell');
arpVoice.setPreset(this.voicePresets.get('yellow') ?? 'sparkle');
bassVoice.setPreset(this.voicePresets.get('orange') ?? 'sub');
```

Replace the fallback string in each with the new default:

```ts
padVoice.setPreset(this.voicePresets.get('red') ?? 'rhodesEP');
melodyVoice.setPreset(this.voicePresets.get('green') ?? 'clarinet');
arpVoice.setPreset(this.voicePresets.get('yellow') ?? 'nylonGuitar');
bassVoice.setPreset(this.voicePresets.get('orange') ?? 'upright');
```

- [ ] **Step 7.4: Run full type-check and full test suite**

Run: `npm run lint`
Expected: **PASS** — no errors anywhere.

Run: `npm run test:run`
Expected: **PASS** — all tests green, including SynthPlayer + presetCatalogs suites.

- [ ] **Step 7.5: Commit**

```bash
git add src/songs/SongPresetEngine.ts src/__tests__/presetCatalogs.test.ts
git commit -m "$(cat <<'EOF'
feat(song-preset): update default presets + catalog integrity tests

Updates default preset keys on song load: Rhodes EP / Clarinet /
Nylon Guitar / Upright Bass — all universally ballad-appropriate
and musically polished out of the box.

Adds parametric integrity tests covering every preset in all four
catalogs: valid kind discriminator, existing sample key references,
in-range chorusDepth, expected total counts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: CDN smoke-check script

**Files:**
- Create: `scripts/verify-sample-cdn.mjs`
- Modify: `package.json`

- [ ] **Step 8.1: Create the smoke-check script**

Create `scripts/verify-sample-cdn.mjs`:

```js
#!/usr/bin/env node
/**
 * verify-sample-cdn.mjs
 *
 * Fetches one representative sample URL per nbrosowsky instrument we
 * reference in SAMPLE_CONFIGS and asserts HTTP 200. Run before releases
 * to catch CDN breakage. Not part of `npm test` — external network hit.
 *
 * Usage:  node scripts/verify-sample-cdn.mjs
 */

const CHECKS = [
  // [label, url]
  ['salamander-piano',    'https://tonejs.github.io/audio/salamander/A4.mp3'],
  ['nbrosowsky/violin',       'https://nbrosowsky.github.io/tonejs-instruments/samples/violin/A4.mp3'],
  ['nbrosowsky/cello',        'https://nbrosowsky.github.io/tonejs-instruments/samples/cello/A3.mp3'],
  ['nbrosowsky/contrabass',   'https://nbrosowsky.github.io/tonejs-instruments/samples/contrabass/A2.mp3'],
  ['nbrosowsky/clarinet',     'https://nbrosowsky.github.io/tonejs-instruments/samples/clarinet/A3.mp3'],
  ['nbrosowsky/french-horn',  'https://nbrosowsky.github.io/tonejs-instruments/samples/french-horn/A3.mp3'],
  ['nbrosowsky/tuba',         'https://nbrosowsky.github.io/tonejs-instruments/samples/tuba/A2.mp3'],
  ['nbrosowsky/harp',         'https://nbrosowsky.github.io/tonejs-instruments/samples/harp/A4.mp3'],
  ['nbrosowsky/guitar-nylon', 'https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-nylon/A4.mp3'],
  ['nbrosowsky/organ',        'https://nbrosowsky.github.io/tonejs-instruments/samples/organ/A3.mp3'],
];

let failures = 0;

for (const [label, url] of CHECKS) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) {
      console.log(`OK   ${label.padEnd(26)} ${url}`);
    } else {
      console.error(`FAIL ${label.padEnd(26)} ${res.status} ${url}`);
      failures++;
    }
  } catch (err) {
    console.error(`ERR  ${label.padEnd(26)} ${err.message} ${url}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} sample URL(s) failed verification.`);
  process.exit(1);
} else {
  console.log(`\nAll ${CHECKS.length} sample URLs reachable.`);
}
```

- [ ] **Step 8.2: Add the verify:samples npm script**

Open `package.json`. In the `"scripts"` block, add one entry:

```json
"verify:samples": "node scripts/verify-sample-cdn.mjs"
```

Place it alphabetically between `test:run` and any others, or just at the end of the scripts block.

- [ ] **Step 8.3: Run the verification script**

Run: `npm run verify:samples`

Expected: All URLs print `OK`. If any fail, investigate the nbrosowsky repo (it may have been renamed, moved, or updated). Options for a failed URL:
- Look at the repo directly: https://github.com/nbrosowsky/tonejs-instruments
- Try different A-octave notes (some instruments may not have every octave)
- Use an alternative note (e.g., if `A4.mp3` is missing, try `Bb4.mp3` or `C4.mp3`)

Update the `SAMPLE_CONFIGS` `urls` map in `SamplerPlayer.ts` if a different note set is needed. Rerun the script until all green.

- [ ] **Step 8.4: Commit**

```bash
git add scripts/verify-sample-cdn.mjs package.json
git commit -m "$(cat <<'EOF'
chore: add verify:samples script to smoke-check sample CDN URLs

Run before releases to catch dead or renamed CDN paths before they
surface as silent failures in production. Not run by default in npm
test (it requires network access).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual listening pass (required, not automatable)

**Files:**
- None modified — this is a human verification step.

Automated tests cannot confirm that a preset sounds *musical*. This manual pass catches envelope bugs, clashing frequencies, overly-loud defaults, and presets that load but sound wrong. It is a required shipping step.

- [ ] **Step 9.1: Start the dev server**

Run: `npm run dev`

Open the URL Vite prints (typically http://localhost:5173).

- [ ] **Step 9.2: Enter Song Preset mode and load "Can't Help Falling in Love"**

Navigate to Song Preset mode from the app's mode selector. Wait for stems and samples to load.

- [ ] **Step 9.3: Verify default presets sound good on song start**

Start playback. Bring all four accompaniment objects into view (Red/Green/Yellow/Orange). You should hear:
- Red chord pad = **Rhodes EP**
- Green melody = **Clarinet** (only triggers on band crossing)
- Yellow arpeggio = **Nylon Guitar**
- Orange bass = **Upright Bass**

Check: nothing is clipping, nothing is painfully loud, all four blend with the song's stems.

- [ ] **Step 9.4: Cycle each voice through every preset**

For each colored voice, open its preset dropdown and try every entry. Confirm each preset:
- Loads within ~1 s (synths instant; samples may take a moment on first use)
- Produces audible sound when active
- Sounds distinct from its neighbours
- Doesn't glitch or crackle on preset swap

**Reference — the 27 preset keys to test:**

| Voice | Keys |
|---|---|
| Red Chord Pad | `warmPad`, `rhodesEP`, `strings`, `choir`, `glassPad`, `organ`, `stab` |
| Green Melody | `celesta`, `violin`, `cello`, `clarinet`, `frenchHorn`, `nylonPluck`, `musicBox` |
| Yellow Arpeggio | `piano`, `harp`, `nylonGuitar`, `vibes`, `marimba`, `musicBox`, `pluckedSynth` |
| Orange Bass | `upright`, `electric`, `sub`, `fm`, `moog`, `tuba` |

- [ ] **Step 9.5: Note any sounds that are off**

If a preset sounds broken, too quiet, too loud, or musically wrong, note which preset and what's wrong. Fix by tuning its entry in the corresponding `presets/*Presets.ts` file (envelope, gain, chorus depth). Re-test.

- [ ] **Step 9.6: Final lint + test pass**

Run: `npm run lint && npm run test:run`

Expected: **PASS**.

---

## Self-review checklist (for the implementer)

Before declaring the work complete:

- [ ] All 27 preset keys in the spec's catalogue appear in `PAD_PRESETS` / `MELODY_PRESETS` / `ARP_PRESETS` / `BASS_PRESETS`.
- [ ] No remaining references to `fluidR3Base`, `ePiano`, `stabPad`, `bell`, `aBass`, `eBass`, `slapBass`, `pickBass`, `flute`, `pizz`, `guitar`, or `vibes` (old keys) anywhere in `src/`.
- [ ] No remaining `OscillatorNode` creation inside the four voice files (`ChordPadVoice.ts`, `MelodicVoice.ts`, `ArpeggioVoice.ts`, `BassSynthVoice.ts`).
- [ ] `npm run lint` passes.
- [ ] `npm run test:run` passes.
- [ ] `npm run verify:samples` passes.
- [ ] Manual listening pass (Task 9) completed without unresolved issues.
