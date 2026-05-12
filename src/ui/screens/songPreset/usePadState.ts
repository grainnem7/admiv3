import { useCallback, useRef, useState, type Ref } from 'react';

export interface PadState {
  x: number;
  y: number;
  held: boolean;
}

export type PadEvent =
  | { type: 'down'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'up' }
  | { type: 'reset' };

export const INITIAL_PAD_STATE: PadState = { x: 0.5, y: 0.0, held: false };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function padReducer(state: PadState, event: PadEvent): PadState {
  switch (event.type) {
    case 'down':
      return { x: clamp01(event.x), y: clamp01(event.y), held: true };
    case 'move':
      if (!state.held) return state;
      return { x: clamp01(event.x), y: clamp01(event.y), held: true };
    case 'up':
      return state;
    case 'reset':
      return INITIAL_PAD_STATE;
    default:
      return state;
  }
}

interface UsePadStateResult {
  state: PadState;
  bind: {
    ref: Ref<HTMLDivElement>;
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
  reset: () => void;
}

export function usePadState(): UsePadStateResult {
  const [state, setState] = useState<PadState>(INITIAL_PAD_STATE);
  const ref = useRef<HTMLDivElement>(null);
  const draggingPointerId = useRef<number | null>(null);

  const normalise = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const rect = el.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPointerId.current !== null) return;
    draggingPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = normalise(e);
    setState((s) => padReducer(s, { type: 'down', x, y }));
  }, [normalise]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPointerId.current !== e.pointerId) return;
    const { x, y } = normalise(e);
    setState((s) => padReducer(s, { type: 'move', x, y }));
  }, [normalise]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPointerId.current !== e.pointerId) return;
    draggingPointerId.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setState((s) => padReducer(s, { type: 'up' }));
  }, []);

  const reset = useCallback(() => {
    setState((s) => padReducer(s, { type: 'reset' }));
  }, []);

  return {
    state,
    bind: {
      ref,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    reset,
  };
}
