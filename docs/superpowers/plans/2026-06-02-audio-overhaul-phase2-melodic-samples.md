# Audio Overhaul — Phase 2: Localized Melodic Samples + Real Bass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Song Present's melodic instruments real and reliable — bundle the CC-BY instrument samples locally (offline, no CDN 404s), **densify** them (more sample points = less pitch-stretch), add a **real multi-note electric bass** to replace the single-note "rubber-bandy" contrabass, give `SamplerPlayer` gentle velocity→brightness expression, and fix Remix **loop graininess**.

**Architecture:** The voice→player path is already uniform: every voice's preset is `{ kind: 'sampled', sampleKey }` or `{ kind: 'synth', synthConfig }`, and `createPlayer()` builds `new SamplerPlayer(SAMPLE_CONFIGS[sampleKey], filterNode)`. So localizing is a one-file change to `SAMPLE_CONFIGS` base URLs + denser note maps, plus committing the audio under `public/samples/instruments/`. A new `bassElectric` sample config + bass presets introduce the real bass with no structural change. `SamplerPlayer` gains an internal velocity-mapped lowpass for expression. `LoopLayer` uses a plain `Tone.Player` when no time-stretch is needed (playbackRate ≈ 1), avoiding granular transient smearing.

**Tech Stack:** TypeScript (strict, no `any`, `noUnusedLocals`), Tone.js ^15.1.22, Vite, Vitest (jsdom, `vi.mock('tone')` with `vi.hoisted` spies).

**Spec:** `docs/superpowers/specs/2026-06-02-song-remix-audio-overhaul-design.md`
**Builds on:** Phases 0–1 (`feat/audio-overhaul-phase0`). Continues on the same branch.

