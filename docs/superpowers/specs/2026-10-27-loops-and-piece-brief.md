# Brief: making loops and building the piece (group D)

*2026-10-27. What the owner needs, in her words where possible, plus what the software does today.
This brief is the input to a user-flow design; it is not the design.*

## The people

- **Tim**: the player. Cerebral palsy, left-handed, cannot dwell-hold or shake fast. He composes
  with coloured counters on a real board read by a camera. On the day he is at the **iPad**, with
  the board in front of him.
- **The owner (Grainne)**: a researcher and performer, not a programmer. On the day she is at the
  **laptop**. She also builds the piece on the laptop before the show.
- **Chris**: mentioned by the owner; role not yet known.

## What the owner said (2026-10-27)

- "When I clear the board to create a new loop, and for example place two greens as violin, I am
  immediately met with a clatter of other sounds. I should be able to create a loop from silence
  surely?"
- "I wanted to compose something for the loop but I couldn't because I could never get silence to
  start from."
- "All the generated notes seem to come up as red."
- "We have a huge problem in how to make the loops from a clean slate each time. I can't believe
  how bad and difficult to use this is."
- "We also have a huge problem in how to create the piece and set the different scenes etc. It's
  entirely unintuitive and confusing. It needs to be easy to use with the iPad and work smoothly and
  easily all together."
- Agreed: composing a loop starts from silence; no band, Extra notes, loops or scene sounds while
  composing; "make a new loop" is a deliberate step that gives that silence; hearing the loop with
  band, other loops and Extra notes afterwards is by choice, before saving.
- "Tim needs to make the loops: use the counters to compose, and then once he has made some loops,
  decide on the order and transitions etc. On the day he can add to the loops by composing on top of
  them with the counters."
- Transitions: "does the next loop fade in while this one fades out, do they overlap, or does one
  stop dead and the next start; whether the band or Extra notes join during a section." Also: "We
  should also be able to think about key changes etc."
- Loops are made before the show: Tim on the board, the owner keeps them from the laptop.

## The journey wanted

1. **Make loops** (before the show). Tim composes each loop from silence with counters. The owner
   keeps it and names it. Repeat.
2. **Build the piece** (before the show). Tim decides the order and the transitions between loops,
   and key changes; the owner carries it out on the laptop. Nothing here needs Tim at the laptop.
3. **Perform** (the day). The owner at the laptop, Tim at the iPad and the board. The loops play in
   the agreed order; Tim composes on top with counters, his notes over the loop, not into it.

## What the software does today (from the code, 2026-10-27)

- Three top-level modes on the laptop: **Play**, **Make a piece** (steps Loops · Scenes · Ending &
  check), **Show**.
- **About five ways to make a loop and five ways to start one**: "Save the board here", Capture,
  Draw/Edit notes, the older Loop bank (bottom row of the board), loop colours ("Plays a loop"
  job); started from the laptop row, the iPad, a scene, a loop colour, or Capture.
- **A started loop keeps sounding when the board is cleared and survives Stop** ("ready · starts
  with Play"). Only its own ■ Stop or "Stop all loops" (hidden under "More: fades, stop all") ends
  it. The band and Extra notes run at the player's current settings while composing. Extra notes is
  given loop cells too. There is **no "silence everything" action**.
- **Generated notes draw red** when their colour is not one of today's colours: loops remember the
  colours of the session they were made in, and Extra notes inherits those colours. With fresh
  colours each session, loop notes and the Extra notes around them come out red.
- **Scenes**: id, name, loop slots, time `at` (m:ss or blank), sound world, band, phrases, Extra
  notes, Sounds change, tempo. Up to 12. "Make my plan" makes Arrival 0:00 · Build 1:30 · Open 3:30 ·
  Home 6:00 with fixed seconds. Scene times do not move when the length changes.
- **There is no transition model.** A scene replaces the set of playing loops at its time; loops
  fade in/out over 0/0.5/1/2 passes (one per-player setting for all). No overlap control, no "drums
  carry on", no key change per scene (scale root and scale are global settings, not in a scene).
- **Four ways to start the piece** (Show → Start, Rehearse from here, Start clock, Carry on after
  reload); plain ▶ Play never starts it. The iPad cannot start it.
- **A scene writes its settings into the player's live settings**; a timed piece restores them at
  the end, but "Jump here now" or Next outside a timed piece overwrites them for good.
- **Tim's counters and loops share one pool**: melodies take turns (the player leads), loop melody
  notes can be re-pitched as a group when Tim adds counters, and in phrase mode a loop drops to half
  volume when Tim plays the same part.
- Saved per player: loops, scenes, performance settings. Per laptop: board, camera, colours, MIDI.
- Prior findings and proposals: docs/board-sequencer-improvement-plan.html (Phases 1–3) and the
  clickable mock-up docs/ux-redesign-journey.html (eight stages: Open · Tim's card · Room check ·
  Make · Build · Rehearse · Perform · After; "Keep" as capture-after-the-fact; "scenes" → "sections";
  Play never starts the piece; the clock only in Rehearse and Perform).

## Constraints the design must respect

- Tolerance over precision; nothing to hold down or keep still; every control acts on a touch.
- Visual feedback for every sound (deaf/HoH users); the audience and Tim should see what sounds.
- Every user-facing threshold calibratable, per player.
- Plain language; the owner is not a programmer.
- Ableton may be the sound engine (one track per job; loops on channels 4–9 optional).
- Nothing sounds until a counter is down; the player's counters are always the foreground.
- A show can never go silent or run over 7:00 because of the software.
