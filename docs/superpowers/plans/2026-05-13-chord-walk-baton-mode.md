# Chord-Walk Baton Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `'walk'` `BatonMode` to Song Preset that generates an up-down arpeggio over the active chord's voicing notes, triggered on beat while the baton moves. Available on all four generative batons (red/green/yellow/orange). Solves the accessibility problem where horizontal-band melody mapping puts notes out of reach of users with limited horizontal movement range.

**Architecture:** New `WalkVoice` class in `src/songs/voices/WalkVoice.ts`, parallel in shape to `HarmonyVoice` (extends `ToneVoiceBase`, uses the same instrument-palette + Player interface). Engine wiring via a third branch in `SongPresetEngine.createVoiceForRole`. UI gets a Walk button in the existing per-baton mode picker. No new data model, no new persistence — `BatonAssignment` and `batonInstruments` are reused unchanged.

**Tech Stack:** React 19, TypeScript (strict), Tone.js v15, Vitest + jsdom. No new dependencies.

**Spec:** [../specs/2026-05-13-chord-walk-baton-mode-design.md](../specs/2026-05-13-chord-walk-baton-mode-design.md)

---

## File Map

| Path | New / Modified | Responsibility |
|---|---|---|
| `src/songs/voices/WalkVoice.ts` | New | Voice class implementing the chord-walk arpeggio. |
| `src/songs/SongPresetEngine.ts` | Modified | Widen `BatonMode` union to include `'walk'`. Add a third branch in `createVoiceForRole`. Add `createWalkVoice` private helper. Add `'walk'` arm in `setBatonInstrument`. Update `setBeatSnap` doc comment. |
| `src/ui/screens/SongPresetScreen.tsx` | Modified | Add Walk button to mode picker (all four generative batons). Show instrument selector when walk mode is active. Update callout text. |
| `src/__tests__/WalkVoice.test.ts` | New | Unit tests for the voice — pattern, triggering, dynamics, edge cases. |
| `src/__tests__/SongPresetEngine.walk.test.ts` | New | Integration tests for engine wiring — mode switch creates/disposes correctly, instrument key persists, beat-snap is a no-op. |

---

## Task 1: Widen `BatonMode` and stub `WalkVoice`

**Files:**
- Modify: `src/songs/SongPresetEngine.ts:64` (`BatonMode` type)
- Create: `src/songs/voices/WalkVoice.ts`

This task lays the type-level scaffolding so subsequent tasks can target a real class. No engine wiring yet — `'walk'` falls through to the parameter branch of `createVoiceForRole` until Task 6.

- [ ] **Step 1: Widen the `BatonMode` union**

In `src/songs/SongPresetEngine.ts`, replace the `BatonMode` declaration around line 64:

```ts
/**
 * Per-baton mode selector.
 *   parameter  → existing colour-role behaviour (melody, bass, arp, chord pad)
 *   instrument → InstrumentVoice plays chord-tone notes on a chosen
 *                instrument from the curated palette.
 *   harmonizer → green-only mode. Plays a chord-aware harmony to the
 *                song's vocal melody (from analysis.json.harmony[]).
 *   walk       → generates an up-down arpeggio over the current chord's
 *                voicing notes. Triggers on beat while the baton moves.
 *                X is ignored; Y drives dynamics. Available on any
 *                generative baton (red/green/yellow/orange).
 */
export type BatonMode = 'parameter' | 'instrument' | 'harmonizer' | 'walk';
```

- [ ] **Step 2: Create the WalkVoice file with a minimal stub**

Create `src/songs/voices/WalkVoice.ts`:

```ts
/**
 * WalkVoice.ts — Baton in 'walk' mode.
 *
 * Generates an up-down arpeggio over the active chord's voicing notes,
 * triggering on each new beat while the baton's smoothed velocity is
 * above the stillness threshold. The horizontal axis is intentionally
 * ignored — this is the accessibility win for users whose horizontal
 * movement range is narrower than the camera frame.
 *
 *   • Note pitch  = next note in the up-down walk over chord.notes
 *                   (sorted ascending). X position is ignored entirely.
 *   • Trigger     = a new beat in `beats[]` has arrived since the last
 *                   triggered note AND `velocity > triggerThreshold`.
 *   • Y position  = note dynamics. Top of frame = loud, bottom = soft.
 *
 * The walk-step counter persists across chord changes — new tones, same
 * cycle position. Cycle length is `max(1, 2 * (k - 1))` for a k-note
 * voicing, giving ascend-then-descend without repeating the top/bottom.
 *
 * @see WalkVoice.test.ts for the pattern truth-table.
 */

import type { ChordEntry } from './chordLookup';
import { ToneVoiceBase, clamp, lerp } from './ToneVoiceBase';
import { SamplerPlayer, SAMPLE_CONFIGS } from './SamplerPlayer';
import type { Player } from './SynthPlayer';
import {
  getInstrumentEntry,
  type InstrumentPaletteEntry,
} from './presets/instrumentPalette';

/**
 * Velocity below which a beat arrival does NOT trigger a note.
 * Re-uses the engine's stillness-gate threshold convention so the
 * facilitator's existing sensitivity control covers walk mode too.
 */
const DEFAULT_TRIGGER_THRESHOLD = 0.04;

export class WalkVoice extends ToneVoiceBase {
  private entry: InstrumentPaletteEntry;
  private player: Player;

  private currentChord: ChordEntry | null = null;
  private walkStep = 0;
  private lastTriggeredBeatIndex = -1;
  private beats: readonly number[] | null = null;
  private triggerThreshold = DEFAULT_TRIGGER_THRESHOLD;

  constructor(ctx: AudioContext, instrumentKey: string) {
    super(ctx);
    this.entry = getInstrumentEntry(instrumentKey);
    this.player = this.createPlayer(this.entry);
  }

  /** Supply the song's beat-timestamp grid. Pass null to clear. */
  setBeatTimestamps(beats: readonly number[] | null): void {
    this.beats = beats;
  }

  /** Override the velocity threshold above which a beat triggers a note. */
  setTriggerThreshold(threshold: number): void {
    this.triggerThreshold = Math.max(0, threshold);
  }

  override setPreset(key: string): void {
    const next = getInstrumentEntry(key);
    if (next.key === this.entry.key) return;
    this.entry = next;
    this.player.dispose();
    this.player = this.createPlayer(next);
  }

  getInstrumentKey(): string {
    return this.entry.key;
  }

  private createPlayer(entry: InstrumentPaletteEntry): Player {
    return new SamplerPlayer(SAMPLE_CONFIGS[entry.sampleKey], this.filterNode);
  }

  update(_playbackTime: number, _chord: ChordEntry | null, _velocity: number): void {
    // Real logic in Task 3 — stub no-ops so the type checker is happy.
  }

  onTransportStart(): void {
    this.lastTriggeredBeatIndex = -1;
  }

  onTransportStop(): void {
    this.player.releaseAll();
    this.lastTriggeredBeatIndex = -1;
  }

  dispose(): void {
    this.player.releaseAll();
    this.player.dispose();
    this.disposeBase();
  }
}

/**
 * Compute the next walk-step note for a sorted ascending voicing.
 *
 * For a 4-note voicing the cycle is `n0 n1 n2 n3 n2 n1` (6 steps),
 * looping back to n0 at step 6. The pattern reaches the top, then
 * descends through the inner notes back to the bottom — without
 * repeating either endpoint, which keeps the cycle musical.
 *
 * Cycle length for a k-note voicing is `max(1, 2 * (k - 1))`. The
 * formula degrades correctly:
 *   k = 1: cycle length 1, always returns the single note.
 *   k = 2: cycle length 2, alternates n0/n1.
 *   k = 3: cycle length 4, walks `n0 n1 n2 n1`.
 *   k = 4: cycle length 6, walks `n0 n1 n2 n3 n2 n1`.
 *
 * Pure function — exported so unit tests can exercise it without a
 * WalkVoice instance.
 */
export function walkStepNote(voicing: readonly number[], step: number): number | null {
  if (voicing.length === 0) return null;
  if (voicing.length === 1) return voicing[0];
  const cycleLength = 2 * (voicing.length - 1);
  const phase = ((step % cycleLength) + cycleLength) % cycleLength;
  const index =
    phase < voicing.length ? phase : voicing.length - 2 - (phase - voicing.length);
  return voicing[index];
}

/**
 * Binary-search the highest beat index ≤ targetTime. Returns -1 if
 * targetTime is before all beats or the array is empty. Used by
 * WalkVoice to detect "a new beat has arrived since the last trigger".
 */
export function latestBeatIndexAtOrBefore(
  beats: readonly number[] | null | undefined,
  targetTime: number,
): number {
  if (!beats || beats.length === 0) return -1;
  let lo = 0, hi = beats.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= targetTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
```

