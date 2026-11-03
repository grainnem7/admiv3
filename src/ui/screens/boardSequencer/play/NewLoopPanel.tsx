import { useEffect, useId, useRef } from 'react';
import { Button } from '../ui/Button';
import { focusDropped, focusWhenGone } from '../ui/focusNext';
import { quickName, type NewLoopState } from '../../../../songs/performance/newLoop';

/** The names a loop most often gets, one tap each; typing is still there. */
const QUICK_NAMES = ['Bed', 'Pulse', 'Beat', 'Shine'];

/**
 * The board is stopped while New loop is open: `why` is what stops it starting (the reason
 * ▶ Play would give, or a sound problem), or null when ▶ Play would start it; `canPlay` is
 * false when ▶ Play can't (no board found, no camera, no colour with a job).
 */
export interface NewLoopStopped { why: string | null; canPlay: boolean }

const STOPPED_LINE = 'Stopped. Press ▶ Play the board to hear the counters.';
const LEAVE_LINE = 'Keep it or leave in Make a piece, Loops.';

/**
 * The line under the board while New loop is open: never "only the counters sound" while
 * nothing sounds at all (R2-T1-01).
 */
export function newLoopStatusLine(stopped: NewLoopStopped | null): string {
  return stopped === null
    ? `Making a new loop: only the counters sound. ${LEAVE_LINE}`
    : `Making a new loop. ${stopped.why ?? STOPPED_LINE} ${LEAVE_LINE}`;
}

/**
 * What to lift before a new loop starts from silence. On the laptop board, Clear the board
 * (beside it) does it in one press, so it is named (B22).
 */
export function liftLine(count: number, laptop: boolean): string {
  const counters = `${count} ${count === 1 ? 'counter' : 'counters'}`;
  return laptop ? `Lift the ${counters}, or press Clear the board.` : `Lift the ${counters} to start from silence.`;
}

export interface NewLoopPanelProps {
  state: NewLoopState;
  /** Which loop this will be (counting from 1), for the header; null when every loop is full. */
  loopNumber: number | null;
  /** The counters on the board that would sound (control counters are not counted). */
  countersOnBoard: number;
  /** Set once Keep has made the loop: its slot and name so far. */
  kept: { slot: number; name: string } | null;
  /** The kept loops that can be heard alongside this one. */
  otherLoops: { slot: number; name: string }[];
  /** The names the other loops already have, so a quick name never makes a second "Bed". */
  takenNames: string[];
  /** The laptop board: Clear the board is there to press. */
  laptop?: boolean;
  /** Set while the board is stopped (not while it plays or is starting). */
  stopped: NewLoopStopped | null;
  /** ▶ Play, from inside the panel: plain play, as the transport's. */
  onPlay(): void;
  onStartWithThese(): void;
  /** Counters were down when New loop opened: keep them as the loop now (the main choice). */
  onKeepBoard(): void;
  /** Counters were down when New loop opened: lift them and start from silence. */
  onStartFromEmpty(): void;
  onHearWith(what: Partial<NewLoopState['with']>): void;
  onKeep(): void;
  onRename(slot: number, name: string): void;
  onLeave(): void;
}

const NOTE = { fontSize: 14, color: 'var(--bs-fg2)', margin: 0 } as const;
/** A step of New loop (L4): a hairline above it, never a card. */
const card = { padding: '10px 0 4px', borderTop: '1px solid var(--bs-border)', display: 'flex', flexDirection: 'column', gap: 8 } as const;

/**
 * Making a loop from silence: the board, nothing else sounding, until the owner asks to
 * hear it with something. Keep makes the loop and asks for its name.
 */
