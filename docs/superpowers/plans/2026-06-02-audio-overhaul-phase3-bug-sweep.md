# Audio Overhaul — Phase 3: Bug Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix seven verified, high-confidence bugs in Song Present and Remix (the "it breaks" pain deferred at the start), without destabilizing the now-working audio path.

**Tech Stack:** TypeScript (strict, no `any`, `noUnusedLocals`), Tone.js ^15.1.22, Vitest (jsdom, `vi.mock('tone')` with `vi.hoisted` spies). Continues on branch `feat/audio-overhaul-phase0`.

**Scope (verified findings, "confirmed + low-risk" tier):**
1. **Critical:** `loadSong` has no cancellation token → rapid song-switch corrupts state/leaks audio. Fix in **both** engines (Tasks 1–2).
2. **High (Song Present):** downbeat pulse fights `setMuted` → song un-mutes itself on the next downbeat (Task 3).
3. **High (Song Present):** head-bop with beat-snap while *stopped* queues bops that all fire on Play (Task 4).
4. **High (Song Present):** synth `HeadBopKit` uses `.toDestination()` → bypasses the master chain and `setMuted` (Task 5).
5. **Medium (Remix):** a section whose loop region can't be resolved plays across the whole song (Task 6).
6. **Medium (Remix):** a drum whose samples all 404'd makes a *silent* hit instead of falling back (Task 7).
7. **Medium (Remix):** `arrangementStore` has no quota handling on save and no shape validation on load → silent data loss / later crash (Task 8).

**Out of scope (deferred — risky/uncertain, per user):** Remix latched-stem-across-loop-seam record fidelity; percussion seam double-fire; frame-rate-independent velocity; `pendingChord` single-slot.

---

## Task 1: Song Present — `loadSong` cancellation token

**Files:** Modify `src/songs/SongPresetEngine.ts`. Test: `src/__tests__/SongPresetEngine.loadRace.test.ts` (create).