The `lerp` import is unused in this stub but will be needed in Task 4 (Y dynamics) — leave it imported to avoid churning the file again.

- [ ] **Step 3: Verify the type checker is happy**

Run: `npm run lint`

Expected: PASS. No new diagnostics. Existing `BatonMode` switches in [src/songs/SongPresetEngine.ts:682-714](../../../src/songs/SongPresetEngine.ts#L682-L714) and [src/ui/screens/SongPresetScreen.tsx](../../../src/ui/screens/SongPresetScreen.tsx) compile without an exhaustiveness error because they all use `if`/`else if` chains with a default branch, not exhaustive `switch` statements.

- [ ] **Step 4: Commit**

```bash
git add src/songs/voices/WalkVoice.ts src/songs/SongPresetEngine.ts
git commit -m "feat(walk): scaffold WalkVoice class and widen BatonMode

Adds 'walk' to the BatonMode union and a stub WalkVoice that does
nothing yet. The walk-step note formula and a beat-index helper are
exported as pure functions so subsequent tasks can unit-test them
without instantiating the voice.

Engine wiring lands in a later task; for now 'walk' falls through to
the parameter branch."
```

---

## Task 2: Unit-test the pure helpers (`walkStepNote`, `latestBeatIndexAtOrBefore`)

**Files:**
- Create: `src/__tests__/WalkVoice.test.ts`

These are pure functions — testing them first locks in the pattern truth-table before any audio code runs.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/WalkVoice.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { walkStepNote, latestBeatIndexAtOrBefore } from '../songs/voices/WalkVoice';

describe('walkStepNote', () => {
  it('walks a 4-note voicing as n0 n1 n2 n3 n2 n1 then loops', () => {
    const voicing = [60, 64, 67, 72];
    const sequence = Array.from({ length: 8 }, (_, i) => walkStepNote(voicing, i));
    expect(sequence).toEqual([60, 64, 67, 72, 67, 64, 60, 64]);
  });

  it('walks a 3-note voicing as n0 n1 n2 n1 then loops', () => {
    const voicing = [60, 64, 67];
    const sequence = Array.from({ length: 6 }, (_, i) => walkStepNote(voicing, i));
    expect(sequence).toEqual([60, 64, 67, 64, 60, 64]);
  });

  it('alternates n0 n1 for a 2-note voicing', () => {
    expect(walkStepNote([60, 67], 0)).toBe(60);
    expect(walkStepNote([60, 67], 1)).toBe(67);
    expect(walkStepNote([60, 67], 2)).toBe(60);
  });

  it('returns the single note for a 1-note voicing at any step', () => {
    expect(walkStepNote([60], 0)).toBe(60);
    expect(walkStepNote([60], 5)).toBe(60);
    expect(walkStepNote([60], 100)).toBe(60);
  });

  it('returns null for an empty voicing', () => {
    expect(walkStepNote([], 0)).toBeNull();
    expect(walkStepNote([], 5)).toBeNull();
  });

  it('wraps step counter into the cycle (chord change shorter-than-step)', () => {
    // step 4 on a 3-note voicing: cycle length is 4, phase = 0, returns n0.
    expect(walkStepNote([60, 64, 67], 4)).toBe(60);
    // step 5 on a 3-note voicing: phase = 1, returns n1.
    expect(walkStepNote([60, 64, 67], 5)).toBe(64);
  });

  it('handles negative steps via positive-modulo', () => {
    expect(walkStepNote([60, 64, 67, 72], -1)).toBe(64); // phase 5
    expect(walkStepNote([60, 64, 67, 72], -6)).toBe(60); // phase 0
  });
});

describe('latestBeatIndexAtOrBefore', () => {
  it('returns -1 for an empty or null beat array', () => {
    expect(latestBeatIndexAtOrBefore([], 1.0)).toBe(-1);
    expect(latestBeatIndexAtOrBefore(null, 1.0)).toBe(-1);
    expect(latestBeatIndexAtOrBefore(undefined, 1.0)).toBe(-1);
  });

  it('returns -1 when targetTime is before all beats', () => {
    expect(latestBeatIndexAtOrBefore([1.0, 2.0, 3.0], 0.5)).toBe(-1);
  });

  it('returns the last beat at or before targetTime', () => {
    const beats = [1.0, 2.0, 3.0, 4.0];
    expect(latestBeatIndexAtOrBefore(beats, 1.0)).toBe(0); // inclusive
    expect(latestBeatIndexAtOrBefore(beats, 1.5)).toBe(0);
    expect(latestBeatIndexAtOrBefore(beats, 2.0)).toBe(1);
    expect(latestBeatIndexAtOrBefore(beats, 3.999)).toBe(2);
    expect(latestBeatIndexAtOrBefore(beats, 4.0)).toBe(3);
    expect(latestBeatIndexAtOrBefore(beats, 100)).toBe(3);
  });
});
```

- [ ] **Step 2: Run the tests, expect pass on first run**

Run: `npx vitest run src/__tests__/WalkVoice.test.ts`

Expected: 13 tests pass. These are pure functions written in Task 1, so they should already work — this task locks in the truth-table.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/WalkVoice.test.ts
git commit -m "test(walk): pin walkStepNote and beat-index truth-tables"
```

---

## Task 3: Implement the trigger logic in `WalkVoice.update`

**Files:**
- Modify: `src/songs/voices/WalkVoice.ts` (the `update` method and supporting state)
- Modify: `src/__tests__/WalkVoice.test.ts` (add `describe('WalkVoice trigger logic')`)

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/WalkVoice.test.ts`:

```ts
import { beforeEach, vi } from 'vitest';
import { WalkVoice } from '../songs/voices/WalkVoice';
import type { ChordEntry } from '../songs/voices/chordLookup';

// ---- Tone.js mock — mirror InstrumentVoice.beatSnap.test.ts ----

const samplerTriggerAttackRelease = vi.fn();

vi.mock('tone', () => {
  const Sampler = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return {
      connect: vi.fn(),
      triggerAttack: vi.fn(),
      triggerAttackRelease: samplerTriggerAttackRelease,
      triggerRelease: vi.fn(),
      releaseAll: vi.fn(),
      dispose: vi.fn(),
    };
  });
  return {
    Sampler,
    Frequency: vi.fn((midi: number) => ({
      toNote: () => `MIDI-${midi}`,
      toFrequency: () => 440,
    })),
    now: vi.fn(() => 0),
  };
});

function makeFakeNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1 },
    frequency: { value: 4000 },
    Q: { value: 0.7 },
    type: 'lowpass',
  };
}

function makeFakeContext(): AudioContext {
  return {
    currentTime: 0,
    state: 'running' as const,
    createGain: vi.fn(() => makeFakeNode()),
    createBiquadFilter: vi.fn(() => makeFakeNode()),
  } as unknown as AudioContext;
}

const D_MAJOR: ChordEntry = {
  time: 0,
  notes: [50, 57, 62, 66], // D3, A3, D4, F#4 — already sorted ascending
  root: 50,
  name: 'D',
};

const A_MAJOR: ChordEntry = {
  time: 4,
  notes: [45, 52, 57, 61], // A2, E3, A3, C#4 — also sorted ascending
  root: 45,
  name: 'A',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WalkVoice trigger logic', () => {
  function makeActiveVoice(): WalkVoice {
    const ctx = makeFakeContext();
    const voice = new WalkVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    voice.setBeatTimestamps([1.0, 2.0, 3.0, 4.0, 5.0]);
    voice.setPosition(0.5, 0.5); // mid Y
    return voice;
  }

  it('fires the first note on the first beat arrival when moving', () => {
    const voice = makeActiveVoice();
    // Pre-beat: no trigger.
    voice.update(0.5, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();

    // Beat 1.0 arrives: first walk-step note (n0 = 50) fires.
    voice.update(1.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
    const playedMidi = Number(
      String(samplerTriggerAttackRelease.mock.calls[0][0]).replace('MIDI-', ''),
    );
    expect(playedMidi).toBe(50);
  });

  it('plays the up-down pattern 50-57-62-66-62-57 across 6 beats', () => {
    const voice = makeActiveVoice();
    const expectedSequence = [50, 57, 62, 66, 62, 57];
    for (let i = 0; i < expectedSequence.length; i++) {
      voice.update(1.0 + i + 0.05, D_MAJOR, 0.5);
    }
    const played = samplerTriggerAttackRelease.mock.calls.map((call) =>
      Number(String(call[0]).replace('MIDI-', '')),
    );
    expect(played).toEqual(expectedSequence);
  });

  it('does not reset walkStep when the chord changes mid-cycle', () => {
    const voice = makeActiveVoice();
    // Beats 1, 2 with D major: plays 50, 57. walkStep is now 2.
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(2.05, D_MAJOR, 0.5);
    expect(
      samplerTriggerAttackRelease.mock.calls.map((c) =>
        Number(String(c[0]).replace('MIDI-', '')),
      ),
    ).toEqual([50, 57]);

    // Beat 3 with A major: walkStep 2 → A_MAJOR.notes[2] = 57 (A3).
    voice.update(3.05, A_MAJOR, 0.5);
    const lastCall = samplerTriggerAttackRelease.mock.calls.at(-1)!;
    const lastMidi = Number(String(lastCall[0]).replace('MIDI-', ''));
    expect(lastMidi).toBe(57);
  });

  it('does not fire when velocity is below the trigger threshold', () => {
    const voice = makeActiveVoice();
    voice.update(1.05, D_MAJOR, 0.02); // below default 0.04 threshold
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();
  });

  it('fires at most one note per beat regardless of update call count', () => {
    const voice = makeActiveVoice();
    // 5 update calls all within the same beat.
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(1.1, D_MAJOR, 0.5);
    voice.update(1.5, D_MAJOR, 0.5);
    voice.update(1.9, D_MAJOR, 0.5);
    voice.update(1.99, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledOnce();
  });

  it('is silent when no chord is loaded', () => {
    const voice = makeActiveVoice();
    voice.update(1.05, null, 0.5);
    voice.update(2.05, null, 0.5);
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();
  });

  it('fires the sidechain callback once per triggered note', () => {
    const voice = makeActiveVoice();
    const sidechain = vi.fn();
    voice.onNoteTrigger = sidechain;
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(2.05, D_MAJOR, 0.5);
    expect(sidechain).toHaveBeenCalledTimes(2);
  });

  it('transport restart re-fires on the first new beat after restart', () => {
    const voice = makeActiveVoice();
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(2.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledTimes(2);

    voice.onTransportStop();
    voice.onTransportStart();

    // After restart, beat 1.0 should fire again (walkStep persists, so
    // the played note is the NEXT step in the cycle: 62).
    voice.update(1.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).toHaveBeenCalledTimes(3);
    const lastCall = samplerTriggerAttackRelease.mock.calls.at(-1)!;
    expect(Number(String(lastCall[0]).replace('MIDI-', ''))).toBe(62);
  });

  it('is silent when no beat data is available', () => {
    const ctx = makeFakeContext();
    const voice = new WalkVoice(ctx, 'piano');
    voice.setActive(true);
    voice.updateFade();
    // No setBeatTimestamps — beats is null.
    voice.setPosition(0.5, 0.5);
    voice.update(1.05, D_MAJOR, 0.5);
    voice.update(2.05, D_MAJOR, 0.5);
    expect(samplerTriggerAttackRelease).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests, expect them to fail**

Run: `npx vitest run src/__tests__/WalkVoice.test.ts`

Expected: All 9 new tests in `describe('WalkVoice trigger logic')` FAIL — `samplerTriggerAttackRelease` is never called because `update()` is still a no-op stub.

- [ ] **Step 3: Implement `update()`**

In `src/songs/voices/WalkVoice.ts`, replace the stub `update` method with:

```ts
update(playbackTime: number, chord: ChordEntry | null, velocity: number): void {
  if (this.isSilent() && !this.active) return;

  // Latch the new chord; do NOT reset walkStep on chord change — the
  // cycle continues, new tones simply take effect on the next trigger.
  if (chord !== this.currentChord) {
    this.currentChord = chord;
  }

  if (!this.currentChord) return;
  if (!this.beats || this.beats.length === 0) return;
  if (velocity < this.triggerThreshold) return;

  const beatIndex = latestBeatIndexAtOrBefore(this.beats, playbackTime);
  if (beatIndex < 0) return;
  if (beatIndex <= this.lastTriggeredBeatIndex) return;

  const voicing = [...this.currentChord.notes].sort((a, b) => a - b);
  const midi = walkStepNote(voicing, this.walkStep);
  if (midi === null) return;

  this.triggerNote(midi);
  this.lastTriggeredBeatIndex = beatIndex;
  this.walkStep++;
}

private triggerNote(midi: number): void {
  if (!this.player.isReady()) return;

  const { min, max } = this.entry.velocityRange;
  // Y → dynamics. posY: 0 = top of frame = loud. lerp on (1 - posY).
  const yLoudness = clamp(1 - this.posY, 0, 1);
  const noteVelocity = lerp(min, max, yLoudness);

  this.player.triggerAttackRelease(
    midi,
    this.entry.duration,
    undefined,
    clamp(noteVelocity, 0, 1),
  );
  this.onNoteTrigger?.();
}
```

- [ ] **Step 4: Run the tests, expect them to pass**

Run: `npx vitest run src/__tests__/WalkVoice.test.ts`

Expected: All tests in the file pass (13 pure-function tests + 9 trigger-logic tests = 22 total).

- [ ] **Step 5: Commit**

```bash
git add src/songs/voices/WalkVoice.ts src/__tests__/WalkVoice.test.ts
git commit -m "feat(walk): implement chord-walk trigger logic

WalkVoice fires the next walk-step note on each new beat arrival
while smoothed velocity is above the trigger threshold. Walk-step
counter persists across chord changes — the new chord's voicing is
used on the next trigger without resetting the cycle position. Y
position drives note velocity within the instrument's configured
range; X is ignored."
```

---

## Task 4: Test that Y position drives note dynamics

**Files:**
- Modify: `src/__tests__/WalkVoice.test.ts` (add Y → dynamics test)

The behaviour is already implemented in Task 3's `triggerNote`. This task locks it in with a test that asserts the velocity argument actually changes with `posY`.

- [ ] **Step 1: Append the failing test**

Append to the existing `describe('WalkVoice trigger logic')` block in `src/__tests__/WalkVoice.test.ts`:

```ts
  it('Y position drives note velocity within the instrument range', () => {
    // Piano palette entry has velocityRange { min: 0.35, max: 1.0 }.
    const voice = makeActiveVoice();

    // posY = 0 (top of frame) → loud → near max.
    voice.setPosition(0.5, 0.0);
    voice.update(1.05, D_MAJOR, 0.5);
    const loudVel = samplerTriggerAttackRelease.mock.calls[0][3] as number;
    expect(loudVel).toBeCloseTo(1.0, 2);

    // posY = 1 (bottom of frame) → soft → near min.
    voice.setPosition(0.5, 1.0);
    voice.update(2.05, D_MAJOR, 0.5);
    const softVel = samplerTriggerAttackRelease.mock.calls[1][3] as number;
    expect(softVel).toBeCloseTo(0.35, 2);

    // Movement speed is the SAME (0.5) for both calls — Y alone
    // accounts for the difference.
    expect(loudVel).toBeGreaterThan(softVel);
  });
```

- [ ] **Step 2: Run, expect pass**

Run: `npx vitest run src/__tests__/WalkVoice.test.ts -t 'Y position drives'`

Expected: PASS — the behaviour is already implemented; this test pins it.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/WalkVoice.test.ts
git commit -m "test(walk): pin Y → dynamics velocity-range mapping"
```

---

## Task 5: Engine wiring — `createVoiceForRole` walk branch

**Files:**
- Modify: `src/songs/SongPresetEngine.ts` (`createVoiceForRole`, add `createWalkVoice` helper, import `WalkVoice`)
- Create: `src/__tests__/SongPresetEngine.walk.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/SongPresetEngine.walk.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tone.js the same way other engine tests do.
vi.mock('tone', () => {
  const Sampler = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return {
      connect: vi.fn(),
      triggerAttack: vi.fn(),
      triggerAttackRelease: vi.fn(),
      triggerRelease: vi.fn(),
      releaseAll: vi.fn(),
      dispose: vi.fn(),
    };
  });
  const Transport = {
    bpm: { value: 120 },
    seconds: 0,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
  };
  const Reverb = vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    dispose: vi.fn(),
    wet: { value: 1 },
  }));
  return {
    Sampler,
    Reverb,
    MembraneSynth: vi.fn(() => ({
      toDestination: () => ({ triggerAttackRelease: vi.fn(), dispose: vi.fn() }),
    })),
    Frequency: vi.fn((midi: number) => ({
      toNote: () => `MIDI-${midi}`,
      toFrequency: () => 440,
    })),
    now: vi.fn(() => 0),
    start: vi.fn().mockResolvedValue(undefined),
    loaded: vi.fn().mockResolvedValue(undefined),
    getContext: vi.fn(() => ({ rawContext: {
      currentTime: 0,
      state: 'running',
      createGain: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() } })),
      createBiquadFilter: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), frequency: { value: 4000 }, Q: { value: 0.7 }, type: 'lowpass' })),
      decodeAudioData: vi.fn().mockResolvedValue({ duration: 10 }),
      destination: {},
      createBufferSource: vi.fn(() => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), buffer: null, onended: null })),
    } })),
    getTransport: vi.fn(() => Transport),
    connect: vi.fn(),
  };
});

