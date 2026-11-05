# Investigation: making the Board Sequencer sound good, always

**Date:** 2026-11-05
**Status:** Investigation; nothing built yet. Recommends five batches (S1 to S5) at the end.
**Question from the owner:** "A lot of the instrument sounds are quite fake and at times the
music created is quite jarring and unpleasant. How can we ensure it always sounds pleasing
and great? Do we need better AI than Magenta?"

## 1. Two problems, not one

"Fake" is about the sounds: what a note is made of. "Jarring" is about the notes: which
ones sound together, how loud, how many, and when. They have different causes in the
engine and different fixes, and neither is mainly an AI problem. This document looks at
what the engine does now, what research and practice say makes generated music sound
good, what would suit a board where counters are read by a camera and must sound within
20 ms, and what to build.

## 2. What the engine does now (read from the code)

### The notes
- Rows are scale degrees (`boardSequencerScale.ts`): every melody and bass note is in the
  chosen scale by construction. Pentatonic by default, so a wrong note is nearly impossible.
- One current chord per step for the whole instrument (`harmony/currentChord.ts`): chord
  counters, the scene's sequence, or the World's own progression. Chords are built from the
  scale's seven note parent in real thirds and voice led near a register centre
  (`harmony/harmony.ts`). On a strong beat a melody or bass note a semitone from a chord
  tone moves to the nearest chord tone (`fitToChord`).
- The band (`band/band.ts`) is pad, bass and groove, comes in a pass after the first counter,
  drops a part as soon as the player has a counter of that role, and builds with the number
  of counters. Keep on top (`band/keepOnTop.ts`) dips everything else 3 dB under the player's
  notes.
- Extra notes (`generative/rulesFill.ts`, Magenta `magentaFill.ts`) never sit on a sixteenth
  where that part already plays, come from the scale or the chord, and are capped at two
  per beat per part. Magenta's suggestions pass the same rules. New players start with
  Extra notes and Evolve at 0.
- Evolve (`audio/evolve/evolve.ts`) drifts brightness, blend, reverb, echo and place slowly,
  and every few loops changes an instrument or an octave.

So the harmony is already careful. The jarring does not come from wrong notes.

### The sounds
- 21 sampled instruments (`public/samples/instruments/`): Salamander piano, VSCO 2 CE
  winds and brass, Karoryfer sax and electric guitar, Iowa acoustic guitar, FreePats
  electric piano and choir pad, the tonejs-instruments strings and others. Each is a small
  subset: a handful of pitches per instrument, mp3, one dynamic layer, no round robin.
  Every note of a sampled flute is therefore the same recording at the same loudness,
  pitch shifted up to several semitones, and ended by a synthetic release.
- Seven synth layers (`audio/worlds/synthLayers.ts`): plain Tone.js synths. Lo-fi blends a
  sample with a synth; Electronic is synths only.
- Drums have round robins (`RoundRobinDrumKit`), which is why they sound the least fake.
- The mix: per colour gain, pan (studio mix), reverb and delay sends; a duck bus under the
  kick; the master chain is EQ, compressor, saturation, limiter (`MasterChain.ts`).

### What is missing
| Missing | What the ear hears |
|---|---|
| No check across parts within a step | melody, chords, loops, band and extra notes can land on tones that are in key but clash (a ninth against a third, two parts a semitone apart in the same octave) |
| No density limit | with several loops, the band, fills and the player on, something sounds on every sixteenth and nothing breathes |
| No metric accent or humanisation on the player's and loops' notes | every note the same loudness, exactly on the grid; the ear reads this as mechanical. The band and fills have accents; the counters do not |
| Register lanes only for the band | melody colours, loops and chords can crowd one octave |
| Single layer samples, few pitches, no round robin | the "preset keyboard" sound, worst on sustained strings and winds |
| Synthetic releases on sampled notes | the cut off tail after a long note |
| No ducking of pads and chords under the melody beyond Keep on top | mud when a pad and chords both hold under a tune |
| Reverb is one global send | long reverb on everything smears fast passages |

## 3. What research and practice say makes it sound good

