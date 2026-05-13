# Chord-Walk Baton Mode — design

**Date:** 2026-05-13
**Author:** Grainne (with Claude)
**Status:** Draft — ready for plan

---

## Goal

Add a **chord-walk** baton mode to Song Preset that generates melodic notes from the active chord's tones, triggered on beat while the baton moves. The user does not select pitch with horizontal position — every note is harmonically safe and lands on the beat. Movement and vertical position are the only required inputs.

The motivating user is Tim, whose intentional horizontal movement range is narrower than the camera frame. The current melody voice maps `posX → pentatonic band`, which makes notes at the edges of the frame physically unreachable. Walk mode replaces pitch-by-position with pitch-by-pattern, so any movement above the stillness threshold produces a musical phrase.

## Non-goals

- Replacing parameter / instrument / harmonizer modes — walk is additive, opt-in per baton.
- Per-song hand-authored phrases — walk plays an algorithmic up-down arpeggio over chord tones; bespoke melodies are out of scope.
- Following the song's actual vocal melody — that's what harmonizer mode does. Walk's whole point is being usable on songs without harmony analysis.
- New calibration UI — the existing stillness threshold doubles as walk's trigger threshold.
- Per-baton drum patterns, stem transforms, remix mode, additional drum kits, song-preset sound quality pass — each is a separate spec (the user explicitly asked for these to be brainstormed independently).

## Behaviour

### Mode selection