import { SongPresetEngine } from '../songs/SongPresetEngine';
import { WalkVoice } from '../songs/voices/WalkVoice';
import type { SongConfig } from '../songs/songLibrary';

function makeMinimalSong(): SongConfig {
  return {
    id: 'test',
    title: 'Test',
    artist: 'Test',
    key: 'D Major',
    bpm: 120,
    timeSignature: '4/4',
    stems: { vocals: 'vocals.wav', drums: 'drums.wav', bass: 'bass.wav', other: 'other.wav' },
    stemMixer: {
      label: 'Mix',
      leftZone:   { vocals: 1, drums: 0, bass: 0, other: 0 },
      centerZone: { vocals: 1, drums: 0.5, bass: 0.5, other: 0.5 },
      rightZone:  { vocals: 1, drums: 1, bass: 1, other: 1 },
    },
    chordProgression: [
      { time: 0, notes: [50, 57, 62, 66], root: 50, name: 'D' },
    ],
    beats: [1, 2, 3, 4],
  };
}

// fetch() mock for stem URLs — return an empty array buffer.
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
}) as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SongPresetEngine walk mode wiring', () => {
  it('creates a WalkVoice when a baton is set to walk mode after loadSong', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.setBatonMode('green', 'walk');

    // @ts-expect-error — voices is private; inspect for the test.
    const greenVoice = engine.voices.get('green');
    expect(greenVoice).toBeInstanceOf(WalkVoice);

    engine.dispose();
  });

  it('disposes the previous voice when switching from walk back to parameter', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.setBatonMode('green', 'walk');
    // @ts-expect-error — voices is private
    const walkVoice = engine.voices.get('green');
    const disposeSpy = vi.spyOn(walkVoice as WalkVoice, 'dispose');

    engine.setBatonMode('green', 'parameter');
    expect(disposeSpy).toHaveBeenCalled();
    // @ts-expect-error — voices is private
    expect(engine.voices.get('green')).not.toBeInstanceOf(WalkVoice);

    engine.dispose();
  });

  it('respects walk mode for red/yellow/orange too', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    for (const role of ['red', 'yellow', 'orange'] as const) {
      engine.setBatonMode(role, 'walk');
      // @ts-expect-error — voices is private
      expect(engine.voices.get(role)).toBeInstanceOf(WalkVoice);
    }

    engine.dispose();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run src/__tests__/SongPresetEngine.walk.test.ts`

Expected: FAIL — `setBatonMode('green', 'walk')` triggers `swapVoice` → `createVoiceForRole`, which still routes `walk` through the default parameter branch, so the resulting voice is a `MelodicVoice`, not a `WalkVoice`.

- [ ] **Step 3: Add the engine wiring**

In `src/songs/SongPresetEngine.ts`, add the import near the existing voice imports:

```ts
import { WalkVoice } from './voices/WalkVoice';
```

Replace the body of `createVoiceForRole` ([src/songs/SongPresetEngine.ts:930](../../../src/songs/SongPresetEngine.ts#L930)) — specifically the `if/else if/else` block that picks a voice — with:

```ts
const mode = this.batonModes.get(role) ?? 'parameter';
let voice: ToneVoiceBase;
if (mode === 'instrument') {
  voice = this.createInstrumentVoice(role);
} else if (mode === 'harmonizer' && role === 'green') {
  voice = this.createHarmonyVoice();
} else if (mode === 'walk') {
  voice = this.createWalkVoice(role);
} else {
  voice = this.createParameterVoice(role);
}

voice.connect(this.generatedBus!);
return voice;
```

Then add the helper, just below `createInstrumentVoice`:

```ts
/**
 * Build a WalkVoice for the given role using the per-baton instrument
 * map. Walk uses the same `batonInstruments` storage as instrument and
 * harmonizer modes, so toggling between them preserves the user's
 * instrument choice. The song's beat grid is wired in immediately
 * since walk triggers only on beat arrival.
 */
private createWalkVoice(role: ColorRole): WalkVoice {
  const instrumentKey =
    this.batonInstruments.get(role) ?? DEFAULT_INSTRUMENT_KEY;
  const voice = new WalkVoice(this.ctx!, instrumentKey);
  voice.onNoteTrigger = () => this.triggerSidechain();
  if (this.song?.beats && this.song.beats.length > 0) {
    voice.setBeatTimestamps(this.song.beats);
  }
  voice.setTriggerThreshold(this.stillnessThreshold);
  return voice;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run src/__tests__/SongPresetEngine.walk.test.ts`

Expected: PASS for all three tests.

- [ ] **Step 5: Commit**

```bash
git add src/songs/SongPresetEngine.ts src/__tests__/SongPresetEngine.walk.test.ts
git commit -m "feat(walk): wire WalkVoice into createVoiceForRole

A baton set to mode 'walk' now produces a WalkVoice with the song's
beat grid and the engine's stillness threshold pre-applied. Works on
all four generative batons (red/green/yellow/orange) and switches
back/forth cleanly with the existing swapVoice path."
```

---

## Task 6: Engine wiring — `setBatonInstrument` propagates to walk voices

**Files:**
- Modify: `src/songs/SongPresetEngine.ts` (`setBatonInstrument`, around line 698)
- Modify: `src/__tests__/SongPresetEngine.walk.test.ts` (add the persistence test)

- [ ] **Step 1: Write the failing test**

Append to `describe('SongPresetEngine walk mode wiring')` in `src/__tests__/SongPresetEngine.walk.test.ts`:

```ts
  it('setBatonInstrument forwards to a live WalkVoice', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.setBatonMode('green', 'walk');
    // @ts-expect-error — voices is private
    const voice = engine.voices.get('green') as WalkVoice;
    const setPresetSpy = vi.spyOn(voice, 'setPreset');

    engine.setBatonInstrument('green', 'strings');

    expect(setPresetSpy).toHaveBeenCalledWith('strings');
    engine.dispose();
  });

  it('switching mode preserves the instrument choice across walk/instrument/walk', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.setBatonMode('green', 'walk');
    engine.setBatonInstrument('green', 'strings');

    engine.setBatonMode('green', 'instrument');
    // @ts-expect-error — voices is private
    const instrumentVoice = engine.voices.get('green');
    // InstrumentVoice exposes getInstrumentKey()
    expect((instrumentVoice as { getInstrumentKey: () => string }).getInstrumentKey()).toBe('strings');

    engine.setBatonMode('green', 'walk');
    // @ts-expect-error — voices is private
    const walkVoice = engine.voices.get('green') as WalkVoice;
    expect(walkVoice.getInstrumentKey()).toBe('strings');

    engine.dispose();
  });