**Decisions (from brainstorming):**
- **Pragmatic real samples** (no transcode pipeline — `ffmpeg` unavailable; web bundle limits; gesture users' narrow dynamic range). Single-velocity mp3, localized + densified.
- **No standalone `VelocitySampler`** — it would duplicate existing behavior (Tone.Sampler already maps velocity→amplitude; InstrumentVoice already maps velocity→brightness). Instead, fold a gentle, tunable velocity→brightness into `SamplerPlayer` so *all* sampled voices get expression.
- Sources: **Salamander Grand Piano** (CC-BY 3.0) for piano; **nbrosowsky/tonejs-instruments** (CC-BY 3.0) for strings/winds/keys and the **electric bass**. All curl-verified, mp3, directly downloadable. Commit with attribution.

**Out of scope (noted, not done here):** true multi-velocity layers; committing CC0 loop *audio* (only the loop-graininess *code* fix is here); deep synth-voice redesign (the Phase 0 master chain already warms synths).

---

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `public/samples/instruments/<name>/*.mp3` | Create (download) | Committed CC-BY instrument samples (piano, violin, cello, contrabass, clarinet, french-horn, tuba, harp, guitar-nylon, organ, bass-electric). |
| `public/samples/instruments/ATTRIBUTION.md` | Create | CC-BY credits + source URLs. |
| `public/samples/instruments/manifest.json` | Create | Record of which `<note>.mp3` files exist per instrument (drives the test + the config maps). |
| `src/songs/voices/SamplerPlayer.ts` | Modify | Point `SAMPLE_CONFIGS` base URLs at local paths; densify note maps; add `bassElectric`; add gentle velocity→brightness lowpass. |
| `src/__tests__/sampleConfigs.test.ts` | Create | Assert every file referenced by `SAMPLE_CONFIGS` exists under `public/samples/instruments/`. |
| `src/songs/voices/presets/bassPresets.ts` | Modify | Add a sampled `electric` (real) bass preset; make it the default. |
| `src/songs/voices/presets/instrumentPalette.ts` | Modify | Point the `bass` palette entry at the new `bassElectric` sample. |
| `src/remix/layers/LoopLayer.ts` | Modify | Use `Tone.Player` (not `GrainPlayer`) when `|playbackRate − 1|` is below a threshold; tune grain settings otherwise. |
| `src/__tests__/LoopLayer.test.ts` | Modify | Cover the Player-vs-GrainPlayer selection. |

---

## Task 1: Download + commit localized/densified instrument samples

**Files:** `public/samples/instruments/**`

No automated test here — verification is "files exist, are real audio, and `manifest.json` matches disk."

- [ ] **Step 1: Define the targets.** Download mp3 samples into `public/samples/instruments/<name>/` for these instruments, using these sources (curl-verified, no auth):
  - **piano** ← `https://tonejs.github.io/audio/salamander/<note>.mp3` (Salamander, CC-BY 3.0).
  - **violin, cello, contrabass, clarinet, french-horn, tuba, harp, guitar-nylon, organ, bass-electric** ← `https://nbrosowsky.github.io/tonejs-instruments/samples/<instrument>/<note>.mp3` (CC-BY 3.0).

  Note naming uses `s` for sharps (e.g. `As2.mp3`, `Cs4.mp3`, `Ds4.mp3`, `Fs3.mp3`, `Gs3.mp3`).

  Target note sets (densified — every ~3–4 semitones; these are *targets*, skip any that 404):

  | folder | target notes |
  |---|---|
  | `piano` | C2 Fs2 C3 Fs3 C4 Fs4 C5 Fs5 C6 |
  | `violin` | G3 As3 Cs4 E4 G4 As4 Cs5 E5 |
  | `cello` | C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 |
  | `contrabass` | E1 G1 A1 C2 E2 G2 A2 C3 |
  | `clarinet` | D3 Fs3 As3 D4 Fs4 As4 D5 |
  | `french-horn` | A2 C3 E3 G3 A3 C4 E4 |
  | `tuba` | As1 D2 F2 As2 D3 F3 |
  | `harp` | C3 G3 C4 G4 C5 G5 |
  | `guitar-nylon` | E2 A2 D3 G3 B3 E4 A4 |
  | `organ` | C2 C3 C4 C5 |
  | `bass-electric` | E1 G1 As1 Cs2 E2 G2 As2 Cs3 E3 |

- [ ] **Step 2: Download with verify, skipping 404s.** For each folder, `curl -fSL -o public/samples/instruments/<folder>/<note>.mp3 "<base>/<note>.mp3"`. Use `-f` so a 404 writes no file. Example for one folder:
```bash
mkdir -p public/samples/instruments/piano
for n in C2 Fs2 C3 Fs3 C4 Fs4 C5 Fs5 C6; do
  curl -fSL -o "public/samples/instruments/piano/$n.mp3" "https://tonejs.github.io/audio/salamander/$n.mp3" || echo "skip piano/$n"
done
mkdir -p public/samples/instruments/violin
for n in G3 As3 Cs4 E4 G4 As4 Cs5 E5; do
  curl -fSL -o "public/samples/instruments/violin/$n.mp3" "https://nbrosowsky.github.io/tonejs-instruments/samples/violin/$n.mp3" || echo "skip violin/$n"
done
# …repeat per the table for cello, contrabass, clarinet, french-horn, tuba, harp, guitar-nylon, organ, bass-electric.
```
**Every instrument folder must end with at least 3 successfully-downloaded notes** (Tone.Sampler needs enough points to cover the range). If a folder has fewer than 3, widen the target list for that instrument (try adjacent notes) until it has ≥3. Report any instrument that can't reach 3.

- [ ] **Step 3: Verify each file is real audio.**
```bash
for f in $(find public/samples/instruments -name '*.mp3'); do
  sz=$(wc -c < "$f"); echo "$f bytes=$sz"; [ "$sz" -lt 2000 ] && echo "BAD: $f"
done
```
Delete any "BAD" (truncated) file. mp3 has no single magic-byte check as simple as RIFF, so rely on size (> 2 KB) + the fact that `curl -f` only writes on HTTP 200.

- [ ] **Step 4: Write `public/samples/instruments/manifest.json`** listing exactly the notes that landed per folder:
```json
{
  "piano": ["C2","Fs2","C3","Fs3","C4","Fs4","C5","Fs5","C6"],
  "violin": ["G3","As3","Cs4","E4","G4","As4","Cs5","E5"],
  "...": ["..."]
}
```
Generate it from disk so it can't drift:
```bash
node -e "const fs=require('fs');const root='public/samples/instruments';const out={};for(const d of fs.readdirSync(root)){const p=root+'/'+d;if(fs.statSync(p).isDirectory()){out[d]=fs.readdirSync(p).filter(f=>f.endsWith('.mp3')).map(f=>f.replace('.mp3','')).sort();}}fs.writeFileSync(root+'/manifest.json',JSON.stringify(out,null,2));console.log(out)"
```

- [ ] **Step 5: Write `public/samples/instruments/ATTRIBUTION.md`:**
```markdown
# Instrument samples — attribution

Bundled locally so Song Present works offline with no CDN dependency.

- **Piano:** Salamander Grand Piano V3 by Alexander Holm — **CC-BY 3.0**
  (https://creativecommons.org/licenses/by/3.0/). Subset via tonejs.github.io/audio/salamander.
- **violin, cello, contrabass, clarinet, french-horn, tuba, harp, guitar-nylon, organ,
  bass-electric:** nbrosowsky/tonejs-instruments — **CC-BY 3.0**
  (https://github.com/nbrosowsky/tonejs-instruments, https://creativecommons.org/licenses/by/3.0/).
```

- [ ] **Step 6: Commit** (these paths are not git-ignored — `public/samples/instruments/` has no ignore rule):
```bash
git add public/samples/instruments
git status --short public/samples/instruments | head    # confirm mp3s + manifest.json + ATTRIBUTION.md staged
du -sh public/samples/instruments
git commit -m "assets(instruments): bundle CC-BY instrument samples locally (densified) + electric bass"
```
Report total size (`du -sh`) and the per-folder note counts.

---

## Task 2: Point SAMPLE_CONFIGS at local samples + add electric bass

**Files:**
- Modify: `src/songs/voices/SamplerPlayer.ts`
- Test: `src/__tests__/sampleConfigs.test.ts`

- [ ] **Step 1: Write the failing test** at `src/__tests__/sampleConfigs.test.ts` (no Tone needed — pure data + fs):

```typescript
// src/__tests__/sampleConfigs.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_CONFIGS } from '../songs/voices/SamplerPlayer';

const PUBLIC = join(process.cwd(), 'public');

describe('SAMPLE_CONFIGS', () => {
  it('every referenced sample resolves to a committed local file', () => {
    const missing: string[] = [];
    for (const [key, cfg] of Object.entries(SAMPLE_CONFIGS)) {
      // base URLs are app-relative (served from public/), e.g. "samples/instruments/piano/"
      expect(cfg.baseUrl.startsWith('samples/')).toBe(true);
      for (const file of Object.values(cfg.urls)) {
        const path = join(PUBLIC, cfg.baseUrl, file);
        if (!existsSync(path)) missing.push(`${key}: ${cfg.baseUrl}${file}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every instrument has at least 3 sample points (range coverage)', () => {
    for (const [key, cfg] of Object.entries(SAMPLE_CONFIGS)) {
      expect(Object.keys(cfg.urls).length, key).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (configs still point at CDN `https://…`, so `baseUrl.startsWith('samples/')` is false): `npx vitest run src/__tests__/sampleConfigs.test.ts`.

- [ ] **Step 3: Rewrite the base URLs + note maps in `SamplerPlayer.ts`.** Replace the "CDN base URLs" and "Shared note URL maps" and "Per-instrument sample configs" sections so that:
  - Base URLs are local, app-relative: `samples/instruments/<folder>/`.
  - Each instrument's `urls` map lists **exactly the notes in `manifest.json`** from Task 1 (read the committed `public/samples/instruments/manifest.json` and transcribe). Each entry maps the Tone note name → `"<note>.mp3"` (e.g. `{ C4: 'C4.mp3', Fs4: 'Fs4.mp3', … }`).
  - Add a new `bassElectric` entry using the `bass-electric` folder's notes.
  - Keep the old CDN constants in a comment for provenance.

Concretely, replace the block from `// CDN base URLs` through the end of `SAMPLE_CONFIGS` with local equivalents. Example shape (fill the maps from `manifest.json`):

```typescript
// Samples are bundled locally under public/samples/instruments/ (CC-BY 3.0;
// see ATTRIBUTION.md). Previously streamed from:
//   Salamander  https://tonejs.github.io/audio/salamander/
//   nbrosowsky  https://nbrosowsky.github.io/tonejs-instruments/samples/<inst>/
const local = (folder: string): string => `samples/instruments/${folder}/`;

// Build a urls map from a list of note names: ['C4','Fs4'] → { C4:'C4.mp3', Fs4:'Fs4.mp3' }
const noteMap = (notes: readonly string[]): Record<string, string> =>
  Object.fromEntries(notes.map((n) => [n, `${n}.mp3`]));

export const SAMPLE_CONFIGS = {
  piano:       { urls: noteMap(['C2','Fs2','C3','Fs3','C4','Fs4','C5','Fs5','C6']), baseUrl: local('piano'),         attack: 0.005, release: 1.5 },
  violin:      { urls: noteMap(['G3','As3','Cs4','E4','G4','As4','Cs5','E5']),      baseUrl: local('violin'),        attack: 0.1,   release: 0.4 },
  cello:       { urls: noteMap(['C2','Ds2','Fs2','A2','C3','Ds3','Fs3','A3','C4']), baseUrl: local('cello'),         attack: 0.15,  release: 0.5 },
  contrabass:  { urls: noteMap(['E1','G1','A1','C2','E2','G2','A2','C3']),          baseUrl: local('contrabass'),    attack: 0.05,  release: 0.4 },
  clarinet:    { urls: noteMap(['D3','Fs3','As3','D4','Fs4','As4','D5']),           baseUrl: local('clarinet'),      attack: 0.08,  release: 0.3 },
  frenchHorn:  { urls: noteMap(['A2','C3','E3','G3','A3','C4','E4']),               baseUrl: local('french-horn'),   attack: 0.1,   release: 0.4 },
  tuba:        { urls: noteMap(['As1','D2','F2','As2','D3','F3']),                  baseUrl: local('tuba'),          attack: 0.08,  release: 0.4 },
  harp:        { urls: noteMap(['C3','G3','C4','G4','C5','G5']),                    baseUrl: local('harp'),          attack: 0.005, release: 0.8 },
  guitarNylon: { urls: noteMap(['E2','A2','D3','G3','B3','E4','A4']),               baseUrl: local('guitar-nylon'),  attack: 0.005, release: 0.3 },
  organ:       { urls: noteMap(['C2','C3','C4','C5']),                              baseUrl: local('organ'),         attack: 0.01,  release: 0.3 },
  bassElectric:{ urls: noteMap(['E1','G1','As1','Cs2','E2','G2','As2','Cs3','E3']), baseUrl: local('bass-electric'), attack: 0.008, release: 0.25 },
} as const satisfies Record<string, SamplerPlayerOptions>;
```
**Critical:** each `noteMap([...])` list MUST contain only notes that actually downloaded (check `manifest.json`). If a target note 404'd in Task 1, drop it from the list here so the test passes.

- [ ] **Step 4: Run the test — expect PASS** (every referenced file now exists locally; each instrument ≥3 notes): `npx vitest run src/__tests__/sampleConfigs.test.ts`.

- [ ] **Step 5: Type-check** — `npm run lint`. Expected: PASS. (The `SampleConfigKey` union now includes `bassElectric`; later tasks reference it.)

- [ ] **Step 6: Commit:**
```bash
git add src/songs/voices/SamplerPlayer.ts src/__tests__/sampleConfigs.test.ts
git commit -m "feat(songs): localize + densify instrument SAMPLE_CONFIGS; add bassElectric"
```

---

## Task 3: Velocity→brightness in SamplerPlayer

**Files:**
- Modify: `src/songs/voices/SamplerPlayer.ts`
- Test: `src/__tests__/SamplerPlayer.test.ts` (create)

Gives every sampled voice gentle dynamic expression: louder gestures open a lowpass, softer gestures are a touch darker — kept subtle so quiet gestures never sound muddy (accessibility: narrow dynamic range).

- [ ] **Step 1: Write the failing test** at `src/__tests__/SamplerPlayer.test.ts`:

```typescript
// src/__tests__/SamplerPlayer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { setTargetSpy } = vi.hoisted(() => ({ setTargetSpy: vi.fn() }));

vi.mock('tone', () => {
  const Sampler = vi.fn().mockImplementation((opts: { onload?: () => void }) => {
    opts.onload?.();
    return {
      connect: vi.fn(),
      triggerAttackRelease: vi.fn(),
      triggerAttack: vi.fn(),
      releaseAll: vi.fn(),
      dispose: vi.fn(),
    };
  });
  return {
    Sampler,
    Frequency: vi.fn(() => ({ toNote: () => 'C4' })),
    now: vi.fn(() => 0),
    connect: vi.fn(),
  };
});

import { SamplerPlayer } from '../songs/voices/SamplerPlayer';

function fakeParam() {
  return { value: 0, setTargetAtTime: setTargetSpy };
}
function fakeFilter() {
  return { type: 'lowpass', frequency: fakeParam(), Q: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
}
function fakeCtx(): AudioContext {
  return { createBiquadFilter: vi.fn(() => fakeFilter()) } as unknown as AudioContext;
}
function fakeDest() {
  return { context: fakeCtx() } as unknown as AudioNode;
}

beforeEach(() => vi.clearAllMocks());

describe('SamplerPlayer velocity→brightness', () => {
  it('opens the lowpass further for higher velocity', () => {
    const p = new SamplerPlayer(
      { urls: { C4: 'C4.mp3' }, baseUrl: 'samples/instruments/piano/' },
      fakeDest(),
    );
    p.triggerAttackRelease(60, 0.5, 0, 0.2); // soft
    const softCutoff = setTargetSpy.mock.calls.at(-1)?.[0] as number;
    p.triggerAttackRelease(60, 0.5, 0, 1.0); // hard
    const hardCutoff = setTargetSpy.mock.calls.at(-1)?.[0] as number;
    expect(hardCutoff).toBeGreaterThan(softCutoff);
  });

  it('keeps even the softest cutoff musically open (not muddy)', () => {
    const p = new SamplerPlayer(
      { urls: { C4: 'C4.mp3' }, baseUrl: 'samples/instruments/piano/' },
      fakeDest(),
    );
    p.triggerAttackRelease(60, 0.5, 0, 0); // softest possible
    const cutoff = setTargetSpy.mock.calls.at(-1)?.[0] as number;
    expect(cutoff).toBeGreaterThanOrEqual(2000); // floor keeps it from going dull
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (no internal filter yet): `npx vitest run src/__tests__/SamplerPlayer.test.ts`.

- [ ] **Step 3: Add a velocity-mapped lowpass inside `SamplerPlayer`.** Insert an internal `BiquadFilterNode` between the Tone.Sampler and `destination`, and set its cutoff per trigger from velocity. Modify the class:

```typescript
// add near the top of the class body
  private velFilter: BiquadFilterNode;

  constructor(opts: SamplerPlayerOptions, destination: AudioNode) {
    const ctx = destination.context as AudioContext;
    this.velFilter = ctx.createBiquadFilter();
    this.velFilter.type = 'lowpass';
    this.velFilter.frequency.value = VEL_BRIGHTNESS.max;
    this.velFilter.Q.value = 0.5;
    this.velFilter.connect(destination);

    this.sampler = new Tone.Sampler({
      urls: opts.urls,
      baseUrl: opts.baseUrl,
      attack: opts.attack ?? 0.005,
      release: opts.release ?? 0.3,
      onload: () => { this.ready = true; },
    });
    this.sampler.connect(this.velFilter);
  }

  private applyVelocityBrightness(velocity: number, time: number): void {
    const v = Math.max(0, Math.min(1, velocity));
    const hz = VEL_BRIGHTNESS.min + v * (VEL_BRIGHTNESS.max - VEL_BRIGHTNESS.min);
    this.velFilter.frequency.setTargetAtTime(hz, time, 0.01);
  }
```
Call `applyVelocityBrightness(velocity, time)` at the start of both `triggerAttackRelease` and `triggerAttack` (use `time ?? Tone.now()` / `Tone.now()` respectively, matching the existing time argument). In `dispose()`, also `this.velFilter.disconnect()`. Add the tunable constant near the top of the file:

```typescript
/** Velocity→brightness lowpass range (Hz). Floor stays open so soft gestures
 *  aren't muddy — important for users with a narrow dynamic range. */
const VEL_BRIGHTNESS = { min: 3000, max: 16000 } as const;
```

- [ ] **Step 4: Run the test — expect PASS** (2 tests): `npx vitest run src/__tests__/SamplerPlayer.test.ts`.

- [ ] **Step 5: Type-check** — `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit:**
```bash
git add src/songs/voices/SamplerPlayer.ts src/__tests__/SamplerPlayer.test.ts
git commit -m "feat(songs): gentle velocity→brightness on SamplerPlayer (accessible floor)"
```

---

## Task 4: Real electric bass as the default bass

**Files:**
- Modify: `src/songs/voices/presets/bassPresets.ts`
- Modify: `src/songs/voices/presets/instrumentPalette.ts`

- [ ] **Step 1: Inspect `bassPresets.ts`.** Read it to confirm the preset shape (a discriminated union with `kind: 'sampled' | 'synth'`, `name`, `duration`, and `sampleKey` for sampled). The current default is `BASS_PRESETS['upright']` (sampled `contrabass`). Report the exact object shape before editing.

- [ ] **Step 2: Add a sampled electric-bass preset.** In `bassPresets.ts`, add an entry to the presets object (match the existing sampled-entry shape exactly — e.g. mirror the `upright` entry but with `sampleKey: 'bassElectric'`):
```typescript
  electric: {
    kind: 'sampled',
    name: 'Electric Bass',
    duration: 0.5,
    sampleKey: 'bassElectric',
  },
```
NOTE: there is already a synth `electric` preset key in this catalog. **Do not collide.** Rename the existing synth one to `electricSynth` (update any references to `'electric'` that pointed at the synth — search the repo) OR name the new sampled one `electricSampled`. Pick whichever causes fewer external edits; report which you chose and every reference you updated. The default bass should become the **sampled** electric bass.

- [ ] **Step 3: Make the sampled electric bass the default.** Change the default-preset assignment (currently `BASS_PRESETS['upright']`) in `BassSynthVoice.ts` to the new sampled electric key. Confirm `bassElectric` exists in `SAMPLE_CONFIGS` (added in Task 2) so `createPlayer()` resolves it.

- [ ] **Step 4: Upgrade the `bass` palette entry.** In `instrumentPalette.ts`, change the `bass` entry's `sampleKey` from `'contrabass'` to `'bassElectric'`, update its `name`/`source`/`notes` accordingly (multi-note electric bass, no longer a single pitch-shifted A2). Keep the other fields (duration, velocityRange, brightnessBoostHz) unless they obviously need adjusting for the new sample.

- [ ] **Step 5: Type-check** — `npm run lint`. Expected: PASS (the `SampleConfigKey` union includes `bassElectric`; no dangling `'electric'` collisions).

- [ ] **Step 6: Run the Song Present + preset suites** — `npx vitest run src/__tests__/presetCatalogs.test.ts src/__tests__/instrumentPalette.test.ts src/__tests__/SongPresetEngine.walk.test.ts`. Expected: PASS. If `presetCatalogs.test.ts` enumerates bass preset keys, update it to match the rename — report any change.

- [ ] **Step 7: Commit:**
```bash
git add src/songs/voices/presets/bassPresets.ts src/songs/voices/presets/instrumentPalette.ts src/songs/voices/BassSynthVoice.ts
git commit -m "feat(songs): real sampled electric bass as default (replaces 1-note contrabass)"
```

---

## Task 5: Remix loop graininess — plain Player when no stretch needed

**Files:**
- Modify: `src/remix/layers/LoopLayer.ts`
- Test: `src/__tests__/LoopLayer.test.ts`

`GrainPlayer` granulates audio even at playbackRate ≈ 1, smearing drum transients. The curated loops sit near the song tempo, so most need little/no stretch. Use a plain `Tone.Player` (no granulation) when `|rate − 1|` is within a small threshold; keep `GrainPlayer` (pitch-preserving) only when a real stretch is needed.

- [ ] **Step 1: Read `LoopLayer.test.ts`** to learn how it mocks `Tone.GrainPlayer`/`Tone.Player` and what it asserts. Report the current mock shape.

- [ ] **Step 2: Write a failing test** asserting selection by stretch ratio. Add to `LoopLayer.test.ts` (adapt names to the existing mock):
```typescript
  it('uses a plain Player when the loop tempo matches the song (no stretch)', () => {
    // loop bpm == song bpm → rate 1.0 → plain Tone.Player (no granular smear)
    const layer = new LoopLayer(fakeCtx(), [{ file: 'a_120bpm.wav', name: 'A', bpm: 120 }], 120);
    expect(PlayerMock).toHaveBeenCalled();
    expect(GrainPlayerMock).not.toHaveBeenCalled();
    layer.dispose();
  });

  it('uses a GrainPlayer when the loop must be time-stretched', () => {
    const layer = new LoopLayer(fakeCtx(), [{ file: 'b_90bpm.wav', name: 'B', bpm: 90 }], 120);
    expect(GrainPlayerMock).toHaveBeenCalled();
    layer.dispose();
  });
```
(Ensure the mock exposes both `Player` and `GrainPlayer` constructors as spies named `PlayerMock`/`GrainPlayerMock`; add whichever is missing, mirroring the existing one.)

- [ ] **Step 3: Run — expect FAIL** (LoopLayer always builds GrainPlayer): `npx vitest run src/__tests__/LoopLayer.test.ts`.

- [ ] **Step 4: Implement stretch-aware voice construction.** In `LoopLayer`'s constructor loop, compute `rate = songBpm / def.bpm` and pick the player type:
```typescript
const STRETCH_DEADZONE = 0.02; // |rate−1| below this → no audible stretch, skip granulation

      const rate = songBpm / def.bpm;
      const needsStretch = Math.abs(rate - 1) > STRETCH_DEADZONE;
      const player = needsStretch
        ? new Tone.GrainPlayer({
            url: `samples/drums/loops/${def.file}`,
            loop: true,
            grainSize: 0.2,
            overlap: 0.1,
            onload: () => { this.loaded += 1; if (this.loaded >= loops.length) this.ready = true; },
          })
        : new Tone.Player({
            url: `samples/drums/loops/${def.file}`,
            loop: true,
            onload: () => { this.loaded += 1; if (this.loaded >= loops.length) this.ready = true; },
          });
      player.playbackRate = rate;
      player.connect(sub);
      this.voices.push({ player, sub });
```
Update the `LoopVoice` interface's `player` type to `Tone.GrainPlayer | Tone.Player` and confirm every method used on it (`playbackRate`, `loop`, `connect`, `unsync`, `sync`, `start`, `stop`, `dispose`) exists on both (they do — both extend `Tone.Source`/`Player`). Define `STRETCH_DEADZONE` near the other module constants.

- [ ] **Step 5: Run the test — expect PASS**: `npx vitest run src/__tests__/LoopLayer.test.ts`.

- [ ] **Step 6: Type-check** — `npm run lint`. Expected: PASS.

- [ ] **Step 7: Commit:**
```bash
git add src/remix/layers/LoopLayer.ts src/__tests__/LoopLayer.test.ts
git commit -m "fix(remix): plain Player for unstretched loops (no granular transient smear)"
```

---

## Task 6: Full regression, build, and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite** — `npm run test:run`. Expected: PASS (all files incl. new `sampleConfigs.test.ts`, `SamplerPlayer.test.ts`). Zero failures.
- [ ] **Step 2: Type-check** — `npm run lint`. Expected: PASS.
- [ ] **Step 3: Production build** — `npm run build`. Expected: success; confirm `dist/samples/instruments/` contains the committed mp3s + `manifest.json` (so deployed Song Present is offline-safe).
- [ ] **Step 4: Manual A/B (run skill / `npm run dev`).**
  - **Song Present:** instruments load with no network (DevTools offline) — piano/strings/bass sound real and reliable; the **bass** sounds like a real electric bass across its range (not rubber-bandy); louder gestures are a touch brighter; nothing muddy on soft gestures.
  - **Remix:** loops near the song tempo sound tight (no granular smear); a deliberately off-tempo loop still time-stretches cleanly.
  - Confirm gesture-to-sound latency still feels immediate and the Phase 0 master glue + Phase 1 drums are intact.
- [ ] **Step 5: Record the result** — bundle size delta (`du -sh public/samples/instruments`), per-instrument note counts, and before/after impressions.

---

## Self-Review

**Spec coverage (Phase 2 portion):**
- Bundle curated local instrument samples; switch `SamplerPlayer` CDN→local → Tasks 1–2. ✅
- Real sampled bass replacing the weak synth/1-note bass → Tasks 1–4. ✅
- Velocity→dynamics on samples (folded into `SamplerPlayer`, no redundant class) → Task 3. ✅
- Reduce Remix loop graininess (plain Player when rate≈1) → Task 5. ✅
- True multi-velocity layers / transcode pipeline → **out of scope** (no ffmpeg; pragmatic decision). ✅
- Deep synth-voice redesign → out of scope (Phase 0 master chain warms synths). ✅

**Placeholder scan:** Concrete sources/URLs, exact code per step, exact commands + expected results. The note maps are *targets* that Task 1 verifies and Task 2 transcribes from the on-disk `manifest.json` — the `sampleConfigs.test.ts` test enforces map↔file agreement, so a 404'd note can't slip through as a broken reference. No TODO/TBD.

**Type consistency:** `SAMPLE_CONFIGS` stays `Record<string, SamplerPlayerOptions>`; new key `bassElectric` flows into `SampleConfigKey` and is referenced by Task 4's preset/palette. `SamplerPlayer`'s public methods (`triggerAttackRelease`, `triggerAttack`, `releaseAll`, `dispose`, `isReady`) are unchanged; only internals add `velFilter`. `LoopVoice.player` widens to `Tone.GrainPlayer | Tone.Player`.

**Risks flagged (not silent):**
- Task 4's `electric` key collision (existing synth vs new sampled) — the plan calls for an explicit rename with a repo-wide reference sweep, reported by the implementer.
- Densified note maps must match downloaded files exactly — enforced by `sampleConfigs.test.ts`.
