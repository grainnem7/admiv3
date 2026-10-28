# Colours that come in on time, scenes that glide in speed, and a faster hat

28 Oct 2026. Three requests from the owner, after the first rig rehearsal, approved in chat
("ok"). The owner's own choices are marked **(owner)**; my calls are marked **(my call)** and
can be overruled.

## Why

1. **Counters waiting on the board.** In the piece, the opening should be the preset loops
   alone, and the board's counters come in later. Tim can't put counters on the board
   himself, so they are all placed before the piece starts. Today every counter on the
   board plays as soon as the board plays: there's no way to keep one silent until its time.
2. **Speed changes between scenes are jumps.** A scene's speed (`SceneSettings.bpm`) is set
   at once when it comes in (`goScene` in `BoardSequencerScreen.tsx`:
   `engineRef.current?.setBpm(apply.bpm)`). A scene at a different speed lurches.
3. **The hat can't go fast, and it overrides scene speeds.**
   - The hat on Speed maps its position onto `config.controlRanges.tempo`. That defaults to
     60–160 BPM, while the engine allows 20–400.
   - The range is only editable under Sound → Advanced, and only for a colour set as a
     Speed counter. So with the hat alone it can't be changed at all.
   - The hat sets an absolute speed every frame (`setControlValues` → `setBpm`), so a
     scene's speed is never heard while the hat is on Speed.

## Goals

- **Each sound colour has its own "Comes in at m:ss" for the piece (owner).** Before its
  time, that colour's counters on the board are silent; after it, they play. Loops play
  as normal throughout, including loops made from that colour.
- **Each scene can reach its speed gradually over a number of seconds (owner, per
  scene).** "At once" stays the default, so existing scenes don't change.
- **The hat moves the speed around the scene's speed (owner).**
  - With the hat in the middle of Tim's range, the scene's speed (or the gliding speed)
    is heard.
  - One way goes up towards **Fastest**, the other down towards **Slowest**.
- **Fastest defaults to 240 BPM (owner)**, including Tim's saved profile.
  - **Slowest** and **Fastest** are set in the Cap tab.
- Visual feedback for every change of sound (research rule 5). Everything works by
  keyboard. Plain words throughout.

## Non-goals

- No "goes quiet at" time for a colour: colours come in and stay in **(my call)**. Easy to
  add later.
- No per-scene board silence. The per-colour times are for the whole piece **(owner)**.
- A Speed **counter** on the board keeps its absolute mapping and still wins over the hat,
  as today. Only the hat becomes relative to the scene.
- No change to how loops are made, kept or launched; no change to the iPad's layout.

## Anti-goals (failure even if it "works")

- A waiting colour making any sound before its time: a blip as the piece starts, a note
  through Ableton/MIDI, or the band answering it.
- Plain ▶ Play or Tim's warm-up going silent because of colour times. They only apply while
  the piece's clock runs.
- A glide that stutters, jumps the beat or restarts the loop. The beat stays continuous,
  as `setBpm` already keeps it.
- The ending not fitting the 7:00 because the hat or a glide made the piece slower than the
  ending's timing assumed.
- Existing players' pieces changing on their own. The only exception is Fastest going from
  the old default 160 to 240.

## Decided

### 1. When each colour comes in

- **Stored per player** in the board config, beside the scenes: a time in seconds from the
  piece's start for each sound colour, keyed by the colour's channel id. A colour with no
  time plays from the start.
  - The sanitiser keeps only finite times from 0 up to the longest piece length, and drops
    anything malformed.
  - A time for a colour that no longer exists is ignored, and is dropped when the colour
    goes.
- **Sound colours only:** colours whose role plays notes. Control colours are never held
  back: Speed, volume, reverb, echo, tone, fill and evolve counters, and the toggles
  **(my call)**.
- **When it applies:** only while the piece's clock runs. That covers the piece from 0:00
  and "▶ Rehearse from here", which starts the clock at the scene's time, so a colour due by
  then is already in.
  - Plain ▶ Play, warm-up before Start the piece, and the board after Stop: every colour
    plays, as today.
  - During the ending, colours that are in stay in.
- **How:** the player's cells are filtered before they reach the engine. That is the same
  point where New loop already silences them (`playerCellsFor` →
  `engine.setActiveCells` in `useBoardRuntime.ts`).
  - Everything downstream (sound, MIDI out to Ableton, the band, the session log) only ever
    sees sounding colours.
  - So the band follows only sounding colours **(my call)**.
- **Coming in:** a colour comes in on the first board frame at or after its time. Its
  counters are then played from the next step the pattern reaches them, never as a burst of
  catch-up notes.
- **On screen:**
  - The colour times are edited in the piece set-up's Scenes step, on a card **"When each
    colour comes in"**. It lists each sound colour with its swatch and name and a **Comes
    in at** time field, entered like a scene's (m:ss; blank = from the start). The card
    says in one line that the times count only while the piece plays.
  - While the piece plays, a waiting colour is visibly marked on the board view. It isn't
    shown as playing, and a line near the board says e.g. "Waiting: Red at 1:30, Blue at
    2:30".
  - When it comes in: a board notice "Red comes in", and the same words announced.