```

- [ ] **Step 2: Run, expect failure on the first sub-test**

Run: `npx vitest run src/__tests__/SongPresetEngine.walk.test.ts -t 'setBatonInstrument forwards'`

Expected: FAIL — `setBatonInstrument` doesn't yet have a branch for walk voices, so `setPresetSpy` is never called.

- [ ] **Step 3: Add the `'walk'` branch to `setBatonInstrument`**

In `src/songs/SongPresetEngine.ts`, find the `setBatonInstrument` method ([line 698](../../../src/songs/SongPresetEngine.ts#L698)). The existing code looks like:

```ts
if (currentMode === 'instrument') {
  const voice = this.voices.get(role);
  if (voice instanceof InstrumentVoice) {
    voice.setPreset(instrumentKey);
  }
} else if (currentMode === 'harmonizer' && role === 'green') {
  const voice = this.voices.get(role);
  if (voice instanceof HarmonyVoice) {
    voice.setPreset(instrumentKey);
  }
}
```

Replace it with:

```ts
if (currentMode === 'instrument') {
  const voice = this.voices.get(role);
  if (voice instanceof InstrumentVoice) {
    voice.setPreset(instrumentKey);
  }
} else if (currentMode === 'harmonizer' && role === 'green') {
  // HarmonyVoice consumes the same batonInstruments map; swap its
  // active player to match without rebuilding the voice.
  const voice = this.voices.get(role);
  if (voice instanceof HarmonyVoice) {
    voice.setPreset(instrumentKey);
  }
} else if (currentMode === 'walk') {
  const voice = this.voices.get(role);
  if (voice instanceof WalkVoice) {
    voice.setPreset(instrumentKey);
  }
}
```

- [ ] **Step 4: Run both tests, expect pass**

Run: `npx vitest run src/__tests__/SongPresetEngine.walk.test.ts`

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/songs/SongPresetEngine.ts src/__tests__/SongPresetEngine.walk.test.ts
git commit -m "feat(walk): setBatonInstrument forwards to live WalkVoice

Instrument-palette key now propagates to a WalkVoice the same way it
does for InstrumentVoice and HarmonyVoice. Mode-switch round-trips
preserve the user's instrument choice via the existing
batonInstruments persistence map."
```