`'walk'` joins `'parameter' | 'instrument' | 'harmonizer'` in the `BatonMode` union ([src/songs/SongPresetEngine.ts:64](../../../src/songs/SongPresetEngine.ts#L64)).

Walk mode is available on every generative baton: red, green, yellow, orange. Blue (stem mixer) remains excluded.

For green the mode picker becomes `Param / Instr / Harm / Walk`. For red, yellow, orange it becomes `Param / Instr / Walk` (those batons never had harmonizer).

### Note source

The active chord (`SongPresetEngine.currentChord: ChordEntry | null`) supplies the tone set. The chord's `notes: number[]` field is the existing chord voicing — a list of MIDI note numbers, e.g. `[D3, A3, D4, F#4]` for the D major chord in [chordLookup.ts:75](../../../src/songs/voices/chordLookup.ts#L75). Walk uses these voicing notes directly, sorted ascending. No new chord data, no parsing of `chord.name`.

When the chord changes, the new note list is used on the *next* trigger. The walk-step counter does **not** reset on chord change.

When no chord is loaded, walk is silent (no fallback note).

### Walk pattern

Up-down through the sorted voicing notes, looping. For a 4-note voicing `[n0, n1, n2, n3]` (e.g. `[D3, A3, D4, F#4]`) the step sequence is:

```
step:  0   1   2   3   4   5   → 0 ...
note:  n0  n1  n2  n3  n2  n1   (then repeat)
```

That's a 6-step cycle: ascend through all 4 notes, then descend back through the inner 2 (returning to `n0` at step 0 of the next cycle). For a 3-note voicing the cycle collapses to 4 steps (`n0  n1  n2  n1` → loop). For any length `k`, the cycle length is `max(1, 2 * (k - 1))`.

The step counter is internal to `WalkVoice` and persists across chord changes. If the new chord's voicing is shorter than the current step index, the index wraps via the per-frame `step % cycleLength` calculation — never raw indexes into the voicing array.

### Trigger

A note fires when **all three** are true on a given frame:

1. The voice is `active` (its colour is one of the two currently-detected).
2. `velocity` (smoothed motion magnitude) > engine stillness threshold (the same value already used by the gate).
3. A new beat has arrived since the last fired note — i.e. the most-recent beat in `song.beats` whose timestamp ≤ `playbackTime` has a higher index than `lastTriggeredBeatIndex`.

This produces at most one note per beat per baton, on-beat by construction. Holding the baton still mutes walk via the existing stillness gate, no new mechanism.

Beat data comes from `song.beats` (populated from `analysis.json`). When a song has no beat data, walk mode is silent — the spec assumes beat-aware songs, which all four shipped songs are.

### Pitch and dynamics

- **Pitch**: voicing-note MIDI directly. `posX` is ignored entirely — this is the accessibility win.
- **Octave**: no shift. The chord voicing already spans roughly an octave (e.g. D3–F#4 for the D voicing), so the walk traverses a usable range without needing octave control. A future spec can add Y-driven octave if sessions show a need.
- **Player velocity** (loudness sent to the sampler/synth): `lerp(0.3, 1.0, 1 - posY)` — top of frame loud, bottom soft. Movement speed is the *gate* (via the stillness threshold) but does not also drive dynamics, so the two inputs are independent.

### Sidechain

`WalkVoice.onNoteTrigger` calls `engine.triggerSidechain()` on each fired note, matching `ChordPadVoice` / `MelodicVoice` / `InstrumentVoice` / `HarmonyVoice`. Walk notes duck the stems identically to other discrete-trigger voices.

### Beat-snap interaction

Walk is intrinsically beat-locked (it fires only on beat arrival). The engine's `beatSnap` toggle is a no-op for walk-mode voices. The `setBeatSnap` engine method should document this and skip walk voices in its forwarding loop.

## Architecture

### New voice class: `src/songs/voices/WalkVoice.ts`

`WalkVoice extends ToneVoiceBase`. State:

- `private currentChord: ChordEntry | null = null`
- `private walkStep = 0`
- `private lastTriggeredBeatIndex = -1`
- `private beats: number[] | null = null` (set via `setBeatTimestamps`)
- `private player: Player` (the same `Player` interface used by `MelodicVoice` / `HarmonyVoice` / `InstrumentVoice` — sampled or synth, chosen from the instrument palette)

Public methods:

- `setBeatTimestamps(beats: number[]): void` — supplied by the engine on construction.
- `setPreset(instrumentKey: string): void` — looks up the palette entry, disposes the old player, builds a new one.
- `update(playbackTime, chord, velocity)` — implements the trigger logic above.
- `onTransportStart() / onTransportStop()` — reset `lastTriggeredBeatIndex = -1` so a restart fires on the first new beat.
- `dispose()` — release notes, dispose player, `disposeBase()`.

The `Player` interface and palette lookup match the existing pattern in `InstrumentVoice` and `HarmonyVoice`; no new infrastructure required.

### Engine wiring

`SongPresetEngine.createVoiceForRole` ([src/songs/SongPresetEngine.ts:930](../../../src/songs/SongPresetEngine.ts#L930)) gets a third mode branch:

```ts
if (mode === 'instrument') {
  voice = this.createInstrumentVoice(role);
} else if (mode === 'harmonizer' && role === 'green') {
  voice = this.createHarmonyVoice();
} else if (mode === 'walk') {
  voice = this.createWalkVoice(role);
} else {
  voice = this.createParameterVoice(role);
}
```

A new private `createWalkVoice(role)` that:

1. Reads `batonInstruments.get(role)` (the existing per-baton instrument map — same map instrument and harmonizer modes use, so the user's instrument choice persists across mode switches).
2. Constructs `new WalkVoice(this.ctx!, instrumentKey)`.
3. Calls `voice.setBeatTimestamps(this.song.beats)` if beats exist.
4. Sets `voice.onNoteTrigger = () => this.triggerSidechain()`.
5. Returns the voice.

`setBatonInstrument` ([src/songs/SongPresetEngine.ts:698](../../../src/songs/SongPresetEngine.ts#L698)) gets a fourth `else if` arm for walk mode that calls `voice.setPreset(instrumentKey)` on the live `WalkVoice`, matching the harmonizer arm.

`setBeatSnap` ([src/songs/SongPresetEngine.ts:1341](../../../src/songs/SongPresetEngine.ts#L1341)) forwards to `InstrumentVoice` instances only — `WalkVoice` is intentionally skipped. The existing `if (voice instanceof InstrumentVoice)` guard already excludes other voice types; no change needed there, but the comment should note that walk is beat-locked by design.

### Persistence

`BatonAssignment` is `{ mode: BatonMode, instrumentKey: string }`. Walk fits the existing shape — `mode: 'walk'` is just a new valid value. `applyBatonAssignments` already calls `setBatonMode` (which calls `swapVoice` → `createVoiceForRole`), so the new branch picks up automatically.

No profile schema migration needed. A profile saved before walk existed contains only `parameter` / `instrument` / `harmonizer` values, which all remain valid.

## UI integration

### Mode toggle

`SongPresetScreen` already renders a per-baton mode toggle. Widening the toggle's options to include `'walk'`:

- Green: `Param / Instr / Harm / Walk` (4 options)
- Red / Yellow / Orange: `Param / Instr / Walk` (3 options)

Label: **"Walk"**. Short enough for the existing chip layout, describes the behaviour without jargon.

Any TypeScript switch on `BatonMode` will fail to compile until a `'walk'` arm is added — surfacing the UI sites that need updating.

### Instrument picker

When a baton is in walk mode, the existing instrument-palette picker (already shown for instrument and harmonizer modes) is shown. Selecting an instrument calls `setBatonInstrument(role, key)` which now also targets walk voices.

### Status surface

`SongPresetStatus.batonModes` is `Record<ColorRole, BatonMode>` — widening `BatonMode` propagates without an interface change.

### Calibration

Walk ignores `posX`. The X portion of any saved calibration for that baton is unused; Y calibration still applies to dynamics. No new calibration UI.

### Facilitator controls

No new control. The trigger sensitivity is the engine's existing stillness threshold, already exposed in DebugPanel. Lowering it for Tim makes walk more responsive (smaller movements register as motion).

## Testing

### `src/__tests__/WalkVoice.test.ts` (Vitest + `vi.mock` for Tone.js)

1. **Pattern progression** — fire 8 simulated beats with a fixed 4-note voicing `[60, 64, 67, 72]`, assert the MIDI sequence matches `60-64-67-72-67-64-60-64`.
2. **Chord change mid-cycle** — start a cycle on voicing `[60, 64, 67, 72]`, change to `[62, 65, 69, 74]` at step 3, assert step 4 emits `voicing[4 % 6] = voicing[4]` of the **new** voicing (`69`) and the step counter does *not* reset to 0.
3. **3-note voicing** — with `[60, 64, 67]`, assert the pattern is `60-64-67-64-60-64-67-64`.
4. **Voicing shorter than step index** — start at step 4 on a 4-note voicing, switch to a 3-note voicing; assert the new note is `newVoicing[4 % 4] = newVoicing[0]` (using the 3-note cycle length of 4). No out-of-bounds access.
5. **Stillness gate** — `update()` called many times with `velocity = 0`: no notes fire even when beats arrive. With `velocity = 0.5` (above default 0.04 threshold): one note per beat.
6. **One-note-per-beat** — call `update()` 20 times between two beat timestamps with adequate velocity: only one note fires.
7. **Y → dynamics** — `posY = 0` produces a high `noteVelocity` arg to the player; `posY = 1` produces a low one. Both with the same movement velocity.
8. **Sidechain hook** — `onNoteTrigger` is invoked exactly once per fired note.
9. **No chord** — `update(t, null, vel)` is silent regardless of beat arrival.
10. **Transport reset** — `onTransportStop` then `onTransportStart` resets `lastTriggeredBeatIndex` so the first new beat post-restart fires.

### `src/__tests__/SongPresetEngine.walk.test.ts`

1. **Mode switch creates WalkVoice** — `setBatonMode('green', 'walk')` results in a `WalkVoice` instance in `engine.voices`.
2. **Mode switch disposes the old voice** — switching from walk to parameter disposes the `WalkVoice` and creates a `MelodicVoice`. No double-connected nodes.
3. **Instrument persistence** — set walk + instrument A; switch to instrument mode then back to walk; the player still uses instrument A.
4. **applyBatonAssignments** — a `BatonAssignment` with `mode: 'walk'` loaded via `applyBatonAssignments` produces a `WalkVoice` for that role.
5. **`setBeatSnap` skips walk voices** — toggling beat-snap on with a walk voice present does not change walk behaviour or throw.

### Manual verification

Not automated. Documented in the plan:

- Load each of the four shipped songs. For each, set green to Walk, move green baton — confirm notes land on beat, X position doesn't change pitch, Y changes loudness, chord changes are reflected in the next note.
- Confirm walk also works on red, yellow, orange.
- Confirm switching mode mid-playback doesn't click, drop audio, or leave hanging notes.

## Risks and open questions

- **Pattern feels mechanical**: an unchanging up-down arpeggio at one note per beat may feel rigid. Mitigation: ship and iterate. If the pattern is too predictable, a future spec can add per-instrument variation (skips, rests, repeats) without changing the public mode contract.
- **No octave control**: Tim's vertical range may also be narrow. Y currently maps to dynamics; if dynamics turn out to be the wrong use of Y in session, a future spec can reassign Y. Out of scope here.
- **Songs without beats**: walk is silent on songs that have no `song.beats` (none of the four shipped songs are in this state, but added songs might be). Acceptable — walk requires beat data by design. Document this in the engine.
