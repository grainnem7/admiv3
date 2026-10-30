/**
 * The audience screen (spec 2026-10-29): what the projector shows while Tim plays.
 *
 * A dark screen with Tim's board, big and simple: his counters in their colours and places,
 * each blooming as it sounds, with a soft light behind them that follows the red hat (side
 * to side, up and down), warms with the Brightness and pulses with the speed. The band is a
 * soft light along the bottom. The scene's name sits small in a corner. Nothing else: no
 * grid, buttons, words or cursor, and a lost connection is only the dim board.
 *
 * It draws on its own (requestAnimationFrame) from what the laptop page sends; the numbers
 * behind the picture are in light.ts. It plays nothing and changes nothing.
 */
import { useEffect, useRef, useState } from 'react';
import {
  bandBump, BLOOM_SEC, bloomAt, bloomGlowScale, boardLayout, brightenKeepingHue, canRebloom, COUNTER_RADIUS,
  DIM_PRESENCE, glideTint, INITIAL_LIGHT, isAwake, isDarkCounter, lightGlow, pulseHz, pulseLevel, stepLight, stepPresence, stepPulse, worldTint, type LightState, type Rgb,
} from './light';
import { AUDIENCE_CHANNEL, readLaptopMessage, type AudienceHat, type AudienceMessage, type AudienceState } from './protocol';

/** The laptop says how things are at least once a second: quiet longer than this, it has gone. */
const CONNECTED_MS = 2500;
const BACKGROUND = '#05060a';
/**
 * The screen must never slow the music: it draws about 30 times a second (the light moves
 * slowly; more frames buy nothing), at the screen's own pixel size, and the big soft light on
 * a layer a quarter the size, stretched (it is a blur anyway, and a full-size one cost the
 * most). The browser may also drop frames; nothing depends on them.
 */
const FRAME_MS = 30;
const IDLE_FRAME_MS = 80;
const LIGHT_SCALE = 0.25;
/** The scene's name: 5 % in from the corner, 2.2 % of the width tall, mostly opaque (audit A5). */
const SCENE_OPACITY = 0.8;
const LOST_HAT: AudienceHat = { mode: 'lost', x: null, y: null, warmth: null };

interface Bloom { row: number; col: number; colour: string; at: number }

