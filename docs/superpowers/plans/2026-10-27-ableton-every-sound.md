# Every ADMI sound in Ableton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each sound chosen in ADMI plays as itself in Ableton: 33 rack chains, each track filling only the slots it can reach (the rest are placeholders), with a generated checklist and guide.

**Architecture:** `src/midi/abletonSounds.ts` grows from 16 to 33 chains, and the CC 30 value becomes the middle of a chain's equal share of 0–127 (drums keep `index × 8`). A pure `filledChains(channel, opts)` says which slots a track fills, built from the colour table's lists (`soundsFor`) and Evolve's voices. `abletonPlan` never sends a track to a slot outside that set: it sends the World's chain instead. The Connections tab's Template checklist and the setup guide are built from the same data.

**Tech Stack:** TypeScript strict, Vitest + jsdom, Playwright.

**Spec:** docs/superpowers/specs/2026-10-27-ableton-every-sound-design.md

## Global Constraints

- Chain order and names exactly as the spec's table (0–15 keep their places; 10 "Cello", 13 "Choir pad", 14 "Electric piano chords", 15 "Bells" are renamed; 16–32 are new).
- CC 30 value for chain *i* of *N* on a non-drum channel: `Math.floor((i + 0.5) * 128 / N)`. The drum channel (10) keeps `i × 8`.
- Never silent because of Ableton; ADMI's own sound one press away (unchanged).
- Plain language on screen and in the guide.

## Review Focus

1. A saved "own pick" outside a colour's job list (a melody colour keeping Tuba): Ableton plays the World's chain on that track, and the colour's "Ableton sound" note says so, never a placeholder.
2. ▶ Hear in Ableton on the drums: still selects the kit with `index × 8`, not the new numbering.
3. Per-colour mode: channels 1–3 are colour channels there and get all 33; the band, Extra notes, drums and loops stay World-only.
4. The CC 30 value lands inside its chain's range for every chain (no off-by-one at either end).
5. Evolve switching a colour mid-piece goes to a filled slot on that colour's track.

---

### Task 1: The 33 chains and their numbers

