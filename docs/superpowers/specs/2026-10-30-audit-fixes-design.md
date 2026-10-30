# Audit fixes

30 Oct 2026. Source: the six-reviewer audit of build ef8c2de. The merged report is at
https://claude.ai/artifact/PegNNyCcW6QPDAjnxRMwKU. The reviewers' own reports and screenshots are in
`docs/superpowers/audits/2026-10-30/<id>.md` (screenshots stayed on the laptop, git-ignored); read the relevant one for the detail behind an item (file:line,
measurements, screenshots). The owner said **"Fix everything"** (owner). Items keep the report's numbers: B1–B26
(before the gig), A1–A18 (after the gig).

My calls are marked **(my call)**. The questions for Tim and Chris are NOT decided here. Where a fix touches one,
it keeps today's behaviour:
- End piece's place on the iPad.
- The second-tap window.
- The hat's default up/down role for new players (Volume).
- Whether the hat holds or drifts back when lost.

## Order: five batches, each verified and committed on its own
1. **Show safety:** B1–B6, B14, B15, B18, B19, B20, B26.
2. **The hat:** B7, B8, A12, A13.
3. **Look and words on stage:** B9–B13, B16, B17, B21–B25.
4. **Set-up screens:** A1, A2, A3, A14, A15, A16.
5. **Access, audience screen, iPad and the rest:** A4–A11, A17, A18.

## Binding everywhere
- Plain words; the owner is a researcher-performer, not a programmer.
- No change may add processing load that makes the sound lag, stutter or fall behind the beat, or make the keeping-time meter (src/songs/keepingTime.ts) worse. (This is about performance only: the hat and the Speed settings still speed the music up and slow it down as they do now.)
- Tests first, for every behaviour change.
- When a label is renamed, update the e2e tests and Help to match. Don't loosen the timing-sensitive tests.
- The board's colours (counters) are reserved for counters. No UI element may use a counter hue as its meaning colour.

## Batch 1: Show safety
- **B1: one Show status row (fixed height, never moves the board).**
  - Items appear only when relevant:
    - Camera (camera board only)
    - Hat (when the cap is on): found / holding / paused, plus Speed
    - iPad (when the iPad link is on)
    - Sound (Ableton port, when the sound comes from Ableton)
  - Calm ✓ when fine. Amber, with "!" and a word, when not, e.g. "! Camera stopped".
  - "Muted: nothing is sounding" and "Simplified: …" also live here.
  - Keep the camera banner as it is on Play.
- **B14:** the keeping-time notice, the Ableton port warning and the reload notice move into this row instead of
  stacking above the Now/Next strip. No bright full-width bars in Show. Warnings use `var(--bs-warn)` with "!",
  never the hard-coded #ffb74d.
- **B2: Wi-Fi watchdog.**
  - Treat silence of about 3–4 s as lost, on both sides **(my call)**. Choose it as at least 3× the heartbeat or
    clock-tick interval; measure that interval, and raise the heartbeat rate if needed.
  - When lost, the iPad greys out with "Not reaching the laptop", and touches are not shown as applied.
  - The laptop shows "! iPad not reaching" in the B1 row.
  - A short hiccup under load must not flicker it. Debounce recovery.
- **B3:** for 2 s after the piece starts, ■ Stop ignores presses **(my call)**. Focus after Start goes to the Now/Next
  strip, not onto Stop.
- **B4:** while the piece plays, "Close the audience screen" is hidden in Show. Elsewhere it needs a second press,
  like Stop.
- **B5: the two-window routine.**
  - The placed and drag notices end with "…then click back on this laptop screen".
  - Show no longer closes when the browser leaves full screen. It closes only on Leave Show, or Esc when it was not
    full screen.
  - With only one screen found, say: "Only one screen found. Is the projector set to Extend (Windows key + P)?"
  - Investigate the Journey reviewer's unconfirmed sighting: the laptop out of Show with the piece running unasked.
    Report what you find. Fix it if real.
- **B6: covered window.**
  - When the drawing loop stops (page hidden, or no frame for about 0.5 s), feed the audience screen from a timer,
    so blooms, scene and hat keep coming.
  - In Show, while the audience screen is open, the status row says once: "Keep this window in front: covering it
    pauses the camera."
- **B15:** hide the "AI: …" line in Show. Show is always dark, whatever the theme setting.
- **B18:** the iPad's New idea is refused while the laptop is stopped, like the loop pads ("Press Play on the laptop
  first"). It never changes the Extra notes level by itself when stopped.