**Context:** `loadSong` ([:395](../../src/songs/SongPresetEngine.ts#L395)) awaits `Tone.start()`, `loadStemBuffers`, `loadSongAnalysis`, and a sample-load race, with no guard — a superseded load's continuation writes stems/analysis/duration into the new song's engine and mutates the `SongConfig` in place.

- [ ] **Step 1: Write the failing test** at `src/__tests__/SongPresetEngine.loadRace.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Control loadStemBuffers timing so we can interleave two loadSong calls.
const deferred: Array<{ resolve: (v: Map<string, AudioBuffer>) => void }> = [];
vi.mock('../songs/loadStemBuffers', () => ({
  loadStemBuffers: vi.fn(() =>
    new Promise<Map<string, AudioBuffer>>((resolve) => { deferred.push({ resolve }); }),
  ),
}));
vi.mock('tone', () => {
  const node = () => ({
    connect: vi.fn(), disconnect: vi.fn(), chain: vi.fn(), toDestination: vi.fn(() => node()),
    dispose: vi.fn(), start: vi.fn(), stop: vi.fn(), triggerAttackRelease: vi.fn(),
    gain: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), rampTo: vi.fn() },
    wet: { value: 1 }, set: vi.fn(), volume: { value: 0 },
  });
  return {
    start: vi.fn().mockResolvedValue(undefined),
    getContext: vi.fn(() => ({ rawContext: { createGain: vi.fn(() => node()), currentTime: 0, destination: {}, state: 'running' } })),
    getTransport: vi.fn(() => ({ bpm: { value: 120 }, stop: vi.fn(), cancel: vi.fn(), start: vi.fn() })),
    getDestination: vi.fn(() => node()),
    now: vi.fn(() => 0), connect: vi.fn(), setContext: vi.fn(),
    Sampler: vi.fn(() => node()), PolySynth: vi.fn(() => node()), MonoSynth: vi.fn(() => node()),
    FMSynth: vi.fn(() => node()), Synth: vi.fn(() => node()), Reverb: vi.fn(() => node()),
    Filter: vi.fn(() => node()), Gain: vi.fn(() => node()), EQ3: vi.fn(() => node()),
    Compressor: vi.fn(() => node()), Limiter: vi.fn(() => node()), WaveShaper: vi.fn(() => node()),
    Player: vi.fn(() => node()), Frequency: vi.fn(() => ({ toNote: () => 'C4', toFrequency: () => 261.63 })),
  };
});
vi.mock('../songs/analysisLoader', () => ({ loadSongAnalysis: vi.fn().mockResolvedValue({ chordProgression: [], beats: [], downbeats: [], harmony: [], bpm: 120 }) }));

import { SongPresetEngine } from '../songs/SongPresetEngine';
import type { SongConfig } from '../songs/songLibrary';

function song(id: string): SongConfig {
  return { id, title: id, artist: 'A', key: 'C', bpm: 120, timeSignature: '4/4',
    stems: { mix: `${id}.mp3` }, stemMixer: { label: 'm', leftZone: {}, centerZone: {}, rightZone: {} } } as unknown as SongConfig;
}

beforeEach(() => { deferred.length = 0; vi.clearAllMocks(); });

describe('SongPresetEngine loadSong race', () => {
  it('a superseded load does not overwrite the newer song', async () => {
    const e = new SongPresetEngine();
    const pA = e.loadSong(song('A'));   // parks at loadStemBuffers (deferred[0])
    const pB = e.loadSong(song('B'));   // parks at loadStemBuffers (deferred[1])
    // Resolve B first (the newer load), then A (the stale one).
    const buf = new Map([['mix', { duration: 3 } as AudioBuffer]]);
    deferred[1].resolve(buf);
    await pB;
    deferred[0].resolve(buf);
    await pA;
    // The engine must reflect song B, not A.
    expect((e as unknown as { song: SongConfig }).song.id).toBe('B');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (stale load overwrites; `song.id` ends up 'A'): `npx vitest run src/__tests__/SongPresetEngine.loadRace.test.ts`.

- [ ] **Step 3: Add the token guard.** In `SongPresetEngine`:
  - Add a field near the other private state: `private loadToken = 0;`
  - In `loadSong`, immediately after `this.disposeAudio();` (line 397) capture the token: `const myToken = ++this.loadToken;`
  - After EACH `await` in `loadSong`, bail if superseded. Add `if (myToken !== this.loadToken) return;` immediately after:
    - `await Tone.start();` (after line 405, before reading the context — actually place it right after the `this.ctx = ...` assignment so a superseded load doesn't keep building),
    - the `await loadStemBuffers(...)` block (after the `for … this.stems.set(...)` loop, line ~431),
    - the `await loadSongAnalysis(...)` try/catch (after line 448),
    - and the sample-load `await Promise.race([...])` further down (after it resolves).
  Place the guard so that on bail, no further engine/`SongConfig` mutation happens. (Set `this.song = song` only once at the top as today; the guard prevents the stale continuation from rebuilding.)

- [ ] **Step 4: Run — expect PASS**: `npx vitest run src/__tests__/SongPresetEngine.loadRace.test.ts`.
- [ ] **Step 5: Lint** — `npm run lint`. PASS.
- [ ] **Step 6: Run existing Song Present suites** — `npx vitest run src/__tests__/SongPresetEngine.headBop.test.ts src/__tests__/SongPresetEngine.walk.test.ts`. PASS.
- [ ] **Step 7: Commit:**
```bash
git add src/songs/SongPresetEngine.ts src/__tests__/SongPresetEngine.loadRace.test.ts
git commit -m "fix(songs): cancel superseded loadSong (rapid song-switch race)"
```

---

## Task 2: Remix — `loadSong` cancellation token

**Files:** Modify `src/remix/RemixEngine.ts`. Test: `src/__tests__/RemixEngine.loadRace.test.ts` (create).

**Context:** `RemixEngine.loadSong` ([:82](../../src/remix/RemixEngine.ts#L82)) awaits `Tone.start()`, `loadStemBuffers`, `loadSongAnalysis`, `loadLoopManifest` with no guard. Same corruption as Task 1.

- [ ] **Step 1: Write the failing test** at `src/__tests__/RemixEngine.loadRace.test.ts`. Reuse the RemixEngine.test mock style but make `loadStemBuffers` deferred:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const deferred: Array<{ resolve: (v: Map<string, AudioBuffer>) => void }> = [];
vi.mock('../remix/loadStemBuffers', () => ({
  loadStemBuffers: vi.fn(() => new Promise<Map<string, AudioBuffer>>((r) => { deferred.push({ resolve: r }); })),
}));
vi.mock('../remix/layers/loadLoopManifest', () => ({ loadLoopManifest: vi.fn().mockResolvedValue([]) }));
vi.mock('tone', () => {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn(), sync: vi.fn().mockReturnThis(),
    start: vi.fn().mockReturnThis(), stop: vi.fn().mockReturnThis(), unsync: vi.fn().mockReturnThis(),
    loop: false, playbackRate: 1, volume: { value: 0 } });
  const Transport = { bpm: { value: 120 }, seconds: 0, start: vi.fn(), stop: vi.fn(), pause: vi.fn(), cancel: vi.fn(), loop: false, loopStart: 0, loopEnd: 0, scheduleOnce: vi.fn(), state: 'stopped' };
  const raw = { currentTime: 0, state: 'running', destination: {},
    createGain: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setTargetAtTime: vi.fn() } })),
    createBiquadFilter: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), type: 'lowpass', frequency: { value: 0, setTargetAtTime: vi.fn() }, Q: { value: 0 } })) };
  return { start: vi.fn().mockResolvedValue(undefined), getContext: vi.fn(() => ({ rawContext: raw })),
    getTransport: vi.fn(() => Transport), now: vi.fn(() => 0), connect: vi.fn(),
    Player: vi.fn(() => node()), GrainPlayer: vi.fn(() => node()) };
});
vi.mock('../songs/analysisLoader', () => ({ loadSongAnalysis: vi.fn().mockResolvedValue({ downbeats: [], beats: [] }) }));

import { RemixEngine } from '../remix/RemixEngine';
import type { SongConfig } from '../songs/songLibrary';

function song(id: string): SongConfig {
  return { id, title: id, artist: 'A', key: 'C', bpm: 120, timeSignature: '4/4',
    stems: { vocals: 'v', drums: 'd', bass: 'b', other: 'o' },
    stemMixer: { label: 'm', leftZone: {}, centerZone: {}, rightZone: {} } } as unknown as SongConfig;
}

beforeEach(() => { deferred.length = 0; vi.clearAllMocks();
  (globalThis as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch; });

describe('RemixEngine loadSong race', () => {
  it('a superseded load does not overwrite the newer songId', async () => {
    const e = new RemixEngine();
    const pA = e.loadSong(song('A'));
    const pB = e.loadSong(song('B'));
    const buf = new Map([['vocals', { duration: 4 } as AudioBuffer]]);
    deferred[1].resolve(buf); await pB;
    deferred[0].resolve(buf); await pA;
    expect((e as unknown as { songId: string }).songId).toBe('B');
  });
});
```
(If `RemixEngine` exposes the loaded song id under a different field, adjust the assertion to that field — read the class to confirm the field name, e.g. `songId`.)

- [ ] **Step 2: Run — expect FAIL**: `npx vitest run src/__tests__/RemixEngine.loadRace.test.ts`.
- [ ] **Step 3: Add the token guard.** In `RemixEngine`: add `private loadToken = 0;`. In `loadSong`, after `this.dispose();` capture `const myToken = ++this.loadToken;`. After EACH `await` (`Tone.start()`, `loadStemBuffers`, `loadSongAnalysis`, `loadLoopManifest`), add `if (myToken !== this.loadToken) return;` before any further state mutation.
- [ ] **Step 4: Run — expect PASS**: `npx vitest run src/__tests__/RemixEngine.loadRace.test.ts`.
- [ ] **Step 5: Lint** — `npm run lint`. PASS.
- [ ] **Step 6: Run existing Remix suite** — `npx vitest run src/__tests__/RemixEngine.test.ts`. PASS.
- [ ] **Step 7: Commit:**
```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.loadRace.test.ts
git commit -m "fix(remix): cancel superseded loadSong (rapid song-switch race)"
```

---

## Task 3: Song Present — mute vs. downbeat pulse

**Files:** Modify `src/songs/SongPresetEngine.ts`.

**Context:** `setMuted` ([:595](../../src/songs/SongPresetEngine.ts#L595)) ramps `masterGainNode.gain` to 0; `updateBeatPulse` ([:1568](../../src/songs/SongPresetEngine.ts#L1568)) `cancelScheduledValues` + ramps back to `0.8` on every downbeat → un-mutes.

- [ ] **Step 1: Add a muted flag + guard.**
  - Add field: `private muted = false;`
  - In `setMuted`: set `this.muted = muted;` before the ramp (keep the existing `setTargetAtTime(muted ? 0 : 0.8, ...)`).
  - In `updateBeatPulse`, add an early return at the top, after the existing guard: `if (this.muted) return;`
- [ ] **Step 2: Lint** — `npm run lint`. PASS.
- [ ] **Step 3: Add a focused test** at `src/__tests__/SongPresetEngine.mutePulse.test.ts` exercising the guard via the public surface. Mock `tone` minimally; construct the engine, call `setMuted(true)`, then invoke the (now-guarded) pulse path. Since `updateBeatPulse` is private and driven by the RAF loop, test the observable invariant instead: after `setMuted(true)`, calling `setMuted(true)` again and reading the master gain ramp target shows 0, and the muted flag suppresses the pulse. Concretely, expose the decision via a tiny package-private check OR assert that `setMuted(true)` leaves `(engine as any).muted === true` and that a direct `(engine as any).updateBeatPulse(t)` call does NOT write `setValueAtTime` on the gain when muted:

```typescript
// after constructing engine with a mocked masterGainNode that records gain calls:
(engine as unknown as { masterGainNode: { gain: { setValueAtTime: ReturnType<typeof vi.fn> } } | null });
// build routing requires a loaded song; simplest: set the private fields the pulse reads.
```
If wiring a full engine in the test is impractical, instead unit-test the guard logic by asserting `setMuted` toggles the flag and that `updateBeatPulse` early-returns when muted — call the private method directly via an `as unknown as { updateBeatPulse(t: number): void; muted: boolean; masterGainNode: ...; song: ... }` cast, with a fake `masterGainNode.gain` spy and a `song.downbeats=[0]`, and assert `gain.setValueAtTime` is NOT called when `muted=true` but IS when `muted=false`. Keep the test minimal and robust; if it proves brittle, mark this fix **manual-verification** in the report and rely on lint + no-regression.

- [ ] **Step 4: Run the test** (if written) — PASS. Then full Song Present suites pass.
- [ ] **Step 5: Commit:**
```bash
git add src/songs/SongPresetEngine.ts src/__tests__/SongPresetEngine.mutePulse.test.ts
git commit -m "fix(songs): downbeat pulse no longer un-mutes the master"
```

---

## Task 4: Song Present — head-bop burst on Play (beat-snap while stopped)

**Files:** Modify `src/songs/SongPresetEngine.ts`.

**Context:** `triggerHeadBop` ([:1488](../../src/songs/SongPresetEngine.ts#L1488)) queues `headBopPending` when `beatSnap` is on, but the queue only flushes inside the play-loop `update()`. While stopped, queued bops accumulate and all fire on Play.

- [ ] **Step 1: Guard the queue on playback state.** In `triggerHeadBop`, change the beat-snap branch condition so it only defers when actually playing; otherwise play immediately:
```typescript
    if (this.beatSnap && this.isPlayingState && beats && beats.length > 0) {
      const targetTime = nextBeatAfter(beats, this.lastUpdateTime);
      const drum = pickHeadBopDrum(targetTime, beats, downbeats);
      this.headBopPending = { targetTime, drum, velocity };
    } else {
      const drum = pickHeadBopDrum(this.lastUpdateTime, beats, downbeats);
      this.playHeadBopDrum(drum, velocity);
    }
```
(`isPlayingState` is the existing private field the RAF loop checks.)

- [ ] **Step 2: Add a test** in `src/__tests__/SongPresetEngine.headBop.test.ts` (existing): enable head-bop AND beat-snap, with the engine NOT playing, feed one bop, and assert a drum fires **immediately** (the existing kick/snare trigger spy is called once) rather than being queued. Mirror the existing `feedOneBop` helper. Example:
```typescript
  it('plays immediately (no queued burst) when beat-snap is on but not playing', () => {
    const engine = new SongPresetEngine();
    engine.setHeadBopEnabled(true);
    (engine as unknown as { beatSnap: boolean }).beatSnap = true; // or the public setter if one exists
    feedOneBop(engine, 0);
    expect(kickTrigger).toHaveBeenCalledTimes(1); // fired now, not deferred
  });
```
(If there's a public beat-snap setter, use it; otherwise the cast is acceptable in a test. Confirm the default `beats` are empty so `pickHeadBopDrum` returns 'kick'.)

- [ ] **Step 3: Run** the head-bop suite — PASS. Lint — PASS.
- [ ] **Step 4: Commit:**
```bash
git add src/songs/SongPresetEngine.ts src/__tests__/SongPresetEngine.headBop.test.ts
git commit -m "fix(songs): head-bop plays immediately when stopped (no burst on Play)"
```

---

## Task 5: Song Present — route synth HeadBopKit through the master chain

**Files:** Modify `src/songs/voices/HeadBopKit.ts`, `src/songs/SongPresetEngine.ts`, and the head-bop test mock(s).

**Context:** `HeadBopKit`'s pieces call `.toDestination()` ([HeadBopKit.ts:107,119,127,141](../../src/songs/voices/HeadBopKit.ts#L107)), bypassing `masterGainNode`/`MasterChain` and `setMuted`. Route them through a single output node the engine connects to `masterGainNode`.

- [ ] **Step 1: Give HeadBopKit an output node + connect().** In `HeadBopKit`:
  - Add a private output gain built lazily from a context, OR accept a destination. Simplest: add `private out: Tone.Gain | null = null;` and a `connect(dest: AudioNode): void` that creates `this.out = new Tone.Gain()` (if absent), connects each lazily-built synth to `this.out`, and connects `this.out` to `dest`. Change each `ensureX()` to `.connect(this.out!)` **instead of** `.toDestination()`. Build `this.out` in `connect()` (called before any play) and have `ensure*` connect to it. If `connect()` hasn't been called yet, fall back to `.toDestination()` so behavior is safe.
  - Simpler, robust approach given lazy builders: store the destination (`private dest: AudioNode | null = null;`), `connect(dest)` sets it, and each `ensureX()` does `synth.connect(this.dest ?? Tone.getDestination())`. Add `disconnect`/dispose handling as today.
  - Update the class doc comment accordingly.
- [ ] **Step 2: Wire it in the engine.** In `SongPresetEngine`, the synth `HeadBopKit` is created lazily (`new HeadBopKit()` at [:1479](../../src/songs/SongPresetEngine.ts#L1479) and [:1505](../../src/songs/SongPresetEngine.ts#L1505)). After creating it, connect it to the master: `this.headBopKit.connect(this.masterGainNode!)` when `masterGainNode` exists. Centralise this: in `playHeadBopDrum` and `triggerHeadBop`, after `this.headBopKit = new HeadBopKit()`, call `if (this.masterGainNode) this.headBopKit.connect(this.masterGainNode);`. (Or build it eagerly in `buildRouting`.)
- [ ] **Step 3: Update head-bop test mocks.** `SongPresetEngine.headBop.test.ts` builds synths via `synthWith(spy)` whose `.toDestination()` returns the trigger spy. With the kit now using `.connect()`, the spy must attach to the **post-connect** node. Update `synthWith` so the synth's `connect()` returns a node whose `triggerAttackRelease` is the spy (mirror the existing `toDestination` trick), and add a `Gain` constructor to the mock if the kit uses `Tone.Gain`. Keep all existing assertions. (Walk test loads a song and builds the kit too — ensure its mock also tolerates `connect()`/`Gain`.)
- [ ] **Step 4: Run** `npx vitest run src/__tests__/SongPresetEngine.headBop.test.ts src/__tests__/SongPresetEngine.walk.test.ts src/__tests__/HeadBopKit.picker.test.ts`. PASS. Lint — PASS.
- [ ] **Step 5: Commit:**
```bash
git add src/songs/voices/HeadBopKit.ts src/songs/SongPresetEngine.ts src/__tests__/SongPresetEngine.headBop.test.ts src/__tests__/SongPresetEngine.walk.test.ts
git commit -m "fix(songs): route synth head-bop kit through master chain (mute + glue)"
```

---

## Task 6: Remix — skip sections whose loop region can't be resolved

**Files:** Modify `src/remix/RemixEngine.ts`. Test: extend `src/__tests__/RemixEngine.test.ts`.

**Context:** `sectionBounds` ([:490](../../src/remix/RemixEngine.ts#L490)) falls back to `{ start: 0, end: duration||+Infinity }` when `computeLoopRegion` returns null → a section with unresolved downbeats plays across the whole song.

- [ ] **Step 1: Make bounds nullable + skip in tick.**
  - Change `sectionBounds` to return `{ start, end } | null`: `const region = computeLoopRegion(...); return region ? { start: region.startSec, end: region.endSec } : null;`
  - In `tickArrangement` ([:499](../../src/remix/RemixEngine.ts#L499)): `const bounds = this.sectionBounds(...); if (!bounds) continue; const { start, end } = bounds;`
- [ ] **Step 2: Add a test** to `RemixEngine.test.ts`: load a song with empty `downbeats` (so `computeLoopRegion` returns null), build an arrangement with one section, start arrangement playback, advance, and assert no stem-filter automation is applied (e.g. stems stay at their pre-tick state). If exercising the private tick is impractical, assert via a public method that a section with unresolvable bounds produces no effect. Keep it minimal; if too deep, test `sectionBounds` directly via a cast and assert it returns `null` for empty downbeats. Example (direct):
```typescript
  it('sectionBounds returns null when the region cannot be resolved', async () => {
    const e = new RemixEngine();
    await e.loadSong(song()); // song() with downbeats: [] (no bar grid)
    const bounds = (e as unknown as { sectionBounds(o: number, l: number): unknown }).sectionBounds(0, 4);
    expect(bounds).toBeNull();
    e.dispose();
  });
```
(Use a `song()` variant whose `downbeats` is `[]`.)

- [ ] **Step 3: Run** `npx vitest run src/__tests__/RemixEngine.test.ts`. PASS. Lint — PASS.
- [ ] **Step 4: Commit:**
```bash
git add src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "fix(remix): skip arrangement sections with unresolvable loop regions"
```

---

## Task 7: Remix — drum fallback to kick when a sample is missing

**Files:** Modify `src/audio/instruments/RoundRobinDrumKit.ts`. Test: extend `src/__tests__/RoundRobinDrumKit.test.ts`.

**Context:** `fire()` ([RoundRobinDrumKit.ts:101](../../src/audio/instruments/RoundRobinDrumKit.ts#L101)) no-ops when a drum has no loaded players (e.g. the snare 404'd) → a backbeat head-nod produces *silence* while downbeats sound.

- [ ] **Step 1: Fall back to kick.** In `fire(name, gainDb)`, when `this.samples.get(name)` is missing/empty, retry with `'kick'` once:
```typescript
  private fire(name: DrumName, gainDb: number): void {
    let players = this.samples.get(name);
    if ((!players || players.length === 0) && name !== 'kick') {
      players = this.samples.get('kick'); // fall back so every hit makes a sound
    }
    if (!players || players.length === 0) return;
    const key = players === this.samples.get(name) ? name : 'kick';
    const i = this.rrIndex.get(key) ?? 0;
    const p = players[i];
    this.rrIndex.set(key, (i + 1) % players.length);
    p.volume.value = gainDb;
    p.start();
  }
```
(Keep it simple — the rr index must advance on whichever pool actually fired. Adjust to your exact field names; the intent: missing drum → play a kick instead of nothing.)

- [ ] **Step 2: Add a test** to `RoundRobinDrumKit.test.ts`: manifest with `kick` + `hat` but NO `snare`; after ready, `play('snare', 0.8)` fires the **kick** sample (assert `startSpy` called with a kick filename). Use the existing mock.
- [ ] **Step 3: Run** `npx vitest run src/__tests__/RoundRobinDrumKit.test.ts`. PASS. Lint — PASS.
- [ ] **Step 4: Commit:**
```bash
git add src/audio/instruments/RoundRobinDrumKit.ts src/__tests__/RoundRobinDrumKit.test.ts
git commit -m "fix(audio): drum kit falls back to kick when a sample is absent"
```

---

## Task 8: Remix — arrangementStore save quota + load validation

**Files:** Modify `src/remix/recording/arrangementStore.ts`. Test: extend `src/__tests__/arrangementStore.test.ts`.

**Context:** `saveArrangement` ([:10](../../src/remix/recording/arrangementStore.ts#L10)) can throw `QuotaExceededError` (unhandled); `loadArrangementFromStore` ([:14](../../src/remix/recording/arrangementStore.ts#L14)) casts parsed JSON with no shape check → malformed data crashes later in compositing.

- [ ] **Step 1: Harden both.**
```typescript
export function saveArrangement(name: string, a: RemixArrangement): boolean {
  try {
    localStorage.setItem(key(a.songId, name), JSON.stringify(a));
    return true;
  } catch {
    return false; // quota exceeded / storage disabled — caller can surface a message
  }
}

function isValidArrangement(v: unknown): v is RemixArrangement {
  if (!v || typeof v !== 'object') return false;
  const a = v as Partial<RemixArrangement>;
  if (typeof a.songId !== 'string' || !Array.isArray(a.sections)) return false;
  return a.sections.every(
    (s) => s && Array.isArray((s as { layers?: unknown }).layers) &&
      (s as { layers: unknown[] }).layers.every(
        (t) => t && Array.isArray((t as { events?: unknown }).events) && typeof (t as { id?: unknown }).id === 'string',
      ),
  );
}

export function loadArrangementFromStore(songId: string, name: string): RemixArrangement | null {
  const raw = localStorage.getItem(key(songId, name));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidArrangement(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
```
(Confirm the exact `RemixSection`/`RemixTake` field names against `remixRecording.ts` — `sections`, `layers`, `events`, `id` — and match them.)

- [ ] **Step 2: Update the caller's return-type expectation.** `saveArrangement` now returns `boolean`. Check `RemixScreen.tsx`'s save handler — if it ignored the return before, optionally surface a failure message; at minimum it must still compile. Report what you change.
- [ ] **Step 3: Add tests** to `arrangementStore.test.ts`: (a) `saveArrangement` returns `false` (doesn't throw) when `localStorage.setItem` throws; (b) `loadArrangementFromStore` returns `null` for a stored blob missing `sections`/`events`; (c) a valid round-trip still loads. Mock/stub `localStorage` as the existing test does.
- [ ] **Step 4: Run** `npx vitest run src/__tests__/arrangementStore.test.ts`. PASS. Lint — PASS.
- [ ] **Step 5: Commit:**
```bash
git add src/remix/recording/arrangementStore.ts src/__tests__/arrangementStore.test.ts src/ui/screens/RemixScreen.tsx
git commit -m "fix(remix): arrangementStore tolerates quota errors + validates loaded data"
```

---

## Task 9: Full regression + build

**Files:** none.

- [ ] **Step 1: Full suite** — `npm run test:run`. Expected: PASS (all files incl. the new race/fallback/validation tests). Zero failures.
- [ ] **Step 2: Type-check** — `npm run lint`. PASS.
- [ ] **Step 3: Production build** — `npm run build`. Success.
- [ ] **Step 4: Manual verification (run skill / `npm run dev`):**
  - Rapid-switch songs in both modes → the final song plays cleanly (no doubled/garbled audio).
  - Song Present: Mute stays muted across downbeats; with Beat Bopping on, nodding while paused then pressing Play does NOT dump a burst of drums; synth head-bop (when samples absent) respects Mute and sits at master level.
  - Remix: a loaded arrangement that doesn't match the song's bars doesn't flood the timeline; a head-nod backbeat still makes a sound even if the snare sample is missing.

---

## Self-Review

**Coverage:** All 7 verified findings → Tasks 1–8 (loadSong race split across both engines). Deferred items explicitly listed as out-of-scope. ✅
**Placeholder scan:** Concrete fix code + test code per task. A few engine-internal fixes (Tasks 3, 5, 6) note where a test may be brittle and allow a documented manual-verification fallback rather than a fake/over-mocked test — flagged honestly, not hidden. ✅
**Type consistency:** New fields `loadToken`/`muted` are private; `sectionBounds` return type widens to `… | null` with the single caller updated; `saveArrangement` returns `boolean` with the caller updated. `HeadBopKit.connect(dest)` mirrors `RoundRobinDrumKit.connect`. ✅
**Risk:** Task 5 (head-bop routing) is the most invasive (touches a class + two test mocks) — isolated to head-bop; the synth path falls back to `toDestination()` if `connect()` wasn't called, preserving safety.