**Files:**
- Modify: `src/midi/abletonSounds.ts`, `src/audio/soundPreview.ts` (`previewChainCc`)
- Test: `src/__tests__/abletonSounds.test.ts`, `e2e/boardAbleton.e2e.ts` (the Harp test's value)

**Interfaces:**
- Produces:
  - `ABLETON_CHAINS` (33 entries; keys per the spec table: 9 French horn `['frenchHorn']`, 10 Cello `['cello']`, 12 Electric bass `['bassElectric']`, 13 Choir pad `['pad','padChoir']`, 14 Electric piano chords `['chord']`, 15 Bells `[]`, 16 Violin `['violin']`, 17 Upright bass `['contrabass']`, 18 Tuba `['tuba']`, 19–26 the stage 4 keys in the spec's order, 27–32 `[]`).
  - `SYNTH_CHAIN`: bell 15, pluck 27, keys 28, pad 29, supersaw 30, sub 31, sawBass 32.
  - `chainCcValue(index: number, channel: number): number`.
  - `chainRange(index: number): [number, number]` = `[Math.round(i*128/N), Math.round((i+1)*128/N) - 1]`, the expected range after Distribute Ranges Equally.
  - `chainZone` is removed (its only users move to `chainRange`).

- [ ] **Step 1: Write the failing tests.** Replace `'16 chains, CC 30 value = index × 8, zones of 8'` with `'33 chains; CC 30 is the middle of each chain's share; drums keep × 8'`:
  - length 33, indexes 0..32, names in the spec's order;
  - `chainCcValue(0, 1)` → 1, `chainCcValue(4, 1)` → 17, `chainCcValue(6, 1)` → 25, `chainCcValue(19, 1)` → 75, `chainCcValue(32, 1)` → 126;
  - `chainCcValue(2, 10)` → 16;
  - for every i, `chainCcValue(i, 1)` lies inside `chainRange(i)`; ranges tile 0–127 with no gap or overlap.

  Add `'every sound has a chain of its own'`:
  - `chainFor` for melody `flute` → 19, bass `tuba` → 18, melody `violin` → 16, bass `contrabass` → 17, melody `synth:pluck` → 27, chord `synth:pad` → 29, bass `synth:sawBass` → 32;
  - no two distinct keys across `soundsFor('melody'|'chord'|'bass')` share a chain, except `pad`/`padChoir`.

  Update existing expectations that assumed × 8 (the Harp CC 30 = 48 tests become 25) and the Evolve mapping test (pad → 29, bell → 15, pluck → 27, keys → 28, sub → 31, sawBass → 32, supersaw → 30).
- [ ] **Step 2: Run** `npx vitest run src/__tests__/abletonSounds.test.ts`. Expected: FAIL on the length, the values and the new chains.
- [ ] **Step 3: Implement.**
  - The list and `SYNTH_CHAIN` as above.
  - `chainCcValue(index, channel)` returns `index * 8` when `channel === ROLE_CHANNEL.drums`, else the middle formula. Every call site passes its channel: `abletonPlan`'s two `set(channel, CHAIN_CC, …)` and `previewChainCc`.
  - `chainRange`.
  - Update the file's header comment (CC 30 is no longer `index × 8`).
- [ ] **Step 4: Run** the same test, then `npm run lint`. Expected: PASS, no errors. In `e2e/boardAbleton.e2e.ts`, change the Harp test's title and value to 25. Run `npx playwright test e2e/boardAbleton.e2e.ts`; Expected: pass.
- [ ] **Step 5: Commit** (ask first): `feat(ableton): 33 chains, one per ADMI sound; CC 30 picks the middle of each chain's share`.

### Task 2: Which slots each track fills, and the safety net

**Files:**
- Modify: `src/audio/evolve/evolve.ts` (export), `src/midi/abletonSounds.ts`, `src/ui/screens/boardSequencer/play/ColourTable.tsx` (the "Ableton sound" note, about line 243), `src/ui/screens/BoardSequencerScreen.tsx` (about line 858)
- Test: `src/__tests__/abletonSounds.test.ts`, `src/__tests__/ColourTable.test.tsx`

**Interfaces:**
- Consumes: Task 1's chains.
- Produces:
  - `evolveVoicesFor(role: 'melody' | 'chord' | 'bass'): NamedVoice[]` (every World's palette for that part).
  - `filledChains(channel: number, opts: { channelMode: MidiChannelMode; loopChannels?: boolean }): ReadonlySet<number>`.
  - `chainOnChannel(ch: Pick<ColourChannel,'role'|'instrument'>, channel: number, world: SoundWorldChoice, opts: { channelMode: MidiChannelMode; loopChannels?: boolean }, evolved?: NamedVoice | null): number | null`. This is `chainFor` (or `chainForVoice` when evolved), replaced by `worldChain(world)` when the result isn't in `filledChains`.

- [ ] **Step 1: Write the failing tests** (abletonSounds.test.ts, `describe('which slots a track fills')`):
  - `'every sound a job or Evolve can reach is filled on its track'`: for each job, for every `soundsFor(job)` key, `chainFor` is in `filledChains(ROLE_CHANNEL[job], { channelMode: 'part' })`; the same for every `evolveVoicesFor(job)` through `chainForVoice`; World 0–3 and the My picks default (5, or 12 for bass) are in.
  - `'melody does not fill bass-only sounds'`: `filledChains(1, { channelMode: 'part' })` lacks 18 (Tuba), 22 (Trombone), 31 (Sub bass).
  - `'the band, Extra notes, drums and loops fill only the World chains'`: channels 10, 11, 12, 13 and 4–9 (loopChannels true) → `{0,1,2,3}`.
  - `'per-colour mode: every colour channel fills all 33'`: `filledChains(1, { channelMode: 'colour' })` and `filledChains(14, …)` have size 33.
  - `'a pick outside the track's slots plays the World instead'`: `abletonPlan` for a melody colour with `instrument: 'tuba'`, world `'lofi'`, part mode → `chains.get(1)` is 1, and the CC 30 control is `chainCcValue(1, 1)`.

  ColourTable.test.tsx `'the Ableton note names what Ableton actually plays'`: a melody colour with `instrument: 'tuba'`, Sound from Ableton (set the config's `midiEnabled: true, midiKeepSound: false`); its More shows "Ableton sound: World: Warm (chain 1)".
- [ ] **Step 2: Run** `npx vitest run src/__tests__/abletonSounds.test.ts src/__tests__/ColourTable.test.tsx`. Expected: the new tests FAIL (missing exports; Tuba sent as chain 18).
- [ ] **Step 3: Implement** the three exports.
  - `filledChains`:
    - part mode: channels 1/2/3 use their job's set;
    - drums, band, Extra notes and loop channels are World-only;
    - in colour mode, channels in `colourChannelPool(loopChannels)` get all;
    - any other channel gets all, the safe side.
  - `abletonPlan` uses `chainOnChannel`, passing `{ channelMode: input.channelMode, loopChannels: input.loopChannels }`.
  - The ColourTable note and the BSS line use `chainOnChannel` with the colour's channel.
- [ ] **Step 4: Run** the same tests, then `npm run test:run` and `npm run lint`. Expected: all pass.
- [ ] **Step 5: Commit** (ask first): `feat(ableton): each track fills only the sounds it can reach; a pick outside them plays the World`.

### Task 3: The Template checklist on the Connections tab

**Files:**
- Modify: `src/ui/screens/boardSequencer/components/AbletonSoundsPanel.tsx` (the "Template checklist" Disclosure)
- Test: `src/__tests__/AbletonSoundsPanel.test.tsx` (create if absent, in ColourTable.test.tsx's createRoot/act style)

**Interfaces:**
- Consumes: `ABLETON_CHAINS`, `chainRange`, `chainCcValue`, `filledChains`, and the config's channel mode and loops setting (the panel's existing props carry the config; add what it lacks).
- Produces: `abletonChecklist(opts: { channelMode: MidiChannelMode; loopChannels?: boolean }): { index: number; name: string; range: [number, number]; melody: boolean; chords: boolean; bass: boolean; others: boolean }[]` in `abletonSounds.ts`, so the panel and the tests read one source.

- [ ] **Step 1: Write the failing tests.**
  - `abletonChecklist({ channelMode: 'part' })` has 33 rows; row 19 (Flute) is `melody: true, chords: false, bass: false, others: false`; row 0 is all true.
  - Component test: the Disclosure summary reads "Template checklist: the 33 sounds, and which each track holds". The table has 33 body rows with columns Chain, Name, CC 30 (about), Melody, Chords, Bass, Band, Extra notes and Loops. A filled cell says "Real", any other "Placeholder". The first line above the table is the conversion note: "Changing from the 16-sound racks? On every track: rename chains 11, 14, 15 and 16, add chains 17 to 33 with the placeholder, then select every chain and choose Distribute Ranges Equally."
- [ ] **Step 2: Run** `npx vitest run src/__tests__/abletonSounds.test.ts src/__tests__/AbletonSoundsPanel.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `abletonChecklist`, and render it in the Disclosure, replacing the old 16-row table. Below it, keep the existing macros note and add: "Placeholder: Operator with its default sound. In per-colour mode every colour's track needs every sound real."
- [ ] **Step 4: Run** the same tests and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** (ask first): `feat(ableton): the Template checklist shows all 33 sounds and which each track holds`.

### Task 4: The guide

**Files:**
- Modify: `docs/ableton-setup-guide.html` (section 5a, `id="h-racks"`), `docs/ableton-integration-plan.md` (a note at the top of 5.2 and 5.6: "Changed by docs/superpowers/specs/2026-10-27-ableton-every-sound-design.md: 33 chains")
- Test: `src/__tests__/abletonGuide.test.ts` (create)

- [ ] **Step 1: Write the failing test** `'the guide's chain table matches ABLETON_CHAINS, in order'`: read the guide, take section 5a's chain table rows (`<tr><td>N</td><td>Name</td>`), and expect the names to equal `ABLETON_CHAINS.map(c => c.name)` and the numbers 1..33.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/abletonGuide.test.ts`. Expected: FAIL (16 rows, old names).
- [ ] **Step 3: Rewrite section 5a**, in plain language. It contains:
  1. **Converting from 16 sounds** (the spec's step 0).
  2. **The chain table:** Chain, Name, CC 30 (about), and Suggested Suite sound. The suggestions name packs and instruments only, never invented preset names:
     - flute, clarinet and bassoon from Orchestral Woodwinds;
     - trumpet, French horn, trombone and tuba from Orchestral Brass;
     - violin, cello and upright bass from Orchestral Strings;
     - xylophone from Orchestral Mallets;
     - guitars and electric bass from Guitar and Bass;
     - piano from Grand Piano;
     - electric piano and organ from Electric Keyboards;
     - synths from Drift, Meld, Wavetable or Operator;
     - saxophone: Sampler with ADMI's own files in `public/samples/instruments/saxophone`, unless a Suite saxophone is installed.
  3. **Building Melody with all 33 real**, then the **Melody check**: load time, memory in Task Manager, and the CPU meter over a full 7-minute run. The line is under 60% with no dropouts. Then ▶ Hear on a colour set to each sound, to confirm every chain answers.
  4. **Copy to Chords and Bass**, then swap each track's unused slots to the placeholder, as the Connections tab's checklist says. "Which slots on which track" is never repeated here.
  5. **The expression mapping:** in the wind, brass and string chains, map macro 1 (Loud) to the instrument's dynamics or expression as well as volume.
  6. **No effects inside chains.** Space is Send A.
  7. The existing mapping, Min/Max and drums steps, unchanged except "16 chains" → "33".
  8. **A final full run.**
- [ ] **Step 4: Run** the test. Expected: PASS. Open the guide in a browser from the file and check it reads well (headless screenshot to scratchpad).
- [ ] **Step 5: Commit** (ask first): `docs(ableton): the guide builds 33 sounds, one track at a time, with the Melody check first`.

### Task 5: Check

- [ ] `npm run lint`, `npm run test:run`, `npx playwright test e2e/boardAbleton.e2e.ts e2e/sound.e2e.ts`, `npm run build`. Expected: all pass.
