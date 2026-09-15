# Board Sequencer Plan 1a — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the invisible foundations for the Board Sequencer redesign. After this plan the existing screen looks and behaves the same, apart from the bug fixes listed, but its logic lives in tested pure modules, a runtime hook and a player-profile store.

**Architecture:**
- Frame logic moves out of the 1,557-line screen into pure modules: `boardFrame`, `boardGrid`, `boardSetupFlow`, `playNudge`, `cornerEditor`, `orientation`, `roles`, `layout`.
- A `useBoardRuntime` hook runs detection once per camera frame, and drawing on `requestAnimationFrame`.
- The engine gains audible-time helpers, public tempo, a tick switch and a fired-note log.
- Config gains grid-aware read settings with a migration, and is split into a per-device "rig" and per-player profiles. The screen still sees one merged `BoardSequencerStored`.

**Tech Stack:** React 19, TypeScript (strict), Vite, Tone.js 15.1.22, Vitest (jsdom), localStorage.

**Spec:** `docs/superpowers/specs/2026-09-15-board-sequencer-redesign-design.md`. The spec's "Delivery: four plans", Plan 1a lists exactly this plan's scope. Read the spec before starting.

## Global Constraints

- TypeScript strict mode, no `any`. `npm run lint` (= `tsc --noEmit`) must pass after every task.
- Tests live in `src/__tests__/`. Use Vitest with `vi.mock('tone', …)` for Tone.js. `npm run test:run` must pass after every task.
- No new npm dependencies.
- All Tone.js audio goes through the engine; never instantiate Tone in components.
- 20 ms gesture-to-sound: nothing added to the per-frame path may block for more than a few ms.
- Every user-facing threshold is a named, exported constant (calibratable later).
- **Tone mocks.** If a test fails at import with `No "X" export is defined on the "tone" mock`, add `X: vi.fn()` to that test's `vi.mock('tone', …)` factory. The engine's instrument imports reference a few Tone classes at load time.
- No visible UI redesign in this plan. The old screen keeps its rail; only the listed bug fixes change behaviour.
- Config changes are additive and sanitised. **No `CONFIG_VERSION` bump.**
- The brand-new default grid is **4 × 4**. Saved `rows`/`cols` are never replaced.
- `suggestReadSettings(boardSquares, rows, cols, pieceAreaSquares = 0.45)`:
  - `samplesPerAxis = clamp(round(4.5·max(sqX,sqY)), 3, 15)`
  - `minFilledFraction = clamp(0.4·pieceArea/(sqX·sqY), 0.04, 0.10)`
  - where `sqX = boardSquares/cols` and `sqY = boardSquares/rows`
- Storage keys:
  - `admi-board-rig`
  - `admi-board-players`
  - `admi-board-active-player`
  - the legacy key `admi-board-sequencer`, left in place, read-only after migration
- Saved corners order: `corners[0]` = start + high, `[1]` = end + high, `[2]` = end + low, `[3]` = start + low.
- Commit after every task. End each commit message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/songs/audibleTime.ts` | create | Pure: context time of the sound being heard now |
| `src/songs/BoardSequencerEngine.ts` | modify | Audible time for visuals, `Tone.immediate()` ramps, public `setBpm`/`getBpm`, `setTickEnabled`, fired-note log |
| `src/utils/timeConstant.ts` | create | Pure: per-reference-frame alpha → alpha for any `dt` |
| `src/tracking/BoardReader.ts` | modify | `dtMs`-aware smoothing, cached sample lattices, canvas resize only on change, exposes last frame |
| `src/tracking/BoardSequencerMode.ts` | modify | `dt`-aware velocity smoothing |
| `src/tracking/boardFrame.ts` | create | Pure `stepBoardFrame`: splits readings into pattern / bank / stats (extracted from the screen rAF loop) |
| `src/ui/screens/boardSequencer/useBoardRuntime.ts` | create | Camera lifecycle, camera check, per-camera-frame detection, rAF draw callback, engine start/stop |
| `src/tracking/boardGrid.ts` | create | Pure `suggestReadSettings`, `gridSizeOptions`, `applyGridChange` (the spec's `gridOptions.ts`; it lives in `tracking/` so `profiles/` can import it) |
| `src/profiles/BoardSequencerConfig.ts` | modify | New fields, clamping, 4 × 4 default, read-settings migration, `referencedChannelIds`, export `sanitizeBoardSequencerConfig` |
| `src/profiles/BoardProfiles.ts` | create | Rig/player split, `resolveBoardConfig`, legacy migration, load/save active config, create/select players |
| `src/tracking/boardColours.ts` | modify | `classifyCounterKind`, `recalibratedChannel`, `freshChannelId(existing, referenced)` |
| `src/tracking/ColorTracker.ts` | modify | Dark-region median seeding in `counterColourFromRegion` |
| `src/ui/globalShortcuts.ts` | create | Pure `globalSpaceTogglesMute`, `showGlobalMuteButton` |
| `src/ui/App.tsx` | modify | Uses those helpers |
| `src/tracking/boardDetect/orientation.ts` | create | Pure `rotateCorners`, `flipCorners`, `Corners` type |
| `src/ui/screens/boardSequencer/cornerEditor.ts` | create | Pure nudge / taps / inset / hit-test / content-rect / square-centre helpers |
| `src/ui/screens/boardSequencer/boardSetupFlow.ts` | create | Pure setup-step rules |
| `src/ui/screens/boardSequencer/playNudge.ts` | create | Pure nudge state machine |
| `src/ui/screens/boardSequencer/roles.ts` | create | Pure `suggestRole` |
| `src/ui/screens/boardSequencer/layout.ts` | create | Pure `layoutFor` |
| `src/ui/screens/BoardSequencerScreen.tsx` | modify | Uses `stepBoardFrame`, `useBoardRuntime`, the profile store, bug fixes |

### Task 1: Audible time, immediate ramps, public tempo, tick switch

**Files:**
- Create: `src/songs/audibleTime.ts`
- Modify: `src/songs/BoardSequencerEngine.ts`
- Test: `src/__tests__/audibleTime.test.ts`, `src/__tests__/BoardSequencerEngine.tempoTick.test.ts`

**Interfaces:**
- Produces:
  - `audibleTime(ctx: AudibleClockSource, perfNowMs: number): number`
  - `BoardSequencerEngine#audibleNow(): number`
  - `#setBpm(bpm: number): void`
  - `#getBpm(): number`
  - `#setTickEnabled(on: boolean): void`
  - `getPlayheadCol`, `isVariationLap` and `getPlayheadDirection` now use audible time.

- [ ] **Step 1: Write the failing `audibleTime` test**

```ts
// src/__tests__/audibleTime.test.ts
import { describe, it, expect } from 'vitest';
import { audibleTime } from '../songs/audibleTime';

describe('audibleTime', () => {
  it('uses getOutputTimestamp and advances by performance time since the stamp', () => {
    const ctx = {
      currentTime: 10.2,
      outputLatency: 0.05,
      getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 5000 }),
    };
    expect(audibleTime(ctx, 5250)).toBeCloseTo(10.25, 6);
  });

  it('falls back to currentTime - outputLatency when no timestamp is available', () => {
    expect(audibleTime({ currentTime: 3, outputLatency: 0.02 }, 0)).toBeCloseTo(2.98, 6);
    expect(audibleTime({ currentTime: 3 }, 0)).toBeCloseTo(3, 6);
  });

  it('falls back when the timestamp is not yet valid (performanceTime 0)', () => {
    const ctx = { currentTime: 1, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) };
    expect(audibleTime(ctx, 999)).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/__tests__/audibleTime.test.ts`
Expected: FAIL, "Failed to resolve import ../songs/audibleTime"

- [ ] **Step 3: Implement `audibleTime`**

```ts
// src/songs/audibleTime.ts
/**
 * The audio-context time of the sound being HEARD right now. Unlike Tone.now()
 * (currentTime + look-ahead, ~0.1 s ahead) this lines visuals up with the sound:
 * a playhead/pop driven by it never appears before its note is audible.
 */
export interface AudibleClockSource {
  currentTime: number;
  outputLatency?: number;
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
}

export function audibleTime(ctx: AudibleClockSource, perfNowMs: number): number {
  const ts = ctx.getOutputTimestamp?.();
  if (ts && typeof ts.contextTime === 'number' && typeof ts.performanceTime === 'number' && ts.performanceTime > 0) {
    return ts.contextTime + (perfNowMs - ts.performanceTime) / 1000;
  }
  return ctx.currentTime - (ctx.outputLatency ?? 0);
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/__tests__/audibleTime.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing engine test**

```ts
// src/__tests__/BoardSequencerEngine.tempoTick.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const clock = vi.hoisted(() => ({ now: 0, immediate: 0 }));
vi.mock('tone', () => {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn(), triggerAttackRelease: vi.fn() });
  return {
    getContext: vi.fn(() => ({ rawContext: { currentTime: 0, createGain: vi.fn() } })),
    now: vi.fn(() => clock.now),
    immediate: vi.fn(() => clock.immediate),
    MembraneSynth: vi.fn(() => node()),
    Limiter: vi.fn(() => node()), Reverb: vi.fn(() => node()), FeedbackDelay: vi.fn(() => node()),
    connect: vi.fn(),
  };
});
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));

import { BoardSequencerEngine, type BoardEngineConfig } from '../songs/BoardSequencerEngine';

const cfg = (): BoardEngineConfig => ({
  bpm: 60, rows: 4, cols: 4, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
  noteLengthBeats: 0.9, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels: [],
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1,
});

interface Priv { startSec: number; cfg: BoardEngineConfig; tick: { triggerAttackRelease: ReturnType<typeof vi.fn> } | null; audibleNow(): number }