---

## Task 7: Engine wiring — `applyBatonAssignments` + `setBeatSnap` no-op

**Files:**
- Modify: `src/songs/SongPresetEngine.ts` (doc-comment on `setBeatSnap`)
- Modify: `src/__tests__/SongPresetEngine.walk.test.ts` (add assignment + beat-snap tests)

The `applyBatonAssignments` method already calls `setBatonMode` and `setBatonInstrument`, so loading a saved walk assignment should already work. This task pins it with a test and explicitly documents the beat-snap no-op.

- [ ] **Step 1: Write the failing tests**

Append to `describe('SongPresetEngine walk mode wiring')`:

```ts
  it('applyBatonAssignments restores a saved walk assignment', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.applyBatonAssignments({
      yellow: { mode: 'walk', instrumentKey: 'strings' },
    });

    // @ts-expect-error — voices is private
    const yellowVoice = engine.voices.get('yellow') as WalkVoice;
    expect(yellowVoice).toBeInstanceOf(WalkVoice);
    expect(yellowVoice.getInstrumentKey()).toBe('strings');

    engine.dispose();
  });

  it('setBeatSnap is a no-op for walk voices (walk is beat-locked by design)', async () => {
    const engine = new SongPresetEngine();
    await engine.loadSong(makeMinimalSong());

    engine.setBatonMode('green', 'walk');
    // @ts-expect-error — voices is private
    const walkVoice = engine.voices.get('green') as WalkVoice;
    // WalkVoice has no setBeatSnap method — verify the engine doesn't
    // attempt to call one (would throw if it tried).
    expect(() => engine.setBeatSnap(true)).not.toThrow();
    expect((walkVoice as unknown as { setBeatSnap?: unknown }).setBeatSnap).toBeUndefined();

    engine.dispose();
  });
```

- [ ] **Step 2: Run, expect pass**

Run: `npx vitest run src/__tests__/SongPresetEngine.walk.test.ts`

Expected: both new tests PASS — `applyBatonAssignments` already routes through `setBatonMode` and `setBatonInstrument` (both already wired in earlier tasks); `setBeatSnap` already skips non-InstrumentVoice voices via `if (voice instanceof InstrumentVoice)`.

- [ ] **Step 3: Update the `setBeatSnap` doc comment**

