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
      e.currentTarget.setPointerCapture(e.pointerId);
      touching.current.set(name, e.pointerId);
      if (learning) { link.send({ type: 'reach', name, fraction: fractionAt(e.currentTarget, e.clientY) }); return; }
      const v = fromPointer(e.currentTarget, e.clientY, name);
      latest.current.set(name, v);
      setLocal((l) => ({ ...l, [name]: v }));
      send(name, v);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (touching.current.get(name) !== e.pointerId) return;
      if (learning) { link.send({ type: 'reach', name, fraction: fractionAt(e.currentTarget, e.clientY) }); return; }
      const v = fromPointer(e.currentTarget, e.clientY, name);
      latest.current.set(name, v);
      setLocal((l) => (l[name] === v ? l : { ...l, [name]: v }));
      send(name, v);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (touching.current.get(name) !== e.pointerId) return;
      touching.current.delete(name);
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
          {learning
            ? 'Learning your reach: slide each strip as far as is comfortable'
            : connected
              ? (state?.playing ? 'Connected · playing' : 'Connected · press Play on the laptop')
              : link.status === 'open' ? 'Waiting for the laptop…' : 'Connecting…'}
        </span>
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 16 }}>{`Code ${code}`}</span>
      </div>

      <div role="tablist" aria-label="Page" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

      {tab === 'loops' && (
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, opacity: connected ? 1 : 0.4 }}>
          <div style={{ flex: '3 1 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 12, minHeight: 0 }}>
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
                    {l.state === 'empty' ? 'empty' : l.state === 'playing' ? '▶ playing' : l.state === 'starting' ? 'starting…' : l.state === 'stopping' ? 'stopping…' : 'tap to play'}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ flex: '2 1 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, minHeight: 0 }}>
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
          <div style={{ height: '18%', minHeight: 90, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
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
              onPointerDown={(e) => { e.preventDefault(); padTap('stopAll', { type: 'trigger', name: 'stopAll' }); }}
              style={{ borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 24, fontWeight: 800, border: '4px solid #ef5350', background: '#4a2323' }}
            >
              ■ Stop all
            </button>
          </div>
        </div>
      )}

      {tab === 'play' && (<>

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
                  position: 'absolute', left: 0, right: 0, bottom: 0, height: `${unmapReach(v, reachOf(name)) * 100}%`,
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

      <div style={{ height: '22%', minHeight: 100, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, opacity: connected && !learning ? 1 : 0.4 }}>
        {PADS.map((p) => {
          const on = (p.name === 'keep' && state?.kept) || (p.name === 'mute' && state?.muted);
          return (
            <button
              key={p.name}
              type="button"
              aria-pressed={p.name === 'keep' || p.name === 'mute' ? !!on : undefined}
              onPointerDown={(e) => { e.preventDefault(); if (!learning) tap(p.name); }}
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
      </>)}
    </div>
  );
}
