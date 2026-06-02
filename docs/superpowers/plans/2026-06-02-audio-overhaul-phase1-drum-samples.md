# Audio Overhaul — Phase 1: Bundled CC0 Round-Robin Drum Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship real, redistributable CC0 drum samples committed to the repo, played with round-robin variation, so Remix drums (currently silent in any deployed build) and Song Present head-bop drums (currently thin synths) sound like a real kit — without losing offline/instant resilience.

**Architecture:** A new `RoundRobinDrumKit` (in `src/audio/instruments/`) loads a per-kit JSON manifest listing multiple one-shot samples per drum, and rotates through them on each hit. Remix's `PercussionLayer` uses it directly. Song Present uses it when its samples are ready and **falls back to the existing synth `HeadBopKit`** otherwise. A curated CC0 kit (hybrid Boochi44 one-shots as the default sound + TR-808 tidalcycles variants in the round-robin pool) is downloaded and committed under `public/samples/drums/studio-kit/`, with a `.gitignore` exception so it ships while non-redistributable local kits stay ignored.

**Tech Stack:** TypeScript (strict, no `any`, `noUnusedLocals`), Tone.js ^15.1.22, Web Audio API, Vitest (jsdom, `vi.mock('tone')` with `vi.hoisted` spies).

**Spec:** `docs/superpowers/specs/2026-06-02-song-remix-audio-overhaul-design.md`
**Builds on:** Phase 0 (`feat/audio-overhaul-phase0`) — the master chain. This plan continues on the same branch.