/** Any CSS colour as numbers (read back through a canvas), remembered. */
function colourReader(): (css: string) => Rgb {
  const known = new Map<string, Rgb>();
  const ctx = document.createElement('canvas').getContext('2d');
  return (css) => {
    const hit = known.get(css);
    if (hit) return hit;
    let rgb: Rgb = [200, 200, 200];
    if (ctx) {
      ctx.fillStyle = '#c8c8c8';
      ctx.fillStyle = css;
      const v = String(ctx.fillStyle);
      const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
      const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
      if (hex) rgb = [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
      else if (fn) rgb = [Number(fn[1]), Number(fn[2]), Number(fn[3])];
    }
    known.set(css, rgb);
    return rgb;
  };
}

const rgba = (c: Rgb, a: number): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

export default function AudienceScreen(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !root || !ctx) return undefined;
    const colourOf = colourReader();
    const ch = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(AUDIENCE_CHANNEL);
    const say = (m: AudienceMessage): void => ch?.postMessage(m);
    const hello = (): void => say(document.fullscreenElement ? { kind: 'here', full: true } : { kind: 'here' });

    let state: AudienceState | null = null;
    let lastMsgAt = -Infinity;
    /** A note has been heard since the board started playing: the board wakes up. */
    let heard = false;
    let blooms: Bloom[] = [];
    /** When each square last began to bloom: a square blooms again at most 3 times a second. */
    const lastBloom = new Map<string, number>();
    let bandLevel = 0;
    let bandLastBump = -Infinity;
    let bandLastNote = -Infinity;
    let light: LightState = INITIAL_LIGHT;
    let tint: Rgb = worldTint('none');
    let phase = 0;
    let presence = DIM_PRESENCE;
    let shownScene: string | null = null;

    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced = motion?.matches === true;
    const onMotion = (e: MediaQueryListEvent): void => { reduced = e.matches; };
    motion?.addEventListener?.('change', onMotion);

    if (ch) {
      ch.onmessage = (e: MessageEvent) => {
        const m = readLaptopMessage(e.data);
        if (!m) return;
        const now = performance.now();
        switch (m.kind) {
          case 'state':
            if (!m.playing) heard = false;
            state = m;
            lastMsgAt = now;
            if (m.scene !== shownScene) { shownScene = m.scene; setScene(m.scene); }
            break;
          case 'notes':
            lastMsgAt = now;
            if (!state?.playing) break;
            for (const n of m.notes) {
              heard = true;
              if (n.band) {
                bandLastNote = now;
                if (bandBump(bandLastBump / 1000, now / 1000)) { bandLastBump = now; bandLevel = 1; }
              } else {
                const key = `${n.row},${n.col}`;
                if (!canRebloom((lastBloom.get(key) ?? -Infinity) / 1000, now / 1000)) continue;
                lastBloom.set(key, now);
                blooms.push({ row: n.row, col: n.col, colour: n.colour, at: now });
              }
            }
            if (blooms.length > 300) blooms = blooms.slice(-300);
            break;
          case 'hello':
            hello();
            break;
          case 'place':
            // Onto the projector, filling it (only before it has been made full screen).
            if (!document.fullscreenElement) {
              try { window.moveTo(m.left, m.top); window.resizeTo(m.width, m.height); } catch { /* stays where it is */ }
            }
            break;
          case 'close':
            say({ kind: 'bye' });
            window.close();
            break;
          default:
            break;
        }
      };
    }
    // Say it is here (the laptop only sends while one is), and keep saying so.
    hello();
    const here = window.setInterval(hello, 1000);
    // Filling the screen is said at once, so the laptop's "drag it…" notice goes (A17).
    document.addEventListener('fullscreenchange', hello);
    const bye = (): void => say({ kind: 'bye' });
    window.addEventListener('pagehide', bye);
    // A click fills the screen (the browser only allows that after a click on the window).
    const fill = (): void => {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    };
    root.addEventListener('click', fill);

    // What the tests (and nobody on the projector) can read: set only when it changes.
    const marks: Record<string, string> = {};
    const mark = (k: string, v: string): void => {
      if (marks[k] === v) return;
      marks[k] = v;
      root.dataset[k] = v;
    };
    let sceneOpacity = -1;

    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');
    let raf = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      // The dim board between pieces moves only slowly: fewer frames still.
      if (now - last < (presence <= DIM_PRESENCE + 1e-3 && blooms.length === 0 ? IDLE_FRAME_MS : FRAME_MS)) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const t = now / 1000;
      const connected = now - lastMsgAt < CONNECTED_MS;
      const playing = connected && state?.playing === true;
      const awake = isAwake({ playing, heard, connected });

      // The numbers for this frame.
      light = stepLight(light, connected && state ? state.hat : LOST_HAT, dt, t);
      tint = glideTint(tint, worldTint(state?.world ?? 'none'), dt);
      phase = stepPulse(phase, pulseHz(state?.bpm ?? 0, awake), dt);
      presence = stepPresence(presence, awake, dt);
      bandLevel *= Math.exp(-dt / 0.3);
      blooms = blooms.filter((b) => now - b.at <= BLOOM_SEC * 1000);
      if (blooms.length === 0 && lastBloom.size > 0) lastBloom.clear();
      const wake = (presence - DIM_PRESENCE) / (1 - DIM_PRESENCE);

      // The canvas, the size of the window.
      const dpr = 1;
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;

      // Tim's light, behind everything: faint before the piece, full while it plays.
      const g = lightGlow(light, tint);
      const depth = awake ? (reduced ? 0.1 : 0.22) : 0.12;
      const a = g.alpha * presence * (1 - depth + depth * pulseLevel(phase));
      if (lctx) {
        const lw = Math.max(1, Math.round(W * LIGHT_SCALE));
        const lh = Math.max(1, Math.round(H * LIGHT_SCALE));
        if (layer.width !== lw || layer.height !== lh) { layer.width = lw; layer.height = lh; }
        lctx.globalCompositeOperation = 'copy';
        lctx.fillStyle = BACKGROUND;
        lctx.fillRect(0, 0, lw, lh);
        lctx.globalCompositeOperation = 'source-over';
        const lx = light.x * lw;
        const ly = light.y * lh;
        const R = g.radius * Math.min(lw, lh);
        const halo = lctx.createRadialGradient(lx, ly, 0, lx, ly, R * 1.9);
        halo.addColorStop(0, rgba(g.edge, a * 0.22));
        halo.addColorStop(1, rgba(g.edge, 0));
        lctx.fillStyle = halo;
        lctx.fillRect(0, 0, lw, lh);
        const glow = lctx.createRadialGradient(lx, ly, 0, lx, ly, R);
        glow.addColorStop(0, rgba(g.core, a));
        glow.addColorStop(0.35, rgba(g.edge, a * 0.55));
        glow.addColorStop(1, rgba(g.edge, 0));
        lctx.fillStyle = glow;
        lctx.fillRect(0, 0, lw, lh);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(layer, 0, 0, W, H);
      }

      // The band: a soft light along the bottom edge, lifting with its beat.
      const bandOn = playing && now - bandLastNote < 3000;
      if (bandOn) {
        const bandTint: Rgb = [(tint[0] + 150) / 2, (tint[1] + 170) / 2, (tint[2] + 255) / 2];
        const bh = H * 0.08;
        const strip = ctx.createLinearGradient(0, H, 0, H - bh);
        strip.addColorStop(0, rgba(bandTint, wake * (0.12 + 0.4 * bandLevel)));
        strip.addColorStop(1, rgba(bandTint, 0));
        ctx.fillStyle = strip;
        ctx.fillRect(0, H - bh, W, bh);
      }

      // The board: Tim's counters, and every note blooming at its square.
      const visible = new Set<string>();
      if (state) {
        const { x0, y0, cell } = boardLayout(W, H, state.rows, state.cols);
        const r = cell * COUNTER_RADIUS;
        const latest = new Map<string, Bloom>();
        for (const b of blooms) latest.set(`${b.row},${b.col}`, b);
        // Many squares blooming together share the glow out, so a whole board does not flash.
        const share = bloomGlowScale(latest.size);
        const at = (row: number, col: number): [number, number] => [x0 + (col + 0.5) * cell, y0 + (row + 0.5) * cell];
        const ripple = (cx: number, cy: number, rgb: Rgb, rr: number, alpha: number): void => {
          ctx.beginPath();
          ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(rgb, alpha * (0.4 + 0.6 * wake));
          ctx.lineWidth = Math.max(1.5, cell * 0.035);
          ctx.stroke();
        };
        const base = presence;
        const onBoard = new Set<string>();
        for (const c of state.counters) {
          if (c.row < 0 || c.row >= state.rows || c.col < 0 || c.col >= state.cols) continue;
          const key = `${c.row},${c.col}`;
          onBoard.add(key);
          const rgb = colourOf(c.colour);
          const [cx, cy] = at(c.row, c.col);
          const b = latest.get(key);
          const raw = b ? bloomAt((now - b.at) / 1000, reduced) : null;
          const shape = raw ? { ...raw, glow: raw.glow * share } : null;
          if (shape) visible.add(key);
          const rr = r * (shape?.scale ?? 1);
          if (shape) {
            const halo2 = ctx.createRadialGradient(cx, cy, rr * 0.5, cx, cy, rr * (1.6 + shape.glow));
            halo2.addColorStop(0, rgba(rgb, 0.6 * shape.glow));
            halo2.addColorStop(1, rgba(rgb, 0));
            ctx.fillStyle = halo2;
            ctx.beginPath();
            ctx.arc(cx, cy, rr * (1.6 + shape.glow), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx.fillStyle = rgba(shape ? brightenKeepingHue(rgb, shape.glow) : rgb, Math.min(1, base + (shape ? 0.4 * shape.glow : 0)));
          ctx.fill();
          if (isDarkCounter(rgb)) {
            // A black or deep navy counter would vanish: a thin light ring keeps it there.
            ctx.strokeStyle = rgba([235, 238, 248], 0.6 * base);
            ctx.lineWidth = Math.max(1.5, cell * 0.03);
            ctx.stroke();
          }
          if (shape?.ripple) ripple(cx, cy, rgb, r * shape.ripple.r, shape.ripple.alpha);
        }
        // Notes where Tim has no counter (a loop, an extra note): they bloom the same way.
        for (const [key, b] of latest) {
          if (onBoard.has(key) || b.row < 0 || b.row >= state.rows || b.col < 0 || b.col >= state.cols) continue;
          const raw = bloomAt((now - b.at) / 1000, reduced);
          if (!raw) continue;
          const shape = { ...raw, glow: raw.glow * share };
          visible.add(key);
          const rgb = colourOf(b.colour);
          const [cx, cy] = at(b.row, b.col);
          const rr = r * 0.85 * shape.scale;
          const halo3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 1.8);
          halo3.addColorStop(0, rgba(rgb, 0.85 * shape.glow));
          halo3.addColorStop(0.5, rgba(rgb, 0.5 * shape.glow));
          halo3.addColorStop(1, rgba(rgb, 0));
          ctx.fillStyle = halo3;
          ctx.beginPath();
          ctx.arc(cx, cy, rr * 1.8, 0, Math.PI * 2);
          ctx.fill();
          if (shape.ripple) ripple(cx, cy, rgb, r * shape.ripple.r, shape.ripple.alpha);
        }
      }

      // The scene's name fades with the board.
      const so = Math.round(wake * 100) / 100;
      if (so !== sceneOpacity && sceneRef.current) { sceneOpacity = so; sceneRef.current.style.opacity = String(SCENE_OPACITY * so); }

      mark('presence', presence.toFixed(2));
      mark('awake', awake ? 'yes' : 'no');
      mark('connected', connected ? 'yes' : 'no');
      mark('light', connected && state ? state.hat.mode : 'lost');
      mark('counters', String(state?.counters.length ?? 0));
      mark('blooms', [...visible].sort().join(' '));
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(here);
      document.removeEventListener('fullscreenchange', hello);
      window.removeEventListener('pagehide', bye);
      root.removeEventListener('click', fill);
      motion?.removeEventListener?.('change', onMotion);
      bye();
      if (ch) { ch.onmessage = null; ch.close(); }
    };
  }, []);

  return (
    <div
      ref={rootRef}
      style={{ position: 'fixed', inset: 0, background: BACKGROUND, cursor: 'none', overflow: 'hidden', userSelect: 'none' }}
    >
      <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <div
        ref={sceneRef}
        style={{
          position: 'absolute', right: '5vw', bottom: '5vh', opacity: 0, pointerEvents: 'none',
          color: '#e6e8f2', font: '500 2.2vw/1.2 system-ui, sans-serif', letterSpacing: '0.04em',
        }}
      >
        {scene ?? ''}
      </div>
    </div>
  );
}
