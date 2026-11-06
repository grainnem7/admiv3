# Plan: "Rising Light", version 2

The composition is `docs/superpowers/specs/2026-11-06-demo-composition-v2-design.md`: read
it all first, then version 1's (`2026-11-06-demo-composition-design.md`), whose ambient
rules still hold. Carried out by **Claude Code** on the laptop (tasks D1 to D9) and
**Claude Desktop** in Ableton (tasks B1 to B5). Listening checkpoints for the owner: M1 to M3.

## Working rules (as before)

- Branch `instrument-look`; `git pull origin instrument-look` before each task; ask the owner
  before each commit and push. CLAUDE.md's rules: strict TypeScript, no `any`, Tone.js only
  in the engine, tests first for behaviour, plain language on screen, never port 3001 for
  tests, ADMI_DATA_DIR set to a temporary folder for test servers, never touch .admi-data.
- After every code task: `npm run lint`, `npm run test:run`, the demo e2e.
- Claude Desktop: a backup of the Set before each task, chain names, zones, transposes and
  the CC 30 mapping kept, a report of what changed on each track.
- Bump `DEMO_REVISION` whenever the demo's music changes (a laptop's older demo refreshes).

## Order

D1 to D5 (the engine) and B1 to B5 (the sounds) side by side; then D6 (the piece) and D7;
M1; D8 (Magenta freezing); M2; D9; M3.

## Claude Code: the engine

### D1. Sixteen scenes

`MAX_SCENES` 12 to 16 (`src/songs/performance/launcher.ts`), and every place that says
"Twelve scenes" (`BoardSequencerScreen.tsx`: the announcements and the disabled reason).
Check the storyboard, the scene grid and the iPad's scene pads still lay out with sixteen
(e2e: a piece with sixteen scenes shows them all and plays the sixteenth). Tests updated.

### D2. Loops that grow over four passes

A loop cell may say on which passes of every four it plays: `StoredLoopCell.passes?:
number[]` (values 0 to 3; absent = every pass), saved and made safe; carried through
`loopChannelsFor` like `conditional`. In the engine, where a cell's Variation flag is checked
(`firesThisLapPaged` in `fireCell` and the phrase path), a cell with `passes` plays only when
`lap % 4` is in it (the lap counted from the start, as Variation's is; scenes start on
multiples of four, so a scene's first pass is pass 0). The ring of a note to "the next note
that plays" must skip cells silent on this pass (as for Variation, see `silentThisPass` in
`fireStep`).
- Tests: a cell with `passes: [2, 3]` sounds on the 3rd and 4th passes of every four only; a
  long note before it rings on in passes 0 and 1.

### D3. Glow, and Lift in any key

`src/songs/harmony/currentChord.ts`: a named sequence `glow` = [I add9, IV seventh]
(degrees 0 and 3). Tests: in A major pentatonic (parent A major) it is Aadd9 then Dmaj7;
Lift in B major pentatonic is Bsus2 then C#madd9.

### D4. A fingerpicked guitar: a slow roll

A chord loop cell may set its own roll: `StoredLoopCell.roll?: number` (seconds between
strings, 0.03 to 0.2; positive low to high). `strumFor` is overridden by it in the engine's
chord path (internal sound and the `strumSec` sent to MIDI). Tests: a cell with `roll: 0.09`
sends its chord's notes 90 ms apart, low string first, all ending together.

### D5. Tim's glow: the player's counters on their own track