- **B19:** while Carry on is offered, the iPad shows "The laptop is getting back: waiting for Carry on". Its touches
  are refused.
- **B20:**
  - After Tim's first End piece tap, the laptop shows "iPad: End piece pressed once" (in the B1 row in Show), until
    it times out or ends.
  - On the iPad, the armed pad keeps its text size and drains its border over the window.
- **B26:** after 8 s, say "Still opening…". Say "didn't open" only after about 20 s.

## Batch 2: The hat
- **B7:**
  - Until the hat is learnt, the Cap panel never says "The cap is found" in green. It says "A red thing is found: is
    it the hat? Learn the hat to be sure."
  - Learn the hat moves to the top of the Cap panel.
  - In step 1 (Learn the room), if a hat-like patch is seen, the result asks "Is the hat still on? Take it off and
    learn the room again." The room is not kept.
- **B8:** the two "moves" choices (side to side / up and down) go to the top of the Cap panel, under Learn the hat.
  The Ready check says which job each direction does ("Hat: side to side Speed · up and down Volume"), so the owner
  can see it. The default does NOT change (question for Tim).
- **A12:** after the hat is lost and found again, its controls glide to where it now is. Do not wait for a movement.
- **A13:** the Cap panel is reordered and folded:
  - At the top: Learn the hat, the moves, the camera picture and the on/off switch.
  - The rest under "More hat settings".
  - Nothing is clipped sideways at 1366 or narrower panels.

## Batch 3: Look and words on stage
- **B9:** draw the playhead after the squares, as a visible tint or outline, at least 3:1 against the squares in both
  modes. Draw the tune bands on top.
- **B10:**
  - Scene chips use one neutral or accent style, with the scene's number and dark-enough text (at least 4.5:1).
  - Scenes never use counter hues.
  - Each chip button sits inside a list item.
  - The Energy graph and the scene cards' left stripes follow the same rule.
- **B11:** reset the base.css `[aria-pressed="true"]` orange ring inside `.bs-root`. Pressed or selected state uses the
  board's own style.
- **B12:** paragraphs inside `.bs-root` use `var(--bs-fg)` (or `--bs-fg2` where it passes 4.5:1), in both modes.
- **B13:**
  - End gets its own sign (not ■) and a quieter style. ■ Stop is the clear danger button.
  - "Next ▶" becomes "Next scene ▶" and offers Undo for one pass: "Back to <scene>" returns to the previous scene.
  - Next scene and End are hidden until the clock runs.
- **B16: renames only, no new behaviour.**
  - The view button "Play" becomes "Board".
  - The transport "▶ Play" becomes "▶ Play the board". Its hint and Help say there is no clock.
  - "▶ Show" becomes "Show".
  - "▶ Start the piece" stays.
  - Check every other start button's wording against these names.
- **B17:**
  - In Make a piece, the old ways (Save the board here, ✎ Edit notes, Overwrite with board) are folded under "Other
    ways to make a loop".
  - Selected options show ● and a light tint, not filled mint. Filled mint is kept for one main action per view.
  - The name placeholder matches "Keep".
- **B21:** a laptop board chosen on purpose is not a warning in the Ready check. "Not backed up" is advice, not a
  warning. The check can reach "Ready".
- **B22:** "Lift the N counters, or press Clear the board."
- **B23:** "Simplify" gets a visible hint, and the result says "Simplified: Tim and <loop name>".
- **B24:** the colour table is ordered by the colour's number everywhere.
- **B25:** the header keeps a fixed place for its status, so starting play never wraps it.

## Batch 4: Set-up screens
- **A1:**
  - A scene shows its name, time, loops and Energy. Everything else is folded under "More for this scene" (open state
    remembered per session).
  - Each Sound tab helper folds to a one-line summary. Overall feel and Your colours stay open.
