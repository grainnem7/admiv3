# One shared harmony, a band with jobs, and a piece with a shape

28 Oct 2026. From the musician-tester's review (scratchpad team/musician/musician-report.md)
and the owner's choices in chat. The owner's own choices are marked **(owner)**; my calls are
marked **(my call)** and can be overruled.

## Why (verified in the code)

- **There is no single "current chord".** Several parts each work out their own harmony:
  - one-note chord counters play their own triads (`chordStack`, E:1947);
  - tune-mode parts follow `harmonyAt` (phrases.ts:334);
  - the band follows `harmonyForBand`, which in one-note mode is the world's fixed
    I–vi–IV–V7 (band.ts:97) whatever the board plays;
  - one-note melody and bass follow only the scale.
  So the band clashes with Tim's chords, a semitone apart.
- **One chord counter can stop the music moving.** One tune-mode chord counter replaces the
  whole progression, since it owns every step through `ownerCol` (phrases.ts:293–297). The
  piece sat on G7 for 3½ minutes.
- **The progression is always 4 chords per loop**: a 2-bar cycle at the defaults, repeated
  about 75–80 times.
- **The band leaves every part Tim takes** (band.ts:69–87) and ignores loops. With bass,
  chord and drums down, "Full" plays nothing. "Full" only means louder.
- **The piece's shape is upside down.** Scene sound, band and extras changes land mid-bar
  while loops wait for the pass. The sound worlds set loudness, so the quiet Ambient opening
  is louder than the Warm build, and the climax hits the limiter.
- **The AI changes every rehearsal**, so a rehearsed piece isn't the one performed.

E = `src/songs/BoardSequencerEngine.ts`. Line numbers are as of 11e7eb7.

## Goals (three stages, each built and verified on its own)

### Stage 1: one shared harmony

- **One current chord for the whole instrument**, worked out once per step, that every
  pitched part plays to: one-note and tune-mode counters, loops, the band, Extra notes (the
  simple rules and Magenta), and Evolve's pitch drift. A locked backing song still overrides
  everything, as today.
- **Each scene chooses a chord sequence from named choices (owner)**, with how long each
  chord lasts: 1, 2 or 4 bars.
  - **Suggested set (my call; the builder may refine the voicings per sound world):**
    - Calm: I–IV
    - Rising: I–V–vi–IV
    - Dreamy: I–iii–IV–iv
    - Tense: vi–IV–I–V, with sus chords
    - Home: IV–V–I
    - Still: a drone on I
  - **Default per sound world:** what it plays today, but stretched to 2 bars per chord
    **(my call)**, so pads have time to bloom.
  - A scene's sequence starts at the scene's first pass.
- **Tim's chord counter changes one chord (owner).**
  - A chord counter in a column sets the chord for its own part of the bar: from its column
    to the next chord counter, or to the end of the pass. Everything else follows the
    sequence.
  - The counter's row picks the chord, as today. One counter no longer owns the whole loop.
  - The same applies in one-note and tune modes, and a loop's chord counters work the same
    way.
- **Melody and bass in one-note mode** keep their row's scale note. On strong beats the
  note is nudged to the nearest chord tone when it would clash (a semitone against a chord
  tone) **(my call)**, so it never fights the chord but Tim's choice still sounds as his.
  Calibratable on and off.
- **Scene changes land on the pass.** A scene's sound world, band and extras change at the
  same pass boundary as its loops. Glides and colour entries are unchanged.

### Stage 2: a band with jobs

- **Each scene chooses the band's jobs:** Pads, Bass, Drums and Counter-melody, each on or
  off. The level is Quiet or Full. "Make my plan" sets jobs that build: Arrival pads; Build
  pads and bass; Open all four; Home pads **(my call)**.
- **The band keeps its jobs whatever Tim plays**, fitting around him instead of leaving:
  - **Pads** are voiced away from the register of Tim's and the loops' chord parts.
  - **Drums** complement the board's drums: the band fills the steps they leave empty. A
    band hit may still land on the same beat as one of Tim's; that is fine (owner, 2 Nov
    2026: the owner and Tim don't mind it), and no test asks otherwise.
  - **Counter-melody** plays in the gaps of Tim's melody, in a different register, never on
    his notes.
  - **Bass:** one bass at a time **(owner)**. When Tim's (or a loop's) bass plays, the
    band's bass steps aside, and it comes back when his lifts.
