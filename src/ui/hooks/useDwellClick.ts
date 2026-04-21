/**
 * useDwellClick - Accessibility hook for dwell-click activation.
 *
 * Hovering over an element for a configurable duration (default 1.5s)
 * triggers an activation. For users who can gaze/hover but cannot click.
 *
 * Usage:
 *   const { onPointerEnter, onPointerLeave } = useDwellClick(onClick, { dwellTime: 1500 });
 *   <button onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onClick={onClick}>
 */

import { useRef, useCallback } from 'react';

interface DwellClickOptions {
  dwellTime?: number;
  enabled?: boolean;
}

export function useDwellClick(
  onActivate: () => void,
  options: DwellClickOptions = {}
) {
  const { dwellTime = 1500, enabled = true } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPointerEnter = useCallback(() => {
    if (!enabled) return;
    timerRef.current = setTimeout(() => {
      onActivate();
    }, dwellTime);
  }, [enabled, dwellTime, onActivate]);

  const onPointerLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { onPointerEnter, onPointerLeave };
}
