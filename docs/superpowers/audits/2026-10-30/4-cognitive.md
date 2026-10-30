# 4-cognitive: cognitive load (COGA). The controller saved this from the reviewer's hand-back; the harness had blocked its own write.

Census per screen (controls / words); the detail is in census.md:

| Screen | Controls | Words |
|---|---|---|
| Welcome | 7 | 62 |
| Who's playing | 4 | ~40 |
| Set-up Colours (4 colours) | 41 | 366 |
| Set-up Ready | 12 | 69 |
| Sound tab panel | 84 | ~1000 |
| Groove | 48 | |
| Board | 10 | |
| Connections, iPad off / on | 4 / 37 | 518 with the iPad on |
| Cap, off / on | 1 / ~45 | 865 with the cap on |
| Make a piece: Loops | 27 | 290–330 |
| Scenes with plan | 24 | 632 |
| One scene open | 75 | 844 |
| Ending & check | 15 | 520 |
| Show running | 8 | ~40 |
| iPad safe layout | 3 | 23 |
| Audience screen | 0 | 1 |

## Findings

### Major, before the gig
- **Five ways to start** (screenshots 18, 22):
  - ▶ Play, ▶ Show, ▶ Start the piece, ▶ Go to Show, and Rehearse from here / Jump here now.
  - Paragraphs on screen are needed to tell them apart.
  - Fix: "▶ Play the board (no clock)" for the plain one; keep "Start the piece" for the piece.
- **One thing, many names.** Fix: one word list. Screenshots: 04, 19, 37.
  - Extra notes / Fill amount (fader) / Fill / the fill.
  - Sounds change / Evolve amount / Evolve.
  - Speed / Tempo / BPM.
  - Echo / Delay amount, and "Space".
  - Keep / Save the board here / Overwrite with board / Capture.
  - End / End piece / Stop / Stop all.
  - New idea / ↻ Try another / ↻ New ideas.
  - Energy as Calm/Steady/Lively/Driving on the Sound tab, but Off/1–5 in a scene.
- **The old way of making a loop still shows beside New loop** (screenshots 12, 16):
  - Each of the 8 empty slots has "Save the board here" and "✎ Edit notes": 16 extra buttons.
  - Cause: `oldWays` is on whenever not composing (PieceSteps.tsx:235).
  - The name field says "name (after saving)", but the button says Keep.
  - Fix: fold them under "Other ways".

### Major, after the gig
- **Opening a scene shows 75 controls and about 850 words, about 16 groups at once** (screenshot 19).
  - Each scene's summary line is dense.
  - Fix: show name, time, loops and Energy; put the rest under "More for this scene".
- **The Sound tab: about 1,000 words and 84 controls**, with every helper open (screenshot 07). Fix: one-line folds.

### Minor, before the gig
- **"Groove" is both a tab and a setting.** Swing has two controls: Straight/Swung/Lazy, and Swing 0%. Screenshots: 07, 08
- **The colour table's order (1, 3, 2, 4) differs from the chips (1, 2, 3, 4).** Screenshots: 04, 07
- **The top bar wraps when Play starts, at 1366 wide.** "Playing · Stop playing to switch player" pushes Camera and Laptop to a second row, and the board moves down. Screenshots: 12 vs 14
- **The "AI: Extra notes off · Sounds change off. Turn them up on the Sound tab." line appears in Show,** where she can't act on it. Screenshots: 24, 25
- **Show confirms its big actions in three different ways** (screenshots 23, 36):
  - End acts at the first press, with Cancel.
  - Stop needs a second press.
  - The iPad's End needs two taps.
  - "Next ▶" changes the scene at one press with no Undo, and its label doesn't say "scene" (NowNextStrip.tsx:81).
  - Next and End show before the piece starts.
- **The visible label just says "Simplify".** The status then says "Simplified: Tim and the bed", and "bed" is jargon (BoardSequencerScreen.tsx:2276). Fix: "Tim and Loop 1 (Bed)". Screenshot: 34

### Minor, after the gig
- **Segmented choices have no visible question.** For example "1/2/4 passes" and "When I press End / By itself at 7:00": the label is for screen readers only (SegmentedControl.tsx:44). Screenshot: 22
- **Fix texts point elsewhere or use other names.** Fix: add a button that goes straight there. Screenshots: 22, 37
  - "switch Board to Camera", but the button is "📷 Camera".
  - The .admi-data folder.
  - "Sound → Advanced → the Speed counter's lowest and highest".
  - "Stop the board to change what a colour plays".
- **Jargon** (screenshots 08, 09, 10, 30):
  - BPM, Humanize, Ping-pong, Variation, Pages.
  - "Backing song: None (standalone)", "Loop length per part".
  - "Controls live", "Loop pads live".
  - "Like ThumbJam", bounce, Capture, Reach.
  - "(fader)".
  - Aa meaning Large controls, which only screen readers are told.

### Polish, after the gig
- **Research tools under the board:** Describe board, Save session, CSV, and the "Now: Red (phrase)" log. Screenshot: 14
- **"Who's playing?" defaults to Right-handed,** though the main player is left-handed. Screenshot: 02

## Questions for Tim and Chris
- **The iPad during the piece** (screenshot 33): which items does Tim read or use? Are "Code 3095" and the 👆 mark distracting?
- **New idea:** does it mean something to Tim, and can he tell what changed? On the laptop it is called "Try another".
- **End piece:** is the second tap clear to him, and is the time allowed comfortable?
- **The hat's Speed and Brightness:** would Tim want to see them during the piece, or would that be one more thing to watch?
- **Learn the hat:** is it comfortable, and is the order clear when Chris reads it out?

## What works well
- Show is calm: 8 controls, a big clock, Now/Next, about 40 words. The audience screen shows only the scene name.
- The iPad safe layout has 3 targets and 23 words.
- Welcome and Who's playing are short. Set-up is numbered, and the laptop path skips the camera.
- Undo without dialogs: Delete scene, the colour table's ↶, Cancel the ending, and Back to full.
- Error and fix texts say how to fix the problem.
- Make a piece has numbered optional steps, and Make my plan works in one click.
- The colour table shows the job, the sound and Hear on one row.
