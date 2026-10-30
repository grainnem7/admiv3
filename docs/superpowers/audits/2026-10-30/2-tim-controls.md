# 2-tim-controls: Tim's controls (the iPad page and the red hat)

Saved by the controller from the reviewer's hand-back.

**Covered:**
- **Setup:** port 3312; laptop at 1440x900 on the laptop board, with a four-scene plan.
- **iPad:** a second browser context with touch, at 810x1080 and 1080x810.
  - Layouts: the safe layout, the full layout, and Loops & scenes.
  - Actions: Extra notes, New idea, the End piece double tap.
  - Failures: a laptop reload, a stalled link, and recovery.
- **Hat:** a fake camera playing a red disc that sits in the middle, glides left, leaves for 4 s, then comes back on the right. Also Learn the hat, Show and the audience screen.
- **Timings:** loopback on a loaded machine. Real Wi-Fi will add delay.

## Findings

### Major, before the gig

**A stalled Wi-Fi link shows as "Connected" on both sides for about 13 s, and touches in that time are lost.**
- What was seen: the iPad kept showing "Connected · playing" with a green dot, and the laptop "✓ iPad connected", until SILENCE_MS = 12000 (src/remote/useRemoteLink.ts). The only clue was the clock, frozen.
- A tap on Extra notes filled the strip to 90% while its label still said "Off". Nothing reached the laptop.
- Fix: treat 3–4 s of silence (or a missed clock tick) as lost; grey the iPad out and say "Not reaching the laptop".
- Screenshots: 29, 30, 31, 32

**In Show, nobody can see whether the hat is found, holding or paused.**
- The hat's line is drawn only on Play (BoardSequencerScreen.tsx:5424, `(view === 'play' || laptop) && capHud`).
- In Show with the camera board, it isn't drawn. With the laptop board, it is below the board, off screen. On Play it is 13 px text.
- The audience light follows the hat but never says "holding".
- Fix: a hat chip in Show's bottom bar.
- Screenshots: 45, 46, 47, 48

### Minor, before the gig

**The laptop doesn't show that the iPad's End piece is waiting for its second tap** (the 6 s purple "Tap again to end" on the iPad). Screenshots: 09, 10

**The armed End piece pad has no countdown,** and its text shrinks from 22 px to 18 px (IPadRemoteScreen.tsx:591). Screenshot: 09

**New idea switches Extra notes on, even while the laptop is stopped.**
- The level went from Off to 50% and was saved (newFillIdea, BoardSequencerScreen.tsx:3096).
- The loop and scene pads, by contrast, are refused while stopped.
- Why it matters: a stray touch changes how the piece opens.
- Screenshot: 03

**After a laptop reload, the iPad doesn't say the piece is waiting for "Carry on".**
- It shows "Connected · press Play on the laptop", and the clock and Now/Next are gone.
- Strip touches are still applied, for example "iPad: Extra notes 60%".
- Screenshots: 12, 14, 28
- Unanswered for about 6 minutes, Carry on correctly ends the piece (13).

### Minor, after the gig

**On the Loops & scenes page, rows are 11–13 px apart (gap 12, IPadRemoteScreen.tsx:511) instead of 18 px.** End piece and Stop all sit 13 px apart, bottom right. This page is hidden in the safe layout. Screenshots: 25, 26

**When the hat leaves and comes back somewhere else, Speed keeps its old value until the head moves.**
- Speed stayed at 188 for about 3.5 s after the hat came back, still, on the far right.
- Cause: "One direction at a time" (capTracker.ts:549, stepAxis:443).
- Fix: glide to the new place after the hat is lost and found again.
- Data: cap-out.txt

**Learn the room accepts a picture with the hat in it.**
- Step 2 then says "Couldn't see the hat", without saying why.
- Fix: in step 1, ask "Is the hat still on?" if it sees a hat-like patch.
- Screenshots: 49–52

### Polish, after the gig

**The strip's fill follows the finger, but its label follows the laptop,** so they can disagree, for example 90% filled with "Off" written on it. Screenshot: 29

**The hat's up–down defaults to Volume** (DEFAULT_CAP_SETTINGS, yRole: 'volume'). Check Tim's own profile is set to Brightness.

## Measurements

**Target sizes (CSS px):**

| Page and layout | Orientation | Targets |
|---|---|---|
| Safe layout | Portrait | Extra notes strip 774x458; New idea 774x228; End piece 774x187; 18 px gaps |
| Safe layout | Landscape | Strip 1044x296; New idea 1044x169; End piece 1044x138 |
| Full layout | Portrait | Strips 180x465; pads 180x228; End, Capture and Stop all 246x187 |
| Full layout | Landscape | Strips 248x303; pads 248x169; End, Capture and Stop all 336x138 |
| Loops & scenes | Portrait | Loop pads 180x209; scene pads 180x291 |
| Loops & scenes | Landscape | Loop pads 248x143; scene pads 248x202; bottom row 225x116 |

The laptop Cap tab has no control smaller than 44 px.

**Response times (loopback):**
- Extra notes: 4–41 ms.
- New idea: 6 ms.
- End piece: 35 ms.
- Reconnect after a stall: about 2.2 s.
- Reconnect after a laptop reload: about 2.7 s.

**Strips:** the bottom 5% is Off and the top 5% is 100%, with 10% steps between.

**Guards working:**
- Palms over 160 px are ignored.
- End piece needs two taps, with a 0.5 s bounce guard and a 6 s window.
- New idea ignores repeat taps within 0.7 s.
- Speed is locked, and the safe layout hides the risky pads.
- "Use the safe show layout" works in one press and says what it did (27).

**The hat:**
- It says "not in sight (holding)" within about 0.5 s of leaving.
- It says "paused while learning" during Learn the hat.

## Questions for Tim and Chris
1. End piece is the bottom full-width pad, 18 px below New idea. Could a resting wrist or forearm land on it, given Tim is left-handed? Would he rather have it at the top, or only on the laptop?
2. Does he prefer the iPad upright (strip 458 px tall) or on its side (296 px)?
3. Should the iPad show the hat's state?
4. Is New idea's 300 ms flash enough to tell him it worked?
5. Are the 6 s window and the 0.5 s bounce guard right for his press?
6. When the hat goes out of shot, should it hold its last value or drift back to the scene's speed?
7. Can he see the projector's hat light from where he plays, and is it enough?

## What works well
- The safe layout has 3 huge targets, Speed locked, a one-button set-up, and it is the default for new players.
- End piece's two taps and its bounce guard work, and the waiting tap clears when the laptop stops.
- Touch handling:
  - palm rejection
  - "act on lift"
  - Follow mode
  - learnt reach
  - the 👆 "touch seen" mark
- The iPad shows a large clock, Now/Next and a beat light. It reconnects in 2–3 s and reloads itself for a new build.
- The hat:
  - holds when lost
  - names its states in plain words
  - has a lock
  - Learn the hat gives clear countdowns and outcomes
