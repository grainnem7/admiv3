# Chess music: what was built

Branch `chess-music`, from `instrument-look`. A game of chess, played on a real board under
the camera or replayed from a famous game, turned into music inside ADMI.

## Where it is

Welcome → Other ways to play → **Chess music** (`src/ui/screens/ChessMusicScreen.tsx`).
Two sources: **A famous game** (the 1858 Opera game, one move a second, Play / Pause /
Restart) and **The real board** (camera).

## The music (`src/songs/chess/`)

- `chessNotes.ts`: a move is a note on the square it lands on. The file a to h is the step in
  C major (C D E F G A B C), the rank the octave (ranks 1 and 2 octave 3, up to 7 and 8 in
  octave 6). Twelve voices, piece type times colour; black an octave lower, bishops an octave
  up, rooks and kings an octave down. A capture adds a snare, check an accent and a cymbal
  (louder at mate), castling plays the king then the rook, a promoted pawn plays as its new
  piece. A captured piece is never heard again.
- `chessVoices.ts`: the sounds, from the board sequencer's catalogue. Pawns harp / nylon
  guitar, knights clarinet / bassoon, bishops xylophone / bells, rooks cello / upright bass,
  queen trumpet / French horn, king soft synth pad / choir pad. Changeable and mutable on
  screen (`chessVoiceStore.ts`, `ui/screens/chess/VoiceTable.tsx`); a muted voice is neither
  heard nor drawn.
- `ChessSoundEngine.ts`: every sound goes out on a chess `MusicEventEmitter` first; the
  engine plays what the bus carries through `BoardSequencerVoice`, the round robin drum kit
  and the `EffectChainManager`. The drawn board lights each sound's square from the same bus.
- `chessMusic.ts` (tension): Stockfish's evaluation (or material and checks) gives Energy
  (louder moves, a kick under lively ones); an even game is calm, an advantage and above
  all a swing are lively. The phase gives the World: warm opening, electronic middlegame,
  ambient endgame (effect presets warm, synthwave, space). At checkmate or the game's last
  move the chord ending plays every piece left, rolled low to high, the winner louder.
- `stockfishEval.ts`: Stockfish 19 lite single threaded (npm `stockfish`, 1.8 MB wasm, no
  special headers) in a worker at depth 10. Falls back to material when it doesn't answer.
  Note: Stockfish is GPL licensed.
- `chessTension.ts`: keeps the evaluation per move, Energy, phase and World; drawn as a line
  (`ui/screens/chess/EvalLine.tsx`).

## The camera (`src/tracking/chess/`)

- `chessOccupancy.ts`: each square is empty, a white piece or a black piece, read from the
  middle 60% of the square by brightness, its spread and two colour axes. Learnt from the
  start position: the empty middle and the two sides give a centre per state on light and
  dark squares, and which side White sits at. Corners from the existing board finder
  (`boardDetect/detectBoard`) or by tapping. A slant check (opposite sides more than 1.25
  apart) asks for the camera to be put more straight above.
- `occupancySettler.ts`: a reading counts once it has held 700 ms with no hand over the
  board (the existing hand watcher, `handGuard/intruderMask`).

## Moves (`src/songs/chess/moveFromBoard.ts`)

Changed squares are listed, legal moves from them are tried, and those whose result looks
like the board are kept. Captures, castling, en passant, promotion (asked on screen), a
two-way choice (asked), a take back (the board before the last move), two quick moves
before the board settled. Anything else: "Not a move I understand: set the pieces back",
and the last good position is kept. `liveChessStore.ts` applies it and plays the moves.

## Tests

Unit: `chessNotes`, `chessOccupancy` (drawn boards in four orientations, the settle
window), `moveFromBoard` (sequences of grids), `liveChessStore`, `chessMusic`,
`chessVoiceStore`, and `chessPhotos` (skipped until the owner's photos are in
`src/__tests__/fixtures/chess/`). End to end: `e2e/chessMusic.e2e.ts` hears the famous game
and sees Stockfish answer; `e2e/chessBoard.e2e.ts` plays a drawn board as the fake camera,
learns it and hears 1. e4.

## Not done yet

- Real photos of the owner's board, and tuning the reader on them.
- The camera picture is not saved between visits; corners and learning are redone each time.
