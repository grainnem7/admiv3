// The Cap tab: a red cap, a camera facing the player, and which controls the cap's
// movements drive. Calm and explicit: what the camera sees, whether the cap is found,
// what each direction is doing now, and a lock that freezes it all.

import { useEffect, useId, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Switch } from '../ui/Switch';
import { LabeledSlider } from '../ui/LabeledSlider';
import { Disclosure } from '../ui/Disclosure';
import {
  CAP_RESUME_MAX_MS, CAP_RESUME_MIN_MS, CAP_REST_MAX_MS, CAP_REST_MIN_MS, CAP_REWIND_MAX_MS,
  type CapColour, type CapRole, type CapSettings,
} from '../../../../tracking/cap/capTracker';
import { HAT_SURE_MAX, HAT_SURE_MIN } from '../../../../tracking/cap/hatColour';
import type { HatBox } from '../../../../tracking/cap/learnHat';
import { CONTROL_RANGE_LIMITS, type ControlRange, type FaderRole } from '../../../../profiles/BoardSequencerConfig';
import type { CapPause, CapPreview, CapView, HatLearningView, HatResult, HatStep } from '../useCapTracker';

export const CAP_ROLE_LABELS: Record<CapRole, string> = {
  off: 'Nothing', volume: 'Volume', tempo: 'Speed', reverb: 'Reverb', delay: 'Echo',
  tone: 'Brightness', fill: 'Extra notes', evolve: 'Sounds change',
};
const ROLES: CapRole[] = ['off', 'volume', 'tempo', 'reverb', 'delay', 'tone', 'fill', 'evolve'];

/** The hat's two moves, in words. */
const MOVE_LABELS = { xRole: 'Side to side', yRole: 'Up and down' } as const;

/** Which job each of the hat's moves does, for the Ready check: "Hat: side to side Speed · up and down Volume". */
export function hatJobsLine(xRole: CapRole, yRole: CapRole): string {
  return `Hat: side to side ${CAP_ROLE_LABELS[xRole]} · up and down ${CAP_ROLE_LABELS[yRole]}`;
}

/**
 * The hat's state under the board, in a few words. "cap found" only once the hat is learnt:
 * before that, what is followed may be a red chair (B7).
 */
export function capHudText(view: Pick<CapView, 'camera' | 'paused' | 'seen' | 'source'>, learnt: boolean, locked: boolean): string {
  const what = view.paused ? CAP_PAUSE_TEXT[view.paused]
    : !view.seen ? 'cap not in sight (holding)'
      : view.source === 'face' ? 'following the face'
        // The mouse test is the cap on purpose: found.
        : learnt || view.camera === 'mouse' ? 'cap found' : 'a red thing followed · not learnt';
  return `${what}${locked ? ' · locked' : ''}`;
}

/** What the panel says while a red thing is followed but the hat has not been learnt. */
export const CAP_FOUND_UNLEARNT = 'A red thing is found: is it the hat? Learn the hat to be sure.';

