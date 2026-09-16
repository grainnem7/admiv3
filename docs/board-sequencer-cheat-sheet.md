# Board Sequencer — Facilitator Cheat Sheet

*One page to keep by the board. Everything saves automatically. Nothing in the app changes the music on its own.*

## Who's playing
- With more than one player saved, the screen opens with **Who's playing?** Pick a card, or **New player** (name, handedness, seat).
- Each player has their own **grid, jobs, sounds, loops and settings.** The **board, camera and counter colours are shared**, so a second player never re-finds the board.
- Switch later with the **Player** button in the header (stop playing first).

## Set up — four steps
1. **Camera.** Pick the camera, check it says **"Picture has colour"**, set Mirror/Flip. *Changing mirror or flip asks for the corners again; colours are kept.*
2. **Board.** **Find board** looks for the crossings where four squares meet, works out 8 × 8 or 10 × 10, and shows you what it found — **nothing is saved until Looks right**. Not sure? It hands you the editor with its best guess. Or **Tap corners myself**: corners are the **outside corners of the squares**, not the wooden edge. Set Rows and Steps, and where the player sits.
   - **No pointer?** **Place corners for me**, then the arrows (Fine/Coarse) and **Next corner**.
   - Coming back and the board hasn't moved: **Skip, board hasn't moved**.
3. **Colours.** Put one of each counter down and press **Find colours**: it learns what your board looks like, finds the counters, and **checks every colour against the board** before offering it. A colour that would light up the wood says so and starts **Off**. Press **Use these colours** to keep them. Or **Tap a counter** (or **Pick a square** + arrows + **Sample this square**) — the sample is shown first, and **nothing is saved until Add**.
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

## Good to know
- **Variation** and **Loop bank** are single-page: set Pages to 1 to use them.
- While playing you can change tempo, key, scale, swing, volume, mix, loops and pages. Instruments, the grid and the camera need a stop first — the app says so.
