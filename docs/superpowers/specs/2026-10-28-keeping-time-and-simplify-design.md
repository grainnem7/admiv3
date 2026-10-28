# Keeping time, and Simplify

28 Oct 2026. Two show-safety pieces the owner approved in chat ("this is all ok") after the
musician review. The owner's own choices are marked **(owner)**; my calls are marked
**(my call)** and can be overruled.

## Why

- **Falling behind.** In one of the musician-tester's two real-time runs (headless Chromium,
  tunes and Magenta on), the music fell steadily behind the wall clock: about 35 s by 7:00.
  - The engine times beats from the audio clock (`Tone.now()`; `scheduleInternal` in
    `BoardSequencerEngine.ts`, a 25 ms tick, 0.1 s look-ahead, a capped catch-up). So it has
    two ways to fall behind:
    1. **Clock drift:** the audio clock itself runs slower than real time. This is likely in
       a headless browser with no sound device.
    2. **Late beats:** the page is too busy to send beats in time. Notes are then late
       (clamped to now) or skipped (past `MAX_CATCHUP_BEATS`).
  - The piece's own clock is wall time, and the backstop still ends it by 7:00. But a
    drifting or stalling board would stutter, and its ending would be cut, not faded.
  - Nobody knows yet whether this happens on the show laptop. Magenta already runs in a
    worker, so it is not the obvious cause.
- **Simplify.** The owner wants one press on the laptop that strips the sound back to Tim plus
  a gentle bed **(owner)**, as a musical safety net if something goes wrong on stage.

## Goals

### 1. A "keeping time" meter
The engine measures, all the time, while the board plays:
- **Clock drift:** audio-clock time against wall time since the board started, in seconds,
  and its rate.
- **Late beats:** a beat sent after its own time, with how late; and beats skipped by the
  catch-up cap.

It is shown in plain words:
- **In the Ready check**, after a run: e.g. "Keeping time: fine", or "Keeping time: the sound
  fell 2.4 s behind in the last run". The fix line says what to try: close other programs,
  turn off Extra notes, plug in the laptop.
- **During the piece, on the laptop only:** a small, quiet indicator that changes only when
  there is a problem. It is visible and announced once: "The sound is falling behind."
  Nothing is shown when all is well.
- **In the session log:** a periodic keeping-time sample, so a rehearsal can be checked
  afterwards.

### 2. A safety valve
- **Steps (my call):** when the sound starts falling behind beyond a threshold, ADMI drops
  the heaviest extras, in order, until it keeps time:
  1. Magenta's extra notes (falling back to the simple rules);
  2. then Extra notes altogether;
  3. then Evolve.
- **Telling the owner:** each step is said on the laptop ("Extra notes paused to keep the
  sound in time") and logged.
- **Undoing it:** it stays off for the rest of the run, and the owner can switch it back on.
  The thresholds are calibratable (research rule 4) and live under Sound → Advanced.
- **Clock drift alone can't be fixed by dropping extras** (it is the sound device). Drift
  beyond a threshold is only reported, with the advice to check the sound output.

### 3. A full-length check on the show laptop
A way for the owner to run the piece for 7:00 with everything on and read the result: the
check line above is enough. The checklist gets a step: "One full run with everything on;
the check should say Keeping time: fine."

### 4. Simplify (the owner's button)
- **Where:** on the laptop, in Play and in Show, and never on the iPad **(owner: for me at
  the laptop)**.
- **One press:** the band off, Extra notes off, Evolve off, and only the scene's first loop
  (the "bed") keeps playing, at its level. Tim's own counters play as normal. The sound
  world, the speed and the clock carry on.
- **While simplified:** scenes still come in for their time and speed, but the extras stay
  off, and the loops stay at just the bed **(my call)**.
- **Press again ("Back to full"):** the current scene's settings come back, from the next
  pass.
- **It's obvious on screen** that it is on ("Simplified: Tim and the bed"), and it is
  announced and logged.
- **Stop ends it.**
- **Keyboard:** usable by keyboard, with a key in Show: the builder chooses one that can't be
  hit by accident, and lists it in the Help.

## Non-goals

- No change to the engine's timing method in this piece, unless the meter shows a cause
  that is cheap and safe to fix. Any such fix comes back to me first.
- No Simplify on the iPad.

## Anti-goals

- **A meter that cries wolf.** It must not warn during normal play on a healthy laptop. It
  may warn for things such as a single 100 ms hiccup when a sample loads; the builder
  chooses thresholds that tolerate known one-off stalls.
- **Measuring that costs time:** no per-note work beyond a few arithmetic operations.
- **A safety valve that changes the music when nothing is wrong.**
- **Simplify going silent, or cutting off Tim.**

## Left to the builder

- Thresholds and smoothing.
- How lateness is sampled.
- The indicator's look.
- The Show key for Simplify.
- Wording within the plain-language rule.
- Whether drift is measured against `performance.now()` or `Date.now()`.

List each choice in the report.

## Tests that prove it

Unit tests:
- **The meter:** a simulated audio clock running 1 % slow gives the expected drift. Late and
  skipped beats are counted from a stalled tick. A healthy run gives "fine".
- **The valve:** its steps, their order, and that it never steps without lateness.
- **Simplify:** what is on and off, a scene arriving while simplified, back to full, and
  Stop.

e2e tests:
- **A stall:** a page that blocks its main thread for a while mid-piece makes the meter
  report late beats, and the valve pause Extra notes, said on screen.
- **A normal run:** says "Keeping time: fine".
- **Simplify by keyboard and mouse:** what it says on screen, and the band and extras
  silent while it is on, from the engine's note reports. The first loop keeps playing, and
  Back to full restores them.