- **Consonance is more than one thing.** Reanalyses find it comes from interference
  (roughness), harmonicity and familiarity together (Harrison, QMUL thesis; Parncutt and
  Ferguson). Roughness in the Plomp and Levelt sense is measurable from the notes sounding
  at a moment and correlates with listeners' dissonance judgements for harmonic sounds
  (earGram, INESC TEC). A 2026 preprint derives a dissonance cost from that model, checks
  it against Bach's own voice leading in 433 chorales, and uses it to generate voices.
  Practical reading: a cheap roughness score per step, used as a guard, is well founded;
  it must be voicing aware (an octave apart is not a clash, a semitone in one octave is).
- **Voice leading as distance.** Geometric models treat the move from one chord to the next
  as a distance to keep small (Tymoczko and others). The engine already does this for
  chords; the same idea applies to which octave a melody colour sits in.
- **Density and dynamics matter as much as pitch.** The generative ambient tradition (Eno's
  systems, Bloom, Generative.fm, Endel) sounds pleasing with very simple harmony because
  events are sparse, dynamics vary, and timbres are soft with long tails. Pleasantness is
  bought with space and shape, not with cleverer notes.
- **Scale locking is standard in accessible instruments** (AutoScale, EPFL; the adapted
  instruments survey; Skoog and others), and the known trade off is expressive range. The
  board already locks to a scale; the next step in that tradition is chord following,
  which the engine also has. Nothing in the literature suggests a model would do better
  here than rules for the in the moment choices.
- **Real time music models.** Magenta RealTime and Lyria RealTime are "live music models"
  that stream generated audio steered by text or audio prompts; Magenta RealTime 2 (June
  2026) claims about 200 ms control latency on device and responds to MIDI. ReaLchords and
  ReaLJam are reinforcement learned accompaniment models that follow a human melody online.
  These are real advances, but: they make audio or chords from what they hear, with
  latency in the hundreds of milliseconds to seconds; they cannot sound a counter 20 ms
  after it is put down; they take control of the texture away from the player; and they
  need a GPU or a paid API. For this instrument they are a possible band of the future, not
  a fix for fake or jarring. Magenta's MusicRNN, used today only for Extra notes behind
  the rules, is old but is not the cause of either problem.

## 4. What suits this board

Three facts about the instrument decide the approach:

1. **The player's notes must sound at once and unchanged.** Any guard must act on the other
   parts (band, loops, fills, chords), never on the counter that was just put down. The
   engine's "player is the foreground" rule is right and must survive.
2. **A step is the unit.** Everything that will sound on a step is known a step ahead in the
   scheduler. A roughness and density check per step is cheap (a few dozen notes at most)
   and deterministic, so it is testable and replays the same.
3. **The sound for a show comes from Ableton.** For the night, the Suite's instruments are
   the answer to "fake" and no browser library will match them. ADMI's own sound must still
   be good, because it is the fallback and the rehearsal sound, and because the research
   sessions use it.

Therefore: rules and mixing for pleasantness, better samples for realism, Ableton for the
show, AI left where it is.

## 5. Recommendation

### S1 Listen first (an hour with the owner)
Play until something jars; press Save session; note the World, the sounds and the moment.
Three or four such sessions become the fixtures the guards are tested against, and decide
the thresholds below. Without this the numbers are guesses.

### S2 The pleasantness guards (pure, tested, no new screen)
In the engine's step scheduler, after the player's notes are fixed and before the others:
- **Roughness guard.** Score the set of notes about to sound (Plomp and Levelt, summed over
  pairs of partials of the sounding pitches, voicing aware). If the score is over the
  threshold, drop or move the least important note: a fill first, then a loop's doubling,
  then a band pad tone, never the player's. A semitone clash in one octave between two
  parts is the common case; the fix is usually an octave shift of the lower priority part.
- **Density cap by Energy.** Calm: at most N sounding events per beat across all parts,
  Driving: more. Fills and loop doublings yield first. Silence on some sixteenths is the
  point.
- **Metric accents and humanisation for counters and loops.** Beat 1 and 3 a little louder,
  offbeats a little softer; velocity varied by a few percent and timing by a few
  milliseconds, seeded so a loop repeats the same way. Applies to ADMI's sound and to the
  MIDI velocities sent to Ableton, so the Suite's instruments play harder and softer too.
- **Register lanes.** Bass below C3, chords C3 to C5, melody above, loops' melody an
  octave apart from the player's when both sound.
