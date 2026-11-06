# Plan: building "Rising Light", the composed demo piece

The composition is `docs/superpowers/specs/2026-11-06-demo-composition-design.md`: read it
first, all of it. Above all it is **ambient first** (soft in, long out, nothing hits, one
pentatonic scale for everything, Tim's counters as ambient voices) and **never boring**
(something changes every pass, every 4 bars and every scene, with a shape of real drama). This plan is carried out by **Claude Code** (on the show laptop, VS Code:
the code, tasks C1 to C9) and **Claude Desktop** (in Ableton: the sounds, tasks A1 to A7).
The owner listens at each checkpoint (L1 to L3).

## Working rules

- Branch `instrument-look`. `git pull origin instrument-look` before starting each task.
  The cloud session that wrote this plan has stopped working on the branch; Claude Code on
  the laptop owns it now. Ask the owner before each commit and push (CLAUDE.md).
- Repository rules (CLAUDE.md): TypeScript strict, no `any`; all Tone.js inside the engine;
  tests first for behaviour; plain language in everything the owner sees; never use port
  3001 for tests (it is the owner's running ADMI); test servers set ADMI_DATA_DIR to a
  temporary folder; never touch .admi-data; subagents Opus or Sonnet only.
- Checks after every code task: `npm run lint`, `npm run test:run`, and the demo e2e
  (`npx playwright test e2e/demoPiece.e2e.ts`).
- Claude Desktop: save a backup of the Set before each task (Backup folder, named after the
  task), keep every chain's name, zone, transpose and the CC 30 mapping, and report what it
  changed on each track.

## Order

A1 to A3 and C1 to C3 can go side by side. Then C4 (the piece) and C9 (Tim's counters), L1,
C5 to C6 (Magenta), A4 to A7, L2, C7 to C8, L3.

## Claude Code tasks

### C1. Chord vocabulary: Tide and Rise

`src/songs/harmony/currentChord.ts`.
- Two chord kinds from the key's own notes: `seventh` (the triad and the scale's seventh
  above the root: Dmaj7 on VI in F sharp minor) and `ninth` (the triad, the seventh and the
  ninth: Bm9 on iv). Use the scale, like `add9` does, so they never bring in a note from
  outside the key.
- Two named sequences: `tide` = [i add9, VI seventh, iv ninth, i add9] (degrees 0, 5, 3, 0)
  and `rise` = [VI seventh, VII sus4, i add9, i add9] (degrees 5, 6, 0, 0), with plain words
  in `CHORD_SEQUENCE_WORDS` (Tide: "The night: home, VI, the minor iv, home, each with its
  colour." Rise: "The climb: VI, VII, up to home.").
- Tests: in F sharp minor (root 66, natural minor) Tide is F#madd9, Dmaj7, Bm9, F#madd9 and
  Rise is Dmaj7, Esus4, F#madd9, F#madd9 (by symbol and by pitch classes); a key without a
  note for the seventh or ninth falls back to the plain chord.

### C2. The pulse on the Bass track: Synth pluck as a bass sound

`src/ui/screens/boardSequencer/soundCatalogue.ts` (BASS list) and `src/midi/abletonSounds.ts`.
- Add `synth:pluck` to the bass sounds, so the Bass track's rack holds Synth pluck (ADMI's
  chain index 27, the 28th chain in Ableton) as a real instrument and ADMI may send the Bass track there (`filledChains`,
  `abletonChecklist`). Keep the chain list itself unchanged.
- Tests: `filledChains(2, ...)` contains 27; the checklist marks Synth pluck real on Bass.

Chain numbers in the Ableton tasks below count from 1, as Ableton shows them (ADMI's index
plus one): Piano 5, Bells 16, Synth pluck 28, Synth keys 29, Soft synth pad 30, Wide synth
chords 31, Sub bass 32.

### C3. A pedal for the band's bass

`src/songs/band/bandJobs.ts`, `src/songs/band/band.ts`, scene settings.
- `BandJobs.pedal?: boolean`: when on, the band's bass plays the key note (the scale's root,
  in its bass register) whatever the chord. Saved and made safe like the other jobs.
- Tests: with pedal on, over Tide the band's bass is F# on every chord; off, it follows the
  roots (F#, D, B, F#).

### C4. The piece: rewrite `src/songs/demo/demoPiece.ts`

Write the piece exactly as the composition says, in the same style as the file now (loops
built with `notes()` and drum loops, scenes in `DEMO_SCENES`, every loop note named and
commented musically). Bump `DEMO_REVISION`.
- Player settings: key F sharp minor pentatonic (root 66, `Minor pentatonic`; the chords
  come from its parent scale, F sharp natural minor), 87 BPM, `fillEngine: 'magenta'`,
  `surpriseMe: false`, `bandWithLoops`, `widePads`, `variationEnabled`, `clashNudge: false`,
  `loopVary: 0.2`, `space: 0.75`, ending `{ lengthSec: 420, ending: 'auto', style: 'chord',
  fadePasses: 2 }` (with the chord ending the last scene's eighth pass ends at pass 72 and
  the chord rings by 7:00: keep the test that checks this, adapted).
- Loops (16 slots at most):
  Degrees below are steps of the pentatonic scale from the bottom row (0 = F#4, 1 = A4,
  2 = B4, 3 = C#5, 4 = E5, 5 = F#5, 6 = A5, 7 = B5), as in the composition's tables.
  - **Bells**: melody, `synth:bell`, `octave: 1`, held 4 beats: C# (3) on step 0, A (1) on
    step 4.
  - **Piano theme**: melody, `piano`: the question on every pass, the answer added on every
    other (see the composition's table), a touch behind the beat (layBack 0.02).
  - **Lead theme** and **Lead theme high** (`octave: 1`): melody, `synth:keys`, the same notes.
  - **Pulse**: bass job, `synth:pluck`, `octave: 1`, `overBass`: two counters a step, the
    second with `timingBeats: 0.5` (rows must differ within a step, and they do).
  - **Pulse quarter**: bass job, `synth:pluck`, `octave: 1`, `overBass`: steps 0, 2, 4, 6,
    degrees 0, 3, 1, 3 (F#, C#, A, C#; in the major F#, C#, G#, C#).
  - **Swells**: chord, `synth:pad`, `follows`, held 8 beats, step 0.
  - **Pulse chords**: chord, `synth:supersaw`, `follows`: steps 0, 3, 6, and 4, 7 on every
    other pass.
  - **Percussion heartbeat / build / summit**: drums, one kit piece per counter (`sound` =
    the piece: kick, rim, snare, hat for the shaker, tom, crash for the cymbal swell;
    `plays: 'note'`), off beats with `timingBeats: 0.5`, every other pass hits marked
    `conditional`, rows distinct within a step. Soft: velocities about 0.3 to 0.45 for the
    heartbeat, never above 0.6 at the summit; the shaker about 0.2.
  - Every melodic loop no louder than about 0.6; the pads lead.
- Scenes: the composition's form table exactly (pass, loops, key, chords, band level and
  jobs with the pedal where it says, fill amount, energy, way in, lead in). The Afterglow
  key is F sharp major pentatonic (`Major pentatonic`, root 66), chords Float.
- Retire the trombone, clarinet, harp and guitar loops from the demo (the sounds stay in
  ADMI for players).
- Tests (rewrite `src/__tests__/demoPiece.test.ts` and the demo engine tests):
  - The harmony check: on every strong beat of every scene, no written note rubs against
    the chord the pads hold (the `rubs` rule now in the test: a semitone from a chord note,
    except a high ninth or major seventh). Notes with `timingBeats` off the beat are not on a
    strong beat.
  - Scene times on multiples of four passes; no scene longer than eight passes; the melody
    track never has two instruments in one scene; the theme's notes are as written (the
    question and the answer, by pitch, in F sharp minor and in F sharp major).
  - The pulse sends sixteen notes a pass, eighth notes apart (engine test).
  - No pop sequence: every scene's chords are still, tide, rise or float.
  - Ambient: no melodic loop note above 0.6, no percussion note above 0.6; every scene is in
    a pentatonic key.
  - Never boring: every scene differs from the one before in its loops, its chords or its
    key; no scene longer than eight passes.
  - Determinism: `demoMusic()` equal twice.

### C5. Magenta ideas that replay for any player

`src/songs/BoardSequencerEngine.ts` (the fill key near "A scene's Magenta idea for this very
board"). The key a kept idea is matched by includes every colour's id and how it plays, so
an idea kept with one player never replays with another player's colours. When the board
has none of the player's counters on it (only loops), leave the colours out of the key.
- Test: an idea kept for a scene with one player's colours replays for another player's
  colours when only loops play; with the player's counters on the board, as before.

### C6. Freezing Magenta's ideas into the demo

- A small script `scripts/freeze-demo-ideas.mjs` that reads a backup file (Make a piece's
  "Back up to a file") and writes each demo scene's kept ideas (`aiIdeas`, by scene id) to
  `src/songs/demo/demoIdeas.ts` as data.
- `demoScenes()` attaches them, so every run replays them from the first.
- The workflow, for the owner, in plain words in Help: rehearse the demo once or twice with
  Magenta on; press New idea in a scene to hear another; when the ideas are good, back up to
  a file and ask Claude Code to freeze them.
- Tests: a scene with frozen ideas plays them without asking Magenta (engine test with the
  Magenta mock never called); the script round trips a sample backup.

### C7. Verify by measurement

Run the MIDI probe (`MIDI_DIR=... npx playwright test e2e/zz-demo-midi.e2e.ts` with the
local Playwright config) twice and compare: the note streams must be the same (the
determinism the owner asked for), the pads and the pulse in range, no note left without an
off, "falling behind" never shown. The reading script is in the cloud session's scratchpad;
rewrite a small one in `scripts/` if needed. Report pass by pass what plays.

### C9. Tim's counters, as ambient voices

`src/profiles/BoardProfiles.ts` (`openDemoPlayer`) and the demo's settings.
- The demo player keeps Tim's colours (their roles and which colour is which), but gives
  each an ambient voice for the demo: a melody colour plays `synth:keys` (the soft lead; a
  second melody colour `synth:bell`), a chord colour `synth:pad`, a bass colour `synth:sub`;
  a drums colour keeps its kit piece. Each plays one note per counter (`plays: 'note'`), with
  a high reverb send (about 0.5). His own player is untouched.
- The demo's Note length: 2 beats (`noteLengthBeats`), so his notes ring into the pads.
- Because the whole piece is pentatonic, whatever he places is in the key.
- Tests: the demo player's melody, chord and bass colours have those sounds; his own player
  keeps his; a counter placed anywhere on the board in any scene is a note of that scene's
  pentatonic scale.

### C8. Words

Help ("The demo piece"), `docs/performance-guide.html`, the Player chooser's line under
"Open the demo piece": the new piece, plainly. Update `e2e/demoPiece.e2e.ts` (the first
scene is Dawn; Theme at 0:44).

## Claude Desktop tasks (Ableton)

Set Ableton's tempo to 87 BPM in the template, so synced delays and LFOs fit the piece.

Ambient first, for every sound: soft attacks, long tails, everything in the same large space,
nothing with a hard edge. These sounds are also what Tim's counters play in the demo.

### A1. Melody track: the theme's three voices

- **Piano** (chain 5): a soft felt piano, close and warm (felt or "una corda" character),
  release about 1.5 s, a gentle room, low pass about 7 kHz.
- **Bells** (chain 16): glass bells or celesta with a long tail (3 to 4 s), a quiet shimmer.
- **Synth keys** (chain 29): a soft singing lead (warm saw or triangle, slow attack 80 to
  150 ms, gentle vibrato after half a second, low pass about 4 kHz, plenty of reverb).

### A2. Bass track: the pulse

Fill **Synth pluck** (chain 28 in Ableton's 1 based count, ADMI index 27) on the Bass track
(it is a placeholder there now): a soft, round pluck (short decay, filter envelope, a little
stereo width), and a delay synced to dotted eighths (at 87 BPM: 517 ms) at about 20 percent.
Low cut at about 120 Hz, so it never fights the sub.

### A3. Chords track: swells and pulse chords

- **Soft synth pad** (chain 30): a swelling pad, attack about 1 s, release 2.5 s.
- **Wide synth chords** (chain 31): soft supersaw chords, short attack, release about 0.8 s.
- A sidechain compressor on the Chords track keyed from the Drums track's kick, gentle
  (about 3 dB of pumping), so the chords breathe with the kick.

### A4. Drums: soft ambient percussion

On the Drums track's World: Warm kit chain (the demo plays the warm world), at ADMI's notes:
kick 36 (a soft, deep heartbeat, felt more than heard), rim 37 (a soft wooden click in a big
room), snare 38 (brushed, soft, roomy, never cracking), hat 42 (a shaker breath, very soft),
tom 45 (deep toms like distant thunder, long reverb), crash 49 (a cymbal swell: a reversed
or bowed cymbal that rises, not a crash). The whole kit about 6 dB under the pads, with a
long reverb send. Keep the kit's chain and zone.

### A5. Pads and sub

- **Band chords** (all four World chains): keep the pads, add slow movement (a slow filter
  or wavetable sweep over about 8 s) and width.
- **Band bass** World: Warm: a pure sub (sine, a touch of saturation), mono, nothing above
  about 200 Hz.

### A5b. Sub bass for Tim's counters

On the Bass track, fill **Sub bass** (chain 32) if it is a placeholder: a warm sine sub with
a soft attack, mono, nothing above about 200 Hz (Tim's bass colour plays it in the demo).

### A6. Extra notes (Magenta)

All four World chains on Extra notes: a glassy sparkle (bell or plucked glass), ping pong
delay synced to eighths at about 25 percent, reverb, high pass at about 300 Hz, about 6 dB
below the theme.

### A7. The whole mix, and Tim's Tone

- Return A: a long hall (3 to 4 s) for the pads and the theme.
- Master: a gentle glue compressor (1 to 2 dB) and a limiter at about -1 dB.
- Check that **Bright** (CC 25) opens and closes the Auto Filter on every track, including
  Band chords, Band bass and Extra notes, so Tim's cap (Tone) sweeps the whole band.

## Listening checkpoints (the owner)

- **L1, after C4 and A1 to A3:** the shape. Does the hush land? Does the climb to the summit
  feel like a climb? Is the theme memorable after one listen?
- **L2, after A4 to A7 and C5 to C6:** the sound. Rehearse with Magenta, keep the best
  ideas, freeze them.
- **L3, after C7 and C8:** a full run as the audience will hear it, with Tim on the cap.

Each checkpoint: note the moments that don't work with the time on the clock, and whether
it is the notes (Claude Code) or the sound (Claude Desktop).
