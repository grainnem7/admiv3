# More sampled instruments (stage 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight more real instruments (flute, saxophone, trumpet, trombone, bassoon, xylophone, acoustic guitar, electric guitar) can be chosen for a colour, heard with ▶ Hear and played on the board, with the samples credited.

**Architecture:** The samples are bundled like the existing ones: mp3 files under `public/samples/instruments/<folder>/`, one `SAMPLE_CONFIGS` entry each (which `BoardSequencerVoice` already plays by key), listed in `manifest.json` and credited in `ATTRIBUTION.md`. The sound catalogue offers them per job, now in named groups, shown as `<optgroup>`s in the table's "Sounds like" list. In Ableton mode each follows the World's chain until the Ableton plan (docs/superpowers/specs/2026-10-27-ableton-every-sound-design.md) gives it its own.

**Tech Stack:** React 19, TypeScript strict, Tone.js Sampler, Vitest + jsdom, Playwright.

**Spec:** docs/superpowers/specs/2026-10-26-board-setup-and-sounds-design.md ("More sounds", stage 4).

## Global Constraints

- Source: nbrosowsky/tonejs-instruments, samples CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/), pinned to commit `622c2f1c32c8cfce4158ddc3eb26e518ddef37e5`. mp3 files only, as the other nbrosowsky sets.
- The repository is public: these files are redistributable under CC-BY 3.0, so they are committed (like the existing instrument samples, unlike the drum kits).
- A saved player's existing picks keep their meaning; no stored key changes.
- The Ableton side is the next plan's: this plan does not change `ABLETON_CHAINS`.
- Plain names in everything the user sees.

## Decisions (the builder's, per the spec's "Left to the builder")

| Key | Folder | Notes bundled | attack / release | Name | Jobs |
|---|---|---|---|---|---|
| `flute` | flute | C4 E4 A4 C5 E5 A5 C6 E6 | 0.05 / 0.4 | Flute | Melody |
| `saxophone` | saxophone | Cs3 F3 Gs3 C4 E4 Gs4 C5 E5 A5 | 0.03 / 0.35 | Saxophone | Melody |
| `trumpet` | trumpet | F3 A3 C4 Ds4 G4 As4 D5 F5 A5 C6 | 0.03 / 0.35 | Trumpet | Melody |
| `trombone` | trombone | As1 Ds2 Gs2 C3 F3 As3 D4 F4 | 0.05 / 0.4 | Trombone | Bass |
| `bassoon` | bassoon | G2 A2 C3 G3 A3 C4 E4 G4 A4 C5 | 0.05 / 0.35 | Bassoon | Bass |
| `xylophone` | xylophone | G4 C5 G5 C6 G6 C7 G7 C8 | 0.002 / 0.6 | Xylophone | Melody |
| `guitarAcoustic` | guitar-acoustic | E2 Gs2 C3 E3 Gs3 C4 E4 Gs4 C5 | 0.005 / 0.6 | Acoustic guitar | Melody, Chords |
| `guitarElectric` | guitar-electric | E2 A2 C3 Fs3 A3 C4 Fs4 A4 C5 Ds5 Fs5 A5 C6 | 0.005 / 0.5 | Electric guitar | Melody, Chords |

Notes are a subset of what upstream has, no more than 7 semitones apart, so no note is stretched far (about 9 MB in all).

**Groups**, in this order where a job has them: Keys · Strings · Wind and brass · Plucked and struck · Synth.

- **Melody:**
  - Keys: Piano, Electric piano, Organ
  - Strings: Violin
  - Wind and brass: Flute, Clarinet, Saxophone, Trumpet, French horn
  - Plucked and struck: Harp, Nylon guitar, Acoustic guitar, Electric guitar, Xylophone
  - Synth: Synth pluck, Bells, Synth keys
- **Chords:**
  - Keys: Piano, Electric piano, Organ, Electric piano chords
  - Plucked and struck: Harp, Nylon guitar, Acoustic guitar, Electric guitar
  - Synth: Choir pad, Soft synth pad, Wide synth chords, Synth keys