describe('BoardSequencerEngine tempo + tick', () => {
  beforeEach(() => { clock.now = 0; clock.immediate = 0; });

  it('setBpm rebases the clock so the beat position is continuous', () => {
    const e = new BoardSequencerEngine(cfg());
    const p = e as unknown as Priv;
    p.startSec = 0;
    clock.now = 10; // beat 10 at 60 BPM
    e.setBpm(120);
    expect(e.getBpm()).toBe(120);
    expect((clock.now - p.startSec) / (60 / 120)).toBeCloseTo(10, 6);
  });

  it('setBpm is a no-op while synced to a song with beats; getBpm reports the song tempo', () => {
    const e = new BoardSequencerEngine(cfg());
    e.setSyncSource({ getTime: () => 0, beats: [0, 0.5, 1, 1.5], chordAt: () => null });
    e.setBpm(150);
    expect(e.getBpm()).toBeCloseTo(120, 6); // 0.5 s spacing
  });

  it('getPlayheadCol follows audible time, not Tone.now()', () => {
    const e = new BoardSequencerEngine(cfg());
    const p = e as unknown as Priv;
    p.startSec = 0;
    clock.now = 2.1; // look-ahead clock says beat 2
    vi.spyOn(p, 'audibleNow').mockReturnValue(1.95); // heard: still beat 1
    expect(e.getPlayheadCol(4)).toBe(1);
  });

  it('fireTick respects setTickEnabled and starts at Tone.immediate()', () => {
    const e = new BoardSequencerEngine(cfg());
    const p = e as unknown as Priv;
    const trigger = vi.fn();
    p.tick = { triggerAttackRelease: trigger };
    clock.immediate = 5;
    e.fireTick();
    expect(trigger).not.toHaveBeenCalled(); // tickEnabled false
    e.setTickEnabled(true);
    e.fireTick();
    expect(trigger).toHaveBeenCalledWith('C2', 0.05, 5);
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run src/__tests__/BoardSequencerEngine.tempoTick.test.ts`
Expected: FAIL, "e.setBpm is not a function"

- [ ] **Step 7: Implement the engine changes** in `src/songs/BoardSequencerEngine.ts`

1. Add `import { audibleTime } from './audibleTime';`.
2. Rename the private `setTempo` to a public `setBpm`, add the sync guard, and update its caller in `applyFader` (`this.setTempo(` → `this.setBpm(`):

```ts
  /**
   * Set the standalone BPM live, rebasing the clock so the beat position stays
   * continuous. Ignored while locked to a song with beats (the song owns tempo).
   */
  setBpm(bpm: number): void {
    if (this.syncSource && this.syncSource.beats.length > 0) return;
    const clamped = Math.max(20, Math.min(400, bpm));
    if (Math.abs(clamped - this.cfg.bpm) < 0.05) return;
    const now = Tone.now();
    const elapsedBeats = (now - this.startSec) / (60 / this.cfg.bpm);
    this.startSec = now - elapsedBeats * (60 / clamped);
    this.cfg.bpm = clamped;
  }

  /** The tempo actually in effect: the song's (from beat spacing) when synced, else cfg.bpm. */
  getBpm(): number {
    const beats = this.syncSource?.beats;
    if (beats && beats.length > 1) {
      const i = Math.min(Math.max(this.lastBeatIndex, 0), beats.length - 2);
      const spacing = beats[i + 1] - beats[i];
      if (spacing > 0) return 60 / spacing;
    }
    return this.cfg.bpm;
  }

  /** Context time of the sound being heard now (visuals use this, not Tone.now()). */
  audibleNow(): number {
    return audibleTime(this.ctx, performance.now());
  }

  private visualBeat(): number {
    return this.syncSource && this.syncSource.beats.length > 0
      ? this.lastBeatIndex
      : Math.floor((this.audibleNow() - this.startSec) / (60 / this.cfg.bpm));
  }
```

3. Replace the beat computation in `getPlayheadCol`, `isVariationLap` and `getPlayheadDirection` with `const beat = this.visualBeat();`.
4. Always create the tick synth in `init()`: delete the `if (this.cfg.tickEnabled) {` wrapper and its closing brace. Add:

```ts
  /** Turn the settle tick on/off live. */
  setTickEnabled(on: boolean): void {
    this.cfg.tickEnabled = on;
  }
```

5. In `fireTick`, change the guard to `if (this.muted || !this.tick || !this.cfg.tickEnabled) return;`. Change `strictlyAfter(Tone.now(), …)` to `strictlyAfter(Tone.immediate(), …)`.
6. In `applyFader`, `applyToggle`, `setVolume`, `setChannelVolume`, `setChannelReverbSend` and `setChannelDelaySend`, replace `Tone.now()` with `Tone.immediate()`. Leave `Tone.now()` in `setBpm`, `start` and the schedulers unchanged, because scheduling uses the look-ahead clock.

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npx vitest run src/__tests__/BoardSequencerEngine.tempoTick.test.ts src/__tests__/audibleTime.test.ts && npm run lint`
Expected: PASS; lint clean.

- [ ] **Step 9: Commit**

```bash
git add src/songs/audibleTime.ts src/songs/BoardSequencerEngine.ts src/__tests__/audibleTime.test.ts src/__tests__/BoardSequencerEngine.tempoTick.test.ts
git commit -m "feat(board-sequencer): audible-time visuals, immediate ramps, public setBpm/getBpm, tick switch

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Fired-note log

**Files:**
- Modify: `src/songs/BoardSequencerEngine.ts`
- Test: `src/__tests__/BoardSequencerEngine.firedNotes.test.ts`

**Interfaces:**
- Produces:
  - `export interface FiredNote { row: number; col: number; colour: ColourId; role: ColourRole; audioTime: number; durSec: number; source: 'live' | 'page' | 'loop' }`
  - `export const FIRED_NOTE_CAP = 256`
  - `BoardSequencerEngine#drainFiredNotes(): FiredNote[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/BoardSequencerEngine.firedNotes.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: { currentTime: 0 } })),
  now: vi.fn(() => 0), immediate: vi.fn(() => 0),
  MembraneSynth: vi.fn(), Limiter: vi.fn(), Reverb: vi.fn(), FeedbackDelay: vi.fn(), connect: vi.fn(),
}));
vi.mock('../effects', () => ({ getEffectChainManager: () => ({ initialize: vi.fn(), getInput: () => null }) }));

import { BoardSequencerEngine, FIRED_NOTE_CAP, type BoardEngineConfig } from '../songs/BoardSequencerEngine';
import type { ColourChannel } from '../tracking/boardColours';
import type { ActiveCell } from '../tracking/BoardSequencerMode';

const channels: ColourChannel[] = [
  { id: 'm', kind: 'hue', role: 'melody', swatch: '#f00' },
  { id: 'd', kind: 'black', role: 'drums', swatch: '#000' },
];
const baseCfg = (over: Partial<BoardEngineConfig> = {}): BoardEngineConfig => ({
  bpm: 60, rows: 4, cols: 8, scaleRootMidi: 60, scaleSemitones: [0, 2, 4, 7, 9], swing: 0, humanize: 0,
  noteLengthBeats: 0.5, velocity: 0.7, tickEnabled: false, octaveShift: 0, volume: 0.6, channels,
  faderAxis: 'row', loopStepsRed: 0, loopStepsBlack: 0, loopStepsBlue: 0, numPages: 1, ...over,
});

interface Priv {
  channelById: Map<string, ColourChannel>;
  voiceByChannel: Map<string, { voice: { play: ReturnType<typeof vi.fn> } }>;
  drumKit: { play: ReturnType<typeof vi.fn> } | null;
  fireStep(beat: number, t: number, spb: number, chord: null): void;
  muted: boolean;
}

function engine(over: Partial<BoardEngineConfig> = {}) {
  const e = new BoardSequencerEngine(baseCfg(over));
  const p = e as unknown as Priv;
  p.channelById = new Map(channels.map((c) => [c.id, c]));
  const play = vi.fn();
  p.voiceByChannel = new Map([['m', { voice: { play } }]]);
  p.drumKit = { play: vi.fn() };
  return { e, p, play };
}

const cell = (row: number, col: number, colour: string, conditional?: boolean): ActiveCell =>
  (conditional ? { row, col, colour, conditional } : { row, col, colour });

afterEach(() => vi.restoreAllMocks());

describe('fired-note log', () => {
  it('records exactly the cells on this beat, with the scheduled time', () => {
    const { e, p } = engine();
    e.setActiveCells([cell(0, 2, 'm'), cell(1, 5, 'm'), cell(3, 2, 'd')]);
    p.fireStep(2, 7.5, 1, null);
    const fired = e.drainFiredNotes();
    expect(fired.map((f) => `${f.row},${f.col},${f.colour},${f.source}`).sort()).toEqual(['0,2,m,live', '3,2,d,live']);
    expect(fired.every((f) => f.audioTime === 7.5)).toBe(true);
    expect(e.drainFiredNotes()).toEqual([]); // drained
  });

  it('respects the per-role polyrhythm loop length', () => {
    const { e, p } = engine({ loopStepsRed: 3 });
    e.setActiveCells([cell(0, 2, 'm'), cell(0, 5, 'm')]);
    p.fireStep(5, 1, 1, null); // melodic loop of 3: beat 5 -> step 2
    expect(e.drainFiredNotes().map((f) => f.col)).toEqual([2]);
  });

  it('records a conditional cell only on variation laps', () => {
    const { e, p } = engine({ cols: 4 });
    e.setActiveCells([cell(0, 0, 'm', true)]);
    p.fireStep(0, 1, 1, null); // lap 0 (A)
    expect(e.drainFiredNotes()).toHaveLength(0);
    p.fireStep(4, 1, 1, null); // lap 1 (B)
    expect(e.drainFiredNotes()).toHaveLength(1);
  });

  it('does not record humanize-skipped notes', () => {
    const { e, p } = engine({ humanize: 1 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    e.setActiveCells([cell(0, 0, 'm')]);
    p.fireStep(0, 1, 1, null);
    expect(e.drainFiredNotes()).toHaveLength(0);
  });

  it('records nothing while muted', () => {
    const { e, p } = engine();
    e.setMuted(true);
    e.setActiveCells([cell(0, 0, 'm')]);
    p.fireStep(0, 1, 1, null);
    expect(e.drainFiredNotes()).toHaveLength(0);
  });

  it('tags page-snapshot cells as page and loop-bank cells as loop', () => {
    const { e, p } = engine({ numPages: 2, cols: 4 });
    e.setSelectedPage(0);
    e.setPages([[], [cell(0, 0, 'm')]]);
    p.fireStep(4, 1, 1, null); // beat 4 -> page 1 (snapshot)
    expect(e.drainFiredNotes().map((f) => f.source)).toEqual(['page']);
    e.setActiveLoops([[cell(1, 0, 'm')]]);
    p.fireStep(8, 1, 1, null); // page 0 live (empty) + loop
    expect(e.drainFiredNotes().map((f) => f.source)).toEqual(['loop']);
  });

  it('caps the buffer and clears on start/stop', () => {
    const { e, p } = engine({ cols: 1 });
    e.setActiveCells([cell(0, 0, 'm')]);
    for (let b = 0; b < FIRED_NOTE_CAP + 10; b++) p.fireStep(b, b, 1, null);
    expect(e.drainFiredNotes()).toHaveLength(FIRED_NOTE_CAP);
    p.fireStep(0, 0, 1, null);
    e.stop();
    expect(e.drainFiredNotes()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/__tests__/BoardSequencerEngine.firedNotes.test.ts`
Expected: FAIL, "drainFiredNotes is not a function" or "FIRED_NOTE_CAP" undefined.

- [ ] **Step 3: Implement** in `src/songs/BoardSequencerEngine.ts`

1. Below the imports:

```ts
/** A note the engine actually scheduled (drives note pops / "Now:" — never inferred from the playhead). */
export interface FiredNote {
  row: number;
  col: number;
  colour: ColourId;
  role: ColourRole;
  audioTime: number;
  durSec: number;
  source: 'live' | 'page' | 'loop';
}

export const FIRED_NOTE_CAP = 256;
```

2. Class fields and methods:

```ts
  private fired: FiredNote[] = [];

  private recordFired(n: FiredNote): void {
    this.fired.push(n);
    if (this.fired.length > FIRED_NOTE_CAP) this.fired.splice(0, this.fired.length - FIRED_NOTE_CAP);
  }

  /** Take (and clear) the notes scheduled since the last call. Polled from rAF. */
  drainFiredNotes(): FiredNote[] {
    const out = this.fired;
    this.fired = [];
    return out;
  }
```

3. In `start()` and `stop()` add `this.fired = [];`.
4. In `fireStep`, build tagged cells and record after each note actually plays. Replace the `playCells` line and the `for (const cell of playCells)` loop head with:

```ts
    const liveSource: FiredNote['source'] = page === this.selectedPage ? 'live' : 'page';
    const tagged: { cell: ActiveCell; source: FiredNote['source'] }[] = [
      ...cells.map((c) => ({ cell: c, source: liveSource })),
      ...this.activeLoops.flat().map((c) => ({ cell: c, source: 'loop' as const })),
    ];
    const playCells = tagged.map((t) => t.cell);
```

   and

```ts
    for (const { cell, source } of tagged) {
```

5. Inside the loop, record once per cell right where sound is produced:
   - **drums:** replace `if (drum) this.drumKit?.play(drum as KitDrum, vel, stepTime);` with

```ts
        if (drum && this.drumKit) {
          this.drumKit.play(drum as KitDrum, vel, stepTime);
          this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec, source });
        }
```

   - **bass:** after `voice.play(base - 12 + oct, vel, durSec, stepTime);` add `this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec, source });`
   - **chord stab:** after the `for (const n of this.chordStack(...))` loop add the same `recordFired` call.
   - **melody:** inside `if (midi !== undefined) { … }`, after `voice.play(midi + oct, vel, dur, stepTime);` add `this.recordFired({ row: cell.row, col: cell.col, colour: cell.colour, role, audioTime: stepTime, durSec: dur, source });`

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/__tests__/BoardSequencerEngine.firedNotes.test.ts src/__tests__/BoardSequencerEngine.tempoTick.test.ts && npm run lint`
Expected: PASS; lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/songs/BoardSequencerEngine.ts src/__tests__/BoardSequencerEngine.firedNotes.test.ts
git commit -m "feat(board-sequencer): engine fired-note log for audio-accurate visuals

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 3: Extract `stepBoardFrame` (characterisation first)

**Files:**
- Create: `src/tracking/boardFrame.ts`
- Modify: `src/ui/screens/BoardSequencerScreen.tsx`, the rAF loop body at lines 562–627 (HEAD `ad3e096`)
- Test: `src/__tests__/boardFrame.test.ts`

**Interfaces:**
- Consumes: `CellReading`, `ActiveCell`, `BoardStepResult`, `PieceColour` from `BoardSequencerMode`; `LoopBankState` and `stepLoopBank` from `loopBank`; `conditionalFromOffset` from `boardSequencerScale`.
- Produces:

```ts
export type BankSlotState = 'empty' | 'paused' | 'active';
export interface BoardFrameCfg { rows: number; cols: number; loopBankEnabled: boolean; variationEnabled: boolean; variationOffsetThreshold: number; numPages: number }
export interface BoardFrameInput { readings: CellReading[]; cfg: BoardFrameCfg; running: boolean; modeResult: BoardStepResult | null; loopBank: LoopBankState }
export interface BoardFrameOutput {
  occupied: Map<string, PieceColour>;
  byColour: Partial<Record<ColourId, number>>;
  conditional: Set<string>;
  patternCells: ActiveCell[];
  activeLoops: ActiveCell[][];
  activeMap: Map<string, PieceColour>;
  loopBank: LoopBankState;
  captured: number[];
  fireTick: boolean;
  bankSlots: BankSlotState[] | null;
}
export function stepBoardFrame(input: BoardFrameInput): BoardFrameOutput;
```

- [ ] **Step 1: Write the characterisation tests.** They pin today's inline behaviour.

```ts
// src/__tests__/boardFrame.test.ts
import { describe, it, expect } from 'vitest';
import { stepBoardFrame, type BoardFrameCfg } from '../tracking/boardFrame';
import { emptyLoopBank } from '../songs/loopBank';
import type { ActiveCell, BoardStepResult, CellReading } from '../tracking/BoardSequencerMode';

const cfg = (over: Partial<BoardFrameCfg> = {}): BoardFrameCfg => ({
  rows: 4, cols: 4, loopBankEnabled: false, variationEnabled: false, variationOffsetThreshold: 0.6, numPages: 1, ...over,
});
const rd = (row: number, col: number, colour: string | null, offset: number | null = 0.1): CellReading => ({
  row, col, occupied: colour !== null, colour, centroid: colour ? { x: 0.5, y: 0.5 } : null, offset,
});
const res = (active: ActiveCell[], justSettled = active.length > 0): BoardStepResult => ({
  activeCells: active, justSettled: justSettled ? active.map(({ row, col }) => ({ row, col })) : [], justDeactivated: [],
});

describe('stepBoardFrame', () => {
  it('counts occupied readings per colour whether or not running', () => {
    const out = stepBoardFrame({ readings: [rd(0, 0, 'red'), rd(1, 1, 'red'), rd(2, 2, 'blue'), rd(3, 3, null)], cfg: cfg(), running: false, modeResult: null, loopBank: emptyLoopBank(0) });
    expect(out.byColour).toEqual({ red: 2, blue: 1 });
    expect(out.occupied.get('2,2')).toBe('blue');
    expect(out.patternCells).toEqual([]);
    expect(out.fireTick).toBe(false);
    expect(out.bankSlots).toBeNull();
  });

  it('marks conditional cells only when variation is on and single-page', () => {
    const readings = [rd(0, 0, 'red', 0.8), rd(0, 1, 'red', 0.2)];
    expect([...stepBoardFrame({ readings, cfg: cfg({ variationEnabled: true }), running: false, modeResult: null, loopBank: emptyLoopBank(0) }).conditional]).toEqual(['0,0']);
    expect(stepBoardFrame({ readings, cfg: cfg({ variationEnabled: true, numPages: 2 }), running: false, modeResult: null, loopBank: emptyLoopBank(0) }).conditional.size).toBe(0);
    expect(stepBoardFrame({ readings, cfg: cfg(), running: false, modeResult: null, loopBank: emptyLoopBank(0) }).conditional.size).toBe(0);
  });

  it('loop bank off: the whole settled set is the pattern, no loops', () => {
    const active = [{ row: 3, col: 0, colour: 'red' }, { row: 0, col: 1, colour: 'red' }];
    const out = stepBoardFrame({ readings: [], cfg: cfg(), running: true, modeResult: res(active), loopBank: emptyLoopBank(0) });
    expect(out.patternCells).toEqual(active);
    expect(out.activeLoops).toEqual([]);
    expect(out.activeMap.size).toBe(2);
    expect(out.fireTick).toBe(true);
  });

  it('loop bank on: bottom row are slots, capture on rising edge, slot states reported', () => {
    const pattern = { row: 0, col: 1, colour: 'red' };
    const onSlot2 = { row: 3, col: 2, colour: 'blue' };
    const out = stepBoardFrame({ readings: [], cfg: cfg({ loopBankEnabled: true }), running: true, modeResult: res([pattern, onSlot2]), loopBank: emptyLoopBank(4) });
    expect(out.patternCells).toEqual([pattern]);
    expect(out.captured).toEqual([2]);
    expect(out.activeLoops).toEqual([[pattern]]);
    expect(out.bankSlots).toEqual(['empty', 'empty', 'active', 'empty']);
    const next = stepBoardFrame({ readings: [], cfg: cfg({ loopBankEnabled: true }), running: true, modeResult: res([pattern], false), loopBank: out.loopBank });
    expect(next.bankSlots).toEqual(['empty', 'empty', 'paused', 'empty']);
    expect(next.captured).toEqual([]);
  });

  it('not running: loop bank state is passed through unchanged', () => {
    const bank = emptyLoopBank(4);
    const out = stepBoardFrame({ readings: [], cfg: cfg({ loopBankEnabled: true }), running: false, modeResult: null, loopBank: bank });
    expect(out.loopBank).toBe(bank);
    expect(out.bankSlots).toEqual(['empty', 'empty', 'empty', 'empty']);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/__tests__/boardFrame.test.ts`
Expected: FAIL, cannot resolve `../tracking/boardFrame`.

- [ ] **Step 3: Implement `boardFrame.ts`.** It mirrors the screen's inline logic exactly.

```ts
// src/tracking/boardFrame.ts
/**
 * One detection frame of the board sequencer, as a pure function: per-colour counts,
 * the overlay's conditional set, and (while running) the live pattern vs loop-bank
 * slots. Extracted verbatim from the screen's rAF loop; the caller does the I/O
 * (engine calls, persistence, drawing).
 */
import type { ColourId } from './boardColours';
import type { ActiveCell, BoardStepResult, CellReading, PieceColour } from './BoardSequencerMode';
import { stepLoopBank, type LoopBankState } from '../songs/loopBank';
import { conditionalFromOffset } from '../songs/boardSequencerScale';

export type BankSlotState = 'empty' | 'paused' | 'active';

export interface BoardFrameCfg {
  rows: number;
  cols: number;
  loopBankEnabled: boolean;
  variationEnabled: boolean;
  variationOffsetThreshold: number;
  numPages: number;
}

export interface BoardFrameInput {
  readings: CellReading[];
  cfg: BoardFrameCfg;
  running: boolean;
  modeResult: BoardStepResult | null;
  loopBank: LoopBankState;
}

export interface BoardFrameOutput {
  occupied: Map<string, PieceColour>;
  byColour: Partial<Record<ColourId, number>>;
  conditional: Set<string>;
  patternCells: ActiveCell[];
  activeLoops: ActiveCell[][];
  activeMap: Map<string, PieceColour>;
  loopBank: LoopBankState;
  captured: number[];
  fireTick: boolean;
  bankSlots: BankSlotState[] | null;
}

export function stepBoardFrame({ readings, cfg, running, modeResult, loopBank }: BoardFrameInput): BoardFrameOutput {
  const occupied = new Map<string, PieceColour>();
  const byColour: Partial<Record<ColourId, number>> = {};
  for (const rd of readings) {
    if (rd.occupied && rd.colour) {
      occupied.set(`${rd.row},${rd.col}`, rd.colour);
      byColour[rd.colour] = (byColour[rd.colour] ?? 0) + 1;
    }
  }
  const conditional = new Set<string>();
  if (cfg.variationEnabled && cfg.numPages <= 1) {
    for (const rd of readings) {
      if (rd.occupied && conditionalFromOffset(rd.offset ?? null, cfg.variationEnabled, cfg.variationOffsetThreshold)) {
        conditional.add(`${rd.row},${rd.col}`);
      }
    }
  }

  let patternCells: ActiveCell[] = [];
  let activeLoops: ActiveCell[][] = [];
  let nextBank = loopBank;
  let captured: number[] = [];
  let fireTick = false;
  if (running && modeResult) {
    if (cfg.loopBankEnabled) {
      const bankRow = cfg.rows - 1;
      patternCells = modeResult.activeCells.filter((c) => c.row < bankRow);
      const present = Array.from({ length: cfg.cols }, (_, i) =>
        modeResult.activeCells.some((c) => c.row === bankRow && c.col === i));
      const stepped = stepLoopBank(loopBank, present, patternCells, cfg.cols);
      nextBank = stepped.state;
      captured = stepped.captured;
      activeLoops = stepped.active;
    } else {
      patternCells = modeResult.activeCells;
    }
    fireTick = modeResult.justSettled.length > 0;
  }
  const activeMap = new Map<string, PieceColour>();
  for (const c of patternCells) activeMap.set(`${c.row},${c.col}`, c.colour);

  const bankSlots = cfg.loopBankEnabled
    ? Array.from({ length: cfg.cols }, (_, i): BankSlotState => {
      const saved = nextBank.saved[i];
      if (saved == null) return 'empty';
      return nextBank.present[i] ? 'active' : 'paused';
    })
    : null;

  return { occupied, byColour, conditional, patternCells, activeLoops, activeMap, loopBank: nextBank, captured, fireTick, bankSlots };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/__tests__/boardFrame.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire it into the screen.** Replace lines 562–627 of the rAF loop, from `const occupied = new Map…` through the `bankSlots` computation, with:

```tsx
          modeRef.current?.setVariation(cfg.variationEnabled, cfg.variationOffsetThreshold);
          engineRef.current?.setPingPong(cfg.pingPong);
          const running = runningRef.current && !!modeRef.current && !!engineRef.current;
          const modeResult = running && modeRef.current ? modeRef.current.step(readings, dt, now) : null;
          const frame = stepBoardFrame({ readings, cfg, running, modeResult, loopBank: loopBankRef.current });
          let playCol = 0;
          if (running && engineRef.current) {
            loopBankRef.current = frame.loopBank;
            if (frame.captured.length > 0) persistLoopSlots(frame.loopBank.saved);
            engineRef.current.setActiveCells(frame.patternCells);
            engineRef.current.setActiveLoops(frame.activeLoops);
            activeCellsRef.current = frame.patternCells;
            if (frame.fireTick) engineRef.current.fireTick();
            playCol = engineRef.current.getPlayheadCol(cfg.cols);
          }
          const isVarLap = runningRef.current && engineRef.current && cfg.numPages <= 1
            ? engineRef.current.isVariationLap()
            : false;
          const pingDir = runningRef.current && engineRef.current && cfg.pingPong
            ? engineRef.current.getPlayheadDirection()
            : 0;
          const { occupied, activeMap, conditional, byColour, bankSlots } = frame;
          const activeArr = frame.patternCells;
```

Keep the following `drawOverlay(...)` call and the throttled state block unchanged. Add `import { stepBoardFrame } from '../../tracking/boardFrame';`. Remove the now-unused `stepLoopBank` and `conditionalFromOffset` imports only if lint reports them unused; `conditionalFromOffset` may still be used elsewhere.

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run test:run`
Expected: clean; all tests pass.
Manual (`npm run dev`, Board Sequencer, calibrated board):
- a settled counter plays and ticks
- loop bank capture/pause/resume behaves as before
- Variation dashed rings appear

- [ ] **Step 7: Commit**

```bash
git add src/tracking/boardFrame.ts src/__tests__/boardFrame.test.ts src/ui/screens/BoardSequencerScreen.tsx
git commit -m "refactor(board-sequencer): extract pure stepBoardFrame with characterisation tests

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Detection per camera frame, time-constant smoothing, reader tidy-up

**Files:**
- Create: `src/utils/timeConstant.ts`, `src/tracking/videoFrameLoop.ts`
- Modify: `src/tracking/BoardReader.ts`, `src/tracking/BoardSequencerMode.ts`
- Test: `src/__tests__/timeConstant.test.ts`, `src/__tests__/videoFrameLoop.test.ts`, `src/__tests__/BoardSequencerMode.frameRate.test.ts`, `src/__tests__/BoardReader.test.ts` (extend)

**Interfaces:**
- Produces:
  - `REFERENCE_FRAME_MS` (= 1000/60)
  - `alphaForDt(alphaPerRef: number, dtMs: number, refMs?: number): number`
  - `startVideoFrameLoop(video: VideoFrameSource, onFrame: (info: { nowMs: number; dtMs: number }) => void, raf?, caf?): () => void`
  - `BoardReaderOptions.dtMs?: number`
  - `BoardReader#lastFrame(): { data: Uint8ClampedArray; width: number; height: number; downscale: number } | null`
  - `buildCellLattice(h, row, col, rows, cols, samplesPerAxis): Float64Array`
  - `sampleRegion(..., lattice?: Float64Array)`

The smoothing constants keep their meaning *per 60 Hz frame*, so behaviour at today's 60 Hz display is unchanged. What changes is that processing happens once per camera frame.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/timeConstant.test.ts
import { describe, it, expect } from 'vitest';
import { alphaForDt, REFERENCE_FRAME_MS } from '../utils/timeConstant';

describe('alphaForDt', () => {
  it('returns the reference alpha for one reference frame', () => {
    expect(alphaForDt(0.4, REFERENCE_FRAME_MS)).toBeCloseTo(0.4, 10);
  });
  it('composes: two half steps equal one full step', () => {
    const a = alphaForDt(0.4, 10);
    const oneStep = alphaForDt(0.4, 20);
    expect(1 - (1 - a) * (1 - a)).toBeCloseTo(oneStep, 10);
  });
  it('keeps 1 as "no smoothing" and 0 as frozen', () => {
    expect(alphaForDt(1, 33)).toBe(1);
    expect(alphaForDt(0, 33)).toBe(0);
    expect(alphaForDt(0.5, 0)).toBe(0);
  });
});
```

```ts
// src/__tests__/videoFrameLoop.test.ts
import { describe, it, expect, vi } from 'vitest';
import { startVideoFrameLoop, type VideoFrameSource } from '../tracking/videoFrameLoop';

describe('startVideoFrameLoop', () => {
  it('uses requestVideoFrameCallback: one callback per presented frame, dt from timestamps', () => {
    let pending: ((now: number) => void) | null = null;
    const video: VideoFrameSource = {
      currentTime: 0,
      requestVideoFrameCallback: (cb) => { pending = (now) => cb(now, { mediaTime: 0 }); return 1; },
      cancelVideoFrameCallback: vi.fn(),
    };
    const frames: number[] = [];
    const stop = startVideoFrameLoop(video, ({ dtMs }) => frames.push(dtMs));
    pending!(1000);
    pending!(1033);
    pending!(1066);
    expect(frames).toEqual([1000 / 30, 33, 33]);
    stop();
    expect(video.cancelVideoFrameCallback).toHaveBeenCalled();
  });

  it('falls back to rAF and skips ticks where currentTime has not changed', () => {
    const cbs: FrameRequestCallback[] = [];
    const raf = (cb: FrameRequestCallback) => { cbs.push(cb); return cbs.length; };
    const video: VideoFrameSource = { currentTime: 0 };
    const frames: number[] = [];
    startVideoFrameLoop(video, ({ nowMs }) => frames.push(nowMs), raf, () => {});
    cbs.shift()!(16);          // currentTime 0: first sighting counts as a frame
    cbs.shift()!(33);          // unchanged → skipped
    video.currentTime = 0.033;
    cbs.shift()!(50);          // changed → frame
    expect(frames).toEqual([16, 50]);
  });
});
```

```ts
// src/__tests__/BoardSequencerMode.frameRate.test.ts
import { describe, it, expect } from 'vitest';
import { BoardSequencerMode, type CellReading } from '../tracking/BoardSequencerMode';

const cfg = { settleWindowMs: 600, velocityFloor: 0.0008, velocitySmoothing: 0.5, occupancyGraceMs: 150, motionConfirmMs: 80 };
const at = (x: number): CellReading => ({ row: 0, col: 0, occupied: true, colour: 'red', centroid: { x, y: 0.5 } });

/** Settle a piece, then slide it at `speed` (units/ms); return ms until it deactivates (or -1). */
function msToDeactivate(dtMs: number, speed: number): number {
  const m = new BoardSequencerMode(cfg);
  let t = 0;
  for (; t <= 1000; t += dtMs) m.step([at(0.5)], dtMs, t);
  let x = 0.5;
  for (let elapsed = 0; elapsed < 1000; elapsed += dtMs) {
    x += speed * dtMs;
    const r = m.step([at(x)], dtMs, t + elapsed);
    if (r.justDeactivated.length > 0) return elapsed + dtMs;
  }
  return -1;
}

describe('BoardSequencerMode frame-rate independence', () => {
  it('confirms the same slow slide at 30 fps and 60 fps within one frame', () => {
    const speed = 0.0008 * 1.3;
    const a = msToDeactivate(1000 / 30, speed);
    const b = msToDeactivate(1000 / 60, speed);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1000 / 30 + 1);
  });
});
```

Add to `src/__tests__/BoardReader.test.ts`:

```ts
import { buildCellLattice } from '../tracking/BoardReader';

describe('buildCellLattice', () => {
  it('gives the same sample result as computing the homography per sample', () => {
    const h = computeHomography(UNIT_SQUARE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    const half: RgbSampler = (x) => (x < 50 ? { r: 220, g: 10, b: 10 } : { r: 128, g: 128, b: 128 });
    const direct = sampleRegion(half, h, 0, 0, 1, 1, COLOURS, 5);
    const cached = sampleRegion(half, h, 0, 0, 1, 1, COLOURS, 5, buildCellLattice(h, 0, 0, 1, 1, 5));
    expect(cached).toEqual(direct);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/__tests__/timeConstant.test.ts src/__tests__/videoFrameLoop.test.ts src/__tests__/BoardSequencerMode.frameRate.test.ts src/__tests__/BoardReader.test.ts`
Expected: FAIL (missing modules / exports; the frame-rate test fails because smoothing ignores `dt`).

- [ ] **Step 3: Implement `timeConstant.ts`**

```ts
// src/utils/timeConstant.ts
/** Reference frame the per-frame smoothing constants were tuned at (a 60 Hz display tick). */
export const REFERENCE_FRAME_MS = 1000 / 60;

/**
 * Convert an EMA alpha tuned per reference frame into the alpha for a step of `dtMs`,
 * so smoothing behaves the same whatever the frame rate: alpha = 1 − (1 − a)^(dt/ref).
 */
export function alphaForDt(alphaPerRef: number, dtMs: number, refMs: number = REFERENCE_FRAME_MS): number {
  if (alphaPerRef >= 1) return 1;
  if (alphaPerRef <= 0 || dtMs <= 0) return 0;
  return 1 - Math.pow(1 - alphaPerRef, dtMs / refMs);
}
```

- [ ] **Step 4: Implement `videoFrameLoop.ts`**

```ts
// src/tracking/videoFrameLoop.ts
/**
 * Run a callback once per NEW camera frame. Uses requestVideoFrameCallback where
 * available; otherwise a rAF loop that skips ticks whose video time hasn't advanced.
 * Detection must not re-read the same camera frame on every display refresh: that
 * made motion thresholds depend on the monitor's refresh rate.
 */
export interface VideoFrameSource {
  currentTime: number;
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export interface VideoFrameInfo {
  nowMs: number;
  dtMs: number;
}

const FIRST_DT_MS = 1000 / 30;
const MAX_DT_MS = 250;

export function startVideoFrameLoop(
  video: VideoFrameSource,
  onFrame: (info: VideoFrameInfo) => void,
  raf: (cb: FrameRequestCallback) => number = (cb) => requestAnimationFrame(cb),
  caf: (h: number) => void = (h) => cancelAnimationFrame(h),
): () => void {
  let last = -1;
  let stopped = false;
  const emit = (now: number) => {
    const dtMs = last < 0 ? FIRST_DT_MS : Math.min(MAX_DT_MS, Math.max(1, now - last));
    last = now;
    onFrame({ nowMs: now, dtMs });
  };

  if (typeof video.requestVideoFrameCallback === 'function') {
    let handle = 0;
    const tick = (now: number) => {
      if (stopped) return;
      emit(now);
      handle = video.requestVideoFrameCallback!(tick);
    };
    handle = video.requestVideoFrameCallback(tick);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback?.(handle);
    };
  }

  let lastMediaTime = Number.NaN;
  let handle = 0;
  const tick = (now: number) => {
    if (stopped) return;
    if (video.currentTime !== lastMediaTime) {
      lastMediaTime = video.currentTime;
      emit(now);
    }
    handle = raf(tick);
  };
  handle = raf(tick);
  return () => {
    stopped = true;
    caf(handle);
  };
}
```

- [ ] **Step 5: Make `BoardSequencerMode` dt-aware.** In `step`, add `import { alphaForDt } from '../utils/timeConstant';` and replace

```ts
          st.velocity = st.velocity + velocitySmoothing * (inst - st.velocity);
```

with

```ts
          st.velocity = st.velocity + alphaForDt(velocitySmoothing, dtMs) * (inst - st.velocity);
```

- [ ] **Step 6: `BoardReader` tidy-up.** In `src/tracking/BoardReader.ts`:
  1. Add `import { alphaForDt, REFERENCE_FRAME_MS } from '../utils/timeConstant';`.
  2. Add `buildCellLattice` and make `sampleRegion` accept it. The lattice layout is `[ux, uy, imgX, imgY]` per sample:

```ts
/** Precompute a cell's sample lattice (unit + rounded image coords), once per homography. */
export function buildCellLattice(h: Mat3, row: number, col: number, rows: number, cols: number, samplesPerAxis: number): Float64Array {
  const cellW = 1 / cols;
  const cellH = 1 / rows;
  const x0 = col * cellW + cellW * (1 - INSET) / 2;
  const y0 = row * cellH + cellH * (1 - INSET) / 2;
  const stepX = (cellW * INSET) / Math.max(samplesPerAxis - 1, 1);
  const stepY = (cellH * INSET) / Math.max(samplesPerAxis - 1, 1);
  const out = new Float64Array(samplesPerAxis * samplesPerAxis * 4);
  let k = 0;
  for (let iy = 0; iy < samplesPerAxis; iy++) {
    for (let ix = 0; ix < samplesPerAxis; ix++) {
      const ux = x0 + ix * stepX;
      const uy = y0 + iy * stepY;
      const img = applyHomography(h, { x: ux, y: uy });
      out[k++] = ux; out[k++] = uy; out[k++] = Math.round(img.x); out[k++] = Math.round(img.y);
    }
  }
  return out;
}
```

  3. Rewrite the sampling loop in `sampleRegion` to use the lattice. Add the optional parameter `lattice?: Float64Array` as the 9th argument and use `const lat = lattice ?? buildCellLattice(h, row, col, rows, cols, samplesPerAxis);`. Then:

```ts
  for (let k = 0; k < lat.length; k += 4) {
    const ux = lat[k];
    const uy = lat[k + 1];
    const { r, g, b } = sampler(lat[k + 2], lat[k + 3]);
    const hsv = rgbToHsv(r, g, b);
    total++;
    for (const m of colours) {
      if (m.test(hsv)) {
        counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
        sumX.set(m.id, (sumX.get(m.id) ?? 0) + ux);
        sumY.set(m.id, (sumY.get(m.id) ?? 0) + uy);
        break;
      }
    }
  }
```

     Delete the now-unused `cellW/cellH/x0/y0/stepX/stepY` locals from `sampleRegion`. The centroid/offset code still uses `rows`/`cols` for the cell centre.
  4. In `BoardReaderOptions` add `/** Milliseconds since the previous processed camera frame (smoothing is time-based). */ dtMs?: number;`.
  5. In the class add fields and methods:

```ts
  private lattices: Float64Array[] = [];
  private latticeKey = '';
  private last: { data: Uint8ClampedArray; width: number; height: number; downscale: number } | null = null;

  /** The downscaled, orientation-corrected RGBA frame read last (for other per-frame guards). */
  lastFrame(): { data: Uint8ClampedArray; width: number; height: number; downscale: number } | null {
    return this.last;
  }
```

  6. In `read`:
     - resize only on change: `if (this.canvas.width !== w) this.canvas.width = w; if (this.canvas.height !== h) this.canvas.height = h;`
     - after `getImageData`: `this.last = { data, width: w, height: h, downscale };`
     - build the lattice cache:

```ts
    const key = `${opts.homography.join(',')}|${opts.rows}|${opts.cols}|${samples}`;
    if (key !== this.latticeKey) {
      this.lattices = [];
      for (let row = 0; row < opts.rows; row++) {
        for (let col = 0; col < opts.cols; col++) {
          this.lattices.push(buildCellLattice(opts.homography, row, col, opts.rows, opts.cols, samples));
        }
      }
      this.latticeKey = key;
    }
    const alpha = alphaForDt(opts.smoothing ?? FRACTION_SMOOTHING, opts.dtMs ?? REFERENCE_FRAME_MS);
```

     - pass `this.lattices[row * opts.cols + col]` as the 9th `sampleRegion` argument
     - replace `opts.smoothing ?? FRACTION_SMOOTHING` in the `blendFractions` call with `alpha`
     - update the doc on `FRACTION_SMOOTHING` to say "per 60 Hz frame"

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run src/__tests__/timeConstant.test.ts src/__tests__/videoFrameLoop.test.ts src/__tests__/BoardSequencerMode.frameRate.test.ts src/__tests__/BoardReader.test.ts src/__tests__/BoardSequencerMode.test.ts && npm run lint`
Expected: PASS; lint clean.

- [ ] **Step 8: Commit**

```bash
git add src/utils/timeConstant.ts src/tracking/videoFrameLoop.ts src/tracking/BoardReader.ts src/tracking/BoardSequencerMode.ts src/__tests__/timeConstant.test.ts src/__tests__/videoFrameLoop.test.ts src/__tests__/BoardSequencerMode.frameRate.test.ts src/__tests__/BoardReader.test.ts
git commit -m "feat(board-sequencer): frame-rate independent smoothing, per-camera-frame loop helper, cached sample lattices

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 5: `useBoardRuntime` hook (camera, camera check, detection per camera frame, draw loop)

**Files:**
- Create: `src/ui/screens/boardSequencer/useBoardRuntime.ts`, `src/ui/screens/boardSequencer/homographyForCorners.ts`
- Modify: `src/ui/screens/BoardSequencerScreen.tsx`
- Test: `src/__tests__/homographyForCorners.test.ts`

**Interfaces:**
- Consumes:
  - `startVideoFrameLoop` (Task 4)
  - `stepBoardFrame`, `BoardFrameOutput` (Task 3)
  - `BoardReader` (with `dtMs`, Task 4)
  - `CameraManager`, `frameMeanSaturation`
- Produces:

```ts
export function homographyForCorners(corners: readonly Point[], videoW: number, videoH: number): Mat3;
export interface RuntimeFrame { readings: CellReading[]; frame: BoardFrameOutput }
export interface BoardRuntimeCallbacks {
  onCameraStarted(fellBack: boolean, trackInfo: CameraTrackInfo | null): void;
  onCameraError(message: string): void;
  onCameraCheck(saturation: number | null, trackInfo: CameraTrackInfo | null): void;
  onLoopSlotsCaptured(saved: (ActiveCell[] | null)[]): void;
  draw(frame: RuntimeFrame): void;
  onThrottledState(frame: RuntimeFrame): void;
}
export interface BoardRuntimeRefs {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraRef: MutableRefObject<CameraManager | null>;
  homographyRef: MutableRefObject<Mat3 | null>;
  modeRef: MutableRefObject<BoardSequencerMode | null>;
  engineRef: MutableRefObject<BoardSequencerEngine | null>;
  runningRef: MutableRefObject<boolean>;
  loopBankRef: MutableRefObject<LoopBankState>;
  activeCellsRef: MutableRefObject<ActiveCell[]>;
}
export function useBoardRuntime(opts: {
  cameraDeviceId: string; cameraRetry: number; calibrated: boolean;
  configRef: MutableRefObject<BoardSequencerStored>;
  callbacksRef: MutableRefObject<BoardRuntimeCallbacks>;
}): BoardRuntimeRefs;
```

- [ ] **Step 1: Write the failing test** for the pure homography helper. The hook itself has no harness; it is verified manually in Step 6.

```ts
// src/__tests__/homographyForCorners.test.ts
import { describe, it, expect } from 'vitest';
import { homographyForCorners } from '../ui/screens/boardSequencer/homographyForCorners';
import { applyHomography } from '../utils/homography';

describe('homographyForCorners', () => {
  it('maps the unit square onto normalised corners scaled to the video size', () => {
    const h = homographyForCorners([{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 }], 640, 480);
    const p = applyHomography(h, { x: 1, y: 1 });
    expect(p.x).toBeCloseTo(576, 6);
    expect(p.y).toBeCloseTo(384, 6);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/__tests__/homographyForCorners.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helper**

```ts
// src/ui/screens/boardSequencer/homographyForCorners.ts
import { computeHomography, UNIT_SQUARE, type Mat3, type Point } from '../../../utils/homography';

/** Unit-square → video pixels for normalised board corners (TL,TR,BR,BL = saved order). */
export function homographyForCorners(corners: readonly Point[], videoW: number, videoH: number): Mat3 {
  return computeHomography(UNIT_SQUARE, corners.map((c) => ({ x: c.x * videoW, y: c.y * videoH })));
}
```

- [ ] **Step 4: Implement the hook.** The logic moves out of the screen unchanged, except that detection is driven by camera frames.

```ts
// src/ui/screens/boardSequencer/useBoardRuntime.ts
/**
 * The Board Sequencer's runtime: camera lifecycle, 1 Hz camera check, detection once
 * per NEW camera frame (settle + loop bank + engine hand-off), and a rAF draw loop.
 * Views stay thin: they supply callbacks (via a ref, so effects never restart) and
 * read/drive the returned refs (start/stop still set engineRef/modeRef/runningRef).
 */
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { CameraManager, type CameraTrackInfo } from '../../../tracking/CameraManager';
import { BoardReader } from '../../../tracking/BoardReader';
import type { ActiveCell, BoardSequencerMode, CellReading } from '../../../tracking/BoardSequencerMode';
import { ColourRecognizer } from '../../../tracking/PieceRecognizer';
import { buildChannelMatchers, channelPriority, type ColourMatcher } from '../../../tracking/boardColours';
import { frameMeanSaturation } from '../../../tracking/cameraCheck';
import { startVideoFrameLoop } from '../../../tracking/videoFrameLoop';
import { stepBoardFrame, type BoardFrameOutput } from '../../../tracking/boardFrame';
import type { BoardSequencerEngine } from '../../../songs/BoardSequencerEngine';
import { emptyLoopBank, type LoopBankState } from '../../../songs/loopBank';
import type { Mat3 } from '../../../utils/homography';
import type { BoardSequencerStored } from '../../../profiles/BoardSequencerConfig';
import { homographyForCorners } from './homographyForCorners';

export interface RuntimeFrame {
  readings: CellReading[];
  frame: BoardFrameOutput;
}

export interface BoardRuntimeCallbacks {
  onCameraStarted(fellBack: boolean, trackInfo: CameraTrackInfo | null): void;
  onCameraError(message: string): void;
  onCameraCheck(saturation: number | null, trackInfo: CameraTrackInfo | null): void;
  onLoopSlotsCaptured(saved: (ActiveCell[] | null)[]): void;
  draw(frame: RuntimeFrame): void;
  onThrottledState(frame: RuntimeFrame): void;
}

export interface BoardRuntimeRefs {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraRef: MutableRefObject<CameraManager | null>;
  homographyRef: MutableRefObject<Mat3 | null>;
  modeRef: MutableRefObject<BoardSequencerMode | null>;
  engineRef: MutableRefObject<BoardSequencerEngine | null>;
  runningRef: MutableRefObject<boolean>;
  loopBankRef: MutableRefObject<LoopBankState>;
  activeCellsRef: MutableRefObject<ActiveCell[]>;
}

const CAMERA_CHECK_MS = 1000;
const STATE_THROTTLE_MS = 100;

export function useBoardRuntime(opts: {
  cameraDeviceId: string;
  cameraRetry: number;
  calibrated: boolean;
  configRef: MutableRefObject<BoardSequencerStored>;
  callbacksRef: MutableRefObject<BoardRuntimeCallbacks>;
}): BoardRuntimeRefs {
  const { cameraDeviceId, cameraRetry, calibrated, configRef, callbacksRef } = opts;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const readerRef = useRef<BoardReader | null>(null);
  const homographyRef = useRef<Mat3 | null>(null);
  const modeRef = useRef<BoardSequencerMode | null>(null);
  const engineRef = useRef<BoardSequencerEngine | null>(null);
  const runningRef = useRef(false);
  const loopBankRef = useRef<LoopBankState>(emptyLoopBank(0));
  const activeCellsRef = useRef<ActiveCell[]>([]);
  const latestFrameRef = useRef<RuntimeFrame | null>(null);

  // Camera lifecycle — (re)opens whenever the chosen camera changes or Try again is pressed.
  useEffect(() => {
    const cam = new CameraManager();
    cameraRef.current = cam;
    readerRef.current = new BoardReader();
    homographyRef.current = null;
    let cancelled = false;
    const video = videoRef.current;
    if (video) {
      cam.start(video, cameraDeviceId || undefined).then(({ fellBack }) => {
        if (!cancelled) callbacksRef.current.onCameraStarted(fellBack, cam.getTrackInfo());
      }).catch((err: unknown) => {
        if (!cancelled) callbacksRef.current.onCameraError(err instanceof Error ? err.message : 'Camera failed');
      });
    }
    return () => {
      cancelled = true;
      cam.stop();
    };
  }, [cameraDeviceId, cameraRetry, callbacksRef]);

  // Camera check: how colourful the frames the app READS are, plus live track settings.
  useEffect(() => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 48;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth <= 0) return;
      ctx.drawImage(video, 0, 0, cv.width, cv.height);
      const sat = frameMeanSaturation(ctx.getImageData(0, 0, cv.width, cv.height).data);
      callbacksRef.current.onCameraCheck(sat, cameraRef.current?.getTrackInfo() ?? null);
    }, CAMERA_CHECK_MS);
    return () => window.clearInterval(id);
  }, [callbacksRef]);

  // Detection once per camera frame + drawing on rAF, while calibrated.
  useEffect(() => {
    if (!calibrated) return;
    const video = videoRef.current;
    if (!video) return;
    let matchersFor: { channels: BoardSequencerStored['channels']; minFill: number } | null = null;
    let matchers: ColourMatcher[] = [];
    let recognizer = new ColourRecognizer(0.1, []);

    const stopFrames = startVideoFrameLoop(video, ({ nowMs, dtMs }) => {
      const reader = readerRef.current;
      const cfg = configRef.current;
      if (!reader || video.videoWidth <= 0) return;
      if (!homographyRef.current) {
        try {
          homographyRef.current = homographyForCorners(cfg.corners, video.videoWidth, video.videoHeight);
        } catch {
          return; // degenerate corners — wait for recalibration
        }
      }
      if (!matchersFor || matchersFor.channels !== cfg.channels || matchersFor.minFill !== cfg.minFilledFraction) {
        matchers = buildChannelMatchers(cfg.channels);
        recognizer = new ColourRecognizer(cfg.minFilledFraction, channelPriority(cfg.channels));
        matchersFor = { channels: cfg.channels, minFill: cfg.minFilledFraction };
      }
      const readings = reader.read(video, {
        homography: homographyRef.current, rows: cfg.rows, cols: cfg.cols, colours: matchers, recognizer,
        mirrorX: cfg.mirrorX, mirrorY: cfg.mirrorY, samplesPerAxis: cfg.samplesPerAxis, dtMs,
      });
      modeRef.current?.setVariation(cfg.variationEnabled, cfg.variationOffsetThreshold);
      engineRef.current?.setPingPong(cfg.pingPong);
      const running = runningRef.current && !!modeRef.current && !!engineRef.current;
      const modeResult = running && modeRef.current ? modeRef.current.step(readings, dtMs, nowMs) : null;
      const frame = stepBoardFrame({ readings, cfg, running, modeResult, loopBank: loopBankRef.current });
      const engine = engineRef.current;
      if (running && engine) {
        loopBankRef.current = frame.loopBank;
        if (frame.captured.length > 0) callbacksRef.current.onLoopSlotsCaptured(frame.loopBank.saved);
        engine.setActiveCells(frame.patternCells);
        engine.setActiveLoops(frame.activeLoops);
        activeCellsRef.current = frame.patternCells;
        if (frame.fireTick) engine.fireTick();
      }
      latestFrameRef.current = { readings, frame };
    });

    let raf = 0;
    let lastStateMs = 0;
    const draw = (now: number) => {
      const f = latestFrameRef.current;
      if (f) {
        callbacksRef.current.draw(f);
        if (now - lastStateMs > STATE_THROTTLE_MS) {
          lastStateMs = now;
          callbacksRef.current.onThrottledState(f);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      stopFrames();
      cancelAnimationFrame(raf);
    };
  }, [calibrated, cameraDeviceId, cameraRetry, configRef, callbacksRef]);

  return { videoRef, cameraRef, homographyRef, modeRef, engineRef, runningRef, loopBankRef, activeCellsRef };
}
```

`BoardReaderOptions` needs `samplesPerAxis` from config. Until Task 6 adds `cfg.samplesPerAxis`, use `samplesPerAxis: 5` here and change it in Task 6.

- [ ] **Step 5: Rewire the screen**

1. Delete these from `BoardSequencerScreen.tsx`:
   - the local refs `videoRef`, `cameraRef`, `readerRef`, `modeRef`, `engineRef`, `homographyRef`, `runningRef`, `activeCellsRef`, `loopBankRef`
   - the camera-lifecycle effect (`// Camera lifecycle`)
   - the camera-check effect
   - the whole rAF effect (`// Single rAF loop while calibrated`)
   - `buildHomography`
   - the `CAMERA_CHECK_MS` constant
2. Add near the other hooks (after `cameraRetry` is declared):

```tsx
  const callbacksRef = useRef<BoardRuntimeCallbacks>(null as unknown as BoardRuntimeCallbacks);
  const {
    videoRef, cameraRef, homographyRef, modeRef, engineRef, runningRef, loopBankRef, activeCellsRef,
  } = useBoardRuntime({ cameraDeviceId: config.cameraDeviceId, cameraRetry, calibrated, configRef, callbacksRef });
```

3. After `drawOverlay`, `persistLoopSlots` and `refreshCameras` are defined, assign the callbacks on every render. It is a plain assignment, not an effect:

```tsx
  callbacksRef.current = {
    onCameraStarted: (fellBack, trackInfo) => {
      setCamInfo(trackInfo);
      setError(null);
      fellBackRef.current = fellBack;
      if (fellBack) {
        const name = configRef.current.cameraLabel || 'the chosen camera';
        setCamNotice({
          kind: 'fallback',
          text: `Couldn't find "${name}", so the browser's default camera is being used. Connect it (or start its phone app), then press Try again.`,
        });
        setOpenSection((s) => ({ ...s, camera: true }));
      } else {
        setCamNotice((n) => (n?.kind === 'fallback' ? null : n));
      }
      void refreshCameras();
    },
    onCameraError: (message) => {
      setError(message);
      void refreshCameras();
    },
    onCameraCheck: (sat, trackInfo) => {
      setFeedSaturation(sat);
      setFeedColourless((prev) => nextColourlessState(prev, sat));
      setCamInfo(trackInfo);
    },
    onLoopSlotsCaptured: (saved) => persistLoopSlots(saved),
    draw: ({ frame }) => {
      const cfg = configRef.current;
      const engine = engineRef.current;
      const playing = runningRef.current && !!engine;
      const playCol = playing && engine ? engine.getPlayheadCol(cfg.cols) : 0;
      const isVarLap = playing && engine && cfg.numPages <= 1 ? engine.isVariationLap() : false;
      const pingDir = playing && engine && cfg.pingPong ? engine.getPlayheadDirection() : 0;
      const swatchById = new Map(cfg.channels.map((c) => [c.id, c.swatch]));
      drawOverlay(frame.occupied, frame.activeMap, cfg, playCol, swatchById, frame.conditional, isVarLap, pingDir, frame.bankSlots);
    },
    onThrottledState: ({ frame }) => {
      const cfg = configRef.current;
      const engine = engineRef.current;
      setActive(frame.patternCells);
      setPlayheadCol(runningRef.current && engine ? engine.getPlayheadCol(cfg.cols) : 0);
      if (cfg.numPages > 1 && engine) setPlayingPage(engine.getCurrentPage());
      setStats({ byColour: frame.byColour, settled: frame.activeMap.size });
    },
  };
```

4. In the camera-lifecycle move, also reset UI state at camera (re)start. Where the old effect called `setCamInfo(null); setError(null);`, add `useEffect(() => { setCamInfo(null); setError(null); }, [config.cameraDeviceId, cameraRetry]);` in the screen.
5. Replace every remaining `buildHomography(x, videoRef.current)` (in `handleCalibrated` and `start`) with `homographyForCorners(x, videoRef.current.videoWidth, videoRef.current.videoHeight)`, and drop `buildHomography` from dependency arrays.
6. Imports: add `useBoardRuntime`, `BoardRuntimeCallbacks` and `homographyForCorners`. Remove imports lint reports as unused (`BoardReader`, `ColourRecognizer`, `buildChannelMatchers`, `channelPriority`, `frameMeanSaturation`, `stepBoardFrame`, `computeHomography`, `UNIT_SQUARE`, `CameraManager` if only used for `listDevices`; keep `CameraManager` because `refreshCameras` uses `CameraManager.listDevices`).

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run test:run`
Expected: clean; all pass.
Manual (`npm run dev`, Board Sequencer with the USB webcam):
- the camera shows
- the camera check readout updates
- the grid overlay draws and tints detected counters
- Start: settled counters play, the tick fires, the playhead moves
- the loop bank still captures
- change camera → re-opens

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/boardSequencer/ src/ui/screens/BoardSequencerScreen.tsx src/__tests__/homographyForCorners.test.ts
git commit -m "refactor(board-sequencer): useBoardRuntime hook — detection per camera frame, draw on rAF

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 6: Grid-aware read settings, new config fields, 4 × 4 default, migration

**Files:**
- Create: `src/tracking/boardGrid.ts`
- Modify: `src/profiles/BoardSequencerConfig.ts`, `src/ui/screens/boardSequencer/useBoardRuntime.ts`, `src/ui/screens/BoardSequencerScreen.tsx`
- Test: `src/__tests__/boardGrid.test.ts`, `src/__tests__/BoardSequencerConfig.test.ts` (extend + update the rows expectation)

**Interfaces:**
- Produces:

```ts
export const ASSUMED_PIECE_AREA_SQUARES = 0.45;
export type BoardSquares = 8 | 10;
export interface ReadSettings { samplesPerAxis: number; minFilledFraction: number }
export function suggestReadSettings(boardSquares: number, rows: number, cols: number, pieceAreaSquares?: number): ReadSettings;
export interface GridSizeOptions { divisors: number[]; moreRows: number[]; moreCols: number[]; rowsIsMore: boolean; colsIsMore: boolean; nearest: { rows: number; cols: number } }
export function gridSizeOptions(boardSquares: number, current: { rows: number; cols: number }): GridSizeOptions;
export interface GridFields { rows: number; cols: number; boardSquares: BoardSquares; readSettingsCustom: boolean; minFilledFraction: number; samplesPerAxis: number }
export function applyGridChange<T extends GridFields>(cfg: T, patch: Partial<Pick<GridFields, 'rows' | 'cols' | 'boardSquares'>>): T;
```

- `BoardSequencerStored` gains `boardSquares: BoardSquares`, `themeMode: 'dark' | 'light'`, `samplesPerAxis: number`, `readSettingsCustom: boolean`, `boardNudgesEnabled: boolean`, `handedness: 'left' | 'right'` and `seatEdge: 'start' | 'end' | 'low' | 'high'`.
- Also exports `sanitizeBoardSequencerConfig(input: unknown): BoardSequencerStored | null` and `referencedChannelIds(cfg: Pick<BoardSequencerStored, 'pages' | 'loopSlots'>): Set<string>`.

- [ ] **Step 1: Write the failing grid tests**

```ts
// src/__tests__/boardGrid.test.ts
import { describe, it, expect } from 'vitest';
import { suggestReadSettings, gridSizeOptions, applyGridChange, type GridFields } from '../tracking/boardGrid';

describe('suggestReadSettings', () => {
  it.each([
    [8, 8, 8, 5, 0.10],
    [8, 4, 4, 9, 0.045],
    [8, 2, 2, 15, 0.04],
    [8, 4, 8, 9, 0.09],
    [8, 6, 8, 6, 0.10],
    [10, 10, 10, 5, 0.10],
    [10, 5, 5, 9, 0.045],
    [10, 2, 2, 15, 0.04],
  ])('board %i, %i rows × %i cols → %i samples, %f fill', (board, rows, cols, samples, fill) => {
    const s = suggestReadSettings(board, rows, cols);
    expect(s.samplesPerAxis).toBe(samples);
    expect(s.minFilledFraction).toBeCloseTo(fill, 6);
  });

  it('scales fill with a measured piece area', () => {
    expect(suggestReadSettings(8, 4, 4, 0.9).minFilledFraction).toBeCloseTo(0.09, 6);
  });
});

describe('gridSizeOptions', () => {
  it('offers divisors of the board and flags a non-divisor current value', () => {
    const o = gridSizeOptions(8, { rows: 6, cols: 8 });
    expect(o.divisors).toEqual([2, 4, 8]);
    expect(o.rowsIsMore).toBe(true);
    expect(o.colsIsMore).toBe(false);
    expect(o.nearest).toEqual({ rows: 4, cols: 8 });
    expect(o.moreRows).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(o.moreCols).toEqual([2, 3, 4, 5, 6, 7, 8, 10, 12, 16]);
  });

  it('10 × 10: divisors 2, 5, 10; a square grid stays square', () => {
    const o = gridSizeOptions(10, { rows: 4, cols: 4 });
    expect(o.divisors).toEqual([2, 5, 10]);
    expect(o.nearest).toEqual({ rows: 2, cols: 2 });
    expect(o.moreRows).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('applyGridChange', () => {
  const base: GridFields = { rows: 4, cols: 4, boardSquares: 8, readSettingsCustom: false, minFilledFraction: 0.045, samplesPerAxis: 9 };

  it('re-suggests read settings on a grid change', () => {
    const next = applyGridChange(base, { rows: 8, cols: 8 });
    expect(next).toMatchObject({ rows: 8, cols: 8, samplesPerAxis: 5 });
    expect(next.minFilledFraction).toBeCloseTo(0.1, 6);
  });

  it('keeps read settings the user tuned', () => {
    const next = applyGridChange({ ...base, readSettingsCustom: true, minFilledFraction: 0.2, samplesPerAxis: 7 }, { rows: 8 });
    expect(next).toMatchObject({ rows: 8, minFilledFraction: 0.2, samplesPerAxis: 7 });
  });

  it('a board size change never changes rows/cols', () => {
    const next = applyGridChange(base, { boardSquares: 10 });
    expect(next).toMatchObject({ rows: 4, cols: 4, boardSquares: 10 });
  });
});
```

- [ ] **Step 2: Extend and update the config tests.** In `src/__tests__/BoardSequencerConfig.test.ts`, change `expect(loaded?.rows).toBe(6);` to `expect(loaded?.rows).toBe(4);` and append:

```ts
describe('BoardSequencerConfig — redesign fields', () => {
  beforeEach(() => localStorage.clear());

  it('brand-new default grid is square 4 × 4 with suggested read settings', () => {
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG).toMatchObject({ rows: 4, cols: 4, boardSquares: 8, samplesPerAxis: 9, readSettingsCustom: false });
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG.minFilledFraction).toBeCloseTo(0.045, 6);
    expect(DEFAULT_BOARD_SEQUENCER_CONFIG).toMatchObject({ themeMode: 'dark', boardNudgesEnabled: true, handedness: 'right', seatEdge: 'low' });
  });

  it('keeps saved rows/cols (most recent grid) and clamps them', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 6, cols: 8 }));
    expect(loadBoardSequencerConfig()).toMatchObject({ rows: 6, cols: 8 });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 40, cols: 1 }));
    expect(loadBoardSequencerConfig()).toMatchObject({ rows: 10, cols: 2 });
  });

  it('migration: untuned legacy 4 × 4 gets suggested sampling and fill', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 4, cols: 4, minFilledFraction: 0.1 }));
    const c = loadBoardSequencerConfig()!;
    expect(c.readSettingsCustom).toBe(false);
    expect(c.samplesPerAxis).toBe(9);
    expect(c.minFilledFraction).toBeCloseTo(0.045, 6);
  });

  it('migration: a tuned legacy min fill is kept, sampling is still suggested', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ rows: 4, cols: 4, minFilledFraction: 0.2 }));
    const c = loadBoardSequencerConfig()!;
    expect(c.readSettingsCustom).toBe(true);
    expect(c.minFilledFraction).toBeCloseTo(0.2, 6);
    expect(c.samplesPerAxis).toBe(9);
  });

  it('once migrated, saved read settings are never re-suggested on load', () => {
    saveBoardSequencerConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, samplesPerAxis: 12, minFilledFraction: 0.07, readSettingsCustom: false });
    expect(loadBoardSequencerConfig()).toMatchObject({ samplesPerAxis: 12, minFilledFraction: 0.07 });
  });

  it('sanitises the new enum fields', () => {
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ boardSquares: 9, themeMode: 'pink', handedness: 'both', seatEdge: 'top', boardNudgesEnabled: 'yes' }));
    expect(loadBoardSequencerConfig()).toMatchObject({ boardSquares: 8, themeMode: 'dark', handedness: 'right', seatEdge: 'low', boardNudgesEnabled: true });
    localStorage.setItem('admi-board-sequencer', JSON.stringify({ boardSquares: 10, themeMode: 'light', handedness: 'left', seatEdge: 'start', boardNudgesEnabled: false }));
    expect(loadBoardSequencerConfig()).toMatchObject({ boardSquares: 10, themeMode: 'light', handedness: 'left', seatEdge: 'start', boardNudgesEnabled: false });
  });

  it('referencedChannelIds collects ids used by pages and loop slots', () => {
    const ids = referencedChannelIds({ pages: [[{ row: 0, col: 0, colour: 'c3' }]], loopSlots: [null, [{ row: 1, col: 1, colour: 'c5' }]] });
    expect([...ids].sort()).toEqual(['c3', 'c5']);
  });
});
```

and add `referencedChannelIds` to the import list at the top of the file.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/__tests__/boardGrid.test.ts src/__tests__/BoardSequencerConfig.test.ts`
Expected: FAIL (missing module and fields).

