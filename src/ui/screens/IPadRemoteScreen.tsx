import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  DEFAULT_REMOTE_TOUCH, FULL_REACH, mapReach, REMOTE_CONTROLS, secondTap, stripValue, STRIP_STEP, TAP_REPEAT_MS, unmapReach,
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
  // The laptop's words, so the iPad, the laptop and Help say the same thing.
  tempo: 'Speed', dynamics: 'Dynamics', fill: 'Extra notes', evolve: 'Sounds change',
};
const STRIP_COLOURS: Record<RemoteControlName, string> = {
  tempo: '#4fc3f7', dynamics: '#ffb74d', fill: '#81c784', evolve: '#ce93d8',
};
const PADS: { name: Exclude<RemoteTriggerName, 'stopAll'>; label: (s: RemoteState | null) => string; icon: string }[] = [
  { name: 'newIdea', icon: '✨', label: () => 'New idea' },
  { name: 'newSound', icon: '🎨', label: () => 'New sound' },
  { name: 'keep', icon: '📌', label: (s) => (s?.kept ? 'Kept ✓' : 'Keep') },
  { name: 'mute', icon: '🔇', label: (s) => (s?.muted ? 'Muted' : 'Mute') },
];

/** After a finger lifts, trust the laptop's value again once it has caught up. */
const TRUST_LAPTOP_AFTER_MS = 400;
/** At most this often per strip while sliding. */
const SEND_EVERY_MS = 40;
/**
 * A touch this wide AND this tall is a palm or a forearm resting on the glass, not a
 * finger. Generous on purpose: an iPad reports a fingertip at anything up to ~80 px, and
 * a tap that is thrown away is far worse than a palm that is not.
 */
