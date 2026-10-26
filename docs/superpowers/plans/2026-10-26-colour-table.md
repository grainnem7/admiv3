# Colour Table (stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every colour's job and sound are set in one table (Plays · Sounds like · ▶ Hear · ↶ · More), in set-up's Colours step and on the Play screen's Sound tab, with more sounds to choose from.

**Architecture:** A pure sound catalogue (which sounds suit which job, with plain names) feeds one shared `ColourTable` component. ▶ Hear goes through a small `SoundAuditioner` (ADMI's own sound, works while stopped) or a MIDI preview (Ableton). Synth sounds are stored in the existing `instrument` field as `synth:<id>`, so saved players keep working.

**Tech Stack:** React 19, TypeScript strict, Tone.js (via the effects chain only), Vitest + jsdom (component tests render with `createRoot` + `act`, as in `src/__tests__/CellGrid.test.tsx`), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-26-board-setup-and-sounds-design.md` (stage 1 and "Calls made after the builder check").

## Global Constraints

- Job names: **Melody, Bass, Chords, Drums, Not used** (never "Tune"). `ROLE_LABELS.chord` becomes `'Chords'`; the off job shows as `'Not used'`.
- A Sound world never overwrites a colour's own `instrument`; colours without one follow the world (as `voiceSpecFor` does today).
- Every colour is a row: control and loop colours too, grouped after the sound rows, with "—" for their sound.
- No `any`; no Tone objects created in components (audio goes through `src/audio` / the engine).
- Saved players load unchanged: existing `instrument` keys keep their meaning.
- `npm run lint` and `npx vitest run` pass after every task.

## Review Focus

- **▶ Hear before the samples have loaded:** the button shows "Loading…" and plays once ready (or says it couldn't within 4 s); a second press while loading doesn't stack previews.
- **▶ Hear while the board is playing:** the preview plays over the music without disturbing the engine.
- **Ableton mode with no port connected:** ▶ Hear falls back to ADMI's own sound, as Play does (`effectiveSound`).
- **↶ after a world change:** going back restores that row's previous own pick, never another row's.
- **A colour whose job is changed to Control or Loop:** its own instrument is kept (not wiped), so switching back restores the sound.

Each line has a test in the owning task below.

---

### Task 1: The sound catalogue, synth sounds by name, and the job names

**Files:**
- Create: `src/ui/screens/boardSequencer/soundCatalogue.ts`
- Modify: `src/audio/worlds/soundWorlds.ts` (`voiceSpecFor`), `src/ui/screens/boardSequencer/soundOptions.ts` (`soundNameFor`, `SAMPLE_NAMES`), `src/midi/abletonSounds.ts` (`chainFor`, `ABLETON_CHAINS` keys), `src/tracking/boardColours.ts` (`ROLE_LABELS`)
- Test: `src/__tests__/soundCatalogue.test.ts`

**Interfaces:**
- Produces:
  - `export interface SoundOption { key: string; name: string }`
  - `export const SYNTH_PREFIX = 'synth:'`
  - `export function soundsFor(role: ColourRole): readonly SoundOption[]` (empty for drums, controls, loop, off)
  - `export function soundOptionName(key: string): string`
  - `voiceSpecFor` returns `{ synth: id }` for an `instrument` of `'synth:<id>'`.

- [ ] **Step 1: Write the failing tests** in `src/__tests__/soundCatalogue.test.ts`:
  - `soundsFor('melody')` keys include `'piano', 'electricPiano', 'harp', 'organ', 'clarinet', 'frenchHorn', 'violin', 'guitarNylon', 'synth:pluck', 'synth:bell', 'synth:keys'`.
  - `soundsFor('chord')` includes `'pad', 'piano', 'electricPiano', 'organ', 'guitarNylon', 'synth:pad', 'synth:supersaw'`.
  - `soundsFor('bass')` includes `'bassElectric', 'contrabass', 'cello', 'tuba', 'synth:sub', 'synth:sawBass'`.
  - `soundsFor('drums')`, `soundsFor('tempo')`, `soundsFor('off')` are empty.
  - Every key in every list has a name from `soundOptionName` that isn't the raw key (e.g. `'contrabass'` → `'Upright bass'`, `'synth:pluck'` → `'Synth pluck'`, `'pad'` → `'Choir pad'`).
  - `voiceSpecFor({ role: 'melody', instrument: 'synth:bell' }, 'warm')` equals `{ synth: 'bell' }`; `voiceSpecFor({ role: 'melody', instrument: 'harp' }, 'warm')` is `'harp'` (unchanged).
  - `chainFor({ role: 'melody', instrument: 'synth:pluck' }, 'warm')` is 15 (Bell / pluck); `chainFor({ role: 'melody', instrument: 'violin' }, 'warm')` is 10; `'tuba'` is 9.
  - `ROLE_LABELS.chord === 'Chords'`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/soundCatalogue.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Lists as in the tests, in that order (most familiar first). Names: reuse `INSTRUMENT_OPTIONS` names; add `violin: 'Violin'`, `contrabass: 'Upright bass'`, `tuba: 'Tuba'`, `pad: 'Choir pad'`, `chord: 'Electric piano chords'`, and synth names from `SYNTH_NAMES` capitalised. `chainFor`: a `synth:` key maps through the existing `SYNTH_CHAIN`; add `'violin'` to chain 10's keys and `'tuba'` to chain 9's. `soundNameFor` uses `soundOptionName` for an own pick. Change `ROLE_LABELS.chord` to `'Chords'` and fix any test that asserted `'Chord stab'`.
- [ ] **Step 4: Run** `npx vitest run` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(board): a sound catalogue per job, synth sounds by name, "Chords"`.

### Task 2: Hearing a colour's sound while stopped (ADMI and Ableton)

**Files:**
- Create: `src/audio/soundPreview.ts`
- Modify: `src/midi/boardMidi.ts` (add `previewEvents`)
- Test: `src/__tests__/soundPreview.test.ts`

**Interfaces:**
- Consumes: `voiceSpecFor` (Task 1).
- Produces:
  - `export function previewPhrase(role: 'melody' | 'bass' | 'chord', rootMidi: number, semitones: readonly number[]): { midis: number[][]; atSec: number[] }` — melody: 4 rising scale notes from the root, 0.25 s apart; bass: root two octaves down then its fifth, 0.5 s apart; chord: one triad on the root, held. Each entry of `midis` is the notes sounding at `atSec[i]`.
  - `export class SoundAuditioner { hear(ch: ColourChannel, world: SoundWorldChoice, key: { rootMidi: number; semitones: readonly number[] }): Promise<'played' | 'timeout'>; dispose(): void }` — builds one `BoardSequencerVoice` per sound key (cached), connected to `getEffectChainManager().getInput()` as the engine connects its voices; waits up to 4000 ms for `isReady()`; drums play kick, hat, snare, hat through a `RoundRobinDrumKit` (or the colour's one piece four times). A `hear` while one is already waiting for the same colour returns that same promise.
  - `export function previewEvents(channel: number, chainCc: number | null, notes: { midi: number; atMs: number; durMs: number }[]): MidiEvent[]` — optional CC 30 (chain) first, then Note On/Off pairs on `channel`.

- [ ] **Step 1: Write the failing tests:**
  - `previewPhrase('melody', 60, [0,2,4,7,9]).midis` equals `[[60],[62],[64],[67]]`, `atSec` `[0,0.25,0.5,0.75]`.
  - `previewPhrase('bass', 60, …).midis[0]` is `[36]`; `previewPhrase('chord', 60, [0,2,4,5,7,9,11]).midis` is `[[60,64,67]]`.
  - `previewEvents(3, 7, [{ midi: 60, atMs: 0, durMs: 200 }])` starts with a CC 30 on channel 3 and has a Note On and a Note Off for 60 on channel 3; with `chainCc` null there is no CC.
  - With `BoardSequencerVoice` mocked (`isReady` false, then true after 100 ms with fake timers), `hear` resolves `'played'` and the voice's `play` got the phrase; with `isReady` never true it resolves `'timeout'` after 4000 ms; two `hear` calls while loading call `play` once per phrase (Review Focus 1).
- [ ] **Step 2: Run** `npx vitest run src/__tests__/soundPreview.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in the two files; Tone is mocked in the test as in `src/__tests__/boardMidiAbleton.test.ts`.
- [ ] **Step 4: Run** `npx vitest run` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(board): hear a colour's sound while stopped`.

### Task 3: The ColourTable component

**Files:**
- Create: `src/ui/screens/boardSequencer/play/ColourTable.tsx`
- Modify: `src/ui/screens/boardSequencer/play/SoundTab.tsx` (move the card's detail controls into a `ColourMore` export used by the table)
- Test: `src/__tests__/ColourTable.test.tsx`

**Interfaces:**
- Consumes: `soundsFor`, `soundOptionName` (Task 1); `ChannelSoundPatch` (SoundTab).
- Produces:
  ```ts
  export interface ColourTableProps {
    config: BoardSequencerStored;
    palette: BoardPalette;
    /** Why the Plays column can't change now (e.g. while playing), or null. */
    roleLockedReason: string | null;
    onRole(id: ColourId, role: ColourRole): void;
    onLoopSlot(id: ColourId, slot: number): void;
    setChannelSound(id: string, patch: ChannelSoundPatch): void;
    onHear(c: ColourChannel): void;
    /** The colour whose preview is loading, or null. */
    hearing: string | null;
    /** Set-up's extras for a row (count on board, recalibrate, remove). */
    rowExtras?(c: ColourChannel): ReactNode;
    /** Shown inside a row's More, after the sound details (set-up: black darkness). */
    rowMore?(c: ColourChannel): ReactNode;
  }
  export function ColourTable(p: ColourTableProps): JSX.Element;
  ```
- A real `<table>`: columns Colour · Plays · Sounds like · (▶ Hear) · (↶) · (More). Row order: melody, chord, bass, drums, then off, controls, loops. Each row is labelled `${describeChannel(c)}: ${ROLE_LABELS[c.role]}` (the e2e tests find rows by this).
- **Plays:** a `<select>` labelled `Plays` with Melody, Bass, Chords, Drums, Not used, then an optgroup "Control" (every fader and toggle role by its label) and "Loop" (Loop 1…n, using loop names). Disabled with `roleLockedReason` as its title and a visible note when not null. Changing to Control or Loop keeps `instrument` (Review Focus 5).
- **Sounds like:** a `<select>` labelled `Sound`. First option `"<World> world's sound (<name>)"` (or "Default (<name>)" with My picks), value `''`; then `soundsFor(role)`. Drums: the kit, then each drum piece (`drum` field). Control, loop, off: the text "—".
- **↶:** the row's previous own `instrument` (or drum) from the last change made in this table, kept in component state per colour id; disabled when there is none; pressing it sets that value back.
- **More:** a `Disclosure` per row with what the old card had: Each counter plays, Loud / Bright / Space, Notes wander, Changes over time, the MIDI channel line in Ableton/Both, and `rowMore`.

- [ ] **Step 1: Write the failing tests** (render with `createRoot`/`act`):
  - Four colours (melody, chord, bass, a tempo control) render four rows; the control row is last and shows "—".
  - The melody row's Sound select lists Piano, Violin and Synth pluck; choosing Harp calls `setChannelSound('m', { instrument: 'harp' })`.
  - After choosing Harp then Violin, ↶ calls `setChannelSound('m', { instrument: 'harp' })`; another row's ↶ stays disabled (Review Focus 4).
  - The Plays select offers Melody, Bass, Chords, Drums, Not used; choosing Chords calls `onRole('m', 'chord')`; with `roleLockedReason` set it is disabled and the reason is visible.
  - ▶ Hear calls `onHear` with that colour; with `hearing` equal to its id the button reads "Loading…".
- [ ] **Step 2: Run** `npx vitest run src/__tests__/ColourTable.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the component and `ColourMore`.
- [ ] **Step 4: Run** `npx vitest run` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(board): the colour table`.

### Task 4: The table on the Play screen and in set-up

**Files:**
- Modify: `src/ui/screens/boardSequencer/play/SoundTab.tsx` ("Your colours" section → `ColourTable`; a "Reset every colour to the world" button under the World choice), `src/ui/screens/boardSequencer/setup/ColoursStep.tsx` (job chips and per-colour boxes → `ColourTable` with `rowExtras` for the count, ⟳ and ×, and `rowMore` for Black darkness), `src/ui/screens/BoardSequencerScreen.tsx` (a `hearColour(c)` that uses one `SoundAuditioner`, or `previewEvents` through `MIDIManager.getConnectedSelectedOutput()` when `effectiveSound(...)` says MIDI only; `hearing` state; pass `onRole={setChannelRole}` and `roleLockedReason={running ? 'Stop the board to change what a colour plays.' : null}` on both screens), `e2e/*.e2e.ts` and `e2e/app.ts` where they used the old cards or job chips.
- Test: `src/__tests__/soundPreview.test.ts` (route choice), e2e `sound.e2e.ts`.

**Interfaces:**
- Consumes: `ColourTable` (Task 3), `SoundAuditioner`, `previewEvents` (Task 2), `effectiveSound`, `chainFor`, `chainCcValue`.
- Produces: `export function previewRoute(cfg: BoardSequencerStored, port: MidiPortState): 'admi' | 'ableton'` in `src/audio/soundPreview.ts` — `'ableton'` only when `effectiveSound(...)` gives `{ internal: false, midi: true }`.

- [ ] **Step 1: Write the failing tests:** `previewRoute` is `'admi'` for Sound from ADMI, for Both, and for Ableton with the port missing (Review Focus 3); `'ableton'` for Ableton with the port connected.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the wiring. "Reset every colour to the world" clears `instrument` and `drum` on every sound colour (one `update`), and is hidden with My picks. The preview while playing uses the same auditioner (it plays over the music; Review Focus 2).
- [ ] **Step 4: Update the e2e tests** that found colours by the old cards or chips (`getByRole('group', { name: /^Red: Melody/ })`, job radios) to use the table's rows and selects; keep their intent.
- [ ] **Step 5: Run** `npm run lint`, `npx vitest run`, and `npx playwright test e2e/sound.e2e.ts e2e/boardAbleton.e2e.ts --workers=1`. Expected: all pass (allow for the known slow first page load on a busy laptop).
- [ ] **Step 6: Commit** `feat(board): one colour table in set-up and on the Play screen`.

### Task 5: Check it in the running app

- [ ] **Step 1:** On a separate dev server with its own data folder (`ADMI_DATA_DIR=<scratch> npx vite --port 3210 --strictPort`), use the laptop board: open the Sound tab, change Red to Violin with ▶ Hear while stopped, then ↶; change a job; turn a colour into a Speed control; play and change a sound mid-play. Take screenshots into the scratchpad. Expected: no console errors; each change heard or shown as described.
- [ ] **Step 2:** Rebuild the owner's app (`npm run show`) and report.