- [ ] **Step 4: Implement `boardGrid.ts`**

```ts
// src/tracking/boardGrid.ts
/**
 * Grid ↔ physical board rules. The app grid (rows × cols) is stretched over the whole
 * board; sizes that divide the square count keep each cell on whole squares, and the
 * detection read settings are suggested from how much of a cell a counter covers.
 */
export const ASSUMED_PIECE_AREA_SQUARES = 0.45;
export type BoardSquares = 8 | 10;

export interface ReadSettings {
  samplesPerAxis: number;
  minFilledFraction: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function suggestReadSettings(
  boardSquares: number, rows: number, cols: number, pieceAreaSquares: number = ASSUMED_PIECE_AREA_SQUARES,
): ReadSettings {
  const sqX = boardSquares / Math.max(1, cols);
  const sqY = boardSquares / Math.max(1, rows);
  return {
    samplesPerAxis: clamp(Math.round(4.5 * Math.max(sqX, sqY)), 3, 15),
    minFilledFraction: clamp((0.4 * pieceAreaSquares) / (sqX * sqY), 0.04, 0.1),
  };
}

export interface GridSizeOptions {
  divisors: number[];
  moreRows: number[];
  moreCols: number[];
  rowsIsMore: boolean;
  colsIsMore: boolean;
  nearest: { rows: number; cols: number };
}

const MORE_COLS = [2, 3, 4, 5, 6, 7, 8, 10, 12, 16];

export function gridSizeOptions(boardSquares: number, current: { rows: number; cols: number }): GridSizeOptions {
  const divisors: number[] = [];
  for (let d = 2; d <= boardSquares; d++) if (boardSquares % d === 0) divisors.push(d);
  const moreRows: number[] = [];
  for (let r = 2; r <= Math.max(8, boardSquares); r++) moreRows.push(r);
  const nearestDivisor = (v: number): number => {
    let best = divisors[0];
    for (const d of divisors) if (d <= v) best = d;
    return best;
  };
  return {
    divisors,
    moreRows,
    moreCols: MORE_COLS,
    rowsIsMore: !divisors.includes(current.rows),
    colsIsMore: !divisors.includes(current.cols),
    nearest: { rows: nearestDivisor(current.rows), cols: nearestDivisor(current.cols) },
  };
}

export interface GridFields {
  rows: number;
  cols: number;
  boardSquares: BoardSquares;
  readSettingsCustom: boolean;
  minFilledFraction: number;
  samplesPerAxis: number;
}

/** Apply a rows/cols/board-size change, re-suggesting read settings unless the user tuned them. */
export function applyGridChange<T extends GridFields>(
  cfg: T, patch: Partial<Pick<GridFields, 'rows' | 'cols' | 'boardSquares'>>,
): T {
  const next = { ...cfg, ...patch };
  if (next.readSettingsCustom) return next;
  return { ...next, ...suggestReadSettings(next.boardSquares, next.rows, next.cols) };
}
```