/** Why the cap is holding still, in words. */
export const CAP_PAUSE_TEXT: Record<CapPause, string> = {
  hands: 'paused: hands on the board',
  board: 'paused: a counter moved',
  learning: 'paused while learning',
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** What a step of Learn the hat came to, in words (shown, and said aloud). */
export function hatResultText(r: HatResult): string {
  if (r.step === 'room') {
    if (r.hatOn) return 'Is the hat still on? Take it off and learn the room again.';
    return r.ok ? 'Room learnt. Now put the hat on and press 2.'
      : 'Couldn’t see the room well enough: too few pictures came from the camera. Check the camera, then try again.';
  }
  switch (r.outcome) {
    case 'no-room': return 'Learn the room first, with the hat off.';
    case 'ok': return `Hat learnt: it stands out well from the room. It found the hat in ${r.found} of ${r.of} pictures.`;
    case 'look-alike': return 'Hat learnt, but something in the room looks like it (outlined in the picture). Move it out of shot or learn again.';
    case 'hard': return `The hat is hard to tell from the room here: it found the hat in only ${r.found} of ${r.of} pictures. `
      + 'Check the hat stays in the picture, and try more light or a hat in a stronger colour. Nothing was changed.';
    case 'not-seen': return 'Couldn’t see the hat. Check it is in the picture and learn the hat again. '
      + 'If something in the room is the same colour as the hat, move it out of shot first. Nothing was changed.';
  }
}

/** A step of Learn the hat under way, in words. */
function hatLearningText(h: HatLearningView): string {
  const what = h.step === 'room' ? 'the room' : 'the hat';
  if (h.phase === 'ready') return `Learning ${what}: starts in ${h.seconds}…`;
  return h.step === 'room' ? `Watching the room: ${h.seconds} s. The hat stays off.`
    : `Watching the hat: ${h.seconds} s. Move the head a little, any way.`;
}

/** "28 Oct, 14:05". */
const when = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The tint over what is taken for the hat: a light blue, clear against red. */
const HAT_TINT: readonly [number, number, number] = [80, 220, 255];
const LOOK_ALIKE = '#ffd60a';

/** A dashed yellow box around something that looks like the hat (a box 0..1), labelled. */
function outlineLookAlike(ctx: CanvasRenderingContext2D, look: HatBox): void {
  const x = look.x * PREVIEW_W - 3; const y = look.y * PREVIEW_H - 3;
  const w = look.w * PREVIEW_W + 6; const h = look.h * PREVIEW_H + 6;
  ctx.strokeStyle = LOOK_ALIKE;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  const label = 'looks like the hat';
  ctx.font = '12px sans-serif';
  const tw = ctx.measureText(label).width + 8;
  const ly = y > 20 ? y - 18 : Math.min(PREVIEW_H - 18, y + h + 2);
  const lx = Math.max(0, Math.min(PREVIEW_W - tw, x));
  ctx.fillStyle = '#000000b0';
  ctx.fillRect(lx, ly, tw, 16);
  ctx.fillStyle = LOOK_ALIKE;
  ctx.fillText(label, lx + 4, ly + 12);
}

/** A control's value in words: "96 BPM", "70%". */
export function capValueText(role: FaderRole, v: number | undefined): string {
  if (v === undefined) return '—';
  return role === 'tempo' ? `${Math.round(v)} BPM` : `${Math.round(v * 100)}%`;
}

export interface CapPanelProps {
  settings: CapSettings;
  onChange(patch: Partial<CapSettings>): void;
  view: CapView;
  previewRef: MutableRefObject<CapPreview>;
  pointerRef: MutableRefObject<{ x: number; y: number } | null>;
  mouse: boolean;
  onMouse(on: boolean): void;
  cameras: MediaDeviceInfo[];
  learnReach(seconds: number): void;
  learnSide(seconds: number): void;
  /** Learn the hat: start step 1 (the room) or step 2 (the hat). */
  learnHatStep(step: HatStep): void;
  /** Forget what the last step of Learn the hat came to. */
  clearHatResult(): void;
  colourAt(x: number, y: number): CapColour | null;
  ranges: Record<FaderRole, ControlRange>;
  /** A control's range changed (the speed's: Slowest and Fastest). */
  onRange(role: FaderRole, range: ControlRange): void;
  announce(text: string): void;
  /** The board's camera, marked in the list. */
  boardCameraId: string;
}

const NOTE: CSSProperties = { fontSize: 12, color: 'var(--bs-fg2)', margin: 0 };
const CARD: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
  borderRadius: 'var(--bs-radius-md)', background: 'var(--bs-raised)', border: '1px solid var(--bs-border)',
};
const PREVIEW_W = 320;
const PREVIEW_H = 240;
/**
 * What the camera sees, with the cap marked, the face outlined and the learnt reach; and,
 * from Learn the hat, what is taken for the hat (tinted, with anything else taken for it
 * outlined) and a look-alike in the room found while learning (outlined).
 */
