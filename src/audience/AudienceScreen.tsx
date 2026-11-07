/**
 * The audience screen (spec 2026-10-29): what the projector shows while Tim plays.
 *
 * A dark screen with Tim's board as glowing lights (owner, 7 Nov 2026: the counters still
 * shown, but more abstract; no timer, no words): each counter a soft light in its colour and
 * place, wandering a little and breathing (glow.ts), swelling as it sounds and sending rings
 * out across the dark like rain on water. Behind them a soft light follows the red hat (side
 * to side, up and down), warms with the Brightness and pulses with the speed. The band is a
 * soft light along the bottom. A soft ring in the cap's red marks where the hat is, with a
 * short fading trail, so the audience sees Tim steering (hatMarker.ts). Nothing else: no
 * grid, buttons, words, clock or cursor, and a lost connection is only the dim board.
 *
 * It draws on its own (requestAnimationFrame) from what the laptop page sends; the numbers
 * behind the picture are in light.ts. It plays nothing and changes nothing.
 */
import { useEffect, useRef } from 'react';
import {
  bandBump, BLOOM_SEC, bloomAt, bloomColour, bloomGlowScale, bloomShare, boardLayout, canRebloom, COUNTER_RADIUS,
  DIM_PRESENCE, glideTint, INITIAL_LIGHT, isAwake, lightGlow, pulseHz, pulseLevel,
  stepLight, stepPresence, stepPulse, worldTint, type LightState, type Rgb,
} from './light';
import {
  INITIAL_MARKER, markerHatMode, markerMode, markerSize, stepMarker,
  trailSegments, type MarkerState,
} from './hatMarker';
import { breath, drift, RAIN, rainRings } from './glow';
import { glideHue, refine, rgbOf, sceneHue, sparksOf } from './palette';
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

/**
 * A soft round glow in one colour, drawn once and kept (drawing gradients for every light on
 * every frame cost too much): bright in the middle, gone at the edge.
 */
