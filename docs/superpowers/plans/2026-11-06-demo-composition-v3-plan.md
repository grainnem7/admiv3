# Plan: "Rising Light", version 3

The composition: `docs/superpowers/specs/2026-11-06-demo-composition-v3-design.md`. Read it
all, and version 2's spec and plan: version 3 uses all of version 2's engine work (D1 to D6:
sixteen scenes, `passes`, Glow, the roll, Tim's glow, Magenta every four passes). If any of
D1 to D6 is not done yet, do it first, as written in the version 2 plan.

Carried out by **Claude Code** on the laptop (G1 to G5) and **Claude Desktop** in Ableton
(H1 to H3), side by side. No listening checkpoints. Working rules as in version 2's plan
(pull first, ask before each commit and push, CLAUDE.md's rules, lint and tests after every
task, bump `DEMO_REVISION`).

## Claude Code

### G1. A "Stop" lead in

`src/songs/band/bandJobs.ts` (`LeadIn`, `LEAD_INS`, `LEAD_IN_WORDS`: "Stop: the last two
beats before the scene are silent, then it crashes in.") and the engine's lead in
(`cueLeadIn`, `fireLeadIn` in `BoardSequencerEngine.ts`). For a `stop` lead in, in the last
two beats before the landing beat nothing sounds: loops, band, extra notes and the drums
(the player's own counters still do: it is his moment). Over MIDI, send nothing new in those
beats (notes already ringing end at their time; pads may ring on). Scenes may use it like
the other lead ins.
- Tests: with a stop cued for beat 16, beats 14 and 15 send no loop, band or fill note; beat
  16 sends the scene's notes; the player's counter on beat 14 still sounds.

### G2. A driving bass for the band

`BandJobs.drive?: boolean` (saved, made safe). With it, the band's bass plays the chord's
root (in its bass register) on every eighth (two notes a beat, the second half a beat on),
the first of each bar accented (1.0, the others 0.7), each note 0.45 beats long; the pedal
option, if also on, holds the key note instead. Tests: eight notes a bar on the root; with
the chord changing, the root follows on the next eighth.

### G3. Drum loops on a sixteenth grid

Nothing new in the engine should be needed (drum loop cells with one kit piece each and
`timingBeats` of 0.25, 0.5, 0.75, rows distinct within a step, `passes` for the growth). Add
an engine test that a drum loop with four cells on one step (offsets 0, 0.25, 0.5, 0.75)
sends four hits a quarter beat apart, and over MIDI too (no two collapsed by the flam guard:
the guard is 15 ms and a sixteenth at 87 BPM is 172 ms).

### G4. The piece: `src/songs/demo/demoPiece.ts`

The composition's thirteen scenes exactly: keys (A major pentatonic 69, F sharp minor
pentatonic 66, F sharp major pentatonic 66 for the Tension, B major pentatonic 71), chords,
energy, ways in (Stop into the Intrigue, Groove II and the Summit; drum fill or rising lead
ins where the drums return), the band's jobs (pads always; the bass pedal in the opening and
the Intrigue, `drive` in the grooves, the drop, Groove II and the summit).

The drum loops as written in the composition (tribal, groove, half time, double time,
heartbeat, rebuild, snare roll), converted to steps and `timingBeats` (a beat position p is
step `Math.floor(p)` and offset `p - Math.floor(p)`), velocities: tribal and heartbeat 0.3
to 0.45, groove 0.45 to 0.6, double time and roll up to 0.7, crashes 0.6. The pitched loops
as the composition says (brass held, brass swells, guitar roll and picking, winds and winds
high, bells in threes: C#, B, A on every third eighth, written as cells with offsets).

Tests (update version 2's):
- The harmony check on every strong beat of every scene and pass of four, in all four keys.
- Thirteen scenes, starting on multiples of four passes; the drums alone in the first; the
  order brass, guitar, then the grooves; Stop where written; the Big finish's timing.
- The ambient rule only in the dreamy scenes (Drums, Brass, Guitar, Breakdown): no note
  above 0.6 there; in the others percussion up to 0.7.
- Every scene differs from the one before; the drums' feel changes at least five times over
  the piece (tribal, groove, half time, double time, heartbeat).
- Determinism.

### G5. Magenta, words, and the measured run

- Rehearse once with Magenta (a test server with ADMI_DATA_DIR in a temporary folder, never
  port 3001), and freeze its ideas into `src/songs/demo/demoIdeas.ts` (the D8 script).
- Help, the performance guide, the Player chooser's line, the demo e2e (the first scene is
  Drums, the Groove lands at 1:06).
- Run the MIDI probe and report pass by pass, including the stops (two silent beats before
  2:12, 4:02 and 5:08) and the driving bass on channel 12.

## Claude Desktop (Ableton)

### H1. A kit that can be both soft and exciting (Drums, World: Warm kit)

The same notes as before, now with energy where it is played hard:
kick 36 warm and round but with punch at high velocity; snare 38 a real snare with body (soft
at low velocity, cracking a little at high); clap 39 a layered clap with a short room (it
doubles the snare in the grooves); hat 42 a crisp closed hat that is soft at low velocity;
tom 45 big cinematic toms; crash 49 a real, bright but not harsh crash; rim 37 a wooden
click. Velocity should change the sound (layers or a filter), not just the level, so the
tribal opening stays soft and the drop hits. The kit up to the pads' level in the grooves.

### H2. The driving bass (Band bass, World: Warm chain)

Keep the upright for the held notes if it sounds good, but the drive plays eighth notes:
a warm, round synth bass works better for that (a filtered saw or a Moog-like bass, short
release about 0.2 s, mono). If one chain must do both, choose the synth bass, with a slow
filter so held notes are soft.

### H3. Sidechain and glue

A gentle sidechain from the kick on Band chords and Chords (about 3 dB), so the pads pump with
the groove; the master glue compressor and limiter at about -1 dB so the drop and the Big
finish are big without distortion.