**Sample sources (both CC0, curl-verified during research):**
- Primary (default sound): `Boochi44/free-drum-samples` — `https://raw.githubusercontent.com/Boochi44/free-drum-samples/main/drum-samples/...` (CC0 per README; provenance to verified CC0 808s).
- Round-robin pool: `tidalcycles/sounds-tr808-fischer` — `https://raw.githubusercontent.com/tidalcycles/sounds-tr808-fischer/main/...` (formal CC0-1.0 LICENSE file).

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `public/samples/drums/studio-kit/*.wav` | Create (download) | Committed CC0 one-shots: several `kick`/`snare`, plus `hat`/`crash`(/`clap`). |
| `public/samples/drums/studio-kit/kit.json` | Create | Manifest: per-drum arrays of sample filenames. |
| `public/samples/drums/studio-kit/ATTRIBUTION.md` | Create | CC0 provenance + source URLs. |
| `public/samples/drums/.gitignore` | Modify | Add exception so `studio-kit/` audio is tracked. |
| `src/audio/instruments/RoundRobinDrumKit.ts` | Create | Manifest-driven, round-robin one-shot kit. Same play/connect/dispose interface as `DrumKit`. |
| `src/__tests__/RoundRobinDrumKit.test.ts` | Create | Unit tests: rotation, compound, velocity, not-ready/fallback no-op. |
| `src/remix/layers/PercussionLayer.ts` | Modify | Use `RoundRobinDrumKit` with kit id `studio-kit`. |
| `src/__tests__/RemixEngine.test.ts` | Modify | Update the "Player construction count" assertions (drum kit now loads via async manifest → 0 players under the test's fetch mock). |
| `src/songs/SongPresetEngine.ts` | Modify | Build a `RoundRobinDrumKit` on load; at the two head-bop play sites prefer it when ready, else the synth `HeadBopKit`; dispose it. |

**Kept as-is:** `src/remix/layers/DrumKit.ts` is **removed** (its sole consumer, `PercussionLayer`, switches to `RoundRobinDrumKit`); its test `src/__tests__/DrumKit.test.ts` is removed too (superseded by `RoundRobinDrumKit.test.ts`). `HeadBopKit.ts` stays (it's the synth fallback). `pickHeadBopDrum` stays (still the beat picker for both consumers).

**Manifest format (`kit.json`):**
```json
{
  "kick":  ["kick-01.wav", "kick-02.wav", "kick-03.wav"],
  "snare": ["snare-01.wav", "snare-02.wav", "snare-03.wav"],
  "hat":   ["hat-closed-01.wav"],
  "crash": ["crash-01.wav"]
}
```
Keys are the canonical drum names (`kick`/`snare`/`hat`/`crash`). Each value is a non-empty array of filenames relative to the kit folder. `RoundRobinDrumKit` rotates through each drum's array per hit.

---

## Task 1: Download + commit the CC0 studio kit

**Files:**
- Create: `public/samples/drums/studio-kit/*.wav`, `public/samples/drums/studio-kit/kit.json`, `public/samples/drums/studio-kit/ATTRIBUTION.md`
- Modify: `public/samples/drums/.gitignore`

This task has no automated test — verification is "files exist, are real WAVs, and `kit.json` references only files that exist."

- [ ] **Step 1: Create the kit folder and download the default (hybrid) one-shots.**

These exact URLs were curl-verified (HTTP 200, real RIFF/WAVE). Run from repo root:

```bash
mkdir -p public/samples/drums/studio-kit
cd public/samples/drums/studio-kit
BASE=https://raw.githubusercontent.com/Boochi44/free-drum-samples/main/drum-samples/01-hard-trap
curl -fSL -o kick-01.wav  "$BASE/kicks/hard-kick-01.wav"
curl -fSL -o kick-02.wav  "$BASE/kicks/hard-kick-02.wav"
curl -fSL -o snare-01.wav "$BASE/snares/hard-snare-01.wav"
curl -fSL -o snare-02.wav "$BASE/snares/hard-snare-02.wav"
curl -fSL -o hat-closed-01.wav "$BASE/hi-hats/hi-hat-closed-01.wav"
curl -fSL -o crash-01.wav "$BASE/fx/fx-cymbal.wav"
cd -
```

- [ ] **Step 2: Add TR-808 round-robin variants (rock-solid CC0 LICENSE).**

```bash
cd public/samples/drums/studio-kit
T808=https://raw.githubusercontent.com/tidalcycles/sounds-tr808-fischer/main
curl -fSL -o kick-03.wav  "$T808/bd8/BD0000.WAV"
curl -fSL -o snare-03.wav "$T808/sd8/SD0000.WAV"
cd -
```

- [ ] **Step 3 (optional enhancement): pull a softer/"soulful" kick + snare for better fit under the Motown songs.**

The `03-soulful-vintage` sub-kit has the same folder layout but different filenames. List it and grab one kick + one snare if available; if the listing or download fails, SKIP this step (the kit from Steps 1–2 is already complete and verified).

```bash
# Discover exact filenames (no auth needed):
curl -fsSL "https://api.github.com/repos/Boochi44/free-drum-samples/contents/drum-samples/03-soulful-vintage/kicks" | grep '"name"'
# If a kick is listed, e.g. "vintage-kick-01.wav":
# curl -fSL -o kick-04.wav "https://raw.githubusercontent.com/Boochi44/free-drum-samples/main/drum-samples/03-soulful-vintage/kicks/<name>.wav"
# Same for snares → snare-04.wav. Only add files that download as HTTP 200 real WAVs.
```

- [ ] **Step 4: Verify every downloaded file is a real, non-empty WAV.**

```bash
cd public/samples/drums/studio-kit
ls -la *.wav
for f in *.wav; do
  sz=$(wc -c < "$f")
  hdr=$(head -c 4 "$f")
  echo "$f  bytes=$sz  hdr=$hdr"
  if [ "$sz" -lt 1000 ] || [ "$hdr" != "RIFF" ]; then echo "BAD FILE: $f"; fi
done
cd -
```
Expected: each file > 1 KB and `hdr=RIFF`. If any prints "BAD FILE", delete it and do not reference it in `kit.json`. (A 404 with `curl -f` writes no file, so missing files just don't appear.)

- [ ] **Step 5: Write `kit.json` referencing exactly the files that exist.**

Create `public/samples/drums/studio-kit/kit.json`. Include only filenames that passed Step 4. With the guaranteed Steps 1–2 files (and no optional extras), it is:

```json
{
  "kick":  ["kick-01.wav", "kick-02.wav", "kick-03.wav"],
  "snare": ["snare-01.wav", "snare-02.wav", "snare-03.wav"],
  "hat":   ["hat-closed-01.wav"],
  "crash": ["crash-01.wav"]
}
```
If Step 3 added `kick-04.wav`/`snare-04.wav`, append them to the respective arrays.

- [ ] **Step 6: Write `ATTRIBUTION.md`.**

Create `public/samples/drums/studio-kit/ATTRIBUTION.md`:

```markdown
# studio-kit — bundled drum one-shots

All samples in this folder are **CC0 1.0 (public domain dedication)** — free to use,
modify, and redistribute, no attribution required. Committed here so deployed builds
have working drums (the sibling local kits remain git-ignored; see ../SAMPLE_SOURCES.md).

## Sources
- Hybrid one-shots (kick/snare/hat/crash defaults): **Boochi44/free-drum-samples**
  https://github.com/Boochi44/free-drum-samples — CC0 1.0 (per repo README; provenance
  traces to the CC0 TR-808 recordings by Edward Loveall).
- TR-808 round-robin variants (kick-03, snare-03): **tidalcycles/sounds-tr808-fischer**
  https://github.com/tidalcycles/sounds-tr808-fischer — CC0 1.0 (formal LICENSE file).
```

- [ ] **Step 7: Add the `.gitignore` exception so the committed kit is tracked.**

Edit `public/samples/drums/.gitignore`. After the existing extension ignores, append:

```gitignore

# Bundled CC0 kit (redistributable) — committed so deployed builds have drums.
!studio-kit/
!studio-kit/**
```

- [ ] **Step 8: Confirm git will track the kit, then commit.**

```bash
git add public/samples/drums/.gitignore public/samples/drums/studio-kit
git status --short public/samples/drums/studio-kit   # should list kit.json, ATTRIBUTION.md, and every *.wav
git commit -m "assets(drums): bundle CC0 studio-kit one-shots (Boochi44 + TR-808)"
```
Expected: `git status` shows the WAVs as staged (NOT ignored). If the WAVs are missing from the staged set, the `.gitignore` negation didn't take — re-check Step 7. Report total committed size (`du -sh public/samples/drums/studio-kit`).

---

## Task 2: RoundRobinDrumKit class

**Files:**
- Create: `src/audio/instruments/RoundRobinDrumKit.ts`
- Test: `src/__tests__/RoundRobinDrumKit.test.ts`

Follow TDD.

- [ ] **Step 1: Write the failing test** at `src/__tests__/RoundRobinDrumKit.test.ts`:

```typescript
// src/__tests__/RoundRobinDrumKit.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each Tone.Player records the url it was built with and a shared start spy
// tagged with that url, so we can assert WHICH sample fired.
const { startSpy, players } = vi.hoisted(() => ({
  startSpy: vi.fn(),
  players: [] as { url: string }[],
}));

vi.mock('tone', () => {
  const Player = vi.fn().mockImplementation((opts: { url: string; onload?: () => void }) => {
    players.push({ url: opts.url });
    opts.onload?.();
    return {
      url: opts.url,
      connect: vi.fn(),
      start: (t?: number) => startSpy(opts.url, t),
      dispose: vi.fn(),
      volume: { value: 0 },
    };
  });
  return { Player };
});

import { RoundRobinDrumKit } from '../audio/instruments/RoundRobinDrumKit';

const MANIFEST = {
  kick: ['kick-01.wav', 'kick-02.wav'],
  snare: ['snare-01.wav'],
  hat: ['hat-closed-01.wav'],
  crash: ['crash-01.wav'],
};

function mockFetchOk() {
  (globalThis as { fetch: typeof fetch }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(MANIFEST),
  }) as unknown as typeof fetch;
}
function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}
function fakeCtx(): AudioContext {
  return { createGain: vi.fn(() => fakeNode()) } as unknown as AudioContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  players.length = 0;
});

describe('RoundRobinDrumKit', () => {
  it('loads a Player per sample listed in the manifest and becomes ready', async () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    expect(kit.isReady()).toBe(true);
    // 2 kick + 1 snare + 1 hat + 1 crash = 5 players
    expect(players.length).toBe(5);
  });

  it('rotates through a drum’s samples on successive hits', async () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    kit.play('kick', 0.8);
    kit.play('kick', 0.8);
    kit.play('kick', 0.8);
    const fired = startSpy.mock.calls.map((c) => c[0] as string);
    expect(fired).toEqual(['kick-01.wav', 'kick-02.wav', 'kick-01.wav']); // wraps
  });

  it('kickCrash fires both a kick and a crash', async () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    kit.play('kickCrash', 0.9);
    const fired = startSpy.mock.calls.map((c) => c[0] as string);
    expect(fired).toContain('kick-01.wav');
    expect(fired).toContain('crash-01.wav');
  });

  it('no-ops play before ready', () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit'); // not awaited
    kit.play('snare', 0.5);
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('stays not-ready and no-ops if the manifest fetch fails', async () => {
    (globalThis as { fetch: typeof fetch }).fetch = vi
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    expect(kit.isReady()).toBe(false);
    expect(() => kit.play('kick', 1)).not.toThrow();
    expect(startSpy).not.toHaveBeenCalled();
  });

  it('disposes every player', async () => {
    mockFetchOk();
    const kit = new RoundRobinDrumKit(fakeCtx(), 'studio-kit');
    await kit.whenReady();
    expect(() => kit.dispose()).not.toThrow();
    expect(kit.isReady()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run src/__tests__/RoundRobinDrumKit.test.ts`. Expected: FAIL — "Cannot find module '../audio/instruments/RoundRobinDrumKit'".

- [ ] **Step 3: Write the implementation** at `src/audio/instruments/RoundRobinDrumKit.ts`:

```typescript
// src/audio/instruments/RoundRobinDrumKit.ts
import * as Tone from 'tone';
import type { HeadBopDrum } from '../../songs/voices/HeadBopKit';

/** Canonical single-drum names the kit holds samples for. */
type DrumName = 'kick' | 'snare' | 'hat' | 'crash';
const DRUM_NAMES: readonly DrumName[] = ['kick', 'snare', 'hat', 'crash'];

type KitManifest = Partial<Record<DrumName, string[]>>;

/**
 * RoundRobinDrumKit — loads several one-shot WAVs per drum from
 * `samples/drums/<kitId>/` (listed in that folder's `kit.json`) and rotates
 * through a drum's samples on successive hits for natural variation.
 *
 * Loading is async (fetch manifest → build a Tone.Player per sample). Until
 * ready, play() silently no-ops, so a build without the samples (or offline)
 * degrades gracefully rather than throwing.
 */
export class RoundRobinDrumKit {
  private samples = new Map<DrumName, Tone.Player[]>();
  private rrIndex = new Map<DrumName, number>();
  private ready = false;
  private readonly loaded: Promise<void>;
  private dest: AudioNode | null = null;

  constructor(ctx: AudioContext, kitId: string) {
    void ctx; // players own their nodes; ctx kept for signature parity with DrumKit
    this.loaded = this.load(kitId);
  }

  /** Resolves once the manifest + all players have settled (ready or failed). */
  whenReady(): Promise<void> {
    return this.loaded;
  }

  isReady(): boolean {
    return this.ready;
  }

  connect(dest: AudioNode): void {
    this.dest = dest;
    for (const players of this.samples.values()) {
      for (const p of players) p.connect(dest);
    }
  }

  /** Play a (possibly compound) drum at velocity 0–1. No-op until ready. */
  play(drum: HeadBopDrum, velocity: number): void {
    if (!this.ready) return;
    const gainDb = velToDb(Math.max(0, Math.min(1, velocity)));
    if (drum === 'kickCrash') {
      this.fire('kick', gainDb);
      this.fire('crash', gainDb);
      return;
    }
    this.fire(drum, gainDb);
  }

  dispose(): void {
    for (const players of this.samples.values()) {
      for (const p of players) p.dispose();
    }
    this.samples.clear();
    this.rrIndex.clear();
    this.ready = false;
  }

  private async load(kitId: string): Promise<void> {
    const base = `samples/drums/${kitId}/`;
    let manifest: KitManifest;
    try {
      const res = await fetch(`${base}kit.json`);
      if (!res.ok) return;
      manifest = (await res.json()) as KitManifest;
    } catch {
      return; // offline / missing manifest → stay not-ready, play() no-ops
    }

    const loads: Promise<void>[] = [];
    for (const name of DRUM_NAMES) {
      const files = manifest[name];
      if (!files || files.length === 0) continue;
      const players: Tone.Player[] = [];
      for (const file of files) {
        const p = new Tone.Player({ url: `${base}${file}` });
        if (this.dest) p.connect(this.dest);
        players.push(p);
        loads.push(playerLoaded(p));
      }
      this.samples.set(name, players);
      this.rrIndex.set(name, 0);
    }

    await Promise.all(loads);
    this.ready = this.samples.size > 0;
  }

  private fire(name: DrumName, gainDb: number): void {
    const players = this.samples.get(name);
    if (!players || players.length === 0) return;
    const i = this.rrIndex.get(name) ?? 0;
    const p = players[i];
    this.rrIndex.set(name, (i + 1) % players.length);
    p.volume.value = gainDb;
    p.start();
  }
}

/** Resolve when a Tone.Player has loaded (mocks fire onload synchronously). */
function playerLoaded(p: Tone.Player): Promise<void> {
  const loaded = (p as unknown as { loaded?: boolean }).loaded;
  if (loaded) return Promise.resolve();
  return new Promise((resolve) => {
    // Tone.Player exposes a `.loaded` flag and resolves Tone.loaded() globally;
    // a short microtask poll keeps this dependency-light and mock-friendly.
    const check = (): void => {
      if ((p as unknown as { loaded?: boolean }).loaded) resolve();
      else queueMicrotask(check);
    };
    check();
  });
}

/** Map a 0–1 velocity to a dB gain (−24 dB … 0 dB) for Tone.Player.volume. */
function velToDb(v: number): number {
  return -24 + v * 24;
}
```

NOTE on `playerLoaded`: the test mock builds `Tone.Player` and calls `opts.onload?.()` synchronously but does not set a `.loaded` flag, so the microtask poll would never resolve. To keep the implementation testable AND correct against real Tone, change the constructor call to pass an `onload` callback and resolve on it instead of polling `.loaded`. Use this implementation of the load loop and drop `playerLoaded`:

```typescript
      for (const file of files) {
        const done = new Promise<void>((resolve) => {
          const p = new Tone.Player({ url: `${base}${file}`, onload: () => resolve() });
          if (this.dest) p.connect(this.dest);
          players.push(p);
        });
        loads.push(done);
      }
```

This matches the existing `DrumKit` pattern (onload counter) and the test mock (which fires `onload` synchronously). Implement the load loop this way; do not use the `playerLoaded` helper above.

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run src/__tests__/RoundRobinDrumKit.test.ts`. Expected: PASS (6 tests).

- [ ] **Step 5: Type-check** — Run: `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit:**
```bash
git add src/audio/instruments/RoundRobinDrumKit.ts src/__tests__/RoundRobinDrumKit.test.ts
git commit -m "feat(audio): RoundRobinDrumKit — manifest-driven round-robin one-shots"
```

---

## Task 3: Wire Remix PercussionLayer to the studio kit

**Files:**
- Modify: `src/remix/layers/PercussionLayer.ts`
- Modify: `src/__tests__/RemixEngine.test.ts` (Player-count assertions)
- Delete: `src/remix/layers/DrumKit.ts`, `src/__tests__/DrumKit.test.ts`

- [ ] **Step 1: Point PercussionLayer at RoundRobinDrumKit + the studio kit.**

In `src/remix/layers/PercussionLayer.ts`:

Replace the import line:
```typescript
import { DrumKit } from './DrumKit';
```
with:
```typescript
import { RoundRobinDrumKit } from '../../audio/instruments/RoundRobinDrumKit';
```

Replace the field declaration:
```typescript
  private kit: DrumKit;
```
with:
```typescript
  private kit: RoundRobinDrumKit;
```

In the constructor, replace:
```typescript
    this.kit = new DrumKit(ctx, kitId);
```
with:
```typescript
    this.kit = new RoundRobinDrumKit(ctx, kitId);
```

(`isReady()`, `connect()`, `play()`, `dispose()` are all identical in shape, so no other changes are needed in this file.)

- [ ] **Step 2: Point the engine at the new kit folder.** The Remix engine constructs the percussion layer with kit id `'default'`. Change it to `'studio-kit'`.

In `src/remix/RemixEngine.ts`, find:
```typescript
    const percussion = new PercussionLayer(this.ctx, 'default');
```
and replace `'default'` with `'studio-kit'`:
```typescript
    const percussion = new PercussionLayer(this.ctx, 'studio-kit');
```
(If the literal differs, search for `new PercussionLayer(` and update the kit-id argument. Report if not found.)

- [ ] **Step 3: Delete the superseded DrumKit + its test.**
```bash
git rm src/remix/layers/DrumKit.ts src/__tests__/DrumKit.test.ts
```

- [ ] **Step 4: Update RemixEngine.test Player-count assertions.**

The old `DrumKit` synchronously built 4 `Tone.Player`s on construction. `RoundRobinDrumKit` loads players asynchronously from a fetched `kit.json`; under this test's `fetch` mock (which resolves `{ ok, status, arrayBuffer }` with **no `.json()`**), the manifest load rejects, so the kit builds **zero** players and stays not-ready. The stem players (4) are unchanged.

In `src/__tests__/RemixEngine.test.ts`:

Find the test `'creates a synced Tone.Player per stem on load'` and change:
```typescript
    // 4 stems + 4 DrumKit players → 8 Player constructions total.
    expect(PlayerMock.mock.calls.length - callsBefore).toBe(8);
```
to:
```typescript
    // 4 stem players (the round-robin drum kit loads async from a fetched
    // manifest, which this mock's fetch doesn't supply → 0 drum players here).
    expect(PlayerMock.mock.calls.length - callsBefore).toBe(4);
```

Find the test `'sets loop=true on every stem player'`. Its assertion `stemPlayers.length === 4` filters by `loop === true` and is unaffected (drum players would be `loop=false` and there are none here). Update only its comment:
```typescript
    // 4 stem players (loop=true); the round-robin kit adds none under this mock.
    const stemPlayers = created.filter((r) => r.value.loop === true);
    expect(stemPlayers.length).toBe(4);
```

- [ ] **Step 5: Type-check** — Run: `npm run lint`. Expected: PASS (no remaining references to `DrumKit`).

- [ ] **Step 6: Run the affected suites** — Run: `npx vitest run src/__tests__/RemixEngine.test.ts src/__tests__/PercussionLayer.test.ts`. Expected: PASS. (If `PercussionLayer.test.ts` constructed a `DrumKit` indirectly and asserted a specific Player count, update it the same way — report any change you make.)

- [ ] **Step 7: Commit:**
```bash
git add src/remix/layers/PercussionLayer.ts src/remix/RemixEngine.ts src/__tests__/RemixEngine.test.ts
git commit -m "feat(remix): percussion uses RoundRobinDrumKit + committed studio-kit"
```

---

## Task 4: Song Present head-bop — sampled kit with synth fallback

**Files:**
- Modify: `src/songs/SongPresetEngine.ts`

**Context:** Song Present builds a synth `HeadBopKit` lazily and plays it at two sites (the deferred/beat-snapped path and the immediate path). We add a `RoundRobinDrumKit` built on song load, route it through `masterGainNode` (so it's glued by the Phase 0 MasterChain), and at each play site prefer it when `isReady()`, else use the synth kit. The synth path is unchanged, so existing head-bop tests (which never load a song) keep passing.

- [ ] **Step 1: Add the import.** Near the `HeadBopKit` import (`import { HeadBopKit, pickHeadBopDrum } from './voices/HeadBopKit';`), add:
```typescript
import { RoundRobinDrumKit } from '../audio/instruments/RoundRobinDrumKit';
```

- [ ] **Step 2: Add the field.** Next to `private headBopKit: HeadBopKit | null = null;` add:
```typescript
  private headBopSampleKit: RoundRobinDrumKit | null = null;
```

- [ ] **Step 3: Build + connect the sampled kit on song load.** The sampled kit needs `masterGainNode` to exist, so build it right after `buildRouting()` runs in the load path. Find where `buildVoices()` is called inside the load flow (it runs after `buildRouting()`); immediately after that call, add:
```typescript
    // Sampled head-bop kit (glued by the master chain). Falls back to the
    // synth HeadBopKit until/unless these samples are ready.
    this.headBopSampleKit = new RoundRobinDrumKit(this.ctx!, 'studio-kit');
    if (this.masterGainNode) this.headBopSampleKit.connect(this.masterGainNode);
```
If the exact call site is unclear, add these two statements at the end of the method that runs `buildRouting()` then `buildVoices()` (the song-load setup), after both have run and `masterGainNode` is assigned. Report the method/line you chose.

- [ ] **Step 4: Prefer the sampled kit at the deferred play site.** Find:
```typescript
    if (this.headBopPending && currentTime >= this.headBopPending.targetTime) {
      this.headBopKit?.play(this.headBopPending.drum, this.headBopPending.velocity);
      this.headBopPending = null;
```
Replace the inner play line with a sampled-first choice:
```typescript
    if (this.headBopPending && currentTime >= this.headBopPending.targetTime) {
      this.playHeadBopDrum(this.headBopPending.drum, this.headBopPending.velocity);
      this.headBopPending = null;
```

- [ ] **Step 5: Prefer the sampled kit at the immediate play site.** Find:
```typescript
      const drum = pickHeadBopDrum(this.lastUpdateTime, beats, downbeats);
      this.headBopKit.play(drum, velocity);
```
Replace with:
```typescript
      const drum = pickHeadBopDrum(this.lastUpdateTime, beats, downbeats);
      this.playHeadBopDrum(drum, velocity);
```
Note: just above this (the `if (!this.headBopKit) { this.headBopKit = new HeadBopKit(); }` guard) stays — it ensures the synth fallback exists.

- [ ] **Step 6: Add the private chooser method.** Add this method to the class (e.g. just below the head-bop play sites / near other private helpers):
```typescript
  /** Play a head-bop drum: sampled kit when ready, else the synth fallback. */
  private playHeadBopDrum(drum: HeadBopDrum, velocity: number): void {
    if (this.headBopSampleKit?.isReady()) {
      this.headBopSampleKit.play(drum, velocity);
      return;
    }
    if (!this.headBopKit) this.headBopKit = new HeadBopKit();
    this.headBopKit.play(drum, velocity);
  }
```

- [ ] **Step 7: Dispose the sampled kit.** Near `this.headBopKit?.dispose(); this.headBopKit = null;` add:
```typescript
    this.headBopSampleKit?.dispose();
    this.headBopSampleKit = null;
```

- [ ] **Step 8: Type-check** — Run: `npm run lint`. Expected: PASS.

- [ ] **Step 9: Run Song Present tests** — Run: `npx vitest run src/__tests__/SongPresetEngine.headBop.test.ts src/__tests__/SongPresetEngine.walk.test.ts`. Expected: PASS (14/14, unchanged). These never load a song, so `headBopSampleKit` is null and `playHeadBopDrum` uses the synth path — exactly what the tests assert.

- [ ] **Step 10: Commit:**
```bash
git add src/songs/SongPresetEngine.ts
git commit -m "feat(songs): sampled head-bop drums with synth fallback"
```

---

## Task 5: Full regression, build, and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite** — Run: `npm run test:run`. Expected: PASS — all files including the new `RoundRobinDrumKit.test.ts`, minus the deleted `DrumKit.test.ts`. Zero failures.

- [ ] **Step 2: Type-check** — Run: `npm run lint`. Expected: PASS.

- [ ] **Step 3: Production build** — Run: `npm run build`. Expected: success. Confirm `dist/` contains the kit (e.g. `dist/samples/drums/studio-kit/kit.json` and the WAVs) so deployed drums aren't silent.

- [ ] **Step 4: Manual A/B in the running app.** Launch via the `run` skill / `npm run dev`. Verify:
  - **Remix:** enable percussion (head-nod / shake / keyboard `S`) and confirm drums now actually sound (previously silent), with audible round-robin variation across repeated hits, and glued/limited by the Phase 0 master chain.
  - **Song Present:** enable head bopping and confirm the drums sound like real samples (not the thin synth), and that disabling network / before-load still falls back to the synth without silence.
  - Confirm no clicks/pops on rapid hits and gesture-to-sound still feels immediate.

- [ ] **Step 5: Record the result** — note committed kit size, before/after impression per mode, and that deployed `dist/` includes the samples.

---

## Self-Review

**Spec coverage (Phase 1 portion of the spec):**
- Bundle local drums; punchy CC0 kit at `studio-kit/` with correct names + round-robin alternates → Task 1. ✅
- Fix Remix `DrumKit` (silent) → Tasks 1 + 3 (real committed samples + studio-kit id). ✅
- Swap Song Present `HeadBopKit` to samples (with fallback) → Task 4. ✅
- `RoundRobinDrumKit` component in `src/audio/instruments/` → Task 2. ✅
- Graceful fallback (offline/missing samples) → Task 2 (not-ready no-op) + Task 4 (synth fallback). ✅
- Tests with `vi.mock` Tone; full suite stays green → Tasks 2–5. ✅
- Velocity-layered melodic samples, `VelocitySampler`, `SamplerPlayer` local switch, loop graininess → **Phase 2, not here.** ✅

**Placeholder scan:** Concrete URLs (curl-verified), exact code in every code step, exact commands + expected output. The only runtime-discovered values are the optional Step 3 "soulful" filenames, which are explicitly optional and skippable. No TODO/TBD. ✅

**Type consistency:** `RoundRobinDrumKit(ctx, kitId)` exposes `whenReady()`, `isReady()`, `connect(dest)`, `play(drum: HeadBopDrum, velocity)`, `dispose()` — matching the `DrumKit` surface `PercussionLayer` relied on (plus `whenReady` for tests), so Task 3's swap is drop-in. `playHeadBopDrum(drum: HeadBopDrum, velocity: number)` in Task 4 uses the imported `HeadBopDrum` type already in the file. Manifest keys (`kick/snare/hat/crash`) match `DrumName` and the picker's outputs. ✅

**Risk note (flagged, not silent):** Task 3 deletes `DrumKit`/its test and changes two `RemixEngine.test` assertions from 8→4 Player constructions — an expected consequence of async manifest loading under the test's fetch mock, not a regression. The real app loads the kit because `kit.json` is served from `public/`.
