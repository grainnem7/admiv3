# One channel per colour, grouped by job — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In "One per colour" mode, each colour plays on its own Ableton track, chosen by its job, so several melody instruments can play at once, fresh colours each session land on a track that holds their job's sounds, and each track stays light.

**Architecture:** `colourChannelMap(channels)` (src/midi/boardMidi.ts) stops reading each colour's stored `midiChannel` and computes the channel from the colour's job and its place among colours of that job in the colour list. Everything that routes per colour already goes through it (engine, Ableton plan, colour table, mapping helper, Hear). `filledChains` (src/midi/abletonSounds.ts) gives each job's tracks that job's sounds in both modes.

**Decided with the owner (2026-10-27):**

| Job | Channels | Notes |
|---|---|---|
| Melody | 1, 14, 15 | first melody colour in the list → 1, second → 14, third → 15 |
| Bass | 2 | |
| Chords | 3 | |
| Drums / band / Extra notes / Volume | 10 / 11–12 / 13 / 16 | unchanged; 16 is never a colour's |

- A fourth melody colour, or a second bass or chords colour, shares that job's last channel. The existing share warning says so.
- Channels 4–9 are never given to colours, so this works with "A fader per loop" on or off.
- A job change moves the colour to a track of its new job.

## Global Constraints
- The usual "One per part" mode is unchanged.
- Stored `midiChannel` values in saved profiles are left in place but no longer read: old profiles load and work.
- Plain words on screen.

## Review Focus
1. Fresh colours added in any order: each job's colours fill that job's channels in colour-list order, and nothing lands on 4–9 or 16.
2. Loop channels on: loops still take 4–9, and colours never do.
3. A colour that changes job moves to its new job's channel at once (engine, plan, table and Hear agree).
4. The Ableton plan, the checklist and Hear all use the same channel for a colour.

---

### Task 1: Channels by job
**Files:** `src/midi/boardMidi.ts`, `src/ui/screens/BoardSequencerScreen.tsx` (remove the assign-on-first-use effect), `src/ui/screens/boardSequencer/components/BoardMidiPanel.tsx` (the per-colour channel becomes a read-only label), tests in `src/__tests__/boardMidiAbleton.test.ts`, `src/__tests__/abletonSounds.test.ts`.
- Produces: `COLOUR_JOB_CHANNELS: Record<'melody' | 'bass' | 'chord', readonly number[]>`; `colourChannelMap(channels)` computed as above; `sharedColourChannels(channels)` from the computed map; `assignColourChannels`, `colourChannelPool`, `COLOUR_CHANNEL_POOL*` removed.
- [ ] Tests first:
  - three melody colours, then one bass and one chord → 1, 14, 15, 2, 3;
  - a fourth melody colour → 15, and `sharedColourChannels` reports 15;
  - stored `midiChannel` is ignored;
  - drums, off and control colours get no entry;
  - changing a colour from melody to bass moves it to 2;
  - no colour ever gets 4–9 or 16.
- [ ] Watch them fail, implement, then run the suite and lint.

### Task 2: What each track holds
**Files:** `src/midi/abletonSounds.ts` (`filledChains`), `AbletonSoundsPanel.tsx` (checklist wording), tests.
- [ ] Tests first:
  - per-colour mode: 1, 14 and 15 hold the melody set;
  - 2 holds the bass set and 3 the chord set;
  - 10–13 are World-only;
  - with loop channels on, 4–9 are World-only;
  - the checklist footnote says "In One per colour mode the melody colours use tracks 1, 14 and 15; build three Melody tracks."
- [ ] Watch them fail, implement, then run the suite and lint.

### Task 3: The guide
**Files:** `docs/ableton-setup-guide.html` (section 5 and 5a's per-colour note), `src/__tests__/abletonGuide.test.ts`.
- [ ] Test first: section 5 names the channels 1, 14 and 15 for melody, 2 for bass and 3 for chords.
- [ ] Rewrite: what One per colour does; that fresh colours each session are fine; copy the Melody track to 14 and 15 (same trimmed rack). Then the test, lint, the Ableton e2e and a build.
