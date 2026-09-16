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