- **Ducking under the melody.** Pads and chord colours dip a little under the melody's
  notes, as Keep on top does under the player.
Every guard has a unit test from a recorded jarring step (S1) that must come out clean, and
a check that the player's notes are untouched.

### S3 The sound batch (ADMI's own sound)
- Fuller sample sets for the eight most picked instruments: more pitches (every three
  semitones at most), two or three dynamic layers, two round robins where the source has
  them, and the real release tails as separate samples. Sources that allow bundling:
  VSCO 2 Community Edition (CC0), FreePats (CC0), Salamander (CC BY), Sonatina Symphonic
  Orchestra (check its licence before bundling), the Philharmonia samples (free for use;
  check the terms on redistribution), Karoryfer and Iowa as already credited. Licences
  recorded in `ATTRIBUTION.md` as now; nothing from Pianobook or Spitfire LABS, which are
  free to use but not to redistribute.
- A velocity aware sampler: Tone.Sampler plays one layer; a thin layered sampler that picks
  the layer by velocity and alternates round robins is a day's work. (sfizz in WebAssembly
  can play full SFZ instruments in the browser and is the route if we ever want whole
  libraries, but it loads everything into memory and is Chrome only.)
- Longer, softer sounds for the Warm and Ambient Worlds; Electronic kept as synths but with
  a touch of chorus and a slower filter so plucks are less brittle.
- Reverb per World rather than one send: short and bright for Electronic, long for Ambient.
Measured by the same recorded boards as S1, rendered before and after.

### S4 Ableton for the show
Already under way (the Ableton guide). The Suite's Orchestral packs, with Loud mapped to
Expression so a flute plays harder rather than only louder, are the realism answer. S2's
accents reach Ableton as velocities, so it benefits too.

### S5 Measure it
A short blind listening test: the same six boards rendered before and after S2 and S3,
rated for pleasantness by Tim, the owner and two others, in random order. Also a
pleasantness number per session from the roughness score, logged with the session, so a
change can be judged without a listening panel. This is a result for the thesis as well as
a check.

### Not recommended now
Replacing Magenta with a live music model. The Extra notes are the only AI use, they are
small, gated and off by default for new players, and the models that are better at music
are not better at being an instrument that answers a counter in 20 ms. Revisit when a
model can run on the laptop with no GPU and follow a MIDI stream at under 50 ms; Magenta
RealTime 2 is the one to watch.

## 6. Order and size
S1 an hour of the owner's time. S2 about a session, the thresholds set from S1. S3 a session
plus download and licence time. S4 in hand. S5 an afternoon with four listeners.

## Sources
- Harrison, P. (2020). Psychological and computational models of consonance. QMUL thesis.
  https://qmro.qmul.ac.uk/xmlui/handle/123456789/68149
- Parncutt, R. and Ferguson, S. Sensory dissonance and pitch commonality. https://static.uni-graz.at/fileadmin/_Persoenliche_Webseite/parncutt_richard/Pdfs/PaFe05_english.pdf
- Harrison and Pearce (2018). An energy based generative sequence model for testing sensory
  theories of Western harmony. https://arxiv.org/pdf/1807.00790
- earGram, roughness in algorithmic composition (INESC TEC). https://repositorio.inesctec.pt/handle/123456789/3584
- A dissonance cost from the Plomp and Levelt model, checked against Bach (2026 preprint). https://www.pacm.princeton.edu/sites/default/files/2026-05/Isha%20Yerramilli-Rao.pdf
- AutoScale: automatic and dynamic scale selection (EPFL). https://infoscience.epfl.ch/record/290882
- Expanding access to music technology: adapted instruments (arXiv 2011.09143). https://arxiv.org/pdf/2011.09143
- Magenta RealTime 2 model card. https://huggingface.co/google/magenta-realtime-2
- Lyria RealTime and live music models, summaries. https://www.emergentmind.com/topics/lyria-realtime
- sfizz as a WebAudio library. https://github.com/sfztools/sfizz-webaudio
- sfz web player (CC0). https://github.com/sfzlab/sfz-web-player

## Status
- **Measured (5 Nov).** The MIDI ADMI sends for four typical boards, captured through a fake
  Ableton port, read as notes: 9 to 15 notes a second; only 4 to 7 distinct velocity values
  in fifteen seconds, most notes at the same loudness; the chord track and the band's pad
  each sent two notes a tone apart in one octave (the add9 and sus2 colours voiced close)
  in a quarter of the moments. Since the sound is Ableton's, this stream is what matters.