- [ ] **Step 5: Extend `BoardSequencerConfig.ts`**
  1. `import { suggestReadSettings, type BoardSquares } from '../tracking/boardGrid';`.
  2. Add to `BoardSequencerStored`:

```ts
  /** Physical squares per side of the board (8 × 8 chess/draughts, 10 × 10 draughts). */
  boardSquares: BoardSquares;
  /** Calm theme mode for the redesigned screens. */
  themeMode: 'dark' | 'light';
  /** Samples per axis per cell (suggested from the grid; passed to BoardReader). */
  samplesPerAxis: number;
  /** True once the user tuned Piece coverage — freezes suggested read settings. */
  readSettingsCustom: boolean;
  /** Show the "Board moved?" / colour-matches-board hints while playing. */
  boardNudgesEnabled: boolean;
  /** The player's handedness (per player; mirrors the screen layout). */
  handedness: 'left' | 'right';
  /** Which board edge the player sits at (per player; defines "their left"). */
  seatEdge: 'start' | 'end' | 'low' | 'high';
```

  3. In `DEFAULT_BOARD_SEQUENCER_CONFIG`:
     - replace `rows: 6, cols: 8,` with `rows: 4, cols: 4,`
     - replace `minFilledFraction: 0.1,` with `minFilledFraction: suggestReadSettings(8, 4, 4).minFilledFraction,`
     - add:

