# Audio Overhaul — Phase 2b: All-Sampled Voice Defaults

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Make every Song Present voice play a **real sample by default** (no synth defaults). Today: 🟡 arp = piano (sampled ✓), 🟠 bass = electric (sampled ✓), but 🟢 melody = `celesta` synth and 🔴 chord pad = `warmPad` synth. Bundle a CC0 electric piano + choir pad, and switch the two synth defaults to samples.

**Decisions (from brainstorming):** No clean real Rhodes/pad exists for direct download; bundle the verified **CC0 FreePats** sets (FLAC). Chord-pad default → electric piano (EP); melody default → clarinet (already bundled); choir pad + EP added as selectable presets. **Caveat:** FLAC decodes in Chrome/Firefox/Edge and Safari ≥16.4 — documented in attribution; synth presets remain selectable as fallback.

**Sources (CC0, curl-verified):**
- EP: `raw.githubusercontent.com/freepats/fm-piano1/main/samples/<Note>v100.flac` (FM electric piano). License CC0 (repo LICENSE.txt).
- Pad: `raw.githubusercontent.com/freepats/synth-pad-choir/main/samples/<Note>.flac` (choir pad). License CC0.
- Sharps in source are `#`; rename to `s` (Fs) on download.

**Tech:** TS strict, Tone.js ^15, Vitest. Continues on `feat/audio-overhaul-phase0`.

---

## Task 1: Download + commit the EP + pad (FLAC)

**Files:** `public/samples/instruments/electric-piano/*.flac`, `public/samples/instruments/pad-choir/*.flac`, update `manifest.json` + `ATTRIBUTION.md`.

- [ ] **Step 1: EP — download the v100 velocity layer (12 pitches), renaming `v100`→none and `#`→`s`.**
```bash
mkdir -p public/samples/instruments/electric-piano
EP=https://raw.githubusercontent.com/freepats/fm-piano1/main/samples
# pitches: C2..C7 and F#1..F#6
for n in C2 C3 C4 C5 C6 C7; do curl -fSL -o "public/samples/instruments/electric-piano/$n.flac" "$EP/${n}v100.flac" || echo "skip $n"; done
for n in 1 2 3 4 5 6; do curl -fSL -o "public/samples/instruments/electric-piano/Fs$n.flac" "$EP/F%23${n}v100.flac" || echo "skip Fs$n"; done
```
(`F%23` is the URL-encoded `F#`.)

