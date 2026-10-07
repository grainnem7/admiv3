# Board Sequencer — Facilitator Cheat Sheet

*One page to keep by the board. Everything saves automatically. Nothing in the app changes the music on its own.*

## Who's playing
- With more than one player saved, the screen opens with **Who's playing?** Pick a card, or **New player** (name, handedness, seat).
- Each player has their own **grid, jobs, sounds, loops and settings.** The **board, camera and counter colours are shared**, so a second player never re-finds the board.
- Switch later with the **Player** button in the header (stop playing first).

## Set up — four steps
1. **Camera.** Pick the camera, check it says **"Picture has colour"**, set Mirror/Flip. *Changing mirror or flip asks for the corners again; colours are kept.* Camera on its side? **Turn 90°** until the board is the right way up — corners and colours are kept. A phone used as a camera: keep **Picture size 1280 × 720**.
2. **Board.** **Find board** looks for the crossings where four squares meet, works out 8 × 8 or 10 × 10, and shows you what it found — **nothing is saved until Looks right**. Not sure? It hands you the editor with its best guess. Or **Tap corners myself**: corners are the **outside corners of the squares**, not the wooden edge. Set Rows and Steps, and where the player sits.
   - **No pointer?** **Place corners for me**, then the arrows (Fine/Coarse) and **Next corner**.
   - Coming back and the board hasn't moved: **Skip, board hasn't moved**.
3. **Colours.** First, with **every counter off**, press **Learn the empty board** (counters are then found by being unlike it). Then put one of each counter down and press **Find colours**: it learns what your board looks like, finds the counters, and **checks every colour against the board** before offering it. A colour that would light up the wood says so and starts **Off**. Press **Use these colours** to keep them. Or **Tap a counter** (or **Pick a square** + arrows + **Sample this square**) — the sample is shown first, and **nothing is saved until Add**.
4. **Ready.** Check the counts and the list, then **▶ Play**.

## Playing
- Playhead sweeps **left → right**; a piece sounds when the playhead reaches its column. **Higher rows = higher notes.**
- A cell only lights when its note is **actually heard** — picture and sound always agree.
- **Space** starts and stops (not in Set up, and not when a button or slider has focus).
- **⤢ Big board** fills the screen with just the board, ▶/■, Mute and Exit. **Esc** leaves it.
- **Describe board** reads the whole layout out loud.

## Pieces not being detected?
- Colours → **Detection sensitivity** → lower **Piece coverage**. **Reset to suggested** puts it back.
- The app suggests coverage and sampling from your grid, so a 4 × 4 grid on an 8 × 8 board is handled for you.

## Control counters — volume, tempo, effects
- Give a colour a **Control** job. Its counter becomes a fader: the value follows **where it sits on the board**, not which box it is in.
- The ends of the board snap to the lowest and highest value; a small wobble is ignored.
- **Lifting it holds the last value** by default (never sudden silence). ‖ in the legend means held. Per control you can choose Hold, Drop to the lowest value, or Return to the saved value.
- Each control has a **Lowest/Highest** range you can set.

## Variation — "every other time round"
- Turn on **Variation** (Loops tab). **Shove a piece off the centre of its square** → it plays every OTHER pass (**long-dash ring**).
- The **A / B** letter in the status pill shows the lap. **Push needed** sets how big a shove counts.
- Measured from the **physical square**, so counters placed normally on a coarse grid are not mistaken for shoved.

## Back and forth (ping-pong)
- The playhead runs **→ then ←**, doubling the phrase. The arrow shows the direction.

## Loop bank — save, layer, bring back
- Turn on **Loop bank**: the **bottom row** becomes save slots (not notes).
- **Save:** lay a pattern, put a counter on an **empty** slot; once the board has been **still for a moment** it captures and loops.
- **Layer:** build another pattern, save it to the next slot — both play together.
- **Pause / resume:** lift the slot's counter to pause, put it back to resume.
- **Clear** empties a slot; it won't re-save until that counter is lifted and put back.
- Control counters never trigger a slot, and only cells that play are saved.