In `src/songs/SongPresetEngine.ts`, locate `setBeatSnap` ([around line 1341](../../../src/songs/SongPresetEngine.ts#L1341)) and update its comment:

```ts
/**
 * Toggle beat-snap mode for all instrument-mode voices.  Cheap to
 * call every frame — voices only react to the change.  No effect on
 * parameter-mode voices (which already produce beat-locked output by
 * their own internal logic) or on walk-mode voices (walk is
 * intrinsically beat-locked — every walk note fires only on beat
 * arrival).
 */
setBeatSnap(enabled: boolean): void {
```

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: PASS — comment-only change.

- [ ] **Step 5: Commit**

```bash
git add src/songs/SongPresetEngine.ts src/__tests__/SongPresetEngine.walk.test.ts
git commit -m "test(walk): pin applyBatonAssignments + beat-snap behaviour

applyBatonAssignments already routes saved walk assignments through
setBatonMode + setBatonInstrument; pin that with a test. setBeatSnap
is a no-op for walk voices (already true; doc-comment updated to
make it explicit)."
```

---

## Task 8: UI — Walk button in the per-baton mode picker

**Files:**
- Modify: `src/ui/screens/SongPresetScreen.tsx` (mode picker around line 925, instrument selector branch around line 964)

- [ ] **Step 1: Add the Walk button to the mode toggle**

Find the existing mode toggle in `src/ui/screens/SongPresetScreen.tsx` around line 925. The block currently renders three buttons (`Param`, `Instr`, optional `Harm`). Replace lines 908-961 — the IIFE that returns the mode picker — with:

```tsx
{role.id !== 'blue' && (() => {
  const r = role.id as ColorRole;
  const mode = batonModes[r];
  const isInstrument = mode === 'instrument';
  const isHarmonizer = mode === 'harmonizer';
  const isWalk = mode === 'walk';
  const isParameter = !isInstrument && !isHarmonizer && !isWalk;
  const canHarmonize = r === 'green';
  const buttonStyle = (active: boolean) => ({
    flex: 1,
    padding: '0 4px',
    fontSize: 9,
    background: active ? role.cssColor : '#1c1c2a',
    color: active ? '#000' : '#a1a1b8',
    border: `1px solid ${active ? role.cssColor : '#2a2a3a'}`,
    cursor: 'pointer',
    fontWeight: active ? 700 : 400,
  } as React.CSSProperties);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Mode toggle: parameter / instrument / harmonizer (green only) / walk */}
      <div
        role="group"
        aria-label={`${role.label} mode`}
        style={{ display: 'flex', gap: 1, height: 18 }}
      >
        <button
          type="button"
          onClick={() => handleBatonModeChange(r, 'parameter')}
          aria-pressed={isParameter}
          title="Parameter mode (default behaviour)"
          style={buttonStyle(isParameter)}
        >
          Param
        </button>
        <button
          type="button"
          onClick={() => handleBatonModeChange(r, 'instrument')}
          aria-pressed={isInstrument}
          title="Instrument mode (plays chord-tone notes on a chosen instrument)"
          style={buttonStyle(isInstrument)}
        >
          Instr
        </button>
        {canHarmonize && (
          <button
            type="button"
            onClick={() => handleBatonModeChange(r, 'harmonizer')}
            aria-pressed={isHarmonizer}
            title="Harmonizer mode (sings chord-aware harmony to the vocal). Hand height picks the interval. Only works on songs that have a vocal-harmony track."
            style={buttonStyle(isHarmonizer)}
          >
            Harm
          </button>
        )}
        <button
          type="button"
          onClick={() => handleBatonModeChange(r, 'walk')}
          aria-pressed={isWalk}
          title="Walk mode (auto-arpeggiates chord tones on each beat while you move). Y picks loudness; X is ignored. Designed for users with limited horizontal range."
          style={buttonStyle(isWalk)}
        >
          Walk
        </button>
      </div>
```

- [ ] **Step 2: Show the instrument selector when walk mode is active**

Just below the mode toggle in the same IIFE, the existing code branches on `isHarmonizer` / `isInstrument` / else (parameter-mode preset list). Replace the conditional block (currently `{isHarmonizer ? ... : isInstrument ? ... : ...}`) with:

```tsx
      {/* Preset selector — list depends on mode */}
      {isHarmonizer || isInstrument || isWalk ? (
        <select
          className="form-field__select"
          value={batonInstruments[r] ?? DEFAULT_INSTRUMENT_KEY}
          onChange={(e) =>
            handleBatonInstrumentChange(r, e.target.value)
          }
          aria-label={`${role.label} instrument`}
          title={
            isHarmonizer
              ? 'Pick the instrument the harmoniser uses'
              : isWalk
                ? 'Pick the instrument walk mode plays'
                : undefined
          }
          style={{ height: 26, fontSize: 10, width: 86, flexShrink: 0 }}
        >
          {INSTRUMENT_PALETTE_LIST.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.name}</option>
          ))}
        </select>
      ) : (
        <select
          className="form-field__select"
          value={voicePresets[role.id] ?? ''}
          onChange={(e) => handleVoicePresetChange(r, e.target.value)}
          aria-label={`${role.label} preset`}
          style={{ height: 26, fontSize: 10, width: 86, flexShrink: 0 }}
          disabled={!isLoaded}
        >
          {(VOICE_PRESET_OPTIONS[role.id] ?? []).map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.name}</option>
          ))}
        </select>
      )}
    </div>
  );
})()}
```

This consolidates the previous three branches (`isHarmonizer`, `isInstrument`, else) into one — they all rendered the same select with the same `INSTRUMENT_PALETTE_LIST`. Walk joins them as a third instrument-mode case.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: PASS. No new diagnostics.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`

Open Song Preset in the browser. For green, red, yellow, and orange, click the `Walk` button and verify:
- The button visually activates (background = role colour).
- The dropdown changes to show the instrument palette (Piano, Electric Piano, Upright Bass, Strings, Plucked Percussion).
- Switching back to `Param` restores the parameter-mode preset list.

If a song with `beats[]` is loaded and the baton enters frame while moving, walk notes should fire on each beat.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/SongPresetScreen.tsx
git commit -m "feat(walk): mode picker + instrument selector for walk mode

Walk button joins the per-baton mode picker on all four generative
batons. The instrument-palette selector now also shows for walk
mode, sharing the same UI and persistence path as instrument and
harmoniser modes."
```

---

## Task 9: UI — Callout text for active walk-mode batons

**Files:**
- Modify: `src/ui/screens/SongPresetScreen.tsx` (callout branching around line 1585, helper `getWalkModeLines` next to `getInstrumentModeLines` around line 1625)

Right now an active baton in any mode other than `instrument` or `blue` gets the parameter-mode callout from `getRoleStateLines`. Walk mode needs its own callout that shows the instrument and the dynamic hint.

- [ ] **Step 1: Add a walk-mode callout helper**

Just below the existing `getInstrumentModeLines` function in `src/ui/screens/SongPresetScreen.tsx` (around line 1639), add:

```tsx
/**
 * Callout for an active baton in walk mode.
 *
 * Walk mode ignores X entirely, so only the instrument label and a
 * Y-based dynamic hint are surfaced — there's no register / zone
 * information to report. Keeps the callout short and consistent with
 * the other instrument-style modes.
 */
function getWalkModeLines(
  roleId: ColorRole,
  pos: VoicePosition,
  status: SongPresetStatus,
): string[] {
  const instrumentKey = status.batonInstruments?.[roleId] ?? DEFAULT_INSTRUMENT_KEY;
  const entry = INSTRUMENT_PALETTE_BY_KEY[instrumentKey];
  const instrumentLabel = entry?.name ?? instrumentKey;
  // Y → dynamics. Top of frame = loud, bottom = soft.
  const dynHint = pos.y < 0.33 ? 'loud' : pos.y > 0.66 ? 'soft' : 'mid';
  return [`♩ ${instrumentLabel} (walk)`, dynHint];
}
```

- [ ] **Step 2: Route walk-mode active batons to the new helper**

Find the callout branching around line 1585 in the same file:

```tsx
} else {
  const mode = status.batonModes?.[role.id] ?? 'parameter';
  lines =
    mode === 'instrument'
      ? getInstrumentModeLines(role.id, pos, status)
      : getRoleStateLines(role.id, pos, status.voicePresets[role.id] ?? '');
}
```

Replace with:

```tsx
} else {
  const mode = status.batonModes?.[role.id] ?? 'parameter';
  lines =
    mode === 'instrument'
      ? getInstrumentModeLines(role.id, pos, status)
      : mode === 'walk'
        ? getWalkModeLines(role.id, pos, status)
        : getRoleStateLines(role.id, pos, status.voicePresets[role.id] ?? '');
}
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/SongPresetScreen.tsx
git commit -m "feat(walk): callout text for active walk-mode batons

Walk batons show '♩ <instrument> (walk)' plus a loud/mid/soft hint
based on Y. Mirrors the instrument-mode callout shape minus the
register/octave line (walk ignores X)."
```

---

## Task 10: Full test pass + manual verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:run`

Expected: PASS — all existing tests + the new `WalkVoice.test.ts` and `SongPresetEngine.walk.test.ts` pass.

- [ ] **Step 2: Run the type checker**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`

For each of the four shipped songs ([Can't Help Falling in Love](../../../public/songs/cant-help-falling-in-love/), [Everybody Needs Somebody to Love](../../../public/songs/everybody-needs-somebody-to-love/), [Shake a Tail Feather](../../../public/songs/shake-a-tail-feather/), [She Caught the Katy](../../../public/songs/she-caught-the-katy/)):

1. Load the song. Wait for stems + analysis to finish loading.
2. Set green to `Walk`. Move the green baton.
3. Confirm notes fire on each beat while moving.
4. Confirm `posX` does not change pitch — drag horizontally, listen for any pitch change. There should be none.
5. Confirm `posY` changes dynamics — drag vertically, notes should sound louder at the top.
6. Confirm chord changes are reflected: at a chord boundary, the next walk note should be a tone from the new chord (e.g. on Can't Help Falling, the D→A transition).
7. Repeat for red, yellow, orange.
8. Switch back to Param mid-playback. Confirm: no click, no hung note, normal parameter-mode behaviour resumes.

If anything fails, do not commit the verification step — return to the failing task and fix.

- [ ] **Step 4: Final commit (no-op if everything already committed)**

```bash
git status
# Expect: clean.
```

No commit needed unless an issue surfaced during manual verification that required a fix.

---

## Self-Review

Verified against the spec [docs/superpowers/specs/2026-05-13-chord-walk-baton-mode-design.md](../specs/2026-05-13-chord-walk-baton-mode-design.md):

**Spec coverage:**
- ✅ Mode selection (BatonMode widening) — Task 1
- ✅ Walk pattern truth-table — Task 2 (`walkStepNote` tests)
- ✅ Note source (chord.notes sorted) — Task 3 (`update()` sorts inside the closure)
- ✅ Trigger logic (active + beat-arrival + velocity threshold) — Task 3
- ✅ Walk-step does not reset on chord change — Task 3 ("does not reset walkStep when the chord changes mid-cycle")
- ✅ One note per beat — Task 3 ("fires at most one note per beat")
- ✅ No-chord silence — Task 3
- ✅ Sidechain hook — Task 3
- ✅ Transport reset — Task 3
- ✅ No-beats silence — Task 3 ("is silent when no beat data is available")
- ✅ Y → dynamics — Task 4
- ✅ Engine wiring + voice swap — Task 5
- ✅ Walk on all four generative batons — Task 5
- ✅ Instrument-key persistence across mode switches — Task 6
- ✅ `applyBatonAssignments` restores walk — Task 7
- ✅ `setBeatSnap` no-op for walk — Task 7
- ✅ UI mode picker — Task 8
- ✅ UI instrument selector — Task 8
- ✅ UI callout — Task 9
- ✅ Manual verification across all four shipped songs — Task 10

**Type consistency:** `BatonMode` widened in Task 1, used consistently throughout. `WalkVoice` constructor signature `(ctx, instrumentKey)` matches both `InstrumentVoice` and `HarmonyVoice` patterns. `setPreset`, `setBeatTimestamps`, `setTriggerThreshold`, `getInstrumentKey`, `onNoteTrigger`, `onTransportStart`, `onTransportStop`, `dispose` — all consistent across tasks.

**Placeholder scan:** none found.

**Scope:** focused single feature. Other items from the original brainstorm (drum patterns, stem transforms, remix mode, song-preset sound quality) explicitly out of scope per the spec.
