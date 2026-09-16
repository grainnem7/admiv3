import { useRef, useState } from 'react';
import {
  NUDGE_COARSE, NUDGE_FINE, cornerOrderForTaps, defaultInsetCorners, hitTestHandle, nudgeCorner,
} from '../cornerEditor';
import { flipCorners, rotateCorners, type Corners } from '../../../../tracking/boardDetect/orientation';
import type { Point } from '../../../../utils/homography';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';

export type CornerEditorMode = 'tap' | 'review' | 'adjust';

export interface BoardCornerEditorProps {
  corners?: Corners;
  mode: CornerEditorMode;
  rows: number;
  cols: number;
  onConfirm(corners: Corners): void;
  onCancel(): void;
  /** Where the nudge pad and buttons sit, from the player's handedness. */
  controlsSide?: 'left' | 'right';
}

/** Prompted tap order: the loop's start on the low side first, then round the board. */
const TAP_PROMPTS = [
  'Tap the outside corner of the squares where the loop starts, on the low-notes side',
  'Now the corner where the loop starts, on the high-notes side',
  'Now the corner where the loop ends, on the high-notes side',
  'Now the corner where the loop ends, on the low-notes side',
];

/** Saved order is [start+high, end+high, end+low, start+low]. */
const HANDLE_LABELS = ['Start · high', 'End · high', 'End · low', 'Start · low'];

const HANDLE_RADIUS = 0.06;