```ts
  boardSquares: 8,
  themeMode: 'dark',
  samplesPerAxis: suggestReadSettings(8, 4, 4).samplesPerAxis,
  readSettingsCustom: false,
  boardNudgesEnabled: true,
  handedness: 'right',
  seatEdge: 'low',
```

  4. In `sanitize`, compute before the `return`:

```ts
  const rows = Math.round(Math.min(10, Math.max(2, num(o.rows, d.rows))));
  const cols = Math.round(Math.min(16, Math.max(2, num(o.cols, d.cols))));
  const boardSquares: BoardSquares = o.boardSquares === 10 ? 10 : 8;
  const storedFill = isNum(o.minFilledFraction) ? o.minFilledFraction : null;
  const readSettingsCustom = typeof o.readSettingsCustom === 'boolean'
    ? o.readSettingsCustom
    : storedFill !== null && Math.abs(storedFill - 0.1) > 1e-9;
  let samplesPerAxis = isNum(o.samplesPerAxis) ? Math.round(Math.min(15, Math.max(3, o.samplesPerAxis))) : NaN;
  let minFilledFraction = storedFill ?? d.minFilledFraction;
  if (!Number.isFinite(samplesPerAxis)) {
    // Pre-redesign config: one-time suggestion (existing 4 × 4 boards get the coverage fix).
    const s = suggestReadSettings(boardSquares, rows, cols);
    samplesPerAxis = s.samplesPerAxis;
    if (!readSettingsCustom) minFilledFraction = s.minFilledFraction;
  }
```

     and in the returned object use `rows`, `cols` and `minFilledFraction` from these locals, and add:

```ts
    boardSquares,
    themeMode: o.themeMode === 'light' ? 'light' : 'dark',
    samplesPerAxis,
    readSettingsCustom,
    boardNudgesEnabled: o.boardNudgesEnabled !== false,
    handedness: o.handedness === 'left' ? 'left' : 'right',
    seatEdge: o.seatEdge === 'start' || o.seatEdge === 'end' || o.seatEdge === 'high' ? o.seatEdge : 'low',
```

  5. Export the sanitiser and the id collector:

```ts
/** Sanitise any stored/merged object into a valid config (null if not an object). */
export function sanitizeBoardSequencerConfig(input: unknown): BoardSequencerStored | null {
  return sanitize(input);
}

/** Channel ids referenced by saved pages and loop slots (never reuse these for new colours). */
export function referencedChannelIds(cfg: Pick<BoardSequencerStored, 'pages' | 'loopSlots'>): Set<string> {
  const ids = new Set<string>();
  for (const page of cfg.pages) for (const c of page) ids.add(c.colour);
  for (const slot of cfg.loopSlots) if (slot) for (const c of slot) ids.add(c.colour);
  return ids;
}
```

- [ ] **Step 6: Wire it in**
  - In `useBoardRuntime.ts` pass `samplesPerAxis: cfg.samplesPerAxis`.
  - In the screen:
    - Rows select `onChange` → `setConfig((prev) => { const next = applyGridChange(prev, { rows: Number(e.target.value) }); saveBoardSequencerConfig(next); return next; })`
    - Steps select → the same with `{ cols: … }`
    - Min fill slider `onChange` → `update({ minFilledFraction: Number(e.target.value) / 100, readSettingsCustom: true })`
    - Add `import { applyGridChange } from '../../tracking/boardGrid';`

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx vitest run src/__tests__/boardGrid.test.ts src/__tests__/BoardSequencerConfig.test.ts && npm run lint && npm run test:run`
Expected: PASS; lint clean.

- [ ] **Step 8: Commit**

```bash
git add src/tracking/boardGrid.ts src/profiles/BoardSequencerConfig.ts src/ui/screens/boardSequencer/useBoardRuntime.ts src/ui/screens/BoardSequencerScreen.tsx src/__tests__/boardGrid.test.ts src/__tests__/BoardSequencerConfig.test.ts
git commit -m "feat(board-sequencer): grid-aware read settings, 4x4 default, redesign config fields + migration

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 7: Player profiles — rig/player storage split with migration

**Files:**
- Create: `src/profiles/BoardProfiles.ts`
- Modify: `src/ui/screens/BoardSequencerScreen.tsx`, `src/profiles/InputProfileManager.ts`
- Test: `src/__tests__/BoardProfiles.test.ts`

**Interfaces:**
- Consumes: `sanitizeBoardSequencerConfig`, `referencedChannelIds`, `DEFAULT_BOARD_SEQUENCER_CONFIG`, `BoardSequencerStored` (Task 6).
- Produces:

```ts
export const RIG_KEY = 'admi-board-rig';
export const PLAYERS_KEY = 'admi-board-players';
export const ACTIVE_PLAYER_KEY = 'admi-board-active-player';
export const LEGACY_KEY = 'admi-board-sequencer';
export type RigChannel = Pick<ColourChannel, 'id' | 'kind' | 'swatch' | 'band' | 'blackBand' | 'whiteBand'>;
export type ChannelPlayerSettings = Pick<ColourChannel, 'role' | 'instrument' | 'drum' | 'volume' | 'tone' | 'reverbSend' | 'delaySend'>;
export interface BoardRigConfig { fields: Pick<BoardSequencerStored, RigField>; channels: RigChannel[] }
export interface BoardPlayerProfile { id: string; name: string; settings: Partial<BoardSequencerStored>; channelSettings: Record<string, ChannelPlayerSettings> }
export function splitBoardConfig(cfg: BoardSequencerStored): { rig: BoardRigConfig; settings: Partial<BoardSequencerStored>; channelSettings: Record<string, ChannelPlayerSettings> };
export function resolveBoardConfig(rig: BoardRigConfig, player: BoardPlayerProfile): BoardSequencerStored;
export function loadActiveBoardConfig(): BoardSequencerStored | null;
export function saveActiveBoardConfig(cfg: BoardSequencerStored): void;
export function listBoardPlayers(): BoardPlayerProfile[];
export function getActiveBoardPlayer(): BoardPlayerProfile | null;
export function createBoardPlayer(name: string, handedness: 'left' | 'right'): BoardPlayerProfile;
export function setActiveBoardPlayer(id: string): void;
export function allReferencedChannelIds(): Set<string>;
```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/BoardProfiles.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RIG_KEY, PLAYERS_KEY, ACTIVE_PLAYER_KEY, LEGACY_KEY,
  loadActiveBoardConfig, saveActiveBoardConfig, listBoardPlayers, getActiveBoardPlayer,
  createBoardPlayer, setActiveBoardPlayer, splitBoardConfig, resolveBoardConfig, allReferencedChannelIds,
} from '../profiles/BoardProfiles';
import { DEFAULT_BOARD_SEQUENCER_CONFIG, type BoardSequencerStored } from '../profiles/BoardSequencerConfig';

const withColours = (): BoardSequencerStored => ({
  ...DEFAULT_BOARD_SEQUENCER_CONFIG,
  enabled: true,
  corners: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }],
  cameraDeviceId: 'usb-1', mirrorX: false, bpm: 120, rows: 8, cols: 8,
  channels: [
    { id: 'c1', kind: 'hue', role: 'melody', swatch: '#e00', instrument: 'harp', volume: 0.5, band: { id: 'c1', hue: 0, hueTolerance: 20, minSaturation: 40, minValue: 30, minArea: 0 } },
    { id: 'c2', kind: 'black', role: 'drums', swatch: '#111', blackBand: { maxValue: 30, maxSaturation: 40 } },
  ],
  loopSlots: [[{ row: 0, col: 0, colour: 'c7' }]],
});

describe('BoardProfiles', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is stored at all', () => {
    expect(loadActiveBoardConfig()).toBeNull();
  });

  it('split + resolve round-trips a config', () => {
    const cfg = withColours();
    const { rig, settings, channelSettings } = splitBoardConfig(cfg);
    expect(rig.fields).toMatchObject({ enabled: true, cameraDeviceId: 'usb-1', mirrorX: false, boardSquares: 8 });
    expect(rig.channels[0]).not.toHaveProperty('role');
    expect(settings).toMatchObject({ bpm: 120, rows: 8 });
    expect(settings).not.toHaveProperty('corners');
    expect(channelSettings.c1).toMatchObject({ role: 'melody', instrument: 'harp', volume: 0.5 });
    const back = resolveBoardConfig(rig, { id: 'p', name: 'P', settings, channelSettings });
    expect(back).toEqual(cfg);
  });

  it('migrates the legacy single config into a rig + "Player 1", leaving the old key', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(withColours()));
    const cfg = loadActiveBoardConfig();
    expect(cfg).toMatchObject({ bpm: 120, rows: 8, cameraDeviceId: 'usb-1' });
    expect(cfg?.channels.map((c) => c.role)).toEqual(['melody', 'drums']);
    expect(listBoardPlayers()).toHaveLength(1);
    expect(getActiveBoardPlayer()).toMatchObject({ name: 'Player 1', settings: { handedness: 'right', seatEdge: 'low' } });
    expect(localStorage.getItem(RIG_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('saves rig fields for everyone and player fields only for the active player', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(withColours()));
    const tim = createBoardPlayer('Tim', 'left');
    expect(getActiveBoardPlayer()?.id).toBe(tim.id);
    const timCfg = loadActiveBoardConfig()!;
    // New player on the same rig: same board + colours, all jobs Off, default grid.
    expect(timCfg).toMatchObject({ enabled: true, cameraDeviceId: 'usb-1', rows: 4, cols: 4, handedness: 'left' });
    expect(timCfg.channels.map((c) => c.role)).toEqual(['off', 'off']);
    saveActiveBoardConfig({ ...timCfg, bpm: 70, mirrorX: true, channels: timCfg.channels.map((c) => ({ ...c, role: 'bass' })) });
    const first = listBoardPlayers().find((p) => p.name === 'Player 1')!;
    setActiveBoardPlayer(first.id);
    const p1 = loadActiveBoardConfig()!;
    expect(p1.bpm).toBe(120);                  // player field untouched
    expect(p1.mirrorX).toBe(true);             // rig field shared
    expect(p1.channels.map((c) => c.role)).toEqual(['melody', 'drums']);
  });

  it('a removed colour disappears for every player', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(withColours()));
    const cfg = loadActiveBoardConfig()!;
    createBoardPlayer('Tim', 'left');
    const tim = loadActiveBoardConfig()!;
    saveActiveBoardConfig({ ...tim, channels: tim.channels.filter((c) => c.id !== 'c2') });
    setActiveBoardPlayer(listBoardPlayers()[0].id);
    expect(loadActiveBoardConfig()!.channels.map((c) => c.id)).toEqual(['c1']);
    expect(cfg.channels).toHaveLength(2);
  });

  it('collects referenced channel ids across every player', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(withColours()));
    loadActiveBoardConfig();
    createBoardPlayer('Tim', 'left');
    const tim = loadActiveBoardConfig()!;
    saveActiveBoardConfig({ ...tim, pages: [[{ row: 1, col: 1, colour: 'c9' }]] });
    expect([...allReferencedChannelIds()].sort()).toEqual(['c7', 'c9']);
  });

  it('first run with nothing stored: saving creates the rig and Player 1', () => {
    saveActiveBoardConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, bpm: 100 });
    expect(localStorage.getItem(PLAYERS_KEY)).not.toBeNull();
    expect(localStorage.getItem(ACTIVE_PLAYER_KEY)).not.toBeNull();
    expect(loadActiveBoardConfig()?.bpm).toBe(100);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/__tests__/BoardProfiles.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `BoardProfiles.ts`**

```ts
// src/profiles/BoardProfiles.ts
/**
 * Board Sequencer player profiles. Storage is split in two:
 *  - the RIG (this device's board + camera + counter colours), shared by every player;
 *  - PLAYERS, each with their own grid, jobs/instruments/mix, sound, loops and settings.
 * The runtime still works with one merged BoardSequencerStored (resolveBoardConfig).
 */
import type { ColourChannel } from '../tracking/boardColours';
import {
  DEFAULT_BOARD_SEQUENCER_CONFIG, sanitizeBoardSequencerConfig, referencedChannelIds,
  type BoardSequencerStored,
} from './BoardSequencerConfig';

export const RIG_KEY = 'admi-board-rig';
export const PLAYERS_KEY = 'admi-board-players';
export const ACTIVE_PLAYER_KEY = 'admi-board-active-player';
export const LEGACY_KEY = 'admi-board-sequencer';

const RIG_FIELDS = ['version', 'enabled', 'corners', 'boardSquares', 'cameraDeviceId', 'cameraLabel', 'mirrorX', 'mirrorY'] as const;
export type RigField = (typeof RIG_FIELDS)[number];

export type RigChannel = Pick<ColourChannel, 'id' | 'kind' | 'swatch' | 'band' | 'blackBand' | 'whiteBand'>;
export type ChannelPlayerSettings = Pick<ColourChannel, 'role' | 'instrument' | 'drum' | 'volume' | 'tone' | 'reverbSend' | 'delaySend'>;

export interface BoardRigConfig {
  fields: Pick<BoardSequencerStored, RigField>;
  channels: RigChannel[];
}

export interface BoardPlayerProfile {
  id: string;
  name: string;
  settings: Partial<BoardSequencerStored>;
  channelSettings: Record<string, ChannelPlayerSettings>;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[BoardProfiles] Failed to save ${key}:`, error);
  }
}

export function splitBoardConfig(cfg: BoardSequencerStored): {
  rig: BoardRigConfig; settings: Partial<BoardSequencerStored>; channelSettings: Record<string, ChannelPlayerSettings>;
} {
  const fields = {} as Record<RigField, unknown>;
  for (const k of RIG_FIELDS) fields[k] = cfg[k];
  const settings: Partial<BoardSequencerStored> = { ...cfg };
  for (const k of RIG_FIELDS) delete settings[k];
  delete settings.channels;
  const channels: RigChannel[] = [];
  const channelSettings: Record<string, ChannelPlayerSettings> = {};
  for (const c of cfg.channels) {
    const { role, instrument, drum, volume, tone, reverbSend, delaySend, ...rigPart } = c;
    channels.push(rigPart);
    const ps: ChannelPlayerSettings = { role };
    if (instrument !== undefined) ps.instrument = instrument;
    if (drum !== undefined) ps.drum = drum;
    if (volume !== undefined) ps.volume = volume;
    if (tone !== undefined) ps.tone = tone;
    if (reverbSend !== undefined) ps.reverbSend = reverbSend;
    if (delaySend !== undefined) ps.delaySend = delaySend;
    channelSettings[c.id] = ps;
  }
  return { rig: { fields: fields as Pick<BoardSequencerStored, RigField>, channels }, settings, channelSettings };
}

export function resolveBoardConfig(rig: BoardRigConfig, player: BoardPlayerProfile): BoardSequencerStored {
  const merged = {
    ...player.settings,
    ...rig.fields,
    channels: rig.channels.map((c) => ({ ...c, ...(player.channelSettings[c.id] ?? { role: 'off' }) })),
  };
  return sanitizeBoardSequencerConfig(merged) ?? DEFAULT_BOARD_SEQUENCER_CONFIG;
}

function loadRig(): BoardRigConfig | null {
  const raw = readJson(RIG_KEY);
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as { fields?: unknown; channels?: unknown };
  const fields = typeof o.fields === 'object' && o.fields !== null ? o.fields : {};
  const channels = Array.isArray(o.channels) ? o.channels : [];
  // Re-sanitise through a full merge so a corrupt rig yields safe defaults.
  const clean = sanitizeBoardSequencerConfig({ ...fields, channels: channels.map((c: object) => ({ role: 'off', ...c })) });
  return clean ? splitBoardConfig(clean).rig : null;
}

function sanitizePlayer(v: unknown): BoardPlayerProfile | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  return {
    id: o.id,
    name: typeof o.name === 'string' && o.name ? o.name : 'Player',
    settings: typeof o.settings === 'object' && o.settings !== null ? (o.settings as Partial<BoardSequencerStored>) : {},
    channelSettings: typeof o.channelSettings === 'object' && o.channelSettings !== null
      ? (o.channelSettings as Record<string, ChannelPlayerSettings>)
      : {},
  };
}