- **A2:** one word list.
  - **Decision (my call):**

    | Use | Instead of |
    |---|---|
    | Extra notes | Fill / fill amount |
    | Sounds change | Evolve |
    | Speed | Tempo; "90 BPM" may stay as a number |
    | Echo | Delay |
    | Keep (making a loop) | Save the board here / Overwrite with board, which stay in "Other ways" as "Keep the board as this loop" |
    | End piece (the fade) | End |
    | Stop (silence now) | Stop all |
    | New idea | Try another |
    | New ideas (a scene's reseed) | — |

  - Energy uses the same names (Calm, Steady, Lively, Driving, plus Big for 5) in the scene and on the Sound tab, and
    "Off" where a scene doesn't set it.
  - Rename the Groove tab "Timing", and merge or clearly label the two swing controls.
  - Write the list into src/ui/screens/boardSequencer/words.ts (or similar) and use it in labels, the iPad and Help.
- **A3: layout.**
  - The side panel is 400–480 px wide when there is room, and the board grows.
  - Below about 1400 px, less-used header buttons (Open the audience screen, Camera/Laptop, Set up) move into a
    "More" menu.
  - At 320 px nothing scrolls sideways.
  - The board keeps its place and size between Board and Make a piece.
  - Notices have fixed places.
- **A14:**
  - Segmented choices show their question visibly.
  - Each Ready-check fix has a button that goes straight to the place, or names the button by its real words.
  - Remove jargon on the tabs (Humanize, Ping-pong, Pages, standalone, "Controls live", "Like ThumbJam", "(fader)").
  - "Aa" gets a visible "Larger" label or tooltip text.
- **A15:**
  - Describe board, Save session, CSV and the "Now: …" log fold under "Session log" (closed by default).
  - "Who's playing?" keeps Right as the default. This is a question for Tim; it's one click.
- **A16:**
  - ↶ keeps the previous sound from set-up into the Board view.
  - No "Camera: starting…" on the laptop board.
  - Sound names are not cut short (wrap, or a wider panel).
  - The "comes in" swatches use the two-tone ring.
  - Replace the 🧢 emoji with a red mark or the word "Hat".

## Batch 5: Access, audience screen, iPad and the rest
- **A4:** empty squares get an edge of at least 3:1 (`--bs-border-control`).
- **A5: the audience screen.**
  - The before level rises to about 0.4.
  - The scene name moves 5% in from the edge, at about 0.8 opacity, sized to about 2.2% of the width.
  - Blooms brighten without washing to white.
  - Dark counters get a thin light ring.
  - Counters are 0.42 of a square.
  - **(my call)** No venue setting yet. Note it for later.
- **A6:** limit how often one counter can re-bloom, and scale the glow by how many bloom together. Under any board at
  Speed 240, no third of the screen may swing more than 3 times a second. Test it.
- **A7:**
  - One setting, "Time to press again": 3 / 4 / 6 / 10 s, default 4. It covers Stop, Exit and Set up.
  - Undo lasts 15 s or the press-again time × 4, whichever is longer.
  - Notices last at least 5 s.
  - "Space plays and stops", on by default, can be switched off in Advanced.
- **A8:** Help opens at the top with focus on its heading, with links to its sections and Close outside the scroll.
- **A9:** every accessible name starts with the visible words.
- **A10:**
  - Three text sizes (14/16/20) with a 14 px minimum in the Board Sequencer.
  - Text fields get 10 px inner padding.
  - The ADMI / Ableton / Both buttons match the other choices.
- **A11: the iPad page.**
  - It uses the board's tokens and offers light and dark.
  - Strip colours are not counter hues.
  - The Extra notes strip has a track and shows its value as a number.
  - The 👆 mark is visible.
  - While waiting, the pads are marked unavailable.
  - Its page tabs are one Tab stop.
  - Loops & scenes rows use the 18 px gap, and Stop sits away from End piece.
  - While touching, the words show the finger's value.
  - End piece's place in the safe layout does NOT change (question for Tim).
- **A17:**
  - A quiet "Ended" shows in the clock's place after the piece.
  - The drag/placed notice clears once the window is placed.
- **A18:**
  - Headings in order.
  - One main region on Welcome.
  - The audience page's title is "ADMI – audience".
  - The Player button is aligned with ☀ / Aa / ?.

## Tests that prove it
Each batch adds unit tests for its logic and e2e checks for what the owner sees. These must hold in every batch:
- the Show status row (lost camera, hat, iPad and Mute)
- the 2 s Stop guard
- the stalled-link watchdog
- Show surviving a full-screen exit
- the renamed labels
- the flash limit
- the folded scene editor still editing everything it did

Run the reviewers' own checks again where they measured something, e.g. contrast, flash and target sizes.

## Status (30 Oct 2026)
Batches 1–4 are built and committed:

| Batch | Commit |
|---|---|
| 1 | 3c8f6b4 |
| 2 | ac83d5a |
| 3 | 2b8e97d |
| 4 | 9d6c0be |

Batch 5 is still to build.

Notes for whoever builds batch 5:
- Batch 4's word list is in `src/ui/screens/boardSequencer/words.ts`. Use it for any new wording.
- Two e2e tests fail on a loaded machine and pass alone: performance "Simplify…" and sound "helpers: Freeze".
- One more, performance "a Space 200 ms after a Stop…", failed under load at 2b8e97d as well. Check it.