const sprites = new Map<string, HTMLCanvasElement>();
function glowSprite(rgb: Rgb, radius: number): HTMLCanvasElement {
  const size = Math.max(8, Math.min(512, Math.round(radius / 8) * 8));
  const q = (v: number): number => Math.round(v / 8) * 8;
  const key = `${q(rgb[0])},${q(rgb[1])},${q(rgb[2])},${size}`;
  const hit = sprites.get(key);
  if (hit) return hit;
  if (sprites.size > 400) sprites.clear();
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size, size, 0, size, size, size);
    const [r, gg, b] = [q(rgb[0]), q(rgb[1]), q(rgb[2])];
    grad.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    grad.addColorStop(0.3, `rgba(${r},${gg},${b},0.55)`);
    grad.addColorStop(0.65, `rgba(${r},${gg},${b},0.16)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size * 2, size * 2);
  }
  sprites.set(key, c);
  return c;
}

const rgba = (c: Rgb, a: number): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

export default function AudienceScreen(): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !root || !ctx) return undefined;
    const colourOf = colourReader();
    const ch = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(AUDIENCE_CHANNEL);
    const say = (m: AudienceMessage): void => ch?.postMessage(m);

    let state: AudienceState | null = null;
    let lastMsgAt = -Infinity;
    /** A note has been heard since the board started playing: the board wakes up. */
    let heard = false;
    let blooms: Bloom[] = [];
    /** Each note's rings, spreading for a few seconds after its bloom has gone. */
    let rains: Bloom[] = [];
    /** Where each counter sat in its square last time: a nudge (or a new counter) sends a burst. */
    const lastBox = new Map<string, { up: number; side: number }>();
    /** When each square last bloomed: a counter may not re-bloom too soon (flash limit, A6). */
    const lastBloom = new Map<string, number>();
    let bandLevel = 0;
    let bandLastBump = -Infinity;
    let bandLastNote = -Infinity;
    let light: LightState = INITIAL_LIGHT;
    let marker: MarkerState = INITIAL_MARKER;
    let markerFrom: AudienceHat['mode'] = 'free';
    let tint: Rgb = worldTint('none');
    let phase = 0;
    let presence = DIM_PRESENCE;
    let hue = sceneHue(null);

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
            // The slightest move of a counter shows big (owner, 7 Nov 2026): a nudge in its
            // square, or a counter just put down, sends rings and sparks out from it.
            if (m.playing) {
              const seenNow = new Set<string>();
              for (const c of m.counters) {
                const key = `${c.row},${c.col}`;
                seenNow.add(key);
                const box = { up: c.up ?? 0, side: c.side ?? 0 };
                const was = lastBox.get(key);
                if (!was || Math.abs(was.up - box.up) > 0.08 || Math.abs(was.side - box.side) > 0.08) {
                  if (was || lastBox.size > 0) rains.push({ row: c.row, col: c.col, colour: c.colour, at: now });
                }
                lastBox.set(key, box);
              }
              for (const k of [...lastBox.keys()]) if (!seenNow.has(k)) lastBox.delete(k);
            }
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
                rains.push({ row: n.row, col: n.col, colour: n.colour, at: now });
              }
            }
            if (blooms.length > 300) blooms = blooms.slice(-300);
            if (rains.length > 120) rains = rains.slice(-120);
            break;
          case 'hello':
            say({ kind: 'here' });
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
    say({ kind: 'here' });
    const here = window.setInterval(() => say({ kind: 'here' }), 1000);
    const bye = (): void => say({ kind: 'bye' });
    window.addEventListener('pagehide', bye);
    // A click fills the screen (the browser only allows that after a click on the window).
    const fill = (): void => {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    };
    root.addEventListener('click', fill);
    const onFull = (): void => { if (document.fullscreenElement) say({ kind: 'filled' }); };
    document.addEventListener('fullscreenchange', onFull);

    // What the tests (and nobody on the projector) can read: set only when it changes.
    const marks: Record<string, string> = {};
    const mark = (k: string, v: string): void => {
      if (marks[k] === v) return;
      marks[k] = v;
      root.dataset[k] = v;
    };

    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');
    let raf = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      // The dim board between pieces moves only slowly: fewer frames still.
      if (now - last < (presence <= DIM_PRESENCE + 1e-3 && blooms.length === 0 && rains.length === 0 ? IDLE_FRAME_MS : FRAME_MS)) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const t = now / 1000;
      const connected = now - lastMsgAt < CONNECTED_MS;
      const playing = connected && state?.playing === true;
      const awake = isAwake({ playing, heard, connected });

      // The numbers for this frame.
      light = stepLight(light, connected && state ? state.hat : LOST_HAT, dt, t);
      markerFrom = markerHatMode(connected && state ? state.hat.mode : null, markerFrom);
      marker = stepMarker(marker, markerFrom, light, dt, t, reduced);
      tint = glideTint(tint, worldTint(state?.world ?? 'none'), dt);
      phase = stepPulse(phase, pulseHz(state?.bpm ?? 0, awake), dt);
      presence = stepPresence(presence, awake, dt);
      bandLevel *= Math.exp(-dt / 0.3);
      blooms = blooms.filter((b) => now - b.at <= BLOOM_SEC * 1000);
      rains = rains.filter((b) => now - b.at <= RAIN.seconds * 1000);
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

      // The scene's own hue, gliding to the next scene's (palette.ts).
      hue = glideHue(hue, sceneHue(playing ? state?.scene ?? null : null), dt);
      const shade = (css: string): Rgb => refine(colourOf(css), hue);

      // Behind everything, on the soft layer: a slow deep wash in the scene's hue, and Tim's
      // light following the hat: faint before the piece, full while it plays.
      const g = lightGlow(light, tint);
      const depth = awake ? (reduced ? 0.1 : 0.22) : 0.12;
      const a = g.alpha * (0.3 + 0.7 * wake) * (1 - depth + depth * pulseLevel(phase));
      if (lctx) {
        const lw = Math.max(1, Math.round(W * LIGHT_SCALE));
        const lh = Math.max(1, Math.round(H * LIGHT_SCALE));
        if (layer.width !== lw || layer.height !== lh) { layer.width = lw; layer.height = lh; }
        lctx.globalCompositeOperation = 'copy';
        lctx.fillStyle = BACKGROUND;
        lctx.fillRect(0, 0, lw, lh);
        lctx.globalCompositeOperation = 'lighter';
        const washA = 0.18 * (0.35 + 0.65 * wake);
        const drifted = reduced ? 0 : t;
        for (const [k, dh] of [[0, 0], [1, 38]] as const) {
          const wx = (0.3 + 0.4 * k + 0.12 * Math.sin(drifted * 0.05 + k * 2.1)) * lw;
          const wy = (0.35 + 0.3 * k + 0.1 * Math.cos(drifted * 0.04 + k)) * lh;
          const wr = Math.max(lw, lh) * 0.75;
          const wash = lctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
          wash.addColorStop(0, rgba(rgbOf((hue + dh) % 360, 0.55, 0.32), washA));
          wash.addColorStop(1, rgba(rgbOf((hue + dh) % 360, 0.55, 0.32), 0));
          lctx.fillStyle = wash;
          lctx.fillRect(0, 0, lw, lh);
        }
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
        const bandTint = rgbOf((hue + 20) % 360, 0.4, 0.6);
        const bh = H * 0.08;
        const strip = ctx.createLinearGradient(0, H, 0, H - bh);
        strip.addColorStop(0, rgba(bandTint, wake * (0.1 + 0.32 * bandLevel)));
        strip.addColorStop(1, rgba(bandTint, 0));
        ctx.fillStyle = strip;
        ctx.fillRect(0, H - bh, W, bh);
      }

      // The board as lights: every counter a small nebula, glows orbiting each other and
      // adding up where they meet; a note swells it, sends rings out and lets sparks go.
      const visible = new Set<string>();
      ctx.globalCompositeOperation = 'lighter';
      if (state) {
        const { x0, y0, cell } = boardLayout(W, H, state.rows, state.cols);
        const r = cell * COUNTER_RADIUS;
        const latest = new Map<string, Bloom>();
        for (const b of blooms) latest.set(`${b.row},${b.col}`, b);
        // However many bloom together, what they add to a third of the screen stays under the
        // budget (flash limit, A6): the same factor for each.
        const live = [...latest.values()].map((b) => ({ colour: shade(b.colour), shape: bloomAt((now - b.at) / 1000, reduced) }));
        const scale = bloomGlowScale(live.map((l) => ({ glow: l.shape?.glow ?? 0, colour: l.colour })), bloomShare(cell, W, H));
        // Where each counter sits in its square, shown bigger than it is: a nudge moves its light
        // well off the middle (owner, 7 Nov 2026: the slightest move shows big).
        const boxes = new Map(state.counters.map((c) => [`${c.row},${c.col}`, { up: c.up ?? 0, side: c.side ?? 0 }]));
        // Each light a little off its square's middle, wandering slowly (glow.ts): never a grid.
        const at = (row: number, col: number): [number, number] => {
          const d = drift(row, col, t, reduced);
          const b = boxes.get(`${row},${col}`);
          return [x0 + (col + 0.5 + d.dx + (b?.side ?? 0) * 0.45) * cell, y0 + (row + 0.5 + d.dy - (b?.up ?? 0) * 0.45) * cell];
        };
        const blob = (cx: number, cy: number, rgb: Rgb, radius: number, alpha: number): void => {
          if (alpha <= 0.003 || radius < 1) return;
          const sp = glowSprite(rgb, radius);
          ctx.globalAlpha = Math.min(1, alpha);
          ctx.drawImage(sp, cx - radius, cy - radius, radius * 2, radius * 2);
          ctx.globalAlpha = 1;
        };
        // The rain and the sparks first, under the lights.
        for (const b of rains) {
          if (b.row < 0 || b.row >= state.rows || b.col < 0 || b.col >= state.cols) continue;
          const age = (now - b.at) / 1000;
          const rgb = shade(b.colour);
          const [cx, cy] = at(b.row, b.col);
          for (const ring of rainRings(age, reduced)) {
            ctx.beginPath();
            ctx.arc(cx, cy, ring.r * cell, 0, Math.PI * 2);
            ctx.strokeStyle = rgba(rgb, ring.alpha * 0.8 * (0.4 + 0.6 * wake));
            ctx.lineWidth = Math.max(1, cell * 0.02);
            ctx.stroke();
          }
          for (const sp of sparksOf(b.row, b.col, age, reduced)) {
            blob(cx + sp.dx * cell, cy + sp.dy * cell, bloomColour(rgb, 0.6), sp.size * cell * 2.2, sp.alpha * (0.4 + 0.6 * wake));
          }
        }
        const base = 0.35 + 0.65 * wake;
        const onBoard = new Set<string>();
        for (const c of state.counters) {
          if (c.row < 0 || c.row >= state.rows || c.col < 0 || c.col >= state.cols) continue;
          const key = `${c.row},${c.col}`;
          onBoard.add(key);
          const rgb = shade(c.colour);
          const [cx, cy] = at(c.row, c.col);
          const b = latest.get(key);
          const raw = b ? bloomAt((now - b.at) / 1000, reduced) : null;
          const glowNow = raw ? raw.glow * scale : 0;
          if (raw) visible.add(key);
          // Higher in its square (louder): a bigger light; lower, smaller.
          const rr = r * (raw?.scale ?? 1) * (1 + 0.45 * (c.up ?? 0));
          const lit = base * breath(c.row, c.col, t, reduced);
          // Three glows orbiting each other slowly, each light its own way round.
          const seed = (c.row * 7 + c.col * 13) % 10;
          for (let k = 0; k < 3; k++) {
            const ang = (reduced ? 0 : t * (0.35 + 0.08 * k)) + seed + k * 2.09;
            const off = rr * 0.38;
            blob(cx + Math.cos(ang) * off, cy + Math.sin(ang) * off, rgb, rr * (1.45 + 0.7 * glowNow), 0.3 * lit + 0.22 * glowNow);
          }
          // Its heart: soft, brighter as it blooms, in its own colour, never washed to white.
          blob(cx, cy, raw ? bloomColour(rgb, raw.glow) : rgb, rr * 0.8, 0.55 * lit + 0.4 * glowNow);
        }
        // Notes where Tim has no counter (a loop, an extra note): a brief light that fades.
        for (const [key, b] of latest) {
          if (onBoard.has(key) || b.row < 0 || b.row >= state.rows || b.col < 0 || b.col >= state.cols) continue;
          const raw = bloomAt((now - b.at) / 1000, reduced);
          if (!raw) continue;
          visible.add(key);
          const [cx, cy] = at(b.row, b.col);
          blob(cx, cy, bloomColour(shade(b.colour), raw.glow), r * 1.5 * raw.scale, 0.75 * raw.glow * scale);
        }
      }

      // The hat as a wisp of light (not a target): a soft glowing head with a long tapering
      // tail of where it has just been; dimmer while held.
      if (marker.alpha > 0.005) {
        const R = markerSize(W, H);
        const a = marker.alpha * (0.6 + 0.4 * wake) * (markerFrom !== 'follow' ? 0.6 : 1);
        const mx = marker.x * W;
        const my = marker.y * H;
        const warm = rgbOf((hue + 180) % 360, 0.35, 0.82);
        ctx.lineCap = 'round';
        for (const seg of trailSegments(marker.trail, t, a)) {
          ctx.beginPath();
          ctx.moveTo(seg.x0 * W, seg.y0 * H);
          ctx.lineTo(seg.x1 * W, seg.y1 * H);
          ctx.strokeStyle = rgba(warm, seg.alpha * 0.55);
          ctx.lineWidth = Math.max(1, seg.width * R * 1.6);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        const head = glowSprite(warm, R * 1.6);
        ctx.globalAlpha = Math.min(1, 0.8 * a);
        ctx.drawImage(head, mx - R * 1.6, my - R * 1.6, R * 3.2, R * 3.2);
        const core = glowSprite([255, 246, 232], R * 0.45);
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(core, mx - R * 0.45, my - R * 0.45, R * 0.9, R * 0.9);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';

      mark('presence', presence.toFixed(2));
      mark('awake', awake ? 'yes' : 'no');
      mark('connected', connected ? 'yes' : 'no');
      mark('light', connected && state ? state.hat.mode : 'lost');
      mark('hatMarker', marker.alpha > 0.005 ? markerMode(markerFrom) : 'off');
      mark('counters', String(state?.counters.length ?? 0));
      mark('blooms', [...visible].sort().join(' '));
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(here);
      window.removeEventListener('pagehide', bye);
      root.removeEventListener('click', fill);
      document.removeEventListener('fullscreenchange', onFull);
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
    </div>
  );
}