## Hands, knocks and nudges
- **Hands are ignored.** Squares your hand is over are **held**, not read: a counter underneath keeps playing, a sleeve adds nothing, and nothing flickers. Held squares are hatched, and the status line says "✋ holding 3".
- **Check my hand** (Colours → Hands) reports whether your sleeve is one of the counter colours.
- **A knock keeps the music.** If several counters go at once the pattern plays on as **ghosts** (hollow, with ↺) until you press **Let go**, **Save as loop**, or put the counters back.
- **A small nudge is followed automatically** — the grid moves with the board, the music carries on, nothing is announced. A bigger move asks you to find the board again. Switch it off in Board → Details.

## Where the counter sits (optional, off by default)
- Loops tab → **"Where the counter sits matters"**: higher in the square = **louder**, right of centre = **later** ("the and").
- There's a dead zone in the middle, so "just in the square" stays easy, and the value is fixed when the counter settles — a wobble afterwards changes nothing.
- **"Two counters in a box both play"** lets one box hold two counters, each with its own place and loudness.

## Lanes — where controls and loops live
- Loops tab → **Controls live** and **Loop pads live**: **Anywhere**, **a row**, or **a step** — per player.
- A lane **never plays notes**, so it can't make stray sounds. A fader in a lane reads **along** the lane.
- **Hold** = the counter stays on the pad while the loop plays. **Toggle** = place it to start, place it again to stop.

## Hints
- **"Has the board moved?"** — the pieces have shifted together off their squares.
- **"<Colour> is matching the board itself"** — that colour is being seen almost everywhere.
- Hints only inform. **Not now** hides one until the problem returns. They can be switched off in Board → Details.

## Sound — the Sound tab while playing
- **Sound world:** Warm · Lo-fi · Ambient · Electronic. One choice sets every part's instrument, the drums and the space. A colour you gave an instrument keeps it. **My picks** = each colour plays its own chosen instrument.
- **Each counter plays — A phrase / One note.** A phrase: a drum counter plays a whole groove (higher = busier), bass a bassline, melody a tune, chord counters set the chords. **One counter fills the loop; the next counter of the same colour takes over from its step.** The band under each counter shows the beats it owns. *Polyrhythm loop lengths (Groove tab) fight phrases — leave them Off.*
- **Band — Off / Gentle / Full.** Pad + bass + groove join on the pass **after** the first counter, follow the chords, and stop after the pass the last counter left in. Put down a bass, chord or drum counter and the band **hands that part to you**. The bottom edge of the board pulses with its beat.
- **Fill 0–100%.** In-key notes added around the player's: never on their notes, never louder, nothing on a part they haven't used. **Ideas from Magenta AI** (downloads once, needs internet the first time; "Simple rules" if not) · **New idea / Back / Keep / Clear.** Added notes = **dotted rings**.
- **Evolve 0–100%.** Each colour's sound drifts every loop and changes instrument/pattern/kit every **4 / 8 / 16 loops**. **New sound / Back / Hold.** The Play screen says what each colour sounds like now; **"New sounds"** flashes on the board.
- **Control counters for Fill and Evolve:** give a colour the *Fill amount* or *Evolve amount* job and its counter's position sets the amount.
- **Studio mix** (tick box): the fuller mix. Untick to compare with the old sound.

## Performing — prepare loops and scenes, launch with one tap
- **Loops tab → Perform.** Eight slots. For each: **Save board here** (the counters as they are now — works while stopped, so set up before the show), **Draw** (draw a loop on screen, no camera needed), a **name**, **▶ Play / ■ Stop**, **Clear**.
- **Play and Stop land on the next pass** — a tap early or late still comes in on the loop. **Stop all loops** too.
- **Scenes:** get the loops and sound how you want them, type a name, **Save scene from now**. Each scene keeps its loops + sound world + band + phrases + fill + Evolve + tempo. **Go** recalls one; **Next scene ▶** walks the list — a set list for the piece.
- **On the iPad:** the **Loops & scenes** page has big pads for the 8 loops (green = playing, dashed = starting/stopping), 4 scene pads, **Next scene** and **Stop all**.
- Launched loops need no loop lane and no counter on a pad; the pads still work as before alongside them.
- **Loops fade in and out** over **half a pass / 1 pass / 2 passes** (or at once) — Perform → *Loops fade in and out over*. The pad says "fading out…" until it has gone.

