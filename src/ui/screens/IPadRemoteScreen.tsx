import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  FULL_REACH, mapReach, REMOTE_CONTROLS, stripValue, STRIP_STEP, TAP_REPEAT_MS, unmapReach,
  type RemoteControlName, type RemoteLoopState, type RemoteMessage, type RemoteState, type RemoteTriggerName,
} from '../../remote/protocol';
import { useRemoteLink } from '../../remote/useRemoteLink';

/**
 * The iPad remote (opened as `/?remote=1234` in Safari on the iPad).
 *
 * Four tall strips — slide anywhere along one to set it, as in ThumbJam — and four big pads
 * that act on touch. Made for imprecise fingers: the whole strip is the target, its ends
 * are "all the way" zones, values move in steps, and a pad ignores repeat taps for a
 * moment. Nothing needs holding.
 */

const STRIP_NAMES: Record<RemoteControlName, string> = {
  tempo: 'Speed', dynamics: 'Dynamics', fill: 'Fill', evolve: 'Evolve',
};
const STRIP_COLOURS: Record<RemoteControlName, string> = {
  tempo: '#4fc3f7', dynamics: '#ffb74d', fill: '#81c784', evolve: '#ce93d8',
};
const PADS: { name: Exclude<RemoteTriggerName, 'stopAll'>; label: (s: RemoteState | null) => string; icon: string }[] = [
  { name: 'newIdea', icon: '✨', label: () => 'New idea' },
  { name: 'newSound', icon: '🎨', label: () => 'New sound' },
  { name: 'keep', icon: '📌', label: (s) => (s?.kept ? 'Kept' : 'Keep') },
  { name: 'mute', icon: '🔇', label: (s) => (s?.muted ? 'Muted' : 'Mute') },
];

/** After a finger lifts, trust the laptop's value again once it has caught up. */
const TRUST_LAPTOP_AFTER_MS = 400;
/** At most this often per strip while sliding. */
const SEND_EVERY_MS = 40;
/** A touch wider than this is a palm or a forearm resting on the glass, not a finger. */
const PALM_PX = 60;
/** Stop all takes two taps within this long: one brush must not end the piece. */
const CONFIRM_MS = 3000;
/** Room between targets, so a finger that strays does not land on the neighbour. */
const GAP = 18;

