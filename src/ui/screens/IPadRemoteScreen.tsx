import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  REMOTE_CONTROLS, stripValue, STRIP_STEP, TAP_REPEAT_MS,
  type RemoteControlName, type RemoteMessage, type RemoteState, type RemoteTriggerName,
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
const PADS: { name: RemoteTriggerName; label: (s: RemoteState | null) => string; icon: string }[] = [
  { name: 'newIdea', icon: '✨', label: () => 'New idea' },
  { name: 'newSound', icon: '🎨', label: () => 'New sound' },
  { name: 'keep', icon: '📌', label: (s) => (s?.kept ? 'Kept' : 'Keep') },
  { name: 'mute', icon: '🔇', label: (s) => (s?.muted ? 'Muted' : 'Mute') },
];

/** After a finger lifts, trust the laptop's value again once it has caught up. */
const TRUST_LAPTOP_AFTER_MS = 400;
/** At most this often per strip while sliding. */
const SEND_EVERY_MS = 40;

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

  const onMessage = useCallback((msg: RemoteMessage) => {
    if (msg.type === 'state') setState(msg.state);
  }, []);
  const link = useRemoteLink('remote', code, true, onMessage);
  const connected = link.status === 'open' && link.others > 0;

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

  const fromPointer = (el: HTMLElement, clientY: number): number => {
    const box = el.getBoundingClientRect();
    return stripValue(1 - (clientY - box.top) / Math.max(1, box.height));
  };

  const stripHandlers = (name: RemoteControlName) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      touching.current.set(name, e.pointerId);
      const v = fromPointer(e.currentTarget, e.clientY);
      latest.current.set(name, v);
      setLocal((l) => ({ ...l, [name]: v }));
      send(name, v);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (touching.current.get(name) !== e.pointerId) return;
      const v = fromPointer(e.currentTarget, e.clientY);
      latest.current.set(name, v);
      setLocal((l) => (l[name] === v ? l : { ...l, [name]: v }));
      send(name, v);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (touching.current.get(name) !== e.pointerId) return;
      touching.current.delete(name);
      releasedAt.current.set(name, performance.now());
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
      if (!dir) return;
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
    position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 12,
    background: '#14171f', color: '#eef1f7', fontFamily: 'system-ui, -apple-system, sans-serif',
    touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={page}>
      <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20 }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: connected ? '#66bb6a' : '#ef5350' }} aria-hidden="true" />
        <span style={{ fontWeight: 700 }}>
          {connected
            ? (state?.playing ? 'Connected · playing' : 'Connected · press Play on the laptop')
            : link.status === 'open' ? 'Waiting for the laptop…' : 'Connecting…'}
        </span>
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 16 }}>{`Code ${code}`}</span>
      </div>

      <div style={{ flex: '1 1 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, minHeight: 0, opacity: connected ? 1 : 0.4 }}>
        {REMOTE_CONTROLS.map((name) => {
          const v = valueOf(name);
          return (
            <div
              key={name}
              role="slider"
              tabIndex={0}
              aria-label={STRIP_NAMES[name]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(v * 100)}
              aria-valuetext={state?.labels[name] ?? `${Math.round(v * 100)}%`}
              {...stripHandlers(name)}
              style={{
                position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#232836',
                border: `3px solid ${touching.current.has(name) ? '#ffffff' : '#3a4152'}`, touchAction: 'none',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, height: `${v * 100}%`,
                  background: STRIP_COLOURS[name], opacity: 0.85, transition: 'height 60ms linear',
                }}
              />
              <div style={{ position: 'absolute', top: 12, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{STRIP_NAMES[name]}</div>
                <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4, textShadow: '0 1px 3px #000' }}>
                  {state?.labels[name] ?? `${Math.round(v * 100)}%`}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: '24%', minHeight: 110, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, opacity: connected ? 1 : 0.4 }}>
        {PADS.map((p) => {
          const on = (p.name === 'keep' && state?.kept) || (p.name === 'mute' && state?.muted);
          return (
            <button
              key={p.name}
              type="button"
              aria-pressed={p.name === 'keep' || p.name === 'mute' ? !!on : undefined}
              onPointerDown={(e) => { e.preventDefault(); tap(p.name); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(p.name); } }}
              style={{
                borderRadius: 20, border: `3px solid ${flash === p.name ? '#ffffff' : on ? '#ffd54f' : '#3a4152'}`,
                background: flash === p.name ? '#3f4a63' : on ? '#4a3f1f' : '#232836', color: '#eef1f7',
                fontSize: 24, fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 6, touchAction: 'none',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 36 }}>{p.icon}</span>
              {p.label(state)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