function Preview(p: CapPanelProps & { showHat: boolean; lookAlike: HatBox | null }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(p.settings);
  settingsRef.current = p.settings;
  const shownRef = useRef({ showHat: p.showHat, lookAlike: p.lookAlike });
  shownRef.current = { showHat: p.showHat, lookAlike: p.lookAlike };
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const scratch = document.createElement('canvas');
    const draw = (t: number): void => {
      raf = requestAnimationFrame(draw);
      if (t - last < 80) return;
      last = t;
      const cv = ref.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx) return;
      const { frame, sighting, face, mask, others } = p.previewRef.current;
      const s = settingsRef.current;
      const shown = shownRef.current;
      ctx.fillStyle = '#20232a';
      ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
      if (frame) {
        scratch.width = frame.width;
        scratch.height = frame.height;
        const img = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
        // Show what it sees as the hat: those pixels tinted.
        if (shown.showHat && mask && mask.length === frame.width * frame.height) {
          const px = img.data;
          for (let i = 0; i < mask.length; i++) {
            if (!mask[i]) continue;
            const k = i * 4;
            px[k] = px[k] * 0.3 + HAT_TINT[0] * 0.7;
            px[k + 1] = px[k + 1] * 0.3 + HAT_TINT[1] * 0.7;
            px[k + 2] = px[k + 2] * 0.3 + HAT_TINT[2] * 0.7;
          }
        }
        scratch.getContext('2d')?.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(scratch, 0, 0, PREVIEW_W, PREVIEW_H);
      }
      // Something in the room that looks like the hat (from Learn the hat): outlined. And,
      // while showing what it sees as the hat, anything else taken for it right now.
      if (shown.lookAlike) outlineLookAlike(ctx, shown.lookAlike);
      if (shown.showHat && frame) {
        for (const c of others) outlineLookAlike(ctx, { x: c.x0, y: c.y0, w: c.x1 - c.x0, h: c.y1 - c.y0 });
      }
      // The learnt reach.
      if (s.reachX || s.reachY) {
        const x0 = (s.reachX?.min ?? 0) * PREVIEW_W; const x1 = (s.reachX?.max ?? 1) * PREVIEW_W;
        const y0 = (s.reachY?.min ?? 0) * PREVIEW_H; const y1 = (s.reachY?.max ?? 1) * PREVIEW_H;
        ctx.strokeStyle = '#8fd3b8';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.setLineDash([]);
      }
      if (face) {
        ctx.strokeStyle = '#ffffffaa';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(face.x * PREVIEW_W, face.y * PREVIEW_H, face.w * PREVIEW_W, face.h * PREVIEW_H);
        ctx.setLineDash([]);
      }
      if (sighting) {
        ctx.beginPath();
        ctx.arc(sighting.x * PREVIEW_W, sighting.y * PREVIEW_H, 14, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sighting.x * PREVIEW_W, sighting.y * PREVIEW_H, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4d4d';
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [p.previewRef]);

  const at = (e: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
  };
  return (
    <canvas
      ref={ref}
      width={PREVIEW_W}
      height={PREVIEW_H}
      role="img"
      aria-label={p.mouse
        ? 'Test area: move the mouse over it as if it were the cap'
        : `What the cap camera sees. ${p.view.seen ? (p.settings.learntHat ? 'The cap is found.' : 'A red thing is found: is it the hat?') : 'The cap is not in sight.'} ${p.settings.learntHat
          ? 'The learnt hat is in use.' : 'Click the cap to learn its colour.'}${p.showHat
          ? ' What it takes for the hat is tinted blue. Anything else taken for it is outlined in yellow.' : ''}${p.lookAlike
          ? ' Something that looks like the hat is outlined in yellow.' : ''}`}
      style={{ width: '100%', maxWidth: PREVIEW_W, aspectRatio: '4 / 3', borderRadius: 'var(--bs-radius-md)', cursor: 'crosshair', touchAction: 'none' }}
      onPointerMove={(e) => { if (p.mouse) p.pointerRef.current = at(e); }}
      onPointerLeave={() => { if (p.mouse) p.pointerRef.current = null; }}
      onClick={(e) => {
        if (p.mouse) return;
        if (p.settings.learntHat) {
          p.announce('The learnt hat is in use, so clicking the picture changes nothing. To go back to a clicked colour, forget the learnt hat.');
          return;
        }
        const pt = at(e);
        const colour = p.colourAt(pt.x, pt.y);
        if (colour) { p.onChange({ colour }); p.announce('Cap colour learnt.'); }
        else p.announce('That is not a colour the cap can be tracked by. Click on the red of the cap.');
      }}
    />
  );
}

/**
 * Learn the hat: two short steps against the room, so other red things in shot aren't taken
 * for the hat and a change of light doesn't lose it. The step buttons stay put and are never
 * disabled (a disabled button loses focus to the page): while a step runs a second press does
 * nothing, and without the camera a press says why.
 */
function LearnHat(p: CapPanelProps & { showHat: boolean; onShowHat(on: boolean): void }): JSX.Element {
  const { settings: s, view, onChange } = p;
  const headingId = useId();
  const noteId = useId();
  const headingRef = useRef<HTMLSpanElement>(null);
  const roomRef = useRef<HTMLButtonElement>(null);
  const h = view.hatLearning;
  const learnt = s.learntHat;
  const noCamera = view.camera === 'mouse' ? 'Learning the hat needs the camera: stop the mouse test first.'
    : view.camera !== 'running' ? 'Learning the hat needs the camera picture.' : null;
  const press = (step: HatStep): void => {
    if (h) return;
    if (noCamera) { p.announce(noCamera); return; }
    p.learnHatStep(step);
    // Without the room, the hook says at once that it comes first.
    if (step === 'room') p.announce('Learning the room in 2 seconds. The hat off, please.');
    else if (view.roomLearnt) p.announce('Learning the hat in 2 seconds. The hat on, and move the head a little.');
  };
  const forget = (): void => {
    // Focus first, to what takes the button's place: it is about to go.
    (roomRef.current ?? headingRef.current)?.focus();
    onChange({ learntHat: null });
    p.clearHatResult();
    p.announce('The learnt hat is forgotten. It follows a red colour again.');
  };
  const r = view.hatResult;
  const line = r ? hatResultText(r)
    : learnt ? `A learnt hat is in use${learnt.learntAt > 0 ? ` (learnt ${when(learnt.learntAt)})` : ''}.`
      : 'Not learnt yet: it follows a red colour, not the hat itself.';
  const good = r ? (r.step === 'room' ? r.ok : r.outcome === 'ok') : learnt !== null;
  return (
    <div style={CARD} role="group" aria-labelledby={headingId}>
      <span id={headingId} ref={headingRef} tabIndex={-1} style={{ fontWeight: 600 }}>Learn the hat</span>
      <p style={NOTE}>
        Teaches the camera this hat in this room, so other red things in the room are not taken
        for it and a change of light doesn&rsquo;t lose it. With the player in their playing
        place: first the room with the hat off, then the hat on. About 10 seconds in all.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          ref={roomRef}
          tone={view.roomLearnt ? 'secondary' : 'primary'}
          aria-disabled={h || noCamera ? true : undefined}
          aria-describedby={noCamera ? noteId : undefined}
          onClick={() => press('room')}
        >
          1 · Learn the room (hat off)
        </Button>
        <Button
          tone={view.roomLearnt && !learnt ? 'primary' : 'secondary'}
          aria-disabled={h || noCamera ? true : undefined}
          aria-describedby={noCamera ? noteId : undefined}
          onClick={() => press('hat')}
        >
          2 · Learn the hat (hat on)
        </Button>
      </div>
      {noCamera && <span id={noteId} style={NOTE}>{noCamera}</span>}
      {/* Reserved: the countdown and progress come and go without moving what is below. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, minHeight: 18 }}>{h ? hatLearningText(h) : ''}</span>
        <div
          role={h ? 'progressbar' : undefined}
          aria-label={h ? `Learning ${h.step === 'room' ? 'the room' : 'the hat'}: how far it has got` : undefined}
          aria-valuemin={h ? 0 : undefined}
          aria-valuemax={h ? 100 : undefined}
          aria-valuenow={h ? Math.round(h.progress * 100) : undefined}
          style={{ height: 8, borderRadius: 4, background: 'var(--bs-elev)', overflow: 'hidden', visibility: h ? 'visible' : 'hidden' }}
        >
          {/* The progress comes once a second: the bar glides through each second to it. */}
          <div style={{
            width: `${Math.round((h?.progress ?? 0) * 100)}%`, height: '100%', background: 'var(--bs-accent)',
            transition: h?.phase === 'watching' ? 'width 1s linear' : 'none',
          }}
          />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: good ? 'var(--bs-ok)' : 'var(--bs-warn)' }}>{line}</span>
      {learnt && (
        <>
          <LabeledSlider
            label="How sure before it counts"
            min={HAT_SURE_MIN} max={HAT_SURE_MAX} step={0.05}
            value={learnt.sure} display={`${Math.round(learnt.sure * 100)}%`}
            onChange={(sure) => onChange({ learntHat: { ...learnt, sure } })}
          />
          <p style={NOTE}>
            Higher: other things are less likely to be taken for the hat, but the hat can be missed
            in poor light. Lower: the other way round.
          </p>
        </>
      )}
      <Switch
        label="Show what it sees as the hat"
        checked={p.showHat}
        onChange={p.onShowHat}
        hint="In the camera picture:what it takes for the hat now is tinted blue, and anything else taken for it is outlined in yellow."
      />
      {learnt && <div><Button tone="quiet" onClick={forget}>Forget the learnt hat</Button></div>}
    </div>
  );
}