const PALM_PX = 160;
const isPalm = (e: React.PointerEvent<Element>): boolean => e.pointerType === 'touch' && e.width > PALM_PX && e.height > PALM_PX;
/** How long the "touch seen" mark stays in the status row. */
const TOUCH_MARK_MS = 700;
/** The second tap of End piece, Stop all and Mute is waited for this long, unless the laptop says otherwise (per player). */
const DEFAULT_CONFIRM_MS = 6000;
/** The pads that need a second tap: each one ends, stops or silences the show. */
type TwoTapName = 'endPiece' | 'stopAll' | 'mute';
/** How long "Press Play on the laptop first" stays up after a refused loop tap. */
const REFUSAL_MS = 4000;
/** Whether a finger is over an element: one that lifts anywhere else has slid off it. */
const isOver = (el: Element, x: number, y: number): boolean => {
  const b = el.getBoundingClientRect();
  return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
};
/** The beat light stays on this long after each beat. */
const BEAT_FLASH_MS = 140;
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
  // Three pages: the strips and pads; just the saved loops, on and off; and the loops and
  // scenes prepared for the performance.
  const [tab, setTab] = useState<'play' | 'onoff' | 'loops'>('play');
  const lastPad = useRef(new Map<string, number>());
  // Shown for a moment whenever a touch reaches the page at all: with it, "nothing
  // happens" can be told apart from "the laptop is not connected".
  const [touchSeen, setTouchSeen] = useState(false);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markTouch = (): void => {
    setTouchSeen(true);
    if (touchTimer.current) clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(() => setTouchSeen(false), TOUCH_MARK_MS);
  };
  const clock = state?.clock ?? null;
  // Follow mode: where the finger landed and what the value was, so sliding moves it from there.
  const followStart = useRef(new Map<RemoteControlName, { fraction: number; value: number }>());
  // How pads respond for this player (set on the laptop): on touch or on lift, how long the
  // second tap of End piece, Stop all and Mute is waited for, and how soon a second touch
  // is still a bounce of the first.
  const actOn = state?.touch?.actOn ?? 'touch';
  const confirmMs = state?.touch ? state.touch.confirmSec * 1000 : DEFAULT_CONFIRM_MS;
  const secondTapMinMs = state?.touch?.secondTapMinMs ?? DEFAULT_REMOTE_TOUCH.secondTapMinMs;
  /** Pads a finger came down on, for "act on lift": the pad acts only if it lifts there. */
  const downOn = useRef(new Map<string, number>());
  /**
   * Every pad's behaviour in one place: a resting palm is ignored on all of them, it acts on
   * touch or on lift as set for the player, and Enter or Space work it from a keyboard or
   * a switch.
   */
  const padProps = (key: string, fire: () => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (isPalm(e)) return;
      if (actOn === 'touch') { fire(); return; }
      // The browser holds a touch on the pad it landed on, so the pad would never hear the
      // finger slide off it. Let go of it, so that it does.
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      } catch { /* nothing to let go of */ }
      downOn.current.set(key, e.pointerId);
    },
    // Slid off before lifting: not a press of this pad, even if the finger comes back.
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (downOn.current.get(key) === e.pointerId && !isOver(e.currentTarget, e.clientX, e.clientY)) downOn.current.delete(key);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (actOn !== 'lift' || downOn.current.get(key) !== e.pointerId) return;
      downOn.current.delete(key);
      if (!isOver(e.currentTarget, e.clientX, e.clientY)) return; // lifted away from the pad
      fire();
    },
    onPointerLeave: () => { downOn.current.delete(key); },
    onPointerCancel: () => { downOn.current.delete(key); },
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    },
  });
  // The beat, seen: a light that comes on at each beat the laptop reports.
  const [beatLit, setBeatLit] = useState(false);
  const beat = state?.beat;
  useEffect(() => {
    if (beat === undefined || !state?.playing) return;
    setBeatLit(true);
    const t = setTimeout(() => setBeatLit(false), BEAT_FLASH_MS);
    return () => clearTimeout(t);
  }, [beat, state?.playing]);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const showNext = state?.touch?.showNext !== false;
  // End piece, Stop all and Mute wait for a second tap: which are waiting, since when, and
  // the timers that stop the wait when the window runs out.
  const [armed, setArmed] = useState<ReadonlySet<TwoTapName>>(() => new Set());
  const armedAt = useRef(new Map<TwoTapName, number>());
  const armTimers = useRef(new Map<TwoTapName, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = armTimers.current;
    return () => { for (const t of timers.values()) clearTimeout(t); };
  }, []);
  const setArmedFlag = (name: TwoTapName, on: boolean): void => setArmed((was) => {
    if (was.has(name) === on) return was;
    const next = new Set(was);
    if (on) next.add(name); else next.delete(name);
    return next;
  });
  /**
   * A pad that needs two taps: the first arms it, and the second acts only if it comes at
   * least the player's bounce guard after the first and within their window. A touch
   * sooner than that is the same shaky press landing twice: it is ignored.
   */
  const twoTap = (name: TwoTapName, act: () => void): void => {
    const now = performance.now();
    const step = secondTap(armedAt.current.get(name) ?? null, now, { minMs: secondTapMinMs, windowMs: confirmMs });
    if (step === 'ignore') return;
    clearTimeout(armTimers.current.get(name));
    armTimers.current.delete(name);
    if (step === 'confirm') {
      armedAt.current.delete(name);
      setArmedFlag(name, false);
      act();
      return;
    }
    armedAt.current.set(name, now);
    setArmedFlag(name, true);
    armTimers.current.set(name, setTimeout(() => {
      armedAt.current.delete(name);
      armTimers.current.delete(name);
      setArmedFlag(name, false);
    }, confirmMs));
  };
  const confirmEnd = armed.has('endPiece');
  const confirmStop = armed.has('stopAll');
  const endTap = (): void => twoTap('endPiece', () => padTap('endPiece', { type: 'trigger', name: 'endPiece' }));
  const stopTap = (): void => twoTap('stopAll', () => padTap('stopAll', { type: 'trigger', name: 'stopAll' }));
  /** A loop or scene pad: acts on touch, repeat taps ignored for a moment. */
  const padTap = (key: string, msg: RemoteMessage): void => {
    const now = performance.now();
    if (now - (lastPad.current.get(key) ?? -Infinity) < TAP_REPEAT_MS) return;
    lastPad.current.set(key, now);
    link.send(msg);
  };
  // A loop tapped while the laptop is stopped would wait in silence and start by itself
  // with Play, so it is refused, and the iPad says why.
  const [refusal, setRefusal] = useState<string | null>(null);
  const refusalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (refusalTimer.current) clearTimeout(refusalTimer.current); }, []);
  useEffect(() => { if (state?.playing) setRefusal(null); }, [state?.playing]);
  const loopTap = (i: number): void => {
    if (!state?.playing) {
      setRefusal('Press Play on the laptop first');
      if (refusalTimer.current) clearTimeout(refusalTimer.current);
      refusalTimer.current = setTimeout(() => setRefusal(null), REFUSAL_MS);
      return;
    }
    padTap(`loop${i}`, { type: 'loop', index: i });
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
      if (isPalm(e)) return; // a palm, not a finger
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the finger is already gone */ }
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
    sendTrigger(name);
  };
  /** Send a pad's trigger and light the pad (a confirmed second tap comes straight here). */
  const sendTrigger = (name: RemoteTriggerName): void => {
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
    <div style={page} onPointerDownCapture={markTouch}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20 }}>
        <span aria-hidden="true" style={{ fontSize: 18, opacity: touchSeen ? 1 : 0.15, transition: 'opacity 150ms' }}>👆</span>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: connected ? '#66bb6a' : '#ef5350' }} aria-hidden="true" />
        {/* Only the words are announced; the clock beside them changes every second. */}
        <span role="status" aria-live="polite" style={{ fontWeight: 700 }}>
          {learning
            ? 'Learning your reach: slide each strip as far as is comfortable'
            : connected
              ? (state?.playing ? 'Connected · playing' : 'Connected · press Play on the laptop')
              : link.status === 'open' ? 'Waiting for the laptop…'
                : link.status === 'lost' ? 'Link lost — reconnecting…' : 'Connecting…'}
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
      {refusal && (
        <div
          role="alert"
          style={{
            position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 2, pointerEvents: 'none',
            padding: '12px 28px', borderRadius: 16, background: '#4a3f1f', border: '3px solid #ffd54f',
            fontSize: 28, fontWeight: 800, textAlign: 'center', boxShadow: '0 4px 18px #000a',
          }}
        >
          {refusal}
        </div>
      )}
      {connected && state?.playing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 22, minHeight: 34 }}>
          <span
            aria-hidden="true"
            style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0, background: beatLit ? '#ffd54f' : '#3a4152', boxShadow: beatLit && !reducedMotion ? '0 0 12px #ffd54f' : 'none' }}
          />
          <span style={{ fontWeight: 800 }}>{state.piece?.now ? `Now: ${state.piece.now}` : 'Playing'}</span>
          {state.piece?.next && (
            <span style={{ opacity: 0.75 }}>{`Next: ${state.piece.next}${state.piece.nextIn ? ` in ${state.piece.nextIn}` : ''}`}</span>
          )}
        </div>
      )}

      {loopsPage && (
      <div role="tablist" aria-label="Page" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: GAP }}>
        {(['play', 'onoff', 'loops'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={tab === p}
            {...padProps(`tab-${p}`, () => setTab(p))}
            style={{
              minHeight: 56, borderRadius: 16, fontSize: 22, fontWeight: 800, color: '#eef1f7',
              border: `3px solid ${tab === p ? '#ffffff' : '#3a4152'}`, background: tab === p ? '#3f4a63' : '#232836', touchAction: 'none',
            }}
          >
            {p === 'play' ? 'Play' : p === 'onoff' ? 'Loops' : 'Loops & scenes'}
          </button>
        ))}
      </div>
      )}

      {tab === 'onoff' && loopsPage && (() => {
        // Just the loops that have been saved, big: tap one to turn it on, tap again to turn
        // it off. Nothing else on the page, so nothing else can be pressed by mistake.
        const saved = (state?.loops ?? [])
          .map((l, i) => ({ ...l, i }))
          .filter((l) => l.state !== 'empty');
        if (saved.length === 0) {
          return (
            <div style={{ flex: '1 1 0', display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 24, opacity: 0.8, padding: 20 }}>
              No loops saved yet. Save some on the laptop (Make a piece → Loops) and they appear here.
            </div>
          );
        }
        const cols = saved.length <= 2 ? saved.length : saved.length <= 4 ? 2 : saved.length <= 6 ? 3 : 4;
        return (
          <div
            style={{
              flex: '1 1 0', display: 'grid', gap: GAP, minHeight: 0, opacity: connected ? 1 : 0.4,
              gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr',
            }}
          >
            {saved.map((l) => {
              const on = l.state === 'playing' || l.state === 'starting';
              const label = l.name || `Loop ${l.i + 1}`;
              const status = !state?.playing && on ? 'ON · starts with Play'
                : l.state === 'playing' ? 'ON'
                  : l.state === 'starting' ? (state?.loopsFade ? 'coming in…' : 'starting…')
                    : l.state === 'stopping' ? (state?.loopsFade ? 'fading out…' : 'stopping…')
                      : 'OFF';
              return (
                <button
                  key={`onoff-${l.i}`}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${label}: ${status}. Tap to turn ${on ? 'off' : 'on'}.`}
                  {...padProps(`onoff${l.i}`, () => loopTap(l.i))}
                  style={{
                    borderRadius: 24, touchAction: 'none', color: '#eef1f7',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                    border: `6px ${l.state === 'starting' || l.state === 'stopping' ? 'dashed' : 'solid'} ${on ? '#81c784' : l.state === 'stopping' ? '#ffb74d' : '#3a4152'}`,
                    background: on ? '#2e5a37' : '#232836',
                  }}
                >
                  <span style={{ fontSize: 30, fontWeight: 800 }}>{label}</span>
                  <span style={{ fontSize: 26, fontWeight: 800, color: on ? '#c8f0cb' : '#9aa3b5' }}>{status}</span>
                </button>
              );
            })}
          </div>
        );
      })()}

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
                  {...padProps(`loop${i}`, () => { if (l.state !== 'empty') loopTap(i); })}
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
                    {l.state === 'empty' ? 'empty' : !state?.playing && (l.state === 'playing' || l.state === 'starting') ? 'ready' : l.state === 'playing' ? '▶ playing' : l.state === 'starting' ? (state?.loopsFade ? 'fading in…' : 'starting…') : l.state === 'stopping' ? (state?.loopsFade ? 'fading out…' : 'stopping…') : 'tap to play'}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ flex: '2 1 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: GAP, minHeight: 0 }}>
            {Array.from({ length: 4 }, (_, k) => {
              // Four pads that follow the piece: the scene before the current one, the
              // current one and the next two — however many scenes there are.
              const all = state?.scenes ?? [];
              const cur = all.findIndex((x) => x.active);
              const first = Math.max(0, Math.min(all.length - 4, cur - 1));
              const i = first + k;
              const sc = all[i];
              return (
                <button
                  key={`scene-${k}`}
                  type="button"
                  aria-pressed={sc?.active === true}
                  disabled={!sc}
                  {...padProps(`scene${k}`, () => { if (sc) padTap(`scene${i}`, { type: 'scene', index: i }); })}
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
              {...padProps('capture', () => padTap('capture', { type: 'trigger', name: 'capture' }))}
              style={{ borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 22, fontWeight: 800, border: '4px solid #4fc3f7', background: '#1f3a4a' }}
            >
              ⏺ Capture
            </button>
            {showNext ? <button
              type="button"
              disabled={!state?.scenes || state.scenes.length === 0}
              {...padProps('next', () => padTap('next', { type: 'scene', index: 'next' }))}
              style={{ borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 26, fontWeight: 800, border: '4px solid #ce93d8', background: '#232836', opacity: state?.scenes?.length ? 1 : 0.35 }}
            >
              Next scene ▶
            </button> : <span />}
            <button
              type="button"
              aria-label={confirmEnd ? 'Tap again to end the piece' : 'End the piece'}
              {...padProps('endPiece', endTap)}
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
              {...padProps('stopAll', stopTap)}
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
                  background: STRIP_COLOURS[name], opacity: 0.85, transition: reducedMotion ? 'none' : 'height 60ms linear',
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
          // Mute silences the whole show, so it waits for a second tap like End piece.
          const waiting = p.name === 'mute' && armed.has('mute');
          return (
            <button
              key={p.name}
              type="button"
              aria-pressed={p.name === 'keep' || p.name === 'mute' ? !!on : undefined}
              {...padProps(`pad-${p.name}`, () => {
                if (learning || (p.name === 'keep' && state?.kept)) return;
                if (p.name === 'mute') twoTap('mute', () => sendTrigger('mute'));
                else tap(p.name);
              })}
              style={{
                borderRadius: 20, border: `3px solid ${flash === p.name || waiting ? '#ffffff' : on ? '#ffd54f' : '#3a4152'}`,
                background: waiting ? '#6a3a7a' : flash === p.name ? '#3f4a63' : on ? '#4a3f1f' : '#232836', color: '#eef1f7',
                fontSize: 24, fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 6, touchAction: 'none',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: shownStrips.length === 0 ? 56 : 36 }}>{p.icon}</span>
              {waiting ? (state?.muted ? 'Tap again to unmute' : 'Tap again to mute') : p.label(state)}
            </button>
          );
        })}
      </div>
      )}

      {/* What the facilitator added to the Play page: loops and performance pads, so the
          player never has to switch page mid-piece. */}
      {((state?.touch?.playExtras.length ?? 0) > 0 || (state?.touch?.playLoops.length ?? 0) > 0) && (
        <div style={{ height: '18%', minHeight: 90, display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: GAP, opacity: connected && !learning ? 1 : 0.4 }}>
          {(state?.touch?.playLoops ?? []).map((i) => {
            const l = state?.loops?.[i] ?? { name: '', state: 'empty' as RemoteLoopState };
            const on = l.state === 'playing' || l.state === 'starting';
            const label = l.name || `Loop ${i + 1}`;
            return (
              <button
                key={`play-loop-${i}`}
                type="button"
                aria-pressed={on}
                aria-label={`${label}: ${l.state}`}
                disabled={l.state === 'empty'}
                {...padProps(`play-loop${i}`, () => { if (l.state !== 'empty') loopTap(i); })}
                style={{
                  borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 22, fontWeight: 800,
                  border: `4px ${l.state === 'starting' || l.state === 'stopping' ? 'dashed' : 'solid'} ${on ? '#81c784' : '#3a4152'}`,
                  background: on ? '#2e5a37' : '#232836', opacity: l.state === 'empty' ? 0.35 : 1,
                }}
              >
                {label}
              </button>
            );
          })}
          {(state?.touch?.playExtras ?? []).map((x) => {
            if (x === 'nextScene') {
              return showNext ? (
                <button key="x-next" type="button" disabled={!state?.scenes?.length} {...padProps('x-next', () => padTap('next', { type: 'scene', index: 'next' }))}
                  style={{ borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 24, fontWeight: 800, border: '4px solid #ce93d8', background: '#232836' }}>
                  Next scene ▶
                </button>
              ) : null;
            }
            if (x === 'capture') {
              return (
                <button key="x-capture" type="button" aria-label="Capture: save what is on the board as a loop and start it" {...padProps('x-capture', () => padTap('capture', { type: 'trigger', name: 'capture' }))}
                  style={{ borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: 22, fontWeight: 800, border: '4px solid #4fc3f7', background: '#1f3a4a' }}>
                  ⏺ Capture
                </button>
              );
            }
            if (x === 'endPiece') {
              return (
                <button key="x-end" type="button" aria-label={confirmEnd ? 'Tap again to end the piece' : 'End the piece'} {...padProps('x-end', endTap)}
                  style={{ borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: confirmEnd ? 18 : 22, fontWeight: 800, border: `4px solid ${confirmEnd ? '#ffffff' : '#ce93d8'}`, background: confirmEnd ? '#6a3a7a' : '#2d2033' }}>
                  {confirmEnd ? 'Tap again to end' : '⏹ End piece'}
                </button>
              );
            }
            return (
              <button key="x-stop" type="button" aria-label={confirmStop ? 'Tap again to stop all loops' : 'Stop all loops'} {...padProps('x-stop', stopTap)}
                style={{ borderRadius: 20, touchAction: 'none', color: '#eef1f7', fontSize: confirmStop ? 20 : 24, fontWeight: 800, border: `4px solid ${confirmStop ? '#ffffff' : '#ef5350'}`, background: confirmStop ? '#8a2a2a' : '#4a2323' }}>
                {confirmStop ? 'Tap again to stop all' : '■ Stop all'}
              </button>
            );
          })}
        </div>
      )}
      </>)}
    </div>
  );
}
