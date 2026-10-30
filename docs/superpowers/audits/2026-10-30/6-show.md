# 6-show: show conditions (saved by the controller from the reviewer's hand-back; the harness blocked its own write)

Covered:
- Set-up: the built app on port 3316 with an empty data folder, muted Chromium, laptop board, 4 colours and a 4-scene plan.
- Laptop: Show and Play in dark at 1366x768 and 1280x720, and Show in light.
- Flows: Start, Stop once, Simplify with Mute, End then Cancel the ending, reload then Carry on, and Close the audience screen.
- Audience screen: at 1920x1080, 1280x720 and 1024x768, before, during and after the piece, and during a reload.
- Projector simulations (projsim.mjs): dark room (black lifted to 3%) and washed out (black at 10%, less colour).
- Flash measurement (flash.mjs).
- From the code only: the window hidden, and the camera, hat and iPad lost.

## Findings

### Major, before the gig
- **One press of "Close the audience screen" closes the projector window mid-piece.**
  - What happens: in Show the button sits between Simplify and Leave Show, in the same style (191x44 px). There is no second press and no Undo, and the window closed 1.7 s after one click.
  - Why it matters: reopening it gives a small 960x540 window, which then has to be dragged across and clicked again.
  - Fix: hide the button in Show while the piece plays, or make it need a second press, like Stop.
  - Screenshot: 04
- **Show gives no warning when the camera, the hat or the iPad is lost.**
  - Camera: the "The camera has stopped" banner is in Play only (BoardSequencerScreen.tsx:5385), and the Show layer covers it (5701–5762).
  - Hat: its status is only on the Cap tab.
  - iPad: "Link lost — reconnecting…" is only on the Connections tab (:3880).
  - Fix: a calm status line in Show, "Camera ✓ · Hat ✓ · iPad ✓".
  - Screenshot: 04
- **After the click that fills the projector, keyboard focus stays on the projector window.**
  - Space and Shift+S then go to the audience window, which ignores them.
  - Esc there shows the browser's title bar, and Chrome shows its "Press Esc to exit full screen" bubble.
  - Fix: the notice should add "then click back on this laptop screen".
  - Code: useAudienceWindow.ts:23, AudienceScreen.tsx:139
- **When the laptop page is covered or minimised, the audience screen goes dim while the music plays on.**
  - Cause: the feed runs inside the drawing loop (BoardSequencerScreen.tsx:1821–1842; requestAnimationFrame in useBoardRuntime.ts:655), and Chrome stops that loop for a hidden window. After 2.5 s with no feed, the audience screen fades (AudienceScreen.tsx:22).
  - The camera board reading stops too.
  - Not measured: headless Chrome can't hide a window, so this comes from the code.
  - Fix: tell the owner on screen to keep this window in front.

### Minor, before the gig
- **Opening the audience screen from inside Show may leave Show.**
  - Why: leaving full screen leaves Show (:1463).
  - Unverified: headless stayed in Show (screenshot 03).
  - Fix: open it from Play, or check it on the show laptop.
- **"⏹ End" is the brightest control in Show.** It is the only filled button (mint), and End and "■ Stop" share the square sign. End can be cancelled. Screenshot: 04
- **Banners push the clock and the board down mid-piece** (screenshots 05 and 06).
  - These are Simplify, keeping time, the Ableton port, and the reload offer.
  - "Ableton's port has gone…" is a bright amber bar (#e9cf8f), the brightest thing on screen.
  - Fix: a fixed-height status row.
- **Mute shows only as the word "Muted" and an orange outline on the button.** Screenshot: 06

### Minor, after the gig
- **The dim board before the piece is invisible on a typical projector.**
  - Counter contrast on screen is 1.45–2.3:1. Simulated, it is 1.2–1.7:1 in a dark room and 1.1–1.3:1 washed out.
  - While playing, it is 2.8–6.9:1 in a dark room and 1.8–3.6:1 washed out. Ripples and the band light are lost when washed out.
  - Fix: a venue brightness setting, or a before level of about 0.4 instead of 0.22.
  - Screenshots: 20, sim-*-20, sim-washed-21
- **The scene name is faint and close to the corner.**
  - It is about 1.5% of the width (29 px at 1920 wide, 15 px at 1024), at 55% opacity, 2% from the edge.
  - Contrast: 5.3:1 on screen, 3.4:1 in a dark room, 2.1:1 washed out.
  - Fix: move it 5% in from the edge, at opacity 0.8.
  - Screenshots: 21, 22
- **Flashing (WCAG 2.3.1): realistic boards pass, but an extreme case fails.**
  - Passes: a full 8x8 board at Speed 240, one column per step, gives 0 flashes a second.
  - Fails: all 64 counters sounding together 4 times a second gives 3.5 flashes a second (swing 0.18).
  - Cause: blooms have no rate limit (light.ts:126, 222).
  - Fix: limit re-blooms, or scale the glow by how many counters bloom at once.
  - Screenshot: 30-flash-1
- **If the projector mirrors the laptop instead of extending it, the audience sees the whole Show view.** With only one screen, the app just asks for a drag (placement.ts:44). Fix: "Only one screen: is the projector set to Extend (Windows key + P)?" Screenshots: sim-*-04

### Polish
- **Before the gig: a light-theme Show is a light box in a dark room.** It is 87% of white on average, against 3.5% for dark. ☀ switches theme with one click. Screenshot: 14 vs 04
- **After the gig: small things.**
  - The "AI: … Turn them up on the Sound tab" line shows in Show.
  - Show's controls are 44 px with 14 px text.
  - The drag notice stays for 30 s. Screenshot: 12
- **After the gig: a false "didn't open" message.** If the audience window takes more than 8 s to load, the laptop says it didn't open (useAudienceWindow.ts:32).

## Pre-show checklist the app could give
1. Projector set to Extend (Windows key + P).
2. Open the audience screen from Play, allow, click once to fill it, then click back on the laptop, all before the audience arrives.
3. Dark theme.
4. Keep the ADMI window in front.
5. Camera seen; hat learnt and in sight.
6. iPad connected.
7. Laptop plugged in, sleep and notifications off, brightness down.
8. Sound source as planned.
9. Pop-ups allowed.

Only the iPad check is in the Ready check today.

## Questions for Tim and Chris
- When the hat is out of sight, the light only dims a little. Should the projector show it more clearly, or is a quiet hold better?
- Can Tim see the projected light from his seat, and does it help him or distract him?
- Should the scene name be on the audience screen, and can Tim read it?

## What works well
- The audience screen shows only the scene name, with no buttons or cursor. A lost laptop shows the dim board, never an error (screenshot 24).
- After a reload and Carry on, the audience window reconnects, and the laptop returns to Show in full screen (08, 09, 25).
- The board stays centred on a 4:3 projector (22).
- Tim's light pulses at most 3 times a second.
- Stop needs two presses, End can be cancelled, and the Simplify label is clear.
- The dark Show view is calm, and the clock is large.