/**
 * Slowest and Fastest, for the hat on Speed: it moves the speed around the scene's, up to
 * one and down to the other. The same setting as the Speed counter's range (Sound →
 * Advanced). Typed digit by digit ("1", "12", "120"), so held to its limits only when the
 * box is left.
 */
function SpeedRange({ range, onChange }: { range: ControlRange; onChange(r: ControlRange): void }): JSX.Element {
  const limits = CONTROL_RANGE_LIMITS.tempo;
  const hold = (v: number): number => Math.max(limits.min, Math.min(limits.max, Math.round(v)));
  const box = (key: 'min' | 'max', label: string): JSX.Element => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, flex: 1 }}>
      {label}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number" step={5} min={limits.min} max={limits.max} value={range[key]}
          onChange={(e) => onChange({ ...range, [key]: Number(e.target.value) || 0 })}
          onBlur={() => { if (hold(range[key]) !== range[key]) onChange({ ...range, [key]: hold(range[key]) }); }}
          style={{ width: 80, minHeight: 'var(--bs-target)' }}
        />
        BPM
      </span>
    </label>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={NOTE}>
        In the middle of your range, the speed is the scene&rsquo;s (or your own Speed when no scene is
        on). One way it goes up to Fastest, the other way down to Slowest.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {box('min', 'Slowest')}
        {box('max', 'Fastest')}
      </div>
      <p style={NOTE}>Slowest and Fastest are the same setting as Sound → Advanced → the Speed counter&rsquo;s lowest and highest.</p>
    </div>
  );
}

