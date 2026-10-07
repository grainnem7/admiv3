/**
 * BoardHelp — the "How to play" reference behind the ? button, on both Set up and Play.
 * Facilitator-facing: it describes every feature, whether or not it is switched on.
 * Presentational only (no props, no state, no audio).
 */

interface HelpEntry {
  title: string;
  body: string;
}

const HELP: HelpEntry[] = [
  {
    title: 'Setting up',
    body: 'Set up walks through four steps: Camera, Board, Colours, Ready. Each step says '
      + 'what to do with the real board; Continue is only offered once that step is done, '
      + 'and says why when it is not.',
  },
  {
    title: 'Finding the board for you',
    body: 'Press Find board and hold still for a second. It looks for the crossings where '
      + 'four squares meet, works out whether the board is 8 x 8 or 10 x 10, and shows you '
      + 'the corners it found. Nothing is saved until you press Looks right, and if it '
      + 'isn’t sure it hands you the editor with its best guess.',
  },
  {
    title: 'Finding the colours for you',
    body: 'Put one of each counter out and press Find colours. It learns what your board '
      + 'itself looks like, finds the counters as whatever doesn’t match it, and checks '
      + 'each colour against the board before offering it — so a colour that would light up '
      + 'the wood is caught here and starts switched off.',
  },
  {
    title: 'If the board gets knocked',
    body: 'A small nudge is followed automatically: the grid moves with the board and the '
      + 'music carries on. A bigger move asks you to find the board again. If pieces are '
      + 'knocked off, the pattern keeps playing as ghosts until you let them go, save them '
      + 'as a loop, or put the counters back.',
  },
  {
    title: 'Hands on the board',
    body: 'Squares your hand is over are held, not read: a counter underneath keeps playing '
      + 'and a sleeve can’t add a note. Held squares are drawn hatched, and the status '
      + 'line says how many. Check my hand (in Colours → Hands) shows what your own '
      + 'sleeve does.',
  },
  {
    title: 'Where the counter sits',
    body: 'Optional, and off by default: turn on "Where the counter sits matters" and a '
      + 'counter higher in its square plays louder, one to the right plays a little late. '
      + 'There is a dead zone in the middle, so "just in the square" stays easy.',
  },
  {
    title: 'Lanes',
    body: 'Controls and loop pads can live anywhere, or in one row or step you choose. A lane '
      + 'never plays notes, so it can’t make stray sounds, and a fader in a lane reads '
      + 'along it. Loop pads can be Hold (the counter stays) or Toggle (place to start, '
      + 'place again to stop).',
  },
  {
    title: 'Board corners',
    body: 'Corners are the outside corners of the squares, not the wooden edge. Tap them in '
      + 'the order the prompt asks, or press "Place corners for me" and nudge them with the '
      + 'arrows — the whole setup works with no pointer at all.',
  },
  {
    title: 'Adding colours',
    body: 'Put one of each counter on the board, then tap a counter (or use Pick a square '
      + 'and the arrow buttons). The sample is shown first: nothing is saved until you press '
      + 'Add. Each colour gets a suggested job you can change.',
  },
  {
    title: 'Playing',
    body: 'A playhead sweeps left to right; a piece sounds when the playhead reaches its '
      + 'column. Higher rows are higher notes. A cell only lights up when its note is '
      + 'actually heard, so the picture and the sound always agree.',
  },
  {
    title: 'Pieces not detected?',
    body: 'Open Detection sensitivity in Colours and lower "Piece coverage". If you have '
      + 'changed it and want the suggestion back, press "Reset to suggested".',
  },
  {
    title: 'Control counters',
    body: 'Give a colour a Control job (volume, tempo, reverb, delay or tone) and its counter '
      + "becomes a fader: the value follows where it sits on the board. Lifting it keeps the "
      + 'last value by default, so nothing goes silent by accident. ‖ means the value is held.',
  },
  {
    title: 'Variation',
    body: 'Shove a piece firmly off the centre of its square and it plays every OTHER time '
      + 'round (long-dash ring). The A/B letter in the status pill shows the current lap.',
  },
  {
    title: 'Ping-pong',
    body: 'Turn on Back and forth: the playhead runs → then ← for a longer, there-and-back '
      + 'phrase. The arrow shows the direction.',
  },
  {
    title: 'Loop bank',
    body: 'Turn on Loop bank and the bottom row becomes save slots. Put a counter on an empty '
      + 'slot and, once the pattern has been still for a moment, it is saved and keeps '
      + 'looping. Lift the counter to pause it, put it back to resume. Loops layer. Clear '
      + 'empties a slot.',
  },
  {
    title: 'Two players, one board',
    body: 'Each player has their own grid, jobs, sounds and loops; the board, camera and '
      + 'counter colours are shared. Switch with the Player button — no need to find the '
      + 'board or the colours again.',
  },
  {
    title: 'Hints',
    body: 'If the pieces stop lining up, or a colour starts matching the board itself, a hint '
      + 'appears above the board. Hints never change anything on their own, and "Not now" '
      + 'hides one until the problem comes back.',
  },
  {
    title: 'Sound worlds',
    body: 'Play → Sound → Sound world: Warm, Lo-fi, Ambient or Electronic. One choice sets '
      + 'every part’s instrument, the drums and the space so they suit each other. A colour '
      + 'you gave an instrument of your own keeps it. "My picks" is the old way: each colour '
      + 'plays the instrument chosen for it.',
  },
  {
    title: 'Each counter plays a phrase',
    body: 'With "A phrase" on, a counter plays a musical idea until the next counter of its '
      + 'colour: a drum counter plays a whole groove (higher rows are busier), a bass counter '
      + 'a bassline, a melody counter a short tune, and chord counters set the chords that '
      + 'bass and melody follow. One counter fills the loop; a second divides it. A soft band '
      + 'under each counter shows which beats it owns. "One note" is the old way.',
  },
  {
    title: 'The band',
    body: 'Off, Gentle or Full. A pad, a bass and a groove that join in on the pass after the '
      + 'first counter goes down, follow the chords, and stop once the pass the last counter '
      + 'left in has finished. Put down a bass, chord or drum counter and the band hands that '
      + 'part to you. The board’s bottom edge pulses with its beat.',
  },
  {
    title: 'Fill — the instrument adds notes',
    body: 'Turn Fill up and the instrument adds in-key notes around yours: passing notes, '
      + 'echoes, softer drum hits. It never plays where you already play, never louder than '
      + 'you, and nothing on a part you have not used. Ideas come from Magenta (Google’s '
      + 'music AI, downloaded the first time) or from simple rules. New idea rerolls, Back '
      + 'returns, Keep freezes, Clear turns it off. Added notes are dotted rings on the board. '
      + 'A colour can be given the Fill-amount control job, so a counter sets how much.',
  },
  {
    title: 'Evolve — the sound keeps moving',
    body: 'Turn Evolve up and each colour’s sound drifts every loop — brighter, darker, more '
      + 'space, echoes — and every 4, 8 or 16 loops moves to another instrument, another '
      + 'pattern, another kick and snare. Your notes stay yours. New sound takes another '
      + 'path, Back returns, Hold freezes the sound of this loop. The Play screen says what '
      + 'each colour sounds like now, and "New sounds" appears on the board at each change. '
      + 'A colour can be given the Evolve-amount control job.',
  },
  {
    title: 'iPad controls',
    body: 'Start ADMI with "npm run dev:ipad", tick iPad controls on the Sound tab, and open '
      + 'the link it shows in Safari on an iPad on the same Wi-Fi. Four strips (Speed, '
      + 'Dynamics, Fill, Evolve) slide like ThumbJam — the whole strip is the target, the '
      + 'ends are generous, values move in steps — and four pads (New idea, New sound, Keep, '
      + 'Mute) act on touch. Learn reach makes a player’s comfortable slide the whole range.',
  },
  {
    title: 'MIDI out',
    body: 'Sound tab → MIDI out: pick an output and the board’s notes go to it as they sound '
      + '(melody ch 1, bass 2, chords 3, drums 10). Send only your notes, or everything, and '
      + 'keep the built-in sound on or not. Chrome and Edge only; a DAW on this laptop needs '
      + 'a virtual port such as loopMIDI.',
  },
  {
    title: 'Session log',
    body: 'While the board runs, every note is logged with where it came from — placed, '
      + 'phrase, fill or band — plus the board whenever it changes and every setting change '
      + 'with who made it. "Save session" on the Play screen writes it as JSON (everything) '
      + 'or CSV (notes). Nothing leaves the machine otherwise.',
  },
  {
    title: 'Camera on its side',
    body: 'Camera step → Turn 90°. Press until the board is the right way up for the player. '
      + 'The corners and your colours are kept.',
  },
  {
    title: 'Learn the empty board',
    body: 'With every counter off, press "Learn the empty board" (Board step, or the Colours '
      + 'step when it has not been done). Counters are then found by being unlike the board, '
      + 'and the wood is never offered as a colour.',
  },
  {
    title: 'Performing — loops and scenes',
    body: 'Loops tab → Perform. Save the board into a slot ("Save board here") or draw a '
      + 'loop on screen ("Draw", no camera needed), and name it. Play and Stop take effect '
      + 'on the next pass, so a tap is never off-beat, with nothing on a pad. A scene is '
      + 'the loops playing now plus the sound world, band, phrases, fill, Evolve and tempo: '
      + '"Save scene from now", then Go, or "Next scene" to walk the set list. The iPad’s '
      + '"Loops & scenes" page has big pads for all of it and a Stop all. Loops fade in and '
      + 'out over half a pass, a pass or two passes ("Loops fade", in Perform), or at once.',
  },
  {
    title: 'The iPad for a player without fine control',
    body: 'Sound tab → Connections → iPad controls. Untick the strips and pads this player '
      + 'will not use: fewer things means bigger things. Lock a strip (a speed that must not '
      + 'change mid-piece) and it ignores touch. "A touch on a strip": Jumps to the finger '
      + '(like ThumbJam) or Follows the movement (landing changes nothing; sliding moves the '
      + 'value from where it was — for a finger that lands roughly). Learn reach makes a '
      + 'short slide the whole range. On the iPad, a resting palm is ignored and Stop all '
      + 'takes two taps.',
  },
  {
    title: 'Keyboard',
    body: 'Space starts and stops while playing (never during Set up, and never when a button '
      + 'or slider has focus). Tabs move with the arrow keys. Big board (⤢) fills the screen; '
      + 'Esc leaves it.',
  },
];

export default function BoardHelp(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>How to play</h2>
      {HELP.map((e) => (
        <div key={e.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</span>
          <span style={{ fontSize: 12, color: 'var(--bs-fg2)', lineHeight: 1.45 }}>{e.body}</span>
        </div>
      ))}
    </div>
  );
}