- **The check (3 · Ending & check)** warns, in plain words, when a colour's time is at or
  after the end of the piece: "Red comes in at 7:30, after the piece ends."

### 2. Scenes that glide to their speed

- **A scene gains an optional glide time in seconds**; absent or 0 means at once.
  - In the scene editor: **"Reach this speed: At once / Gradually over N seconds"**.
  - The range is about 2–120 s; the builder chooses a sensible step.
  - Old saved scenes have none (at once).
  - The sanitiser keeps finite values in range.
- **When it glides:** a scene that comes in **while the board plays** glides, whether the
  clock brought it in or someone chose it by hand.
  - The opening scene of a run (Start the piece, Rehearse from here) is at its speed at
    once **(my call)**: there is nothing to glide from.
- **How:** linear in BPM from the speed in force when the scene comes in to the scene's
  speed, over the glide time.
  - Stepped often enough that it is heard as smooth (the builder chooses, about every
    100 ms or every beat at most), each step through `setBpm`, so the beat stays
    continuous.
  - A scene arriving mid-glide starts its own glide from wherever the speed is now.
  - Stop ends a glide, and the player's own settings come back as today.
  - The existing rule that a Speed strip touched by the player is theirs
    (`sceneRespectsPlayer`) still decides whether the scene sets the speed at all.
- **What is shown follows what is heard:** while gliding, the speed shown moves with it.
  The builder decides how; e.g. "Speed 96 → 120".

### 3. The hat moves the speed around the scene's speed

- **The centre** is the speed in force without the hat:
  - during a run, the scene's speed (the gliding speed while a glide runs);
  - otherwise, the player's own Speed;
  - clamped into Slowest–Fastest.
- **The hat's Speed axis gives a position p from 0 to 1 within Tim's range**, as now:
  - `p = 0.5` gives the centre;
  - `p = 1` gives Fastest; `p = 0` gives Slowest;
  - linear on each side.
  - So from any scene Tim can still reach both ends **(my call)**.
  - The cap's existing smoothing, holds, pauses, reach and side arc are unchanged: a hat
    holding its place still follows the centre as it glides.
- **A Speed counter on the board still wins over the hat** (unchanged).
- **Slowest / Fastest in the Cap tab**, shown when an axis of the cap is set to Speed.
  - They edit `controlRanges.tempo`, which is the same setting as Sound → Advanced. The Cap
    tab says so in a few words.
  - Limits as `CONTROL_RANGE_LIMITS` (20–400).
- **Fastest 240:**
  - New players get 60–240.
  - A saved profile whose tempo top is exactly the old default 160 is raised to 240 once
    (a config migration) **(my call)**. Any other saved value is the player's own, and is
    kept.
- **The ending's timing** (`pieceEndingLeadSec`, which uses the slowest tempo the piece can
  be at) also counts the hat's Slowest when the cap is on Speed. A slowed piece must still
  end inside 7:00.

## Left to the builder

- The config field names and the migration mechanism.
- The glide's step rate.
- How a waiting colour is drawn.
- Exact wording within the plain-language rule.
- Where in the scene editor the glide sits.
- Whether the iPad needs any words for a waiting colour (it has no board view).

List each choice in the report.

## Tests that prove it

Unit (Vitest, pure functions; no DOM where possible):
- **Colour times:**
  - Before a colour's time, its cells are filtered out; at or after it, they pass.
  - With no piece clock, all pass.
  - Control colours always pass.
  - The sanitiser keeps good times and drops malformed ones.
- **The check:** a colour time at or after the piece's end gives the warning line.
- **Glide:**
  - The speed at a given moment of a glide, at its start, middle and end.
  - A second glide starts from the current speed.
  - 0 gives at once.
  - Old scenes load as at once.
- **Hat:**
  - The tempo from (centre, p, Slowest, Fastest) at p = 0, 0.5 and 1, and in between.
  - The centre is clamped.
  - A Speed counter still wins.
- **Migration:** 160 becomes 240; 150 stays 150; new players get 240.
- **Ending:** the lead uses the hat's Slowest when the cap is on Speed.

e2e (Playwright, laptop board, no camera except Chromium's fake one for the hat):
- **A colour with "Comes in at 0:05":**
  - Its counters are on the board from the start of the piece, and no note of that colour
    is played (sound or the engine's note reports) before 0:05.
  - Its notes appear after; the waiting line and "Red comes in" are seen.
  - With plain ▶ Play it plays at once.
- **A scene at 0:05 that glides over 4 s from a slower speed:** the speed is read at least
  twice during the glide and lies strictly between the two speeds, rising.
- **The hat** (fake camera video, as `e2e/capCamera.e2e.ts`):
  - With the disc in the middle of its range, the speed is the scene's or the player's own.
  - Moved fully one way, it is near Fastest (240).
- All existing tests still pass.
