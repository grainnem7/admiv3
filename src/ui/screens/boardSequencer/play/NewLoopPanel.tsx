import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import type { NewLoopState } from '../../../../songs/performance/newLoop';

/** The names a loop most often gets, one tap each; typing is still there. */
const QUICK_NAMES = ['Bed', 'Pulse', 'Beat', 'Shine'];

export interface NewLoopPanelProps {
  state: NewLoopState;
  /** Which loop this will be (counting from 1), for the header. */
  loopNumber: number;
  countersOnBoard: number;
  /** Set once Keep has made the loop: its slot and name so far. */
  kept: { slot: number; name: string } | null;
  /** The kept loops that can be heard alongside this one. */
  otherLoops: { slot: number; name: string }[];
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
  // Next comes the name: focus goes there, so the owner can type or tap a quick name.
  useEffect(() => { if (p.kept) nameRef.current?.focus(); }, [p.kept]);

  const waiting = p.state.phase === 'waitEmpty';
  const hearing = p.state.with;
  return (
    <section aria-labelledby="new-loop" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 id="new-loop" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{`New loop ${p.loopNumber} · silent`}</h3>
      {waiting ? (
        <div style={card}>
          <p role="status" style={{ margin: 0 }}>
            {`Lift the ${p.countersOnBoard} ${p.countersOnBoard === 1 ? 'counter' : 'counters'} to start from silence.`}
          </p>
          <p style={NOTE}>Nothing sounds until the board is empty. Or keep what is down and start with it:</p>
          <div><Button tone="secondary" onClick={p.onStartWithThese}>Start with these</Button></div>
        </div>
      ) : (
        <div style={card}>
          <p style={{ margin: 0 }}>Only the counters sound. Put them down, listen, change them.</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={NOTE}>Hear it with…</span>
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
          <p style={NOTE}>Nothing is kept until you press Keep.</p>
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
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {QUICK_NAMES.map((n) => <Button key={n} tone="secondary" onClick={() => p.onRename(p.kept?.slot ?? 0, n)}>{n}</Button>)}
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!waiting && !p.kept && (
          <Button tone="primary" onClick={p.onKeep} reason={p.countersOnBoard > 0 ? null : 'Nothing to keep yet'}>Keep</Button>
        )}
        <Button tone="quiet" onClick={p.onLeave}>{p.kept ? 'Done' : 'Leave'}</Button>
      </div>
    </section>
  );
}