export function listBoardPlayers(): BoardPlayerProfile[] {
  const raw = readJson(PLAYERS_KEY);
  return Array.isArray(raw) ? raw.map(sanitizePlayer).filter((p): p is BoardPlayerProfile => p !== null) : [];
}

function savePlayers(players: BoardPlayerProfile[]): void {
  writeJson(PLAYERS_KEY, players);
}

function freshPlayerId(players: BoardPlayerProfile[]): string {
  const used = new Set(players.map((p) => p.id));
  for (let i = 1; ; i++) if (!used.has(`p${i}`)) return `p${i}`;
}

/** One-time: split the legacy single config into rig + "Player 1". Old key is left in place. */
function migrateLegacy(): void {
  if (localStorage.getItem(RIG_KEY) !== null) return;
  const legacy = sanitizeBoardSequencerConfig(readJson(LEGACY_KEY));
  if (!legacy) return;
  const { rig, settings, channelSettings } = splitBoardConfig(legacy);
  writeJson(RIG_KEY, rig);
  const p1: BoardPlayerProfile = { id: 'p1', name: 'Player 1', settings, channelSettings };
  savePlayers([p1]);
  localStorage.setItem(ACTIVE_PLAYER_KEY, p1.id);
}

export function getActiveBoardPlayer(): BoardPlayerProfile | null {
  migrateLegacy();
  const players = listBoardPlayers();
  if (players.length === 0) return null;
  const id = localStorage.getItem(ACTIVE_PLAYER_KEY);
  return players.find((p) => p.id === id) ?? players[0];
}

export function loadActiveBoardConfig(): BoardSequencerStored | null {
  try {
    migrateLegacy();
    const rig = loadRig();
    if (!rig) return null;
    const player = getActiveBoardPlayer() ?? { id: 'p1', name: 'Player 1', settings: {}, channelSettings: {} };
    return resolveBoardConfig(rig, player);
  } catch (error) {
    console.warn('[BoardProfiles] Failed to load:', error);
    return null;
  }
}

export function saveActiveBoardConfig(cfg: BoardSequencerStored): void {
  try {
    migrateLegacy();
    const clean = sanitizeBoardSequencerConfig(cfg);
    if (!clean) return;
    const { rig, settings, channelSettings } = splitBoardConfig(clean);
    writeJson(RIG_KEY, rig);
    const players = listBoardPlayers();
    const active = getActiveBoardPlayer();
    if (!active) {
      const p1: BoardPlayerProfile = { id: 'p1', name: 'Player 1', settings, channelSettings };
      savePlayers([p1]);
      localStorage.setItem(ACTIVE_PLAYER_KEY, p1.id);
      return;
    }
    savePlayers(players.map((p) => (p.id === active.id ? { ...p, settings, channelSettings } : p)));
    localStorage.setItem(ACTIVE_PLAYER_KEY, active.id);
  } catch (error) {
    console.warn('[BoardProfiles] Failed to save:', error);
  }
}

export function createBoardPlayer(name: string, handedness: 'left' | 'right'): BoardPlayerProfile {
  migrateLegacy();
  const players = listBoardPlayers();
  const { settings } = splitBoardConfig({ ...DEFAULT_BOARD_SEQUENCER_CONFIG, handedness });
  const player: BoardPlayerProfile = { id: freshPlayerId(players), name: name.trim() || 'Player', settings, channelSettings: {} };
  savePlayers([...players, player]);
  localStorage.setItem(ACTIVE_PLAYER_KEY, player.id);
  return player;
}

export function setActiveBoardPlayer(id: string): void {
  if (listBoardPlayers().some((p) => p.id === id)) localStorage.setItem(ACTIVE_PLAYER_KEY, id);
}

