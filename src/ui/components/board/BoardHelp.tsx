/**
 * BoardHelp — static "How to play" reference shown in the board sequencer controls
 * rail. Facilitator-facing; shows all features regardless of which toggles are on.
 * Presentational only (no props, no state, no audio).
 */

interface HelpEntry {
  title: string;
  body: string;
}

const HELP: HelpEntry[] = [
  {
    title: 'Basics',
    body: 'Line up the four board corners, click a piece to add its colour, then press '
      + 'Start. A playhead sweeps left→right; a piece sounds when the playhead reaches '
      + 'its column. Higher rows = higher notes.',
  },
  {
    title: 'Pieces not detected?',
    body: "Lower 'Min fill' in Colours & detection — a piece no longer has to sit "
      + 'dead-centre.',
  },
  {
    title: 'Variation',
    body: 'Shove a piece firmly to the edge of its square → it plays every OTHER time '
      + 'round (dashed ring). The A/B letter shows the current lap.',
  },
  {
    title: 'Ping-pong',
    body: 'Turn on Ping-pong: the playhead runs → then ← for a longer, there-and-back '
      + 'phrase. The → / ← arrow shows direction. Edge-shoved pieces play on the way back.',
  },
  {
    title: 'Loop bank',
    body: 'Turn on Loop bank: the bottom row becomes save slots. Drop a counter on an '
      + 'empty slot to SAVE the pattern above; it keeps looping. Remove to PAUSE, replace '
      + 'to RESUME. Loops layer. Clear (on a mini-view) empties a slot to re-record. The '
      + 'bottom row is slots, not notes, while this is on.',
  },
];

export default function BoardHelp(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {HELP.map((e) => (
        <div key={e.title} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{e.title}</span>
          <span style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>{e.body}</span>
        </div>
      ))}
    </div>
  );
}