- [ ] **Step 2: Pad — download (12 pitches: C2..C7, F#2..F#7), `#`→`s`.**
```bash
mkdir -p public/samples/instruments/pad-choir
PD=https://raw.githubusercontent.com/freepats/synth-pad-choir/main/samples
for n in C2 C3 C4 C5 C6 C7; do curl -fSL -o "public/samples/instruments/pad-choir/$n.flac" "$PD/$n.flac" || echo "skip $n"; done
for n in 2 3 4 5 6 7; do curl -fSL -o "public/samples/instruments/pad-choir/Fs$n.flac" "$PD/F%23$n.flac" || echo "skip Fs$n"; done
```

- [ ] **Step 3: Verify real audio (FLAC magic = `fLaC`; size > 5 KB).**
```bash
for f in $(find public/samples/instruments/electric-piano public/samples/instruments/pad-choir -name '*.flac'); do
  sz=$(wc -c < "$f"); hdr=$(head -c 4 "$f"); echo "$f $sz $hdr"; { [ "$sz" -lt 5000 ] || [ "$hdr" != "fLaC" ]; } && echo "BAD $f";
done
```
Delete any BAD file. Each folder must end with ≥ 3 good files (report if not).

- [ ] **Step 4: Regenerate `manifest.json` from disk** (it must now include `.flac` entries too):
```bash
node -e "const fs=require('fs');const root='public/samples/instruments';const out={};for(const d of fs.readdirSync(root)){const p=root+'/'+d;if(fs.statSync(p).isDirectory()){out[d]=fs.readdirSync(p).filter(f=>/\.(mp3|flac)$/.test(f)).map(f=>f.replace(/\.(mp3|flac)$/,'')).sort();}}fs.writeFileSync(root+'/manifest.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out['electric-piano']),JSON.stringify(out['pad-choir']))"
```

- [ ] **Step 5: Append to `ATTRIBUTION.md`:**
```markdown

## Electric piano + pad (CC0, FLAC)
- **electric-piano:** FreePats "FM Synthesized Piano 1" — **CC0 1.0**
  (https://github.com/freepats/fm-piano1). FM electric-piano tone.
- **pad-choir:** FreePats "Synth Pad — Choir" — **CC0 1.0**
  (https://github.com/freepats/synth-pad-choir).
- NOTE: these are FLAC. FLAC decodes in Chrome/Firefox/Edge and Safari ≥16.4.
  On older Safari these voices stay silent (users can pick a synth preset instead).
```

- [ ] **Step 6: Commit.**
```bash
git add public/samples/instruments
git status --short public/samples/instruments | head
du -sh public/samples/instruments
git commit -m "assets(instruments): bundle CC0 electric piano + choir pad (FLAC)"
```
Report sizes + note counts.

---

## Task 2: Add SAMPLE_CONFIGS entries (`.flac`)

**Files:** `src/songs/voices/SamplerPlayer.ts`, `src/__tests__/sampleConfigs.test.ts`.

- [ ] **Step 1: Extend the `noteMap` helper to take an extension.** Change:
```typescript
const noteMap = (notes: readonly string[]): Record<string, string> =>
  Object.fromEntries(notes.map((n) => [n, `${n}.mp3`]));
```
to:
```typescript
const noteMap = (notes: readonly string[], ext = 'mp3'): Record<string, string> =>
  Object.fromEntries(notes.map((n) => [n, `${n}.${ext}`]));
```
(Existing calls keep working — default `mp3`.)

- [ ] **Step 2: Add two configs** to `SAMPLE_CONFIGS` (use the EXACT notes from `manifest.json` Task 1 — adjust if any 404'd):
```typescript
  // Electric piano + pad (FreePats, CC0, FLAC)
  electricPiano:{ urls: noteMap(['C2','Fs1','Fs2','C3','Fs3','C4','Fs4','C5','Fs5','C6','Fs6','C7'], 'flac'), baseUrl: local('electric-piano'), attack: 0.005, release: 0.6 },
  padChoir:     { urls: noteMap(['C2','Fs2','C3','Fs3','C4','Fs4','C5','Fs5','C6','Fs6','C7','Fs7'], 'flac'), baseUrl: local('pad-choir'),     attack: 0.4,   release: 1.2 },
```
(Match the note lists to manifest.json — drop any that didn't download.)

- [ ] **Step 3: Run** `npx vitest run src/__tests__/sampleConfigs.test.ts`. The existing "files exist" + "≥3 notes" tests now cover the two new entries (they reference `.flac` files that exist on disk). Expected PASS. Lint PASS.
- [ ] **Step 4: Commit.**
```bash
git add src/songs/voices/SamplerPlayer.ts
git commit -m "feat(songs): SAMPLE_CONFIGS electricPiano + padChoir (local FLAC)"
```

---

## Task 3: Presets + switch defaults to sampled

**Files:** `src/songs/voices/presets/chordPadPresets.ts`, `melodyPresets.ts`, `src/songs/voices/ChordPadVoice.ts`, `src/songs/voices/MelodicVoice.ts`, `instrumentPalette.ts`, and the preset-count tests.

- [ ] **Step 1: Chord pad — add sampled EP + pad presets, default to EP.** In `chordPadPresets.ts`, add (matching the existing sampled-entry shape, mirroring the `organ` entry):
```typescript
  electricPiano: { kind: 'sampled', name: 'Electric Piano', /* + the other common fields the organ entry has */ sampleKey: 'electricPiano' },
  choirPad:      { kind: 'sampled', name: 'Choir Pad', /* + common fields */ sampleKey: 'padChoir' },
```
(Read the `organ` entry first and copy its non-sampleKey fields/shape exactly.) Then in `ChordPadVoice.ts`, change the default `PAD_PRESETS['warmPad']` → `PAD_PRESETS['electricPiano']`.

- [ ] **Step 2: Melody — add EP option, default to clarinet.** `MelodicVoice.ts` default `MELODY_PRESETS['celesta']` → `MELODY_PRESETS['clarinet']` (clarinet is already a sampled entry — verify it exists in `melodyPresets.ts`; if the sampled key is named differently, use that). Optionally add an `electricPiano` sampled entry to `melodyPresets.ts` as a selectable option (same shape as its other sampled entries).

- [ ] **Step 3: instrumentPalette — upgrade the `electricPiano` entry.** It currently fakes EP with `sampleKey: 'organ'`. Change its `sampleKey` to `'electricPiano'` and update its `name`/`source`/`notes` to the real EP (CC0 FreePats). Keep other fields.

- [ ] **Step 4: Update preset-count tests.** `presetCatalogs.test.ts` likely asserts exact counts for chord-pad (and maybe melody) catalogs. Bump them to match the added presets. Run `npx vitest run src/__tests__/presetCatalogs.test.ts src/__tests__/instrumentPalette.test.ts` and fix any name/key expectations; report changes.
- [ ] **Step 5: Lint PASS. Commit.**
```bash
git add src/songs/voices/presets/chordPadPresets.ts src/songs/voices/presets/melodyPresets.ts src/songs/voices/ChordPadVoice.ts src/songs/voices/MelodicVoice.ts src/songs/voices/presets/instrumentPalette.ts src/__tests__/presetCatalogs.test.ts
git commit -m "feat(songs): all voice defaults are real samples (EP chord pad, clarinet melody)"
```

---

## Task 4: Regression + build + verify

- [ ] **Step 1:** `npm run test:run` → all pass.
- [ ] **Step 2:** `npm run lint` → pass.
- [ ] **Step 3:** `npm run build` → success; confirm `dist/samples/instruments/electric-piano/` + `pad-choir/` ship.
- [ ] **Step 4: Manual:** in Song Present, the red chord-pad voice plays a real electric piano and the green melody plays a real clarinet by default (in a FLAC-capable browser); confirm no silent voices, and that switching presets still works.

---

## Self-Review
- Goal (all defaults sampled) → Tasks 2–3. ✅
- FLAC caveat documented (Task 1 Step 5). ✅
- noteMap extension change is backward-compatible (default mp3). ✅
- Densifying violin/harp is impossible (source has no infill) — explicitly dropped, not silently skipped. ✅
- Risk: FLAC browser support — mitigated by keeping synth presets selectable; flagged to the user.
