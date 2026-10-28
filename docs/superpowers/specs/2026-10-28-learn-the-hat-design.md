# Learn the hat: the red cap learnt against the room

28 Oct 2026. Owner's request: the cap (hat) can look a different red under different room
lighting; set it up "the same way as the board": look at the scene without the hat first,
then learn the hat, so it can tell the hat from everything else.

## Why

Today the cap is found by one fixed colour rule (`src/tracking/cap/capTracker.ts`):
`matchesCap` tests HSV against one hue ± 18°, a saturation floor and a value floor, learnt
from one 5×5 click on the hat (`capColourAt`, `CapPanel.tsx`). Nothing corrects for light.
- Dimmer, brighter or warmer light moves the hat's shade outside the band: the cap is lost
  and its controls freeze (values hold while lost).
- Anything else red in shot (a chair, a jumper, warm skin under orange light) can be taken
  for the hat, and the Speed or volume follows it.

The board's counters already solve this (learnt board, light correction, colour distance:
`src/tracking/boardReference/`). The hat gets the same idea, for one moving object.

## Goals

- Two short guided steps in the Cap tab, done by the owner with Tim in his playing place:
  1. **Learn the room** (about 3 s): Tim in the picture **without** the hat. Everything seen
     is "not the hat": room, skin, clothes, chair.
  2. **Learn the hat** (about 3 s): hat on, Tim moves his head a little in any way he can.
     Nothing asks him to hold still or hold a pose (he can't dwell-hold).
- While playing, a spot is the hat only if its colour is more like the hat's learnt shades
  than the room's, after correcting for the light changing; among such spots the existing
  rule still picks the one on the head nearest the last sighting.
- After learning, say in plain words how well the hat stands out, warn when something in
  the room is close to the hat's colour, and show **where** in the preview.
- The preview can show what is taken for the hat now (visual feedback for every state).
- A "How sure before it counts" setting (calibratable threshold, research rule 4).
- Re-learning at a venue takes about 10 s in all.

## Non-goals

- No change to what the cap controls, its smoothing, holds, pauses, reach or side arc.
- No change to the board's detection.
- No new camera handling: the cap keeps its own camera and frame (160×120, ~25 Hz).

## Anti-goals (failure even if it "works")

- The cap jumping to a red thing in the room during the piece.
- A set-up step Tim can't do (holding still, holding a pose, precise timing).
- Players without a learnt hat breaking: they keep today's click colour exactly.
- Added latency: the per-frame test must stay cheap (a lookup per pixel, no per-frame
  learning).

## Decided

**Colour model: two colour histograms and a likelihood ratio.**
- Feature per pixel: the board's light-robust features (`boardReference.ts`): chromaticity
  (r and g shares) and log luminance. Quantise into bins (about 32 × 32 chromaticity × 6–8
  luminance); exact counts are the builder's call, sized so a stored model stays well under
  50 KB.
- **Room histogram** from the "Learn the room" frames: every pixel of every frame.
- **Hat histogram** from the "Learn the hat" frames: in each frame, the pixels whose colour
  is new against the room histogram (room count in that bin, after a ±1-bin blur, near
  zero), kept only in the largest connected patch of such pixels that passes the existing
  size floor (`MIN_CAP_AREA`) and, when a face is found, the existing "on the head" test.
  Frames with no such patch are skipped.
- Both histograms blurred by one bin so a small light shift still lands on learnt shades.
- Per pixel while tracking: `p = hat / (hat + room·w + ε)` from the light-corrected
  pixel's bin; the pixel is "hat" when `p ≥ sure` ("How sure before it counts", default 0.6,
  range about 0.3–0.9). This mask replaces `matchesCap` inside `findCap` when a learnt hat
  exists; flood fill, size floor and nearest-to-last scoring stay as they are.

**Light correction:** store a small mean picture of the room (about 40 × 30 RGB) at "Learn
the room". Each frame, estimate a per-channel gain from the current frame against it with
the board's robust median approach (`estimateGain`: median ratio, clamped, minimum samples),
and divide it out before binning. Tim moving covers part of the picture; the median carries
it. If the gain can't be estimated (too few samples), use 1.

**Learning result, in plain words** (computed from the learning frames):
- how much of the hat is found at the chosen sureness (found share), and
- whether any patch of **room** pixels, at least the cap's size floor, would pass as hat.
- Lines (exact wording the builder may refine, plain language):
  - "Hat learnt: it stands out well from the room."
  - "Hat learnt, but something in the room looks like it (outlined in the picture). Move it
    out of shot or learn again."
  - "The hat is hard to tell from the room here. Try more light, or a hat in a stronger
    colour."
  - "Couldn't see the hat. Check it is in the picture and learn the hat again."
  - Step 2 before step 1: "Learn the room first, with the hat off."

**Where it lives:** `CapSettings` gains the learnt hat (both histograms, the small room
picture, the sureness, the learnt-at time) with a sanitiser that rejects anything malformed
(back to no learnt hat). The cap is per player, so the learnt hat is per player too.
**"Forget the learnt hat"** goes back to the click colour. Clicking the hat in the preview
(today's way) still works for players who never learn; once a hat is learnt, the learnt
model is used and the preview says so.

**UI (Cap tab, `CapPanel.tsx`), plain words:** a "Learn the hat" card above today's colour
click: "1 · Learn the room (hat off)" and "2 · Learn the hat (hat on)", each with a visible
countdown and progress while it watches; the result line; "Show what it sees as the hat"
(tints the hat pixels in the preview, and outlines a look-alike patch); the "How sure"
slider; "Forget the learnt hat". Every new control keyboard-usable, with focus never dropped
to the page when a button goes or changes.

## Left to the builder

Bin counts and blur, `w`/`ε`, the minimum frames for a usable model, how many frames each
step takes in its ~3 s, storage encoding, the outline drawing, and exact wording within the
plain-language rule. Each choice listed in the report.

## Tests that prove it

Synthetic 160×120 frames in unit tests (no real pictures):
- A room with a static red chair and a hat of a slightly different red: today's HSV rule
  takes the chair (or both); the learnt model finds only the hat.
- The same scene dimmed by 40 % and warmed (red gain up, blue down) after learning: the
  learnt model still finds the hat, at about the same place.
- Learning with no hat in step 2: "Couldn't see the hat", no model saved.
- A room containing the hat's colour: the look-alike warning, with its place.
- The sanitiser: round trip, malformed input rejected, stored size under the limit.
- A player with no learnt hat: `findCap` results unchanged from today (existing tests pass
  untouched).
- e2e with Chromium's fake camera (as `e2e/capCamera.e2e.ts`): the two steps run and show a
  result line with no page errors; if an honest e2e of the full learning can be built from
  a generated video, the cap follows the hat and ignores a static red patch.
