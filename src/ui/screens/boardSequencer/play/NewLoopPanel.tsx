import { useEffect, useId, useRef } from 'react';
import { Button } from '../ui/Button';
import { focusDropped, focusWhenGone } from '../ui/focusNext';
import { quickName, type NewLoopState } from '../../../../songs/performance/newLoop';

/** The names a loop most often gets, one tap each; typing is still there. */
const QUICK_NAMES = ['Bed', 'Pulse', 'Beat', 'Shine'];

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
  onStartWithThese(): void;
  onHearWith(what: Partial<NewLoopState['with']>): void;
  onKeep(): void;
  onRename(slot: number, name: string): void;
  onLeave(): void;
}

const NOTE = { fontSize: 13, color: 'var(--bs-fg2)', margin: 0 } as const;
const card = { padding: 12, borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-elev)', display: 'flex', flexDirection: 'column', gap: 8 } as const;

/**
 * Making a loop from silence: the board, nothing else sounding, until the owner asks to
 * hear it with something. Keep makes the loop and asks for its name.
 */
export function NewLoopPanel(p: NewLoopPanelProps): JSX.Element {
  const nameRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hearId = useId();
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
  const hearing = p.state.with;
  const full = p.loopNumber === null && !p.kept;
  const keepReason = full ? 'Every loop is full: clear one first' : p.countersOnBoard > 0 ? null : 'Nothing to keep yet';
  // What is true now: nothing sounds while it waits for a clear board; then the counters
  // sound, and nothing is kept until Keep (T4-10).
  const now = p.kept ? 'kept' : waiting ? 'silent' : 'not kept yet';
  return (
    <section aria-labelledby="new-loop" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 id="new-loop" ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
        {`New loop${p.loopNumber === null ? '' : ` ${p.loopNumber}`} · ${now}`}
      </h3>
      {waiting ? (
        <div style={card}>
          <p role="status" style={{ margin: 0 }}>
            {/* The board can be clear a moment before the wait ends (a camera board settles
                first): never "Lift the 0 counters". */}
            {p.countersOnBoard > 0
              ? `Lift the ${p.countersOnBoard} ${p.countersOnBoard === 1 ? 'counter' : 'counters'} to start from silence.`
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
          <p style={{ margin: 0 }}>Only the counters sound. Put them down, listen, change them.</p>
          {/* A group named by its words, so Band is heard as "Hear it with…, Band", not the Sound tab's Band. */}
          <div role="group" aria-labelledby={hearId} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span id={hearId} style={NOTE}>Hear it with…</span>
            <Button tone={hearing.band ? 'primary' : 'secondary'} aria-pressed={hearing.band} onClick={() => p.onHearWith({ band: !hearing.band })}>Band</Button>
            <Button tone={hearing.fill ? 'primary' : 'secondary'} aria-pressed={hearing.fill} onClick={() => p.onHearWith({ fill: !hearing.fill })}>Extra notes</Button>
            <select
              aria-label="Hear it with a loop"
              value={hearing.loop === null ? '' : String(hearing.loop)}
              onChange={(e) => p.onHearWith({ loop: e.target.value === '' ? null : Number(e.target.value) })}
              style={{ minHeight: 'var(--bs-target)' }}
            >
              <option value="">No other loop</option>
              {p.otherLoops.map((l) => <option key={l.slot} value={l.slot}>{l.name || `Loop ${l.slot + 1}`}</option>)}
            </select>
          </div>
          {!p.kept && <p style={NOTE}>Nothing is kept until you press Keep.</p>}
        </div>
      )}
      {p.kept ? (
        <div style={card}>
          <p role="status" style={{ margin: 0, fontWeight: 600 }}>{`Kept: Loop ${p.kept.slot + 1}`}</p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
        <Button tone="quiet" onClick={p.onLeave}>{p.kept ? 'Done' : 'Leave'}</Button>
      </div>
    </section>
  );
}
