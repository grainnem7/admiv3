# 1-journey: facilitator journey

Saved by the controller from the reviewer's hand-back.

**Summary:**
- First time, from nothing to the end of a piece: about 72 clicks, about 100 s scripted, about 20–30 min for a person.
- Show day: 5 clicks and a drag, 9.1 s scripted, about 45–60 s for a person.

**Setup:** headless Chromium with a fake camera (a synthetic hat video). The first journey used 1366x768, the returning one 1440x900. The machine was loaded, so scripted times may be inflated.

## Journey 1: first time

Times are scripted / estimated for a person.

| # | Step | Screen | Clicks | Time | Friction |
|---|---|---|---|---|---|
| 1 | Open the page | Welcome | 0 | 1.6 s / 10 s | Choices are clear (01) |
| 2 | Play on the laptop | Who's playing? | 1 | 1.8 s / 5 s | |
| 3 | Name Tim, Left, Create | Who's playing? | 2 + 3 keys | 3.4 s / 15 s | Name field centred, the rest left-aligned (03) |
| 4 | Add four colours | Set up · 1. Colours | 1 | 1.9 s / 10 s | "Camera: starting…" shows on the laptop board; sound names cut off (05) |
| 5 | Hear, change a sound, Hear | Colours table | 3 | 4 s / 2–5 min with Tim | The real time cost |
| 6 | Continue, ▶ Play | Ready, then Play | 2 | 5.2 s / 10 s | ↶ is lost by Play (08) |
| 7 | Make a piece | Loops | 1 | 2.7 s / 10 s | |
| 8 | Loop 1 | Loops | 17 | 11 s / 1.5 min | Quick names work well (12) |
| 9 | Loop 2 | Loops | 12 | 5 s / 1.5 min | "Lift the 10 counters" doesn't mention Clear the board (14) |
| 10 | Loop 3 | Loops | 16 | 9 s / 1.5 min | |
| 11 | Scenes, Make my plan | Scenes | 2 | 3 s / 30 s | Four scenes in one click (18) |
| 12 | Ending & check, Back up | Ending & check | 2 + 1–2 in the save dialog | 3.3 s / 1 min | Never says a plain "Ready" on the laptop board (19, 20) |
| 13 | Cap on, Learn the room, Learn the hat, up–down to Brightness | Play · Cap | 7–8 | ~25 s + 3 retries / 2–4 min | "The cap is found" while locked on a red chair; up–down starts on Volume; panel about 3,400 px (24, 25) |
| 14 | ▶ Show | Show | 1 | 2.4 s / 5 s | |
| 15 | Open the audience screen, drag, click | Show and audience | 2 + drag | 0.6 s / 20–40 s | Hint is clear (33); then click back on the laptop |
| 16 | Start the piece | Show | 1 | 1.5–2.9 s / 3 s | |
| 17 | ⏹ End, fade | Show | 1 | 20–33 s fade | One press; Cancel the ending is offered (57) |
| | **Total** | | **≈72 clicks, 3 keys, 1 drag** | **≈100 s / ≈20–30 min** | |

## Journey 2: returning (show day)

| # | Step | Screen | Clicks | Time | Friction |
|---|---|---|---|---|---|
| 1 | Open | Welcome ("Play my board") | 0 | 0.55 s (2.3 s in a fresh browser) / 5 s | |
| 2 | Play my board | Play, with player, board and hat restored | 1 | 1.3 s (2.8 s fresh) / 5 s | Opens on the last screen used |
| 3 | ▶ Show | Show | 1 | 0.7 s / 3 s | |
| 4 | Audience: open, drag, click | Show and audience | 2 + drag | 3.7 s / 20–40 s | Two windows to juggle |
| 5 | Start the piece | Show | 1 | 2.9 s / 3 s | |
| | **Total** | | **5 + drag** | **9.1 s (8.8 s fresh) / ≈45–60 s** | |
| R | Reload mid-piece, Carry on | Back to Show | 1 | 2.7 s + 1.2 s / ≈10 s | Clock carried on; audience screen stayed connected |

## Findings

### Major, before the gig
- **Show has no status for the hat, camera, sound or iPad.**
  - Play shows "cap found · Speed · Brightness" under the board. Show at 1366 doesn't.
  - Screenshot: 56
- **Leaving full screen leaves Show** (BoardSequencerScreen.tsx:1455–1466).
  - Clicking between the laptop and the projector window, pressing Esc, or a mirrored display could drop Show.
  - Once, in a headless run, the laptop had left Show and the piece was running without Start being pressed. This could not be reproduced, so it is unconfirmed.
  - Fix: keep Show open when full screen ends, and rehearse on the real displays.
  - Screenshot: 33
- **"The cap is found" shows before the hat is learnt, while it is locked on a red chair,** in green.
  - Fix: say "a red thing found: is it the hat?" and put Learn the hat first.
  - Screenshot: 24

### Minor, before the gig
- **Up–down starts on Volume.** Its drop-down is about 2,000 px down the Cap panel. Fix: move the "moves" choices to the top. Screenshot: 25
- **New loop says "Lift the 10 counters"** without mentioning Clear the board. Screenshot: 14
- **The Ready check never says a plain "Ready" on the laptop board.**
  - "Board: the laptop board" and "Not backed up" always show; "Keeping time 7.0 s slow" appeared once, likely from load.
  - Warnings that are always there teach her to ignore the check.
  - Screenshot: 19
- **One press of ⏹ End starts the ending.** It can be cancelled during the 20–30 s fade. Screenshot: 57

### Minor, after the gig
- **The header is 1 row when stopped and 2 rows when playing,** and the page scrolls. Screenshots: 08, 18
- **↶ (sound before) is lost between set-up and Play.** Screenshot: 08
- **The Cap panel is about 3,400 px tall** and clipped sideways ("Camera facing the player"). Screenshot: 25

### Polish, after the gig
- **"Camera: starting…" shows on the laptop set-up, and sound names are cut off.** Screenshot: 05
- **There is no visible "The piece has ended";** only screen readers get it. Screenshot: 58
- **The "AI: …" line shows in Show.** Screenshot: 56

## Questions for Tim and Chris
- **Learn the hat:** is about 3 s with the hat on, moving the head a little, comfortable, and does it work first time? (The synthetic video failed 4 times; the message was clear.) Screenshot: 30
- **Up–down:** should it be Brightness or Volume?
- **Tim's light:** does he want the audience to see it, and can he see it himself? Screenshot: 55

## What works well
- The show-day path is 5 clicks, even from a fresh browser restored from the laptop copy.
- Carry on returns to Show with the clock right, and the audience screen stays connected.
- Make my plan works in one click.
- The quick loop names and "Kept: Loop 1. Give it a name" work well.
- The Ready check is written in plain sentences.
- The Show strip reads well at 1366.
- The audience screen asks for nothing.