- **S2, first part built (5 Nov).** `songs/dynamics.ts`: a metric accent (the first step of
  the pass strongest, the middle next, on-beats, off-beats) and a small fixed variation per square
  (not per pass: a scene must play the same however it is reached), on every counter's and loop's note, in ADMI's sound and in the MIDI
  velocities; a phrase keeps its own accents and only varies. `harmony.ts` `openVoicing`:
  no two chord tones a tone or less apart in one octave, on the chord colours and the
  band's pad (also after the pad is folded into its range). Captured again with the
  per square variation: 15 to 16 distinct velocities per board (4 to 7 before), the chord
  track's own clashes gone; what remains is a
  melody note a tone from a chord tone now and then, which is music. Not yet: the density
  cap, register lanes, ducking under the melody.
- **S2, second part built (5 Nov): density.** `songs/density.ts`: a cap on the loops' pitched
  notes per step from Energy (Calm 2, Steady 3, Lively 4, Driving 6), applied only while
  the player has counters on the board (it makes room for the player; an empty board lets
  the loops play whole); the player's notes never counted, never dropped; a chord counts
  as one, and the loops' chords and bass are admitted before their melodies, so a full
  step loses a third melody line, never the harmony. A loop's single note that doubles a
  pitch the player plays on the same step is not played (a chord only when the player has
  every note of it). A lane: while the player's melody is on the board, a loop's melody
  plays an octave up. Wired into the step for one-note counters, chords, bass and the
  tunes. Measured honestly, with three loops under the player at Steady: because layered
  melodies already take turns, the loops put chord, bass and one melody on a step, which
  is the Steady cap, so nothing was dropped and the notes a second stayed at 14; at Calm
  the cap bites. The chaos on that board is the player's own six counters, the band's pad
  (four notes) and the loops' chord (four notes) together: the next lever is the pad
  standing aside while a chord colour sounds, which the "as before" jobs do and the
  default jobs do not. The band starts Quiet for a new player already, and Extra notes
  at 0.
- **S2, third part built (5 Nov): the bed under the chords.** While a chord colour sounds
  (the player's or a loop's), the band's pad thins to the root and the fifth, a bed under
  their chord rather than a second copy of it; and a loop's chord is a plain triad (root,
  third, fifth), its colour tones, the ninths and sevenths that reached up into the
  melody's octave, left to the player's own chords. Measured with three loops under the
  player at Steady: notes a second 14.0 to 12.7, the busiest moment 11 notes to 8, clashes
  inside an octave 15% to 10% of moments. Still to do: ducking of pads under the melody in
  ADMI's own sound, and the listening test (S5).
- **S2, fourth part built (5 Nov): the loops as a player delivers them.** `songs/breath.ts`:
  over four passes a kept loop plays as kept, a little louder, the peak, then softer with
  its melody's last note lifted (and, with a lot of variation, the one before the middle),
  the amount being Loops vary, so 0 is exactly as saved; the phase is the engine's own pass
  count, so a scene plays the same however it is reached. A loop answering the leading
  melody (the turn taking that already exists) now sits an octave above it. Each World has
  a density step: Ambient one loop note fewer per step, Electronic one more. On the last
  beat of any lead in, the bass steps up to the fifth below the root, an approach the ear
  hears as an arrival. New players keep Loops vary at 0 by the project's own rule (they
  hear only their counters), so the breathing is heard once Loops vary is turned up.
- **S2, fifth part built (5 Nov): development.** `songs/development.ts`: a kept loop has a
  sixteen pass arc, four cycles of four: as kept; the lift (the melody one row higher in
  the second half of the pass); the turn (the melody mirrored around its own middle row);
  the thinning (the melody on the on-beats only, the bass and chords whole, the whole
  figure home on the last pass). The amount is Loops vary: under a quarter nothing, up to
  six tenths the lift and the thinning, above that all three. The player's counters are
  never touched; the pass count is the engine's own. Magenta's variation model (MusicVAE,
  already loaded for the fills) is the natural next source of a cycle's figure: a
  "similar" sequence fitted to the rows, kept per scene as the fills are. Not built yet.