/** Channel ids referenced by any player's saved pages or loop slots. */
export function allReferencedChannelIds(): Set<string> {
  const ids = new Set<string>();
  for (const p of listBoardPlayers()) {
    const cfg = sanitizeBoardSequencerConfig({ ...p.settings });
    if (!cfg) continue;
    for (const id of referencedChannelIds(cfg)) ids.add(id);
  }
  return ids;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/__tests__/BoardProfiles.test.ts`
Expected: PASS (7 tests). If `back` in the round-trip test differs only in optional-undefined keys, fix `splitBoardConfig` rather than loosening the test.

- [ ] **Step 5: Route the screen and `InputProfileManager` through profiles**
  - In `BoardSequencerScreen.tsx` change the import to:

```tsx
import {
  DEFAULT_BOARD_SEQUENCER_CONFIG, type BoardSequencerStored, type BoardPoint,
} from '../../profiles/BoardSequencerConfig';
import {
  loadActiveBoardConfig as loadBoardSequencerConfig, saveActiveBoardConfig as saveBoardSequencerConfig,
} from '../../profiles/BoardProfiles';
```

  - In `InputProfileManager.ts`, import `loadActiveBoardConfig` and `saveActiveBoardConfig` from `./BoardProfiles` and use them in `getBoardSequencerConfig` and `saveBoardSequencerConfig`. In `clearBoardSequencerConfig`, also remove `admi-board-rig`, `admi-board-players` and `admi-board-active-player`.

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run test:run`
Expected: clean; all pass.
Manual: with an existing saved board, reload the Board Sequencer. Corners, colours, jobs and grid are all kept. In DevTools → Application → Local Storage you see `admi-board-rig`, `admi-board-players` and `admi-board-active-player`, and the old `admi-board-sequencer` is still there.

- [ ] **Step 7: Commit**

```bash
git add src/profiles/BoardProfiles.ts src/profiles/InputProfileManager.ts src/ui/screens/BoardSequencerScreen.tsx src/__tests__/BoardProfiles.test.ts
git commit -m "feat(board-sequencer): player profiles — rig vs player storage split with legacy migration

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 8: Bug fixes — one kind classifier, dark seeding, recalibrate keeps fields, no id reuse

**Files:**
- Modify: `src/tracking/boardColours.ts`, `src/tracking/ColorTracker.ts`, `src/ui/screens/BoardSequencerScreen.tsx`
- Test: `src/__tests__/boardColours.test.ts`, `src/__tests__/counterColour.test.ts` (extend)

**Interfaces:**
- Produces:
  - `classifyCounterKind(hsv: { h: number; s: number; v: number }): ColourKind`
  - `recalibratedChannel(c: ColourChannel, cal: ReturnType<typeof calibrationFromHsv>, swatch: string): ColourChannel`
  - `freshChannelId(existing: ColourId[], referenced?: Iterable<ColourId>): ColourId`

- [ ] **Step 1: Write the failing tests.** Append to `src/__tests__/boardColours.test.ts`, adding `classifyCounterKind` and `recalibratedChannel` to its import:

```ts
describe('classifyCounterKind', () => {
  it.each([
    [{ h: 0, s: 12, v: 90 }, 'white'], [{ h: 0, s: 13, v: 90 }, 'hue'],
    [{ h: 0, s: 10, v: 38 }, 'black'], [{ h: 0, s: 10, v: 39 }, 'hue'],
    [{ h: 0, s: 45, v: 32 }, 'black'], [{ h: 0, s: 45, v: 33 }, 'hue'],
    [{ h: 0, s: 45, v: 30 }, 'black'], [{ h: 0, s: 46, v: 30 }, 'hue'],
  ])('%o → %s', (hsv, kind) => {
    expect(classifyCounterKind(hsv)).toBe(kind);
  });

  it('calibrationFromHsv agrees with it', () => {
    expect(calibrationFromHsv({ h: 200, s: 40, v: 25 }).kind).toBe('black');
  });
});

describe('recalibratedChannel', () => {
  it('replaces only kind/swatch/bands and keeps id, job, instrument and mix', () => {
    const c: ColourChannel = {
      id: 'c1', kind: 'hue', role: 'bass', swatch: '#00f', instrument: 'cello', drum: '', volume: 0.4, tone: 0.3, reverbSend: 0.2, delaySend: 0.1,
      band: { id: 'c1', hue: 220, hueTolerance: 20, minSaturation: 40, minValue: 30, minArea: 0 },
    };
    const next = recalibratedChannel(c, calibrationFromHsv({ h: 0, s: 5, v: 10 }), '#111');
    expect(next).toMatchObject({ id: 'c1', role: 'bass', instrument: 'cello', volume: 0.4, tone: 0.3, reverbSend: 0.2, delaySend: 0.1, kind: 'black', swatch: '#111' });
    expect(next.band).toBeUndefined();
    expect(next.blackBand).toBeDefined();
  });
});

describe('freshChannelId with referenced ids', () => {
  it('never reuses an id still referenced by saved pages or loops', () => {
    expect(freshChannelId([], ['c1', 'c2'])).toBe('c3');
    expect(freshChannelId(['c1'], ['c2'])).toBe('c3');
  });
});
```

Append to `src/__tests__/counterColour.test.ts`, adding `import { calibrationFromHsv } from '../tracking/boardColours';`:

```ts
describe('counterColourFromRegion on dark counters', () => {
  it('a noisy near-black counter is classified black, not a random hue', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (const base of [8, 16, 24]) {
      const sw = 20; const sh = 20;
      const data = new Uint8ClampedArray(sw * sh * 4);
      for (let i = 0; i < sw * sh; i++) {
        for (let ch = 0; ch < 3; ch++) data[i * 4 + ch] = Math.max(0, Math.round(base + (rand() - 0.5) * 12));
        data[i * 4 + 3] = 255;
      }
      const c = counterColourFromRegion(data, sw, sh)!;
      expect(calibrationFromHsv({ h: c.h, s: c.s, v: c.v }).kind).toBe('black');
    }
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/__tests__/boardColours.test.ts src/__tests__/counterColour.test.ts`
Expected: FAIL (missing exports; the dark counter classified as hue).

- [ ] **Step 3: Implement in `boardColours.ts`**

```ts
/** The one black/white/hue decision (s, v on 0..100), shared by tap and auto calibration. */
export function classifyCounterKind(hsv: { h: number; s: number; v: number }): ColourKind {
  if ((hsv.s <= 12 && hsv.v <= 38) || (hsv.v <= 32 && hsv.s <= 45)) return 'black';
  if (hsv.s <= 12 && hsv.v >= 72) return 'white';
  return 'hue';
}
```

In `calibrationFromHsv`, replace the two `if (hsv.s <= 12 && …)` guards with `const kind = classifyCounterKind(hsv);`, then use `if (kind === 'black') { …existing black return… }` and `if (kind === 'white') { …existing white return… }`, keeping the band maths.

```ts
/** Recalibrate: new detection band + swatch; keep identity, job, instrument and mix. */
export function recalibratedChannel(
  c: ColourChannel, cal: ReturnType<typeof calibrationFromHsv>, swatch: string,
): ColourChannel {
  return { ...c, kind: cal.kind, swatch, band: cal.band, blackBand: cal.blackBand, whiteBand: cal.whiteBand };
}
```

Replace `freshChannelId` with:

```ts
/** Pick a fresh id ('c1', 'c2', …) not in `existing` and not still referenced by saved loops/pages. */
export function freshChannelId(existing: ColourId[], referenced: Iterable<ColourId> = []): ColourId {
  const used = new Set<ColourId>([...existing, ...referenced]);
  for (let i = 1; ; i++) {
    const id = `c${i}`;
    if (!used.has(id)) return id;
  }
}
```

- [ ] **Step 4: Dark seeding in `counterColourFromRegion`** (`ColorTracker.ts`). After the pixel loop, and before the existing fallback seed selection, add:

```ts
  // Dark counters: saturation there is sensor noise, so the most-saturated seed picks a
  // random hue. When the central disc is dark, use its per-channel median colour instead.
  const central: Px[] = [];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const dx = x - cx; const dy = y - cy;
      if (dx * dx + dy * dy <= centralR2) central.push(pxs[y * sw + x]);
    }
  }
  if (central.length > 0) {
    const med = (vals: number[]): number => {
      const s = [...vals].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const mr = med(central.map((p) => p.r));
    const mg = med(central.map((p) => p.g));
    const mb = med(central.map((p) => p.b));
    const mhsv = rgbToHsv(mr, mg, mb);
    if (mhsv.v <= 32) return { h: mhsv.h, s: mhsv.s, v: mhsv.v, r: mr, g: mg, b: mb };
  }
```

- [ ] **Step 5: Use them in the screen**
  - In `sampleColourClick`'s `recal` branch, replace the object literal with `recalibratedChannel(c, cal, s.hex)`.
  - In the `new` branch, replace `freshChannelId(prev.channels.map((c) => c.id))` with `freshChannelId(prev.channels.map((c) => c.id), allReferencedChannelIds())`.
  - Add the imports: `recalibratedChannel` from `boardColours`, `allReferencedChannelIds` from `../../profiles/BoardProfiles`.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/__tests__/boardColours.test.ts src/__tests__/counterColour.test.ts && npm run lint && npm run test:run`
Expected: PASS; clean.

- [ ] **Step 7: Commit**

```bash
git add src/tracking/boardColours.ts src/tracking/ColorTracker.ts src/ui/screens/BoardSequencerScreen.tsx src/__tests__/boardColours.test.ts src/__tests__/counterColour.test.ts
git commit -m "fix(board-sequencer): black counters classify as black; recalibrate keeps job/instrument/mix; no channel id reuse

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 9: Bug fixes — `calibrated` from `enabled`; Space and MuteButton on this screen

**Files:**
- Create: `src/ui/globalShortcuts.ts`
- Modify: `src/ui/App.tsx`, `src/ui/screens/BoardSequencerScreen.tsx`
- Test: `src/__tests__/globalShortcuts.test.ts`

**Interfaces:**
- Produces: `globalSpaceTogglesMute(screen: Screen): boolean`, `showGlobalMuteButton(screen: Screen): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/globalShortcuts.test.ts
import { describe, it, expect } from 'vitest';
import { globalSpaceTogglesMute, showGlobalMuteButton } from '../ui/globalShortcuts';

describe('global shortcuts', () => {
  it('Space never toggles the global mute on the Board Sequencer, but still does elsewhere', () => {
    expect(globalSpaceTogglesMute('boardSequencer')).toBe(false);
    expect(globalSpaceTogglesMute('performance')).toBe(true);
    expect(globalSpaceTogglesMute('remix')).toBe(true);
  });
  it('the floating MuteButton is hidden only on the Board Sequencer', () => {
    expect(showGlobalMuteButton('boardSequencer')).toBe(false);
    expect(showGlobalMuteButton('welcome')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/__tests__/globalShortcuts.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/ui/globalShortcuts.ts
import type { Screen } from '../state/types';

/**
 * The Board Sequencer has its own engine and Mute; the global Space-to-mute (which only
 * drives the legacy AudioEngine) must not fire there, even when focus is on <body>.
 */
export function globalSpaceTogglesMute(screen: Screen): boolean {
  return screen !== 'boardSequencer';
}

/** The always-visible MuteButton shows the legacy mute, which doesn't silence the board. */
export function showGlobalMuteButton(screen: Screen): boolean {
  return screen !== 'boardSequencer';
}
```

In `App.tsx`:
- import both helpers
- change the Space case to

```tsx
        case ' ':
          if (!globalSpaceTogglesMute(useAppStore.getState().currentScreen)) break;
          e.preventDefault();
          await getAudioEngine().resume();
          toggleMute();
          break;
```

- change `<MuteButton />` to `{showGlobalMuteButton(screen) && <MuteButton />}`

In `BoardSequencerScreen.tsx`, derive calibration from the config:
- delete `const [calibrated, setCalibrated] = useState<boolean>(storedRef.current !== null);`
- add `const calibrated = config.enabled;`
- delete every `setCalibrated(...)` call (in `handleCalibrated` and `changeView`); `enabled` is already set there

- [ ] **Step 4: Verify**

Run: `npx vitest run src/__tests__/globalShortcuts.test.ts && npm run lint && npm run test:run`
Expected: PASS; clean.
Manual:
- On the Board Sequencer the floating mute button is gone, and Space does nothing.
- On Performance, Space still mutes.
- Change a setting before clicking corners and reload: Start stays disabled until the corners are set.

- [ ] **Step 5: Commit**

```bash
git add src/ui/globalShortcuts.ts src/ui/App.tsx src/ui/screens/BoardSequencerScreen.tsx src/__tests__/globalShortcuts.test.ts
git commit -m "fix(board-sequencer): calibrated derives from enabled; global Space/MuteButton don't apply to the board

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 10: Corner orientation and corner-editor maths (pure)

**Files:**
- Create: `src/tracking/boardDetect/orientation.ts`, `src/ui/screens/boardSequencer/cornerEditor.ts`
- Test: `src/__tests__/orientation.test.ts`, `src/__tests__/cornerEditor.test.ts`

**Interfaces:**
- Produces:

```ts
// orientation.ts
export type Corners = [Point, Point, Point, Point]; // [start+high, end+high, end+low, start+low]
export function rotateCorners(c: Corners, quarterTurns: number): Corners;
export function flipCorners(c: Corners): Corners;
// cornerEditor.ts
export const NUDGE_FINE = 0.0025; export const NUDGE_COARSE = 0.02;
export function nudgeCorner(c: Corners, index: number, dx: number, dy: number, step: number): Corners;
export function cornerOrderForTaps(taps: Corners): Corners | null;
export function defaultInsetCorners(inset?: number): Corners;
export function hitTestHandle(c: Corners, p: Point, radius: number): number | null;
export interface ContentRect { x: number; y: number; w: number; h: number }
export function videoContentRect(boxW: number, boxH: number, videoW: number, videoH: number, fit: 'contain' | 'fill'): ContentRect;
export function boxToFrame(px: number, py: number, rect: ContentRect): Point | null;
export function frameToBox(p: Point, rect: ContentRect): { x: number; y: number };
export function squareCentreToImage(c: Corners, squares: number, row: number, col: number): Point;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/orientation.test.ts
import { describe, it, expect } from 'vitest';
import { rotateCorners, flipCorners, type Corners } from '../tracking/boardDetect/orientation';

const c: Corners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

describe('orientation', () => {
  it('Turn moves the start to the next edge: [c3, c0, c1, c2]', () => {
    expect(rotateCorners(c, 1)).toEqual([c[3], c[0], c[1], c[2]]);
  });
  it('four turns is the identity, negative turns go backwards', () => {
    expect(rotateCorners(c, 4)).toEqual(c);
    expect(rotateCorners(rotateCorners(c, 1), -1)).toEqual(c);
  });
  it('Flip swaps start and end and keeps the low side: [c1, c0, c3, c2]', () => {
    expect(flipCorners(c)).toEqual([c[1], c[0], c[3], c[2]]);
    expect(flipCorners(flipCorners(c))).toEqual(c);
  });
});
```

```ts
// src/__tests__/cornerEditor.test.ts
import { describe, it, expect } from 'vitest';
import {
  NUDGE_FINE, NUDGE_COARSE, nudgeCorner, cornerOrderForTaps, defaultInsetCorners, hitTestHandle,
  videoContentRect, boxToFrame, frameToBox, squareCentreToImage,
} from '../ui/screens/boardSequencer/cornerEditor';
import type { Corners } from '../tracking/boardDetect/orientation';
import { computeHomography, applyHomography, UNIT_SQUARE, cellCentreUnit } from '../utils/homography';

const sq: Corners = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

describe('nudgeCorner', () => {
  it('moves only the selected corner by exactly the step, clamped to [0,1]', () => {
    const n = nudgeCorner(sq, 2, 1, -1, NUDGE_COARSE);
    expect(n[2].x).toBeCloseTo(0.92, 10);
    expect(n[2].y).toBeCloseTo(0.88, 10);
    expect(n[0]).toEqual(sq[0]);
    expect(nudgeCorner(sq, 0, -100, 0, NUDGE_FINE)[0].x).toBe(0);
    const back = nudgeCorner(nudgeCorner(sq, 1, 1, 1, NUDGE_FINE), 1, -1, -1, NUDGE_FINE);
    expect(back[1].x).toBeCloseTo(0.9, 10);
  });
});

describe('cornerOrderForTaps', () => {
  it('maps prompt order [start+low, start+high, end+high, end+low] to saved order', () => {
    const taps: Corners = [sq[3], sq[0], sq[1], sq[2]];
    expect(cornerOrderForTaps(taps)).toEqual(sq);
  });
  it('taps in prompt order give a homography whose start + low cell is at the start-low corner', () => {
    const saved = cornerOrderForTaps([sq[3], sq[0], sq[1], sq[2]])!;
    const h = computeHomography(UNIT_SQUARE, saved);
    const p = applyHomography(h, cellCentreUnit(3, 0, 4, 4));
    expect(p.x).toBeLessThan(0.5);
    expect(p.y).toBeGreaterThan(0.5);
  });
  it('rejects crossed and non-convex quads', () => {
    expect(cornerOrderForTaps([sq[3], sq[1], sq[0], sq[2]])).toBeNull(); // crossed
    expect(cornerOrderForTaps([sq[3], sq[0], { x: 0.4, y: 0.4 }, sq[2]])).toBeNull(); // dent
  });
});

describe('defaultInsetCorners / hitTestHandle', () => {
  it('insets 10% from each edge in saved order', () => {
    expect(defaultInsetCorners()).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }]);
  });
  it('hits the nearest handle within the radius', () => {
    expect(hitTestHandle(sq, { x: 0.12, y: 0.88 }, 0.05)).toBe(3);
    expect(hitTestHandle(sq, { x: 0.5, y: 0.5 }, 0.05)).toBeNull();
  });
});

describe('video content rect mapping', () => {
  it('16:9 video in a 4:3 box (contain) round-trips and rejects the letterbox bars', () => {
    const r = videoContentRect(400, 300, 1280, 720, 'contain');
    expect(r).toEqual({ x: 0, y: 37.5, w: 400, h: 225 });
    const f = boxToFrame(200, 150, r)!;
    expect(f).toEqual({ x: 0.5, y: 0.5 });
    expect(frameToBox(f, r)).toEqual({ x: 200, y: 150 });
    expect(boxToFrame(200, 10, r)).toBeNull();
  });
  it('4:3 video in a 16:9 box (contain) pillarboxes', () => {
    expect(videoContentRect(640, 360, 640, 480, 'contain')).toEqual({ x: 80, y: 0, w: 480, h: 360 });
  });
  it('fill uses the whole box', () => {
    expect(videoContentRect(640, 360, 640, 480, 'fill')).toEqual({ x: 0, y: 0, w: 640, h: 360 });
  });
});

describe('squareCentreToImage', () => {
  it('maps a board square centre through the corners', () => {
    const p = squareCentreToImage(sq, 8, 0, 0);
    expect(p.x).toBeCloseTo(0.15, 10);
    expect(p.y).toBeCloseTo(0.15, 10);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/__tests__/orientation.test.ts src/__tests__/cornerEditor.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

```ts
// src/tracking/boardDetect/orientation.ts
/**
 * Board corner orientation. Saved corners map onto UNIT_SQUARE in this order:
 * [0] start + high notes, [1] end + high, [2] end + low, [3] start + low.
 */
import type { Point } from '../../utils/homography';

export type Corners = [Point, Point, Point, Point];

/** ⟲ Turn: move the loop's start to the next physical edge (one quarter turn per step). */
export function rotateCorners(c: Corners, quarterTurns: number): Corners {
  const n = ((Math.round(quarterTurns) % 4) + 4) % 4;
  let out: Corners = [c[0], c[1], c[2], c[3]];
  for (let i = 0; i < n; i++) out = [out[3], out[0], out[1], out[2]];
  return out;
}

/** ⇋ Flip: swap start and end, keeping the low-notes side. */
export function flipCorners(c: Corners): Corners {
  return [c[1], c[0], c[3], c[2]];
}
```

```ts
// src/ui/screens/boardSequencer/cornerEditor.ts
/** Pure maths for the corner editor: nudges, tap order, hit-testing and video-box mapping. */
import { computeHomography, applyHomography, UNIT_SQUARE, type Point } from '../../../utils/homography';
import type { Corners } from '../../../tracking/boardDetect/orientation';

export const NUDGE_FINE = 0.0025;
export const NUDGE_COARSE = 0.02;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function nudgeCorner(c: Corners, index: number, dx: number, dy: number, step: number): Corners {
  const out: Corners = [c[0], c[1], c[2], c[3]];
  out[index] = { x: clamp01(c[index].x + dx * step), y: clamp01(c[index].y + dy * step) };
  return out;
}

function isConvexQuad(q: Corners): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]; const b = q[(i + 1) % 4]; const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Taps are prompted [start+low, start+high, end+high, end+low]; returns saved order or null. */
export function cornerOrderForTaps(taps: Corners): Corners | null {
  const saved: Corners = [taps[1], taps[2], taps[3], taps[0]];
  return isConvexQuad(saved) ? saved : null;
}

/** "Place corners for me": a quad inset from each video edge, for keyboard/switch users. */
export function defaultInsetCorners(inset = 0.1): Corners {
  return [{ x: inset, y: inset }, { x: 1 - inset, y: inset }, { x: 1 - inset, y: 1 - inset }, { x: inset, y: 1 - inset }];
}

export function hitTestHandle(c: Corners, p: Point, radius: number): number | null {
  let best: number | null = null;
  let bestD = radius;
  c.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

export interface ContentRect { x: number; y: number; w: number; h: number }

export function videoContentRect(boxW: number, boxH: number, videoW: number, videoH: number, fit: 'contain' | 'fill'): ContentRect {
  if (fit === 'fill' || videoW <= 0 || videoH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const scale = Math.min(boxW / videoW, boxH / videoH);
  const w = videoW * scale;
  const h = videoH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Box pixel → fraction of the full camera frame, or null in the letterbox bars. */
export function boxToFrame(px: number, py: number, rect: ContentRect): Point | null {
  const x = (px - rect.x) / rect.w;
  const y = (py - rect.y) / rect.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function frameToBox(p: Point, rect: ContentRect): { x: number; y: number } {
  return { x: rect.x + p.x * rect.w, y: rect.y + p.y * rect.h };
}

/** Centre of physical board square (row, col) in frame fractions, via the saved corners. */
export function squareCentreToImage(c: Corners, squares: number, row: number, col: number): Point {
  const h = computeHomography(UNIT_SQUARE, c);
  return applyHomography(h, { x: (col + 0.5) / squares, y: (row + 0.5) / squares });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/__tests__/orientation.test.ts src/__tests__/cornerEditor.test.ts && npm run lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/tracking/boardDetect/orientation.ts src/ui/screens/boardSequencer/cornerEditor.ts src/__tests__/orientation.test.ts src/__tests__/cornerEditor.test.ts
git commit -m "feat(board-sequencer): pure corner orientation + corner-editor maths

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 11: Setup flow rules (pure)

**Files:**
- Create: `src/ui/screens/boardSequencer/boardSetupFlow.ts`
- Test: `src/__tests__/boardSetupFlow.test.ts`

**Interfaces:**
- Produces:

```ts
export type SetupStep = 'camera' | 'board' | 'colours' | 'ready';
export const SETUP_STEPS: SetupStep[];
export type CameraPhase = 'starting' | 'running' | 'fallback' | 'error';
export interface CameraStatus { phase: CameraPhase; colourless: boolean | null }
export interface SetupConfigView { enabled: boolean; channels: { role: ColourRole }[] }
export type StepIndicator = 'done' | 'warning' | 'current' | 'todo' | 'pending';
export function resolveEntry(cfg: SetupConfigView, hasStoredConfig: boolean): SetupStep;
export function cameraSatisfied(camera: CameraStatus, hasStoredConfig: boolean): boolean;
export function canOpenStep(step: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean): boolean;
export function canContinue(step: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean): boolean;
export function canPlay(cfg: SetupConfigView, camera: CameraStatus): boolean;
export function stepIndicator(step: SetupStep, current: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean): StepIndicator;
export function continueLabel(step: SetupStep, camera: CameraStatus): string;
export function nextStep(step: SetupStep): SetupStep | null;
export function prevStep(step: SetupStep): SetupStep | null;
```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/boardSetupFlow.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveEntry, canOpenStep, canContinue, canPlay, stepIndicator, continueLabel, nextStep, prevStep,
  type CameraStatus, type SetupConfigView,
} from '../ui/screens/boardSequencer/boardSetupFlow';

const cam = (phase: CameraStatus['phase'], colourless: boolean | null = false): CameraStatus => ({ phase, colourless });
const noSetup: SetupConfigView = { enabled: false, channels: [] };
const cornersOnly: SetupConfigView = { enabled: true, channels: [{ role: 'off' }] };
const valid: SetupConfigView = { enabled: true, channels: [{ role: 'melody' }] };

describe('resolveEntry', () => {
  it.each([
    [noSetup, false, 'camera'],
    [noSetup, true, 'board'],
    [cornersOnly, true, 'colours'],
    [valid, true, 'board'],
  ] as const)('%o stored=%s → %s', (cfg, stored, step) => {
    expect(resolveEntry(cfg, stored)).toBe(step);
  });
});

describe('step gating', () => {
  it('camera counts once running or on fallback; starting only when a setup is stored', () => {
    for (const phase of ['running', 'fallback'] as const) expect(canOpenStep('board', noSetup, cam(phase), false)).toBe(true);
    expect(canOpenStep('board', noSetup, cam('starting'), false)).toBe(false);
    expect(canOpenStep('board', valid, cam('starting'), true)).toBe(true);
    expect(canOpenStep('board', valid, cam('error'), true)).toBe(false);
  });

  it('after a Mirror/camera change (corners reset, colours kept) Colours/Ready are closed and Play is off', () => {
    const afterMirror: SetupConfigView = { enabled: false, channels: [{ role: 'melody' }] };
    expect(canOpenStep('colours', afterMirror, cam('running'), true)).toBe(false);
    expect(canOpenStep('ready', afterMirror, cam('running'), true)).toBe(false);
    expect(canPlay(afterMirror, cam('running'))).toBe(false);
  });

  it('Continue rules per step', () => {
    expect(canContinue('camera', noSetup, cam('starting'), false)).toBe(false);
    expect(canContinue('camera', noSetup, cam('error'), false)).toBe(false);
    expect(canContinue('camera', noSetup, cam('fallback'), false)).toBe(true);
    expect(canContinue('board', noSetup, cam('running'), false)).toBe(false);
    expect(canContinue('board', cornersOnly, cam('running'), true)).toBe(true);
    expect(canContinue('colours', cornersOnly, cam('running'), true)).toBe(false);
    expect(canContinue('colours', valid, cam('running'), true)).toBe(true);
    expect(canContinue('ready', valid, cam('running'), true)).toBe(false);
  });

  it('Play needs corners, an active colour and a camera that is not in error', () => {
    expect(canPlay(valid, cam('running'))).toBe(true);
    expect(canPlay(valid, cam('fallback'))).toBe(true);
    expect(canPlay(valid, cam('error'))).toBe(false);
    expect(canPlay(cornersOnly, cam('running'))).toBe(false);
  });

  it('colourless camera: Continue anyway, never a block', () => {
    expect(canContinue('camera', noSetup, cam('running', true), false)).toBe(true);
    expect(continueLabel('camera', cam('running', true))).toBe('Continue anyway');
    expect(continueLabel('camera', cam('running', null))).toBe('Continue');
    expect(continueLabel('camera', cam('running', false))).toBe('Continue');
  });
});

describe('stepIndicator', () => {
  it('shows done/warning/current/todo/pending', () => {
    expect(stepIndicator('camera', 'board', valid, cam('running'), true)).toBe('done');
    expect(stepIndicator('camera', 'board', valid, cam('fallback'), true)).toBe('warning');
    expect(stepIndicator('camera', 'board', valid, cam('starting'), true)).toBe('pending');
    expect(stepIndicator('board', 'board', valid, cam('running'), true)).toBe('current');
    expect(stepIndicator('colours', 'board', valid, cam('running'), true)).toBe('done');
    expect(stepIndicator('colours', 'board', cornersOnly, cam('running'), true)).toBe('todo');
    expect(stepIndicator('ready', 'board', valid, cam('running'), true)).toBe('todo');
  });
});

describe('next/prev', () => {
  it('walks the four steps', () => {
    expect(nextStep('camera')).toBe('board');
    expect(nextStep('ready')).toBeNull();
    expect(prevStep('camera')).toBeNull();
    expect(prevStep('ready')).toBe('colours');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/__tests__/boardSetupFlow.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/ui/screens/boardSequencer/boardSetupFlow.ts
/** Pure rules for the guided Set up flow: Camera → Board → Colours → Ready. */
import type { ColourRole } from '../../../tracking/boardColours';

export type SetupStep = 'camera' | 'board' | 'colours' | 'ready';
export const SETUP_STEPS: SetupStep[] = ['camera', 'board', 'colours', 'ready'];
export type CameraPhase = 'starting' | 'running' | 'fallback' | 'error';
export interface CameraStatus { phase: CameraPhase; colourless: boolean | null }
export interface SetupConfigView { enabled: boolean; channels: { role: ColourRole }[] }
export type StepIndicator = 'done' | 'warning' | 'current' | 'todo' | 'pending';

const hasActiveChannel = (cfg: SetupConfigView): boolean => cfg.channels.some((c) => c.role !== 'off');

/** Resolved once at mount from config only; routing never moves the user on its own. */
export function resolveEntry(cfg: SetupConfigView, hasStoredConfig: boolean): SetupStep {
  if (!hasStoredConfig) return 'camera';
  if (!cfg.enabled) return 'board';
  if (!hasActiveChannel(cfg)) return 'colours';
  return 'board';
}

/** Camera is good enough for later steps: running, stand-in fallback, or still starting for a returning user. */
export function cameraSatisfied(camera: CameraStatus, hasStoredConfig: boolean): boolean {
  if (camera.phase === 'running' || camera.phase === 'fallback') return true;
  return camera.phase === 'starting' && hasStoredConfig;
}

export function canOpenStep(step: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean): boolean {
  if (step === 'camera') return true;
  if (!cameraSatisfied(camera, hasStoredConfig)) return false;
  if (step === 'board') return true;
  if (!cfg.enabled) return false;
  if (step === 'colours') return true;
  return hasActiveChannel(cfg);
}

export function canContinue(step: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean): boolean {
  if (step === 'camera') return camera.phase === 'running' || camera.phase === 'fallback';
  if (step === 'board') return cfg.enabled && cameraSatisfied(camera, hasStoredConfig);
  if (step === 'colours') return canOpenStep('ready', cfg, camera, hasStoredConfig);
  return false;
}

export function canPlay(cfg: SetupConfigView, camera: CameraStatus): boolean {
  return cfg.enabled && hasActiveChannel(cfg) && camera.phase !== 'error';
}

export function stepIndicator(
  step: SetupStep, current: SetupStep, cfg: SetupConfigView, camera: CameraStatus, hasStoredConfig: boolean,
): StepIndicator {
  if (step === current) return 'current';
  if (step === 'camera') {
    if (camera.phase === 'running') return 'done';
    if (camera.phase === 'fallback' || camera.phase === 'error') return 'warning';
    return 'pending';
  }
  if (step === 'board') return cfg.enabled && cameraSatisfied(camera, hasStoredConfig) ? 'done' : 'todo';
  if (step === 'colours') return cfg.enabled && hasActiveChannel(cfg) ? 'done' : 'todo';
  return 'todo';
}

export function continueLabel(step: SetupStep, camera: CameraStatus): string {
  return step === 'camera' && camera.colourless === true ? 'Continue anyway' : 'Continue';
}

export function nextStep(step: SetupStep): SetupStep | null {
  return SETUP_STEPS[SETUP_STEPS.indexOf(step) + 1] ?? null;
}

export function prevStep(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step);
  return i > 0 ? SETUP_STEPS[i - 1] : null;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/__tests__/boardSetupFlow.test.ts && npm run lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/boardSequencer/boardSetupFlow.ts src/__tests__/boardSetupFlow.test.ts
git commit -m "feat(board-sequencer): pure setup-flow rules (entry, gating, indicator)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 12: Nudge state machine (pure)

**Files:**
- Create: `src/ui/screens/boardSequencer/playNudge.ts`
- Test: `src/__tests__/playNudge.test.ts`

**Interfaces:**
- Consumes: `CellReading` (`row`, `col`, `occupied`, `colour`, `centroid` in unit board coords, `fractions`, `offset`).
- Produces:

```ts
export const NUDGE_HOLD_MS = 2000; export const NUDGE_CLEAR_MS = 1000;
export const BOARD_MOVED_MIN_PIECES = 4; export const BOARD_MOVED_SHIFT_SQUARES = 0.3; export const BOARD_MOVED_SAME_DIRECTION = 0.7;
export const COLOUR_MATCH_CELL_SHARE = 0.6; export const COLOUR_MATCH_MIN_CELLS = 8; export const COLOUR_MATCH_MIN_FILL = 0.5; export const COLOUR_MATCH_MIN_GRID = 16;
export type NudgeKind = 'board-moved' | 'colour-matches-board';
export type NudgeSignal = { kind: 'board-moved' } | { kind: 'colour-matches-board'; channelId: ColourId };
export interface KindState { active: boolean; since: number | null; clearSince: number | null; dismissed: boolean }
export interface NudgeState { boardMoved: KindState; colourMatches: KindState & { channelId: ColourId | null } }
export interface NudgeContext { boardSquares: number; rows: number; cols: number; variationEnabled: boolean; variationOffsetThreshold: number; enabled: boolean; ignoreColours?: ReadonlySet<ColourId> }
export function initialNudgeState(): NudgeState;
export function boardMovedRaw(readings: CellReading[], ctx: NudgeContext): boolean;
export function colourMatchesBoardRaw(readings: CellReading[], ctx: NudgeContext): ColourId | null;
export function stepNudge(prev: NudgeState, readings: CellReading[], ctx: NudgeContext, now: number): { state: NudgeState; signal: NudgeSignal | null };
export function dismissNudge(state: NudgeState, kind: NudgeKind): NudgeState;
```

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/playNudge.test.ts
import { describe, it, expect } from 'vitest';
import {
  initialNudgeState, stepNudge, dismissNudge, boardMovedRaw, colourMatchesBoardRaw, type NudgeContext,
} from '../ui/screens/boardSequencer/playNudge';
import type { CellReading } from '../tracking/BoardSequencerMode';

const ctx = (over: Partial<NudgeContext> = {}): NudgeContext => ({
  boardSquares: 8, rows: 4, cols: 4, variationEnabled: false, variationOffsetThreshold: 0.6, enabled: true, ...over,
});

/** A piece in physical square (sr, sc) of an 8×8 board, shifted by (dx, dy) squares. */
function piece(sr: number, sc: number, dx = 0, dy = 0, colour = 'red', offset = 0.5, rows = 4, cols = 4): CellReading {
  const x = (sc + 0.5 + dx) / 8;
  const y = (sr + 0.5 + dy) / 8;
  return { row: Math.floor(y * rows), col: Math.floor(x * cols), occupied: true, colour, centroid: { x, y }, offset, fractions: { [colour]: 0.12 } };
}

const spread = (dx = 0, dy = 0): CellReading[] => [piece(0, 0, dx, dy), piece(2, 5, dx, dy), piece(5, 2, dx, dy), piece(7, 7, dx, dy), piece(4, 4, dx, dy)];

function run(readings: CellReading[], c: NudgeContext, ms: number) {
  let st = initialNudgeState();
  let signal = null;
  for (let t = 0; t <= ms; t += 100) ({ state: st, signal } = stepNudge(st, readings, c, t));
  return { st, signal };
}

describe('board-moved', () => {
  it('counters centred on their squares (4×4 over 8×8) → none', () => {
    expect(boardMovedRaw(spread(), ctx())).toBe(false);
  });
  it('a uniform 0.35-square shift fires only after 2 s', () => {
    expect(boardMovedRaw(spread(0.35, 0), ctx())).toBe(true);
    expect(run(spread(0.35, 0), ctx(), 1500).signal).toBeNull();
    expect(run(spread(0.35, 0), ctx(), 2200).signal).toEqual({ kind: 'board-moved' });
  });
  it('fewer than 4 pieces → never', () => {
    expect(boardMovedRaw(spread(0.35, 0).slice(0, 3), ctx())).toBe(false);
  });
  it('Variation pushes in mixed directions → none', () => {
    const pushed = [piece(0, 0, 0.4, 0, 'red', 0.8), piece(2, 5, -0.4, 0, 'red', 0.8), piece(5, 2, 0, 0.4, 'red', 0.8), piece(7, 7, 0, -0.4, 'red', 0.8), piece(4, 4)];
    expect(boardMovedRaw(pushed, ctx({ variationEnabled: true }))).toBe(false);
  });
  it('is off when the grid does not divide the board, and ignores control colours', () => {
    expect(boardMovedRaw(spread(0.35, 0), ctx({ rows: 3, cols: 3 }))).toBe(false);
    expect(boardMovedRaw(spread(0.35, 0).map((r) => ({ ...r, colour: 'vol' })), ctx({ ignoreColours: new Set(['vol']) }))).toBe(false);
  });
});

describe('colour-matches-board', () => {
  const cells = (n: number, fill: number): CellReading[] => Array.from({ length: n }, (_, i) => ({
    row: Math.floor(i / 4), col: i % 4, occupied: true, colour: 'orange', centroid: { x: 0.5, y: 0.5 }, offset: 0.5, fractions: { orange: fill },
  }));
  it('a channel in 12 of 16 cells at fraction ≥ 0.5 fires; at 0.1 it does not', () => {
    expect(colourMatchesBoardRaw(cells(12, 0.8), ctx())).toBe('orange');
    expect(colourMatchesBoardRaw(cells(12, 0.1), ctx())).toBeNull();
  });
  it('off on grids smaller than 16 cells (3 counters on 2×2)', () => {
    const small = cells(3, 0.9).map((r, i) => ({ ...r, row: Math.floor(i / 2), col: i % 2 }));
    expect(colourMatchesBoardRaw(small, ctx({ rows: 2, cols: 2 }))).toBeNull();
  });
  it('wins over board-moved when both hold', () => {
    const both = [...cells(12, 0.8), ...spread(0.35, 0)];
    expect(run(both, ctx(), 2200).signal).toEqual({ kind: 'colour-matches-board', channelId: 'orange' });
  });
});

describe('dismiss, hysteresis and switch', () => {
  it('Not now hides a kind until it clears for 1 s, then it can come back', () => {
    let { st, signal } = run(spread(0.35, 0), ctx(), 2200);
    expect(signal).not.toBeNull();
    st = dismissNudge(st, 'board-moved');
    ({ state: st, signal } = stepNudge(st, spread(0.35, 0), ctx(), 2300));
    expect(signal).toBeNull();
    for (let t = 2400; t <= 3500; t += 100) ({ state: st, signal } = stepNudge(st, spread(), ctx(), t));
    expect(st.boardMoved.active).toBe(false);
    for (let t = 3600; t <= 5800; t += 100) ({ state: st, signal } = stepNudge(st, spread(0.35, 0), ctx(), t));
    expect(signal).toEqual({ kind: 'board-moved' });
  });
  it('a brief clear under 1 s does not drop an active nudge', () => {
    let { st } = run(spread(0.35, 0), ctx(), 2200);
    let signal;
    ({ state: st, signal } = stepNudge(st, spread(), ctx(), 2600));
    expect(signal).toEqual({ kind: 'board-moved' });
  });
  it('disabled → never signals', () => {
    expect(run(spread(0.35, 0), ctx({ enabled: false }), 3000).signal).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/__tests__/playNudge.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/ui/screens/boardSequencer/playNudge.ts
/**
 * "Board moved?" and "<colour> is matching the board" hints, as a pure state machine.
 * Both only inform; nothing changes on its own. Thresholds are named for tuning.
 */
import type { CellReading } from '../../../tracking/BoardSequencerMode';
import type { ColourId } from '../../../tracking/boardColours';

export const NUDGE_HOLD_MS = 2000;
export const NUDGE_CLEAR_MS = 1000;
export const BOARD_MOVED_MIN_PIECES = 4;
export const BOARD_MOVED_SHIFT_SQUARES = 0.3;
export const BOARD_MOVED_SAME_DIRECTION = 0.7;
export const COLOUR_MATCH_CELL_SHARE = 0.6;
export const COLOUR_MATCH_MIN_CELLS = 8;
export const COLOUR_MATCH_MIN_FILL = 0.5;
export const COLOUR_MATCH_MIN_GRID = 16;

export type NudgeKind = 'board-moved' | 'colour-matches-board';
export type NudgeSignal = { kind: 'board-moved' } | { kind: 'colour-matches-board'; channelId: ColourId };

export interface KindState { active: boolean; since: number | null; clearSince: number | null; dismissed: boolean }
export interface NudgeState { boardMoved: KindState; colourMatches: KindState & { channelId: ColourId | null } }

export interface NudgeContext {
  boardSquares: number;
  rows: number;
  cols: number;
  variationEnabled: boolean;
  variationOffsetThreshold: number;
  enabled: boolean;
  ignoreColours?: ReadonlySet<ColourId>;
}

const idle = (): KindState => ({ active: false, since: null, clearSince: null, dismissed: false });

export function initialNudgeState(): NudgeState {
  return { boardMoved: idle(), colourMatches: { ...idle(), channelId: null } };
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** A shared shift of the pieces away from their physical square centres. */
export function boardMovedRaw(readings: CellReading[], ctx: NudgeContext): boolean {
  const n = ctx.boardSquares;
  if (n % ctx.rows !== 0 || n % ctx.cols !== 0) return false;
  const dxs: number[] = [];
  const dys: number[] = [];
  for (const r of readings) {
    if (!r.occupied || !r.colour || !r.centroid) continue;
    if (ctx.ignoreColours?.has(r.colour)) continue;
    if (ctx.variationEnabled && (r.offset ?? 0) >= ctx.variationOffsetThreshold) continue;
    const fx = r.centroid.x * n;
    const fy = r.centroid.y * n;
    dxs.push(fx - Math.floor(fx) - 0.5);
    dys.push(fy - Math.floor(fy) - 0.5);
  }
  if (dxs.length < BOARD_MOVED_MIN_PIECES) return false;
  const axisFires = (d: number[]): boolean => {
    const m = median(d);
    if (Math.abs(m) < BOARD_MOVED_SHIFT_SQUARES) return false;
    const same = d.filter((v) => Math.sign(v) === Math.sign(m) && v !== 0).length;
    return same / d.length >= BOARD_MOVED_SAME_DIRECTION;
  };
  return axisFires(dxs) || axisFires(dys);
}

/** The channel lighting most of the board with big (non-counter-sized) coverage, or null. */
export function colourMatchesBoardRaw(readings: CellReading[], ctx: NudgeContext): ColourId | null {
  const cells = ctx.rows * ctx.cols;
  if (cells < COLOUR_MATCH_MIN_GRID) return null;
  const byColour = new Map<ColourId, number[]>();
  for (const r of readings) {
    if (!r.occupied || !r.colour) continue;
    const list = byColour.get(r.colour) ?? [];
    list.push(r.fractions?.[r.colour] ?? 0);
    byColour.set(r.colour, list);
  }
  let best: ColourId | null = null;
  let bestCount = 0;
  for (const [id, fills] of byColour) {
    if (fills.length <= COLOUR_MATCH_CELL_SHARE * cells || fills.length < COLOUR_MATCH_MIN_CELLS) continue;
    if (median(fills) < COLOUR_MATCH_MIN_FILL) continue;
    if (fills.length > bestCount) { best = id; bestCount = fills.length; }
  }
  return best;
}

function advance(k: KindState, raw: boolean, now: number): KindState {
  if (raw) {
    const since = k.since ?? now;
    return { ...k, since, clearSince: null, active: k.active || now - since >= NUDGE_HOLD_MS };
  }
  if (!k.active) return { ...k, since: null, clearSince: null, dismissed: false };
  const clearSince = k.clearSince ?? now;
  if (now - clearSince >= NUDGE_CLEAR_MS) return idle();
  return { ...k, since: null, clearSince };
}

export function stepNudge(prev: NudgeState, readings: CellReading[], ctx: NudgeContext, now: number): { state: NudgeState; signal: NudgeSignal | null } {
  if (!ctx.enabled) return { state: initialNudgeState(), signal: null };
  const boardMoved = advance(prev.boardMoved, boardMovedRaw(readings, ctx), now);
  const channel = colourMatchesBoardRaw(readings, ctx);
  const restarted = channel !== null && prev.colourMatches.channelId !== null && channel !== prev.colourMatches.channelId;
  const baseColour: KindState = restarted ? idle() : prev.colourMatches;
  const colourKind = advance(baseColour, channel !== null, now);
  const colourMatches = { ...colourKind, channelId: channel ?? (colourKind.active ? prev.colourMatches.channelId : null) };
  const state: NudgeState = { boardMoved, colourMatches };
  let signal: NudgeSignal | null = null;
  if (colourMatches.active && !colourMatches.dismissed && colourMatches.channelId) {
    signal = { kind: 'colour-matches-board', channelId: colourMatches.channelId };
  } else if (boardMoved.active && !boardMoved.dismissed) {
    signal = { kind: 'board-moved' };
  }
  return { state, signal };
}

export function dismissNudge(state: NudgeState, kind: NudgeKind): NudgeState {
  return kind === 'board-moved'
    ? { ...state, boardMoved: { ...state.boardMoved, dismissed: true } }
    : { ...state, colourMatches: { ...state.colourMatches, dismissed: true } };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx vitest run src/__tests__/playNudge.test.ts && npm run lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/boardSequencer/playNudge.ts src/__tests__/playNudge.test.ts
git commit -m "feat(board-sequencer): pure nudge state machine (board moved / colour matches board)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

### Task 13: Suggested jobs and handedness layout (pure)

**Files:**
- Create: `src/ui/screens/boardSequencer/roles.ts`, `src/ui/screens/boardSequencer/layout.ts`
- Modify: `src/ui/screens/BoardSequencerScreen.tsx` (new colours get `suggestRole`)
- Test: `src/__tests__/roles.test.ts`, `src/__tests__/layout.test.ts`

**Interfaces:**
- Produces:

```ts
export function suggestRole(existing: { role: ColourRole }[], added: { kind: ColourKind }): ColourRole;
export type Hand = 'left' | 'right';
export interface BoardLayout {
  mode: 'side' | 'stacked'; playAreas: string; setupAreas: string; transport: 'panel-top' | 'bottom-bar';
  transportAlign: 'start' | 'end'; footerAlign: 'start' | 'end'; pip: 'bottom-left' | 'bottom-right';
  nudgePad: 'left' | 'right'; bigBoardControls: 'left' | 'right'; domOrder: readonly string[];
}
export const LAYOUT_BREAKPOINT_PX = 1024;
export function layoutFor(hand: Hand, widthPx: number, uiSize: 'standard' | 'large'): BoardLayout;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/roles.test.ts
import { describe, it, expect } from 'vitest';
import { suggestRole } from '../ui/screens/boardSequencer/roles';

describe('suggestRole', () => {
  it('first colour → Melody; a black counter → Drums when free', () => {
    expect(suggestRole([], { kind: 'hue' })).toBe('melody');
    expect(suggestRole([], { kind: 'black' })).toBe('drums');
  });
  it('fills free jobs in order Melody, Bass, Drums, Chords', () => {
    expect(suggestRole([{ role: 'melody' }], { kind: 'hue' })).toBe('bass');
    expect(suggestRole([{ role: 'melody' }, { role: 'bass' }], { kind: 'white' })).toBe('drums');
  });
  it('a black counter when Drums is taken gets the first free job', () => {
    expect(suggestRole([{ role: 'drums' }], { kind: 'black' })).toBe('melody');
  });
  it('respects jobs the user reassigned, and gives Off when none are free', () => {
    expect(suggestRole([{ role: 'bass' }, { role: 'volume' }], { kind: 'hue' })).toBe('melody');
    expect(suggestRole([{ role: 'melody' }, { role: 'bass' }, { role: 'drums' }, { role: 'chord' }], { kind: 'hue' })).toBe('off');
  });
});
```

```ts
// src/__tests__/layout.test.ts
import { describe, it, expect } from 'vitest';
import { layoutFor } from '../ui/screens/boardSequencer/layout';

describe('layoutFor', () => {
  it('side by side: left hand puts the panel (with transport) on the left', () => {
    const l = layoutFor('left', 1440, 'standard');
    const r = layoutFor('right', 1440, 'standard');
    expect(l).toMatchObject({ mode: 'side', playAreas: '"panel stage"', setupAreas: '"panel camera"', transport: 'panel-top', pip: 'bottom-right', nudgePad: 'left', bigBoardControls: 'left', footerAlign: 'start' });
    expect(r).toMatchObject({ mode: 'side', playAreas: '"stage panel"', setupAreas: '"camera panel"', pip: 'bottom-left', nudgePad: 'right', bigBoardControls: 'right', footerAlign: 'end' });
  });
  it('stacked below 1024 px and in Large UI, with the bar controls on the player side', () => {
    expect(layoutFor('left', 900, 'standard')).toMatchObject({ mode: 'stacked', transport: 'bottom-bar', transportAlign: 'start' });
    expect(layoutFor('right', 1440, 'large')).toMatchObject({ mode: 'stacked', transport: 'bottom-bar', transportAlign: 'end' });
  });
  it('DOM/focus order is identical for both hands', () => {
    for (const w of [900, 1440]) expect(layoutFor('left', w, 'standard').domOrder).toEqual(layoutFor('right', w, 'standard').domOrder);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/__tests__/roles.test.ts src/__tests__/layout.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

```ts
// src/ui/screens/boardSequencer/roles.ts
import type { ColourKind, ColourRole } from '../../../tracking/boardColours';

const JOB_ORDER: ColourRole[] = ['melody', 'bass', 'drums', 'chord'];

/** The job suggested for a newly added colour; the user can always change it. */
export function suggestRole(existing: { role: ColourRole }[], added: { kind: ColourKind }): ColourRole {
  const used = new Set(existing.map((c) => c.role));
  const free = JOB_ORDER.filter((r) => !used.has(r));
  if (added.kind === 'black' && free.includes('drums')) return 'drums';
  return free[0] ?? 'off';
}
```

```ts
// src/ui/screens/boardSequencer/layout.ts
/**
 * Handedness layout. It mirrors WHERE things sit (grid areas, alignment) but never the
 * DOM/focus order, the camera, the board, or slider direction. Never use dir="rtl".
 */
export type Hand = 'left' | 'right';

export interface BoardLayout {
  mode: 'side' | 'stacked';
  playAreas: string;
  setupAreas: string;
  transport: 'panel-top' | 'bottom-bar';
  transportAlign: 'start' | 'end';
  footerAlign: 'start' | 'end';
  pip: 'bottom-left' | 'bottom-right';
  nudgePad: 'left' | 'right';
  bigBoardControls: 'left' | 'right';
  domOrder: readonly string[];
}

export const LAYOUT_BREAKPOINT_PX = 1024;
const DOM_ORDER = ['header', 'stage', 'panel', 'transport'] as const;

export function layoutFor(hand: Hand, widthPx: number, uiSize: 'standard' | 'large'): BoardLayout {
  const left = hand === 'left';
  const stacked = widthPx < LAYOUT_BREAKPOINT_PX || uiSize === 'large';
  return {
    mode: stacked ? 'stacked' : 'side',
    playAreas: stacked ? '"stage" "panel"' : left ? '"panel stage"' : '"stage panel"',
    setupAreas: stacked ? '"camera" "panel"' : left ? '"panel camera"' : '"camera panel"',
    transport: stacked ? 'bottom-bar' : 'panel-top',
    transportAlign: left ? 'start' : 'end',
    footerAlign: left ? 'start' : 'end',
    pip: left ? 'bottom-right' : 'bottom-left',
    nudgePad: left ? 'left' : 'right',
    bigBoardControls: left ? 'left' : 'right',
    domOrder: DOM_ORDER,
  };
}
```

- [ ] **Step 4: Use `suggestRole` in the old screen.** In `sampleColourClick`'s `new` branch, replace `role: 'melody'` with `role: suggestRole(prev.channels, { kind: cal.kind })`, and add the import.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/__tests__/roles.test.ts src/__tests__/layout.test.ts && npm run lint && npm run test:run`
Expected: PASS; clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/boardSequencer/roles.ts src/ui/screens/boardSequencer/layout.ts src/ui/screens/BoardSequencerScreen.tsx src/__tests__/roles.test.ts src/__tests__/layout.test.ts
git commit -m "feat(board-sequencer): suggested jobs for new colours + pure handedness layout

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Final verification (after Task 13)

- [ ] Run `npm run lint && npm run test:run` → all clean.
- [ ] Manual smoke on the real board with the USB webcam:
  - existing setup loads, as the migrated Player 1
  - a black counter calibrates as Black
  - recalibrating a colour keeps its instrument
  - with a 4 × 4 grid, counters are detected
  - Tempo still follows a tempo counter
  - no floating mute button on this screen
  - the playhead no longer runs ahead of the sound