A config setting `playerTrack: number | null` (null = as now). When set, every note of the
player's own counters (live, not a loop, not the band, not a fill) goes out on that MIDI
channel in "one per part" mode, whatever its colour's job; nothing else does. The Ableton
plan sends nothing for chain selection there (Tim's glow is one instrument), only Space at
the world's reverb. Saved per player and made safe; the Connections tab shows it plainly
("Your counters play on their own track: MIDI channel 14"), with the Template checklist
naming the extra track. The demo sets it to 14.
- Tests: with `playerTrack: 14`, a placed melody, chord and bass counter all send on 14; a
  loop's notes, the band's and the extra notes keep their channels; null: as before.
- In ADMI's own sound (no Ableton), the demo player's colours play `synth:pad` (soft), so the
  counters are pad-like there too.

### D6. Magenta develops: a new idea every four passes

`src/songs/BoardSequencerEngine.ts`, the fill's key (near "A scene's Magenta idea for this
very board"): add the scene's four pass group (`Math.floor(passesIntoScene / 4)`) to the key
when a config setting `aiEvolves` is on (the demo sets it). Each group's idea is asked for,
kept and frozen like the scene's one idea is now (`aiIdeas` per scene, keyed); kept ideas
per scene raised from 6 to enough for the longest scene (two groups in an eight pass scene,
and the iPad's New idea may add more: keep the newest 8).
- Tests: with `aiEvolves`, passes 0 to 3 and 4 to 7 of one scene ask Magenta for two ideas
  and keep both; replayed, neither is asked for again; without it, as before.

## Claude Code: the piece

### D7. Rewrite `src/songs/demo/demoPiece.ts`

Exactly the composition's form table: sixteen scenes, keys A major pentatonic (root 69),
F sharp minor pentatonic (root 66) and B major pentatonic (root 71); chords Glow, Lift,
Float, Tide, Rise, Lift in B; band pads (and the sub) from the Brass scene on, the pedal on in
the Light and Shadow until the Heartbeat; Energy as written; `playerTrack: 14`, `aiEvolves`,
`fillEngine: 'magenta'`; ending `big`, two passes (the existing test of the ending's timing
must still pass: the ending begins on pass 72 and is silent by 7:00).

Loops (degrees in the scale of the scene's key, from the bottom row):
- **Percussion heartbeat**, **build**, **summit**: as now (soft; version 1's), but the
  opening's heartbeat grows over its four passes with `passes` (shaker from pass 2, the rim
  from pass 3).
- **Brass pad**: bass job, `trombone`, `overBass`, held 8 beats (`holdBeats`): degrees 0 and
  3 on step 0 every pass; degree 2 added on step 0 for passes 2 and 3 (`passes: [2, 3]`).
  Velocity about 0.4.
- **Guitar roll**: chord job, `guitarAcoustic`, `follows`, `roll: 0.09`: step 0 every pass,
  step 4 on passes 1 to 3. **Guitar picking**: the same on every step (eight a pass), the
  roll alternating up (0.09) on the beat and down (-0.07) between, velocities varying by
  step (1st 0.5, others 0.36 to 0.44, never two the same in a row).
- **Winds theme**: melody, `clarinet`, the composition's four pass table (`passes`), a touch
  behind the beat (layBack 0.03). **Winds high**: the same, `octave: 1`.
- **Bells**: as version 1, for the Rebuild.
- Retire the piano, lead, pulse and swell loops (their sounds stay in ADMI).
- Tim's colours in the demo (C9 of version 1): all play on Tim's glow via `playerTrack`; in
  ADMI's own sound, `synth:pad`, two beat notes, reverb send about 0.5.

Tests (rewrite as needed; keep version 1's ideas):
- The harmony check on every strong beat of every scene and pass of four (the `rubs` rule),
  in all three keys.
- Scenes on multiples of four passes, four passes long (eight for the last two), sixteen.
- Drums alone in the first scene (no band, no other loop); brass second; guitar third;
  winds fourth (the owner's order).
- No pop sequence (still, glow, lift, float, tide, rise only); no melodic note above 0.6
  velocity, no percussion above 0.6; every key pentatonic.
- Every scene differs from the one before; every loop of more than one note grows (has
  cells with `passes`) or is held.
- The Big finish's timing, and determinism (`demoMusic()` equal twice).

## Claude Code: Magenta frozen, measured, described

### D8. Freeze the evolving ideas

The owner rehearses (M2), keeps the ideas by ear (New idea on the iPad or the laptop for one
they don't like), backs up to a file; `scripts/freeze-demo-ideas.mjs` (already there) writes
every scene's ideas, now several per scene, into `src/songs/demo/demoIdeas.ts`. Test: a
frozen run never asks Magenta and plays the same notes twice (two MIDI probe runs compared
with `scripts/read-demo-midi.mjs`).

### D9. Words, and the measured run

Help, the performance guide, the Player chooser's line; the demo e2e (Drums first, Brass at
0:22). Run the MIDI probe and report pass by pass (Tim's glow channel 14 included when a
counter is placed in the probe).

## Claude Desktop: the sounds (Ableton)

Ambient first: soft attacks, long tails, one shared space, nothing with a hard edge.

### B1. Brass pads (Bass track, Trombone chain)

Make "Soft Brass + Pad" a true brass pad: a warm brass ensemble (horns and trombones
together), slow attack about 400 ms, release about 2.5 s, the warm pad layer up to about
6 dB under the brass, gentle low pass about 3.5 kHz, a long reverb send. It holds open
fifths for a whole pass: it should swell and glow, not speak.

### B2. A realistic guitar (Chords track, Acoustic guitar chain)

A natural, close, fingerpicked steel string acoustic (the most realistic one available,
with velocity layers and release samples), release about 1.2 s, a small room and a little
of the shared hall; take away the chorus added last time (it made it less real). ADMI rolls
each chord string by string like fingers.

### B3. Wind pads (Melody track, Clarinet chain)

An airy woodwind ensemble pad: flutes and clarinets together, slow attack about 300 ms,
release about 2.5 s, a little breath noise, low pass about 6 kHz, the shared hall.

### B4. Tim's glow: a new MIDI track on channel 14

A new MIDI track named "Tim's glow", input ADMIOutput, channel 14, Monitor In, one
instrument (no rack needed): a lush, soft pad with a gentle bell or glass at the start of
each note (attack about 30 ms for the bell, the pad swelling under it over about 800 ms),
release about 3 s, wide, a long send to the shared hall; level so a few held notes sit just
above the pads, never over the winds.

### B5. The finale's weight

On Band chords and Drums, check the Big finish's last chord (all instruments at once) is big
but not distorted: the master limiter catches it at about -1 dB, nothing clips.

## Listening checkpoints (the owner)

- **M1** after D7 and B1 to B4: the order and the light opening; does each scene bring
  something; is Tim's glow on top and blended?
- **M2**: rehearse with Magenta, New idea where an idea doesn't suit, keep the best; then D8.
- **M3**: a full run as the audience will hear it, Tim on the cap and the board.

Each checkpoint: the moments that don't work, with the time on the clock, and whether it is
the notes (Claude Code) or the sound (Claude Desktop).