export function BoardCornerEditor({
  corners, mode: initialMode, rows, cols, onConfirm, onCancel, controlsSide = 'right',
}: BoardCornerEditorProps): JSX.Element {
  const [mode, setMode] = useState<CornerEditorMode>(initialMode);
  const [draft, setDraft] = useState<Corners | null>(corners ?? null);
  const [taps, setTaps] = useState<Point[]>([]);
  const [tapError, setTapError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [stepSize, setStepSize] = useState<'fine' | 'coarse'>('coarse');
  const [preAdjust, setPreAdjust] = useState<Corners | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const step = stepSize === 'fine' ? NUDGE_FINE : NUDGE_COARSE;

  const pointAt = (e: { clientX: number; clientY: number }): Point | null => {
    const box = surfaceRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  const addTap = (p: Point): void => {
    const next = [...taps, p];
    setTapError(null);
    if (next.length < 4) {
      setTaps(next);
      return;
    }
    const ordered = cornerOrderForTaps(next as Corners);
    if (!ordered) {
      // Keep the taps: Undo last is more use than starting over.
      setTaps(next);
      setTapError('Those corners cross over. Tap them again in order.');
      return;
    }
    setTaps([]);
    setDraft(ordered);
    setMode('review');
  };

  const onSurfaceClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    // The camera surface behind also listens for taps (to sample a colour); one press
    // must not do two things.
    e.stopPropagation();
    const p = pointAt(e);
    if (!p) return;
    if (mode === 'tap') {
      if (taps.length >= 4) setTaps([]);
      addTap(p);
      return;
    }
    if (mode === 'adjust' && draft) {
      // Tap a handle, then tap the destination — a drag alternative for everyone.
      const hit = hitTestHandle(draft, p, HANDLE_RADIUS);
      if (hit !== null) { setSelected(hit); return; }
      setDraft(nudgeCorner(draft, selected, (p.x - draft[selected].x) / 1, (p.y - draft[selected].y) / 1, 1));
    }
  };

  const nudge = (dx: number, dy: number): void => {
    if (!draft) return;
    setDraft(nudgeCorner(draft, selected, dx, dy, step));
  };

  const onHandleKeyDown = (e: React.KeyboardEvent, index: number): void => {
    if (mode !== 'adjust') return;
    const coarse = e.shiftKey ? NUDGE_COARSE : step;
    const move = (dx: number, dy: number): void => {
      e.preventDefault();
      setSelected(index);
      if (draft) setDraft(nudgeCorner(draft, index, dx, dy, coarse));
    };
    if (e.key === 'ArrowLeft') move(-1, 0);
    else if (e.key === 'ArrowRight') move(1, 0);
    else if (e.key === 'ArrowUp') move(0, -1);
    else if (e.key === 'ArrowDown') move(0, 1);
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(index); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelAdjust(); }
  };

  const cancelAdjust = (): void => {
    if (preAdjust) setDraft(preAdjust);
    setPreAdjust(null);
    setMode('review');
  };

  const shown: Corners | null = mode === 'tap'
    ? (taps.length === 4 ? (cornerOrderForTaps(taps as Corners) ?? draft) : null)
    : draft;

  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (shown) {
    const at = (u: number, v: number): Point => {
      // Bilinear is enough for a preview outline; the homography does the real work.
      const top = { x: shown[0].x + (shown[1].x - shown[0].x) * u, y: shown[0].y + (shown[1].y - shown[0].y) * u };
      const bottom = { x: shown[3].x + (shown[2].x - shown[3].x) * u, y: shown[3].y + (shown[2].y - shown[3].y) * u };
      return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
    };
    for (let c = 1; c < cols; c++) {
      const a = at(c / cols, 0); const b = at(c / cols, 1);
      gridLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    for (let r = 1; r < rows; r++) {
      const a = at(0, r / rows); const b = at(1, r / rows);
      gridLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }

  const prompt = mode === 'tap'
    ? (tapError ?? TAP_PROMPTS[Math.min(taps.length, 3)])
    : mode === 'adjust'
      ? `Adjusting corner ${selected + 1}, ${HANDLE_LABELS[selected]}`
      : 'Check the outline sits on the outside corners of the squares.';

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* The controls float OVER the picture on the player's side. They must not take
          layout width: the picture below them is the coordinate space the corners are
          stored in, and any inset would scale and shift every tap. */}
      <div
        style={{
          position: 'absolute', top: 0, bottom: 0, zIndex: 2,
          left: controlsSide === 'left' ? 0 : undefined,
          right: controlsSide === 'right' ? 0 : undefined,
          display: 'flex', flexDirection: 'column', gap: 6, padding: 8, width: 168,
          boxSizing: 'border-box',
          background: 'var(--bs-bg)', opacity: 0.94, overflowY: 'auto',
        }}
        // A press on the controls is not a press on the board.
        onClick={(e) => e.stopPropagation()}
      >
        <p role="status" style={{ margin: 0, fontSize: 12, color: tapError ? 'var(--bs-warn)' : 'var(--bs-fg2)' }}>
          {prompt}
        </p>

        {mode === 'tap' && (
          <>
            <Button tone="secondary" onClick={() => setTaps(taps.slice(0, -1))} disabled={taps.length === 0}>
              Undo last
            </Button>
            <Button
              tone="secondary"
              onClick={() => { setDraft(defaultInsetCorners()); setTaps([]); setPreAdjust(null); setMode('adjust'); }}
            >
              Place corners for me
            </Button>
            <Button tone="quiet" onClick={() => (draft ? setMode('review') : onCancel())}>Cancel</Button>
          </>
        )}

        {mode === 'review' && draft && (
          <>
            <Button tone="primary" onClick={() => onConfirm(draft)}>Looks right</Button>
            <Button tone="secondary" onClick={() => { setPreAdjust(draft); setMode('adjust'); }}>Adjust</Button>
            <Button tone="secondary" onClick={() => setDraft(rotateCorners(draft, 1))} aria-label="Turn: move the start to the next edge">
              ⟲ Turn
            </Button>
            <Button tone="secondary" onClick={() => setDraft(flipCorners(draft))} aria-label="Flip: swap start and end">
              ⇋ Flip
            </Button>
            <Button tone="quiet" onClick={() => { setTaps([]); setMode('tap'); }}>Tap corners again</Button>
            <Button tone="quiet" onClick={onCancel}>Close</Button>
          </>
        )}

        {mode === 'adjust' && draft && (
          <>
            <SegmentedControl<'fine' | 'coarse'>
              label="Nudge size"
              value={stepSize}
              onChange={setStepSize}
              options={[{ value: 'coarse', label: 'Coarse' }, { value: 'fine', label: 'Fine' }]}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              <span />
              <Button tone="secondary" aria-label="Nudge corner up" onClick={() => nudge(0, -1)}>▲</Button>
              <span />
              <Button tone="secondary" aria-label="Nudge corner left" onClick={() => nudge(-1, 0)}>◀</Button>
              <Button
                tone="secondary"
                aria-label={`Next corner (now ${selected + 1}, ${HANDLE_LABELS[selected]})`}
                onClick={() => setSelected((s) => (s + 1) % 4)}
              >
                {selected + 1}
              </Button>
              <Button tone="secondary" aria-label="Nudge corner right" onClick={() => nudge(1, 0)}>▶</Button>
              <span />
              <Button tone="secondary" aria-label="Nudge corner down" onClick={() => nudge(0, 1)}>▼</Button>
              <span />
            </div>
            <Button tone="primary" onClick={() => { setPreAdjust(null); setMode('review'); }}>Done</Button>
            <Button tone="quiet" onClick={cancelAdjust}>Cancel</Button>
          </>
        )}
      </div>

      {/* The picture itself: taps, drags and handles live here, in the SAME space as the
          saved corners — the whole surface, not what is left beside the controls. */}
      <div
        ref={surfaceRef}
        style={{ position: 'absolute', inset: 0, cursor: mode === 'review' ? 'default' : 'crosshair' }}
        onClick={onSurfaceClick}
        onPointerMove={(e) => {
          if (dragging === null || !draft) return;
          const p = pointAt(e);
          if (!p) return;
          const next: Corners = [draft[0], draft[1], draft[2], draft[3]];
          next[dragging] = { x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) };
          setDraft(next);
        }}
        onPointerUp={() => setDragging(null)}
      >
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {shown && (
            <polygon
              points={shown.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--bs-accent)"
              strokeWidth={0.004}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {gridLines.map((l, i) => (
            <line
              key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke="var(--bs-accent)" strokeOpacity={0.4} strokeWidth={0.002} vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Orientation labels, so "start" and "low" are never guesswork. */}
        {shown && (
          <>
            <span style={labelStyle(shown[0], shown[1])}>start →</span>
            <span style={labelStyle(shown[3], shown[2])}>low</span>
          </>
        )}

        {mode === 'tap' && taps.map((p, i) => (
          <span key={i} style={{ ...dotStyle(p), background: 'var(--bs-accent)', color: 'var(--bs-accent-fg)' }}>
            {i + 1}
          </span>
        ))}

        {mode !== 'tap' && draft && draft.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Corner ${i + 1}, ${HANDLE_LABELS[i]}`}
            aria-pressed={selected === i}
            disabled={mode === 'review'}
            onKeyDown={(e) => onHandleKeyDown(e, i)}
            onClick={(e) => { e.stopPropagation(); setSelected(i); }}
            onPointerDown={(e) => {
              if (mode !== 'adjust') return;
              e.currentTarget.releasePointerCapture?.(e.pointerId);
              setSelected(i);
              setDragging(i);
            }}
            style={{
              position: 'absolute',
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: 'var(--bs-target)',
              height: 'var(--bs-target)',
              minWidth: 0,
              padding: 0,
              borderRadius: '50%',
              background: selected === i ? 'var(--bs-accent)' : 'var(--bs-raised)',
              color: selected === i ? 'var(--bs-accent-fg)' : 'var(--bs-fg)',
              borderColor: 'var(--bs-accent)',
              borderWidth: 2,
              fontWeight: 700,
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

function dotStyle(p: Point): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${p.x * 100}%`,
    top: `${p.y * 100}%`,
    transform: 'translate(-50%, -50%)',
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    fontSize: 12,
    fontWeight: 700,
  };
}

/** A label placed at the midpoint of an edge. */
function labelStyle(a: Point, b: Point): React.CSSProperties {
  return {
    position: 'absolute',
    left: `${((a.x + b.x) / 2) * 100}%`,
    top: `${((a.y + b.y) / 2) * 100}%`,
    transform: 'translate(-50%, -50%)',
    padding: '2px 6px',
    borderRadius: 'var(--bs-radius-sm)',
    background: 'var(--bs-bg)',
    color: 'var(--bs-fg2)',
    fontSize: 11,
    pointerEvents: 'none',
  };
}
