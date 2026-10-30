# 3-accessibility: WCAG 2.2 AA, keyboard and switch use

The controller saved this from the reviewer's hand-back.

**How it was tested:**
- **Setup:** the dist build on port 3313, with muted Chromium and a fake camera.
- **Screen sizes:** mostly 1366x768; also 1024x768 for the iPad page and 320x640 for reflow.
- **Tools:** axe-core on every screen, in dark and light mode (axe-*.json), plus checks by hand.
- **iPad page:** opened at /?remote=1234, which stayed on "Waiting for the laptop" because no laptop was paired.

## Findings

### Major, before the gig
- **Quick repeated presses on "▶ Start the piece" start the piece and then stop it.** (Accidental activation; closest criterion 2.5.2.)
  - What was seen: in Show, with focus on Start, pressing Enter 6 times 250 ms apart started the piece. Presses while it loaded were ignored. Then focus moved to ■ Stop, so the next press armed Stop and the one after stopped the piece, about 1.5 s after it began.
  - Fix: ignore Stop for about 2 s after the start, or don't move focus onto Stop.
  - Screenshot: 44-show-bounce-presses.png

### Minor, before the gig
- **1.4.3: in light mode, summary lines are grey on grey at 2.12:1.**
  - Example: "7:00 · fade over 2 passes · you press End" is #a1a1aa on #e6eaf0. The Scenes step has the same problem.
  - Cause: the old style `p { color: var(--color-text-secondary) }` in base.css:104 leaks into the Board Sequencer (for example PieceSteps.tsx:576).
  - Fix: use `var(--bs-fg)` for paragraphs inside `.bs-root`.
  - Screenshot: 12
- **1.4.3 and 4.1.2: the scene timeline chips.**
  - White text at 12 px bold on bright colours: Home 6:00 is 2.26:1 (#31c46e), Build is 3.26:1, Arrival is 4.45:1.
  - The chips are `<button role="listitem">` (PieceSteps.tsx:426), so a screen reader announces a list item, not a button.
  - Screenshot: 13

### Minor, after the gig
- **1.4.11: empty board squares are 1.11:1 (dark) and 1.14:1 (light) against the page, with an edge line of 1.4:1.**
  - Fix: an edge of at least 3:1, for example `--bs-border-control`, which is 3.3:1.
  - Screenshots: 02, 21
- **1.4.10: at 320 px the header doesn't wrap, so the page is 428 px wide.** Screenshot: 24
- **2.1.1 and 2.4.3: Help is hard to use by keyboard.**
  - It opens at the end, with focus on Close.
  - It is 3,500 px of text, and the keys scroll it about 20 px per press.
  - Fix: open it at the top and add links to its sections.
  - Screenshots: 36, 42
- **2.5.3: some visible labels are not at the start of their accessible names.**
  - "Save session" is named "Save the session log…".
  - "↻ Try another" is named "Try other extra notes".
  - The Rehearse buttons are named "Rehearse from Arrival…".
  - The set-up steps show "1. Camera" but are named "Step 1 of 4: Camera".
  - The "Edit the notes of loop N" buttons have the same problem.
- **2.2.1: time limits that can't be changed.**
  - The second press of Stop, Exit or Set up must come within 4 s (STOP_CONFIRM_MS, BoardSequencerScreen.tsx:286).
  - Undo lasts 15 s (line 302).
  - Notices last 2.5 s.
  - Fix: offer a 3, 6 or 10 s choice, as the iPad already has. Screenshot: 16
- **2.1.4 (in spirit): Space plays and stops, and can't be turned off.** Switch boxes often send Space. Shift+S is fine. Fix: an on/off setting in Advanced.

### Polish, after the gig
- **The iPad page:**
  - While waiting, the pads look dimmed but are not marked as unavailable to a screen reader.
  - The 3 page tabs are 3 separate Tab stops.
  - Pad names include their emoji.
  - "0%" is 3.46:1 while inactive. The connected state wasn't seen. Screenshots: 30, 40
- **Headings and page titles:**
  - Headings jump from h1 to h3.
  - Welcome has two "main" regions.
  - The audience page's tab title is just "ADMI".

## Switch and keyboard counts (Tab moves, Enter presses)
- **Starting the piece from a fresh page: 8 presses.** Tab ×5 to Show, then Enter, then Tab, then Enter.
- **End: 3 presses.** It can be cancelled.
- **Stop: 5 presses.**
- **Simplify: 4–5 Tabs and Enter, or Shift+S.** The scan passes Next ▶ and End on the way, so a stray press there jumps a scene or starts the ending.
- **Passes:**
  - No keyboard traps (Esc leaves Show).
  - Focus is always visible: 2 px outline, 2 px offset (2.4.7 and 2.4.11).
  - The skip link is present.
  - Targets are at least 44 px (2.5.8).
  - Text spacing passes (1.4.12).
  - Nothing needs dragging (2.5.7).

## Questions for Tim and Chris
- Does Tim use, or might he use, iPad Switch Control or a switch box?
- Can Tim make the second tap for Mute and End piece in time? Which suits him: 3, 6 or 10 s?
- Can Tim see the squares and the playhead from his seat, in the venue lighting?

## What works well
- **Every sound has a picture:**
  - the playhead;
  - a ring on each counter as it sounds;
  - separate marks for the band and the extra notes (● ◌ ▬);
  - "Playing…" when Hear is pressed;
  - large cues;
  - status lines that are announced (4.1.3);
  - an audience glow with no flashing at 90 BPM.
- **Focus is handled well.** It never drops to the page. Tabs, radio groups and the grid each take one Tab stop and use the arrow keys.
- **Mistakes are hard to make:** two presses for Stop and Exit, an adjustable second tap on the iPad, and the ending can be cancelled.
- **Contrast passes elsewhere.** Large controls, plain words, and Help in the same place on every screen (3.2.6).
