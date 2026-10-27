# Show ready — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix every Blocker and every show-path Major in docs/research/2026-10-27-journey-test-report.md, then review and re-test until a 7-minute show with Tim at the iPad cannot go silent, run over, or play wrong by accident.

**Source of truth:** the report (sections C, D, E, F) and the tester reports in the session scratchpad (team/T1–T4-report.md). Finding ids (T2-01 …) refer to those.

**Owner's instruction (2026-10-27):** "Yes then review and keep fixing. Do not stop until it is show ready." Commits per work package are authorised.

## Decisions taken (the report's recommendations; the owner can overrule)
- F1: hide the old ways to make a loop inside New loop and during the show (Save the board here, Overwrite, Capture on the show strip); keep them elsewhere until the rig session.
- F2: New loop is blocked while the piece clock runs ("Stop the piece to make a loop").
- F3: Tim's iPad, safe layout: the Extra notes strip, New idea, End piece (two taps, bounce-proof). No Mute, no loop or scene pads, no Next, no Capture; Speed locked. Offered as one button ("Use the safe show layout") on the iPad settings, and the default for new players. Mute on the iPad always needs two taps.
- F4: a scene may be "Tim alone" only when marked so; Make my plan never makes one; the check treats an unmarked scene that would be silent without Tim as a problem.
- F5: 7:00 is a hard limit for the piece length.
- F6: accept that a kept loop in Ableton plays the track's current sound (noted in the guide).

## Global constraints
- TypeScript strict; tests first (Vitest; Playwright for flows); `npm run lint`, `npm run test:run` green after each package.
- Plain words on screen. Every user-facing threshold calibratable (per player where it is a motor threshold).
- Never port 3001; test servers use a temporary ADMI_DATA_DIR; never touch .admi-data.
- Existing saved profiles keep working.

## Work packages (sequential; each is one implementer and one commit or a few)

### WP-A: Tim's iPad (Blockers 1, 2; T4-06, T4-08, T3-09)
- Bounce guard: the confirming second tap of End piece and Stop all counts only if it comes at least `secondTapMinMs` after the first (default 500 ms, per player, beside the second-tap window). Test: two touches 60/120/250 ms apart never end the piece; 600 ms apart do.
- Slide-off cancels: with act-on-lift, a touch that leaves the pad before lifting does nothing.
- Mute on the iPad needs two taps (same guard).
- Safe show layout (F3): a button on the laptop's iPad settings that sets the shown strips and pads and locks Speed; new players start with it.
- An iPad loop tap while the laptop is stopped: refused with "Press Play on the laptop first" on the iPad (not queued silently).

### WP-B: Building the piece (Blocker 3; T2-02, T2-04, T2-06, T2-07, T2-11)
- Make my plan never leaves a scene without loops (Open gets the first loops, or Bed + another); a scene can be marked "Tim alone" (F4).
- The check flags: a scene with no loops that is not marked Tim alone; a scene with no time ("by hand"); a scene after the end; length over 7:00; and names the empty loop and offers "Take it out" in the check.
- The open scene panel stays on the scene being edited when the list re-sorts (track by id).
- Times: "2.30", "2:30", "2,30" all mean 2:30; anything unreadable is refused with a visible message.
- Length: capped at 7:00 (F5), with a visible message.

### WP-C: Loops (batch 1 items 1–4; Blocker 4; T4-04, T4-02)
- New loop cuts notes still ringing (release every voice and Ableton notes as Stop does).
- New loop never sticks on "Lift the 0 counters" (the empty-board watcher).
- After Keep, the name box takes focus once (effect keyed on the slot number).
- Inside New loop: no "Save the board here", Overwrite or Edit notes rows; the show strip has no Capture (F1).
- Clearing a loop that scenes use: confirm naming the scenes; on confirm, the loop is taken out of those scenes (the check then flags them); Keep never picks a slot a scene still uses; clearing a slot clears its name.
- All 8 loops full: Keep shows "Every loop is full: clear one first" on screen; the heading does not say "New loop 8".
- New loop is disabled while the piece clock runs (F2), saying why.

### WP-D: Show safety (T2-05, T3-17, T3-08, T4-11, T1-03, T4-05)
- "Jump here now" (stopped) and rehearsals never write Tim's own settings.
- "Carry on" survives a closed and reopened laptop tab within the piece's length (localStorage, with time).
- No Debug Panel in the production build (only with ?debug in dev).
- The click on ▶ Play / Start the piece with an empty board: find the cause (systematic debugging) and remove it.
- Two tabs: the second tab cannot save (read-only), saying why.

### WP-E: Access (T1-04, T4-09, T4-10)
- Focus stays sensible after New loop, Done, Leave, Keep, Start with these and the other buttons in T4-09.
- New loop panel: grouped "Hear it with…" chips, names that say what they do, Keep's reason linked.

### WP-F: Review and re-test loop
- A fresh whole-change code review (Opus).
- The test team re-runs its charter on a fresh build (4 testers + product owner triage).
- Fix every Blocker and show-path Major found; repeat until none remain.