- **Bass:**
  - Plucked and struck: Electric bass
  - Strings: Upright bass, Cello
  - Wind and brass: Tuba, Trombone, Bassoon
  - Synth: Sub bass, Synth bass

**Ableton chains:** none in this plan. Each new instrument gets its own chain under docs/superpowers/specs/2026-10-27-ableton-every-sound-design.md (the next plan). Until then, a new instrument in Ableton mode follows the World's chain (`chainForKey` returns null).

## Review Focus

1. A saved pick outside its job's list ("own pick") still shows as itself above the groups, and a row following the world still shows the world's option first, not inside a group.
2. Ableton mode: a new key is never silent; it follows the World's chain until the Ableton plan gives it its own.
3. A note in a job's register is never far from a sample: adjacent bundled notes ≤ 7 semitones apart for each new instrument.
4. The new files load and decode in a real browser: ▶ Hear on each says "♪ Playing", not "didn't load in time".
5. Keyboard and screen reader: the grouped list is still one native `<select>` with the same accessible name ("Sound").

---

### Task 1: The samples, bundled and credited

**Files:**
- Create: `public/samples/instruments/{flute,saxophone,trumpet,trombone,bassoon,xylophone,guitar-acoustic,guitar-electric}/*.mp3`
- Modify: `src/songs/voices/SamplerPlayer.ts` (`SAMPLE_CONFIGS`), `public/samples/instruments/manifest.json`, `public/samples/instruments/ATTRIBUTION.md`
- Test: `src/__tests__/sampleConfigs.test.ts`

**Interfaces:**
- Produces: `SAMPLE_CONFIGS` keys `flute`, `saxophone`, `trumpet`, `trombone`, `bassoon`, `xylophone`, `guitarAcoustic`, `guitarElectric` (so `SampleConfigKey` includes them).

- [ ] **Step 1: Write the failing tests** in `sampleConfigs.test.ts`:
  - `'the stage 4 instruments are bundled'`: each of the eight keys is in `SAMPLE_CONFIGS` with exactly the notes in the Decisions table (compare `Object.values(cfg.urls)` to `notes.map(n => n + '.mp3')`).
  - `'no bundled note is more than 7 semitones from the next'`: for the eight keys, sort the url keys by MIDI (`Tone`-free: a small note-name → MIDI helper in the test) and assert every gap ≤ 7.
  - `'manifest.json lists the same notes as SAMPLE_CONFIGS'`: for every config whose `baseUrl` is `samples/instruments/<folder>/`, `manifest[folder]` sorted equals the file names without extension, sorted.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/sampleConfigs.test.ts`. Expected: FAIL on the missing keys (the manifest test passes for the existing sets; if it fails on an existing set, that drift is a finding: fix the manifest, ledger it).
- [ ] **Step 3: Download** each listed note from `https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/622c2f1c32c8cfce4158ddc3eb26e518ddef37e5/samples/<folder>/<note>.mp3` into its folder (a curl loop; check every file is non-empty and starts with an MP3 header, `ID3` or `0xFF 0xFB/0xF3/0xF2`).
- [ ] **Step 4: Add the eight `SAMPLE_CONFIGS` entries** with the table's notes, folders, attack and release, in the existing groups' style (winds with the winds, plucked with the plucked; xylophone under a new `// Tuned percussion (nbrosowsky)` comment). Add the eight folders to `manifest.json` in its alphabetical order. In `ATTRIBUTION.md`, extend the nbrosowsky line with the eight folders, the pinned commit, and the upstream's original sources: flute, trumpet, trombone, bassoon, xylophone from VSCO 2 Community Edition (Versilian Studios); saxophone and electric guitar from Karoryfer Samples; acoustic guitar from the University of Iowa Electronic Music Studios.
- [ ] **Step 5: Run** the same test. Expected: PASS. Then `npm run lint`. Expected: no errors.
- [ ] **Step 6: Commit** (ask the owner first, per CLAUDE.md): `feat(sound): bundle flute, saxophone, trumpet, trombone, bassoon, xylophone and two guitars (CC-BY 3.0, credited)`.

### Task 2: Offering them, in groups