- **The band hears the loops too.** Doubling a loop's part is avoided the same way as
  Tim's.
- **Lead-in, an option per scene (owner: "maybe an option"):** in the last pass before the
  scene, None, Drum fill or Rising. The default is None.
- **Keep Tim on top (owner approved #11):** while Tim's own notes sound, the band, the loops
  and the extras dip a little (default 3 dB, calibratable; a short attack and release), so
  his playing is always heard. On by default.

### Stage 3: a shape across the piece, and an AI that repeats

- **Sound worlds matched in loudness.** Each world is measured and normalised, so a world no
  longer decides how loud a scene is.
- **Energy per scene, 1 to 5 (owner approved #8).** One setting that shapes level,
  brightness and density together: the band level, how busy the drums and extras are, and
  the brightness (filter). "Make my plan" draws a build: 2, 3, 5, 2. The scene list shows
  the line of Energy across the piece as a small graph. Headroom is kept so 5 never hits the
  limiter.
- **The same AI each rehearsal (owner approved #12).**
  - Every random choice (the band's variations, the rules fill, Evolve) is seeded per piece
    and scene, so a rehearsal plays back the same unless asked.
  - Magenta's ideas are kept per scene once made, and reused on the next run.
  - A **"New ideas"** button (per scene, and for the whole piece) reseeds. A switch
    **"Surprise me each time"** restores today's behaviour.
- **Tunes made easy (from the review):** "One note / Tune" for each colour moves onto the
  Sound tab beside the colour. New players start with tunes on for melody, bass and chord
  colours **(my call)**. Existing players keep theirs.

## Non-goals

- No key changes in this work: a scene lift, idea #9, can come later.
- No change to how loops are made or kept, the clock, the ending, or colour entries.
- No new AI model. Magenta stays the same model, better used.
- No question-and-answer and no returning theme **(owner: Tim can't make phrases fast
  enough)**.

## Anti-goals

- Wrong notes **introduced** by the shared harmony: a clash that wasn't there before.
- Tim's choice being overridden so far that he can't hear his own change. His chord counter
  must audibly change the chord, and his melody note stay recognisably his.
- A band at Full that is quiet, or one at Quiet that buries Tim.
- Existing pieces changing character with no way back. Every new default that changes
  existing sound gets a plain "as before" choice: sequence "As before", jobs from the old
  level, Energy off.
- Extra per-step cost that risks the timing (see the keeping-time work). Harmony is worked
  out once per step, not per voice.

## Left to the builder

- Voicings and register rules.
- The exact clash-nudge rule.
- The ducking curve.
- How the seed is stored and how Magenta ideas are cached.
- The loudness measurement method.
- The Energy mapping.
- The UI layout of jobs, sequence and Energy in the scene editor.
- Wording within the plain-language rule.

List each choice in the report.

## Tests that prove it

Unit tests, pure where possible:
- **The current chord** at every step: for a scene sequence; with one chord counter
  (changes only its part); with two; with a loop's chord counter; with a locked song.
- **No clash:** across a full sequence, every band, fill and one-note pitch played on a
  strong beat is a chord tone or a non-clashing scale tone (a property test over random
  boards).
- **Band jobs at Full** with Tim on bass, chords and drums: pads, drums and counter-melody
  still play; the bass steps aside, then returns.
- **Drums:** no band drum hit on a step where the board has a drum.
- **Changes on the pass:** a scene's world and band arrive on the pass.
- **Ducking:** the gain dips while Tim's note sounds, and recovers.
- **Seeds:** two runs of the same scene give the same band, fill and evolve notes; New ideas
  changes them; "Surprise me" makes them differ.
- **Energy:** levels rise with Energy, and 5 stays under the limiter's threshold.
- **Old configs:** load "as before".

e2e tests: a piece with two scenes in different sequences, played through:
- the chord follows the sequence;
- Tim's chord counter changes one chord, heard in the engine's note reports;
- the band plays at Full with Tim covering three parts;
- the world change lands on the pass;
- a second run's notes match the first.