export function NewLoopPanel(p: NewLoopPanelProps): JSX.Element {
  const nameRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hearId = useId();
  const stoppedId = useId();
  // Opening it takes New loop away: focus goes to the heading, never to the page (T1-04,
  // T4-09). Only when focus has fallen to the page: shown again by going back to step 1,
  // focus stays on the step's button.
  useEffect(() => { if (focusDropped()) headingRef.current?.focus(); }, []);
  // Next comes the name: focus goes there once, when a loop is kept. Keyed on the slot, not
  // on `kept` (a new object every render): following every render pulled focus back to
  // this box while the board played, so Done could never be reached and typing in another
  // loop's name went into this one (T4-03).
  const keptSlot = p.kept?.slot ?? null;
  useEffect(() => { if (keptSlot !== null) nameRef.current?.focus(); }, [keptSlot]);

  const waiting = p.state.phase === 'waitEmpty';
  // Counters were down when it opened: the owner chooses first (a choice every time).
  const choosing = waiting && p.state.choosing && p.countersOnBoard > 0;
  const hearing = p.state.with;
  const full = p.loopNumber === null && !p.kept;
  const keepReason = full ? 'Every loop is full: clear one first' : p.countersOnBoard > 0 ? null : 'Nothing to keep yet';
  // What is true now: nothing sounds while it waits for a clear board; then the counters
  // sound, and nothing is kept until Keep (T4-10).
  const now = p.kept ? 'kept' : waiting ? 'silent' : 'not kept yet';
  return (
    <section aria-labelledby="new-loop" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 id="new-loop" ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
        {`New loop${p.loopNumber === null ? '' : ` ${p.loopNumber}`} · ${now}`}
      </h2>
      {p.stopped && (
        // Stopped (Stop pressed, or the board couldn't start): say so, and ▶ Play is right
        // here. Finding ▶ Play took 39 key presses (R2-T1-01).
        <div style={card}>
          <p id={stoppedId} role="status" style={{ margin: 0, fontWeight: 600 }}>{p.stopped.why ?? STOPPED_LINE}</p>
          <div>
            <Button
              tone="primary" disabled={!p.stopped.canPlay} aria-describedby={p.stopped.canPlay ? undefined : stoppedId}
              // The button goes once the board plays: focus goes to the heading.
              onClick={(e) => { p.onPlay(); void focusWhenGone(() => headingRef.current, e.currentTarget); }}
            >
              ▶ Play the board
            </Button>
          </div>
        </div>
      )}
      {choosing ? (
        <div style={card}>
          <p role="status" style={{ margin: 0 }}>
            {`${p.countersOnBoard} ${p.countersOnBoard === 1 ? 'counter is' : 'counters are'} on the board.`}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              tone="primary"
              reason={full ? 'Every loop is full: clear one first' : null}
              // The choice goes once the loop is kept: focus then goes to its name (below).
              onClick={p.onKeepBoard}
            >
              Keep what&apos;s on the board
            </Button>
            <Button
              tone="secondary"
              // The choice goes: focus goes to the heading, which says it is waiting.
              onClick={(e) => { p.onStartFromEmpty(); void focusWhenGone(() => headingRef.current, e.currentTarget); }}
            >
              Start from empty
            </Button>
          </div>
          <p style={NOTE}>Start from empty: lift them, and only what you put down next is heard.</p>
        </div>
      ) : waiting ? (
        <div style={card}>
          <p role="status" style={{ margin: 0 }}>
            {/* The board can be clear a moment before the wait ends (a camera board settles
                first): never "Lift the 0 counters". */}
            {p.countersOnBoard > 0
              ? liftLine(p.countersOnBoard, p.laptop === true)
              : 'Ready: the board is clear.'}
          </p>
          <p style={NOTE}>Nothing sounds until the board is empty. Or keep what is down and start with it:</p>
          <div>
            <Button
              tone="secondary"
              // The button goes once composing starts: focus goes to the heading, which says so.
              onClick={(e) => { p.onStartWithThese(); void focusWhenGone(() => headingRef.current, e.currentTarget); }}
            >
              Start with these
            </Button>
          </div>
        </div>
      ) : (
        <div style={card}>
          {!p.stopped && <p style={{ margin: 0 }}>Only the counters sound. Put them down, listen, change them.</p>}
          {/* A group named by its words, so Band is heard as "Hear it with…, Band", not the Sound tab's Band. */}
          <div role="group" aria-labelledby={hearId} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span id={hearId} style={NOTE}>Hear it with…</span>
            {/* Words, the ones on underlined (item 9): as every other choice. */}
            <Button tone={hearing.band ? 'selected' : 'quiet'} aria-pressed={hearing.band} onClick={() => p.onHearWith({ band: !hearing.band })}>The band</Button>
            <Button tone={hearing.fill ? 'selected' : 'quiet'} aria-pressed={hearing.fill} onClick={() => p.onHearWith({ fill: !hearing.fill })}>Extra notes</Button>
            <select
              aria-label="Hear it with a loop"
              value={hearing.loop === null ? '' : String(hearing.loop)}
              onChange={(e) => p.onHearWith({ loop: e.target.value === '' ? null : Number(e.target.value) })}
              style={{ minHeight: 'var(--bs-target)' }}
            >
              <option value="">On its own</option>
              {p.otherLoops.map((l) => <option key={l.slot} value={l.slot}>{l.name || `Loop ${l.slot + 1}`}</option>)}
            </select>
          </div>
          {!p.kept && <p style={NOTE}>Nothing is kept until you press Keep.</p>}
        </div>
      )}
      {p.kept ? (
        <div style={card}>
          <p role="status" style={{ margin: 0, fontWeight: 600 }}>{`Kept: Loop ${p.kept.slot + 1}`}</p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            Name
            <input
              ref={nameRef} type="text" aria-label="Name of the new loop" value={p.kept.name}
              onChange={(e) => p.onRename(p.kept?.slot ?? 0, e.target.value)}
              style={{ minHeight: 'var(--bs-target)', maxWidth: 240 }}
            />
          </label>
          <div role="group" aria-label="Name this loop" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {QUICK_NAMES.map((n) => quickName(n, p.takenNames)).map((n) => (
              <Button key={n} tone="secondary" onClick={() => p.onRename(p.kept?.slot ?? 0, n)}>{n}</Button>
            ))}
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!waiting && !p.kept && (
          <Button tone="primary" onClick={p.onKeep} reason={keepReason}>Keep</Button>
        )}
        {/* A real button, with an edge: as a quiet one it read as a word (U1). */}
        <Button tone="secondary" onClick={p.onLeave}>{p.kept ? 'Done' : 'Leave'}</Button>
      </div>
    </section>
  );
}
