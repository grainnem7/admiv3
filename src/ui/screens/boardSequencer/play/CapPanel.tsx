// The Cap tab: a red cap, a camera facing the player, and which controls the cap's
// movements drive. Calm and explicit: what the camera sees, whether the cap is found,
// what each direction is doing now, and a lock that freezes it all.

import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Switch } from '../ui/Switch';
import { LabeledSlider } from '../ui/LabeledSlider';
import {
  CAP_RESUME_MAX_MS, CAP_RESUME_MIN_MS, CAP_REST_MAX_MS, CAP_REST_MIN_MS, CAP_REWIND_MAX_MS,
  type CapColour, type CapRole, type CapSettings,
} from '../../../../tracking/cap/capTracker';
import type { ControlRange, FaderRole } from '../../../../profiles/BoardSequencerConfig';
import type { CapPause, CapPreview, CapView } from '../useCapTracker';

export const CAP_ROLE_LABELS: Record<CapRole, string> = {
  off: 'Nothing', volume: 'Volume', tempo: 'Speed', reverb: 'Reverb', delay: 'Echo',
  tone: 'Brightness', fill: 'Extra notes', evolve: 'Sounds change',
};
const ROLES: CapRole[] = ['off', 'volume', 'tempo', 'reverb', 'delay', 'tone', 'fill', 'evolve'];

/** Why the cap is holding still, in words. */
export const CAP_PAUSE_TEXT: Record<CapPause, string> = {
  hands: 'paused: hands on the board',
  board: 'paused: a counter moved',
  learning: 'paused while learning',
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

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
  colourAt(x: number, y: number): CapColour | null;
  ranges: Record<FaderRole, ControlRange>;
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

/** What the camera sees, with the cap marked, the face outlined and the learnt reach. */
function Preview(p: CapPanelProps): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(p.settings);
  settingsRef.current = p.settings;
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
      const { frame, sighting, face } = p.previewRef.current;
      const s = settingsRef.current;
      ctx.fillStyle = '#20232a';
      ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
      if (frame) {
        scratch.width = frame.width;
        scratch.height = frame.height;
        scratch.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(scratch, 0, 0, PREVIEW_W, PREVIEW_H);
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
        : `What the cap camera sees. ${p.view.seen ? 'The cap is found.' : 'The cap is not in sight.'} Click the cap to learn its colour.`}
      style={{ width: '100%', maxWidth: PREVIEW_W, aspectRatio: '4 / 3', borderRadius: 'var(--bs-radius-md)', cursor: 'crosshair', touchAction: 'none' }}
      onPointerMove={(e) => { if (p.mouse) p.pointerRef.current = at(e); }}
      onPointerLeave={() => { if (p.mouse) p.pointerRef.current = null; }}
      onClick={(e) => {
        if (p.mouse) return;
        const pt = at(e);
        const colour = p.colourAt(pt.x, pt.y);
        if (colour) { p.onChange({ colour }); p.announce('Cap colour learnt.'); }
        else p.announce('That is not a colour the cap can be tracked by. Click on the red of the cap.');
      }}
    />
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
  const status = !s.enabled ? 'Off.'
    : view.camera === 'mouse' ? 'Mouse test: move the mouse over the picture.'
      : view.camera === 'no-camera' ? 'The camera could not be opened. Choose another below, or check it is plugged in.'
        : view.camera === 'only-board' ? 'The only camera is the board’s. The cap needs its own camera facing the player.'
        : view.camera === 'starting' ? 'Opening the camera…'
          : view.paused ? `Holding still (${CAP_PAUSE_TEXT[view.paused]}).`
          : view.seen ? (view.source === 'face' ? 'Following the face (the cap is hidden or off the head).' : 'The cap is found.')
            : 'The cap is not in sight. The controls hold where they are.';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10 }}>
      <p style={NOTE}>
        A red cap, and a camera facing the player. Moving the head left–right and up–down
        moves two controls, within your own range. Small movements are ignored, changes
        glide, and if the cap goes out of sight the controls stay where they are.
      </p>
      <Switch label="Control with the red cap" checked={s.enabled} onChange={(enabled) => onChange({ enabled })} />
      {s.enabled && (
        <>
          <div style={CARD}>
            <Preview {...p} />
            <span role="status" aria-live="polite" style={{ fontSize: 13, fontWeight: 600, color: view.seen ? 'var(--bs-ok)' : 'var(--bs-warn)' }}>{status}</span>
            {s.faceAssist && !p.mouse && (
              <span style={NOTE}>
                {view.face === 'on' ? 'Face check on: only a red patch on the head counts, and the face bridges moments when the cap is hidden.'
                  : view.face === 'loading' ? 'Loading face tracking…'
                    : view.face === 'unavailable' ? 'Face tracking could not load (no internet the first time?). The cap works on its own.'
                      : ''}
              </span>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
              Camera facing the player
              <select value={s.cameraId} onChange={(e) => onChange({ cameraId: e.target.value })} style={{ minHeight: 'var(--bs-target)' }}>
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
            <p style={NOTE}>Click the red of the cap in the picture to teach it the colour (it starts on "any strong red").</p>
          </div>

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
              hint="On: moving sideways leaves up–down alone, and a nod leaves left–right alone. A clear diagonal changes both."
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
            <span style={NOTE}>{s.sideArc ? 'Learnt: up–down is measured from your own side-to-side curve.' : 'Not learnt.'}</span>
          </div>

          <div style={CARD}>
            <span style={{ fontWeight: 600 }}>What the cap controls</span>
            {(['xRole', 'yRole'] as const).map((k) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
                {k === 'xRole' ? 'Left – right' : 'Up – down'}
                <select value={s[k]} onChange={(e) => onChange({ [k]: e.target.value as CapRole })} style={{ minHeight: 'var(--bs-target)' }}>
                  {ROLES.map((r) => <option key={r} value={r}>{CAP_ROLE_LABELS[r]}</option>)}
                </select>
              </label>
            ))}
            {s.yRole !== 'off' && (
              <p style={NOTE}>Tip: nodding along to the music moves up–down too. If that changes {CAP_ROLE_LABELS[s.yRole].toLowerCase()} too much, choose Steps or set up–down to Nothing.</p>
            )}
            <p style={NOTE}>Each control stays between its lowest and highest (Sound → Advanced → the fader ranges), so it can&rsquo;t go somewhere unsafe.</p>
            <div role="group" aria-label="What the cap is doing now" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Bar label="Left – right" role={s.xRole} pos={view.axes.x} value={s.xRole === 'off' ? undefined : view.values[s.xRole]} />
              <Bar label="Up – down" role={s.yRole} pos={view.axes.y} value={s.yRole === 'off' ? undefined : view.values[s.yRole]} />
            </div>
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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button tone={s.locked ? 'primary' : 'secondary'} aria-pressed={s.locked} onClick={() => onChange({ locked: !s.locked })}>
              {s.locked ? '🔒 Locked: press to let the cap move things again' : '🔒 Lock where things are now'}
            </Button>
            <Button tone="quiet" aria-pressed={p.mouse} onClick={() => p.onMouse(!p.mouse)}>
              {p.mouse ? 'Stop the mouse test' : 'Test with the mouse'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