**Files:**
- Modify: `src/ui/screens/boardSequencer/soundCatalogue.ts`, `src/ui/screens/boardSequencer/play/ColourTable.tsx` (the "Sounds like" `<select>`, about line 204–210)
- Test: `src/__tests__/soundCatalogue.test.ts`, `src/__tests__/ColourTable.test.tsx`, `src/__tests__/abletonSounds.test.ts`

**Interfaces:**
- Consumes: Task 1's keys.
- Produces: `SoundOption` gains `group: SoundGroup`; `export type SoundGroup = 'Keys' | 'Strings' | 'Wind and brass' | 'Plucked and struck' | 'Synth'`. `soundsFor(role)` returns the Decisions lists in that order. `DRUM_OPTIONS` is unchanged (no group).

- [ ] **Step 1: Write the failing tests.**
  - soundCatalogue.test.ts `'the new instruments are offered for their jobs'`: melody contains flute, saxophone, trumpet, xylophone, guitarAcoustic, guitarElectric; chord contains guitarAcoustic, guitarElectric; bass contains trombone, bassoon; `soundOptionName('guitarAcoustic')` is `'Acoustic guitar'`.
  - `'each job's list is in groups, each group in one piece, in the set order'`: for melody, chord, bass, the sequence of `group` values with repeats collapsed has no group twice and follows Keys · Strings · Wind and brass · Plucked and struck · Synth, except that bass starts with Plucked and struck (Electric bass first, as today's default).
  - abletonSounds.test.ts `'a new instrument follows the World in Ableton until it has a chain'`: `chainFor({ role: 'melody', instrument: 'flute' }, 'warm')` is 0 (the Warm world's chain), not null.
  - ColourTable.test.tsx `'the melody sounds are in named groups; an own pick and the world's option stay above them'`: render a melody row with `instrument: 'tuba'` (not in the melody list). The Sound select's first option is the world's, the second is "Tuba (own pick)", and both are outside any `optgroup`. The `optgroup` labels are, in order, Keys, Strings, Wind and brass, Plucked and struck, Synth. `select.querySelector('optgroup[label="Wind and brass"] option[value="flute"]')` exists.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/soundCatalogue.test.ts src/__tests__/ColourTable.test.tsx src/__tests__/abletonSounds.test.ts`. Expected: the three new catalogue and table tests FAIL; the Ableton one already passes (it pins today's fallback); the others pass.
- [ ] **Step 3: Implement.**
  - In soundCatalogue.ts, add the eight names and the groups.
  - In ColourTable.tsx, render the options of a list that has groups as one `<optgroup label>` per run of the same group. Drum options stay flat. The world's option and the own-pick option stay first, outside the groups.
- [ ] **Step 4: Run** the same tests. Expected: PASS. Then `npm run test:run` and `npm run lint`. Expected: all pass.
- [ ] **Step 5: Commit** (ask first): `feat(board): the new instruments in the colour table, in groups`.

### Task 3: Heard in a real browser

**Files:**
- Test: `e2e/sound.e2e.ts`

- [ ] **Step 1: Write the test** `'each new instrument loads and plays with ▶ Hear'`: `openLaptopBoard`, Sound tab, the Red Melody row. For each of flute, saxophone, trumpet, xylophone, guitarAcoustic, guitarElectric: select it, press "Hear Red", and expect the row to show `♪ Playing Red` within 8 s (never "didn't load in time"). Then set Red's Plays to Bass and do the same for trombone and bassoon. `pageErrors(page)` is empty.
- [ ] **Step 2: Run** `npx playwright test e2e/sound.e2e.ts` (test server on its own port with a temporary `ADMI_DATA_DIR`, as the Playwright config already does; never port 3001). Expected: PASS. To see it fail first, temporarily point one config at a missing note and check that the test fails, then restore.
- [ ] **Step 3: Check** `npm run test:run`, `npm run lint`, `npx playwright test e2e/sound.e2e.ts e2e/boardAbleton.e2e.ts`. Expected: all pass.
- [ ] **Step 4: Commit** (ask first): `test(e2e): every new instrument is heard with ▶ Hear`.