export default function IPadRemoteScreen({ code }: { code: string }): JSX.Element {
  const [state, setState] = useState<RemoteState | null>(null);
  // What each strip shows: the finger's value while touching, otherwise the laptop's.
  const [local, setLocal] = useState<Partial<Record<RemoteControlName, number>>>({});
  const touching = useRef(new Map<RemoteControlName, number>()); // control → pointerId
  const releasedAt = useRef(new Map<RemoteControlName, number>());
  const lastSent = useRef(new Map<RemoteControlName, { value: number; at: number }>());
  const lastTap = useRef(new Map<RemoteTriggerName, number>());
  /** The finger's latest value per strip, read when it lifts (state may lag a move behind). */
  const latest = useRef(new Map<RemoteControlName, number>());
  const [flash, setFlash] = useState<RemoteTriggerName | null>(null);
  // Two pages: the strips and pads, and the loops and scenes prepared for the performance.
  const [tab, setTab] = useState<'play' | 'loops'>('play');
  const lastPad = useRef(new Map<string, number>());
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const clock = state?.clock ?? null;
  // Follow mode: where the finger landed and what the value was, so sliding moves it from there.
  const followStart = useRef(new Map<RemoteControlName, { fraction: number; value: number }>());
  /** A loop or scene pad: acts on touch, repeat taps ignored for a moment. */
  const padTap = (key: string, msg: RemoteMessage): void => {
    const now = performance.now();
    if (now - (lastPad.current.get(key) ?? -Infinity) < TAP_REPEAT_MS) return;
    lastPad.current.set(key, now);
    link.send(msg);
  };

  const onMessage = useCallback((msg: RemoteMessage) => {
    if (msg.type === 'state') setState(msg.state);
  }, []);
  const link = useRemoteLink('remote', code, true, onMessage);
  const connected = link.status === 'open' && link.others > 0;
  // This player's reach on each strip (from the laptop); while learning, strips only report.
  const reachOf = (name: RemoteControlName) => state?.reach?.[name] ?? FULL_REACH;
  const learning = state?.learning === true;
  // What this player's iPad shows, and how its strips behave — chosen on the laptop.
  const shownStrips = state?.shown?.strips ?? REMOTE_CONTROLS;
  const shownPads = PADS.filter((p) => (state?.shown?.pads ?? PADS.map((x) => x.name)).includes(p.name));
  const loopsPage = state?.shown?.loopsPage !== false;
  const locked = (name: RemoteControlName): boolean => state?.locked?.includes(name) === true;
  const follow = state?.stripMode === 'follow';
  const big = shownStrips.length <= 2;

  // Keep the page still: no scroll, no zoom, no text selection, on the whole document.
  useEffect(() => {
    const prev = document.body.style.cssText;
    document.body.style.cssText = 'margin:0;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;background:#14171f;';
    const stop = (e: Event): void => e.preventDefault();
    document.addEventListener('gesturestart', stop);
    return () => {
      document.body.style.cssText = prev;
      document.removeEventListener('gesturestart', stop);
    };
  }, []);

  const valueOf = (name: RemoteControlName): number => {
    const mine = local[name];
    const recently = performance.now() - (releasedAt.current.get(name) ?? -Infinity) < TRUST_LAPTOP_AFTER_MS;
    if (mine !== undefined && (touching.current.has(name) || recently)) return mine;
    return state?.values[name] ?? mine ?? 0;
  };

  const send = (name: RemoteControlName, value: number, force = false): void => {
    const now = performance.now();
    const last = lastSent.current.get(name);
    if (!force && last && (last.value === value || now - last.at < SEND_EVERY_MS)) return;
    lastSent.current.set(name, { value, at: now });
    link.send({ type: 'control', name, value });
  };

  /** The finger's place on the strip, 0 at the bottom, before any mapping. */
  const fractionAt = (el: HTMLElement, clientY: number): number => {
    const box = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, 1 - (clientY - box.top) / Math.max(1, box.height)));
  };
  const fromPointer = (el: HTMLElement, clientY: number, name: RemoteControlName): number =>
    stripValue(mapReach(fractionAt(el, clientY), reachOf(name)));

  const stripHandlers = (name: RemoteControlName) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (locked(name)) return;
      if (e.pointerType === 'touch' && e.width > PALM_PX) return; // a palm, not a finger
      e.currentTarget.setPointerCapture(e.pointerId);
      touching.current.set(name, e.pointerId);
      if (learning) { link.send({ type: 'reach', name, fraction: fractionAt(e.currentTarget, e.clientY) }); return; }
      if (follow) {
        // Landing changes nothing: the value moves only when the finger does.
        followStart.current.set(name, { fraction: fractionAt(e.currentTarget, e.clientY), value: valueOf(name) });
        return;
      }
      const v = fromPointer(e.currentTarget, e.clientY, name);
      latest.current.set(name, v);
      setLocal((l) => ({ ...l, [name]: v }));
      send(name, v);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (touching.current.get(name) !== e.pointerId) return;
      if (learning) { link.send({ type: 'reach', name, fraction: fractionAt(e.currentTarget, e.clientY) }); return; }
      let v: number;
      if (follow) {
        const start = followStart.current.get(name);
        if (!start) return;
        // The player's reach is the whole range, so a short slide for a short reach.
        const reach = reachOf(name);
        const delta = (fractionAt(e.currentTarget, e.clientY) - start.fraction) / Math.max(0.2, reach.high - reach.low);
        v = stripValue(Math.max(0, Math.min(1, start.value + delta)));
      } else {
        v = fromPointer(e.currentTarget, e.clientY, name);
      }
      latest.current.set(name, v);
      setLocal((l) => (l[name] === v ? l : { ...l, [name]: v }));
      send(name, v);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (touching.current.get(name) !== e.pointerId) return;
      touching.current.delete(name);
      followStart.current.delete(name);
      releasedAt.current.set(name, performance.now());
      if (learning) return;
      const v = latest.current.get(name);
      if (v !== undefined) send(name, v, true); // the final value always arrives
    },
    onPointerCancel: () => {
      touching.current.delete(name);
      releasedAt.current.set(name, performance.now());
    },
    // Keyboard and switch access: arrows step the value.
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir || locked(name)) return;
      e.preventDefault();
      const v = Math.max(0, Math.min(1, Math.round((valueOf(name) + dir * STRIP_STEP) / STRIP_STEP) * STRIP_STEP));
      setLocal((l) => ({ ...l, [name]: v }));
      releasedAt.current.set(name, performance.now());
      send(name, v, true);
    },
  });

  const tap = (name: RemoteTriggerName): void => {
    const now = performance.now();
    if (now - (lastTap.current.get(name) ?? -Infinity) < TAP_REPEAT_MS) return;
    lastTap.current.set(name, now);
    link.send({ type: 'trigger', name });
    setFlash(name);
    setTimeout(() => setFlash((f) => (f === name ? null : f)), 300);
  };

  const page: CSSProperties = {
    position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', gap: GAP, padding: `14px 18px 28px`,
    background: '#14171f', color: '#eef1f7', fontFamily: 'system-ui, -apple-system, sans-serif',
    touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={page}>
      <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20 }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: connected ? '#66bb6a' : '#ef5350' }} aria-hidden="true" />
        <span style={{ fontWeight: 700 }}>
          {learning
            ? 'Learning your reach: slide each strip as far as is comfortable'
            : connected
              ? (state?.playing ? 'Connected · playing' : 'Connected · press Play on the laptop')
              : link.status === 'open' ? 'Waiting for the laptop…' : 'Connecting…'}
        </span>
        {clock && clock.phase !== 'idle' && (
          <span
            role="timer"
            aria-label={`${clock.text} left`}
            style={{
              marginLeft: 'auto', padding: '4px 16px', borderRadius: 14, fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              background: clock.phase === 'running' ? '#232836' : clock.phase === 'lastMinute' ? '#8a6d1a' : '#8a2a2a',
              border: `3px solid ${clock.phase === 'running' ? '#3a4152' : clock.phase === 'lastMinute' ? '#ffd54f' : '#ef5350'}`,
            }}
          >
            {clock.phase === 'ending' ? `ending ${clock.text}` : clock.phase === 'over' ? `over ${clock.text}` : `⏱ ${clock.text}`}
          </span>
        )}
        <span style={{ marginLeft: clock && clock.phase !== 'idle' ? 12 : 'auto', opacity: 0.6, fontSize: 16 }}>{`Code ${code}`}</span>
      </div>

      {loopsPage && (
      <div role="tablist" aria-label="Page" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP }}>
        {(['play', 'loops'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={tab === p}
            onPointerDown={(e) => { e.preventDefault(); setTab(p); }}
            style={{
              minHeight: 56, borderRadius: 16, fontSize: 22, fontWeight: 800, color: '#eef1f7',
              border: `3px solid ${tab === p ? '#ffffff' : '#3a4152'}`, background: tab === p ? '#3f4a63' : '#232836', touchAction: 'none',
            }}
          >
            {p === 'play' ? 'Play' : 'Loops & scenes'}
          </button>
        ))}
      </div>
      )}

      {tab === 'loops' && loopsPage && (
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, opacity: connected ? 1 : 0.4 }}>
          <div style={{ flex: '3 1 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: GAP, minHeight: 0 }}>
            {Array.from({ length: 8 }, (_, i) => {
              const l = state?.loops?.[i] ?? { name: '', state: 'empty' as RemoteLoopState };
              const on = l.state === 'playing' || l.state === 'starting';
              const label = l.name || `Loop ${i + 1}`;
              return (
                <button
                  key={`loop-${i}`}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${label}: ${l.state}`}
                  disabled={l.state === 'empty'}
                  onPointerDown={(e) => { e.preventDefault(); if (l.state !== 'empty') padTap(`loop${i}`, { type: 'loop', index: i }); }}
                  style={{
                    borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 22, fontWeight: 800,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    border: `4px ${l.state === 'starting' || l.state === 'stopping' ? 'dashed' : 'solid'} ${on ? '#81c784' : l.state === 'stopping' ? '#ffb74d' : '#3a4152'}`,
                    background: l.state === 'playing' ? '#2e5a37' : l.state === 'starting' ? '#2b4a33' : '#232836',
                    opacity: l.state === 'empty' ? 0.35 : 1,
                  }}
                >
                  <span>{label}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, opacity: 0.8 }}>
                    {l.state === 'empty' ? 'empty' : l.state === 'playing' ? '▶ playing' : l.state === 'starting' ? (state?.loopsFade ? 'fading in…' : 'starting…') : l.state === 'stopping' ? (state?.loopsFade ? 'fading out…' : 'stopping…') : 'tap to play'}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ flex: '2 1 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: GAP, minHeight: 0 }}>
            {Array.from({ length: 4 }, (_, i) => {
              const sc = state?.scenes?.[i];
              return (
                <button
                  key={`scene-${i}`}
                  type="button"
                  aria-pressed={sc?.active === true}
                  disabled={!sc}
                  onPointerDown={(e) => { e.preventDefault(); if (sc) padTap(`scene${i}`, { type: 'scene', index: i }); }}
                  style={{
                    borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 20, fontWeight: 800,
                    border: `4px solid ${sc?.active ? '#ce93d8' : '#3a4152'}`, background: sc?.active ? '#4a2f55' : '#232836',
                    opacity: sc ? 1 : 0.35,
                  }}
                >
                  {sc ? `Scene ${i + 1}: ${sc.name}` : `Scene ${i + 1}`}
                </button>
              );
            })}
          </div>
          <div style={{ height: '18%', minHeight: 90, display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr 1fr', gap: GAP }}>
            <button
              type="button"
              aria-label="Capture: save what is on the board as a loop and start it"
              onPointerDown={(e) => { e.preventDefault(); if (e.pointerType === 'touch' && e.width > PALM_PX) return; padTap('capture', { type: 'trigger', name: 'capture' }); }}
              style={{ borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 22, fontWeight: 800, border: '4px solid #4fc3f7', background: '#1f3a4a' }}
            >
              ⏺ Capture
            </button>
            <button
              type="button"
              disabled={!state?.scenes || state.scenes.length === 0}
              onPointerDown={(e) => { e.preventDefault(); padTap('next', { type: 'scene', index: 'next' }); }}
              style={{ borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 26, fontWeight: 800, border: '4px solid #ce93d8', background: '#232836', opacity: state?.scenes?.length ? 1 : 0.35 }}
            >
              Next scene ▶
            </button>
            <button
              type="button"
              aria-label={confirmEnd ? 'Tap again to end the piece' : 'End the piece'}
              onPointerDown={(e) => {
                e.preventDefault();
                if (e.pointerType === 'touch' && e.width > PALM_PX) return;
                if (!confirmEnd) {
                  setConfirmEnd(true);
                  setTimeout(() => setConfirmEnd(false), CONFIRM_MS);
                  return;
                }
                setConfirmEnd(false);
                padTap('endPiece', { type: 'trigger', name: 'endPiece' });
              }}
              style={{
                borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: confirmEnd ? 18 : 22, fontWeight: 800,
                border: `4px solid ${confirmEnd ? '#ffffff' : '#ce93d8'}`, background: confirmEnd ? '#6a3a7a' : '#2d2033',
              }}
            >
              {confirmEnd ? 'Tap again to end' : '⏹ End piece'}
            </button>
            <button
              type="button"
              aria-label={confirmStop ? 'Tap again to stop all loops' : 'Stop all loops'}
              onPointerDown={(e) => {
                e.preventDefault();
                if (e.pointerType === 'touch' && e.width > PALM_PX) return;
                // Two taps: a brush against the pad must not end the piece.
                if (!confirmStop) {
                  setConfirmStop(true);
                  setTimeout(() => setConfirmStop(false), CONFIRM_MS);
                  return;
                }
                setConfirmStop(false);
                padTap('stopAll', { type: 'trigger', name: 'stopAll' });
              }}
              style={{
                borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: confirmStop ? 20 : 24, fontWeight: 800,
                border: `4px solid ${confirmStop ? '#ffffff' : '#ef5350'}`, background: confirmStop ? '#8a2a2a' : '#4a2323',
              }}
            >
              {confirmStop ? 'Tap again to stop all' : '■ Stop all'}
            </button>
          </div>
        </div>
      )}

      {(tab === 'play' || !loopsPage) && (<>

      {shownStrips.length > 0 && (
      <div style={{ flex: '1 1 0', display: 'grid', gridTemplateColumns: `repeat(${shownStrips.length}, 1fr)`, gap: GAP, minHeight: 0, opacity: connected ? 1 : 0.4 }}>
        {shownStrips.map((name) => {
          const v = valueOf(name);
          const isLocked = locked(name);
          return (
            <div
              key={name}
              role="slider"
              tabIndex={isLocked ? -1 : 0}
              aria-disabled={isLocked || undefined}
              aria-label={`${STRIP_NAMES[name]}${isLocked ? ', locked' : ''}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(v * 100)}
              aria-valuetext={state?.labels[name] ?? `${Math.round(v * 100)}%`}
              {...stripHandlers(name)}
              style={{
                position: 'relative', borderRadius: 24, overflow: 'hidden', background: '#232836',
                border: `3px solid ${touching.current.has(name) ? '#ffffff' : '#3a4152'}`, touchAction: 'none',
                opacity: isLocked ? 0.45 : 1,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, height: `${unmapReach(v, reachOf(name)) * 100}%`,
                  background: STRIP_COLOURS[name], opacity: 0.85, transition: 'height 60ms linear',
                }}
              />
              <div style={{ position: 'absolute', top: 12, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: big ? 34 : 26, fontWeight: 800 }}>{`${isLocked ? '🔒 ' : ''}${STRIP_NAMES[name]}`}</div>
                <div style={{ fontSize: big ? 26 : 20, fontWeight: 600, marginTop: 4, textShadow: '0 1px 3px #000' }}>
                  {state?.labels[name] ?? `${Math.round(v * 100)}%`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {shownPads.length > 0 && (
      <div style={{ height: shownStrips.length === 0 ? '100%' : '22%', minHeight: 100, display: 'grid', gridTemplateColumns: `repeat(${shownPads.length}, 1fr)`, gap: GAP, opacity: connected && !learning ? 1 : 0.4 }}>
        {shownPads.map((p) => {
          const on = (p.name === 'keep' && state?.kept) || (p.name === 'mute' && state?.muted);
          return (
            <button
              key={p.name}
              type="button"
              aria-pressed={p.name === 'keep' || p.name === 'mute' ? !!on : undefined}
              onPointerDown={(e) => { e.preventDefault(); if (e.pointerType === 'touch' && e.width > PALM_PX) return; if (!learning) tap(p.name); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(p.name); } }}
              style={{
                borderRadius: 20, border: `3px solid ${flash === p.name ? '#ffffff' : on ? '#ffd54f' : '#3a4152'}`,
                background: flash === p.name ? '#3f4a63' : on ? '#4a3f1f' : '#232836', color: '#eef1f7',
                fontSize: 24, fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 6, touchAction: 'none',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: shownStrips.length === 0 ? 56 : 36 }}>{p.icon}</span>
              {p.label(state)}
            </button>
          );
        })}
      </div>
      )}
      </>)}
    </div>
  );
}
