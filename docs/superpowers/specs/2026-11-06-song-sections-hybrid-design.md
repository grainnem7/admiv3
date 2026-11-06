# Song sections: Elvis's voice inside a Board Sequencer piece (the hybrid)

Owner's request, 2026-11-06: use Tim's favourite song, "Can't Help Falling in Love", with
the Board Sequencer: a hybrid of a ready-made piece and Tim performing, with Elvis's actual
voice, using all of the song but making something new of it. The cap keeps control of the
speed. What the cap's speed move does while Elvis sings is chosen in ADMI.

## Decisions

- **The record leads its sections.** A recording can't follow the cap without being
  stretched (grainy) or re-pitched (out of tune with the band). So while a section of the
  song plays, the band follows the record's own beats (its tempo breathes); in the
  instrumental sections the board's own clock, and so the cap, sets the speed. A band
  handing the tempo to its singer for a verse.
- **The stems play in ADMI, the instruments in Ableton.** The board must know exactly where
  the recording is to follow its beats; ADMI playing the stems itself always knows. The two
  sounds meet at the speakers, lined up by "Send early by".
- **The beat count carries on through a section.** Passes, loops, scenes, fills and the
  ending all count beats; a section's beats continue the board's count, so a section that
  is a whole number of passes long leaves the board exactly in step.
- **In a section the loops follow the record's chords** (the song's chord map, from its
  analysis): rows become the chord's notes, so a harp's broken chord or the trombone's line
  fits the song as it moves, with nothing rewritten per bar.

## The song's map

From `public/songs/cant-help-falling-in-love/analysis.json`: 182 beats, 46 bars of exactly
4 beats (bar n starts at beat 4n), chords with their real times. Sections, from the
earlier hand-made chord map (to be checked by ear and adjusted in ADMI): intro bars 0 to 2,
verse 1 bars 2 to 14, verse 2 bars 14 to 26, bridge bars 26 to 36, verse 3 and the end
bars 36 to 46. Each is a whole number of 2-bar passes on the 8-step board.

## Stage 1 (this change): the plumbing

- `songs/song/songSection.ts` (pure): a scene's song section (the song, from bar, to bar,
  each stem's level), made safe from storage; where each of its beats falls; its tempo.
- `audio/songStems.ts`: the four stems on the engine's audio context, started at an audio
  time from any point of the song, each at its own level, faded out at an audio time.
  They join the board's output after its mix (so they sound with Ableton as the sound,
  and Mute, the ending's fade and the world's level still apply).
- The engine: a piece that has song sections loads the song before its first beat. A cued
  section starts on the next pass boundary: the stems start there at the section's first
  beat, and the board's beats follow the record's until the section's end, carrying the
  count on; then the board's own clock takes over at the record's last tempo. A section
  that starts where the last one ended continues the same playback (only the levels move).
- Scenes: an optional `song` field; a scene with one cues its section, as its loops land.

## Later stages

2. The piece: the whole song in a new order, with ADMI's band around and under it, opened
   like the demo piece. The scene times of a piece whose speed the cap moves need care:
   wall-clock times drift from the passes when Tim changes speed.
3. The cap while the record leads: a choice in ADMI (band fuller or sparser, the voice
   louder or softer, the record's band in or out, or nothing). Help and the guides.
4. Copyright: the stems are in the public repository and should live on the laptop only.

## Where stage 1 stopped (paused 2026-11-06, the demo piece first)

Done and tested: `songSection.ts`, `songStems.ts`, `songAssets.ts` (loads a library song's
map and stem addresses), the engine's sections (cue, hand over on the pass boundary, the
count carrying on, chained sections, the clock taking over at the record's tempo, the
speed held while the record leads, Stop), and `Scene.song` (saved and made safe).

Not done: the screen. To pick up, in `BoardSequencerScreen.tsx`: in `startEngine`, when
the piece has a scene with `song`, `await loadBoardSong(id)` and `engine.prepareSong(...)`
before `engine.init()`; after `engine.start`, cue the opening scene's section; in
`goScene`, `engine.cueSongSection(scene.song ?? null)`. A piece begun over a board already
playing (`beginPieceNow`) has no song loaded: restart the engine there, or load it then.