function Bar({ label, role, pos, value }: { label: string; role: CapRole; pos: number | null; value: number | undefined }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 13 }}>
        <b>{label}</b>{` → ${CAP_ROLE_LABELS[role]}`}{role !== 'off' ? `: ${capValueText(role, value)}` : ''}
      </span>
      {role !== 'off' && (
        <div aria-hidden="true" style={{ height: 12, borderRadius: 6, background: 'var(--bs-elev)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((pos ?? 0) * 100)}%`, height: '100%', background: 'var(--bs-accent)' }} />
        </div>
      )}
    </div>
  );
}

export function CapPanel(p: CapPanelProps): JSX.Element {
  const { settings: s, onChange, view } = p;
  const [showHat, setShowHat] = useState(false);
  // The look-alike from the last Learn the hat, while that hat is in use.
  const lookAlike = s.learntHat && view.hatResult?.step === 'hat' ? view.hatResult.lookAlike : null;
  // Until the hat is learnt, a red thing seen may be a red chair: never "found" in green.
  const unsure = view.seen && view.source !== 'face' && s.learntHat === null && view.camera !== 'mouse';
  const status = !s.enabled ? 'Off.'
    : view.camera === 'mouse' ? 'Mouse test: move the mouse over the picture.'
      : view.camera === 'no-camera' ? 'The camera could not be opened. Choose another below, or check it is plugged in.'
        : view.camera === 'only-board' ? 'The only camera is the board’s. The cap needs its own camera facing the player.'
        : view.camera === 'starting' ? 'Opening the camera…'
          : view.paused ? `Holding still (${CAP_PAUSE_TEXT[view.paused]}).`
          : view.seen ? (view.source === 'face' ? 'Following the face (the cap is hidden or off the head).'
            : unsure ? CAP_FOUND_UNLEARNT : 'The cap is found.')
            : 'The cap is not in sight. The controls hold where they are.';
  const statusColour = unsure ? 'var(--bs-fg)' : view.seen ? 'var(--bs-ok)' : 'var(--bs-warn)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10, minWidth: 0 }}>
      <p style={NOTE}>
        A red cap, and a camera facing the player. Moving the head side to side and up and down
        moves two controls, within your own range. Small movements are ignored, changes
        glide, and if the cap goes out of sight the controls stay where they are.
      </p>
      <Switch label="Control with the red cap" checked={s.enabled} onChange={(enabled) => onChange({ enabled })} />
      {s.enabled && (
        <>
          <LearnHat {...p} showHat={showHat} onShowHat={setShowHat} />

          <div style={CARD}>
            <span style={{ fontWeight: 600 }}>What the hat&rsquo;s moves do</span>
            {(['xRole', 'yRole'] as const).map((k) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, minWidth: 0 }}>
                {MOVE_LABELS[k]}
                <select value={s[k]} onChange={(e) => onChange({ [k]: e.target.value as CapRole })} style={{ minHeight: 'var(--bs-target)', maxWidth: '100%' }}>
                  {ROLES.map((r) => <option key={r} value={r}>{CAP_ROLE_LABELS[r]}</option>)}
                </select>
              </label>
            ))}
            {(s.xRole === 'tempo' || s.yRole === 'tempo') && (
              <SpeedRange range={p.ranges.tempo} onChange={(range) => p.onRange('tempo', range)} />
            )}
            {s.yRole !== 'off' && (
              <p style={NOTE}>Tip: nodding along to the music moves up and down too. If that changes {CAP_ROLE_LABELS[s.yRole].toLowerCase()} too much, choose steps (More hat settings → How it responds) or set up and down to Nothing.</p>
            )}
            <div role="group" aria-label="What the cap is doing now" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Bar label={MOVE_LABELS.xRole} role={s.xRole} pos={view.axes.x} value={s.xRole === 'off' ? undefined : view.values[s.xRole]} />
              <Bar label={MOVE_LABELS.yRole} role={s.yRole} pos={view.axes.y} value={s.yRole === 'off' ? undefined : view.values[s.yRole]} />
            </div>
            {/* A show-time control: kept at the top, never folded away. */}
            <div>
              <Button tone={s.locked ? 'primary' : 'secondary'} aria-pressed={s.locked} onClick={() => onChange({ locked: !s.locked })}>
                {s.locked ? '🔒 Locked: press to let the cap move things again' : '🔒 Lock where things are now'}
              </Button>
            </div>
          </div>

          <div style={CARD}>
            <Preview {...p} showHat={showHat} lookAlike={lookAlike} />
            <span role="status" aria-live="polite" style={{ fontSize: 13, fontWeight: 600, color: statusColour }}>{status}</span>
            {!p.mouse && <span style={NOTE}>{s.learntHat ? 'Looking for the learnt hat.' : 'Looking for the cap’s colour.'}</span>}
            {s.faceAssist && !p.mouse && (
              <span style={NOTE}>
                {view.face === 'on' ? 'Face check on: only a red patch on the head counts, and the face bridges moments when the cap is hidden.'
                  : view.face === 'loading' ? 'Loading face tracking…'
                    : view.face === 'unavailable' ? 'Face tracking could not load (no internet the first time?). The cap works on its own.'
                      : ''}
              </span>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, minWidth: 0 }}>
              Camera facing the player
              <select value={s.cameraId} onChange={(e) => onChange({ cameraId: e.target.value })} style={{ minHeight: 'var(--bs-target)', width: '100%', minWidth: 0 }}>
                <option value="">Any camera that isn&rsquo;t the board&rsquo;s</option>
                {p.cameras.map((c, i) => (
                  <option key={c.deviceId || i} value={c.deviceId}>
                    {`${c.label || `Camera ${i + 1}`}${c.deviceId && c.deviceId === p.boardCameraId ? ' (used for the board)' : ''}`}
                  </option>
                ))}
              </select>
            </label>
            {s.cameraId !== '' && s.cameraId === p.boardCameraId && (
              <span role="alert" style={{ fontSize: 13, color: 'var(--bs-warn)' }}>
                This is the board&rsquo;s camera. It looks down at the board, so it can&rsquo;t see the
                player&rsquo;s head &mdash; choose the camera facing the player.
              </span>
            )}
            {p.cameras.length < 2 && (
              <span style={NOTE}>Only one camera is connected. The cap needs its own camera facing the player (a phone through Camo, or the laptop&rsquo;s own webcam).</span>
            )}
          </div>

          <Disclosure summary="More hat settings">
            <p style={NOTE}>
              {s.learntHat
                ? 'The learnt hat is in use, so clicking the picture isn’t needed. To go back to a clicked colour, forget the learnt hat.'
                : 'Without learning the hat: click the red of the cap in the picture to teach it the colour (it starts on "any strong red").'}
            </p>

            <div style={CARD}>
              <span style={{ fontWeight: 600 }}>Your range</span>
              <p style={NOTE}>
                Press, then move the head comfortably as far as it goes each way for a few
                seconds. That range becomes the whole of each control, so the ends are easy to reach.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                  tone="primary"
                  onClick={() => { p.learnReach(6); p.announce('Learning your range: move the head comfortably each way.'); }}
                  reason={view.learning !== null ? `Learning… ${view.learning} s` : null}
                >
                  Learn my range
                </Button>
                {(s.reachX || s.reachY) && (
                  <Button tone="quiet" onClick={() => onChange({ reachX: null, reachY: null })}>Use the whole picture</Button>
                )}
              </div>
              <span style={NOTE}>{s.reachX || s.reachY ? 'Range learnt (the dashed box).' : 'Not learnt: the whole picture is the range.'}</span>
            </div>

            <div style={CARD}>
              <span style={{ fontWeight: 600 }}>Keeping the two directions apart</span>
              <p style={NOTE}>
                Turning the head to the side lowers it a little, which can read as moving down.
              </p>
              <Switch
                label="One direction at a time"
                checked={s.oneAtATime}
                onChange={(oneAtATime) => onChange({ oneAtATime })}
                hint="On: moving side to side leaves up and down alone, and a nod leaves side to side alone. A clear diagonal changes both."
              />
              <p style={NOTE}>
                Better still, learn the head&rsquo;s natural side-to-side curve: press, then move the
                head left and right a few times at a comfortable height, without nodding.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                  tone="secondary"
                  onClick={() => { p.learnSide(6); p.announce('Learning your side to side: move the head left and right at a comfortable height.'); }}
                  reason={view.learning !== null ? `Learning… ${view.learning} s` : null}
                >
                  Learn my side-to-side
                </Button>
                {s.sideArc && <Button tone="quiet" onClick={() => onChange({ sideArc: null })}>Forget it</Button>}
              </div>
              <span style={NOTE}>{s.sideArc ? 'Learnt: up and down is measured from your own side-to-side curve.' : 'Not learnt.'}</span>
            </div>

            <div style={CARD}>
              <span style={{ fontWeight: 600 }}>While counters are being moved</span>
              <p style={NOTE}>
                Reaching for the board moves the head too. With this on, the cap holds still while a
                hand is on the board or a counter is moved, and first slides back to where things were
                just before the reach began.
              </p>
              <Switch
                label="Hold still while counters are moved"
                checked={s.pauseOnBoard}
                onChange={(pauseOnBoard) => onChange({ pauseOnBoard })}
                hint="The board camera watches for hands. On the laptop board, a click counts."
              />
              {s.pauseOnBoard && (
                <>
                  <LabeledSlider
                    label="Starts again after the board is quiet for"
                    min={CAP_RESUME_MIN_MS} max={CAP_RESUME_MAX_MS} step={100}
                    value={s.resumeAfterMs} display={seconds(s.resumeAfterMs)}
                    onChange={(resumeAfterMs) => onChange({ resumeAfterMs })}
                  />
                  <LabeledSlider
                    label="Slides back by"
                    min={0} max={CAP_REWIND_MAX_MS} step={100}
                    value={s.rewindMs} display={s.rewindMs === 0 ? 'not at all' : seconds(s.rewindMs)}
                    onChange={(rewindMs) => onChange({ rewindMs })}
                  />
                  <LabeledSlider
                    label="A hand resting on the board stops holding it after"
                    min={CAP_REST_MIN_MS} max={CAP_REST_MAX_MS} step={500}
                    value={s.restMs} display={seconds(s.restMs)}
                    onChange={(restMs) => onChange({ restMs })}
                  />
                </>
              )}
            </div>

            <div style={CARD}>
              <span style={{ fontWeight: 600 }}>How it responds</span>
              <span style={NOTE}>Moves</span>
              <SegmentedControl<0 | 3 | 5>
                label="Moves"
                value={s.steps}
                onChange={(steps) => onChange({ steps })}
                options={[{ value: 0, label: 'Smoothly' }, { value: 5, label: 'In 5 steps' }, { value: 3, label: 'In 3 steps' }]}
              />
              <span style={NOTE}>Follows</span>
              <SegmentedControl<CapSettings['response']>
                label="Follows"
                value={s.response}
                onChange={(response) => onChange({ response })}
                options={[{ value: 'steady', label: 'Steadily' }, { value: 'medium', label: 'Medium' }, { value: 'quick', label: 'Quickly' }]}
              />
              <Switch label="Picture like a mirror" checked={s.mirror} onChange={(mirror) => onChange({ mirror })} hint="On: moving to your right moves right on the screen." />
              <Switch label="Check it is on the head (face tracking)" checked={s.faceAssist} onChange={(faceAssist) => onChange({ faceAssist })} hint="Ignores red things elsewhere in the room, and keeps following when the cap is hidden for a moment." />
            </div>

            <p style={NOTE}>Each control stays between its lowest and highest (Sound → Advanced → the fader ranges), so it can&rsquo;t go somewhere unsafe.</p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button tone="quiet" aria-pressed={p.mouse} onClick={() => p.onMouse(!p.mouse)}>
                {p.mouse ? 'Stop the mouse test' : 'Test with the mouse'}
              </Button>
            </div>
          </Disclosure>
        </>
      )}
    </div>
  );
}
