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
    title: 'Words used here',
    body: 'Pass: one time round the loop, left to right — scenes, loops and the ending all '
      + 'land on a pass. Phrase: the idea one counter plays until the next counter of its '
      + 'colour. Scene: a set of loops and a sound, brought in by the clock, or by hand with Next '
      + 'scene or Jump here now. '
      + 'Loop: counters kept with New loop and Keep, that then play on their own. Band: a pad, '
      + 'bass and groove that answer the player. Extra notes: notes the instrument adds around '
      + 'yours. Sounds change: the sound of each colour slowly changing. Lane: a row or step kept '
      + 'for controls or loop pads, never notes. Hold / Toggle: a loop pad plays while its '
      + 'counter is on it, or starts and stops with each placement.',
  },
  {
    title: 'Setting up',
    body: 'Set up walks through four steps: Camera, Board, Colours, Ready. Each step says '
      + 'what to do with the real board; Continue is only offered once that step is done, '
      + 'and says why when it is not.',
  },
  {
    title: 'The laptop board — no camera, no board',
    body: '💻 Laptop (beside 📷 Camera, at the top, or under More on a narrower screen) plays without the camera or the real board: pick a '
      + 'colour above the board and click squares to put counters down; click again to lift. '
      + 'Everything else is the same — phrases, the band, extra notes, sounds changing, loops, scenes, the '
      + 'performance clock and the iPad — so a piece can be tested and planned at home. '
      + 'The counters stay there next time. A laptop that has never seen the board can add '
      + 'four ready-made colours. 📷 Camera goes back to the real board.',
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
    body: 'A playhead sweeps left to right; a counter sounds when the playhead reaches its '
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
    body: 'Give a colour a Control job (Volume, Speed, Reverb, Echo, Brightness, Extra notes or Sounds change) and its counter '
      + "becomes a fader: the value follows where it sits on the board. Lifting it keeps the "
      + 'last value by default, so nothing goes silent by accident. ‖ means the value is held.',
  },
  {
    title: 'Variation',
    body: 'Shove a counter firmly off the centre of its square and it plays every OTHER time '
      + 'round (long-dash ring). The A/B letter in the status pill shows the current lap.',
  },
  {
    title: 'There and back',
    body: 'Board tab → There and back: the playhead runs → then ← for a longer phrase. The '
      + 'arrow shows the direction.',
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
    title: 'The Sound tab',
    body: 'Overall feel (the world, Energy, Space and Groove) and Your colours are always open. '
      + 'Each helper below them (Band, Keep my notes on top, Chords, Extra notes, Sounds change, '
      + 'Loops vary) is one line that says how it is set: press it to open it. Groove (Straight, '
      + 'Swung, Lazy) sets the swing and the loose timing in one step; the Timing tab sets them '
      + 'finely, with the speed and the grid. ↶ beside a colour goes back to its sound before, '
      + 'also after a change made in Set up.',
  },
  {
    title: 'Sound worlds',
    body: 'Play → Sound → Sound world: Warm, Lo-fi, Ambient or Electronic. One choice sets '
      + 'every part’s instrument, the drums and the space so they suit each other. A colour '
      + 'you gave an instrument of your own keeps it. "My picks" is the old way: each colour '
      + 'plays the instrument chosen for it.',
  },
  {
    title: 'A counter can play a phrase',
    body: 'Each counter plays one note where it sits. On a colour’s card (Sound tab) you can '
      + 'choose a phrase instead: a counter then plays a musical idea until the next counter of '
      + 'its colour: a drum counter a whole groove (higher rows are busier), a bass counter a '
      + 'bassline, a melody counter a short tune, and chord counters set the chords that bass '
      + 'and melody follow. One counter fills the loop; a second divides it. A soft band under '
      + 'each counter shows which beats it owns.',
  },
  {
    title: 'The band',
    body: 'Off, Quiet or Full. A pad, a bass and a groove that join in on the pass after the '
      + 'first counter goes down, follow the chords, and stop once the pass the last counter '
      + 'left in has finished. It builds with you: a soft pad under your first counters, the '
      + 'bass from three counters, the drums from five. Put down a bass, chord or drum counter and the band hands that '
      + 'part to you. It answers the player, not the loops: a loop alone does not bring it '
      + 'in, and it keeps its parts while loops play. The board’s bottom edge pulses with its beat.',
  },
  {
    title: 'Extra notes — the instrument adds notes',
    body: 'Turn Extra notes up and the instrument adds in-key notes around yours: passing notes, '
      + 'echoes, softer drum hits. It never plays where you already play, never louder than '
      + 'you, and nothing on a part you have not used. Ideas come from Magenta (Google’s '
      + 'music AI, downloaded the first time) or from simple rules. ↻ New idea gives other '
      + 'notes (New idea on the iPad too), ↶ Previous goes back, 📌 Freeze holds them as they are '
      + '(Keep on the iPad), and Off turns them off. Added notes are dotted rings on the board. '
      + 'A colour can be given the Extra notes control job, so a counter sets how much.',
  },
  {
    title: 'Sounds change — the sound keeps moving',
    body: 'Turn Sounds change up and each colour’s sound drifts every loop — brighter, darker, more '
      + 'space, echoes — and every 4, 8 or 16 loops moves to another instrument, another '
      + 'pattern, another kick and snare. Your notes stay yours. ↻ New sound takes another '
      + 'path (New sound on the iPad too), ↶ Previous goes back, 📌 Freeze holds the sound of this '
      + 'loop. The Play screen says what '
      + 'each colour sounds like now, and "New sounds" appears on the board at each change. '
      + 'A colour can be given the Sounds change control job.',
  },
  {
    title: 'iPad controls',
    body: 'Start ADMI with "npm run show" (or "npm run dev:ipad" for testing), tick iPad controls on the Connections tab, and on an '
      + 'iPad on the same Wi-Fi point the Camera at the QR code it shows (or type the link into Safari). Four strips (Speed, '
      + 'Dynamics, Extra notes, Sounds change) slide: the whole strip is the target, the '
      + 'ends are generous, values move in steps — and four pads (New idea, New sound, Keep, '
      + 'Mute) act on a tap; Mute needs two. Learn reach makes a player’s comfortable slide the '
      + 'whole range. If the Wi-Fi stops passing anything for about 3 seconds, the iPad greys '
      + 'out and says "Not reaching the laptop" (its touches do nothing until it is back), and '
      + 'Show says "! iPad not reaching". After a reload of the laptop page mid-piece, the iPad '
      + 'waits for Carry on.',
  },
  {
    title: 'Sound from: ADMI, Ableton or Both',
    body: 'Connections tab → Sound from. ADMI: its own sound. Ableton: everything the board plays '
      + 'goes to Ableton over MIDI (the loopMIDI port called ADMI) and Ableton makes the sound; ADMI '
      + 'still draws every note. Both: the two together, for checking the timing. Channels: melody 1, '
      + 'bass 2, chords 3, all drums 10, band chords 11, band bass 12, Extra notes 13, or one per colour '
      + '(melody colours 1, 14 and 15 in turn, bass 2, chords 3; shown as "MIDI ch" on each colour card). Fades and Mute go out as CC 11, the Volume counter as '
      + 'CC 7 on channel 16. If the port goes during a piece, ADMI plays its own sound at once and waits '
      + 'for "Switch to Ableton". Panic stops any stuck note. Play test note checks Ableton is listening. '
      + 'Chrome and Edge only. Full setup: docs/ableton-setup-guide.html. With Instrument Racks in the '
      + 'template, a card\u2019s sound, the World and Sounds change switch Ableton\u2019s sound too (CC 30), and Loud, '
      + 'Bright and Space move its macros (CC 24 to 26). "A fader per loop" puts each loop on its own track '
      + '(channels 4 to 9) so it fades smoothly. "AI: Extra notes off" under the board means nothing generative '
      + 'is playing: turn them up on the Sound tab.',
  },
  {
    title: 'Session log',
    body: 'While the board runs, every note is logged with where it came from — placed, '
      + 'phrase, extra note or band — plus the board whenever it changes and every setting change '
      + 'with who made it. Under the board, open Session log: "Save session" writes it as JSON '
      + '(everything) or CSV (notes), and Describe board reads the board out. Nothing leaves '
      + 'the machine otherwise.',
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
    title: 'Board, Make a piece, Show',
    body: 'Three buttons at the top. Board: just play the board, with the Sound, Timing, Board '
      + 'and Connections tabs — no loops or scenes needed. On a narrower screen, Open the audience '
      + 'screen, Set up and Camera / Laptop are under More. ▶ Play the board plays what is on the '
      + 'board: no clock, no scenes. Make a piece: three steps. '
      + '1 Loops: press New loop, put counters down, then Keep, and give the loop a name. '
      + '2 Scenes: "Make my plan" gives four scenes across the piece, each with your '
      + 'loops; tap one to change it (a time can be typed 2:30 or 2.30); ▶ Rehearse from here '
      + 'plays from it. A scene with no loops is silent unless the player plays: tick "alone" in it '
      + 'only if that is the plan. 3 Ending & check: the length (at most 7:00), how it ends, '
      + 'and a check of everything (advice, such as the laptop board or no backup yet, is marked i '
      + 'and never stops it saying ready; a fix made elsewhere has a button that goes there). '
      + 'In a scene, its name, time, loops and Energy (Off, Calm, Steady, Lively, Driving, Big) '
      + 'show at once; the sound world, the band, the chords, Extra notes, Sounds change, the '
      + 'speed and New ideas are under More for this scene. Each step is optional. Show: the board full screen with '
      + 'the clock and Now / Next, for the performance — ▶ Start the piece, then, once the clock '
      + 'runs, Next scene ▶ (↶ Back to the scene before, for one pass) and ↘ End piece, the '
      + 'ending you chose. ■ Stop silences everything at once; while '
      + 'the piece plays, Stop needs two presses (the second within the Time to press again: 3, 4, 6 or '
      + '10 seconds, 4 until you change it, under Sound → Advanced; Exit and Set up are the same), and for its first 2 seconds Stop does '
      + 'nothing. A line under the clock says how the camera, the hat, the iPad and Ableton '
      + 'are: ✓ when fine, "!" in amber when not, and Muted or Simplified when they are on. '
      + 'Show stays open if the browser leaves full screen. While the piece plays, the audience '
      + 'screen can’t be closed from Show; elsewhere closing it takes a second press. While '
      + 'the piece plays no loop is made: stop it first.',
  },
  {
    title: 'Loops and scenes while playing',
    body: 'A loop comes in or goes out on the next pass, fading over the time set in step 1 '
      + '(More). Loops layer under the player: a loop tune keeps playing under your '
      + 'counters of the same colour; your bass, chord or drum counter takes that part '
      + 'over while it is down. Playing loops show on the board as outlined counters. '
      + 'Scenes come in at their times; they leave alone a strip the player moved on the '
      + 'iPad since the last scene. The iPad’s "Loops & scenes" page has pads for them.',
  },
  {
    title: 'The performance clock and the ending',
    body: 'Make a piece, step 3. Set the length (7:00), and the countdown shows above the '
      + 'board and big on the iPad, with cues at 1 minute, 30 and 10 seconds. Choose the '
      + 'ending in advance — Final chord, Fade out, Slow down, Thin out or Stop — how many '
      + 'passes it takes, and whether it ends by itself at the time or when End piece is pressed. '
      + '↘ End piece (laptop) or End piece (iPad, two taps) applies it; Cancel the ending brings the '
      + 'music back.',
  },
  {
    title: 'Using saved loops live',
    body: 'Give each scene a time ("at 2:30") and the clock brings it in by itself; the '
      + 'player plays over the top and can still take any part. To make a loop, press New '
      + 'loop (Make a piece → Loops): everything stops, only the counters sound, and Keep '
      + 'saves them as a loop with a name. Counters already down stay silent until they are '
      + 'lifted, or Start with these keeps them. Hear it with… lets you try the band, Extra '
      + 'notes or another loop first. Not while the piece plays: stop it first.',
  },
  {
    title: 'The iPad for a player without fine control',
    body: 'Connections tab → iPad controls. "Use the safe show layout" sets the iPad for the '
      + 'show: only the Extra notes strip, New idea and End piece, with Speed locked, so a '
      + 'stray touch cannot stop, jump or silence the piece. New players start with it. '
      + 'Otherwise, untick the strips and pads this player '
      + 'will not use: fewer things means bigger things. Lock a strip (a speed that must not '
      + 'change mid-piece) and it ignores touch. "A touch on a strip": Jumps to the finger '
      + '(where the finger lands is the value) or Follows the movement (landing changes nothing; sliding moves the '
      + 'value from where it was — for a finger that lands roughly). Learn reach makes a '
      + 'short slide the whole range. "A pad acts" when the finger lands or when it lifts '
      + '(sliding onto a pad, or off it before lifting, then does nothing). End piece, Stop the loops '
      + 'and Mute need two taps: "Time for the second tap" is 3, 6 or 10 seconds, and a second '
      + 'touch sooner than the bounce time (half a second unless changed) is ignored, so one '
      + 'shaky press only gets them ready. "Also on the Play page" puts End piece, Next scene, '
      + 'Capture, Stop the loops or loops on the page the player plays on. A loop pad works only '
      + 'while the laptop plays. A resting palm is '
      + 'ignored on every pad, and from the iPad Keep only keeps.',
  },
  {
    title: 'Simplify, and keeping time',
    body: 'Simplify (on the laptop, in Play and Show, never on the iPad) strips the sound back '
      + 'in one press: the band, Extra notes and Sounds change go, and only the first loop of '
      + 'the scene keeps playing under the player, and the line under the board names them '
      + '("Simplified: Tim and Bed"). The sound world, the speed and the clock '
      + 'carry on, and scenes still come in, with just their first loop. Back to full brings '
      + 'the scene back from the next pass; Stop ends it. ADMI also watches whether the sound '
      + 'keeps time. If the laptop is too busy and the sound falls behind, it says so on the '
      + 'laptop and pauses the extras, heaviest first (Magenta, then Extra notes, then Sounds '
      + 'change); "Switch the extras back on" undoes it. The Ready check says how the last run '
      + 'kept time. Sound → Advanced → Keeping time sets how much counts as falling behind.',
  },
  {
    title: 'Keyboard',
    body: 'Space: ▶ Play the board on the Board view, and Stop while it plays. In Show: ▶ Start the piece, also '
      + 'while the board plays; once the piece plays, Stop (press twice). Never during Set up, and '
      + 'never when a button or slider '
      + 'has focus. If a switch box sends Space, turn Space plays and stops off under Sound → Advanced. Tabs move with the arrow keys. Show fills the screen; '
      + 'Leave Show (or Esc, once out of full screen) goes back. When a button goes away, focus '
      + 'moves to what takes its place: in Show, Start the piece to the Now / Next strip (never '
      + 'onto Stop) and Stop back to Start the piece; Done and Leave back to New loop. '
      + 'Shift+S: Simplify (the player and the first loop only), and Back to full, in Play and Show '
      + 'while the board plays.',
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