## The performance clock — a 7-minute piece
- Perform → **The performance**: **Length** (7:00), **The clock starts** (with Play, or **Start clock** so the sound check doesn't count).
- **How it ends — chosen before the piece:**
  - **Fade out** · **Stop at the end of the pass** · **Slow down** (a ritardando to a little over half speed, then a stop on the one) · **Thin out** (the band and the fill leave, the player's own notes end it, a fade over the last pass) · **Final chord** (the texture thins, then a held chord in the key and a crash ring out for one more pass).
  - **The ending takes** 1, 2 or 4 passes.
  - **When it ends:** **When I press End** — nothing stops by itself; the countdown and the cues are the guide; **End now** (laptop) or **End piece** (iPad, two taps) applies the chosen ending. Or **At the time** — it begins early enough to be finished on the dot.
- **Cues** at 1 minute, 30 s and 10 s: announced and flashed on the board; the countdown turns amber then red on the iPad. **Cancel the ending** if the room wants more.
- **Scenes at a time:** give a scene "at 2:30" and the clock brings it in on the next pass — pre-structure the piece (intro → build → solo → ending), then play over it.
- **Capture** (laptop or iPad): what's on the board right now → the first free slot, starting on the next pass. The looper gesture.
- **A counter as a loop:** Colours → give a colour the job **Plays a loop…** and pick the slot. That counter anywhere on the board = that loop (Hold / Toggle as the pads). It never plays a note itself. Name the loops so the legend reads "→ Chorus".

### Using saved loops in a 7-minute piece — a plan that works
1. **Before:** make 4–6 loops (Save board here / Draw), name them, set the fade to 1 pass. Make scenes: *Intro* (one soft loop, band Gentle), *Build* (+ drums, fill 30%), *Solo* (no loops, band Full, Evolve 50%), *Ending* (one loop, band Off). Give them times: 0:00, 1:30, 3:30, 6:00. Length 7:00, ending **End when I press it**, fade 2 passes.
2. **During:** the player plays on the board; scenes change under them on time; the iPad's loop pads add or drop a loop; Capture grabs a good moment; the facilitator watches the countdown.
3. **End:** at the 30-second cue, **End piece** — two passes of fade and it's over, on the beat.

## iPad controls (Tim)
- Start ADMI with **`npm run dev:ipad`** (not `npm run dev`). Sound tab → **Connections** → tick **iPad controls** → open the link shown in **Safari on the iPad** (same Wi-Fi; allow Node through Windows Firewall on private networks the first time).
- **Strips:** Speed · Dynamics · Fill · Evolve — slide anywhere on a strip; the ends are "all the way"; values move in 5% steps. **Pads:** New idea · New sound · Keep · Mute — act on touch, repeat taps ignored.
- **Learn reach:** press it on the laptop, have the player slide each strip as far as is comfortable, press **Done**. Their reach is now the whole range. **Reset reach** undoes it. Per player.
- **For a player without fine control (all per player, under iPad controls):**
  - **What the iPad shows:** untick strips and pads they won't use — **fewer things means bigger things** (two strips fill the screen; no strips = four huge pads).
  - **Locked strips:** 🔒 a strip and it ignores touch (lock Speed for a piece at a fixed tempo).
  - **A touch on a strip — Jumps to the finger / Follows the movement.** *Follows*: landing does nothing, sliding moves the value from where it was — for a finger that lands roughly.
  - On the iPad: a resting **palm is ignored**, **Stop all takes two taps**, and the gaps between targets are wide.
- What the iPad does shows on the Play screen ("iPad: Speed 96 BPM").

## MIDI out — ADMI as a controller
- Sound tab → **Connections** → **MIDI out** → choose an output. Melody **ch 1**, bass **ch 2**, chords **ch 3**, drums **ch 10** (General MIDI). **My notes only** or **Everything** (fill and band too). Untick **Keep the built-in sound** for MIDI only.
- Chrome/Edge only. A DAW on the same laptop needs a virtual port (**loopMIDI** on Windows).

## Session log — for the research
- Runs while the board plays. Every note with its **origin** (placed · phrase · fill · band), pitch/drum, loudness, time; the board whenever it changes; every setting change and **who made it** (laptop · iPad · counter).
- Play screen → **Save session** (JSON, everything) or **CSV** (notes). Named after the player and the time. Nothing leaves the machine otherwise.

## Good to know
- **Variation** and **Loop bank** are single-page: set Pages to 1 to use them.
- While playing you can change tempo, key, scale, swing, volume, mix, loops and pages. Instruments, the grid and the camera need a stop first — the app says so.
